import { AppShell } from "@/presentation/components/layout/app-shell";
import { AddMealForm } from "@/presentation/components/meals/add-meal-form";
import type { MealSlot } from "@/domain/meals/types";

const VALID_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const VALID_RETURN_TO = new Set(["/dashboard", "/meals"]);

function parseSlot(value: string | undefined): MealSlot {
  return VALID_SLOTS.includes(value as MealSlot) ? (value as MealSlot) : "breakfast";
}

function parseReturnTo(value: string | undefined): string {
  return value && VALID_RETURN_TO.has(value) ? value : "/meals";
}

export default async function AddMealPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string; returnTo?: string }>;
}) {
  const { slot, returnTo } = await searchParams;

  return (
    <AppShell title="Öğün Ekle" showBack hideBottomNav>
      <div className="animate-fade-in">
        <AddMealForm initialSlot={parseSlot(slot)} cancelHref={parseReturnTo(returnTo)} />
      </div>
    </AppShell>
  );
}
