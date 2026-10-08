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

- Faz 2/3/4 davranışında çoklu su saatleri yalnız 7 günlük pencereye materialize edildiği için uygulama açılmazsa son kayıtlı saatten sonra tükeniyordu. **Faz 5 bu pencere tükenmesini mevcut Android kuyruğunda haftalık tohum yenilemesiyle giderir; aşağıdaki cihaz/OS istisnaları sürer.**
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


## Faz 5 — Kalıcılık, izinler ve cihaz yaşam döngüsü

### Hesap ve cihaz sınırı

- Altı kategori bayrağı, günlük/haftalık program, çoklu su saatleri ve mantıksal ses/titreşim hesapta kalır. Tercih API'si bilinmeyen alanları artık reddeder: permission, push token, channel, haptic yeteneği ve Android `repeatDays` bu modele eklenmez.
- Gerçek auth servisinde giriş → tercih kaydı → çıkış → tekrar giriş ve yeni Prisma istemcisiyle okuma testi; tüm kategori değerlerini ve başka hesap izolasyonunu kapsar. Tarayıcı testleri yenileme, yeni oturumda tekrar yükleme ve kayıt hatasında geri dönüşü kapsar.
- Profil çıkışı eski JS-readable refresh token koşulunu kaldırarak mevcut cookie-session logout servisini her zaman çağırır. Önce cihazın sunucu bağı çözülür, ardından yerel token/ses kopyası temizlenir. Auth store oturum temizliği bütün mevcut native kuyrukları, cihaz geçmişini ve bekleyen açılış hedefini temizler; bir eski köprü metodunun hatası diğer temizleme adımlarını atlamaz. Sunucu unregister ve token silme çevrimdışıyken best-effort olmaya devam eder.

### İzin davranışı

- Detay ve ses ekranları izin durumunu canlı okur. Hesap açık/kapalı seçimi cihaz izniyle karıştırılmaz. İzin kapalı/default/unsupported durumunda tercih kaydı teslim başarısı gibi gösterilmez.
- Web izin API'si, focus, visibility ve destekleyen tarayıcılarda Permissions API change olayları izlenir. Reddetme site ayarlarına yönlendirir; hiçbir permission değeri hesap PATCH'ine yazılmaz. Desteklenmeyen API sahte granted üretmez.
- Android runtime izin kontrolü, bildirim yöneticisi ve sadece cihazda saklanan permission-requested işareti kullanılır. Hiç sorulmamış durum user gesture ile istenir; reddedilmiş durum uygulamanın sistem bildirim ayarlarını açar. Eski APK'da istek işareti bulunmuyorsa Android'in public API'si kesin geçmiş ayrımı vermez; UI yalnız iznin gerektiğini söyler. İzin kararı sonrası yeniden okuma yapılır, başarı varsayılmaz.
- App resume'daki mevcut `diewish:notification-state` olayı UI ve hesap/cihaz eşlemesini yeniler. Native permission/exact alarm değişimi senkronizasyon imzasına dahildir; başarısız kuyruk kabulü başarılı imza gibi önbelleğe alınmaz. Açık uygulamada mevcut 60 saniyelik kontrol su planının gün değişimini de izler.

### Su kuyruğunun yenilenmesi

- Önceki plan, sonraki 7 takvim günü içinde son su alarmından sonra bitiyordu; saatine göre 7 gün dolmadan bitebilirdi. Aynı günün geçmiş saatleri artık sonraki haftanın aynı günündeki ilk gelecek tohum olarak da dahil edilir: her seçili haftalık slot tam bir kez temsil edilir.
- Yeni Android adaptörü su tohumuna device-only `repeatDays: 7` ekler. Tek mevcut `WellnessReminderScheduler` alarmı tüketirken aynı kayıt/PendingIntent'i sonraki yerel takvim haftasına taşır; kuyruk büyümez. Yeni WorkManager/JobScheduler/başka alarm yenileme sistemi kurulmaz.
- Yenileme **bildirim izni kontrolünden önce** yapılır. İzin kapalıyken yeni bildirim gösterilmez, hesap tercihi değişmez, su tohumu tükenmez. Yeniden izin verildiğinde gelecekteki saatler kullanılabilir; kaçırılan bildirimler topluca gönderilmez.
- Cihaz reboot ve exact-alarm erişimi geri verildiğinde mevcut receiver'lar kayıtlı su tohumlarını ilk gelecek haftaya taşır. Launch/resume native tarafta ağ gerektirmeden kayıtlı kuyruğu onarır; authenticated WebView sync güncel hesap ayarlarını yeniden alır. Kapalı/iptal edilmiş veya eski occurrence'a ait bir broadcast bildirim üretemez.
- Kalender hafta eklemesi yerel saat ve haftanın gününü DST geçişlerinde korur; sabit 168 saat kullanılmaz. Saat dilimi/sistem saati değişince mevcut güvenli iptal davranışı korunur ve hesap programı bir sonraki authenticated resume'da yeniden kurulur.
- Günde 8 su saati → en çok 56 su tohumu; mevcut 30 aktivite + 30 uyku kaydıyla en çok 116. Native 128 ve ayrı öğün 240 sınırları değişmez. Faz 5 native wellness limit üstü payload'ı eski geçerli kuyruğu bozmadan reddeder.
- **Kalan sınırlar:** Kullanıcı force-stop yaparsa OS alarm/broadcast çalıştırmayabilir; yeniden launch gerekir. OEM güç yönetimi/gecikme fiziksel cihazda doğrulanmadı. Eski APK yenileme metadata'sını tanımaz; yeni APK'nın güncel hesabı bir kez senkronize etmesi gerekir. Başka cihazdan yapılan opt-out, çevrimdışı native cihaz sunucuya bağlanana kadar bilinemez. Aktivite/uyku mevcut 30 günlük, öğün mevcut plan süresiyle sınırlı davranışını korur.

