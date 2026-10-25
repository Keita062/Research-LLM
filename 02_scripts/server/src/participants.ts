import type { Participant, Store } from "./store/types.js";
import { newInviteCode, sha256 } from "./util.js";

/** 参加者を招待状態で作成し、平文の招待コードを返す（招待コードはハッシュのみ保存） */
export async function inviteParticipant(store: Store, now: Date): Promise<{ participant: Participant; inviteCode: string }> {
  const inviteCode = newInviteCode();
  const participant: Participant = {
    id: await store.nextParticipantId(),
    status: "invited",
    inviteCodeHash: sha256(inviteCode),
    tokenHash: null,
    consent: null,
    deletionRequested: false,
    createdAt: now.toISOString(),
    activatedAt: null,
    lastSeenAt: null,
    lastEventAt: null,
    extensionVersion: null,
  };
  await store.createParticipant(participant);
  return { participant, inviteCode };
}

/** 招待コードを再発行する。旧トークンは失効し、再度の有効化が必要になる */
export async function reissueInvite(store: Store, id: string): Promise<string> {
  const inviteCode = newInviteCode();
  await store.updateParticipant(id, { inviteCodeHash: sha256(inviteCode), tokenHash: null });
  return inviteCode;
}
