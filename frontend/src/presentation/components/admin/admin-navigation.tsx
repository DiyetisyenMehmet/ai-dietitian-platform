"use client";

import Link from "next/link";
import { LayoutDashboard, ScrollText, UsersRound } from "lucide-react";

const navigation = [
  { group: "Genel", label: "Genel Bakış", href: "/admin", view: "overview", icon: LayoutDashboard, permissions: [] },
  { group: "Güvenlik", label: "Yetkililer & Roller", href: "/admin/access", view: "access", icon: UsersRound, permissions: ["admin.staff.read", "admin.roles.read"] },
  { group: "Güvenlik", label: "İşlem Geçmişi", href: "/admin/audit", view: "audit", icon: ScrollText, permissions: ["audit.read"] },
] as const;

export function AdminNavigation({
  permissions,
  view,
  onNavigate,
}: {
  permissions: string[];
  view: "overview" | "access" | "audit";
  onNavigate?: () => void;
}) {
  const visible = navigation.filter((item) =>
    item.permissions.every((key) => permissions.includes(key)),
  );
  return (
    <nav aria-label="Yönetim merkezi" className="space-y-5">
      {["Genel", "Güvenlik"].map((group) => {
        const items = visible.filter((item) => item.group === group);
        if (!items.length) return null;
        return (
          <div key={group}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {group}
            </p>
            <ul className="space-y-1">
              {items.map(({ href, label, view: itemView, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={view === itemView ? "page" : undefined}
                    className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${view === itemView ? "bg-primary/10 font-semibold text-primary shadow-sm ring-1 ring-primary/10" : "text-foreground/70 hover:bg-secondary hover:text-foreground"}`}
                  >
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors ${view === itemView ? "bg-primary/15" : "bg-secondary group-hover:bg-card"}`}>
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 truncate">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
