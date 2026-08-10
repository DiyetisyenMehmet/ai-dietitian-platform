import Link from "next/link";
import { Leaf, Mail, MapPin } from "lucide-react";

import { APP_CONFIG } from "@/shared/constants/app";
import { CONTACT_INFO, FOOTER_LINKS, SOCIAL_LINKS } from "@/shared/constants/site";

/**
 * Public site footer: product/company/legal link groups, contact details,
 * social placeholders and copyright. Rendered on every marketing page.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container py-12">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
                <Leaf className="size-5 text-primary" aria-hidden="true" />
              </span>
              <span className="text-lg">{APP_CONFIG.name}</span>
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              Yapay zekâ destekli kişisel beslenme planları, kan tahlili analizi ve diyetisyen
              asistanı ile sağlıklı yaşam yolculuğunda yanında.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <a
                href={`mailto:${CONTACT_INFO.email}`}
                className="flex items-center gap-2 transition-colors hover:text-foreground"
              >
                <Mail className="size-4" aria-hidden="true" />
                {CONTACT_INFO.email}
              </a>
              <p className="flex items-center gap-2">
                <MapPin className="size-4" aria-hidden="true" />
                {CONTACT_INFO.addressLine}
              </p>
            </div>
          </div>

          {FOOTER_LINKS.map((group) => (
            <div key={group.heading} className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">{group.heading}</h3>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {year} {APP_CONFIG.name}. Tüm hakları saklıdır.
          </p>
          <ul className="flex items-center gap-4">
            {SOCIAL_LINKS.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={social.label}
                >
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
