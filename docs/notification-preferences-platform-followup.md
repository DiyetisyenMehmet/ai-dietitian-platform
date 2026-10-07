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
