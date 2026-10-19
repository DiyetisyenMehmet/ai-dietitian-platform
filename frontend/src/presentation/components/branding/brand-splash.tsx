import Image from "next/image";

/** Session readiness stays with RouteGuard; this component only presents it. */
export function BrandSplash() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 text-center"
      role="status"
      aria-label="Diewish yükleniyor"
      data-testid="diewish-brand-splash"
    >
      <Image
        src="/brands/diewish-id-original.jpg"
        alt=""
        width={144}
        height={144}
        priority
        unoptimized
        className="size-36 object-contain"
      />
      <Image
        src="/brands/diewish-wordmark-approved.png"
        alt="Diewish"
        width={1004}
        height={214}
        priority
        unoptimized
        className="h-auto w-44 max-w-full dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.55)]"
      />
      <p className="text-sm text-muted-foreground">Sağlığın için, her zaman yanında.</p>
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}
