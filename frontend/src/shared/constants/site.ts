import {
  Activity,
  Bot,
  ClipboardList,
  HeartPulse,
  MessageSquareHeart,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import type { SubscriptionTier } from "@/domain/payments/types";

/**
 * Canonical public URL of the marketing site. Used for SEO metadata (canonical
 * URLs, Open Graph, sitemap). Configurable per environment; falls back to the
 * production domain so build-time SEO output is never empty.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://diewish.com"
).replace(/\/$/, "");

/**
 * Fully public marketing routes. These render server-side without an auth
 * splash or redirect (essential for SEO and the iyzico merchant review), so the
 * RouteGuard treats them as always-accessible.
 */
export const MARKETING_ROUTES: readonly string[] = [
  "/",
  "/features",
  "/pricing",
  "/faq",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/cookies",
  "/kvkk",
] as const;

/** Primary marketing navigation shown in the public site header. */
export const MARKETING_NAV: readonly { label: string; href: string }[] = [
  { label: "Ana Sayfa", href: "/" },
  { label: "Özellikler", href: "/features" },
  { label: "Fiyatlandırma", href: "/pricing" },
  { label: "S.S.S.", href: "/faq" },
  { label: "İletişim", href: "/contact" },
] as const;

/** A single hero/feature capability card. */
export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** The four core AI capabilities highlighted across the site. */
export const CORE_FEATURES: readonly FeatureItem[] = [
  {
    icon: Sparkles,
    title: "Yapay Zekâ Destekli Beslenme",
    description:
      "Hedeflerine, tercihlerine ve yaşam tarzına göre uyarlanan akıllı beslenme rehberliği ile her gün doğru adımı at.",
  },
  {
    icon: ClipboardList,
    title: "Kişiselleştirilmiş Beslenme Planları",
    description:
      "30 ve 60 günlük, sana özel hazırlanan; öğün öğün detaylandırılmış beslenme planlarıyla ilerlemeni sürdür.",
  },
  {
    icon: TestTube2,
    title: "Kan Tahlili Analizi",
    description:
      "Laboratuvar sonuçlarını yükle; yapay zekâ referans aralıklarına göre anlaşılır, sade bir özet sunsun.",
  },
  {
    icon: MessageSquareHeart,
    title: "Yapay Zekâ Diyetisyen Asistanı",
    description:
      "Beslenme sorularını 7/24 sor; kişisel bağlamını dikkate alan diyetisyen asistanından anında yanıt al.",
  },
] as const;

/** Extended feature grid used on the Features page. */
export const EXTENDED_FEATURES: readonly FeatureItem[] = [
  ...CORE_FEATURES,
  {
    icon: Utensils,
    title: "Öğün ve Besin Takibi",
    description: "Günlük öğünlerini, makro ve kalori dengeni kolayca kaydet ve takip et.",
  },
  {
    icon: Activity,
    title: "Hedef ve İlerleme Takibi",
    description: "Kilo, su ve aktivite hedeflerini belirle; ilerlemeni görsel grafiklerle izle.",
  },
  {
    icon: HeartPulse,
    title: "Sağlık Odaklı Yaklaşım",
    description: "Öneriler bilgilendirme amaçlıdır; sağlık kararların için uzmanına danışmanı önerir.",
  },
  {
    icon: ShieldCheck,
    title: "KVKK Uyumlu Gizlilik",
    description: "Verilerin şifreli saklanır; dilediğin an hesabını ve tüm verilerini silebilirsin.",
  },
] as const;

/** A single step in the "How it works" flow. */
export interface HowItWorksStep {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
}

/** The three-step onboarding narrative shown on the landing page. */
export const HOW_IT_WORKS: readonly HowItWorksStep[] = [
  {
    step: 1,
    title: "Ücretsiz hesap oluştur",
    description:
      "Birkaç dakikada kaydol ve kısa onboarding ile hedeflerini, tercihlerini ve sağlık bilgilerini paylaş.",
    icon: ClipboardList,
  },
  {
    step: 2,
    title: "Yapay zekâ seni tanısın",
    description:
      "Diewish profiline göre kişisel beslenme planları oluşturur ve kan tahlillerini analiz eder.",
    icon: Bot,
  },
  {
    step: 3,
    title: "Her gün ilerle",
    description:
      "Diyetisyen asistanınla sohbet et, öğünlerini takip et ve hedeflerine emin adımlarla ulaş.",
    icon: HeartPulse,
  },
] as const;

/** Key benefits (value proposition) bullets. */
export const KEY_BENEFITS: readonly string[] = [
  "Sana özel, tek tip olmayan beslenme rehberliği",
  "7/24 erişilebilen yapay zekâ diyetisyen asistanı",
  "Kan tahlillerinden anlaşılır sağlık içgörüleri",
  "İlerlemeni ölçülebilir kılan hedef takibi",
  "İstediğin zaman iptal — taahhüt yok",
  "KVKK uyumlu, güvenli veri işleme",
] as const;

/** Placeholder testimonials (clearly illustrative until real reviews arrive). */
export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  initials: string;
}

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      "Diewish sayesinde beslenme planıma sadık kalmak çok daha kolay. Asistan gerçekten sorularımı anlıyor.",
    name: "A. Yılmaz",
    role: "Premium kullanıcı",
    initials: "AY",
  },
  {
    quote:
      "Kan tahlili analizi bölümü, sonuçlarımı ilk kez bu kadar sade anlamamı sağladı. Çok pratik.",
    name: "M. Demir",
    role: "Premium Plus kullanıcı",
    initials: "MD",
  },
  {
    quote: "Hedeflerimi takip etmek ve motive kalmak için ihtiyacım olan her şey tek bir yerde.",
    name: "S. Kaya",
    role: "Premium kullanıcı",
    initials: "SK",
  },
] as const;

