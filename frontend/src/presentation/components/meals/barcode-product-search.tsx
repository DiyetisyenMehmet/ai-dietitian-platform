"use client";

import * as React from "react";
import { Package, Search, X } from "lucide-react";

import { nutritionClient, type CanonicalFoodDto } from "@/infrastructure/nutrition/nutrition-client";
import { Button } from "@/presentation/components/ui/button";

function productLabel(food: CanonicalFoodDto): string {
  const name = food.displayNameTr || food.name;
  const brand = food.brand?.trim();
  return brand && !name.toLocaleLowerCase("tr-TR").includes(brand.toLocaleLowerCase("tr-TR"))
    ? `${brand} ${name}`
    : name;
}

function detailLabel(food: CanonicalFoodDto): string {
  return [food.quantity?.trim(), food.barcode].filter(Boolean).join(" · ");
}

export function BarcodeProductSearch({
  onSelect,
}: {
  onSelect(food: CanonicalFoodDto): void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CanonicalFoodDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }

    const requestId = ++requestRef.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setFailed(false);
      void nutritionClient
        .catalogSearch(query.trim(), 24)
        .then(({ foods }) => {
          if (requestRef.current !== requestId) return;
          setResults(foods);
        })
        .catch(() => {
          if (requestRef.current !== requestId) return;
          setResults([]);
          setFailed(true);
        })
        .finally(() => {
          if (requestRef.current === requestId) setLoading(false);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [open, query]);

  const first = results[0] ?? null;

  const choose = React.useCallback(
    (food: CanonicalFoodDto) => {
      if (!food.barcode) return;
      onSelect(food);
      setQuery("");
      setResults([]);
      setOpen(false);
    },
    [onSelect],
  );

  return (
    <div className="relative">
      {!open ? (
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-xl px-2.5 text-xs"
          onClick={() => setOpen(true)}
          aria-label="Ürün adına göre ara"
        >
          <Search className="size-4" aria-hidden="true" />
          Ürün ara
        </Button>
      ) : (
        <div className="rounded-2xl border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value.slice(0, 120))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && first) {
                    event.preventDefault();
                    choose(first);
                  }
                  if (event.key === "Escape") setOpen(false);
                }}
                placeholder="Tomurcuk, Çaykur Tomurcuk, çay..."
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={results.length > 0}
                aria-controls="barcode-product-search-results"
                className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-10 shrink-0 p-0"
              onClick={() => {
                setOpen(false);
                setQuery("");
                setResults([]);
              }}
              aria-label="Ürün aramayı kapat"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {query.trim().length >= 2 && first && !loading && (
            <p className="mt-2 truncate px-1 text-xs text-muted-foreground">
              Öneri: <span className="font-medium">{productLabel(first)}</span>
              {first.quantity ? <span className="opacity-70"> · {first.quantity}</span> : null}
            </p>
          )}

          {loading && (
            <p className="px-1 pt-3 text-xs text-muted-foreground">Diewish ürün kataloğunda aranıyor…</p>
          )}

          {!loading && failed && (
            <p className="px-1 pt-3 text-xs text-muted-foreground">
              Ürün kataloğu şu anda aranamadı. Barkod taramasını kullanmaya devam edebilirsin.
            </p>
          )}

          {!loading && !failed && query.trim().length >= 2 && results.length === 0 && (
            <p className="px-1 pt-3 text-xs text-muted-foreground">
              Diewish ürün kataloğunda eşleşme bulunamadı.
            </p>
          )}

          {results.length > 0 && (
            <div
              id="barcode-product-search-results"
              role="listbox"
              className="mt-3 max-h-72 space-y-1 overflow-y-auto overscroll-contain rounded-xl border bg-background p-1"
            >
              {results.map((food) => (
                <button
                  key={`${food.provider}:${food.externalId}`}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => choose(food)}
                  className="flex min-h-16 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  {food.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={food.imageUrl}
                      alt=""
                      className="size-11 shrink-0 rounded-lg border bg-primary/5 object-contain p-1"
                    />
                  ) : (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-primary/5 text-primary">
                      <Package className="size-5" aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-foreground">
                      {productLabel(food)}
                    </span>
                    {detailLabel(food) && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {detailLabel(food)}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
            Yazarken yalnız Diewish'in kayıtlı ürün kataloğu aranır; dış kaynaklara her tuşta sorgu gönderilmez.
          </p>
        </div>
      )}
    </div>
  );
}
