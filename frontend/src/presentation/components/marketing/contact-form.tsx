"use client";

import * as React from "react";
import { toast } from "sonner";

import { CONTACT_INFO } from "@/shared/constants/site";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { Label } from "@/presentation/components/ui/label";

/**
 * Contact form that composes a pre-filled email to the Diewish support address.
 * Keeps the flow entirely client-side (no backend endpoint required) by opening
 * the visitor's mail client with the message pre-populated.
 */
export function ContactForm() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Lütfen tüm alanları doldurun.");
      return;
    }

    const subject = encodeURIComponent(`Diewish İletişim — ${name}`);
    const body = encodeURIComponent(`Ad: ${name}\nE-posta: ${email}\n\n${message}`);
    window.location.href = `mailto:${CONTACT_INFO.email}?subject=${subject}&body=${body}`;
    toast.success("E-posta uygulaman açılıyor. Mesajını gönderebilirsin.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="contact-name">Ad Soyad</Label>
        <Input
          id="contact-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Adınız"
          autoComplete="name"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-email">E-posta</Label>
        <Input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ornek@eposta.com"
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-message">Mesajınız</Label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Sana nasıl yardımcı olabiliriz?"
          rows={5}
          required
          className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-soft transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <Button type="submit" className="w-full sm:w-auto">
        Mesaj Gönder
      </Button>
    </form>
  );
}