/** Frequently asked questions shown on the FAQ page and landing FAQ preview. */
export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Diewish nedir?",
    answer:
      "Diewish; yapay zekâ destekli kişisel beslenme planları, kan tahlili analizi ve diyetisyen asistanı sunan bir sağlık ve beslenme platformudur. Amacı, sağlıklı yaşam yolculuğunda sana kişiselleştirilmiş rehberlik sağlamaktır.",
  },
  {
    question: "Diewish tıbbi tavsiye veriyor mu?",
    answer:
      "Hayır. Diewish'in sunduğu içerikler yalnızca bilgilendirme amaçlıdır ve profesyonel tıbbi tavsiyenin yerine geçmez. Sağlığınla ilgili kararlar almadan önce mutlaka bir sağlık uzmanına danışmalısın.",
  },
  {
    question: "Ücretsiz plan neler içeriyor?",
    answer:
      "Ücretsiz plan; temel beslenme takibi ve sınırlı yapay zekâ kullanımı sunar. Diewish'i denemek ve temel özellikleri kullanmak için idealdir.",
  },
  {
    question: "Aboneliğimi istediğim zaman iptal edebilir miyim?",
    answer:
      "Evet. Ücretli aboneliğini dilediğin an panelinden iptal edebilirsin. İptal ettiğinde mevcut dönem sonuna kadar erişimin devam eder, sonrasında ücretsiz plana geçersin.",
  },
  {
    question: "Ödemeler güvenli mi?",
    answer:
      "Tüm ödemeler, Türkiye'nin lisanslı ödeme kuruluşu iyzico altyapısı üzerinden güvenli şekilde işlenir. Kart bilgilerin Diewish sunucularında saklanmaz.",
  },
  {
    question: "Verilerim nasıl korunuyor?",
    answer:
      "Verilerin 6698 sayılı KVKK kapsamında işlenir ve güvenli şekilde saklanır. Dilediğin an hesabını ve ilişkili tüm verilerini uygulama üzerinden kalıcı olarak silebilirsin.",
  },
  {
    question: "Hangi cihazlarda kullanabilirim?",
    answer:
      "Diewish mobil öncelikli, tamamen duyarlı bir web uygulamasıdır. Telefon, tablet ve masaüstü tarayıcılardan sorunsuz kullanabilirsin.",
  },
] as const;

