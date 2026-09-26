"use client";

import * as React from "react";
import { Search, ScrollText } from "lucide-react";
import { toast } from "sonner";

import {
  adminClient,
  type AdminAuditFilters,
  type AdminAuditRecord,
} from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";
import { Input } from "@/presentation/components/ui/input";

function snapshotText(value: Record<string, unknown> | null) {
  if (!value || Object.keys(value).length === 0) return "Kayıt yok";
  return Object.entries(value)
    .map(([key, item]) => {
      const rendered = Array.isArray(item)
        ? item.join(", ")
        : typeof item === "boolean"
          ? item
            ? "Evet"
            : "Hayır"
          : String(item ?? "Kayıt yok");
      return `${key}: ${rendered}`;
    })
    .join(" · ");
}

export function AdminAuditViewer() {
  const [events, setEvents] = React.useState<AdminAuditRecord[]>([]);
  const [filters, setFilters] = React.useState({
    admin: "",
    user: "",
    action: "",
    module: "",
    risk: "",
    environment: "",
    dateFrom: "",
    dateTo: "",
  });
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async (nextFilters: typeof filters = filters) => {
    setBusy(true);
    try {
      const query: AdminAuditFilters = {
        ...(nextFilters.admin.trim() ? { admin: nextFilters.admin.trim() } : {}),
        ...(nextFilters.user.trim() ? { user: nextFilters.user.trim() } : {}),
        ...(nextFilters.action.trim() ? { action: nextFilters.action.trim() } : {}),
        ...(nextFilters.module.trim() ? { module: nextFilters.module.trim() } : {}),
        ...(nextFilters.risk ? { risk: nextFilters.risk } : {}),
        ...(nextFilters.environment ? { environment: nextFilters.environment } : {}),
        ...(nextFilters.dateFrom
          ? { dateFrom: new Date(nextFilters.dateFrom).toISOString() }
          : {}),
        ...(nextFilters.dateTo
          ? { dateTo: new Date(nextFilters.dateTo).toISOString() }
          : {}),
        limit: 200,
      };
      const result = await adminClient.getAudit(query);
      setEvents(result.events);
    } catch {
      toast.error("İşlem geçmişi yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }, [filters]);

  React.useEffect(() => {
    void load();
  }, []);

  const clear = () => {
    const empty = {
      admin: "",
      user: "",
      action: "",
      module: "",
      risk: "",
      environment: "",
      dateFrom: "",
      dateTo: "",
    };
    setFilters(empty);
    void load(empty);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Audit</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">İşlem geçmişi</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Yönetim merkezinde yapılan kritik değişiklikleri ve erişim işlemlerini filtreleyerek inceleyin.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-5" aria-hidden="true" />
            Filtreler
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              aria-label="Yönetici filtresi"
              placeholder="Yönetici"
              value={filters.admin}
              onChange={(event) => setFilters((current) => ({ ...current, admin: event.target.value }))}
            />
            <Input
              aria-label="Kullanıcı filtresi"
              placeholder="Kullanıcı"
              value={filters.user}
              onChange={(event) => setFilters((current) => ({ ...current, user: event.target.value }))}
            />
            <Input
              aria-label="İşlem filtresi"
              placeholder="İşlem"
              value={filters.action}
              onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
            />
            <Input
              aria-label="Modül filtresi"
              placeholder="Modül"
              value={filters.module}
              onChange={(event) => setFilters((current) => ({ ...current, module: event.target.value }))}
            />
            <select
              aria-label="Risk filtresi"
              className="h-11 rounded-xl border border-input bg-background px-4 text-sm"
              value={filters.risk}
              onChange={(event) => setFilters((current) => ({ ...current, risk: event.target.value }))}
            >
              <option value="">Tüm riskler</option>
              <option value="LOW">Düşük</option>
              <option value="MEDIUM">Orta</option>
              <option value="HIGH">Yüksek</option>
              <option value="CRITICAL">Kritik</option>
            </select>
            <select
              aria-label="Ortam filtresi"
              className="h-11 rounded-xl border border-input bg-background px-4 text-sm"
              value={filters.environment}
              onChange={(event) => setFilters((current) => ({ ...current, environment: event.target.value }))}
            >
              <option value="">Tüm ortamlar</option>
              <option value="development">Development</option>
              <option value="test">Test</option>
              <option value="staging">Staging</option>
            </select>
            <Input
              aria-label="Başlangıç tarihi"
              type="datetime-local"
              value={filters.dateFrom}
              onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            />
            <Input
              aria-label="Bitiş tarihi"
              type="datetime-local"
              value={filters.dateTo}
              onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" isLoading={busy} onClick={() => void load()}>
              Filtrele
            </Button>
            <Button type="button" variant="outline" onClick={clear}>
              Temizle
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-5" aria-hidden="true" />
            Kayıtlar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Seçilen filtrelere uygun kayıt bulunamadı.</p>
          ) : (
            events.map((event) => (
              <article key={event.id} className="rounded-2xl border p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{event.action}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.actorName || event.actorEmail || event.actorAdminId}
                      {" · "}
                      {event.targetEmail || event.targetId}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{event.riskLevel}</p>
                    <time>{new Date(event.createdAt).toLocaleString("tr-TR")}</time>
                  </div>
                </div>

                {event.reason ? (
                  <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                    Neden: {event.reason}
                  </p>
                ) : null}

                <div className="mt-3 grid gap-2 text-xs lg:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <p className="font-medium">Önce</p>
                    <p className="mt-1 break-words text-muted-foreground">
                      {snapshotText(event.beforeState)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="font-medium">Sonra</p>
                    <p className="mt-1 break-words text-muted-foreground">
                      {snapshotText(event.afterState)}
                    </p>
                  </div>
                </div>

                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Kayıt ayrıntıları</summary>
                  <div className="mt-2 space-y-1 break-all">
                    <p>Modül: {event.module}</p>
                    <p>Ortam: {event.environment}</p>
                    <p>Correlation: {event.correlationId}</p>
                    <p>Request: {event.requestId}</p>
                  </div>
                </details>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
