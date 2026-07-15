# ROADMAP — Diewish

> **Ürün adı:** Diewish (resmi). Önceki geçici ad "AI Dietitian Platform" artık kullanılmaz.
> **Belge amacı:** V1 lansmanı için optimize edilmiş, önceliklendirilmiş nihai yol haritası.
> **Strateji:** Her planlanan özelliği inşa etmek DEĞİL — kararlı, güvenli ve production-ready bir V1'i mümkün olan en kısa sürede yayınlamak.
> **Son güncelleme:** 2026-07-15 · **Genel tamamlanma:** ~%42

Mimari temel: **Modular Monolith + Domain-Driven Design** (bkz. `ARCHITECTURE_DECISIONS.md`).
Kaynak analiz: `V1_GAP_ANALYSIS.md` (29 kritik / 19 önemli / 9 ertelenebilir bulgu).

---

## 0. Önceliklendirme Yöntemi

Roadmap'teki **her madde** için tek bir soru sorulmuştur:

> **"Bu, Diewish'i yayınlamadan önce kesinlikle gerekli mi?"**

Cevaba göre madde üç kovadan birine yerleştirilir:

| Kova | Tanım | Kural |
|---|---|---|
| **🚀 Launch Blocker** | Bu olmadan yayın YAPILAMAZ (mağaza reddi, yasal ihlal, ödeme/güvenlik açığı veya AI deneyiminin çökmesi). | V1'de kalır — zorunlu. |
| **📮 Post-Launch** | Değerli, ancak yayını bloke etmez. Lansmandan sonra artımlı güncellemelerle gelir. | V1'den çıkarılır, ertelenir. |
| **🔭 Future Vision (V2+)** | Uzun vadeli vizyon; çekirdek ürün kanıtlandıktan sonra. | V2+ backlog. |

**Bir madde ancak şu 7 boyuttan HİÇBİRİNİ etkilemiyorsa ertelenebilir:** App Store onayı · Google Play onayı · Güvenlik · Yasal uyumluluk · Kullanıcı güveni · Ödeme işlevselliği · AI beslenme deneyimi.

---

## 1. 🚀 LAUNCH BLOCKER — V1 Kapsamı (Zorunlu)

Aşağıdaki her özellik, yukarıdaki 7 boyuttan en az birini doğrudan etkilediği için V1'de KALIR. Her satırda "neden V1'de olduğu" belirtilmiştir.

### Faz A — Kimlik, Hesap Yaşam Döngüsü & Uyum Temeli

| # | Özellik | Neden V1'de (bloke ettiği boyut) |
|---|---|---|
| A1 | **Authentication** (User/RefreshToken, bcrypt, JWT access+refresh, auth middleware, refresh rotation + reuse detection) | Güvenlik + tüm korumalı özelliklerin ön koşulu. Bu olmadan hiçbir kullanıcı verisi işlenemez. **← Sprint 8** |
| A2 | **Auth'a özel rate limiting + brute-force koruması** | Güvenlik: credential stuffing → hesap ele geçirme → sağlık verisi maruziyeti. |
| A3 | **Zorunlu Onboarding + Profil** (11 alan: Ad Soyad, Yaş, Cinsiyet, Boy, Kilo, Hedef Kilo, Aktivite, Sağlık Durumu, Alerjiler, Diyet Tercihi, Günlük Su Hedefi) | AI beslenme deneyimi: kişiselleştirme bu verilere bağlı. Onboarding tamamlanmadan uygulamaya erişim yok. |
| A4 | **Şifre Sıfırlama + E-posta Doğrulama (backend)** + **işlemsel e-posta servisi** | Kullanıcı güveni: hesap kurtarma olmadan kilitlenen kullanıcı = churn + destek yükü. |
| A5 | **Hesap Silme (uygulama içi)** | App Store 5.1.1(v) **kesin ret sebebi** + Google Play + KVKK m.7. |
| A6 | **Veri Dışa Aktarma (export)** | Yasal: KVKK m.11 / GDPR Art.20 veri sahibi hakkı. |

### Faz B — Yasal / Uyumluluk (Sağlık verisi ⇒ pazarlık dışı)

| # | Özellik | Neden V1'de |
|---|---|---|
| B1 | **Gizlilik Politikası + Aydınlatma Metni** (uygulama içi erişilebilir) | App Store 5.1.1 & Play Data Safety zorunlu URL; KVKK m.10. |
| B2 | **Kullanım Koşulları / Mesafeli Satış Sözleşmesi** | Abonelik satışı ⇒ 6502 sayılı Kanun; mağaza EULA beklentisi. |
| B3 | **Tıbbi Sorumluluk Reddi (Medical Disclaimer)** — tüm AI/sağlık çıktılarında | App Store 1.4.1; tıbbi sorumluluk hukuku. Kan tahlili yorumu ⇒ zorunlu. |
| B4 | **KVKK Açık Rıza & Consent Management** (versiyonlama + geri çekme) | Sağlık verisi = özel nitelikli veri (KVKK m.6). Rıza olmadan kan tahlili özelliği yasal olarak açılamaz. |
| B5 | **Age Gate (yaş sınırı)** | App Store Age Rating + Play Families; onboarding'de yaş zaten toplanıyor. |
| B6 | **Data Safety / Privacy Nutrition Labels** (mağaza formları) | Yanlış/eksik beyan = ret. |

