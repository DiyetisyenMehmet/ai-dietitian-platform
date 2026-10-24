# G1 Devam 3 — Test2 güvenlik kaynak bileşimi

Kimlik: 🛠️ Uygulama Çalışanı 12. Yönetici: 👑 Uygulama Yönetici 7.
Talimat: https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/103#issuecomment-6382986891

Bu hazırlık yalnız backend kaynak dosyaları ve test kanıtı üretir. Docker/Cloud Run
imajı, deploy edilebilir artifact veya yayın yetkisi üretmez. Normal staging ürün
kaynakları değiştirilmez; G1 ve canlı Test2/Journey Web yayını ayrıca değerlendirilir.

## Sabit kaynak kimlikleri

- Eski normal Test2 bazı: `09a069f3271d60716efd997ad86bb05018e4d0d9`.
- Kabul edilmiş güvenlik kaynağı: `7a437ca4c04f61d39696c467738fa01a2e127616`
  (PR #105, #107 ve #109 staging kaynak kabul zinciri).
- Bileşik Git root tree: `f6a2e1665cb225f60e1bc8ec889307f11388eaaf`.
- Gerçekte dışarı alınan **backend tree**: `40011ddd081c88d407a52f31e9c210d5850af811`.
- Lockfile SHA-256: `e0edffd8038b97502c8e4a080f9980b9bea49e856719111d2bb7ee615614ce55`.
- Bunlar commit/imaj digest'i veya imzalı attestasyon değildir. Test harness commit'i
  PR HEAD'dir; uygulama kaynağı diye o SHA'yı tek başına kullanmak yanlıştır.

`scripts/test2-security-source.py` yalnız kabul edilmiş 8 blob'u eski bazın geçici
Git index'ine uygular. Kendi index'i/HEAD'i değiştirmez; repository dışındaki boş
bir dizine yalnız backend'i çıkarır. Tam Git blob/mode envanteriyle arşiv eşitliği,
izinli diff, manifest/lock uyumu, dört sürüm ve hazırlık HEAD'inin sadece bu PR'ın
hazırlık dosyalarını içerdiği doğrulanır. Eksik nesne, farklı blob, fazladan dosya,
symlink, değişmiş mode/içerik veya ürün drift'i NO_GO verir. Mevcut çıktı ezilmez.

İzinli dosyalar ve Git blob SHA'ları scriptte `PINS` içinde sabittir:
`package.json`, `package-lock.json`, `validate.ts`, `error-handler.ts`,
`zod-security.test.ts`, `body-parser-security.test.mjs`, `upload-security.test.ts`,
`mailer.test.ts` (hepsi backend altındadır). İlk altı dosyalık G1 incelemesine yalnız
kabul edilmiş iki test dosyası eklenmiştir; mevcut kod/testler yeniden yazılmaz.

Üretilen `source-manifest.json`: base/security/test-harness SHA'ları, root/backend/
Prisma tree kimlikleri, izinli blob'lar, dışarıda bırakılan farklar ve tüm backend
kaynak dosyalarının SHA-256/mode envanterini içerir. Zaman damgası yoktur; aynı
harness commit'i ve sabit Git nesneleri için byte düzeyinde tekrar üretilebilirdir.
Manifest SHA-256 değeri CLI kanıt çıktısında verilir.

## Bağımlılıklar ve dışarıda kalanlar

| Paket | Eski baz | Bileşik kaynak |
| --- | --- | --- |
| Zod | 3.24.1 | 4.6.6 |
| body-parser | 1.20.6 | 1.20.9 |
| multer | 2.4.0 | 2.5.0 |
| nodemailer | 10.1.2 | 10.1.4 |

Prisma schema/migration ağacı, account/mascot ürün kodu ve diğer backend dosyaları
eski bazla aynıdır. Yeni Dost/16 maskot CHECK migration'ları, account enum/repository
ve ilgili güncel mascot/migration-check test değişiklikleri alınmaz. Bu kaynak
farkının kanıtıdır; gerçek Test2 DB şeması veya veri uyumu doğrulanmış değildir.
Dockerfile eski bazdaki `start:migrate` varsayılanını içerir; burada çalıştırılmaz.

## Tekrar üretme ve bağımsız testler

```sh
python3 scripts/test2-security-source.test.py
python3 scripts/test2-security-source.py prepare --source /tmp/g1-composed-source
python3 scripts/test2-security-source.py verify --source /tmp/g1-composed-source
```

Çıktı yolu mevcut olmamalı ve repository dışında olmalıdır. Kurulum/derleme
sonrasındaki `verify --installed` yalnız node_modules/dist/tsbuildinfo üretimlerini
dışarıda tutar; manifest/lock ve bütün kaynak dosyaları yeniden doğrulanır.

`G1 Test2 composed source checks` yalnız bu hazırlık dosyalarına ait staging PR'ında
çalışır; push/dispatch/deploy tetikleyicisi yoktur. Her iş raw PR HEAD'i checkout
eder. Prepare işi manifest ve **yalnız lockfile** içeren bir CI kanıt artifact'i
üretir; application bundle, Docker imajı veya registry paketi yüklenmez. Mevcut OSV
reusable action v2.6.0 bu ayrı artifact'in lockfile'ını `fail-on-vuln: true` ile
okur. Test işi bileşimi bağımsız üretip manifest ve lockfile byte eşitliğini
scanner girdisiyle karşılaştırır. Eski staging/PR CI sonuçları kullanılmaz.

Testler: bileşik kaynakta tip kontrolü/TypeScript build, Zod sağlık/422/413,
gzip/raw-body, upload/MIME/boyut, mailer/alıcı ve barkod testleri; bağımsız compiled
JWT/cookie/bozuk kan tahlili reddi harness'i; ardından eski migration ağacıyla sadece
runner'ın sentetik PostgreSQL'inde login/refresh/logout/identity ve sağlık sahipliği.
`guard-ci-db` yalnız `127.0.0.1:5432/g1_test2_source` ve sabit sentetik kullanıcıya
izin verir. CI DB migration'ları gerçek Neon/Test2 migration'ı değildir. Gerçek DB,
SMTP, sağlık verisi, GCP kimliği veya IAM/secrets kullanılmaz. Eski frontend testleri
bu workflow'a taşınmaz ve global Hardening/Config/Notification kapıları gevşetilmez.

## Gelecekteki başlangıç ve yayın sınırları — yalnız plan

`validate_future_start` saf offline kontroldür: yalnız `['npm', 'start']` kabul eder;
varsayılan/migration/shell komutları, canlı `diewish-test2`/`admin-legacy`, kullanılan
herhangi bir tag ve servis+tag uzunluk ihlali reddedilir. Bu bir deploy fonksiyonu
veya yayın onayı değildir; hiçbir gcloud/Docker/HTTP komutu çalıştırmaz.

Ayrı yönetici kararı verilirse mevcut build-only/no-traffic yöntemi şu kapılarla
incelenmeli; bu PR o workflow'ları değiştirmez veya tetiklemez:

1. Kaynak manifesti ve test kanıtı aynı backend tree'ye bağlı olmalı. Dockerfile'ın
   hareketli `node:20-alpine` etiketi kaynak deterministikliğini imaj deterministikliği
   yapmaz; gerçek base/runtime imajı, kurulu paketler ve immutable image@sha256
   ayrıca doğrulanmalı. Source manifesti imaja yanlış staging SHA'sı diye basılmamalı.
2. `--no-traffic --tag diewish-test2` canlı kullanıcı etiketini taşır; kullanılmamalı.
   Kullanılmayan ayrı bir aday tag ve default trafik %0 gerekir. Böyle bir aday bu
   görevde oluşturulmaz. `npm start` override'ı ve DB migration çağrısının yokluğu
   readback/test kanıtı olmadan `migration-free` kabul edilemez.
3. Dağıtımdan önce gerçek güncel read-only snapshot: Admin/default/frontend ve diğer
   tag/revizyon/digest haritası, ayrı DB secret referansları, Test2 dört false bayrağı
   ve PAUSED scheduler. Drift, yetki eksikliği veya belirsiz source -> NO_GO.
4. Başarısızlıkta yalnız Test2 tag'i o snapshot'ın önceki revizyon/digest'ine dönebilir;
   Admin/default, frontend, yabancı tag'ler veya eşzamanlı başka değişiklikler ezilemez.
   Eski açık paketli revizyona dönüş kesintiyi sınırlar; güvenlik GO sağlamaz. DB
   sözleşmesi değişirse rollback güvenli varsayılamaz.

Son bilinen runtime kanıtı 24 Ekim 00:30 TRT'dir:
https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39578916938/job/120666149363
Test2 `00481-biq / diewish-test2`, Admin `00479-w44 / admin-legacy`, frontend
`00245-pim`. Bu tarihsel kayıttır; anlık servis durumu veya imaj içi paket ispatı
olarak sunulmaz. Canlı sunucu bu hazırlıkla güncellenmez.

G1 kapanmaz. Bağımsız frontend browser FAIL ve exact staging Notification eksikliği
ayrıca raporlanır. Journey Web için ileride yeni exact SHA'da 5/5 Hardening + Config
+ Notification zorunluluğu sürer. Eski frontend release guard baseline'ı değişmez.
CI sonuçları/PR HEAD ve yönetici inceleme kararı #103'teki tek nihai raporda verilir.
