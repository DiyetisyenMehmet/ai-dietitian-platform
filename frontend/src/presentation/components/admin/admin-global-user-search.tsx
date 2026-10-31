"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { adminClient, type AdminUsersResult } from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import {
  Modal,
  ModalContent,
  ModalTitle,
  ModalDescription,
  ModalTrigger,
} from "@/presentation/components/ui/modal";

export function AdminGlobalUserSearch() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [state, setState] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [result, setResult] = React.useState<AdminUsersResult | null>(null);
  const request = React.useRef(0);
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  const changeOpen = (value: boolean) => {
    request.current += 1;
    setOpen(value);
    setState("idle");
    setResult(null);
    setQuery("");
  };
  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      input.current?.focus();
      return;
    }
    const id = ++request.current;
    setState("loading");
    setResult(null);
    try {
      const data = await adminClient.listUsers({
        search: query.trim(),
        status: "all",
        page: 1,
        limit: 10,
      });
      if (id !== request.current) return;
      setResult(data);
      setState("ready");
    } catch {
      if (id === request.current) setState("error");
    }
  };
  return (
    <Modal open={open} onOpenChange={changeOpen}>
      <ModalTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 rounded-xl"
          aria-label="Global kullanıcı araması"
        >
          <Search className="size-4" aria-hidden="true" />
        </Button>
      </ModalTrigger>
      <ModalContent
        className="max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
      >
        <ModalTitle>Kullanıcı bul</ModalTitle>
        <ModalDescription>
          E-posta veya tam kullanıcı UUID ile mevcut hesaplarda arayın.
        </ModalDescription>
        <form className="flex min-w-0 gap-2" onSubmit={(event) => void search(event)}>
          <label className="sr-only" htmlFor="admin-global-user-query">
            E-posta veya tam UUID
          </label>
          <Input
            ref={input}
            id="admin-global-user-query"
            type="search"
            maxLength={254}
            className="min-w-0"
            autoComplete="off"
            value={query}
            onChange={(event) => {
              request.current += 1;
              setQuery(event.target.value);
              setState("idle");
              setResult(null);
            }}
          />
          <Button type="submit" disabled={state === "loading" || !query.trim()}>
            Ara
          </Button>
        </form>
        <div className="min-w-0" aria-busy={state === "loading"}>
          {state === "idle" && (
            <p className="text-sm text-muted-foreground">
              Arama için e-posta veya tam UUID girin. Ad/soyad araması bu sürümde desteklenmiyor.
            </p>
          )}
          {state === "loading" && (
            <p role="status" className="text-sm">
              Kullanıcılar aranıyor…
            </p>
          )}
          {state === "error" && (
            <div role="alert" className="space-y-2 text-sm">
              <p>Arama tamamlanamadı veya erişim izniniz değişti.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setState("idle");
                  input.current?.focus();
                }}
              >
                Tekrar dene
              </Button>
            </div>
          )}
          {state === "ready" &&
            result &&
            (!result.users.length ? (
              <p role="status" className="text-sm">
                Eşleşen kullanıcı bulunamadı.
              </p>
            ) : (
              <>
                <p role="status" className="mb-3 text-xs text-muted-foreground">
                  {result.pagination.total} eşleşme · En fazla 10 sonuç gösterilir.
                </p>
                <ul className="space-y-2">
                  {result.users.map((user) => (
                    <li key={user.id} className="min-w-0">
                      <Link
                        href={`/admin/users/${encodeURIComponent(user.id)}`}
                        onClick={() => changeOpen(false)}
                        className="block min-w-0 rounded-xl border border-border p-3 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="block break-words text-sm font-semibold">
                          {user.fullName || "İsim belirtilmemiş"}
                        </span>
                        <span className="mt-1 block break-all text-sm text-muted-foreground">
                          {user.email}
                        </span>
                        <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                          {user.id}
                        </span>
                        <span className="mt-2 block text-xs">
                          {user.isActive ? "Aktif" : "Pasif"} · Kullanıcı detayını aç
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ))}
        </div>
      </ModalContent>
    </Modal>
  );
}
