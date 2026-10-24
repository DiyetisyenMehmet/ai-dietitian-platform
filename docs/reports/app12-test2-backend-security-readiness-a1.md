# Görev 1 — Test sunucusu güvenlik hazırlığı

Kimlik: 🛠️ Uygulama Çalışanı 12 · Yönetici: 👑 Uygulama Yönetici 7
Görev: TEST-SUNUCUSU-GÜVENLİK-HAZIRLIĞI
Teknik kod: APP-STAGING-TEST2-BACKEND-ZOD-ISOLATED-READINESS-A1
Karar: **Backend yayını ve Journey Web B2 NO-GO; canlı yayın %0.** Bu çalışma denetim ve hazırlıktır.

## Kaynak ve salt okunur kanıt

- [Yönetici talimatı](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/103#issuecomment-6374646749).
- İncelenen staging: `d1034c5277f695087b408bf76d0d393c9b750367`; PR #106 kaynakta birleşmiş. Aynı görev için açık PR bulunmadı.
- [24 Ekim 2026 00:29 TRT salt okunur kontrol](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39578916938/job/120666149363): SUCCESS. Bu, tarihsel denetim workflow'unun yalnız inspect işinin yeniden çalışmasıdır; checkout SHA'sı uygulama kaynağı veya yeni staging CI kanıtı değildir. Build/deploy/traffic adımı yoktur.

| Kullanım | Hizmet veren revizyon | Uygulama kaynak SHA | İmaj SHA-256 |
| --- | --- | --- | --- |
| Normal Test2, `diewish-test2` etiketi | `diewish-backend-staging-00481-biq` | `09a069f3271d60716efd997ad86bb05018e4d0d9` | `f4f2f9f47e336b9afdb9849c1be4866f46270d86ea5e369dbd1b6fd5b6e4b270` |
| Admin/default %100, `admin-legacy` | `diewish-backend-staging-00479-w44` | `d7ced3598a41db3bd1fb76320e0149e25b3ac0ed` | `5ecd7d50d2f662ca8342f797283d1e4dd5f9415b26a3769d99d865ab2dba6176` |
| Frontend %100, `next-sec` | `diewish-frontend-staging-00245-pim` | `1d809cfc164551e940c81a41af8fbfd7eb3d4cce` | `b2de3f9d240cc1adf41e211f974c0b636c7a0bd52fae545e821ebc5b232692d7` |

Backend latestReady `00483-veg` / `mascot-candidate` normal Test2 değildir. Varsayılan trafik yüzdesinin Test2 için sıfır olması, etiket URL'sinden kullanıcı gelmediği anlamına gelmez. Önceki yönetici kanıtıyla yönlendirme farkı yoktur.

[Eski build kaydı](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39585289571/job/119172562146), kaynak `09a069...`, build `ce08606f-0ffa-4227-9db6-cb25eb14d914`, SHA etiketli imaj ve `00481-biq` zincirini destekler. Mevcut build tanımı exact SHA checkout ve `npm ci` kullanır. [Eski backend lockfile](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/blob/09a069f3271d60716efd997ad86bb05018e4d0d9/backend/package-lock.json) Zod **3.24.1**, body-parser **1.20.6** içerir. Yeni staging Zod **4.6.6** içerir. Bu güçlü kaynak/provenance kanıtıdır; çalışan imajın paket dosyaları/binary'si doğrudan okunamadı. Canlı paket ölçümü **BLOCKED**, eski Test2'nin güvenli olduğu söylenemez.

## Yeni kaynak kapıları ve en küçük hazırlık düzeltmesi

Exact `d1034c...` için:

- [Config #40023400530](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/40023400530): **PASS**.
- [Hardening #40023400928](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/40023400928): **FAIL**; frontend, backend, Android native ve browser dört iş PASS; [OSV işi](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/40023400928/job/120653958306) FAIL.
- Notification preferences platform checks: bu SHA için çalışmamış / **BLOCKED**. Eski SHA PASS sonucu kullanılmadı; elle tetikleme veya bypass yapılmadı.

Yeni OSV engeli **GHSA-27r3-jxmh-p828 / CVE-2026-111181**: body-parser 1.20.6; 22 Ekim 2026 tarihli [üretici güvenlik duyurusu](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828) `<1.20.9` sürümlerini etkiler. Sıkıştırılmış istek sonrasında kalan baytlar süreç kesintisine yol açabilir. `inflate:false` mevcut sıkıştırılmış istek sözleşmesini değiştirir; kullanılmadı.

Bu PR yalnız npm tarafından üretilen backend lockfile'da **1.20.6 → 1.20.9** yamasını alır. Express 4.22.2'nin `~1.20.5` aralığı içindedir. Yeni paketin bildirdiği qs aralığı `~6.16.0`; mevcut override zaten `6.16.0` idi. Başka çözülmüş paket, manifest, API/auth/oturum/sağlık kodu, frontend veya migration değişmez. Yeni testler sentetik loopback istekleriyle gzip JSON/form, imza doğrulamasının gövde baytları, açılmış gövde 1 MiB sınırı ve gecikmiş artçı baytlardan sonra erişilebilirliği kontrol eder. Bu sentetik yük tek başına zafiyet dedektörü değildir; yamasız 1.20.6 da yerel Node 24 kontrolünde bu erişilebilirlik senaryosunu geçti. Yamalı sürüm zorunluluğunun kanıtı lockfile ve başarısızlığa kapalı OSV kapısıdır.

Mevcut Hardening workflow'una sadece bu çalışma dalı ve yeni yerel test adımı eklenir. Güvenlik kapısı/izinler gevşetilmez; yeni yayın sistemi kurulmaz. CI PostgreSQL'i geçici runner servisidir, Neon/Test2 değildir. Android APK paketleme yalnız açık workflow_dispatch seçeneğindedir; bu PR push'u APK üretmez. Eski başarılı kaynak testleri elle tekrarlanmaz; yeni bağımlılık SHA'sı mevcut CI tarafından denetlenir.

## Eski backend ile güncel backend farkı ve güvenli yol

[Kaynak karşılaştırması](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/compare/09a069f3271d60716efd997ad86bb05018e4d0d9...d1034c5277f695087b408bf76d0d393c9b750367): 56 commit, toplam 138 dosya; backend'de 11 dosya. `prisma/schema.prisma` aynı, ancak iki yeni SQL migration vardır:

- `20261020110000_dost_mascot_preference`: mevcut mascot CHECK kısıtına Dost ekler.
- `20261021001000_mascot_collection_preferences`: aynı kısıtı 16 maskota genişletir.

`account.schemas.ts` maskot enum'u genişler; repository tipi ve ilgili testler değişir. Tam güncel backend yeni değerleri kabul ederken eski DB kısıtı reddedebilir. Test2 migration geçmişi/kısıtları okunmadı; gerçek DB'ye bağlanılmadı. Dolayısıyla tam staging backend'in migrationsız uyumlu olduğu doğrulanmış değildir.

**Yöneticiye önerilen ayrı karar:** Eski normal Test2 backend bazını `09a069...` olarak sabitleyip kabul edilmiş PR #105'in yalnız Zod4 güvenlik/uyumluluk farkını (`backend/package*.json`, `middleware/validate.ts`, `middleware/error-handler.ts` ve güvenlik testleri) ve bu body-parser yamasını içeren ayrı, gözden geçirilebilir güvenlik kaynak bileşimi hazırlamak. Maskot/account özellikleri ve iki migration dışarıda tutulmalı. Kaynak bileşimi gerçek commit/tree, izinli dosya farkı ve tekrar üretilebilir manifest ile sabitlenmeli. Bu PR o backend adayını oluşturmaz veya dağıtmaz.

Bu dar kaynak yolu için yeni şema/migration ihtiyacı kaynak farkından görünmüyor; DB uyumu test ortamında kanıtlanmadan kesin migration-free onayı verilmez. Zod 4'ün sağlık/array sınırları, 422 alan hata zarfı, JSON/form 413 sınırı ve ham gövde doğrulaması korunmalı; auth, JWT/cookie ayarları, session store, hesap kimliği ve sahiplik kontrolleri değiştirilmemeli. Son bileşik kaynağın kendi auth/oturum/hesaplar arası ve sağlık doğrulama testleri geçmeli; bu PR'ın veya önceki SHA'nın testleri o adaya taşınmış kabul edilmemeli.

## Mevcut yayın yöntemindeki engeller

`.github/workflows/staging-test2-backend-notraffic.yml` salt okunur incelendi:

- Frontend `00239-gm2` beklentisi güncel `00245-pim` ile uyuşmuyor.
- GITHUB_SHA'dan tüm backend'i paketliyor; dar güvenlik bileşimi seçmiyor.
- `gcloud run deploy --no-traffic --tag diewish-test2` kullanıyor. **Canlı etiket yeniden bağlanır; `--no-traffic` normal kullanıcıları koruyan bir aday izolasyonu sağlamaz.**
- `npm start` ile migration çalıştırmama ve dört otomasyon bayrağını false tutma yaklaşımı korunabilir; fakat güvenli backend etiket rollback'i yok.

`staging-test2-safe-cutover.yml` tarihsel frontend host yönlendirme yayınıdır; backend güvenlik yayını değildir. Eski frontend rollback `00239-gm2` bugünkü geri dönüş hedefi olamaz. İki eski workflow da tetiklenmedi/değiştirilmedi; yalnız eski sabitleri yenilemek yeterli değildir.

Ayrı onaydan sonra mevcut yöntem daraltılacaksa: build-only mevcut altyapıda exact güvenlik commit'inden; yeni ve kullanılmayan aday etiketiyle (ör. `test2-zod-a1`, servis+etiket uzunluk sınırı korunarak), varsayılan trafik %0; **mevcut `diewish-test2` etiketine dokunmadan** hazırlanmalıdır. İmajın kaynağı/digest'i ve kurulu Zod4/body-parser yaması doğrudan doğrulanmalı. Bu aşamalar bugün yapılmadı ve yetkili değildir.

## Admin/Test2, veri sınırı ve geri dönüş

Salt okunur metadata: Admin DB referansı `diewish-staging-database-url:latest`, Test2 referansı `diewish-staging-test2-database-url:1`; farklıdır. Secret içerikleri okunmadı. Test2 secret metadata sorgusu **PERMISSION_DENIED**; secret yok sonucu değildir. Yetki/IAM değişikliği yapılmadı. Aynı Cloud Run hizmeti, runtime service account ve JWT secret referansları kullanılıyor; tam bağımsız altyapı/kimlik izolasyonu iddia edilmiyor. Uygulamanın mevcut hesap sahipliği kontrolleri zorunlu kalır.

Test2'de `COACH_SYNC_ENABLED`, `STAGING_AUTOMATION_ENABLED`, `SCHEDULER_TRIGGER_ENABLED`, `NUTRITION_JOBS_ENABLED` false; scheduler `diewish-notification-dispatch-staging` **PAUSED**. Admin varsayılan %100 + `admin-legacy`, frontend host routing ve frontend %100 korunmalı. Admin secret'ına, gerçek sağlık verisine, Neon DB'ye, IAM'e veya scheduler'a yazılmadı.

Gelecekte ayrıca onaylanacak yayından hemen önce güncel servis/etiket/revizyon/digest haritası yeniden salt okunur sabitlenmeli; beklenmeyen drift'te durulmalı. Promosyon sadece Test2 etiketi için olmalı; Admin/default ve diğer etiketler korunmalı. Başarısızlıkta Test2 etiketi bu snapshot'taki `00481-biq` / `f4f2...b270` hedefine geri alınmalı; frontend ve Admin trafiği değiştirilmemeli, eşzamanlı yabancı değişiklikler ezilmemeli. Bu eski hedef güvenlik açığı riskine geri döndürür: geri dönüş yalnız kesintiyi sınırlar, güvenlik GO sağlamaz. DB yazım/şema sözleşmesi değişirse rollback güvenli kabul edilemez; dar güvenlik kaynağı bu nedenle gereklidir.

## Yerel hedefli doğrulama

- Zod güvenlik sözleşmeleri 9/9 PASS: sağlık sınırları, bilinmeyen hesap alanlarının temizlenmesi, bildirim/Admin şema sınırları, auth politikası, 422 zarfı ve gerçek uygulamada JSON/form 1 MiB reddi.
- Yeni sıkıştırılmış parser sözleşmesi 1/1 PASS; yalnız sentetik loopback/child process, canlı sunucuya test yükü yok.
- Backend TypeScript kontrolü PASS; yeni test ESLint/Prettier PASS; dependency-lock üretimi `--ignore-scripts` ile; `npm audit --omit=dev` 0 bulgu PASS. npm audit, OSV veya tam imaj taramasının yerine geçmez.
- Yeni kaynak CI kanıtları PR açıklamasında verilir; yeni staging SHA için üç kapı ihtiyacı devam eder.

## Kalan engeller / yayın kararı

1. Güncel staging Hardening FAIL; bu PR yaması ve kendi CI sonucu yönetici incelemesi gerektirir. Merge sonrası üç kalite kapısı exact yeni staging SHA için yeniden değerlendirilmelidir.
2. `d1034c...` Notification kanıtı yok; yetkili ayrı karar gerekir.
3. Çalışan Test2 imaj paketleri doğrudan doğrulanamadı; kaynak zinciri eski güvenlik paketlerini gösterir. Canlı sunucu düzeltilmedi.
4. Security-only kaynak bileşimi, onun bağımsız testleri, migration uyumu ve mevcut yöntemin güvenli aday/rollback korumaları henüz yayın onayına hazır değildir.
5. Secret metadata yetki sınırı BLOCKED; herhangi bir izin değişikliği bu görev dışıdır.

**Karar: hazırlık PR'ı incelemeye sunulur; canlı backend ve Journey Web B2 NO-GO / %0.** Backend kaynak hazırlığı ve gelecekteki build/candidate/promosyon için yönetici ayrı karar vermelidir. Bu çalışmada merge, Cloud Build, aday revizyon, deploy, tag/traffic, production/main, Admin, DB/migration, IAM/secrets/scheduler veya APK işlemi yapılmadı.
