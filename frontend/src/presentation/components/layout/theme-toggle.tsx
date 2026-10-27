"use client";

import * as React from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";

import { Button } from "@/presentation/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
  ModalTrigger,
} from "@/presentation/components/ui/modal";

const choices = [
  {
    value: "system",
    label: "Sistemle aynı (otomatik)",
    description: "Telefonunuzun veya tarayıcınızın görünümünü izler.",
    icon: Monitor,
  },
  {
    value: "light",
    label: "Açık",
    description: "Sistem temasından bağımsız, her zaman açık.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Koyu",
    description: "Sistem temasından bağımsız, her zaman koyu.",
    icon: Moon,
  },
] as const;

/** Existing preference key and defaults stay with next-themes. */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  // Management Center retains its existing control and behavior.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={isDark ? "Açık temaya geç" : "Koyu temaya geç"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {mounted && isDark ? (
          <Sun className="size-5" aria-hidden="true" />
        ) : (
          <Moon className="size-5" aria-hidden="true" />
        )}
      </Button>
    );
  }
  const selected = choices.find((choice) => mounted && choice.value === theme) ?? choices[0];
  const Icon = selected.icon;
  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Görünüm: ${selected.label}`}
          title={`Görünüm: ${selected.label}`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </Button>
      </ModalTrigger>
      <ModalContent variant="centered">
        <ModalTitle>Görünüm</ModalTitle>
        <ModalDescription>
          Sistemle aynı görünümü kullanın veya kendi tercihinizi seçin.
        </ModalDescription>
        <fieldset className="grid gap-2">
          <legend className="sr-only">Tema tercihi</legend>
          {choices.map(({ value, label, description, icon: ChoiceIcon }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="diewish-theme"
                value={value}
                checked={selected.value === value}
                className="size-4 accent-primary"
                onChange={() => {
                  setTheme(value);
                  setOpen(false);
                }}
              />
              <ChoiceIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{description}</span>
              </span>
              {selected.value === value && (
                <Check className="size-4 text-primary" aria-hidden="true" />
              )}
            </label>
          ))}
        </fieldset>
      </ModalContent>
    </Modal>
  );
}
