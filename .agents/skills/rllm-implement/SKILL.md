---
name: rllm-implement
description: v2 実装計画の GitHub Issue を1件実装し、テスト・検証済みの PR を作る。引数に Issue 番号を渡す。手順の正本は devin/playbooks/03_feature-implementation.md
argument-hint: "<Issue番号 例: #12>"
triggers: ["user"]
---

このスキルの手順の正本は `devin/playbooks/03_feature-implementation.md` である。

1. まず `devin/playbooks/03_feature-implementation.md` を最後まで読む。
2. 引数で渡された Issue を対象に、そのファイルの Procedure に上から順に従う。Specifications を完了条件、Forbidden Actions を禁止事項として扱う。
3. Issue 番号が渡されていない場合は、実装を始める前にユーザーに確認する。
4. このファイルと Playbook の内容が食い違う場合は Playbook を優先する。
