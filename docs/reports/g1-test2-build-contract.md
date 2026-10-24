# G1 Devam 6 — doğrulanmış kaynağın mevcut derleme tanımına bağlanması

Kimlik: 🛠️ Uygulama Çalışanı 12. Yönetici: 👑 Uygulama Yönetici 7.
[Talimat](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/103#issuecomment-6390638485).

Bu çalışma yalnız kaynak düzeyi hazırlık ve çevrimdışı sözleşme testidir.
Cloud Build gönderilmez; Docker/imaj, aday, sunucu, gerçek DB/migration veya
APK işlemi yapılmaz. Kod incelemesi/yönetici kabulü yayın yetkisi değildir.

## Sorun ve en küçük uyarlama

Mevcut `backend-test2-buildonly.yaml`, verilen kaynak kaydının bütün backend
klasörünü derliyordu. Güncel test dalı Admin dahil ek ürün kodları içerdiğinden
bu dizin PR #112'nin kabul edilmiş 13 dosyalık bileşimiyle aynı değildir.

**Aynı derleme tanımı** korunur. Git kaynak adımından sonra yeni dar giriş
kontrolü, **mevcut ve değiştirilmeyen** `test2-security-source.py` oluşturucusunu
kullanır. İkinci kaynak oluşturucu veya yayın yolu yoktur. Docker adımı yalnız
kontrol başarılıysa `/workspace/g1-composed/backend` dizinini kullanabilir.
`/workspace/repo/backend` geri dönüşü/alternatifi yoktur.

Eski oluşturucu, test aracı, 13 nesne, kaynak politikası, manifest v3, paket
kilidi, dört güvenlik sürümü ve 16 maskot kodu **değişmez**. Yeni kontrol
oluşturucuyu içe aktarmadan önce kabul edilmiş SHA-256 içeriğini doğrular;
sonra kaynak üretimini ve tam envanter doğrulamasını ona devreder. Uygulama
bağımlılığı kurulmaz, uygulama derlenmez veya veritabanı açılmaz.

## Ayrı ve zorunlu kimlikler

| Derleme girdisi | Zorunlu sözleşme |
| --- | --- |
| `_GIT_SHA` | Yeni kontrolü/tanımı içeren, yönetici tarafından ayrıca kabul edilecek **tam değişmez derleme-tanımı kaydı**; HEAD/dal/latest değil |
| `_SOURCE_HARNESS_SHA` | `32552327e2d008db5234cfebc3a8c0da9f578e40` |
| `_SOURCE_MANIFEST_SHA256` | `7679ceb6f463d439a0626bcbd8ddb2a505b45b8b5ea3218a7c10e769f63bdf7d` |
| `_BACKEND_TREE` | `35f9f5b81cf3dd3903e7286e24bf296da7955e89` |
| `_LOCK_SHA256` | `e0edffd8038b97502c8e4a080f9980b9bea49e856719111d2bb7ee615614ce55` |
| `_IMAGE` | Yalnız mevcut staging registry/backend altında `g1-composed-<tam _GIT_SHA>` adı; bu aşamada **yalnız isimdir** |

Kaynak politikası `ece1e8077abaa1dbabf50067a6a315ac8099d445026d8b69b7ae074d228b55f4`;
oluşturucu SHA-256 `1fbb0bd905e5d4f3f4a45fa7bd67867eb061dda5df7892af4dbff9e78605ec8b`.
Kaynak baz/güvenlik/koleksiyon kayıtları önceki manifestte kalır. Bu girdiler için
varsayılan/değişken dal/otomatik yeni manifest özeti kabulü yoktur. Yanlış veya
eksik değerler Docker adımından önce durur. Kabul edilmiş manifestin kendisini
veya hash'ini birlikte değiştirmek de sabit sözleşmeyi geçemez.

Derleme tanımı ref'i gerçek checkout HEAD'iyle eşit olmalı; kontrol betiği ve
YAML çalışma dosyaları seçilen kayıttaki bayt/mod ile eşleşmelidir. Çalışan kontrol
farklı repo dosyası gibi gösterilemez. Dışarıdan verilen yeni tam SHA tek başına
yönetici onayı üretmez: gerçek derleme tanımı ve yürütücü imajlar ayrıca güvenilir
olmalı ve gözden geçirilmelidir. Gönderilecek Cloud Build tanımının da aynı
onaylı kayıttan alınması gelecekteki operatörün zorunlu önkoşuludur.

## Fail-closed sırası

1. Git ref'i ortam değişkeni üzerinden alınır; kabuk metnine enjekte edilmez.
   Kırk küçük onaltılık karakter zorunludur. Git nesneleri shallow (eksik geçmiş)
   olmadan getirilir; HEAD verilen ref'e eşit olmalıdır.
2. Python+Git içeren kontrol adımı mevcut oluşturucu baytlarını **çalıştırmadan
   önce** doğrular. `python:3.12-bookworm` seçimi resmi kaynak zincirinde
   buildpack-deps:bookworm → bookworm-scm → Git bağımlılığına dayanır; bu görevde
   yürütücü imaj çekilmedi veya çalıştırılmadı.
3. Bileşik kaynak yeni, repo dışındaki dizine çıkarılır. Kabul edilmiş manifest
   özeti, backend ağacı, kaynak politikası, araç ref'i ve gerçek kilit dosyası
   özeti eşleşmelidir. Bütün kaynakların bayt/mod/envanteri tekrar doğrulanır;
   `--installed` istisnası yoktur. Değişmiş kaynak, ek node_modules, mod veya
   symlink (sembolik bağlantı) kabul edilmez.
4. Docker adımı açık `waitFor` bağımlılığıyla yalnız doğrulanmış kaynak adımından
   sonra çalışabilir. Hata yok sayma, gevşek substitution veya ham backend'e
   otomatik dönüş yoktur. Bu adım **bu görevde hiç çalıştırılmadı**.
5. Gelecekteki imaj etiketleri kaynak türünü `composed`, derleme tanımı ref'ini,
   kabul edilmiş kaynak aracı ref'ini, manifest/backend/kilit kimliklerini ayrı
   kaydeder. Bileşim tam güncel ürün SHA'sıyla aynıymış gibi
   `DIEWISH_APPLICATION_SHA` basılmaz. Bu metadata imaj/paket attestasyonu yerine
   geçmez; gerçek imaj özeti ve kurulu paketler sonraki ayrı aşamada kanıtlanır.

## Otomatik tetikleyici incelemesi

- **Mevcut hiçbir yayın iş akışı değiştirilmez.** Özellikle
  `staging-test2-backend-notraffic.yml`, `mascot-test2-release.yml`,
  `staging-preview.yml` ve frontend yayın iş akışı aynıdır.
- Eski no-traffic akışı yalnız kendi workflow dosyasının staging push farkıyla
  tetiklenir; bu dosya değiştirilmez. Genel/maskot akışları ayrı staging ref'i ve
  yayın işaretleri ister; bu çalışma staging'e push/merge etmez ve yayın işareti
  kullanmaz. Hiçbir workflow_dispatch/yeniden çalıştırma yapılmaz.
- Eski kaynak CI'sının path listesi bu beş yeni hazırlık yoluyla kesişmez;
  önceki 20/37 ve DB testleri tekrar tetiklenmez. Güvenlik/Notification veya genel
  yayın kapıları değiştirilmez ve bu yeni kontrol onların yerine geçmez.
- Yeni **tek salt-okunur PR kontrolü**, yalnız bu dosyalarda çalışır. İzni
  `contents: read`; bulut kimliği, service/DB, secret, Docker, npm/Prisma veya
  uygulama derlemesi yoktur. Yalnız sabit PyYAML test ayrıştırıcısı kurulup yeni
  çevrimdışı sözleşme testleri çalıştırılır. Test işlemleri ağ/bulut komutu çağırmaz.
- Mevcut iki APP10 PR akışı genel PR olayında görünür fakat farklı head_ref
  koşulları nedeniyle bu dalın işleri atlanır.

**Eski çağıranlar bilinçli olarak uyumlu kabul edilmez.** Yalnız `_GIT_SHA` ve
`_IMAGE` veren eski yayın betikleri zorunlu kaynak kanıtlarını sağlamaz;
Cloud Build girdi denetiminde veya kontrol adımında durur. Bunları eski
canlı diewish-test2 etiketi/aday hazırlığıyla beraber çalıştırmak yasaktır.
Bu PR eski otomasyonun çağrılarını değiştirmez veya onu yayınlanabilir yapmaz.

## Yeni çevrimdışı doğrulamalar

Kabul edilmiş bileşim yeni giriş sözleşmesiyle yalnız bir kez üretilir;
önceki güvenlik/maskot/DB test paketleri yeniden çalıştırılmaz. Yeni testler:
manifest/lock/backend kaynağı, yanlış veya kendi özeti yeniden hesaplanan manifest,
ham güncel Admin backend'i, ref/image hedefi, oluşturucunun içe aktarma öncesi
bütünlüğü, çalışma tanımı/mod, ek üretilmiş dosyalar/sembolik bağlantılar;
YAML adım sırası/bağlam/metadata/katı girdiler ve kötü ref'in Git çağrısından önce
reddi. Sözleşme sırasında yalnız yerel Git nesne işlemlerine izin veren test
kısıtı vardır; Git ağ komutları, Docker, gcloud, DB ve paket kurulum çağrıları yoktur.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/test2-security-build-context.test.py
```

## Sonraki ayrı kapılar ve bilinmeyenler

Kaynak statik uyumu gerçek Cloud Build denemesi veya imaj güvenliği değildir.
Gelecekte ayrı açık yönetici/kullanıcı kararı; aynı onaylı derleme tanımı ve
araç imajlarının kimliği, gerçek imaj özeti/kurulu dört sürüm, migration
çalıştırmayan `npm start`, yeni kullanılmayan aday etiketi, güncel salt-okunur
Admin/default/Test2/frontend kayıtları ve gerçek Test2 şema uyumu gereklidir.
Dockerfile'ın kabul edilmiş `start:migrate` varsayılanı burada değiştirilmez
ve çalıştırılmaz. Gerçek DB bilinmez; 52/52 veya tam16CHECK PASS denmez.

M1 PR #113'ün test hesabı temizliği hazırlanmış/birleştirilmiş olsa da eski
`mascot-candidate` hedefiyle mevcut yayın akışı hâlâ kapalıdır. Canlı 16/16 kabul
ancak güvenli koordineli yayın sonrasındadır. Eski güvenlik açığı taşıyan imaj
veya iki maskotlu sunucu güvenli geri dönüş kabulü sağlamaz. Admin/production,
Neon, secrets/IAM, zamanlayıcı, gerçek kullanıcı verileri ve APK kapsam dışıdır.

Referanslar: [G1 Devam5 kaynak kabulü](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/103#issuecomment-6388352556),
[M1 son kaynak kabulü](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/78#issuecomment-6389435872),
[Cloud Build substitution kuralları](https://docs.cloud.google.com/build/docs/configuring-builds/substitute-variable-values),
[resmi Python yürütücü kaynağı](https://github.com/docker-library/python/blob/master/3.12/bookworm/Dockerfile),
[resmi Git bağımlılığı](https://github.com/docker-library/buildpack-deps/blob/master/debian/bookworm/scm/Dockerfile).
