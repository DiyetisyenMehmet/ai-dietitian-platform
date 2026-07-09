"use client";

import * as React from "react";
import { Droplets, Plus } from "lucide-react";

import { Card, CardContent } from "@/presentation/components/ui/card";
import { Button } from "@/presentation/components/ui/button";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { formatNumber, toPercent } from "@/shared/lib/format";

interface WaterSectionProps {
  current: number;
  goal: number;
  unit: string;
}

const QUICK_ADD = [250, 500] as const;

/** Water tracking card with progress and quick-add buttons (local placeholder state). */
export function WaterSection({ current, goal, unit }: WaterSectionProps) {
  const [amount, setAmount] = React.useState(current);
  const percent = toPercent(amount, goal);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10">
              <Droplets className="size-5 text-sky-500" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">Su Takibi</p>
              <p className="text-xs text-muted-foreground">
                {formatNumber(amount)} / {formatNumber(goal)} {unit}
              </p>
            </div>
          </div>
          <span className="text-2xl font-bold tabular-nums text-sky-500">%{percent}</span>
        </div>

        <ProgressBar value={percent} indicatorClassName="bg-sky-500" />

        <div className="flex gap-2">
          {QUICK_ADD.map((step) => (
            <Button
              key={step}
              variant="outline"
              className="flex-1"
              onClick={() => setAmount((prev) => Math.min(goal, prev + step))}
            >
              <Plus aria-hidden="true" />
              {step} {unit}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
