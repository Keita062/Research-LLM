#!/usr/bin/env bash
# 研究用サーバー（Cloud Run + Firestore + Secret Manager）を GCP にデプロイする。
# Cloud Shell（https://shell.cloud.google.com）で実行するのが最も簡単（gcloud が入っている）。
#
# 使い方:
#   ADMIN_EMAILS="a@example.com,b@example.com" ./02_scripts/deploy/deploy.sh
#   （2回目以降）ADMIN_EMAILS=... GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com ./02_scripts/deploy/deploy.sh
#
# 環境変数:
#   PROJECT_ID       既定 research-llm-512715
#   REGION           既定 asia-northeast1
#   SERVICE          既定 research-llm
#   ADMIN_EMAILS     管理画面にログインできる Google アカウント（カンマ区切り・必須）
#   GOOGLE_CLIENT_ID 管理画面ログイン用 OAuth クライアントID（未作成なら空でよい）
#   GEMINI_API_KEY / GOOGLE_CLIENT_SECRET  シークレット未登録時に登録する値（未指定なら対話入力）
#   UPDATE_SECRETS=1 登録済みのシークレットにも新しい値を追加する（無料枠は 6 バージョンまでなので必要時のみ）
#
# 無料枠に収めるため、Cloud Run は最小 0・最大 1 インスタンス、イメージは最新 2 つだけ残す。
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-research-llm-512715}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-research-llm}"
REPO="research-llm"
RUN_SA="research-llm-run"
: "${ADMIN_EMAILS:?ADMIN_EMAILS を指定してください（例: ADMIN_EMAILS=\"a@example.com,b@example.com\"）}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
gc() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
step() { printf '\n=== %s ===\n' "$*"; }

step "API を有効化"
gc services enable run.googleapis.com firestore.googleapis.com secretmanager.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com

step "Firestore（ネイティブモード）"
if ! gc firestore databases describe --database="(default)" >/dev/null 2>&1; then
  gc firestore databases create --location="$REGION" --type=firestore-native
fi

step "Firestore TTL（受信から1年で自動削除）"
gc firestore fields ttls update expireAt --collection-group=events --enable-ttl --async || true
gc firestore fields ttls update expireAt --collection-group=usage --enable-ttl --async || true

step "Firestore 複合インデックス"
create_index() {
  gc firestore indexes composite create --collection-group=events --query-scope=COLLECTION "$@" --async 2>&1 \
    | grep -v -i "already exists" || true
}
create_index --field-config=field-path=participantId,order=ascending --field-config=field-path=occurredAt,order=descending
create_index --field-config=field-path=type,order=ascending --field-config=field-path=occurredAt,order=descending
create_index --field-config=field-path=participantId,order=ascending --field-config=field-path=type,order=ascending --field-config=field-path=occurredAt,order=descending
create_index --field-config=field-path=participantId,order=ascending --field-config=field-path=receivedAt,order=ascending

step "Secret Manager"
ensure_secret() { # name, env value, prompt
  local name="$1" value="$2" prompt="$3"
  if ! gc secrets describe "$name" >/dev/null 2>&1; then
    gc secrets create "$name" --replication-policy=automatic
    if [ -z "$value" ]; then
      read -r -s -p "$prompt: " value
      echo
    fi
    printf '%s' "$value" | gc secrets versions add "$name" --data-file=-
  elif [ -n "$value" ] && [ "${UPDATE_SECRETS:-}" = "1" ]; then
    printf '%s' "$value" | gc secrets versions add "$name" --data-file=-
  fi
}
ensure_secret gemini-api-key "${GEMINI_API_KEY:-}" "Gemini API キーを入力"
ensure_secret session-secret "$(gc secrets describe session-secret >/dev/null 2>&1 || openssl rand -base64 48)" ""
if [ -n "$GOOGLE_CLIENT_ID" ]; then
  ensure_secret google-oauth-client-secret "${GOOGLE_CLIENT_SECRET:-}" "OAuth クライアント シークレットを入力"
fi

step "実行用サービスアカウント"
SA_EMAIL="$RUN_SA@$PROJECT_ID.iam.gserviceaccount.com"
gc iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1 || gc iam service-accounts create "$RUN_SA" --display-name="Research LLM Cloud Run"
for role in roles/datastore.user roles/secretmanager.secretAccessor; do
  gc projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA_EMAIL" --role="$role" --condition=None >/dev/null
done

step "Cloud Build の実行権限"
# 新しいプロジェクトでは Cloud Build が Compute Engine の既定サービスアカウントで動くため、ビルドに必要なロールを付ける
PROJECT_NUMBER="$(gc projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gc projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com"   --role=roles/cloudbuild.builds.builder --condition=None >/dev/null

step "コンテナイメージをビルド（Cloud Build）"
gc artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 \
  || gc artifacts repositories create "$REPO" --repository-format=docker --location="$REGION"
POLICY_FILE="$(mktemp)"
cat >"$POLICY_FILE" <<'JSON'
[
  {"name": "keep-latest-2", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 2}},
  {"name": "delete-others", "action": {"type": "Delete"}, "condition": {"tagState": "any"}}
]
JSON
gc artifacts repositories set-cleanup-policies "$REPO" --location="$REGION" --policy="$POLICY_FILE" --no-dry-run
rm -f "$POLICY_FILE"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/server:$(date +%Y%m%d%H%M%S)"
gc builds submit "$ROOT/02_scripts/server" --tag "$IMAGE"

step "Cloud Run にデプロイ"
URL="$(gc run services describe "$SERVICE" --region="$REGION" --format='value(status.url)' 2>/dev/null || true)"
SECRETS="GEMINI_API_KEY=gemini-api-key:latest,SESSION_SECRET=session-secret:latest"
[ -n "$GOOGLE_CLIENT_ID" ] && SECRETS="$SECRETS,GOOGLE_CLIENT_SECRET=google-oauth-client-secret:latest"
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
cat >"$ENV_FILE" <<YAML
NODE_ENV: production
STORE: firestore
ADMIN_EMAILS: "$ADMIN_EMAILS"
GOOGLE_CLIENT_ID: "$GOOGLE_CLIENT_ID"
PUBLIC_URL: "$URL"
YAML
# 1分あたりの上限はインスタンス内で数えるため max-instances=1 で運用する
gc run deploy "$SERVICE" --image="$IMAGE" --region="$REGION" --service-account="$SA_EMAIL" \
  --allow-unauthenticated --max-instances=1 --min-instances=0 --memory=512Mi --timeout=600 \
  --env-vars-file="$ENV_FILE" --set-secrets="$SECRETS"

NEW_URL="$(gc run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
if [ "$NEW_URL" != "$URL" ]; then
  gc run services update "$SERVICE" --region="$REGION" --update-env-vars="PUBLIC_URL=$NEW_URL"
fi

cat <<MSG

デプロイが完了しました。
  サーバーURL:  $NEW_URL
  管理画面:     $NEW_URL/admin
  OAuth リダイレクトURI（OAuth クライアントに登録）: $NEW_URL/admin/oauth/callback

配布パッケージの作成:
  ./02_scripts/deploy/build-distribution.sh $NEW_URL
MSG