### Faz C — Çekirdek Ürün (AI Beslenme Deneyimi)

| # | Özellik | Neden V1'de |
|---|---|---|
| C1 | **Domain persistence**: Dashboard, Meal tracking (mock → kalıcı backend API + DB) | Ürün çekirdeği: veriler kalıcı olmadan uygulama işlevsel değil. |
| C2 | **AI Dietitian Chat** (mock → gerçek orchestrator, PHI minimization AD-039) | Çekirdek değer önerisi. |
| C3 | **Kan Tahlili PDF/Görsel Analizi** (OCR + değerlendirme, disclaimer'lı, at-rest şifreli) | Ürünün ana farklılaştırıcısı; PDF + yüksek kaliteli görsel kabul eder. |
| C4 | **Kişiselleştirilmiş 30/60 günlük beslenme planı** | Kan tahlili + profile dayalı ana çıktı. |
| C5 | **AI kullanım kotası + maliyet koruması** (plan başına) | Ödeme/iş modeli bütünlüğü + maliyet patlaması koruması. |

### Faz D — Abonelik & Ödeme

| # | Özellik | Neden V1'de |
|---|---|---|
| D1 | **Abonelik sistemi**: Free / Premium / Premium Plus + entitlement/feature gating | İş modeli — V1 için zorunlu (kullanıcı talebi). |
| D2 | **iyzico entegrasyonu** (modüler ödeme katmanı — ek sağlayıcı sonradan eklenebilir) + **webhook imza doğrulama + idempotency** | Ödeme işlevselliği; doğrulanmamış webhook = bedava premium riski. |
| D3 | **Abonelik yönetimi** (görüntüle / iptal / yükselt-düşür) | App Store 3.1.2 & Play; iptal edilemeyen abonelik = ret. |
| D4 | **Fatura/makbuz + KDV** & **ödeme geçmişi + audit log** | VUK/e-arşiv; uyuşmazlık/muhasebe. |
| D5 | **IAP vs. iyzico platform politikası kararı** | App Store 3.1.1 — iOS/Android dijital abonelikte kritik ön koşul (bkz. `V1_GAP_ANALYSIS.md` R-PAY-1). |

### Faz E — Güvenlik, Üretim & Yayına Hazırlık

| # | Özellik | Neden V1'de |
|---|---|---|
| E1 | **Prod TLS/HSTS/CSP/secure cookie/CORS whitelist** | KVKK m.12 + App Store ATS zorunlu HTTPS. |
| E2 | **PHI at-rest şifreleme + PHI minimization** | Sağlık verisi güvenliği; kan tahlili özelliğinin ön koşulu. |
| E3 | **Managed PostgreSQL + otomatik backup + restore testi** | Veri kaybı = geri dönüşü olmayan sağlık verisi kaybı. Mevcut DB kalıcı bile değil. |
| E4 | **Error tracking (Sentry) FE+BE + uptime monitoring + alerting** | Operasyonel körlük = sessiz ödeme/sağlık hataları. |
| E5 | **CI/CD + secrets management** | Güvenli tekrarlanabilir dağıtım; sırlar koddan ayrı. |
| E6 | **Kritik akış testleri** (auth / payment / health engine) | Regresyon koruması; sürekli deploy güvenliği. |
| E7 | **Global loading/error/empty + 401/402/429 ele alma** | App Store 2.1 "app completeness" — çöken/boş ekran = ret. |
| E8 | **Destek kanalı + destek URL'i** | App Store 1.5 + 6502 satıcı iletişimi zorunlu. |
| E9 | **Store metadata + content rating + assets** + **versiyonlama/force-update** | Yayın için zorunlu mağaza alanları. |

---

## 2. 📮 POST-LAUNCH — Ertelendi (V1'den çıkarıldı)

Aşağıdaki maddeler değerlidir ancak **7 kritik boyuttan hiçbirini bloke etmez**; lansman sonrası artımlı güncellemelerle gelecektir. Her biri için kısa erteleme gerekçesi verilmiştir.

| # | Özellik | Neden ERTELENDİ (bloke etmiyor) |
|---|---|---|
| P1 | Push Notification altyapısı | Retention kaldıracı, ancak yayını bloke etmez. Kullanıcılar push olmadan da tüm çekirdek akışları kullanabilir. Web + soft-launch ile başlanır. |
| P2 | Deep Linking / Universal Links | E-posta/ödeme dönüşleri web fallback URL ile çalışabilir; native derin bağlantı optimizasyonu sonra. |
| P3 | Uygulama içi değerlendirme (rating prompt) | ASO iyileştirmesi; onaya veya işlevselliğe etkisi yok. |
| P4 | İade/Refund otomasyonu & dunning/grace period | V1'de iade **manuel** operasyonla (iyzico paneli + audit log) karşılanır; otomasyon sonra. Ödeme işlevselliğini bloke etmez. |
| P5 | Ürün analitiği (funnel/retention) | Karar-destek; çekirdek deneyime etki etmez. Temel, KVKK-uyumlu event log ile başlanır. |
| P6 | i18n altyapısı (çoklu dil) | V1 tek dil (TR). String extraction sonra; yayını bloke etmez. |
| P7 | Erişilebilirlik (a11y) tam uyumu | Temel kontrast/focus V1'de; tam WCAG 2.1 AA denetimi post-launch. |
| P8 | FAQ / Yardım Merkezi | Destek e-postası (E8) V1 için yeterli; aranabilir yardım merkezi sonra. |
| P9 | Uygulama içi geri bildirim & hata bildirme | Destek kanalı (E8) bunu geçici olarak karşılar. |
| P10 | Admin panel | V1'de operasyon (iade, kullanıcı bakımı) güvenli script + DB erişimi ile; panel sonra. |
| P11 | Oturum/Cihaz yönetimi ekranı (aktif oturumları gör/sonlandır) | Refresh token rotation + reuse detection (A1/A2) güvenlik tabanını sağlar; kullanıcı-görünür cihaz ekranı sonra. |
| P12 | Çerez/tracking onay bandı & ATT | V1'de 3. parti reklam/takip **yok** ⇒ ATT/çerez onayı gerekmez. Takip eklenirse aktive edilir. |
| P13 | Veri saklama/imha otomasyon job'ları | Politika (B1) V1'de belgelenir; otomatik imha cron'u sonra. |
| P14 | Sosyal giriş (Google/Apple) | V1'de sosyal giriş yok ⇒ Apple Sign-In zorunluluğu (4.8) tetiklenmez. |

> **Not:** Bir Post-Launch maddesi lansman öncesi 7 boyuttan birini etkiler hale gelirse (örn. iOS'ta 3. parti takip eklenirse ATT), otomatik olarak Launch Blocker'a terfi eder.

---

## 3. 🔭 FUTURE VISION — V2+

| # | Özellik | Kategori |
|---|---|---|
| F1 | Referans / davet programı | Growth |
| F2 | Gamification (rozet, streak) | Engagement |
| F3 | Giyilebilir cihaz / HealthKit / Google Fit entegrasyonu | Data |
| F4 | RAG / Knowledge Base | AI |
| F5 | Çoklu dil içeriği (EN vb.) | i18n |
| F6 | A/B test / Experiment Management | Growth |
| F7 | Multi-tenant / Organization | Platform |
| F8 | Web push | Notifications |
| F9 | Ek ödeme sağlayıcıları (Stripe vb. — modüler katman sayesinde) | Payments |

---

## 4. Sprint Planı (Launch Blocker kapsamı)

> Sprint 1–7 tamamlandı (Foundation + Frontend MVP + Backend Foundation). Aşağısı V1 kritik yolu.

| Sprint | Odak | Kapsam |
|---|---|---|
| **8** | **Authentication** ✅ *(bu sprint)* | A1, A2 — backend auth altyapısı |
| 9 | Hesap yaşam döngüsü + e-posta | A4, A5, A6 |
| 10 | Consent & yasal temel | B1–B6, E8 |
| 11 | Profil & zorunlu onboarding + domain persistence | A3, C1 |
| 12 | Güvenlik (veri) | E1, E2 |
| 13 | AI orchestrator + PHI minimization | C2, C5 |
| 14 | Sağlık motoru | C3, C4 |
| 15 | Ödeme (1): abonelik & iyzico | D1, D2, D3, D5 |
| 16 | Ödeme (2): fatura, geçmiş, audit | D4 |
| 17 | Gözlemlenebilirlik & ops | E3, E4, E5 |
| 18 | Kalite & UX & test | E6, E7 |
| 19 | Mağaza hazırlık | E9 |
| 20 | Uyum sign-off & launch | Pre-launch checklist → soft launch → GA |

**Tahmini V1 süresi (Sprint 8→20):** ~13–15 hafta (paralel iş ile sıkışabilir).
**Kritik yol:** Auth → Consent/Legal → Health Engine → Payments → Observability → Store Readiness.

---

### Faz–Sprint Eşlemesi (özet)

| Faz | Sprintler | Durum |
|---|---|---|
| Foundation + Frontend MVP | 1–6 | ✅ Completed |
| Backend Foundation | 7 | ✅ Completed |
| Auth & Compliance | 8–11 | 🚧 In Progress (Sprint 8) |
| AI, Health & Payments | 12–16 | ⏳ Pending |
| Production Hardening & Launch | 17–20 | ⏳ Pending |

> Bu belge canlıdır. Her sprint sonunda güncellenir; bir Post-Launch maddesi kritikleşirse Launch Blocker'a terfi ettirilir.