### Test bildirimi ve migration hazırlığı

- Ana tercihler ekranındaki test artık mevcut kategori/device preview adaptörünü kullanır; `/notifications/test` uzak tanılama yoluna gitmez. Kategori önizlemeleriyle aynı üretim ortamı ve yetenek korumaları geçerlidir.
- Eski 1 dakikalık native test de ephemeral sunuma yönlenir: inbox/unread/hesap/kuyruk kaydı bırakmaz. Sabit tek PendingIntent ile tekrar testler birikmez; logout/cancelAll bunu iptal eder. Haftalık özet/Koç yeni yerel alarm veya server queue satırı oluşturmaz.
- Faz 5 schema veya migration eklemez. Faz 2 `20261007124500_water_reminder_schedule`, ardından Faz 4 `20261007160000_notification_category_alerts` gerçek SQL'i, eski kullanıcı verisi ve nullable alanlarla izole ortamda uygulandı. Bayraklar/saatler korundu, yeni alanlar NULL kaldı.
- Entegrasyon sırasında mevcut `start:migrate` giriş noktası migration'ları yeni backend trafik almadan önce sıralı uygular. Yeni kodun migration'dan önce başlaması yeni sütun bulunamadı hatasına neden olur. Şema geri alınırken JSON sütunları DROP edilmez; eski uygulama bu ek sütunları görmezden gelebilir. DROP veri kaybına yol açar. Staging/production migration uygulanmadı.
- Native iOS adaptörü ve native cihaz kayıt/delivery hattı eklenmedi. Ortak tercih modeli cihaz sınırları veya Android kanal ID'si içermediği için gelecekte iOS adaptörü tarafından kullanılabilir. **Native iOS hattı henüz mevcut değil / doğrulanmadı.**

### Faz 5 doğrulama kapsamı

- 82 bildirim tarayıcı senaryosu; 390×844, 412×915 ve 430 px açık/koyu tema, yenileme/yeni oturum, kayıt hatası, canlı cihaz izni ve cookie-session çıkış temizliği. Ana ekran görselleri CSS giriş animasyonu bittikten sonra alınır. Yerel tarayıcı Chromium 134 headless motorudur; gerçek API'nin verdiği reddedilmiş izin doğrulandı. Diğer izin geçişleri kontrollü native köprü senaryolarıdır; gerçek kullanıcı izin penceresi veya uzak Web push teslim testi değildir.
- 58 ön yüz testi (34 bildirim + 24 mevcut Dashboard/layout), 41 arka uç birim/regresyon testi, 18 bildirim entegrasyon testi ve 24 native test: toplam 223 ayrı senaryo. Tekrar çalıştırmalar toplamı artırmaz. Ön yüz üretim derlemesi, ön/arka uç tip kontrolleri ve değişen ön yüz dosyalarında lint geçti.
- Gerçek, izole PostgreSQL 17 üzerinde nullable migration sırası, legacy kullanıcı verisi, yeniden girişte kalıcılık, eşzamanlı kategori yamaları, hesap izolasyonu ve mevcut remote teslim/tekrar önleme davranışları kontrol edilir. Bu geçici CI veritabanıdır; staging veya production'a erişmez.
- Android kontrollü Robolectric testleri 120 kanal eşlemesini, gerçek native payload ses/titreşim desenlerini, geçici kategori testini, izin ve cihaz donanım sınırlarını, su yenilenmesi/reboot/eski broadcast korumasını ve öğün kuyruğu ayrımını kapsar. Bu, fiziksel cihazda duyulan ses/hissedilen titreşim veya OEM arka plan teslim doğrulaması değildir.
- [Çalışma dalı platform CI kontrolü](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/37698325486): Android test/debug derlemesi ve gerçek PostgreSQL entegrasyonu. Akış yalnız çalışma dalında test çalıştırır; deploy yapmaz.
