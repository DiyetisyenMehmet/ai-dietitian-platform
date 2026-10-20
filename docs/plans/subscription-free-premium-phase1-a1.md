# APP-SUBSCRIPTION-FREE-PREMIUM-A1-FAZ1

20 Ekim 2026 | 🛠️ Diewish Uygulama Çalışan 8 | Yönetici: Diewish Uygulama Yöneticisi 5

**Karar: FAZ 1 kaynak analizi PASS (başarılı); yeni modelin uygulanması/yayını için onay verilmedi.** Yalnız bu belge değiştirildi. Yeni ürün kuralları henüz uygulanmış veya canlıda test edilmiş sayılmaz. Yönetici değerlendirmesinden önce FAZ 2'ye geçilmez.

## 1. Kaynak, kapsam ve doğrulama sınırı

- Ana görev: [#81](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/81). Güncel karar: [20 Ekim yönetici notu](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/81#issuecomment-6289491751). Bu not, eski açıklamadaki 72 saatten sonra bütün uygulamayı kapatma ve ödeme öncesi ek 7 günlük mağaza denemesini ilk sürüm için değiştirir.
- Çalışan görevi: [#84](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/84). Canlı kabul engelleri: [#82](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/82).
- İncelenen staging (test ortamı) dalı: `feature/staging-preview`.
- Kaynak HEAD (son kayıt): `6729a834809698fabf5ab341b9f5d2c608e2094e`.
- Kaynak TREE (dosya ağacının kimliği): `b0d832d28e8b84955757d6dc51be2be6b588d871`.
- Ayrı dokümantasyon dalı: `docs/app8-subscription-free-premium-phase1-a1`; uygulama dosyaları kaynak referansıyla aynı kalır.
- Canlı backend (sunucu uygulaması) için son doğrulanmış kaynak: `d7ced3598a41db3bd1fb76320e0149e25b3ac0ed`, TREE `7ac866992d661fb533b4e85e9a7615c5b0b7536d`, revision (yayın sürümü) `diewish-backend-staging-00479-w44`. Bu görevde canlı durum yeniden sorgulanmadı; kaynak ile canlı eşit kabul edilmedi.
- #77 kanıtı: [salt okunur son kontrol](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39406894114/job/118587601477), 20 Ekim 2026 10:50:54 UTC: `diewish-notification-dispatch-staging = PAUSED` (duraklatılmış). Uygulama içi otomasyon kapalıdır. Bu çalışma bunları değiştirmez.
- Ekli proje belgesinin üyelik bölümü tarihsel ürün vizyonu olarak incelendi. Oradaki sınırsız Premium/gelecek özellik anlatımı, #81'in güncel kontrollü kota kararının veya uygulanmış kodun yerine geçirilmedi.

Bu görevde production (gerçek kullanıcı ortamı), main (ana dal), canlı veritabanı, kullanıcı hakları, fiyatlar, mağaza ürünleri, zamanlayıcılar ve Android paketi değiştirilmedi. Veritabanı bağlantısı, migration (şema değişikliğinin uygulanması), satın alma, e-posta, yapay zekâ isteği veya yayın yapılmadı. Önceki başarılı test paketleri tekrar çalıştırılmadı.

## 2. Mevcut abonelik mimarisi: korunacak tek temel

1. [subscription-state.ts](../../backend/src/modules/payments/subscription-state.ts): geçerli Google Play kaydı, mevcut iyzico ücretli dönem kaydı ve Admin/Support (yönetici/destek) hakkından etkin seviye hesaplanır. Destek hakkı sağlayıcı kaydını değiştirmeden seviyeyi yükseltebilir. `users.subscriptionTier` türetilmiş önbellektir; tek başına ödeme kanıtı değildir. `readEffectiveSubscriptionState` salt okur; `resolveEffectiveSubscriptionTier` eski önbelleği ve süresi dolmuş iyzico durumunu düzeltebilir. Bu nedenle bu analizde servisler çalıştırılmadı.
2. [entitlements.ts](../../backend/src/modules/payments/entitlements.ts): FREE (ücretsiz), PREMIUM ve PREMIUM_PLUS yetenek tablosu var. Hacim sınırları [ai-usage](../../backend/src/modules/ai-usage/ai-usage.service.ts) üzerinden ayrıca hesaplanır. Yeni ödeme/üyelik sistemi oluşturulmaz; aynı kararın özellik ve kullanım miktarı katmanları genişletilir.
3. [Google Play doğrulaması](../../backend/src/modules/payments/google-play.ts) Google'dan ürün, hesap bağı ve gerçek `expiryTime` (bitiş zamanı) alır; istemcinin gönderdiği seviyeye güvenmez. [Mevcut kayıt servisi](../../backend/src/modules/payments/google-play-entitlements.service.ts) ve [deposu](../../backend/src/modules/payments/google-play-entitlements.repository.ts) satın alma anahtarının özetini hesaba bağlar, aynı anahtarın başka hesapta kullanılmasını reddeder, kalıcı hak kaydından sonra mağaza onayı verir. Ham satın alma anahtarı bu tabloda saklanmaz.
4. [Android MainActivity](../../android/app/src/main/java/com/diewish/app/MainActivity.java), [web/native ödeme istemcisi](../../frontend/src/infrastructure/payments/android-billing-client.ts) ve [abonelik ekranı](../../frontend/src/presentation/components/profile/subscription-view.tsx): mağazadan fiyat/teklif alma, satın alma, bekleyen/iptal durumları, sunucuda doğrulama ve satın alımları geri yükleme mevcut. İşlevin kodda olması, Play Console yapılandırmasının veya gerçek ödemenin bu görevde doğrulandığı anlamına gelmez.
5. [payments.service.ts](../../backend/src/modules/payments/payments.service.ts) web/iyzico yolunu korur; arayüz yeni web ödemesine yönlendirmez ve gerçek iyzico işlemi için eksik fatura profili nedeniyle güvenli engel vardır. [constants.ts](../../backend/src/modules/payments/constants.ts) içindeki eski 30 günlük dönem/fiyatlar mağaza teklifinin yeni fiyatı değildir; değiştirilmeyecek.
6. [subscription-store.ts](../../frontend/src/application/payments/subscription-store.ts) sunucunun hakkını esas alır ve yardımcı ödeme geçmişi hatasını ücretli seviyeyi düşürmek için kullanmaz. Yeni sayaç görünümü bu davranışı korumalıdır.

**Önemli uygulama farkı:** [require-subscription.ts](../../backend/src/middleware/require-subscription.ts) içinde genel özellik koruyucusu vardır; incelenen ürün yollarında bu yardımcı doğrudan kullanılmıyor. Özellikle kan tahlili servisi doğrudan `assertWithinQuota` çağırıyor. FREE tablosundan bir özelliği çıkarmak tek başına API (uygulama iletişim arayüzü) erişimini kapatmaz. Kontrol asıl maliyetli servis girişinde de uygulanmalıdır.

## 3. Tek hak matrisi: mevcut davranış ve gereken en küçük uyarlama

Yollar `/api` ile başlar. Bu tablo kaynak kod davranışını tanımlar; canlı kabul testi sonucu değildir. PREMIUM ve PREMIUM_PLUS korunur; ikisi de sınırsız varsayılmaz. Tarama için nihai ücretli kotalar henüz belirlenmemiştir.

| Özellik / sunucu yolu | Kaynak kodun bugünkü desteği | Onaylı yeni Free kuralı | Gereken değişiklik |
| --- | --- | --- | --- |
| Fotoğraf: `POST /food-scan/analyze` | Kimlik/onay, 15 dakikada 10 istek sınırlayıcısı, görsel analizi, yapılandırılmış besin kaynağı ve gerektiğinde yapay zekâ ile tamamlama var. Hesap ömrü kotası yok. | Hesap başına toplam 3 başarılı analiz; kalan hak görünür. | Aynı `ai-usage` temeline hesap bazlı rezervasyon, kalıcı başarı ve kalan hak kararı ekle. Görsel geçmişi tek başına sayaç sayma. |
| Fotoğraf yardımcı yolları: `POST /food-scan/analyze-by-name`, `/recalculate` | İsimle doğrulama ve yeniden hesaplama var. Yeniden hesaplama her durumda yerel/deterministik değil; `finalizeFoodScanRecalculation` yapay zekâ tamamlamasına ulaşabilir. | Aynı başarılı taramanın düzeltmesi ikinci hak tüketmemeli; yeni maliyetli analiz sınırsız yan kapı olmamalı. | İlk taramanın hesap bağlı işlem kimliğini doğrula. Aynı işlemin düzeltmesini ilişkilendir; ilişkisiz maliyetli yeni işlemi aynı hak kapısından geçir. Ücretsiz yeni bağımsız yapay zekâ özelliği tanımlama. |
| Barkod: `GET /nutrition-data/barcode/:barcode` | Normalize etme, bellek/veritabanı önbelleği, OFF/USDA kaynakları ve kullanıcı etiketinden geri dönüş var. Her sorgu, bulunamayan ürün dâhil, tarama geçmişine yazılabiliyor. | Hesap başına 3 başarılı yeni barkod tanıma. Aynı hesaptaki ürün/geçmişin tekrar okunması ücretsiz. | Normalize barkod + hesap başına ilk kalıcı başarıyı ayır; önbellekten ilk defa tanınan yeni ürün de bu hesabın hakkıdır. `food=null`, hata ve geçmiş okuma tüketmez. Eski barkod görüntülemesinde sağlayıcı yenilemesini yeni başarı diye ücretlendirme. |
| Etiket: `POST /nutrition-data/barcode/:barcode/label-extract`, `/confirm-label` | OCR (görselden yazı çıkarma) için maliyetli yapay zekâ ve kullanıcı onaylı ürün kaydı var; ilkinde ayrı 15 dakika/10 istek sınırı var. | Barkod kotasının ücretsiz aşılma yolu olmamalı. | Öneri: barkod işleminin aynı rezervasyonuna bağla; uygun ürün başarıyla onaylanıp kaydedilince bir kez tüket. OCR taslağı başarısız/iptal ise tüketme. Ürün kararı kabul edilmeden ayrı etiket kotası uydurma. Başarısız deneme maliyeti ayrıca teknik sınırla korunur. |
| Dolaylı barkod girişleri: `/personalize`, `/personalize-nutrients`, `/compare`, `/barcode/:barcode/favorite` | Bazıları `getByBarcode` çağırıp dış kaynağa ulaşabiliyor. `/search` araması da dış besin kaynaklarını kullanabiliyor; `/catalog/search` kayıtlı katalogla sınırlı. | Kayıtlı ürünün yerel hesaplaması/öğüne eklenmesi yeni tarama değil. | İlk ürün tanımaya ihtiyaç duyan dolaylı çağrı ortak servis kapısını atlayamaz. Kayıtlı veriden karşılaştırma/öğün ekleme ücretsiz kalır. Genel besin aramasını yanlışlıkla barkod hakkına sayma; mevcut teknik kaynak sınırları korunur. |
| Kan tahlili: `POST /blood-tests/:id/analyze` | FREE özellik tablosu açık; ömür boyu 1 analiz var. Gün/ay teknik limitleri FREE 3/10, Premium 15/100, Plus 60/600. Analiz tamamlandıktan sonra kullanım kaydı yazılıyor. | Free yeni analiz 0. Eski sonucu okuma ayrı ve korunur. | Maliyetli sağlık işleme başlamadan servis girişinde Free reddi; ortak özellik tablosu ve kota cevabı aynı kararı göstermeli. Mevcut okuma, dosya indirme, dışa aktarma ve silme haklarına toplu kilit koyma. |
| Eski plan yolu: `POST /nutrition-plans/generate`, `/:id/regenerate` | FREE yalnız 7 gün ve ömür boyu 1 başarılı plan; 14/30 gün ücretli. Hesap bazlı veritabanı kilidi var. Tam plan + kullanım kaydı aynı işlemde yazılıyor. | Aynı 1 başarılı 7 günlük plan kuralı. | Zaten sağlanan davranışı yeniden yazma; yeni ortak durum cevabına bağla. Yeniden üretim/uzatma gibi alternatif maliyetli yollar kaçış yaratmamalı. |
| Devam ettirilebilir plan: `POST /nutrition-plans/generation-jobs`, `GET .../rights`, teslim işlemi | `NUTRITION_JOBS_ENABLED` ve `NUTRITION_RIGHTS_EFFECTIVE_AT` ile kapılı; varsayılan kapalı. FREE yalnız 7 gün, fakat son başarıdan 5 takvim ayı sonra yeni hak var. Kayıtlı iş ve istek anahtarı, kısa işlem kilidi, teslimde `NutritionRightsEvent` var. | Yeni Free politikasında hesap ömrü boyunca 1 başarı. | Mevcut olay/iş modelini koru; 5 ay yenilemesini sadece yeni politika kapsamındaki hesaplar için kaldır. Eski ücretli/destek hakkını ve `grandfathered` (önceden kazanılmış) kuralını koru. Mevcut geçiş tarihini yeni amaçla değiştirip eski hakları yeniden sınıflandırma. |
| Bildirim: `/notifications`, `/preferences`, `/read-all`, `/:id/read`, `/devices`, zamanlanmış gönderim | Merkez, tercihler, sunucu/Android kayıt eşlemesi ve tek/toplu okundu işaretleme var. Üyelik bazlı 7 gün süresi yok. Sunucu otomasyonu #77 ile kapalı. | Lansmanda kayıt zamanından ilk 7 gün gönderim denemesi; sonrasında aktif ücretli hak. | Yeni zamanlayıcı kurma. Mevcut üretim/gönderim ve cihaz planlama kapısına ortak süre kararı bağla. Merkez geçmişi, ayarlar ve okundu işlemleri açık kalır. Hesap kurtarma/güvenlik e-postasını ticari bildirim kotasına bağlama. |
| Maskot: `GET/PATCH /account/mascot` | Uygulanan iki seçenek: `classic` ve `mirmir`. Hesaba kayıt ve cihazlar arası tercih var; ücretli karakter ayrımı yok. | Bazısı Free, seçili diğerleri Premium. | Kullanıcı hangi mevcut karakterin hangi seviyede olduğunu seçmeden ücretli matris yazma. Koleksiyonda/QA'da olmayan karakteri ürünleştirme. Önceden seçilmiş karakterlerin geçiş davranışı ayrıca onaylanmalı. |
| Koç: `POST /ai-chat/messages`, sohbet listesi/geçmişi; `/ai-coach/*` | Mevcut sohbet kotası aşağıda. Haftalık değerlendirme açık; aylık değerlendirme ve yeni beslenme uyarlaması Premium korumalı. Geçmiş/pasif kayıt okumaları ayrı. | Önceden belirlenen haklar aynen korunur. | Kota, sohbet eşlemesi, P1/P2 senkronizasyonu ve Mırmır bu görevde değiştirilmez. 72 saat/bildirim denemesi Koç'un ayrı 7 günlük başlangıç hakkını kesmez. |

Tarama kanıtları: [yollar](../../backend/src/modules/food-scan/food-scan.routes.ts), [fotoğraf denetleyicisi](../../backend/src/modules/food-scan/food-scan.controller.ts), [yapay zekâ tamamlama](../../backend/src/modules/food-scan/food-scan-fallback.ts), [barkod/etiket yolları](../../backend/src/modules/nutrition-data/nutrition-data.routes.ts), [denetleyici](../../backend/src/modules/nutrition-data/nutrition-data.controller.ts), [ortak barkod servisi](../../backend/src/modules/nutrition-data/nutrition-data.service.ts), [kişiselleştirme servisi](../../backend/src/modules/nutrition-data/nutrition-personalization.service.ts), [geçmiş deposu](../../backend/src/modules/nutrition-data/nutrition-data.repository.ts).

Kan/plan kanıtları: [analiz servisi](../../backend/src/modules/blood-test-analysis/blood-test-analysis.service.ts), [okuma/analiz yolları](../../backend/src/modules/blood-test-analysis/blood-test-analysis.routes.ts), [eski plan servisi](../../backend/src/modules/nutrition-plan/nutrition-plan.service.ts), [atomik plan kaydı](../../backend/src/modules/nutrition-plan/nutrition-plan.repository.ts), [plan kilidi](../../backend/src/modules/nutrition-plan/nutrition-plan-generation-lock.ts), [hak politikası](../../backend/src/modules/nutrition-plan/nutrition-rights-policy.ts), [hak servisi](../../backend/src/modules/nutrition-plan/nutrition-rights.service.ts), [iş ve teslim servisi](../../backend/src/modules/nutrition-plan/nutrition-generation-jobs.ts).

## 4. Dondurulan Koç ve ücretli kullanım sınırları

[Mevcut sabitler](../../backend/src/modules/ai-usage/constants.ts) ve [hesaplama](../../backend/src/modules/ai-usage/ai-usage.service.ts) esas alınır. Gün ve ay pencereleri UTC takvim sınırlarıdır; kod yorumlarındaki “rolling” ifadesi kayan 24 saatlik pencere olarak yorumlanmamalıdır.

| Sohbet seviyesi | Günlük başarılı mesaj | Aylık başarılı mesaj | Ömür boyu sınır |
| --- | --- | --- | --- |
| FREE, kayıt anından ilk 7 x 24 saat | 10 | 100 | Yok |
| FREE, 7 gün ve sonrası | 5 | 100 | Yok |
| PREMIUM | 20 | 400 | Yok |
| PREMIUM_PLUS | 50 | 1000 | Yok |

Her iki pencere de sağlanır; ilk 7 gün artışı aylık sınırı kaldırmaz. [premium.ts](../../backend/src/modules/ai-coach/premium.ts) Free/ücretli hafıza penceresini 14/90 gün ve yanıt üst sınırını 500/1200 olarak tanımlar. [Koç yolları](../../backend/src/modules/ai-coach/ai-coach.routes.ts) içindeki ayrı ücretli korumalar korunur. Haftalık/aylık analizleri sohbet mesaj kotasına yeni tüketim olarak bağlama kararı bu görevde alınmaz.

Eski plan yolunun ücretli gün/ay sınırları PREMIUM 15/100, PLUS 60/600. Yeni devam ettirilebilir plan politikasında yeni ücretli hesap için PREMIUM 2/5, PLUS 3/10; önceden kazanılmış yeni plan haklarında eski 15/100 ve 60/600 korunabiliyor. Bu iki yolu tek tabloya bakıp yanlışlıkla eşitleme. Yeni tarama ücretli kotaları için ürün kararı gerekir; `null` değeri kullanıp sınırsız erişim üretme.

## 5. Başarı, tekrar istek, yarış ve iptal sözleşmesi

### Mevcut desteğin sınırı

- [AiUsageEvent](../../backend/prisma/schema.prisma) yalnız `DIETITIAN_CHAT`, `BLOOD_TEST_ANALYSIS`, `NUTRITION_PLAN` türlerini içerir. Fotoğraf/barkod türü, genel işlem anahtarı veya rezervasyon durumu yok. `assertWithinQuota` sayar, `record` sonradan yazar; bu genel ikili, kendi başına yarışa dayanıklı rezervasyon değildir. Beslenme servisi bunu ayrıca kilit/işlem ile korur; bu korumayı gereksiz yere değiştirme.
- Barkod geçmişi başarısız sorguları ve tekrarları da içerir. Fotoğraf geçmişi yazılamadığında mevcut denetleyici uyarı kaydedip başarılı cevap verebilir. Dolayısıyla geçmiş satır sayısı güvenilir yeni hak sayacı değildir. Geçmişi temizlemek veya yeniden tarama zorlamak çözüm değildir.
- Devam ettirilebilir planın hesap/istek anahtarı tekilliği, kısa kilitleri ve teslimde başarı olayı zaten var. İkinci plan kuyruğu/teslim sistemi oluşturulmaz. Yeni tarama işlemleri için bu ilkeler mevcut kullanım modülünde uygulanabilir; plan tablosuna yapay barkod işi eklenmez.

### Önerilen en küçük güvenilir genişletme (henüz kodlanmadı)

1. Aynı abonelik çözümleyicisini kullan; promosyon var diye kullanıcıyı `PREMIUM` olarak kaydetme. Ödeme seviyesi, kampanya erişimi, süre ve kalan hak aynı sunucu kararında birleştirilir. İlk geliştirme kapalı bir sunucu özellik anahtarının arkasında olmalı; bu belge anahtar eklemez/açmaz.
2. Mevcut `ai-usage` modülüne fotoğraf/barkod özellikleri ve genel işlem rezervasyonu eklenmesi tasarlanır. **Başarılı tüketimin tek kaynağı kullanım olayıdır**; rezervasyon tüketilmiş hak değildir. Planın mevcut teslim olayları ikinci kez sayılmaz. Başarı kaydı bir `operationId` (işlem kimliği) ile tekilleşir; yeni ödeme tablosu oluşturulmaz.
3. Kısa veritabanı işleminde hesap+özellik kilidi al; başarılı toplam + geçerli rezervasyonlar < kota ise rezervasyon oluştur. `idempotencyKey` (aynı isteği bir kez işleme anahtarı), kullanıcı, özellik ve girdi özeti birlikte doğrulanır. Aynı anahtar/farklı girdi çakışması reddedilir. Başka hesap anahtarı hiçbir veriyi açmaz. Kilit sağlayıcı isteği boyunca tutulmaz.
4. Barkodda ayrıca normalize barkod + hesap başarı tekilliği gerekir. Aynı ürün başka kullanıcı tarafından önbelleğe alınmış olsa bile bu kullanıcının ilk tanıması sayılır. Aynı kullanıcının eşzamanlı aynı barkod çağrıları tek sonuç/başarıya bağlanır; başarısız denemenin yeniden denenebilmesi korunur. Normalize kimlikte mevcut barkod doğrulaması kullanılır; baştaki sıfırlar keyfî atılmaz.
5. Sağlayıcıdan geçerli ve kullanıcıya sunulabilir sonuç gelince sonuç/geçmiş, tek kullanım olayı ve işlem `SUCCEEDED` (başarılı) durumu **aynı veritabanı işleminde** kesinleşir. Kalıcılık başarısızsa başarılı tüketim/sonuç cevabı verilmez; tekrar istek aynı işlemden devam eder. Yalnız HTTP 200 olması başarı tanımı değildir: ürün bulunamaması, boş/eksik sonuç ve düzeltme isteyen görsel henüz tamamlanmış kullanım değildir.
6. Kesin başarısızlık ve kesinleşmeden kabul edilmiş açık iptal rezervasyonu bırakır, kullanım olayı oluşturmaz. Bir kez tüketilmiş kayıt keyfî azaltılmaz/silinmez; gerekirse yönetici onaylı telafi olayıyla iz bırakılır. Ürün kotası telafisi ile gerçek para iadesi ayrı konudur; bu fazda ikisi de yapılmaz.
7. Bağlantı kopması otomatik olarak iptal/başarısızlık değildir. Sonuç kesinleşmişse yeniden bağlanma aynı sonucu ve bir kez düşmüş hakkı getirir. Henüz kesinleşmemiş açık iptal ile tamamlanma yarışı aynı işlem durumuna kilitlenir. Tamamlandıktan sonra “iptal” diyerek hakkı geri alıp sonucu elde etme engellenir.
8. Rezervasyonda süre ve deneme kimliği bulunur. Süresi dolan işin geç cevabı yeni denemenin hakkını tüketemez. Temizlik yalnız kullanıcı isteğinde veya mevcut görev akışında yapılır; Neon'u sürekli uyandıran yeni arka plan tarayıcısı kurulmaz. Tekrar deneme sağlayıcıda maliyet yaratabileceği için mevcut teknik hız/dosya/bütçe sınırları ayrıca korunur.
9. Başarılı sayı cihazda tutulmaz. Çoklu cihaz/reinstall (yeniden kurulum)/yeniden giriş aynı hesap kaydını görür. Başka hesap/cihazda sıfırlama, hesabı yeniden oluşturma gibi kötüye kullanımın çözümü yeni sağlık verisi veya kalıcı cihaz izi toplamayı kendiliğinden haklı çıkarmaz; mevcut kimlik birleştirme ve silme politikasıyla ürün kararı gerekir.

Şema değişikliği ihtiyacı tasarım düzeyindedir: mevcut kullanım olayı için işlem tekilliği ve tarama türleri; rezervasyon için kullanıcı/özellik/istek/girdi özeti/durum/süre/sonuç referansı ve gerekli indeksler. Ham sağlık içeriği ve satın alma anahtarı sayaç satırına kopyalanmaz. Migration dosyası veya canlı veri göçü bu PR kapsamında yoktur. Mevcut hesaplara geçmişten hak düşürme yapılmaz; başarısız/tekrar geçmiş kayıtlarından otomatik sayım kararı verilemez.

## 6. Ön yüz kalan hak ve hata sözleşmesi

Mevcut `/subscription`, `/ai-usage` ve beslenme `/generation-jobs/rights` kaynakları korunur. Yeni bir üyelik servisi kurmadan mevcut hak cevabını genişletmek önerilir. Aşağıdaki örnek **taslaktır, henüz mevcut API cevabı değildir**:

```json
{
  "feature": "PHOTO_SCAN",
  "tier": "FREE",
  "policyVersion": "free-premium-v1",
  "eligible": true,
  "allowed": true,
  "lifetime": { "limit": 3, "used": 1, "remaining": 2 },
  "inFlight": 0,
  "reason": null,
  "resetsAt": null,
  "serverNow": "2026-10-20T13:50:00Z"
}
```

- Tüketim cevabı sonuç, aynı işlem kimliği ve güncel hak görüntüsünü birlikte döndürür. `remaining = limit - successfulUsed`; uçuşta rezervasyon varsa görünür kalan hak düşürülmez, yeni istek kullanılabilirliği ayrıca sınırlandırılır. İşlem sırasında ilgili düğme kapatılır, “İşlemin sürüyor” gösterilir.
- Başlangıç “3/3 kullanım hakkın kaldı”; başarıdan sonra 2/3, 1/3, 0/3. Ömür boyu hakkın yenilenme tarihi yoktur; “yarın yenilenir” yazılmaz. Barkod/geçmiş tekrar okumasında sayı aynı kalır.
- Hak okunamıyorsa 3/3 veya “Premium” uydurulmaz: “Kullanım hakkın doğrulanamadı. Tekrar dene.” Yeni maliyetli işlem doğrulanana kadar başlamaz; mevcut yerel/geçmiş kayıtlar açık kalır. Hesap değişiminde önceki hesabın sayacı temizlenir.
- Kullanım bittiğinde: “Ücretsiz fotoğraf tarama hakkın doldu. Premium seçeneklerini inceleyebilir veya ücretsiz özelliklerle devam edebilirsin.” Kan tahlilinde “Yeni kan tahlili analizi Premium gerektirir. Önceki sonuçlarını görüntüleyebilirsin.”
- Teknik hata/iptal: sunucudan doğrulandıktan sonra “İşlem tamamlanmadı; kullanım hakkın düşmedi.” Cevap kaybında kesin başarısızlık iddia etme: “İşlem durumunu kontrol ediyoruz.” Aynı anahtarla durum/sonuç eşleştirilir; yeni istek açılmaz.
- Ürün hakkı bitişi mevcut `SUBSCRIPTION_REQUIRED` yaklaşımına; teknik hız limiti 429 cevabına; sürmekte olan/çakışan işlem 409 cevabına; bağımlılık hatası uygun 5xx cevabına ayrılır. Son ikisi ücretli satın alma zorlaması gibi gösterilmez. Kodlar ve `reason` (neden) değerleri sonraki geliştirmede tek sözleşmede kesinleştirilmeli.

## 7. Üç ayrı süre ve tekliflerin gösterimi

| Süre / sınır | Davranış | Kalıcılık ve koruma |
| --- | --- | --- |
| 0 saat | Yararlı ilk deneyimden sonra ilk abonelik teklifi; “Şimdilik ücretsiz devam et”. | Hesabın sunucu `createdAt` değeri temel alınır; henüz yeni kampanya kaydı yok. |
| En erken 24 saat | İlk uygun uygulama açılışında ikinci teklif; yine ücretsiz devam yolu. | Hem kayıt yaşına hem son gerçek gösterimden en az 24 saate bakılır. |
| En erken 48 saat | Üçüncü ve son teklif; ücretsiz devam açıkça görünür. | Gösterim sayısı en çok 3; son gösterimden en az 24 saat. X kaldırılması ücretsiz devamı kaldıramaz. |
| 72 saat | Tanıtım biter; mevcut temel Free işlevler ve kayıt geçmişi devam eder. | Ek pazarlama teklifi üretme, satın alma başlatma veya kullanıcıyı uygulamadan çıkarma. |
| 7 x 24 saat | Bildirim denemesi, lansman politikasında kayıt anından itibaren; ardından ücretli gönderim hakkı. | 72 saatten ve Koç başlangıç kotasından ayrı. #77 duraklatması her zaman öncelikli; bu hak otomasyonu açmaz. |
| İlk başarılı ücretli ay + bir defalık 7 gün | Hedef: mağaza onaylı süre uzatma; henüz vaat/etkinleştirme yok. | Gerçek ödeme ve sağlayıcı yenileme zamanı gerekir; yerel “30 + 7” tarihi veya seviye güncellemesi ödeme kanıtı değildir. |

Hatırlatma için mevcut bildirim kuyruğunu kullanarak otomatik gönderim planlanmaz; burada söz konusu olan uygun uygulama açılışındaki tekliftir. Kampanya/sürüm/gösterim sırası ve son gösterim zamanı sunucuda kalıcı, hesap bazlı ve eşzamanlı taleplere dayanıklı olmalı. Çoklu cihaz aynı sırayı iki kez tüketmemeli; gösterim rezervasyonu ile gerçekten gösterildi onayı ayrılmalı, başarısız ekran yüklemesi kullanıcıya gösterilmiş sayılmamalı. Kayıt zamanına göre 24 saat geçmiş olması, son teklifin 24 saat önce gösterildiği anlamına gelmez. Örneğin ilk teklif 10. saatteyse ikinci en erken 34, üçüncü en erken 58. saatte gösterilebilir. Geç gelen kullanıcıya üç teklifi arka arkaya gösterme; 72 saati geçtiyse kampanya kapalı.

Çevrimdışı/cihaz saati değişimi tanıtımı veya hakkı yenilemez. Ücretli erişimin doğrulanamadığı durumda kullanıcıyı yanlışlıkla Free olarak kaydetme; düşük maliyetli temel/geçmiş erişimi korunurken maliyetli yeni işlem sunucu doğrulaması bekler. Kampanya kapsamı kimlik bağlama, farklı kayıt yolu ve yeniden girişte yenilenmez.

**Karar gerektiren sınır:** 72 saat içinde tabloda yazılı haklardan hangisinin ek olarak genişlediği tanımlı değil. Fotoğraf/barkodda 3, kanda 0, planda 1 ve Koç'un korunmuş hakları dışında kendiliğinden Premium/sınırsız erişim verme. Bu kapsam, mevcut hesap geçişi ve hesap silip yeniden kaydolmanın promosyon uygunluğu yönetici tarafından netleştirilmeli.

## 8. Bildirim ve yerel cihaz planı

[Sunucu yolları](../../backend/src/modules/notifications/notification.routes.ts), [gönderim servisi](../../backend/src/modules/notifications/notification.service.ts), [merkez eşlemesi](../../frontend/src/infrastructure/notifications/notification-lifecycle.ts) ve mevcut ayarlar genişletilir. Süre dolunca yeni ticari/Koç/hatırlatma gönderim izni durabilir; mevcut kayıtlar, tercihler, okundu işaretleme ve hesabın güvenlik/kurtarma işlemleri kapanmaz. Bekleyen kayıtlar silinmez; ileride ücretli olunduğunda eski tüm bildirimlerin topluca gönderilmesi önlenir. Uygunluk üretilirken ve göndermeden önce tekrar kontrol edilmelidir.

Android'de [WellnessReminderScheduler](../../android/app/src/main/java/com/diewish/app/WellnessReminderScheduler.java) su/aktivite/uyku, [NutritionReminderScheduler](../../android/app/src/main/java/com/diewish/app/NutritionReminderScheduler.java) öğün alarmlarını saklar; [açılış alıcısı](../../android/app/src/main/java/com/diewish/app/NutritionReminderBootReceiver.java) cihaz yeniden açılınca geri kurar. Su hatırlatması 7 günlük tekrar döngüsüyle yenilenebilir; bu ürünün 7 günlük üyelik denemesi değildir. Bugün sunucu abonelik süresi/sona erme bilgisine bağlı yerel üyelik kapısı yoktur.

Sonraki fazda hesaba bağlı, sunucu tarafından doğrulanmış `validUntil` (son geçerlilik zamanı) ile planlama/gönderme/yeniden açılma sınırları gerekir; çevrimdışı sınır, saat değişikliği ve önceden kurulmuş alarmlar da ele alınır. Native (cihaz içi) alarmlar yalnız arayüz açıldığında iptal edilerek güvenli sonlandırılmış sayılamaz. Ücretli kullanıcı çevrimdışıyken erken iptal ve Free kullanıcının sınırsız tekrar alarmı ayrı test edilmelidir. Tercihleri veya geçmişi silme; haftalık özet için ikinci yerel bildirim üretme. Bu görev hiçbir cihaz alarmını yeniden kurmadı veya iptal etmedi.

## 9. Google Play: mevcut güvenlik ve promosyon engelleri

**Kaynakta hazır:** ürün/hesap/süre doğrulaması, anahtar özeti tekilliği, bağlantılı satın alımın hesap kontrolü, kalıcı hak kaydından sonra onay, onay hatasında geri yüklemeyle tekrar deneme, Android satın alma/geri yükleme. **Hazır varsayılamaz:** tüm abonelik yaşam döngüsü ve tek seferlik ücretli ay hediyesi.

- Kodun doğrulaması yalnız `SUBSCRIPTION_STATE_ACTIVE` (etkin) kabul ediyor. Ücretli bitişten önce iptal edilmiş hak ve `IN_GRACE_PERIOD` (ödeme telafi süresi) davranışı ayrı ele alınmalı. Mevcut yerel kayıt süresi dolana kadar hak verebilir; ancak yeni doğrulama/geri yüklemenin bu durumları reddetmesi farklı sonuç doğurabilir. Bu bir kaynak bulgusu ve sonraki faz test gereksinimidir; gerçek müşteride hata üretildiği iddiası değildir.
- İncelenen ödeme modülünde RTDN (mağazanın gerçek zamanlı durum bildirimi), para iadesi/hak geri çekme uzlaştırması ve `subscriptionsv2.defer` çağrısı bulunmadı. Yerel `expiresAt` kontrolü tek başına mağazadaki son yenileme/erken iade durumunu güncellemez. Yeni özellik öncesi bu boşluklar değerlendirilmelidir; #77'yi tersine çeviren sürekli mağaza/veritabanı sorgulaması çözüm değildir.
- [Resmî v2.defer belgesi](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/defer) incelendi: `deferralContext.etag`, `deferDuration`, `validateOnly` alanları var; işlem yenilemeyi erteler ve yeni ürün bitiş zamanlarını döndürür. 7 gün için süre ifadesi `604800s` olabilir; etag güncel mağaza okumasından gelir. Bu görev doğrulama amaçlı mağaza isteği bile yapmadı. Bu teknik olanak, Diewish'in promosyonunun mağazada/hukuken onaylandığı anlamına gelmez.
- [Resmî yaşam döngüsü belgesi](https://developer.android.com/google/play/billing/lifecycle/subscriptions) mağazanın son durumunu esas almayı ve ödeme telafi süresinde erişimi korumayı açıklar. [Abonelik belgesi](https://developer.android.com/google/play/billing/subscriptions) erteleme yaklaşımı için ek kaynaktır. Yerel katalogdaki 30 gün veya `startedAt` ilk başarılı ücretli aylık siparişi tek başına kanıtlamaz.
- Mevcut Play tablosu satın alma anahtarının yalnız özetini tutuyor. İleride sunucudan erteleme çağrısında ham anahtara güvenli erişim ve olayla eşleştirme ayrıca tasarlanmalı; açık metin anahtarları rastgele kaydetme/loglama. Mevcut hizmet hesabının gereken mağaza yetkisi de canlı değişiklik yapmadan ayrıca doğrulanmalı.
- Bir defalık hediye için hesap + kampanya uygunluğu, ilk başarılı ücretli sipariş kanıtı, eşzamanlılık ve bağlantılı satın alım zinciri gerekir. Uzak erteleme başarılı olup yerel kayıt başarısızsa kör tekrar ikinci 7 gün vermemeli: eski etag/bitiş, işlem durumu ve mağaza geri okumasıyla belirsiz sonuç uzlaştırılır. Sağlayıcı cevabı doğrulanmadan yerel 7 gün eklenmez.

Yöneticiye açık ticari sorular: hangi aylık ürün/ülke/eski hesaplar uygun; ilk ödeme mi ilk dönemin sonu mu uzatma uygulanacak; yenilemeden önce güvenli tetikleme nasıl yapılacak; iptal/iade/ödemesi askıda kullanıcı için hediye uygunluğu; tek seferlik hediyenin hesap mı sağlayıcı zinciri mi bazlı olduğu; mağazada gösterilen gerçek fiyat, otomatik yenileme ve sonraki fatura tarihi; web/iOS karşılığı. Ek ödeme öncesi 7 günlük mağaza denemesi varsayılan teklif değildir. Bu sorular cevaplanmadan kullanıcıya hediye vaat edilmez, fiyat ve satış metni değiştirilmez.

## 10. Güvenlik, geçiş ve maliyet riskleri

| Risk | Koruma / bağımlılık |
| --- | --- |
| Kaynak/canlı şema farkı | Canlı duraklatma kaynağı ile bu kaynak arasında 5 migration ve şema farkı var. İsimler: `20261017120000_user_password_recovery`, `20261017123000_account_identity_foundation`, `20261017140000_safe_account_linking`, `20261017210000_phone_password_registration`, `20261018093000_phone_sms_recovery`. Bu, git dosya farkı kanıtıdır; veritabanının migration tablosu bu görevde okunmadı. Tam kaynak yayını/göç ayrı onay ve #82 çözümü gerektirir. |
| Neon kota/503 ve eski mailer (e-posta göndericisi) | #82 devam ediyor; canlı DB/gerçek hesap/teslim testleri BLOCKED (engellendi). Kota döneminin düzelmesi bu kod tasarımıyla vaat edilmez. Canlıya bağlanmadan yerel sentetik test planı hazırlanır; yeni ücretli hizmet yok. |
| Eski/ücretli/destek kullanıcı hak kaybı | Yeni politika sürümü ve kohort (geçiş kapsamındaki hesap grubu) kararı gerekir. Mevcut satın alınmış haklar, destek hakları ve beslenme geçmişi yeniden sınıflandırılmaz. `NUTRITION_RIGHTS_EFFECTIVE_AT` yeni geçiş tarihi gibi değiştirilmez. Otomatik geçmiş sayımı/geriye dönük kota düşüşü yok. |
| Başarısızlık ve tekrarın hak tüketmesi | Sonuç + tek kullanım olayı aynı kalıcılık işleminde; rezervasyon/işlem anahtarı/deneme kimliği ve hesap izolasyonu. Silinmiş geçmiş, hak sıfırlaması değildir. Başarı kaydı daha sonra Free olununca kaybolmaz; eski ücretli kullanımın yeni Free hakkına sayılıp sayılmayacağı ayrıca karar gerektirir. |
| Ücretsiz maliyet yan yolları | Etiket, isim doğrulama, yeniden hesaplamadaki yapay zekâ ve dolaylı barkod girişlerini ortak kapıya bağla. Başarısız kullanım kotası düşmez; fakat istek, dosya, süre ve maliyet sınırları devam eder. |
| Veri okuma/sağlık güvenliği kaybı | Yeni üretim yetkisi ile mevcut kayıt okuma/indirme/dışa aktarma/silme ayrılır. Alerjen, kalite, açık rıza, beslenme güvenliği ve hesap sahipliği kontrolleri korunur. |
| Cihaz/sunucu süre farkı | Sunucu UTC ve kalıcı hesap kaydı; çoklu cihazda tek gösterim/başarı. Yerel alarmda süre sonu ve yeniden açılma koruması olmadan bildirim denemesi tamamlanmış sayılmaz. |
| Pazarlama/ödeme metni farkı | `frontend/src/shared/constants/site.ts` içinde eski 30/60 gün plan/tek seferlik 30 gün anlatımı var; mağazanın gerçek yenilemesiyle karıştırılmamalı. FAZ 3/4'te gerçek ürün/ödeme kararıyla birlikte düzenlenir; bu fazda değişmez. |

## 11. En küçük sonraki geliştirme sırası

| Faz | Sınırlı teslim | Kabul ve açılma şartı |
| --- | --- | --- |
| FAZ 2A: ilk kod görevi | Mevcut `ai-usage` ve `subscription-state.ts` çevresinde kapalı politika/sayaç temeli: fotoğraf/barkod yaşam boyu başarı, rezervasyon/tekrar anahtarı tasarımı, tek durum cevabı. Eski hesap/ücretli/Koç davranışı varsayılan olarak aynı. | Önce bu rapor onayı. Yalnız ayrı çalışma dalı, varsayılan kapalı özellik anahtarı; sentetik girdilerle politika ve yarış/tekrar sözleşmesi. Gerekli şema dosyası ayrı incelenir; canlı migration/yayın yok. Yeni Premium kota uydurma. |
| FAZ 2B: mevcut yolların bağlanması | Aynı temeli tüm tarama/etiket girişlerine bağla; Free yeni kan analizini kapat; mevcut plan hak kaynağında yalnız yeni kohort için ömür boyu tek başarı uygula. | Önce 2A sözleşmesi; her alt değişiklik küçük ayrı inceleme. Eski plan kilidi/teslim modeli, sağlık güvenliği, Koç ve okuma yolları korunur. 2A tek başına bu işlerin tamamlandığı anlamına gelmez. |
| FAZ 2C: süre ve bildirim kararı | Hesap bazlı 72 saat tanıtım, 3 gösterim/24 saat aralığı, 7 gün bildirim hakkı; eski hesap geçişi. | Tanıtım kapsamı/eski hesap kararı şart. Sunucu ve yerel cihaz süre koruması birlikte tasarlanır. Otomasyon PAUSED kalır; yeniden açma bu fazın izni değildir. |
| FAZ 3: ekranlar | Kalan 3/3 sayacı, güvenli hata/yeniden eşleme, ücretsiz devam, mevcut kayıt erişimi; onaylanmış mevcut maskot matrisi. | Web ve Android ortak sözleşme; mobil görünüm ve erişilebilirlik. Gerçek karakter/ücretli matris kullanıcı onayı olmadan değişmez. iOS cihaz doğrulaması ayrıca raporlanır. |
| FAZ 4: mağaza fizibilitesi ve promosyon | Sağlayıcı yaşam döngüsü/geri yükleme boşlukları; ilk ücretli ay + bir defa 7 gün; fiyat/yenileme açıklaması. | Ayrı ürün/mağaza ve ödeme onayı. Önce sahte sağlayıcı ve lisans test hesabı için izinli test planı; gerçek kullanıcı ödeme/hediye/mağaza ayarı kendiliğinden değişmez. |
| FAZ 5: staging kabulü | #82 sonrası şema/gerçek kaynak eşleşmesi; izinli sentetik/test hesaplarıyla bütünleşik kabul. | Açık migration/yayın izni ve DB engelinin kalkması. Otomasyonun açılması ayrı karar; bu aşamalar production/main veya APK izni değildir. |

**Önerilen tek ilk kod görevi:** `APP-SUBSCRIPTION-FREE-PREMIUM-A1-FAZ2A-QUOTA-FOUNDATION` — yalnız mevcut kullanım modülünde kapalı hak/rezervasyon ve durum sözleşmesi. Fiyat, satın alma, bildirim etkinleştirme, Koç kotası, mevcut kullanıcı hakları, yeni karakter veya yeni plan kuyruğu kapsam dışı. Yönetici onayı gelmeden başlanmaz.

## 12. Hedefli kabul senaryoları ve bu fazın kanıtı

Aşağıdakiler sonraki uygulama için test planıdır; bu fazda çalıştırılmış ürün testi değildir:

| Alan | Zorunlu senaryolar |
| --- | --- |
| Taramalar | 3 başarı ve 4. ret; bulunamayan/boş/eksik ürün; sağlayıcı/DB hatası; açık iptal; bağlantı kopması sonrası aynı sonucu alma; 1 hak kalmışken farklı cihazlardan iki istek; aynı anahtar/farklı girdi; eski denemeden geç cevap. Başarılı olay ve sonuç birlikte yazılır. |
| Barkod/etiket | Normalize aynı ürün; geçmiş/favori/öğün tekrar okuma; başka hesaba ait önbellekteki ilk yeni ürün; başarısız barkoddan OCR'a geçiş; onay/tekrar onay; kişiselleştirme/karşılaştırma üzerinden yeni ürün kaçışı; hiçbirinde çift tüketim yok. |
| Kan/plan | Free yeni analiz 0, eski sonuç/dosya okunur; tek 7 günlük plan, 14/30 ret; eski ve devam ettirilebilir yollar; 5 ay sonra yeni kohortta hak dönmez; hatalı üretim tüketmez; eski ücretli/destek sınırları korunur. |
| Süre/teklif | 0/24/48/72 saat ve tam sınırın bir milisaniye öncesi/sonrası; geç ilk açılış; gösterimler arası en az 24 saat; en çok 3; iki cihaz; ekran yükleme hatası; çevrimdışı/saat değişimi/yeniden giriş/kimlik bağlama; her teklifte ücretsiz devam. |
| Bildirim | 72 saatte kesilmeyen 7 günlük hak; kayıt+7 gün sınırı; ücretli bitiş; PAUSED önceliği; eski kayıt/ayar/okundu işlemleri açık; yerel su yenilemesi ve cihaz yeniden açılması; iki kanaldan çift bildirim yok; kurtarma e-postası etkilenmez. |
| Ödeme/Koç/maskot | Mağaza bekleyen/iptal/telafi süresi/iade/yenileme/anahtar hesabı/geri yükleme; uzak başarı-yerel hata ve tek hediye; Koç'un 7 gün/10→5 günlük ve 100 aylık sınırları aynı; ücretli 20/400 ve 50/1000 aynı; sadece onaylı mevcut maskotlar ve eski seçimin korunması. |
| Arayüz | 390/412/430 piksel, açık/koyu görünüm, sayaç yükleme/hata/çift tıklama, hesap değişimi, Premium'a geçiş/süre bitişi, ücretsiz devam ve geçmişe ulaşma. |

Mevcut test varlıkları incelendi; örneğin `nutrition-rights-policy.test.ts`, `nutrition-generation-jobs.integration.test.ts`, `nutrition-plan-generation-lock.integration.test.ts`, `admin-subscription.integration.test.ts`, `mascot-preferences.integration.test.ts`, `notification-mark-all-read.integration.test.ts` ve ilgili ön yüz testleri yeniden yazılacak sistem olmadığına kanıt sağlar. Dosyanın varlığı veya önceki PASS bu yeni ürün kurallarının doğrulandığı anlamına gelmez. Bu görevde geniş test/type-check (tür denetimi)/derleme çalıştırılmadı.

FAZ 1 doğrulaması: kaynak HEAD/TREE ve görev kararlarının okunması; sekiz özelliğin yol/servis/kayıt eşlemesi; gerçek kaynak farkının dosyalardan çıkarılması; Google'ın resmî API belgelerinin okunması; yalnız dokümantasyon değişikliği, kaynak bağlantıları ve boşluk/hatalı fark kontrolü. Son teslimde PR (kod değişikliği inceleme isteği) kapsamı ayrıca doğrulanır. Canlı DB, gerçek mağaza, e-posta, cihaz alarmı ve kullanıcı kabulü #82/sonraki ayrı yetkiler nedeniyle BLOCKED; bunları PASS yazma.

Yerel dokümantasyon kontrolü PASS: 40 göreli bağlantı / 39 ayrı kaynak dosya bulundu; 6 tablonun sütun yapısı ve kod bloğu kapanışı doğrulandı. Hazırlanan değişiklik yalnız bu Markdown belgesidir; uygulama/şema/iş akışı dosyası farkı yok. `git diff --cached --check` (kayda hazırlanmış farkın biçim kontrolü) başarılı. Bunlar dokümantasyon kontrolleridir; yeni ürün davranışının test edildiği iddiası değildir.

## 13. Yönetici kararı için kapanış

Hazır olan temel: tek abonelik çözümleyicisi, mağaza doğrulama/geri yükleme, kullanım olayları, plan teslim/kilit modeli, bildirim merkezi ve iki mevcut maskot. Eksik olan: yeni tarama kotası ve güvenli tüketimi, Free kan analizi engeli, yeni kohortta plan yenilenmesinin kaldırılması, kalıcı 72 saat/teklif ve 7 gün bildirim kararı, seçilmiş ücretli maskot matrisi, doğrulanmış mağaza hediyesi.

FAZ 1 teknik hazırlık tamamlandı; yönetici değerlendirmesi bekleniyor. Yeni model için uygulama ve canlı kabul henüz yapılmadı. Kaynak bulguları, tasarım önerileri ve canlıda engelli kontroller bu belgede ayrı gösterildi. Sonraki tek adım FAZ 2A kapsamının yönetici tarafından kabul edilmesidir; bu belge birleşse bile otomatik kod geliştirme veya yayın başlatılmaz.
