import type { Metadata } from "next";

import { ChatView } from "@/presentation/components/chat/chat-view";

export const metadata: Metadata = {
  title: "AI Diyetisyen",
};

export default function AiChatPage() {
  return <ChatView />;
}