/** Company / contact information surfaced on public pages. */
export const CONTACT_INFO = {
  email: "destek@diewish.com",
  supportHours: "Hafta içi 09:00 – 18:00 (GMT+3)",
  company: "Diewish",
  addressLine: "İstanbul, Türkiye",
} as const;

/** Social media placeholders (kept as safe non-navigating placeholders). */
export const SOCIAL_LINKS: readonly { label: string; href: string }[] = [
  { label: "Instagram", href: "#" },
  { label: "X (Twitter)", href: "#" },
  { label: "LinkedIn", href: "#" },
] as const;

/** Footer link groups. */
export const FOOTER_LINKS: readonly {
  heading: string;
  links: { label: string; href: string }[];
}[] = [
  {
    heading: "Ürün",
    links: [
      { label: "Özellikler", href: "/features" },
      { label: "Fiyatlandırma", href: "/pricing" },
      { label: "S.S.S.", href: "/faq" },
    ],
  },
  {
    heading: "Kurumsal",
    links: [
      { label: "Hakkımızda", href: "/about" },
      { label: "İletişim", href: "/contact" },
    ],
  },
  {
    heading: "Yasal",
    links: [
      { label: "Gizlilik Politikası", href: "/privacy" },
      { label: "Kullanım Koşulları", href: "/terms" },
      { label: "Çerez Politikası", href: "/cookies" },
      { label: "KVKK / GDPR", href: "/kvkk" },
    ],
  },
] as const;

/** A purchasable plan as presented on the public pricing page. */
export interface PublicPlan {
  tier: SubscriptionTier;
  name: string;
  tagline: string;
  /** Monthly price in TRY (major units). */
  monthlyPrice: number;
  /** Effective monthly price when billed yearly (TRY, major units). */
  yearlyMonthlyPrice: number;
  /** Total yearly price in TRY (major units). */
  yearlyPrice: number;
  featured: boolean;
  features: string[];
  cta: string;
}

/**
 * Public pricing catalog (major TRY units for display). Monthly prices mirror
 * the backend PLAN_CATALOG (kuruş → TRY): Premium 149,99₺, Premium Plus 299,99₺.
 * Yearly pricing offers ~2 months free (10× monthly).
 */
export const PUBLIC_PLANS: readonly PublicPlan[] = [
  {
    tier: "FREE",
    name: "Free",
    tagline: "Diewish'i keşfetmeye başla",
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    yearlyPrice: 0,
    featured: false,
    cta: "Ücretsiz Başla",
    features: [
      "Temel öğün ve besin takibi",
      "Sınırlı yapay zekâ diyetisyen sohbeti",
      "Hedef ve ilerleme takibi",
      "Topluluk desteği",
    ],
  },
  {
    tier: "PREMIUM",
    name: "Premium",
    tagline: "Kişisel yolculuğun için tam donanım",
    monthlyPrice: 149.99,
    yearlyMonthlyPrice: 124.99,
    yearlyPrice: 1499.9,
    featured: true,
    cta: "Premium'a Geç",
    features: [
      "Genişletilmiş yapay zekâ diyetisyen sohbeti",
      "Kişiselleştirilmiş 30 & 60 günlük beslenme planları",
      "Kan tahlili analizi",
      "Detaylı ilerleme içgörüleri",
      "E-posta desteği",
    ],
  },
  {
    tier: "PREMIUM_PLUS",
    name: "Premium Plus",
    tagline: "En üst seviye kişiselleştirme ve öncelik",
    monthlyPrice: 299.99,
    yearlyMonthlyPrice: 249.99,
    yearlyPrice: 2999.9,
    featured: false,
    cta: "Premium Plus'a Geç",
    features: [
      "En yüksek yapay zekâ kotaları",
      "Öncelikli yapay zekâ yanıtları",
      "Sınırsız beslenme planı oluşturma",
      "Gelişmiş kan tahlili analizi",
      "Öncelikli destek",
    ],
  },
] as const;
