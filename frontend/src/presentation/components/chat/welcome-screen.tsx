"use client";

import * as React from "react";

import { Card } from "@/presentation/components/ui/card";
import { SUGGESTIONS } from "@/application/chat/placeholder-responses";
import { AiAvatar } from "./ai-avatar";

interface WelcomeScreenProps {
  userName: string;
  onSelect: (prompt: string) => void;
}

/** Empty-chat welcome state: greeting + tappable suggestion cards. */
export function WelcomeScreen({ userName, onSelect }: WelcomeScreenProps) {
  return (
    <div className="flex animate-fade-in flex-col items-center px-2 py-8 text-center">
      <AiAvatar className="size-14 [&_svg]:size-7" />
      <h2 className="mt-4 text-2xl font-bold tracking-tight">
        Merhaba {userName} <span aria-hidden="true">👋</span>
      </h2>
      <p className="mt-1 max-w-sm text-muted-foreground">
        Tekrar hoş geldin. Bugün neyi geliştirmek istersin?
      </p>

      <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item.prompt)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(item.prompt);
                }
              }}
              className="flex cursor-pointer items-center gap-3 p-4 text-left transition-all hover:border-primary/40 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent">
                <Icon className="size-4 text-accent-foreground" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium">{item.label}</span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
