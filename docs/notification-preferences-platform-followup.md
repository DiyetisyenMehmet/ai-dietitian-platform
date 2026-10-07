# Bildirim tercihleri — Faz 3 ve platform takip maddeleri

Görev: `WORKMODE-NOTIFICATION-PREFERENCES-A1` — Çalışma Modu 2.

## Ürün davranışı

- Su için Faz 2'deki günlük/haftalık çoklu saat modeli korunur.
- Öğün saatleri mevcut aktif, tamamlanmış üretime sahip beslenme planından alınır. Takvim ertelemeleri ve gece yarısını aşan öğünler aynı hesaplamayı kullanır. Premium/Premium Plus koşulu etkinleştirme öncesi yeniden kontrol edilir; plan veya abonelik değiştirilmez.
- Aktivite ve uyku hazırlığı mevcut günlük tek saat alanlarını kullanır. Kapatmak kayıtlı saati silmez.
- Haftalık özet mevcut sunucu bildirim kuyruğunu kullanır. Gün/saat veya saat dilimi değiştiğinde yalnız kullanıcıya ait, gelecekteki, henüz teslim edilmemiş haftalık özetlerin zamanı güncellenir. Yeni yerel alarm veya ikinci sunucu kaydı oluşturulmaz. Değişmeyen saat dilimiyle bir günlük kategori kaydı haftalık özeti yeniden zamanlamaz.
- Koç bildirimleri mevcut olay temelli sunucu akışına bağlıdır; yapay bir günlük saat eklenmez.
- Başarısız tercih kaydı son kayıtlı değerleri geri yükler. Öğün alarmını iptal etmek su/aktivite/uyku kuyruğunu temizlemez.
- Faz 3 yeni Prisma alanı, migration, yerel zamanlayıcı veya ses/titreşim sistemi eklemez.

## Son platform fazında açık kalan maddeler

| Platform | Mevcut durum | Gereken doğrulama / çalışma |
| --- | --- | --- |
| Web | Ortak hesap tercihleri ve beş detay akışı tarayıcıda doğrulandı. Haftalık özet ve Koç mevcut uzak bildirim akışını kullanır. | Gerçek Web push teslimi ve izin yaşam döngüsü; su/aktivite/uyku/öğün için tarayıcıda zamanlanmış teslim ihtiyacı. Ayarı kaydetmek teslim doğrulaması değildir. |
| Android | Mevcut JavaScript köprüsü ve iki mevcut yerel kuyruk kullanılır. Tercih/silme/kuyruk ayrımı kontrollü köprü taklitleriyle doğrulandı. | Gerçek cihaz/CI ile izin, uygulama kapalıyken teslim, yeniden başlatma ve eski APK davranışları. |
| iOS | Ortak ürün/hesap modeli iOS'u dışlamaz. Ancak mevcut cihaz kayıt şeması yalnız `android` ve `web` kabul eder; native iOS teslim hattı hazır değildir. | **iOS henüz doğrulanmadı.** Cihaz kaydı, native adaptör ve teslim yaşam döngüsü son platform fazında ele alınmalıdır. |

### Android yenileme ve kuyruk sınırları

- Su çoklu saatleri 7 günlük pencere içinde planlanır; uygulama açılışı/yeniden etkinleşmesiyle mevcut akış yenilenir. Uygulama uzun süre açılmazsa pencere sonunda su bildirimleri tükenebilir. Bu risk çözülmüş sayılmaz.
- Faz 2'nin günde en çok 8 su saati ürün sınırı korunur. Android wellness adaptörünün 128 kayıt sınırı ortak hesap şemasına taşınmaz. Tam su planının 56 kaydı ve mevcut 30'ar günlük aktivite/uyku kayıtları toplam 116'dır.
- Mevcut öğün adaptörü ayrı beslenme kuyruğunda 240 kayıt sınırını korur. Genel öğün takvimi bu cihaz sınırıyla kısaltılmaz.
- Eski köprüde `cancelNutrition` yoksa diğer kategorileri silen `cancelAll` kullanılmaz. Eski APK'da kalan öğün alarmı davranışı gerçek cihazda ayrıca doğrulanmalıdır.
- Mevcut hesap alanı sabit dakika cinsinden saat dilimi farkıdır. Seyahat ve yaz/kış saati geçişleri son platform testlerinde doğrulanmalıdır.

## Faz 3 doğrulaması

- 56 bildirim tarayıcı testi: ana ekran, su akışı ve beş kategori; 390/412/430 px, açık/koyu tema, kayıt hatası ve yeniden yükleme.
- 22 ön yüz birim testi: mevcut yaşam döngüsü ve paylaşılan öğün takvimi/adaptör sınırları.
- 13 izole yerel veritabanı entegrasyon testi: kullanıcı izolasyonu, kuyruk teslim korumaları ve mevcut haftalık kayıtların tekrar oluşturmadan güncellenmesi. Yerel PostgreSQL uyumluluk ortamıdır; üretim PostgreSQL veya cihaz teslim testi yerine geçmez.
- Staging'den gelen dashboard davranışları için 31 mevcut test geçti.
- Ön yüz üretim derlemesi, değişen dosyalarda lint ve ön/arka uç tip kontrolleri geçti. Derlemedeki dört mevcut, görev dışı uyarı devam eder.

Ses/titreşim Faz 4'e aittir; bu fazda geliştirilmedi.

## Faz 4 — Ses, titreşim ve cihaz önizlemesi

