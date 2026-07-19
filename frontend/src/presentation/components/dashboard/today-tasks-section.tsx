"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { useDailyTasks, summarizeTasks } from "@/application/health/daily-tasks";
import type { DailyTask } from "@/domain/health/types";

function TaskRow({ task }: { task: DailyTask }) {
  const Icon = healthIcon(task.icon);
  const content = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-colors",
        task.done
          ? "border-transparent bg-muted/50"
          : "border-border bg-card hover:bg-accent/40",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          task.done ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {task.done ? (
          <Check className="size-5" aria-hidden="true" />
        ) : (
          <Icon className="size-[18px]" aria-hidden="true" />
        )}
      </span>
      <span
        className={cn(
          "flex-1 text-sm font-medium",
          task.done && "text-muted-foreground line-through",
        )}
      >
        {task.label}
      </span>
    </div>
  );

  if (task.href && !task.done) {
    return (
      <li>
        <Link href={task.href} className="block focus-visible:outline-none">
          {content}
        </Link>
      </li>
    );
  }
  return <li>{content}</li>;
}

/** Dynamic "Today's Tasks" checklist derived from the user's real activity. */
export function TodayTasksSection() {
  const tasks = useDailyTasks();
  const { done, total, percent } = summarizeTasks(tasks);
  const allDone = done === total;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Bugünün Görevleri</h3>
        <span className="text-xs font-medium text-muted-foreground">
          {done}/{total} tamamlandı
        </span>
      </div>
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {allDone ? "Bugünü tamamladın, harikasın! 🎉" : "Günlük ilerlemen"}
              </span>
              <span className="font-semibold">%{percent}</span>
            </div>
            <ProgressBar value={percent} />
          </div>
          <ul className="space-y-2">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
