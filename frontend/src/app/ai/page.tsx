import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { ChatView } from "@/presentation/components/chat/chat-view";

export const metadata: Metadata = {
  title: "Beslenme Koçun",
};

export default function AiChatPage() {
  return (
    <AppShell title="Beslenme Koçun" fill hideHeader>
      <ChatView />
    </AppShell>
  );
}
