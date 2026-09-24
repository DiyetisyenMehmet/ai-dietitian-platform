import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Diewish Management Center",
    template: "%s · Diewish Management Center",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
