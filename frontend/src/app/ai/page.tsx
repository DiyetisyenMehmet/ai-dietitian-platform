import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { ChatView } from "@/presentation/components/chat/chat-view";

export const metadata: Metadata = {
  title: "Beslenme Koçun",
};

export default async function AiChatPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawPrompt = Array.isArray(params.prompt) ? params.prompt[0] : params.prompt;
  const initialPrompt = rawPrompt?.trim().slice(0, 1000) || null;

  return (
    <AppShell title="Beslenme Koçun" fill hideHeader>
      <ChatView initialPrompt={initialPrompt} />
    </AppShell>
  );
}
