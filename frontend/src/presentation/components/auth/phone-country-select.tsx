"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";

import { getPhoneCountries } from "@/infrastructure/identity/phone-number";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from "@/presentation/components/ui/modal";
import { cn } from "@/shared/lib/utils";

interface PhoneCountrySelectProps {
  value: CountryCode;
  onChange(country: CountryCode): void;
  disabled?: boolean;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

const countries = getPhoneCountries();

function searchKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("tr");
}

export function PhoneCountrySelect({
  value,
  onChange,
  disabled,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: PhoneCountrySelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = countries.find((country) => country.code === value) ?? countries[0];
  const normalizedQuery = searchKey(query.trim()).replace(/\s+/g, "");
  const filtered = normalizedQuery
    ? countries.filter((country) => {
        const name = searchKey(country.name).replace(/\s+/g, "");
        return name.includes(normalizedQuery)
          || country.code.toLocaleLowerCase("tr").includes(normalizedQuery)
          || country.callingCode.replace("+", "").startsWith(normalizedQuery.replace("+", ""));
      })
    : countries;

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <ModalTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          className="h-11 w-full justify-between rounded-xl px-4 font-normal"
          disabled={disabled}
          aria-label={`Ülke seçin. Seçili ülke ${selected.name}, ${selected.callingCode}`}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-lg" aria-hidden="true">{selected.flag}</span>
            <span className="truncate">{selected.name}</span>
            <span className="text-muted-foreground">{selected.callingCode}</span>
          </span>
          <ChevronDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </ModalTrigger>
      <ModalContent className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col gap-3 p-4">
        <ModalHeader className="pr-8">
          <ModalTitle>Ülke seçin</ModalTitle>
          <ModalDescription>Ülke adına veya telefon koduna göre arayın.</ModalDescription>
        </ModalHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Türkiye veya +90"
            className="pl-9"
            autoFocus
            aria-label="Ülke ara"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="listbox" aria-label="Ülkeler">
          {filtered.map((country) => (
            <button
              key={country.code}
              type="button"
              role="option"
              aria-selected={country.code === value}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                country.code === value && "bg-primary/10",
              )}
              onClick={() => {
                onChange(country.code);
                setOpen(false);
              }}
            >
              <span className="text-lg" aria-hidden="true">{country.flag}</span>
              <span className="min-w-0 flex-1 truncate">{country.name}</span>
              <span className="text-sm text-muted-foreground">{country.callingCode}</span>
              <Check className={cn("size-4 text-primary", country.code !== value && "invisible")} aria-hidden="true" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Eşleşen ülke bulunamadı.</p>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