- Altı kategorinin mantıksal `soundPreset` ve `vibrationPreset` değerleri mevcut tercih kaydındaki yeni, nullable `categoryAlerts` JSON alanında tutulur. Alan eklenmesi zorunluydu: önceki model kategori sesi/titreşimini saklayacak bir alan içermiyordu. Tek migration eski kayıtları ve plan saatlerini değiştirmeden bu alanı ekler; yayın öncesi uygulanmalıdır.
- Kategori yamaları kullanıcı satırı kilidi altında birleştirilir. Başka kategorinin eşzamanlı ayarı veya cihaz izni/token bilgisi bu yamayla ezilmez. Cihaz izni, donanım yeteneği ve bağlantı durumu hesap modeline eklenmez.
- `Diewish · Damla` ve `Diewish · Nazik`, üçüncü taraf kayıt içermeyen gerçek, özgün PCM WAV dosyalarıdır. `scripts/generate-notification-sounds.py` bunları yeniden üretir; Android ve Web kopyalarının özdeşliği, örnek sayıları ve SHA-256 değerleri test edilir. Sessiz ve sistem varsayılanı da bulunur. Cihazdan ses seçme eklenmez.
- Android'de mevcut bildirim sunumuna bir adaptör eklenir; öğün/wellness zamanlayıcıları ve 240/128 sınırları değiştirilmez. Kısa, çift kısa, uzun ve kısa-uzun desenler bildirim kanallarına eşlenir. Titreşim donanımı yoksa desen seçimi sunulmaz. Ses dinleme gerçek MediaPlayer önizlemesidir.
- Android kanal davranışı oluşturulduktan sonra değiştirilemediğinden kategori/ses/desen kombinasyonlarının en çok 120 sabit kanal kimliği vardır; yalnız kullanılanlar oluşturulur. Kanal grupları kategori bazlıdır. Kanallar silinerek cihaz ayarları geçersiz kılınmaz. Mevcut kapalı eski kanal, yeni kanal/grup engeli ve rahatsız etmeyin önceliği korunur.
- Haftalık özet/Koç için mevcut data-only uzak push paketi mantıksal tercihleri taşır. Mevcut tekrar deneme, cihaz bazlı teslim kaydı ve bildirim kimliğiyle tekrar önleme davranışı korunur. Yeni yerel haftalık/Koç alarmı veya sunucu bildirim kaydı oluşturulmaz.
- Web özel sistem bildirim sesini seçemez; bu seçimler etkin gösterilmez. Gerçek WAV dosyaları sayfada dinlenebilir, fakat sayfa sesi gerçek push teslimi gibi kullanılmaz. Titreşim deseni denetimi sunulmaz. Sessiz bildirim desteği yetenek kontrolüne bağlıdır; destekleyen tarayıcıda `silent` kullanılır ve bununla birlikte `vibrate` gönderilmez.
- Kategori testi yalnız yerel/test ortamında çalışır. Android mevcut köprü üzerinden geçici, 15 saniyelik bir bildirim gönderir; plan/kuyruk/geçmiş/okunmamış sayısı/hesap tercihi yazmaz. Web mevcut service worker üzerinden doğrudan `showNotification` kullanır; uzak sağlayıcı, Firebase token kaydı veya `/notifications/test` çağrısı yapmaz. Üretim alan adları ve üretim native uygulaması bu test yolunda engellenir. Test hatası tercih kaydını bozmaz.
- Başarısız kayıt son kayıtlı iki seçimi geri yükler. Hesap kaydı başarılı fakat cihaz kopyası uygulanamamışsa bunun ayrı hata olduğu açıkça belirtilir.
- Android'e özel ürün dili kaldırıldı: öğün ekranı artık yalnız mevcut cihazın yeteneğini açıklar.
- iOS için ortak model ve yetenek sözleşmesi korunur; yeni native iOS teslim hattı eklenmedi. **iOS henüz doğrulanmadı.**

Faz 4 doğrulaması: 71 bildirim tarayıcı testi (15 yeni ses/titreşim testi dahil), 28 bildirim birim testi, 16 yerel veritabanı entegrasyon testi ve 32 mevcut beslenme planı testi geçti. Yeni ekranlar 390×844 / 412×915 / 430×844, açık/koyu temada ve test düğmesinin görünür dokunma alanıyla kontrol edildi. Ön yüz üretim derlemesi, tip ve değişen dosya lint kontrolleri geçti. Gerçek Web push teslimi, gerçek Android ses/titreşim ve iOS doğrulaması son platform fazında açık kalır.

Android debug derlemesi ve 9 native birim testi (4 yeni eşleme testi dahil) yerel ortamda başarıyla tamamlandı. Bu, gerçek cihazda duyulan ses veya hissedilen titreşim doğrulaması değildir.

Android için yalnız çalışma dalında test/derleme yapan `notification-alerts-native-ci.yml` eklendi. Bu akış staging veya production deploy işlemi yapmaz. İlk CI denemesi testlere ulaşmadan SDK kurulumunda, artık yayımlanmayan `tools` paketi nedeniyle durdu. Akış yalnız `platform-tools` kuracak ve yerel derlemede doğrulanan komut satırı araç sürümünü kullanacak şekilde düzeltildi; SDK 36 ve mevcut derleme hedefleri korunur.

Kaynaklar: [Android bildirim kanalları](https://developer.android.com/develop/ui/views/notifications/channels), [Web showNotification seçenekleri](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification).
