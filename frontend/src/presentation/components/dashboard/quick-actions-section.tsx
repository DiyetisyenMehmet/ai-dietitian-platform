import { Plus, ScanLine, Sparkles, Droplets, type LucideIcon } from "lucide-react";

interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  className: string;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: "add-meal",
    label: "Öğün Ekle",
    icon: Plus,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "scan-food",
    label: "Besin Tara",
    icon: ScanLine,
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    id: "chat-ai",
    label: "Asistanla Sohbet",
    icon: Sparkles,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    id: "add-water",
    label: "Su Ekle",
    icon: Droplets,
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
] as const;

/** Rounded quick-action buttons. Navigation wired in later sprints. */
export function QuickActionsSection() {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Hızlı İşlemler</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              <span
                className={`flex size-11 items-center justify-center rounded-xl ${action.className}`}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
