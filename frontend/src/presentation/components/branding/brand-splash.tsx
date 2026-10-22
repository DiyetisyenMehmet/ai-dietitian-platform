import { BrandLockup } from "./brand-lockup";

/** Session readiness stays with RouteGuard; no second, moving splash lockup. */
export function BrandSplash() {
  return (
    <div
      className="flex min-h-dvh flex-col bg-background"
      role="status"
      aria-label="Diewish yükleniyor"
      data-testid="diewish-brand-splash"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <BrandLockup variant="auth" />
        <span className="size-9 shrink-0" aria-hidden="true" />
      </div>
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}
