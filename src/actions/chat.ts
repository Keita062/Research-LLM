"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";

/**
 * Starts a new Conversation row for the current user and redirects to it.
 * Intended to be used as a <form action={createConversationAction}> submit
 * (works with zero client JS) from the chat sidebar / empty state.
 */
export async function createConversationAction(): Promise<void> {
  const user = await requireUser();

  const conversation = await prisma.conversation.create({
    data: { userId: user.id },
    select: { id: true },
  });

  redirect(`/chat/${conversation.id}`);
}
