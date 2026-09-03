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

/** Canonical public URL used for SEO metadata. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://diewish.com"
).replace(/\/$/, "");

/** Fully public marketing routes. */
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

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Product capabilities that have real backend/application support. */
export const CORE_FEATURES: readonly FeatureItem[] = [
  {
    icon: Sparkles,
    title: "Yapay Zekâ Destekli Beslenme",
    description:
      "Hedeflerini, tercihlerini ve kaydettiğin verileri dikkate alan kişiselleştirilmiş beslenme rehberliği.",
  },
  {
    icon: ClipboardList,
    title: "Kişiselleştirilmiş Beslenme Planları",
    description:
      "30 veya 60 günlük plan dönemleri; kalori ve makro hesapları deterministik, öğün içeriği yapay zekâ desteklidir.",
  },
  {
    icon: TestTube2,
    title: "Kan Tahlili Analizi",
    description:
      "Laboratuvar sonucunu yükle; sistem uygun dosyalarda sonuçları çıkarıp bilgilendirme amaçlı sade bir özet oluştursun.",
  },
  {
    icon: MessageSquareHeart,
    title: "Yapay Zekâ Beslenme Asistanı",
    description:
      "Beslenme sorularını sor; profilini ve ilgili kayıtlarını dikkate alan yapay zekâ yanıtları al.",
  },
] as const;

export const EXTENDED_FEATURES: readonly FeatureItem[] = [
  ...CORE_FEATURES,
  {
    icon: Utensils,
    title: "Öğün ve Besin Takibi",
    description: "Günlük öğünlerini ve besin kayıtlarını tek yerde takip et.",
  },
  {
    icon: Activity,
    title: "İlerleme Takibi",
    description: "Kilo, su ve aktivite kayıtlarını takip et; mevcut verilerinden oluşturulan grafikleri incele.",
  },
  {
    icon: HeartPulse,
    title: "Sağlık Güvenliği Odaklı Yaklaşım",
    description:
      "İçerikler bilgilendirme amaçlıdır; Diewish teşhis veya tedavi hizmeti sunmaz ve sağlık uzmanının yerini almaz.",
  },
  {
    icon: ShieldCheck,
    title: "Gizlilik ve Veri Kontrolü",
    description:
      "Kullanıcı verileri hesap bazlı erişim kontrolleriyle ayrılır; hesabın için silme talebi oluşturabilirsin.",
  },
] as const;

export interface HowItWorksStep {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const HOW_IT_WORKS: readonly HowItWorksStep[] = [
  {
    step: 1,
    title: "Ücretsiz hesap oluştur",
    description:
      "Kaydol, gerekli onayları verdikten sonra hedeflerini, tercihlerini ve kişiselleştirme için gerekli profil bilgilerini tamamla.",
    icon: ClipboardList,
  },
  {
    step: 2,
    title: "Profiline göre kişiselleştir",
    description:
      "Diewish, kayıtlı profilini kullanarak beslenme planı ve desteklenen analiz özelliklerini kişiselleştirir.",
    icon: Bot,
  },
  {
    step: 3,
    title: "Kayıtlarını takip et",
    description:
      "Öğün, su, kilo ve aktivite kayıtlarını güncel tut; ilerlemeni ve yapay zekâ destekli içgörüleri incele.",
    icon: HeartPulse,
  },
] as const;

export const KEY_BENEFITS: readonly string[] = [
  "Profil ve hedeflerine göre kişiselleştirilen beslenme rehberliği",
  "Yapay zekâ beslenme asistanı",
  "Kan tahlillerinden bilgilendirme amaçlı sade özetler",
  "Kilo, su, öğün ve aktivite takibi",
  "Ücretsiz planda sınırlı AI deneme hakları",
  "Hesap bazlı veri erişimi ve kullanıcı veri kontrolü",
] as const;

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Diewish nedir?",
    answer:
      "Diewish; yapay zekâ destekli beslenme planları, kan tahlili özeti, öğün ve ilerleme takibi ile yapay zekâ beslenme asistanı sunan bir yazılım platformudur.",
  },
  {
    question: "Diewish tıbbi tavsiye veriyor mu?",
    answer:
      "Hayır. Diewish'in sunduğu içerikler bilgilendirme amaçlıdır; teşhis, tedavi veya profesyonel tıbbi tavsiye yerine geçmez. Sağlık kararlarında yetkili sağlık profesyoneline danışmalısın.",
  },
  {
    question: "Ücretsiz plan neler içeriyor?",
    answer:
      "Ücretsiz hesapta temel takip özelliklerinin yanında toplam 5 yapay zekâ sohbet yanıtı, 1 kan tahlili analizi ve 1 beslenme planı oluşturma denemesi bulunur. Bu AI deneme hakları yenilenmez.",
  },
  {
    question: "Ücretli erişim nasıl çalışır?",
    answer:
      "Mevcut V1 ödeme modeli 30 günlük ücretli erişim dönemidir. Otomatik yenileme veya yıllık ödeme henüz sunulmaz; yeni bir dönem istersen yeniden ödeme başlatırsın.",
  },
  {
    question: "Kart bilgilerim Diewish'te saklanıyor mu?",
    answer:
      "Hayır. Ödeme özelliği etkinleştirildiğinde kart işlemi ödeme sağlayıcısının ödeme akışında tamamlanır; Diewish kart numaranı kendi veritabanında saklamaz.",
  },
  {
    question: "Verilerim nasıl korunuyor?",
    answer:
      "Uygulama verileri kullanıcı hesabına göre yetkilendirilir. Hesabın ve ilişkili verilerin için uygulama üzerinden silme talebi oluşturabilirsin. Sağlık verilerinin işlenmesi için gerekli rıza ve yasal metinler ayrıca sunulur.",
  },
  {
    question: "Hangi cihazlarda kullanabilirim?",
    answer:
      "Diewish mobil öncelikli duyarlı bir web uygulamasıdır; modern telefon, tablet ve masaüstü tarayıcılarda kullanılabilir.",
  },
] as const;

