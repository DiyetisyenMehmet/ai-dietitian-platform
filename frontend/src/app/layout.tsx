import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { APP_CONFIG } from "@/shared/constants/app";
import { SITE_URL } from "@/shared/constants/site";
import { AppProviders } from "@/presentation/providers/app-providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${APP_CONFIG.name} — Yapay Zekâ Destekli Kişisel Beslenme Platformu`,
    template: `%s · ${APP_CONFIG.name}`,
  },
  description: APP_CONFIG.description,
  applicationName: APP_CONFIG.name,
  keywords: [
    "yapay zekâ beslenme",
    "diyetisyen asistanı",
    "kişiselleştirilmiş beslenme planı",
    "kan tahlili analizi",
    "sağlıklı yaşam",
    "diyet uygulaması",
    "Diewish",
  ],
  authors: [{ name: APP_CONFIG.name }],
  creator: APP_CONFIG.name,
  publisher: APP_CONFIG.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: SITE_URL,
    siteName: APP_CONFIG.name,
    title: `${APP_CONFIG.name} — Yapay Zekâ Destekli Kişisel Beslenme Platformu`,
    description: APP_CONFIG.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_CONFIG.name} — Yapay Zekâ Destekli Kişisel Beslenme Platformu`,
    description: APP_CONFIG.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a17" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
