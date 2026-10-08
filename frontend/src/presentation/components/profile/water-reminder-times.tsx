"use client";

import * as React from "react";
import { Clock3, Plus, Trash2 } from "lucide-react";
import { MAX_WATER_TIMES_PER_DAY, isReminderTime } from "@/domain/account/water-reminder-plan";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";

function suggestedTime(times: string[]) {
  return (
    ["08:00", "09:00", "11:00", "14:00", "16:00", "18:00", "20:00", "21:00"].find(
      (time) => !times.includes(time),
    ) ?? "09:00"
  );
}

export function WaterReminderTimes({
  times,
  onChange,
  disabled = false,
  label,
}: {
  times: string[];
  onChange: (times: string[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const newTimeId = React.useId();
  const [newTime, setNewTime] = React.useState(() => suggestedTime(times));
  const [error, setError] = React.useState<string | null>(null);
  const full = times.length >= MAX_WATER_TIMES_PER_DAY;
  const update = (next: string[]) => {
    setError(null);
    onChange([...next].sort());
  };
  return (
    <div className="space-y-3" data-water-times>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Saatler</p>
        <span className="text-xs text-muted-foreground">
          {times.length} / {MAX_WATER_TIMES_PER_DAY}
        </span>
      </div>
      {!times.length && (
        <p className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          Henüz saat eklenmedi. Bu program için hatırlatma gönderilmez.
        </p>
      )}
      <div className="space-y-2">
        {times.map((time, index) => (
          <div
            key={index}
            className="flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-1"
          >
            <Clock3 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              type="time"
              aria-label={`${label} ${index + 1}. saat`}
              className="h-11 min-w-0 flex-1 border-0 bg-transparent shadow-none"
              value={time}
              disabled={disabled}
              onChange={(event) => {
                const value = event.target.value;
                if (!isReminderTime(value)) {
                  setError("Geçerli bir saat seç. Silmek için çöp kutusunu kullanabilirsin.");
                  return;
                }
                if (times.some((entry, at) => at !== index && entry === value)) {
                  setError("Bu saat zaten ekli. Farklı bir saat seç.");
                  return;
                }
                update(times.map((entry, at) => (at === index ? value : entry)));
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`${time} saatini sil`}
              disabled={disabled}
              onClick={() => update(times.filter((_, at) => at !== index))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      {!full && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor={newTimeId} className="text-xs text-muted-foreground">
              Yeni saat
            </label>
            <Input
              id={newTimeId}
              aria-label={`${label} yeni saat`}
              type="time"
              className="h-11"
              value={newTime}
              disabled={disabled}
              onChange={(event) => {
                setError(null);
                setNewTime(event.target.value);
              }}
            />
          </div>
          <Button
            type="button"
            disabled={disabled || !isReminderTime(newTime)}
            onClick={() => {
              if (times.includes(newTime)) {
                setError("Bu saat zaten ekli. Farklı bir saat seç.");
                return;
              }
              if (times.length >= MAX_WATER_TIMES_PER_DAY) return;
              const next = [...times, newTime].sort();
              update(next);
              setNewTime(suggestedTime(next));
            }}
          >
            <Plus aria-hidden="true" />
            Saat ekle
          </Button>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {full
          ? `Bu gün için en fazla ${MAX_WATER_TIMES_PER_DAY} hatırlatma ekleyebilirsin.`
          : `Gün başına en fazla ${MAX_WATER_TIMES_PER_DAY} hatırlatma.`}
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