/** Current public support channel. Custom-domain mail replaces this after setup. */
export const CONTACT_INFO = {
  email: "diewishdestek@hotmail.com",
  supportHours: "Destek talepleri e-posta üzerinden alınır.",
  company: "Diewish",
  addressLine: "Türkiye",
} as const;

/** No social account is advertised until an official URL is configured. */
export const SOCIAL_LINKS: readonly { label: string; href: string }[] = [] as const;

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

/** A plan's public presentation. Live price/period are fetched from backend. */
export interface PublicPlan {
  tier: SubscriptionTier;
  name: string;
  tagline: string;
  /** Legacy display fields kept for internal compatibility; pricing UI does not trust them. */
  monthlyPrice: number;
  yearlyMonthlyPrice: number;
  yearlyPrice: number;
  featured: boolean;
  features: string[];
  cta: string;
}

export const PUBLIC_PLANS: readonly PublicPlan[] = [
  {
    tier: "FREE",
    name: "Free",
    tagline: "Temel takibi kullan, AI özelliklerini sınırlı olarak dene",
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    yearlyPrice: 0,
    featured: false,
    cta: "Ücretsiz Başla",
    features: [
      "Temel öğün, su, kilo ve ilerleme takibi",
      "Toplam 5 ücretsiz yapay zekâ sohbet yanıtı",
      "1 ücretsiz kan tahlili analizi",
      "1 ücretsiz beslenme planı oluşturma",
    ],
  },
  {
    tier: "PREMIUM",
    name: "Premium",
    tagline: "Daha yüksek AI kullanım kotalarıyla 30 günlük erişim",
    monthlyPrice: 149.99,
    yearlyMonthlyPrice: 0,
    yearlyPrice: 0,
    featured: true,
    cta: "30 Günlük Premium Al",
    features: [
      "Genişletilmiş yapay zekâ sohbet kotası",
      "30 ve 60 günlük beslenme planı oluşturma",
      "Genişletilmiş kan tahlili analiz kotası",
      "Kilo, öğün, su ve aktivite takibi",
    ],
  },
  {
    tier: "PREMIUM_PLUS",
    name: "Premium Plus",
    tagline: "En yüksek mevcut AI kotalarıyla 30 günlük erişim",
    monthlyPrice: 299.99,
    yearlyMonthlyPrice: 0,
    yearlyPrice: 0,
    featured: false,
    cta: "30 Günlük Premium Plus Al",
    features: [
      "Premium'dan daha yüksek yapay zekâ sohbet kotası",
      "30 ve 60 günlük beslenme planlarında daha yüksek oluşturma kotası",
      "Kan tahlili analizinde daha yüksek kullanım kotası",
      "Öncelikli destek yetkisi",
    ],
  },
] as const;
