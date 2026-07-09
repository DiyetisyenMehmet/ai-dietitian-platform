import {
  CalendarDays,
  ChartLine,
  Apple,
  TrendingDown,
  Beef,
  Calculator,
  type LucideIcon,
} from "lucide-react";

import type { SuggestionCard } from "@/domain/chat/types";

/**
 * Suggestion cards shown on the welcome screen. Each maps to a canned,
 * markdown-rich placeholder answer via `intentKey`.
 */
export const SUGGESTIONS: ReadonlyArray<SuggestionCard & { intentKey: string }> = [
  {
    id: "s1",
    label: "Bugünün öğün planını oluştur",
    prompt: "Bugün için bir öğün planı oluşturur musun?",
    icon: CalendarDays,
    intentKey: "meal-plan",
  },
  {
    id: "s2",
    label: "Öğünlerimi analiz et",
    prompt: "Bugünkü öğünlerimi analiz eder misin?",
    icon: ChartLine,
    intentKey: "analyze",
  },
  {
    id: "s3",
    label: "Sağlıklı atıştırmalık fikirleri",
    prompt: "Sağlıklı atıştırmalık önerileri verir misin?",
    icon: Apple,
    intentKey: "snacks",
  },
  {
    id: "s4",
    label: "Kilo verme ipuçları",
    prompt: "Kilo vermek için ipuçları verir misin?",
    icon: TrendingDown,
    intentKey: "weight-loss",
  },
  {
    id: "s5",
    label: "Yüksek proteinli besinler",
    prompt: "Yüksek proteinli besinler nelerdir?",
    icon: Beef,
    intentKey: "protein",
  },
  {
    id: "s6",
    label: "Kalori hesapla",
    prompt: "Günlük kalori ihtiyacımı nasıl hesaplarım?",
    icon: Calculator,
    intentKey: "calories",
  },
];

/** Icon lookup for suggestion metadata (used outside the card list too). */
export const SUGGESTION_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  SUGGESTIONS.map((s) => [s.intentKey, s.icon]),
);

const RESPONSES: Record<string, string> = {
  "meal-plan": `İşte dengeli bir **günlük öğün planı** (yaklaşık 2000 kcal):

| Öğün | Menü | Kalori |
| --- | --- | --- |
| Kahvaltı | Yulaf ezmesi, yaban mersini, badem | ~350 kcal |
| Öğle | Izgara tavuk, bulgur pilavı, salata | ~550 kcal |
| Ara öğün | Yoğurt + 1 meyve | ~200 kcal |
| Akşam | Fırında somon, buharda sebze | ~500 kcal |
| Ara öğün | 1 avuç ceviz | ~180 kcal |

**Makro dağılımı:**
- Protein: ~120 g
- Karbonhidrat: ~200 g
- Yağ: ~65 g

> **İpucu:** Öğün planını gün içindeki aktivite seviyene göre ölçekle. Antrenman günlerinde karbonhidratı biraz artırabilirsin.`,

  analyze: `Bugünkü öğünlerini incelediğimde şu **öne çıkan noktaları** görüyorum:

1. **Protein** hedefinin biraz altındasın (68 / 120 g).
2. **Su** tüketimin iyi gidiyor, gün sonuna kadar 2.5 L'yi tamamlayabilirsin.
3. Akşam öğünü henüz eklenmemiş.

**Öneriler:**
- Akşam öğününe yumurta, yoğurt veya baklagil ekleyerek proteini yükselt.
- Rafine şeker yerine meyveyi tercih et.

> **İpucu:** Protein alımını gün içine yayarsan kas onarımı için daha verimli olur.`,

  snacks: `İşte **sağlıklı atıştırmalık** fikirleri:

- 🥜 Bir avuç badem veya ceviz (~180 kcal)
- 🍎 Elma + 1 yemek kaşığı fıstık ezmesi
- 🥕 Havuç/salatalık çubukları + humus
- 🧀 Az yağlı peynir + tam tahıllı kraker
- 🍓 Yoğurt + taze meyve

> **İpucu:** Protein ve lif içeren atıştırmalıkları birleştirmek seni daha uzun süre tok tutar.`,

  "weight-loss": `Sürdürülebilir **kilo verme** için temel ilkeler:

1. **Hafif kalori açığı** oluştur (günlük ~300–500 kcal).
2. **Protein** alımını koru; kas kaybını önler ve tokluk sağlar.
3. **Lif** açısından zengin sebze ve tam tahılları artır.
4. Haftada **150 dakika** orta yoğunlukta hareket hedefle.
5. **Uyku ve su** tüketimini ihmal etme.

> **İpucu:** Hızlı diyetlerden kaçın. Haftada 0.5–1 kg'lık kayıp hem sağlıklı hem kalıcıdır.`,

  protein: `**Yüksek proteinli** besin seçenekleri:

| Besin | Porsiyon | Protein |
| --- | --- | --- |
| Tavuk göğsü | 100 g | 31 g |
| Somon | 120 g | 25 g |
| Mercimek | 1 kase | 18 g |
| Yumurta | 2 adet | 12 g |
| Yoğurt (yağlı) | 200 g | 11 g |
| Nohut | 1 kase | 15 g |

> **İpucu:** Hedefin genelde vücut ağırlığının kilogramı başına 1.2–2.0 g proteindir.`,

  calories: `**Günlük kalori ihtiyacını** tahmin etmek için:

1. **BMR** (bazal metabolizma) hesapla (Mifflin-St Jeor):
   - Erkek: \`10 × kg + 6.25 × boy(cm) − 5 × yaş + 5\`
   - Kadın: \`10 × kg + 6.25 × boy(cm) − 5 × yaş − 161\`
2. **Aktivite katsayısı** ile çarp:
   - Hareketsiz: × 1.2
   - Hafif aktif: × 1.375
   - Orta aktif: × 1.55
   - Çok aktif: × 1.725

> **İpucu:** Kilo vermek için sonucu %10–20 azalt, almak için %10–15 artır.`,

  default: `Sana beslenme konusunda yardımcı olabilirim! Örneğin:

- 🍽️ **Öğün planı** oluşturabilirim
- 📊 Öğünlerini **analiz** edebilirim
- 🥗 **Sağlıklı tarif** ve atıştırmalık önerebilirim
- 💧 **Su tüketimi** ve **kalori** hedefleri konusunda rehberlik edebilirim

> **İpucu:** Aşağıdaki öneri kartlarından birine dokunarak hızlıca başlayabilirsin.`,
};

/** Simple keyword → intent matcher over the user's message. */
export function resolveIntent(message: string): string {
  const text = message.toLocaleLowerCase("tr-TR");
  const has = (...words: string[]) => words.some((w) => text.includes(w));

  if (has("plan", "öğün planı", "menü")) return "meal-plan";
  if (has("analiz", "değerlendir", "incele")) return "analyze";
  if (has("atıştır", "snack", "ara öğün")) return "snacks";
  if (has("kilo ver", "zayıfla", "kilo kaybı", "diyet")) return "weight-loss";
  if (has("protein")) return "protein";
  if (has("kalori", "kcal", "hesapla", "bmr")) return "calories";
  if (has("su ", "su içme", "hidrasyon")) return "snacks"; // fallback nutrition tip
  return "default";
}

/** Returns the markdown placeholder answer for a user message. */
export function getPlaceholderResponse(message: string): string {
  return RESPONSES[resolveIntent(message)] ?? RESPONSES.default;
}
