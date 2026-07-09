import { AppShell } from "@/presentation/components/layout/app-shell";
import { AddMealForm } from "@/presentation/components/meals/add-meal-form";
import type { MealSlot } from "@/domain/meals/types";

const VALID_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

function parseSlot(value: string | undefined): MealSlot {
  return VALID_SLOTS.includes(value as MealSlot) ? (value as MealSlot) : "breakfast";
}

export default async function AddMealPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  const { slot } = await searchParams;

  return (
    <AppShell title="Öğün Ekle" showBack hideBottomNav>
      <div className="animate-fade-in">
        <AddMealForm initialSlot={parseSlot(slot)} />
      </div>
    </AppShell>
  );
}
