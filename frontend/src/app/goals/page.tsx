"use client";

import Link from "next/link";
import { Plus, Target } from "lucide-react";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { Button } from "@/presentation/components/ui/button";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { GoalCard } from "@/presentation/components/goals/goal-card";
import { useGoals } from "@/application/goals/goals-store";

export default function GoalsPage() {
  const goals = useGoals();

  return (
    <AppShell
      title="Hedefler"
      headerAction={
        <Button asChild size="icon" variant="ghost" aria-label="Hedef ekle">
          <Link href="/goals/new">
            <Plus className="size-5" aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <div className="animate-fade-in space-y-5">
        {goals.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              {goals.length} aktif hedef — istikrarla devam et.
            </p>
            <section className="space-y-3">
              {goals.map((goal, index) => (
                <GoalCard key={goal.id} goal={goal} index={index} />
              ))}
            </section>
          </>
        ) : (
          <>
            <EmptyState
              icon={Target}
              title="Henüz bir hedefin yok"
              description="İlk hedefini oluşturarak ilerlemeni takip etmeye başlayabilirsin."
              className="rounded-2xl border border-dashed border-border"
            />
            <div className="flex justify-center">
              <Button asChild>
                <Link href="/goals/new">
                  <Plus aria-hidden="true" />
                  İlk hedefini oluştur
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
