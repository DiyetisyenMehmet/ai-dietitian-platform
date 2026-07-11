"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useGoal } from "@/application/goals/goals-store";
import { Loading } from "@/presentation/components/feedback/loading";
import { ErrorState } from "@/presentation/components/feedback/error-state";
import { GoalForm } from "./goal-form";

/** Client wrapper that resolves the goal from the store and renders the edit form. */
export function GoalEditView({ goalId }: { goalId: string }) {
  const router = useRouter();
  const goal = useGoal(goalId);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const t = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return <Loading label="Hedef yükleniyor..." />;
  }

  if (!goal) {
    return (
      <ErrorState
        title="Hedef bulunamadı"
        message="Düzenlemek istediğin hedef bulunamadı."
        onRetry={() => router.push("/goals")}
      />
    );
  }

  return <GoalForm mode="edit" goal={goal} />;
}
