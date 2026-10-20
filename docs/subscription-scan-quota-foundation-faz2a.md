# FAZ 2A — fotoğraf ve barkod kullanım hakkı temeli

Görev: [#86](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/86).
Kaynak staging (test ortamı) HEAD (son kayıt): `6729a834809698fabf5ab341b9f5d2c608e2094e`;
TREE (dosya ağacı): `b0d832d28e8b84955757d6dc51be2be6b588d871`.

## Kapsam ve kapalı davranış

Bu aşama mevcut `ai-usage` modülünü genişletir. İkinci abonelik çözümleyicisi, ödeme, ürün ekranı, HTTP yolu, sağlayıcı çağrısı, zamanlayıcı veya arka plan sorgulama döngüsü eklenmez. Mevcut fotoğraf/barkod/kan/plan/bildirim yollarına yeni kota bağlanmaz. FAZ 2B için ayrıca yönetici onayı gerekir.

`SCAN_QUOTA_FOUNDATION_ENABLED` varsayılan `false` (kapalı). Açık yazılması tek başına yeterli değildir: `NODE_ENV=test`, `DIEWISH_ENVIRONMENT=test` ve yalnız döngüsel yerel adresteki `diewish_scan_quota_test` veritabanı gerekir. Production (gerçek ortam), staging, normal geliştirme ve uzak veritabanında temel kapalı kalır. Çalışırken ayrıca en az 32 karakterlik ayrı `SCAN_QUOTA_HASH_SECRET` gerekir; bu görev hiçbir canlı gizli değer oluşturmaz/değiştirmez. Test anahtarları gerçek hesap anahtarı değildir. Sonraki fazda geçiş, ortam ve anahtar yönetimi ayrıca tasarlanmalıdır.

Kapalı `getStatus` sıfır SQL (veritabanı sorgusu) ile `allowed:false`, `reason:SCAN_QUOTA_FOUNDATION_DISABLED`, bilinmeyen sayılara `null` döndürür. Yeni yazma metotları SQL'e geçmeden reddedilir. Bu yalnız yeni iç servisin durumudur; mevcut ürün/ücretli işlemler bu servise bağlanmadığı için engellenmez.

Koç'un Free ilk 7 gün 10/gün, sonra 5/gün ve 100/ay; Premium 20/400 ve Plus 50/1000 sınırları aynıdır. Kan/plan mevcut kotaları, fiyatlar, destek hakları, hesap kurtarma ve #77 duraklatması değiştirilmez.

## Tek başarı kaynağı ve şema farkı

Tam SQL dosyası: [20261020143000_scan_quota_foundation/migration.sql](../backend/prisma/migrations/20261020143000_scan_quota_foundation/migration.sql).

- `AiUsageFeature` için iki yeni tür: `PHOTO_SCAN`, `BARCODE_SCAN`.
- Mevcut `ai_usage_events` tablosuna isteğe bağlı, tekil `scanOperationId` ve ilişki eklenir. Başarılı tüketim yalnız bu mevcut olay tablosundan sayılır; geçmiş/rezervasyon sayısı başarı sayacı değildir.
- `scan_quota_operations`: hesap, özellik, HMAC (anahtarlı güvenli özet), barkod konusu özeti, deneme kimliği, durum, süre sonu ve sonuç referansı. Ham görsel/barkod, sağlık sonucu ve ödeme anahtarı bu tabloya yazılmaz.
- `scan_quota_requests`: hesap+özellik+istek anahtarı tekilliği ve aynı barkodun farklı tekrar anahtarlarını tek işleme bağlama. Birleşik dış anahtar başka hesabın/özelliğin işlemine anahtar bağlanmasını veritabanında reddeder.
- Durumlar: `RESERVED` (ayrılmış), `SUCCEEDED` (başarılı), `FAILED` (başarısız), `CANCELED` (iptal), `EXPIRED` (süresi dolmuş).
- Hash/özellik/durum şekli kontrolleri ve aynı hesapta başarılı veya geçerli rezervasyondaki aynı barkodu tekilleştiren kısmi indeks SQL dosyasındadır. Prisma modeli kısmi indeksi temsil etmez; sonraki şema değişikliklerinde bu SQL koruması korunmalıdır.
- Mevcut kullanıcı/satın alma/geçmiş için veri güncellemesi, geriye dönük sayım veya hak aktarımı yok. Mevcut başarılı olaylar ve kullanıcı silme ilişkileri korunur.

Göç dosyası yalnız çalışma dalına eklendi. Canlı Neon/staging/production için çalıştırılmadı. İzole CI (otomatik doğrulama) işi tüm göçleri yalnız sentetik, yerel PostgreSQL 16 hizmetinde çalıştırır. Kaynak/canlı arasındaki önceki beş göç farkı #82 kapsamında çözülmeden yeni canlı göç/yayın yapılmaz.

Eski `/api/ai-usage` sözleşmesinin üç özelliği aynı kalır. Tür düzeyinde eski günlük/aylık kota tablosu yeni tarama türlerinden ayrıldı; Premium için sayı veya sınırsız erişim uydurulmadı. Mevcut ödeme okuma yardımcılarına yalnız isteğe bağlı işlem istemcisi eklendi; varsayılan eski istemci ve hak seçim kuralları değişmedi. Yeni servis aynı kanonik salt okunur çözümleyiciyi kendi kısa veritabanı işlemi içinde kullanır; kullanıcı seviye önbelleğini değiştirmez.

## FAZ 2B için iç servis sözleşmesi

Dosyalar: [politika](../backend/src/modules/ai-usage/scan-quota-policy.ts), [servis](../backend/src/modules/ai-usage/scan-quota.service.ts).

1. Maliyetli sağlayıcıya gitmeden `reserve(userId, input)` çağrılır. Fotoğrafta sunucuda doğrulanmış görsel baytları, barkodda mevcut `normalizeBarcode` kuralına uygun ürün kimliği verilir. `idempotencyKey` (aynı isteği bir kez işleme anahtarı) aynı mantıksal işlemde korunur.
2. Yeni işte `disposition:RESERVED` ve yalnız işi oluşturan sunucu çalışanına `attemptToken` (tamamlama anahtarı) verilir. Bu anahtar ürün arayüzüne veya kayıtlara yazılmamalı. Sağlayıcı çağrısı kısa veritabanı işlemi bittikten sonra yapılır.
3. Aynı işlem sürüyorsa `IN_PROGRESS` (işlem sürüyor), tamamlandıysa `REPLAY` (önceki sonucu kullan) döner. Bunlarda tamamlama anahtarı ve ikinci sağlayıcı izni yoktur. Barkod yeni tekrar anahtarıyla açıldığında da aynı işlem/sonuç kullanılır; tekrar anahtarı kaydedildiği için daha sonra farklı ürünle yeniden kullanılamaz.
4. `complete(userId, operationId, attemptToken, persistResult)` çağrısında `persistResult(tx, operationId)` yalnız verilmiş işlem istemcisiyle **doğrulanmış gerçek sonucu** mevcut sonuç deposuna yazar. Sonuç doğruluğu, sahipliği ve kullanılabilirliği ürün servisinin sorumluluğudur. Geri çağrı içinde sağlayıcı/ağ/uzun bekleme yoktur. Sonuç, mevcut tek kullanım olayı ve başarılı işlem durumu aynı anda kesinleşir veya birlikte geri alınır.
5. Sonuç referansı fotoğrafta `photo:<id>`, barkodda `barcode:<id>` biçiminde, içeriksiz bir depo işaretidir. Dışarıdan gelen keyfî bir işaret başarı kanıtı kabul edilmemeli. Gerçek FAZ 2B bağlayıcısı sonuç alanlarını doğrulamalı ve aynı `tx` ile yeni/uygun kayıt yazmalıdır. Boş sonuç kabul edilmez.
6. Sağlayıcı/ürün doğrulama hatası veya kesinleşmeden kabul edilen açık iptalde `release(..., FAILED|CANCELED)` çağrılır. Sonuç kaydı hatasında işlem geri alınır; ayırma kaydı tekrar denenebilir veya açıkça bırakılabilir. Veritabanı ulaşılamıyorsa sahte iade/success (başarı) bildirilmez; 5 dakikalık ayırma süresi yeni istekte değerlendirilir.
7. Bağlantı kaybı iptal değildir: `getOperation` veya aynı istek anahtarıyla durum eşleştirilir. Kesinleşmiş başarı tekrar tüketmez. Sonradan iptal kesinleşmiş hakkı geri vermez.
8. Süre dolunca yeni istek anahtarı gerekir; eski denemenin geç cevabı yeni işin hakkını tüketemez. Arka plan temizleyici veya düzenli SQL yok; süresi dolan ayırmalar istek üzerine ele alınır. Başarılı işlem/olaylar ömür boyu sayım için korunur. Kullanıcının geçmiş satırını silmesi hakkı yenilemez; FAZ 2B silinmiş sonucun tekrar okunmasında 404/uygun mesaj üretmeli, otomatik ücretsiz yeniden analiz yapmamalıdır.

Hesap+özellik için işlem kapsamlı PostgreSQL kilidi ve hesap satır kilidi kullanılır. Son hak iki ayrı bağlantı havuzuyla yarışta yalnız bir kez ayrılabilir. Başarı/iptal yarışında terminal durum korunur. Kilit sağlayıcı çağrısı sırasında tutulmaz; tamamlama geri çağrısı yalnız kısa sonuç yazımı içindir ve işlem süresi sınırlıdır.

Yeni `getStatus` cevabı: `feature`, `policyVersion`, `tier`, `limit`, `used`, `remaining`, `inFlight`, `allowed`, `reason`, `resetsAt`, `serverNow`. Free için `remaining=max(0,3-used)`; ayrılmış işler görünen hakkı düşürmez, fakat `used+inFlight>=3` ise yeni iş ayrılmaz. `resetsAt:null`: ömür boyu hak takvimle yenilenmez. Paid/Support (ücretli/destek) hesaplarında yeni politika tanımlanmadığından sayılar `null`, izin `false`, neden `SCAN_QUOTA_PAID_POLICY_UNDEFINED`; mevcut ücretli ürün davranışına uygulanmaz. Sonuç okumak ve yeni taramaya izin vermek farklıdır: üç barkod hakkı bitse bile kayıtlı ürün `REPLAY` ile açılabilir.

## Doğrulama kapsamı

- Yerel politika/kapalı mod testleri: [scan-quota-policy.test.ts](../backend/src/modules/ai-usage/scan-quota-policy.test.ts).
- Gerçek veritabanı testleri: [scan-quota-foundation.integration.test.ts](../backend/src/integration/scan-quota-foundation.integration.test.ts).
- Hedefli izole iş: [scan-quota-foundation.yml](../.github/workflows/scan-quota-foundation.yml); yalnız çalışma dalı, yerel sentetik PostgreSQL 16, bulut yetkisi/gizli değeri/yayın adımı yok.

Senaryolar: üç başarı/dördüncü ret; iki bağımsız istemcide son hak; çift istek ve tamamlama; aynı anahtar/farklı girdi; boş sonuç; başarısızlık/iptal; kullanım olayı yazıldıktan sonraki veritabanı hatasında sonuç+olay geri alma; süre dolumu ve geç cevap; aynı barkodun normalizasyonu/tekrar anahtarları/geçmişi; hesap/deneme kimliği izolasyonu; veritabanı tekilliği; ücretli/destek/Play/iyzico haklarını koruma; geçmiş silmede sayacın korunması; hesap silme ilişkileri; eski HTTP kullanım cevabının değişmemesi.

Yerel ortam yalnız 0 kimliğini eşleyebildiği ve kullanıcı/grup değiştiremediği için PostgreSQL'in ayrı kullanıcıyla yerel başlatılması engellendi; bu güvenlik kontrolü aşılmadı. Yerel politika/tür/lint (kod denetimi) ile izole GitHub PostgreSQL sonuçları ayrı raporlanır. Canlı Neon testi, gerçek sağlayıcı, ekran entegrasyonu veya cihaz kabulü yapılmış sayılmaz. Son teslimde başarı sayıları ve çalıştırma bağlantısı PR (inceleme isteği) açıklamasında verilir; başarısız test PASS yazılmaz.

## Kalan kararlar

Gerçek endpoint (işlem yolu) bağlama, eski hesapların geçiş kapsamı, eski taramaların aktarımı, ücretli tarama kotaları, sonuç/istek anahtarı saklama süresi, özel HMAC anahtarının ileride güvenli saklanması/yenilenmesi, barkod/etiket/yeniden hesaplama yan yolları ve gerçek kullanıcı mesajları FAZ 2B/3 kararlarıdır. Mevcut hesaplara kendiliğinden üç hak tanımlanmadı veya eski hak düşülmedi. Yönetici onayı olmadan sonraki faza geçilmez.
