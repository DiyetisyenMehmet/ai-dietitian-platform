# G1 Devam 5 — güvenli 16 maskot kaynak bileşimi

Kimlik: 🛠️ Uygulama Çalışanı 12. Yönetici: 👑 Uygulama Yönetici 7.
[Talimat](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/103#issuecomment-6385835737).

Bu hazırlık yalnız mevcut oluşturucu, testleri ve CI (otomatik doğrulama) düzenini
uyarlar. İmaj, sunucu adayı veya yayın yetkisi üretmez. Gerçek Test2/Neon/Admin
veritabanı bağlantısı, migration (şema geçişi), bulut işlemi ve yayın yoktur.

## Sabit kaynaklar ve tam 13 dosyalık fark

- Baz: `09a069f3271d60716efd997ad86bb05018e4d0d9`.
- Kabul edilmiş güvenlik: `7a437ca4c04f61d39696c467738fa01a2e127616`.
- Kabul edilmiş koleksiyon: `39e315dada341ee64a96b92eb8e9a689a92c59ea`.
- Politika SHA-256: `ece1e8077abaa1dbabf50067a6a315ac8099d445026d8b69b7ae074d228b55f4`.
- Kilit dosyası SHA-256: `e0edffd8038b97502c8e4a080f9980b9bea49e856719111d2bb7ee615614ce55`.
- Zod **4.6.6**, body-parser **1.20.9**, multer **2.5.0**, nodemailer **10.1.4**.

PR #110'un sekiz güvenlik/test dosyası ve nesne kimlikleri aynen korunur:
`package.json`, `package-lock.json`, `validate.ts`, `error-handler.ts`,
`zod-security.test.ts`, `body-parser-security.test.mjs`, `upload-security.test.ts`,
`mailer.test.ts` (hepsi backend altında). Başka paket sürümü değişmez.

Bunlara yalnız yöneticinin belirttiği beş mevcut koleksiyon dosyası eklenir:

| Dosya (backend altında) | Git nesne kimliği |
| --- | --- |
| src/modules/account/account.schemas.ts | `3c4457ab3254347a062ab8a4a46480cb73a052fd` |
| src/modules/account/account.repository.ts | `78a69e0194634d1a6777e33168f744edeb244299` |
| src/integration/mascot-preferences.integration.test.ts | `1662caa99702b144caa8145d4edc07cabb8fbb07` |
| prisma/migrations/20261020110000_dost_mascot_preference/migration.sql | `e9ed2a842d0ab917ffd16ebbb627b23dc5bd1338` |
| prisma/migrations/20261021001000_mascot_collection_preferences/migration.sql | `b5f397097b89ea3e495e7d41a7bd3f651d794a5b` |

Oluşturucu, her dosyanın güvenlik kaynağındaki nesne kimliğini ve 100644 modunu;
beş maskot dosyasının koleksiyon kaynağındaki aynı kimlik/modunu doğrular.
Geçici Git index'inde yalnız 13 fark oluşabilir. Kaynak arşivi tüm Git
nesneleri/baytları/modlarıyla karşılaştırılır. Asıl index ve ürün dosyaları değişmez.
Prisma `schema.prisma`, account service/controller/routes, JWT, eski Admin kodu,
Dockerfile ve ilgisiz migration-check yardımcısı bazda kalır. PR #108'in yeni
Admin kodu bileşime alınmaz; normal test dalındaki Admin kaynakları değiştirilmez.

## Manifest v3 ve değişmez test aracı kimliği

Manifest v3; baz/güvenlik/koleksiyon kod kimlikleri, 13 dosya, beş maskot dosyasının
kaynağı, tam kaynak/backend/Prisma ağaçları, politika ve kilit dosyası özetlerini,
tüm kaynakların SHA-256/mod envanterini, açık test aracı kimliğini ve dört test
aracı dosyasının Git/SHA-256 kimliklerini içerir. Zaman damgası yoktur.

`--harness-ref <onaylanmış tam 40 haneli kod kimliği>` veya `G1_TEST_HARNESS_REF`
zorunludur; HEAD/dal/latest varsayılanı yoktur. Çalışan oluşturucu dahil dört araç
dosyası hem seçilen kod kaydına hem çalışma ağacına eşit olmalıdır. Kaynak
politikası, dosya/mod/envanter, araç değişikliği veya eksik nesnede kapalı kalır.
Sonraki ilgisiz ürün değişiklikleri aynı açık araç kimliğiyle aynı manifesti üretir.
Tüketici HEAD'i ayrı `executionCommit` olarak kaydedilir, manifesti değiştirmez.
Yeni bir ref seçmek yönetici onayını otomatik üretmez.

Önceki PR #110 iki-maskot kaynak/backend ağaçları ve manifest v2 kanıtları tarihsel
kalır. Yeni 16 maskotlu bileşimin ağacı ve manifest v3 özeti CLI/CI çıktısında
ayrı kaydedilir. Eski CI başarısı yeni bileşimin başarısı sayılmaz. Kaynak ağacı
veya test aracı kod kaydı, çalışan imaj özeti/kurulu paket kanıtı değildir.

```sh
export G1_TEST_HARNESS_REF=ONAYLANMIS_40_HANELI_KOD_KIMLIGI
python3 scripts/test2-security-source.test.py
python3 scripts/test2-security-source.py prepare --source /tmp/g1-composed-source
python3 scripts/test2-security-source.py verify --source /tmp/g1-composed-source
```

Çıktı mevcut olmamalı, repo dışında olmalıdır. `verify --installed` yalnız üretilen
node_modules/dist/tsbuildinfo yollarını dışarıda tutar; kaynak/manifest/kilit
bütünlüğünü yeniden doğrular. Kaynak/araç/politika negatif kontrolleri ve sonraki
ürün commit'leriyle manifest eşitliği sentetik geçici depoda sınanır.

## Aynı üç bağımsız CI işi

`G1 Test2 composed source checks` yalnız hazırlık dosyaları değişen staging PR'ında
çalışır. Push/dispatch/yayın tetikleyicisi veya bulut kimliği eklenmez.

1. **Prepare:** 13 dosya, değişmez kaynak/test aracı, envanter ve karşıt koruma
   testleri. Yalnız kilit dosyası + manifest kanıtı yüklenir, uygulama paketi yoktur.
2. **Security:** Mevcut Google OSV v2.6.0 aynı kanıtın ayrı kilit dosyasını tarar;
   `fail-on-vuln: true` korunur. Global güvenlik/bildirim/yayın kapıları değişmez.
3. **Composed backend:** Bağımsız tekrar üretim; manifest/kilit tarama girdisiyle
   bayt eşitliği; kurulumu migration olmadan yapma, tip kontrolü/derleme;
   Zod4/422/413, gzip/raw body, upload, mail alıcısı ve barkod sözleşmeleri;
   JWT/cookie/bozuk dosya; aşağıdaki CI şema geçişi ve mevcut hesap/sağlık
   sahipliği + 16/16 maskot entegrasyonu; sonunda kaynak envanterini doğrulama.

## Yalnız geçici PostgreSQL'de 50 → 52 ve zaten-52 durumu

Mevcut `test2-security-runtime.test.cjs` dosyasına eklenen şema testi, yalnız
`postgresql://diewish:diewish@127.0.0.1:5432/g1_test2_source?schema=public`
adresini ve test ortamını kabul eder. Gerçek DB hedefi veya canlı bağlantı değişkeni
kabul etmez. Veritabanı/rol kimliğini ve başlangıçta boş public şemasını doğrular.
Prisma CLI hedefi de aynı sabit geçici bağlantıya bağlanır.

1. Kaynak dosyalarını değiştirmeden geçici dizine 50 baz SQL'ini kopyalar ve uygular.
2. Sentetik iki kullanıcıda classic/mirmir tercihi, animasyon ve kart sırası ekler.
3. Yalnız iki mevcut kabul edilmiş SQL'i geçici fixture'a ekler. Geçiş geçmişinde
   sıra/küme, checksum (dosya özeti), başarılı bitiş ve geri alınmamışlık zorunludur.
4. 52'ye geçiş; doğru `public.dashboard_card_preferences` tablosundaki kısıtın
   türü, doğrulanmışlık bayrağı ve tam PostgreSQL CHECK ifadesi 16 kimlikle eşit
   olmalıdır. Yalnız birkaç kimliğin metinde bulunması yeterli sayılmaz.
5. Eski kayıtların kullanıcı, kimlik, animasyon, kart sırası ve zaman alanlarının
   değişmediğini karşılaştırır. Zaten-52 durumunda geçmişi/kısıtı okuyup **Prisma
   migrate deploy'u ikinci kez çağırmaz**; geçmiş ve tercihler de değişmemelidir.
6. Başarısız/geri alınmış/özet farkı/izinsiz/tekrarlı geçmiş ile doğrulanmamış,
   eksik/yabancı kimlikli veya ilave koşullu CHECK örneklerini sentetik kopyalarda
   reddeder. Reddedilen önkontrolde migration çağrısı yapılmaz.

Sonrasında mevcut maskot entegrasyon testi 16 kimliği gerçek geçici DB CHECK'i
üzerinden PATCH/GET ile sınar; ayrı oturum, farklı hesap izolasyonu, yetkisiz
okuma, yanlış kullanıcı alanı ve yanlış kimlik reddini içerir. Test temizliği
yalnız kendi sentetik CI kullanıcılarına aittir. Gerçek hesap silinmez.

## Gerçek Test2 için bilinmeyenler ve sonraki ayrı kabul

Son tarihsel [salt okunur bulut kaydı](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39578916938/job/120666149363)
24 Ekim 00:30 Türkiye saati: Test2 00481-biq, Admin 00479-w44, arayüz 00245-pim.
Bugünkü DB kısıtı/geçmişi veya imaj içi paketler bu görevde okunmadı.
Eski 16 maskotlu 00483-veg imajı güvenlik düzeltmelerinden önceki kaynağa bağlıdır;
güvenli sürüm yerine kullanılamaz. Canlı 16/16 M1 kabulü yayın sonrasında yapılır.

Ayrı yetki sonrası mevcut `mascot-test2-database.cjs` salt-okunur yolu;
tam Test2 kimliği/geçmiş özetlerine ek olarak doğru tablo/şema, tam 16 kimlikli
CHECK ve validated bayrağını doğrulayacak şekilde değerlendirilmeli. Şu an bu
canlı yardımcı değiştirilmez/çalıştırılmaz. Zaten 52 doğru geçiş varsa DB işlemi
atlanmalı; fark veya belirsizlikte durulmalıdır. Gerçek geçiş için ayrıca izin gerekir.

Mevcut build-only akış henüz bileşik manifest girdisini tüketmez. Gerçek imaj,
kurulu sürümler, yeni kullanılmayan aday etiketi ve `npm start` başlangıcı ayrıca
kabul edilmelidir. Dockerfile varsayılanı `start:migrate` kalır ve çalıştırılmaz.
`--no-traffic --tag diewish-test2` canlı etiketi taşır; yasaktır. Kullanımda olan
mascot-candidate/next-sec de yeni aday diye tekrar kullanılmamalıdır.

Geri dönüş yalnız güncel kayıttaki Test2 etiketi ve izinli arayüz trafiğini kapsar;
Admin/default/yabancı etiketler, DB referansları ve duraklatılmış zamanlayıcı
korunmalı. Geniş CHECK daraltılmaz, kayıtlar silinmez. Eski iki kimlikli veya açık
paketli sürüme dönüş güvenlik/M1 PASS değildir. Güvenli 16 kimlikli geri dönüş
hedefi henüz gerçek bulut kanıtına bağlı değildir.

Journey UI, marka/mascot varlıkları ve Next.js 15.5.28 değiştirilmez. Maskot
canlı kabul temizliği ayrı dalın/yöneticinin işidir; burada devralınmaz. Production,
Admin/Neon/Test2 DB, migration, Cloud Build/imaj/aday/etiket/trafik/host, IAM/secrets,
scheduler, canlı SMTP/sağlık verisi veya APK işlemi yoktur. Tek PR yönetici
incelemesine sunulur; birleştirme ve yayın yapılmaz. Ayrıntılı sonuç #103'e yazılır.
