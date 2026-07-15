# V1 GAP ANALYSIS — AI Dietitian Platform

> **Belge Türü:** Production Launch Readiness — Gap Analysis
> **Sürüm:** 1.0 · **Tarih:** 2026-07-15 · **Durum:** İnceleme (Review)
> **Kapsam:** V1 herkese açık yayın (App Store · Google Play · Web)
> **Hazırlayan:** Engineering / Product Review
> **İlgili Belgeler:** `ROADMAP.md`, `TODO_MASTER.md`, `PROJECT_MEMORY.md`, `ARCHITECTURE_DECISIONS.md`, `docs/Uygulama Projesi.pdf`

---

## İçindekiler

1. [Executive Summary (Yönetici Özeti)](#1-executive-summary-yönetici-özeti)
2. [Mevcut Durum — Ne Var, Ne Yok](#2-mevcut-durum--ne-var-ne-yok)
3. [Değerlendirme Metodolojisi ve Öncelik/Karmaşıklık Ölçekleri](#3-değerlendirme-metodolojisi)
4. [Critical Missing Features — MUST HAVE (Launch Blocker)](#4-critical-missing-features--must-have-launch-blocker)
5. [Important Missing Features — SHOULD HAVE](#5-important-missing-features--should-have)
6. [Nice-to-Have — COULD HAVE (V1.1+)](#6-nice-to-have--could-have-v11)
7. [Güncellenmiş V1 Roadmap (Sprint Bazlı)](#7-güncellenmiş-v1-roadmap-sprint-bazlı)
8. [Risk Assessment (Özellik Atlanırsa)](#8-risk-assessment-özellik-atlanırsa)
9. [Launch Readiness Checklist](#9-launch-readiness-checklist)

---

## 1. Executive Summary (Yönetici Özeti)

### 1.1 Genel Değerlendirme

AI Dietitian Platform teknik temel açısından **sağlam bir mühendislik zemini** üzerine kurulmuştur: Modular Monolith + DDD mimarisi, katmanlı frontend (Next.js 15), disiplinli backend foundation (Express + Prisma + Pino + Swagger), ve tutarlı kalite kapıları (lint / type-check / build). Ancak proje şu anda **~%42 tamamlanma** seviyesindedir ve **herkese açık bir V1 yayınına hazır değildir.**

Kritik nokta şudur: mevcut roadmap ağırlıklı olarak **fonksiyonel özelliklere** (auth, meals, goals, chat, ödeme) odaklanmış; ancak bir uygulamanın **App Store / Google Play mağaza incelemesinden geçmesi** ve **Türkiye'de yasal olarak yayınlanabilmesi** için gereken **yasal, operasyonel ve uyumluluk katmanı** roadmap'te ya hiç yok ya da dağınık durumda. Bu platform **sağlık verisi** (kan tahlili, kronik hastalık, alerji, ilaç etkileşimi) işlediği için, bu gap'ler **"sonra yaparız" denebilecek" iyileştirmeler değil, launch blocker** seviyesindedir.

### 1.2 En Kritik 3 Bulgu

1. **Yasal/Uyumluluk katmanı neredeyse tamamen eksik.** Sağlık verisi işleyen bir uygulama için KVKK (özellikle **özel nitelikli kişisel veri** — sağlık verisi) açık rıza akışı, Gizlilik Politikası, Kullanım Koşulları, **tıbbi sorumluluk reddi (medical disclaimer)** ve veri işleme envanteri olmadan uygulama ne mağazalarda onaylanır ne de Türkiye'de yasal olarak faaliyet gösterebilir. **Bu, 1 numaralı launch blocker'dır.**

2. **Hesap yaşam döngüsü (account lifecycle) yarım.** Frontend'de şifre sıfırlama / e-posta doğrulama ekranları var ama backend yok; **hesap silme (account deletion)** ise hem App Store (Guideline 5.1.1(v)) hem Google Play hem KVKK açısından **zorunlu** ve şu an hiç yok. Hesap silme olmadan iOS uygulaması **kesin reddedilir.**

3. **Production operasyon körlüğü.** Error tracking (Sentry vb.), analytics, uptime/health monitoring, alerting ve DB backup stratejisi yok. Uygulama yayına çıktığı an, bir hata olduğunda bunu **kullanıcı şikayetinden öğrenirsiniz** — bu bir SaaS için kabul edilemez. Ayrıca ödeme (iyzico) canlıya alındığında **audit log ve webhook doğrulama** olmadan finansal/uyum riski oluşur.

### 1.3 Sayısal Özet

| Kategori | Gerekli (tespit edilen) | Mevcut | Kritik Eksik | Önemli Eksik |
|---|---|---|---|---|
| Legal / Compliance | 8 | 0 | 6 | 2 |
| User Management | 7 | 2 (UI only) | 4 | 1 |
| App Store / Play Requirements | 9 | 1 | 5 | 3 |
| Payment Operations | 8 | 0 | 4 | 4 |
| Production Operations | 7 | 1 (logging) | 4 | 2 |
| Security | 8 | 4 (partial) | 3 | 1 |
| User Experience | 7 | 3 | 1 | 3 |
| Support Infrastructure | 5 | 0 | 2 | 3 |
| **TOPLAM** | **59** | **~11 (çoğu kısmi)** | **29** | **19** |

### 1.4 Tavsiye

Mevcut 13 maddelik V1 listesi **fonksiyonel olarak doğru ama yetersiz.** Aşağıdaki güncellenmiş roadmap, **29 kritik eksiği** launch öncesi zorunlu, **19 önemli eksiği** ise launch'a yakın tamamlanacak şekilde sprint'lere dağıtır. Tahmini ek efor: mevcut ~22–29 güne ek olarak **~30–40 iş günü** (yasal metin hazırlığı ve KVKK danışmanlığı hariç). **Gerçekçi V1 launch hedefi: 2026 Q4.**



---

## 2. Mevcut Durum — Ne Var, Ne Yok

### 2.1 Var Olan (Doğrulanmış)

**Frontend (Next.js 15.5 — çalışıyor, port 3000)**
- Auth ekranları (login, register, forgot-password, reset-password, verify-email) — **yalnızca UI, backend'e bağlı değil, mock.**
- Dashboard (kalori/makro/su görselleştirme).
- Meals (öğün listesi + ekleme) — istemci tarafı state, kalıcı değil.
- AI Chat (sohbet arayüzü) — **mock, gerçek AI orchestrator yok.**
- Goals (8 hedef tipi, Zod validation, haftalık grafik, unsaved-changes guard).
- Feedback bileşenleri: `Loading`, `ErrorState`, `EmptyState` (temel UX state'leri kısmen var).
- Tema (light/dark), responsive layout, BottomNavigation.

**Backend (Express + TypeScript — çalışıyor, port 4000)**
- Foundation: env validation (Zod), Pino logging, correlation ID, request logger.
- Error handling (ApiError + standart JSON envelope), validate middleware.
- Güvenlik temeli: **CORS, Helmet, compression, rate-limit (genel).**
- PostgreSQL 17 + Prisma; şu an **yalnızca `HealthCheck` modeli** var.
- Health endpoint'leri (`/api/health`, `/api/health/ready`), Swagger `/docs`.

**Dokümantasyon:** README, ROADMAP, TODO_MASTER, PROJECT_MEMORY, CHANGELOG, ARCHITECTURE_DECISIONS (AD-001…045) — güçlü ve senkron.

### 2.2 Olmayan (Yüksek Seviye)

- **Backend'de:** Auth (User/RefreshToken), tüm domain modelleri (Profile, Meal, Goal, Chat, Subscription, Payment, BloodTest, NutritionPlan), gerçek AI orchestrator, ödeme entegrasyonu.
- **Yasal:** Hiçbir yasal metin, rıza akışı, disclaimer yok.
- **Operasyon:** Error tracking, analytics, monitoring, alerting, backup, CI/CD, test altyapısı yok.
- **Mağaza:** Store metadata, versiyonlama stratejisi, push notification, deep link, hesap silme yok.
- **Destek:** FAQ, help center, iletişim/destek kanalı yok.

### 2.3 Bilinen Blocker'lar (mevcut dokümanlardan)

1. **GitHub push izni yok (Critical):** write izni olmadığı için commit'ler push edilemiyor.
2. **PostgreSQL kalıcı değil (High):** managed DB gerekli.
3. `/profile` route yok (soft 404).
4. Frontend verileri kalıcı değil (mock/in-memory).

---

## 3. Değerlendirme Metodolojisi

### 3.1 Öncelik Seviyeleri (MoSCoW)

| Seviye | Anlamı | Launch etkisi |
|---|---|---|
| **P0 — MUST HAVE** | Bu olmadan launch **yapılamaz** (yasal ihlal veya mağaza reddi veya operasyonel körlük). | **Launch Blocker** |
| **P1 — SHOULD HAVE** | Launch teknik olarak mümkün ama bu olmadan ciddi risk / kötü ilk izlenim / erken churn. | Launch'a kadar tamamlanmalı |
| **P2 — COULD HAVE** | Değer katar, ertelenebilir. | V1.1 / fast-follow |

### 3.2 Karmaşıklık Tahmini (T-shirt)

| Beden | Efor | Anlamı |
|---|---|---|
| **S** | ~0.5–1 gün | Tek modül / config / metin. |
| **M** | ~2–3 gün | Birkaç dosya, backend + frontend dokunuşu. |
| **L** | ~4–7 gün | Cross-cutting, entegrasyon, test. |
| **XL** | ~8+ gün | Yeni alt sistem / 3. parti entegrasyon + uyumluluk. |

> Not: Yasal metinlerin **hukuki içeriği** (avukat/KVKK danışmanı) bu tahminlerin dışındadır; buradaki efor yalnızca **teknik entegrasyon ve UI**dır.

---

## 4. Critical Missing Features — MUST HAVE (Launch Blocker)

Bu bölümdeki her madde, olmadan **yayının yasal olarak veya mağaza incelemesi açısından mümkün olmadığı** özellikleri içerir.

### 4.A — Legal / Compliance

#### C-1. Gizlilik Politikası (Privacy Policy) + Aydınlatma Metni
- **Neden gerekli:** App Store (Guideline 5.1.1) ve Google Play (User Data policy) **her uygulamadan** erişilebilir bir Gizlilik Politikası URL'i ister. KVKK m.10 "aydınlatma yükümlülüğü" veri toplamadan önce zorunludur.
- **Yasal/teknik gerekçe:** KVKK m.10; App Store Review 5.1.1; Google Play Data Safety. Sağlık verisi işlendiği için politika, hangi sağlık verilerinin (kan tahlili, kronik hastalık) hangi amaçla ne kadar süre saklandığını açıkça belirtmelidir.
- **Karmaşıklık:** M (teknik: barındırma + uygulama içi erişilebilir link + versiyonlama). Hukuki metin harici.
- **Öncelik:** **P0**

#### C-2. Kullanım Koşulları (Terms of Service / Kullanıcı Sözleşmesi)
- **Neden gerekli:** Abonelik satan (iyzico) bir uygulama için mesafeli satış sözleşmesi + kullanım koşulları yasal zorunluluktur (6502 sayılı Tüketicinin Korunması Hakkında Kanun). Mağazalar da EULA/ToS bekler.
- **Yasal/teknik gerekçe:** 6502 sayılı Kanun (mesafeli satış), App Store Schedule 2, Google Play. Otomatik yenilenen abonelikte cayma hakkı ve iptal koşulları açıkça yazılmalı.
- **Karmaşıklık:** M · **Öncelik: P0**

#### C-3. Tıbbi Sorumluluk Reddi (Medical Disclaimer)
- **Neden gerekli:** Uygulama kan tahlili yorumluyor, ilaç–besin etkileşimi uyarısı veriyor ve beslenme planı öneriyor. Bu, **tıbbi tavsiye ile karıştırılma riski** taşır. Hem App Store (Guideline 1.4.1 — sağlık uygulamaları) hem sorumluluk hukuku açısından, uygulamanın **tıbbi teşhis/tedavi yerine geçmediği**, bir hekim/diyetisyen danışmanlığının yerini tutmadığı açıkça ve tekrar tekrar (chat, plan, kan tahlili çıktısı ekranlarında) gösterilmelidir.
- **Yasal/teknik gerekçe:** App Store 1.4.1 & 5.1.1; ürün sorumluluğu; Türkiye'de tıbbi cihaz/sağlık beyanı riskleri. AI çıktılarının yanında kalıcı disclaimer bileşeni gerekir.
- **Karmaşıklık:** M (tekrar kullanılabilir `MedicalDisclaimer` bileşeni + AI çıktı noktalarına yerleştirme + onboarding onayı). **Öncelik: P0**

#### C-4. KVKK Açık Rıza & Consent Management (özellikle sağlık verisi)
- **Neden gerekli:** Sağlık verisi KVKK m.6 uyarınca **özel nitelikli kişisel veridir** ve işlenmesi için **açık rıza** (explicit consent) şarttır. Rızanın alınması, versiyonlanması, geri çekilebilmesi ve kaydının tutulması gerekir. Bu, ARCHITECTURE_DECISIONS AD-011'de (Consent Management ayrı modül) zaten öngörülmüş ama **uygulanmamış.**
- **Yasal/teknik gerekçe:** KVKK m.6 (özel nitelikli veri) + m.5 (açık rıza); GDPR Art.9 (muadil). Rıza olmadan kan tahlili yükleme özelliği yasal olarak açılamaz.
- **Karmaşıklık:** L (Consent modeli + versiyonlama + onboarding akışı + geri çekme + audit). **Öncelik: P0**

#### C-5. Veri Sahibi Hakları: Veri Dışa Aktarma (Data Export / Portability)
- **Neden gerekli:** KVKK m.11 ve GDPR Art.15/20 kullanıcıya kendi verisini talep etme ve taşınabilir formatta alma hakkı verir. Sağlık verisi işleyen bir platformda bu talep gelecektir.
- **Yasal/teknik gerekçe:** KVKK m.11; GDPR Art.20; Google Play Data Safety "data can be requested for export".
- **Karmaşıklık:** M (kullanıcının tüm verisini JSON/PDF export eden endpoint + UI). **Öncelik: P0** (hesap silme ile birlikte)

#### C-6. Yaş Sınırı / Reşit Olmayan Koruması (Age Gate)
- **Neden gerekli:** Sağlık verisi + beslenme kısıtlaması içeren uygulamalar için yaş doğrulaması gerekir; KVKK'da reşit olmayanların verisi için veli rızası konusu vardır, App Store yaş derecelendirmesi ve Play Families policy uygulanır. Yeme davranışı içeriği olan uygulamalarda özellikle hassastır.
- **Yasal/teknik gerekçe:** App Store Age Rating; Google Play Families; KVKK reşit olmama. Onboarding'de doğum tarihi zaten toplanıyor (11 alanlı profil) — age gate mantığı eklenmeli.
- **Karmaşıklık:** S · **Öncelik: P0**

### 4.B — User Management

#### C-7. Hesap Silme (Account Deletion) — uygulama içinden
- **Neden gerekli:** **App Store Guideline 5.1.1(v)**: hesap oluşturmaya izin veren her uygulama, kullanıcının hesabını **uygulama içinden silebilmesini** sağlamak zorundadır. Google Play de (2024+) hem uygulama içi hem web üzerinden hesap+veri silme talep eder. KVKK m.7 "silme/yok etme" hakkı. **Bu olmadan iOS uygulaması kesinlikle reddedilir.**
- **Yasal/teknik gerekçe:** App Store 5.1.1(v) (kesin ret sebebi); Google Play Account Deletion policy; KVKK m.7 & Silme Yönetmeliği.
- **Karmaşıklık:** M (soft/hard delete stratejisi + ilişkili verilerin silinmesi/anonimleştirilmesi + onay akışı + abonelik iptali ile koordinasyon). **Öncelik: P0**

#### C-8. Şifre Sıfırlama — Backend (Password Reset)
- **Neden gerekli:** Frontend ekranı var ama backend yok. Kullanıcı şifresini unutunca hesabına erişemez → destek yükü + churn. Token üretimi, e-posta gönderimi, süreli/tek kullanımlık token doğrulama gerekir.
- **Yasal/teknik gerekçe:** Temel hesap kurtarma; güvenlik (token TTL, tek kullanım, rate limit).
- **Karmaşıklık:** M · **Öncelik: P0**

#### C-9. E-posta Doğrulama — Backend (Email Verification)
- **Neden gerekli:** Frontend ekranı var ama backend yok. Doğrulanmamış e-postalar spam/sahte hesap ve teslim edilemeyen bildirim sorunları yaratır; ödeme makbuzu ve şifre sıfırlama e-postalarının gerçek adrese gitmesi kritiktir.
- **Yasal/teknik gerekçe:** Hesap bütünlüğü; işlemsel e-posta güvenilirliği.
- **Karmaşıklık:** M · **Öncelik: P0**

#### C-10. İşlemsel E-posta Altyapısı (Transactional Email Service)
- **Neden gerekli:** C-8, C-9, C-7 ve ödeme makbuzları için güvenilir bir e-posta gönderim servisi (SES/SendGrid/Postmark) ve şablon altyapısı yok. Bunlar olmadan yukarıdaki akışların hiçbiri çalışmaz.
- **Yasal/teknik gerekçe:** Altyapısal bağımlılık (C-7/8/9 ve makbuzlar bunun üstünde çalışır); SPF/DKIM/DMARC teslimat için.
- **Karmaşıklık:** M · **Öncelik: P0**

### 4.C — App Store / Google Play Requirements

#### C-11. Uygulama İçi Hesap Silme Girişi + Data Safety / Privacy Nutrition Labels
- **Neden gerekli:** App Store "Privacy Nutrition Labels" ve Google Play "Data Safety" formu, uygulamanın topladığı **her veri türünü** (özellikle "Health & Fitness" ve "Sensitive info") beyan etmeyi zorunlu kılar. Yanlış/eksik beyan = ret veya kaldırma. Bu, kod değil ama **launch blocker bir teslim kalemidir** ve veri envanteri (C-4) ile beslenir.
- **Yasal/teknik gerekçe:** App Store App Privacy; Google Play Data Safety (zorunlu form).
- **Karmaşıklık:** S (form) ama veri envanteri doğruluğuna bağlı. **Öncelik: P0**

#### C-12. Store Metadata & Derecelendirme/Content Rating
- **Neden gerekli:** Yayın için uygulama adı, açıklama, ekran görüntüleri, kategori, **yaş/içerik derecelendirmesi (IARC)**, destek URL'i, gizlilik URL'i zorunludur. Sağlık beyanları içerik derecelendirmesini etkiler.
- **Yasal/teknik gerekçe:** App Store Connect / Play Console zorunlu alanları.
- **Karmaşıklık:** M (assets üretimi dahil). **Öncelik: P0**

#### C-13. Uygulama Versiyonlama & Zorunlu Güncelleme (Force Update) Mekanizması
- **Neden gerekli:** Mağaza uygulamaları için semantic versioning + build number yönetimi ve kritik güvenlik/uyum düzeltmelerinde eski istemcileri **zorunlu güncellemeye** yönlendiren bir "minimum supported version" mekanizması gerekir (özellikle ödeme/gizlilik değişince).
- **Yasal/teknik gerekçe:** Operasyonel güvenlik; ödeme/uyum düzeltmelerinin dağıtımı; API versiyonlama (AD-021) ile uyum.
- **Karmaşıklık:** M · **Öncelik: P0** (native uygulama varsa), P1 (yalnız web ise)

### 4.D — Payment Operations

#### C-14. Abonelik Yaşam Döngüsü & Webhook Doğrulama (iyzico)
- **Neden gerekli:** Sadece "ödeme al" yetmez. Abonelik durumları (active/past_due/canceled/expired/refunded), yenileme, **iyzico webhook/callback'lerinin imza doğrulaması**, idempotent işleme (AD-041) ve durum senkronizasyonu gerekir. Doğrulanmamış webhook = sahte "ödeme başarılı" çağrılarıyla premium'a bedava erişim riski.
- **Yasal/teknik gerekçe:** iyzico entegrasyon gereksinimleri; finansal bütünlük; AD-041 idempotency.
- **Karmaşıklık:** XL · **Öncelik: P0**

#### C-15. Makbuz / Fatura (Receipt & Invoice) + KDV
- **Neden gerekli:** Türkiye'de dijital hizmet satışında **fatura/e-arşiv fatura** ve KDV yükümlülüğü vardır; kullanıcıya makbuz iletilmelidir. App Store/Play kendi IAP'sini kullanıyorsa makbuzu onlar keser — ancak **iyzico ile doğrudan web/harici satışta faturayı siz kesmek zorundasınız.**
- **Yasal/teknik gerekçe:** VUK / e-arşiv fatura; 6502 sayılı Kanun; iyzico. **Not:** iOS/Android'de dijital abonelik satışı büyük oranda platformun kendi IAP'sini kullanmayı zorunlu kılar (App Store 3.1.1) — iyzico yalnız web'de veya "reader/multiplatform" istisnalarında geçerli olabilir. **Bu politika netleştirilmeli (aşağıda R-Payment riski).**
- **Karmaşıklık:** L · **Öncelik: P0**

#### C-16. Abonelik Yönetimi (Görüntüle / İptal / Yükselt-Düşür)
- **Neden gerekli:** Kullanıcı mevcut planını görebilmeli, iptal edebilmeli, plan değiştirebilmeli. App Store 3.1.2 ve Play, abonelik yönetimine kolay erişim ister; iptal edilemeyen abonelik ret/şikayet sebebidir.
- **Yasal/teknik gerekçe:** App Store 3.1.2; Play Subscriptions; 6502 cayma/iptal.
- **Karmaşıklık:** L · **Öncelik: P0**

#### C-17. Ödeme Geçmişi & Ödeme Audit Log
- **Neden gerekli:** Kullanıcı için ödeme geçmişi; operasyon için tüm ödeme olaylarının değiştirilemez audit kaydı (uyuşmazlık, chargeback, muhasebe mutabakatı). Correlation ID (AD-043) ile izlenebilir olmalı.
- **Yasal/teknik gerekçe:** Muhasebe/vergi kayıt saklama; uyuşmazlık yönetimi; AD-043.
- **Karmaşıklık:** M · **Öncelik: P0**

### 4.E — Production Operations

#### C-18. Error Tracking (Sentry / eşdeğeri)
- **Neden gerekli:** Şu an Pino logları var ama merkezi, alarmlı, stack-trace + release + kullanıcı bağlamı içeren hata izleme yok. Production'da hataları kullanıcı şikayetiyle öğrenmek kabul edilemez. Frontend (JS) + backend (Node) + mobil crash raporlama gerekir.
- **Yasal/teknik gerekçe:** Operasyonel gözlemlenebilirlik; SLA; AD-030 (observability).
- **Karmaşıklık:** M · **Öncelik: P0**

#### C-19. Uptime / Health Monitoring & Alerting
- **Neden gerekli:** `/api/health` endpoint'i var ama onu izleyen, düşünce alarm üreten bir sistem yok. DB down, yüksek hata oranı, ödeme webhook hatası gibi durumlarda otomatik uyarı (Slack/e-posta/PagerDuty) gerekir.
- **Yasal/teknik gerekçe:** AD-030; incident response; SLA.
- **Karmaşıklık:** M · **Öncelik: P0**

#### C-20. Veritabanı Backup & Restore Stratejisi + Managed DB
- **Neden gerekli:** Mevcut Postgres **kalıcı bile değil** (VM restart'ta gidiyor). Production'da otomatik yedekleme, point-in-time recovery ve düzenli restore testi olmadan **sağlık verisi kaybı** felaketi olur. Managed PostgreSQL şart.
- **Yasal/teknik gerekçe:** Veri dayanıklılığı; KVKK "veri güvenliği" (m.12); iş sürekliliği.
- **Karmaşıklık:** L · **Öncelik: P0**

#### C-21. CI/CD Pipeline + Secrets Management
- **Neden gerekli:** Şu an CI/CD yok, deploy manuel. Güvenli, tekrarlanabilir dağıtım (lint+type-check+build+test+deploy) ve **secrets'ın koddan ayrı, merkezi yönetimi** (AD-016, AD-038) gerekir. Ödeme anahtarları, JWT secret, DB şifresi asla repo'da olmamalı.
- **Yasal/teknik gerekçe:** AD-016/AD-038; güvenli release; insan hatası azaltma.
- **Karmaşıklık:** L · **Öncelik: P0**

### 4.F — Security

#### C-22. Kimlik Doğrulama Altyapısı (Auth) — Backend
- **Neden gerekli:** Zaten Sprint 8 olarak planlı. User/RefreshToken, bcrypt, JWT (access+refresh), auth middleware. Tüm korumalı özelliklerin ön koşulu. **Diğer her şeyin temeli.**
- **Yasal/teknik gerekçe:** Faz 9 (Critical); tüm PHI/PII erişiminin ön koşulu.
- **Karmaşıklık:** L · **Öncelik: P0**

#### C-23. Uçtan Uca Şifreleme in Transit (HTTPS/TLS) + Güvenlik Başlıkları (prod)
- **Neden gerekli:** Sağlık verisi taşındığı için tüm trafik TLS üzerinde olmalı; HSTS, secure cookie, prod CORS whitelist, CSP gerekir. Helmet var ama prod-grade konfigürasyon ve TLS zorlaması (redirect + HSTS) doğrulanmamış.
- **Yasal/teknik gerekçe:** KVKK m.12 veri güvenliği; App Store ATS (App Transport Security) zorunlu HTTPS.
- **Karmaşıklık:** M · **Öncelik: P0**

#### C-24. Hassas Veri (PHI) Şifreleme at Rest + PHI Minimization
- **Neden gerekli:** Kan tahlili dosyaları ve sağlık verileri **at-rest şifrelenmeli** (DB/dosya storage). Ayrıca AD-039 uyarınca harici AI çağrılarında PHI minimizasyonu **zorunlu** — kan tahlili verisi ham haliyle 3. parti LLM'e gönderilmemeli.
- **Yasal/teknik gerekçe:** KVKK m.12; AD-037 (veri sınıflandırması), AD-039 (PHI minimization). Blood test analysis özelliği bu olmadan açılamaz.
- **Karmaşıklık:** L · **Öncelik: P0**

### 4.G — User Experience

#### C-25. Global Hata / Boş / Yükleme Durumları (tüm veri akışlarında)
- **Neden gerekli:** Feedback bileşenleri (Loading/Error/Empty) var ama şu an mock veride. Backend'e bağlanınca **her** ekranda tutarlı loading skeleton, hata (retry ile) ve boş durum ele alınmalı; ağ hatası, 401 (oturum bitti → login'e yönlendirme), 402 (ödeme gerekli), 429 (rate limit) durumları kullanıcıya anlamlı gösterilmeli.
- **Yasal/teknik gerekçe:** Mağaza incelemesi "app completeness" (Guideline 2.1) — boş/çöken ekranlar ret sebebi. Erken churn.
- **Karmaşıklık:** M · **Öncelik: P0**

### 4.H — Support Infrastructure

#### C-26. İletişim / Destek Kanalı + Destek URL'i
- **Neden gerekli:** Mağazalar geçerli bir **destek URL'i / iletişim** zorunlu kılar. Sağlık ve ödeme içeren bir üründe kullanıcı sorunları (yanlış tahlil yorumu, ödeme sorunu) için erişilebilir bir kanal (uygulama içi form / e-posta) şart.
- **Yasal/teknik gerekçe:** App Store 1.5 (destek URL); 6502 (satıcı iletişim bilgisi zorunlu).
- **Karmaşıklık:** S · **Öncelik: P0**

> **C-27 (Meta / non-code, P0):** **KVKK VERBİS kaydı ve Veri Sorumlusu tayini** — sağlık verisi işleyen bir veri sorumlusunun VERBİS'e kayıt yükümlülüğü olabilir; hukuki değerlendirme gerekir. Kod işi değil ama launch öncesi kapatılması gereken bir uyum kalemidir. Burada **takip için** listelenmiştir.



---

## 5. Important Missing Features — SHOULD HAVE

Launch teknik olarak bunlar olmadan mümkün olabilir, ancak her biri **ciddi risk, kötü ilk izlenim veya yüksek erken churn** anlamına gelir. Hedef: launch'a kadar veya launch+2 hafta içinde.

### 5.A — Legal / Compliance

#### I-1. Çerez / Tracking Onayı (Web) & ATT (iOS App Tracking Transparency)
- **Neden:** Web'de analytics/çerez için onay bandı (KVKK/GDPR); iOS'ta 3. parti takip yapılıyorsa **ATT izin diyaloğu** zorunlu (aksi halde ret).
- **Gerekçe:** App Store 5.1.2 (ATT); KVKK/ePrivacy. **Karmaşıklık:** M · **Öncelik: P1**

#### I-2. Veri Saklama & İmha Politikası (Retention/Deletion Schedule)
- **Neden:** Sağlık verisi ne kadar saklanacak, ne zaman anonimleştirilecek/imha edilecek — teknik olarak uygulanmalı (cron/job).
- **Gerekçe:** KVKK Saklama ve İmha Yönetmeliği; AD-027 (jobs). **Karmaşıklık:** M · **Öncelik: P1**

### 5.B — User Management

#### I-3. Oturum Yönetimi & Cihaz Yönetimi (Session/Device Management)
- **Neden:** Kullanıcının aktif oturumlarını görmesi, "tüm cihazlardan çıkış", şüpheli oturum sonlandırma. Refresh token rotation + reuse detection.
- **Gerekçe:** Güvenlik en iyi pratikleri; hesap ele geçirme azaltma. **Karmaşıklık:** M · **Öncelik: P1**

### 5.C — App Store / Play Requirements

#### I-4. Push Notification Altyapısı
- **Neden:** Retention'ın en güçlü kaldıracı (öğün hatırlatma, su, plan güncellemesi). V1'de olmadan retention düşük olur. FCM/APNs + izin akışı + tercih yönetimi.
- **Gerekçe:** Ürün retention; **izin ve opt-out** yasal olarak yönetilmeli. **Karmaşıklık:** L · **Öncelik: P1**

#### I-5. Deep Linking / Universal Links
- **Neden:** E-posta doğrulama, şifre sıfırlama, ödeme dönüşü ve bildirim tıklamalarının doğru ekrana açılması için. Şifre sıfırlama e-postasının mobil uygulamada açılması buna bağlı.
- **Gerekçe:** İşlemsel akışların tamamlanması; UX. **Karmaşıklık:** M · **Öncelik: P1**

#### I-6. Uygulama İçi Değerlendirme İsteği (Rating/Review Prompt)
- **Neden:** Store rating büyümenin motoru; native `SKStoreReviewController` / In-App Review API doğru anlarda tetiklenmeli.
- **Gerekçe:** App Store/Play resmi API; ASO. **Karmaşıklık:** S · **Öncelik: P1** (native varsa)

### 5.D — Payment Operations

#### I-7. İade / Refund Akışı & Politikası
- **Neden:** İade talebi kaçınılmaz; iyzico iade API'si + iç akış + politika sayfası + kayıt gerekir.
- **Gerekçe:** 6502 cayma hakkı; iyzico. **Karmaşıklık:** M · **Öncelik: P1**

#### I-8. Başarısız Ödeme / Dunning & Grace Period
- **Neden:** Yenileme başarısız olunca retry, kullanıcı bilgilendirme, grace period ve downgrade mantığı. Olmadan gelir kaçağı + ani erişim kesintisi şikayeti.
- **Gerekçe:** Abonelik gelir yönetimi. **Karmaşıklık:** M · **Öncelik: P1**

#### I-9. Free/Premium/Premium Plus Entitlement & Feature Gating
- **Neden:** Plan başına özellik kapıları (ör. kan tahlili sayısı, plan süresi, chat limiti) tek bir merkezi entitlement servisiyle uygulanmalı; Feature Flags (AD-010/AD-031) ile.
- **Gerekçe:** İş modeli bütünlüğü; AD-010. **Karmaşıklık:** M · **Öncelik: P1**

#### I-10. Kullanım Kotası / Maliyet Koruması (AI çağrıları)
- **Neden:** AI çağrıları maliyetli; kullanıcı/plan başına kota + rate limit + kötüye kullanım koruması (AD-020) olmadan maliyet patlaması riski.
- **Gerekçe:** AD-020; maliyet kontrolü; suistimal. **Karmaşıklık:** M · **Öncelik: P1**

### 5.E — Production Operations

#### I-11. Ürün Analitiği (Product Analytics)
- **Neden:** Funnel, aktivasyon, retention, conversion ölçümü olmadan ürün kararları körlemesine verilir. (Onaylı, anonimleştirilmiş; sağlık verisi analytics'e gitmemeli.)
- **Gerekçe:** Ürün ölçümü; **KVKK uyumlu** kurulmalı. **Karmaşıklık:** M · **Öncelik: P1**

#### I-12. Otomatik Test Altyapısı (Unit / Integration / E2E)
- **Neden:** Şu an hiç test yok (TD-04). Auth/ödeme/sağlık gibi kritik akışlar test edilmeden sürekli deploy riskli. En azından kritik yollar için.
- **Gerekçe:** Regression koruması; CI kapısı. **Karmaşıklık:** L · **Öncelik: P1**

### 5.F — Security

#### I-13. Auth'a Özel Rate Limiting & Brute-force / Bot Koruması
- **Neden:** Genel rate-limit var ama login/register/reset/OTP için ayrı, sıkı limitler + hesap kilitleme + (opsiyonel) CAPTCHA gerekir. Credential stuffing'e karşı.
- **Gerekçe:** OWASP; hesap güvenliği. **Karmaşıklık:** M · **Öncelik: P1**

### 5.G — User Experience

#### I-14. Onboarding / Kullanıcı Eğitimi (11 alanlı profil akışı)
- **Neden:** Zorunlu onboarding (11 alan) uzun; iyi tasarlanmış, adım adım, ilerleme göstergeli bir akış olmadan drop-off yüksek olur. İlk-kullanım tur/coach-marks.
- **Gerekçe:** Aktivasyon; ilk izlenim. **Karmaşıklık:** L · **Öncelik: P1**

#### I-15. Uluslararasılaştırma (i18n) Altyapısı
- **Neden:** V1 Türkçe olsa da metinler kod içine gömülü olmamalı; i18n altyapısı sonradan eklemek pahalıdır. En az string extraction + tr locale.
- **Gerekçe:** Ölçeklenebilirlik; erişilebilirlik. **Karmaşıklık:** M · **Öncelik: P1**

#### I-16. Erişilebilirlik (a11y) Temel Uyumu
- **Neden:** Kontrast, focus yönetimi, ekran okuyucu etiketleri, dokunma hedefi boyutu. Mağazalar ve yasal erişilebilirlik beklentisi.
- **Gerekçe:** WCAG 2.1 AA hedefi; kapsayıcılık. **Karmaşıklık:** M · **Öncelik: P1**

### 5.H — Support Infrastructure

#### I-17. FAQ / Yardım Merkezi (Help Center)
- **Neden:** Destek yükünü azaltır; sık sorular (nasıl kan tahlili yüklerim, aboneliği nasıl iptal ederim). Uygulama içi statik/aranabilir içerik.
- **Gerekçe:** Destek maliyeti; self-service. **Karmaşıklık:** M · **Öncelik: P1**

#### I-18. Uygulama İçi Geri Bildirim & Hata Bildirme
- **Neden:** Kullanıcının sorun/öneri iletebilmesi (log/screenshot ekli). Erken dönemde ürün iyileştirme için kritik.
- **Gerekçe:** Feedback loop. **Karmaşıklık:** S · **Öncelik: P1**

#### I-19. Admin Panel (Temel Operasyon)
- **Neden:** Kullanıcı/abonelik görüntüleme, iade işleme, destek talebi görme, feature flag yönetimi. Spec BÖLÜM 14'te öngörülmüş. Olmadan her operasyon elle DB müdahalesi gerektirir (riskli).
- **Gerekçe:** Operasyonel yönetilebilirlik; spec BÖLÜM 14. **Karmaşıklık:** L · **Öncelik: P1**

---

## 6. Nice-to-Have — COULD HAVE (V1.1+)

| # | Özellik | Kategori | Neden ertelenebilir |
|---|---|---|---|
| N-1 | Sosyal giriş (Google/Apple Sign-In) | Auth | Apple Sign-In, başka sosyal giriş varsa **zorunlu olur** (App Store 4.8) — sosyal giriş V1'de yoksa ertelenebilir. |
| N-2 | Referans / davet programı | Growth | Büyüme özelliği, çekirdek değil. |
| N-3 | Gamification (rozet, streak) | Engagement | Retention artırır ama V1 çekirdeği değil. |
| N-4 | Giyilebilir cihaz / HealthKit / Google Fit entegrasyonu | Data | Değerli ama kapsam ve gizlilik yükü büyük. |
| N-5 | RAG / Knowledge Base | AI | AD/ROADMAP'te zaten v2+. |
| N-6 | Çoklu dil (İngilizce vb.) içerik | i18n | Altyapı (I-15) V1'de, içerik sonra. |
| N-7 | A/B test / Experiment Management | Growth | AD-013: v2+. |
| N-8 | Multi-tenant / Organization | Platform | AD-014: v2+. |
| N-9 | Web push | Notifications | Mobil push (I-4) öncelikli. |

---

## 7. Güncellenmiş V1 Roadmap (Sprint Bazlı)

> Mevcut Sprint 1–7 tamamlandı. Aşağıdaki plan Sprint 8'den itibaren, **kritik uyum/operasyon gap'lerini fonksiyonel işle iç içe** dağıtır. Sprint'ler ~1 haftalık kabul edilmiştir.

### Faz 2 — Auth, Domain Persistence & Compliance Foundation

**Sprint 8 — Auth Infrastructure (BE) + Session** `[C-22, I-13, I-3]`
- User/RefreshToken modelleri, bcrypt, JWT (access+refresh), auth middleware.
- Refresh token rotation + reuse detection; auth-özel rate limiting + hesap kilitleme.
- Frontend auth entegrasyonu.

**Sprint 9 — Account Lifecycle + Email** `[C-8, C-9, C-10, C-7, C-5]`
- Transactional email servisi + şablonlar.
- Password reset (BE), email verification (BE) — frontend'e bağla.
- Hesap silme (uygulama içi) + veri dışa aktarma (export).

**Sprint 10 — Consent & Legal Foundation** `[C-1, C-2, C-3, C-4, C-6, C-11, C-26]`
- Consent Management modeli + versiyonlama + onboarding rıza akışı + geri çekme.
- Gizlilik Politikası / Kullanım Koşulları / Medical Disclaimer barındırma + uygulama içi erişim + `MedicalDisclaimer` bileşeni.
- Age gate; destek/iletişim kanalı; Data Safety / Privacy Labels veri envanteri hazırlığı.

**Sprint 11 — Profile & Onboarding + Domain Persistence (1)** `[I-14, TD-01, TD-02]`
- `/profile` route + backend profil (11 alanlı zorunlu onboarding, adım adım akış).
- Meals + Goals + Dashboard için backend model/API + frontend'i kalıcı API'ye taşıma.

### Faz 3 — AI, Health Engine & Payments

**Sprint 12 — Security Hardening (Data)** `[C-23, C-24, I-2]`
- Prod TLS/HSTS/CSP/secure cookie/prod CORS.
- PHI at-rest şifreleme + veri sınıflandırma; retention/imha job'ları.

**Sprint 13 — AI Orchestrator + PHI Minimization** `[C-24 (devam), I-10]`
- Gerçek AI orchestrator (routing, prompt registry, fallback), chat mock→gerçek.
- PHI minimization pipeline; AI kullanım kotası + rate limit + maliyet koruması.

**Sprint 14 — Health & Nutrition Engine** `[çekirdek özellik]`
- Kan tahlili PDF/Görsel analizi (OCR + değerlendirme, disclaimer'lı).
- 30/60 günlük kişiselleştirilmiş beslenme planı üretimi.

**Sprint 15 — Payments (1): Subscription & iyzico** `[C-14, I-9, C-16]`
- iyzico entegrasyonu + webhook imza doğrulama + idempotency.
- Abonelik yaşam döngüsü; Free/Premium/Premium Plus entitlement + feature gating.
- Abonelik yönetimi (görüntüle/iptal/yükselt-düşür).
- **Ön koşul:** iOS/Android IAP vs. iyzico politika kararı (bkz. R-PAY-1).

**Sprint 16 — Payments (2): Receipts, Refunds, History** `[C-15, C-17, I-7, I-8]`
- Fatura/makbuz + KDV; ödeme geçmişi + audit log.
- İade akışı; başarısız ödeme/dunning/grace period.

### Faz 4 — Production Hardening & Launch

**Sprint 17 — Observability & Ops** `[C-18, C-19, C-20, C-21]`
- Error tracking (Sentry) FE+BE(+mobil crash).
- Uptime/health monitoring + alerting.
- Managed PostgreSQL + backup/restore + restore testi.
- CI/CD (lint+type-check+build+test+deploy) + secrets management.

**Sprint 18 — Quality, UX Polish & Analytics** `[I-12, C-25, I-11, I-15, I-16, I-17, I-18]`
- Kritik akışlar için otomatik test (auth/payment/health).
- Global loading/error/empty + 401/402/429 ele alma.
- Ürün analitiği (KVKK uyumlu); i18n altyapısı; a11y temel; FAQ/yardım; uygulama içi geri bildirim.

**Sprint 19 — App Store / Play Readiness** `[C-12, C-13, I-4, I-5, I-6, I-1]`
- Store metadata + content rating + assets; versiyonlama + force-update.
- Push notification altyapısı; deep/universal links; rating prompt; çerez/ATT.

**Sprint 20 — Admin, Compliance Sign-off & Launch** `[I-19, C-27]`
- Admin panel (temel operasyon).
- Data Safety / Privacy Labels formları; VERBİS/hukuki sign-off; pre-launch checklist (Bölüm 9); soft launch → GA.

### Efor Özeti (güncellenmiş)

| Faz | Sprint | Tahmini |
|---|---|---|
| Faz 2 | 8–11 | ~4 hafta |
| Faz 3 | 12–16 | ~5–6 hafta |
| Faz 4 | 17–20 | ~4 hafta |
| **Toplam (Sprint 8→20)** | | **~13–15 hafta** (paralel iş ile sıkışabilir) |

> **Kritik yol:** Auth → Consent/Legal → Health Engine → Payments → Observability → Store Readiness. Legal metinlerin hukuki hazırlığı ve managed altyapı tedariki **paralel** başlatılmalı (uzun teslim süreli kalemler).

---

## 8. Risk Assessment (Özellik Atlanırsa)

| Risk ID | Atlanırsa | Olasılık | Etki | Sonuç |
|---|---|---|---|---|
| **R-LEG-1** | Gizlilik/ToS/Disclaimer (C-1/2/3) yok | Kesin | Kritik | Mağaza reddi + KVKK yaptırımı + tıbbi sorumluluk davası riski. **Launch imkansız.** |
| **R-LEG-2** | KVKK açık rıza (C-4) yok | Kesin | Kritik | Sağlık verisi işlemek **hukuka aykırı**; idari para cezası; kan tahlili özelliği açılamaz. |
| **R-USR-1** | Hesap silme (C-7) yok | Kesin | Kritik | **App Store kesin ret** (5.1.1v); Google Play uyumsuzluk; KVKK ihlali. |
| **R-PAY-1** | IAP vs. iyzico politikası netleşmez (C-14/15) | Yüksek | Kritik | iOS/Android'de dijital abonelik dış ödeme ile **reddedilir** (3.1.1). Gelir modeli tıkanır. **Launch öncesi karar şart.** |
| **R-PAY-2** | Webhook doğrulama/idempotency (C-14) yok | Orta | Kritik | Sahte "ödeme başarılı" ile bedava premium; çift tahsilat; gelir kaybı; uyuşmazlık. |
| **R-SEC-1** | PHI at-rest şifreleme / PHI minimization (C-24) yok | Orta | Kritik | Sağlık verisi sızıntısı → ağır KVKK cezası + itibar kaybı; AD-039 ihlali. |
| **R-OPS-1** | Backup/managed DB (C-20) yok | Yüksek | Kritik | Veri kaybı = geri dönüşü olmayan sağlık verisi kaybı + hukuki sorumluluk. |
| **R-OPS-2** | Error tracking/monitoring (C-18/19) yok | Yüksek | Yüksek | Kesintiler geç fark edilir; ödeme/sağlık hataları sessizce kaybolur; SLA yok. |
| **R-SEC-2** | Auth rate limit/brute-force (I-13) yok | Orta | Yüksek | Credential stuffing → hesap ele geçirme → sağlık verisi maruziyeti. |
| **R-UX-1** | Loading/error/empty (C-25) eksik | Orta | Orta | "App completeness" (2.1) reddi; kötü ilk izlenim; erken churn. |
| **R-PAY-3** | Refund/dunning (I-7/8) yok | Orta | Orta | Tüketici şikayeti; gelir kaçağı; manuel operasyon yükü. |
| **R-GRW-1** | Push/analytics/rating (I-4/11/6) yok | Orta | Orta | Düşük retention, körlemesine ürün kararları, yavaş organik büyüme. |
| **R-SUP-1** | Destek/FAQ/admin (C-26/I-17/I-19) zayıf | Yüksek | Orta | Destek yükü patlar; her operasyon elle DB müdahalesi (riskli). |
| **R-QA-1** | Test altyapısı (I-12) yok | Yüksek | Orta-Yüksek | Kritik akışlarda (auth/ödeme) regression; her release kumar. |

### Risk Önceliklendirme Özeti
- **Kabul edilemez (launch'ı bloke eder):** R-LEG-1, R-LEG-2, R-USR-1, R-PAY-1, R-PAY-2, R-SEC-1, R-OPS-1.
- **Launch öncesi güçlü şekilde kapatılmalı:** R-OPS-2, R-SEC-2, R-UX-1.
- **Launch+2 hafta içinde:** R-PAY-3, R-GRW-1, R-SUP-1, R-QA-1.

---

## 9. Launch Readiness Checklist

**Legal & Compliance**
- [ ] Gizlilik Politikası + Aydınlatma Metni yayında ve uygulama içi erişilebilir (C-1)
- [ ] Kullanım Koşulları / Mesafeli Satış Sözleşmesi (C-2)
- [ ] Medical Disclaimer tüm AI/sağlık çıktılarında (C-3)
- [ ] KVKK açık rıza akışı + versiyonlama + geri çekme (C-4)
- [ ] Age gate (C-6) · Veri export (C-5) · Hesap silme (C-7)
- [ ] Data Safety / Privacy Labels doğru dolduruldu (C-11)
- [ ] VERBİS/veri sorumlusu hukuki sign-off (C-27)

**Security**
- [ ] Auth (JWT+refresh rotation) + auth rate limiting (C-22, I-13)
- [ ] Prod TLS/HSTS/CSP/secure cookie/CORS whitelist (C-23)
- [ ] PHI at-rest şifreleme + PHI minimization AI çağrılarında (C-24)

**Payments**
- [ ] IAP vs. iyzico platform politikası kararı verildi (R-PAY-1)
- [ ] Webhook imza doğrulama + idempotency (C-14)
- [ ] Abonelik yönetimi + entitlement/feature gating (C-16, I-9)
- [ ] Fatura/makbuz/KDV + ödeme geçmişi/audit (C-15, C-17)
- [ ] Refund + dunning/grace period (I-7, I-8)

**Production Ops**
- [ ] Managed PostgreSQL + otomatik backup + restore testi (C-20)
- [ ] Error tracking (FE+BE+crash) (C-18)
- [ ] Uptime monitoring + alerting (C-19)
- [ ] CI/CD + secrets management (C-21)
- [ ] Kritik akış testleri geçiyor (I-12)

**UX & Store**
- [ ] Tüm ekranlarda loading/error/empty + 401/402/429 (C-25)
- [ ] Store metadata + content rating + assets (C-12)
- [ ] Versiyonlama + force-update (C-13)
- [ ] Push + deep link + rating prompt + ATT/çerez (I-4/5/6/1)
- [ ] Onboarding akışı + a11y temel + i18n altyapısı (I-14/16/15)

**Support**
- [ ] Destek kanalı + destek URL (C-26)
- [ ] FAQ/Yardım merkezi + uygulama içi geri bildirim (I-17/18)
- [ ] Admin panel temel operasyon (I-19)

---

### Ek Not — Mevcut Blocker'ların Launch İlişkisi
- **GitHub push izni (Critical):** CI/CD (C-21) ve sürüm yönetimi bu çözülmeden kurulamaz. **Önce kapatılmalı.**
- **PostgreSQL kalıcılığı (High):** C-20 (managed DB) ile birlikte çözülür.

> Bu belge canlı bir dokümandır (AD-044 risk kaydı prensibi). Her sprint sonunda ilgili maddeler işaretlenmeli ve yeni keşfedilen gap'ler eklenmelidir.
