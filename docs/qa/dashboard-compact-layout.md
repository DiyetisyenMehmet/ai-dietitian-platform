# Dashboard — normal ölçekte kompakt görünüm

3 Ekim 2026. Önceki `android-dashboard-reflow.md` raporunun devamıdır; bu değişiklik, önceki rapordaki bilinçli yüksek kart tercihini kaldırır. Akış içinde yerleşim ve büyütülmüş yazı güvenliği korunur.

## Başlangıç ve kapsam

- Güncel uzak dal yeniden alındı: `feature/staging-preview`.
- Başlangıç HEAD: `63ac83e2a8141a27ce8aad4b02b1d8206efb24da`.
- Başlangıç TREE: `68fbcca835ae1c8a9b97d404a41d5dfee1b12fa5`.
- Başka çalışmaların CI/güvenlik değişiklikleri korundu. Çalışma dalı: `fix/dashboard-compact-scale`.
- Kullanıcının bu turdaki görselleri: normal telefonda küçük Food görseli, alta düşmüş ve aşırı yüksek Blood paneli, yüksek Progress/Coach kartları.
- Production, main, staging yayını veya uzak dala yazma bu değişikliğin kapsamına alınmadı.

## Regresyonun nedeni ve düzeltme

Sorun responsive akışın kendisi değildi. Food görseli, ikon/ok/kenar boşluklarından sonra kalan dar gövdenin yalnız %30'unu alıyordu. Blood metni ve paneli için `10rem + 13rem` tercih edilen genişlikler, normal telefon gövdesine bile sığmıyordu. Coach metninin `12rem` tercihi düğmeyi gereksiz yere alta atıyordu. Büyük iç boşluklar ve bütün kartlarda aynı büyük yazı hiyerarşisi yüksekliği artırıyordu.

- Food görseline ayrı, normal ölçekte **124 px** genişlik ayrıldı. Metinle görsel `flex-wrap` ile yalnız tercih edilen genişlikler sığmadığında alt alta geçer. Progress görseli **116 px**.
- Blood paneli `width: max-content; max-width: 100%; flex: 0 1 auto` kullanır. Tercih edilen panel genişliğini gerçek etiket/değer metinleri belirler. Büyüyen yazı bu genişliği artırır ve alan yetmediğinde panel sonraki satıra geçer. Telefon modeli, kullanıcı aracısı veya viewport genişliğine özel geçiş listesi yoktur.
- Blood etiketleri/değerleri **12 px** kaldı; büyütme engellenmedi. Panel boşlukları azaltıldı. “Örnek görünüm” etiketi görünür biçimde açıklamanın altına alındı; beş örnek satır ve tüm değerler korundu.
- Başlık/açıklama hiyerarşisi kompakt kart ölçülerine döndü: 13/11.5 px; Coach 12/11 px. Bunlar `rem` tabanlı tasarım boyutlarıdır; metin büyümesini tersine çeviren ölçekleme yoktur.
- Coach metni ve en az 44 px yüksekliğindeki düğme normal telefonda yan yana kalır; gerektiğinde sarılır.
- Sabit kart yüksekliği, sabit 21:5 oranı, canlı metin için mutlak koordinat, `cqw`, `nowrap`, kırpma veya `setTextZoom` eklenmedi. Native/viewport/Journey davranışı değiştirilmedi.

## 390 × 844 / %100 karşılaştırması

Aynı Chromium 145.0.7632.6, üretim Inter dosyaları, TR/light, 358 px kart genişliği. Eski `84ccfc` bileşen kaydı, değişiklik öncesi `63ac83e` kaynaklarının bağımsız kopyası ve güncel gerçek bileşenler karşılaştırıldı. Eski görsellerin gecikmeli yüklenmesi de beklendi.

| CSS px | Eski kompakt `84ccfc` | Büyüme regresyonu `63ac83e` | Düzeltme |
| --- | ---: | ---: | ---: |
| Food yüksekliği | 85.23 | 132.48 | 101.33 |
| Blood yüksekliği | 85.23 | 306.84 | 114.00 |
| Progress yüksekliği | 85.23 | 111.69 | 90.05 |
| Coach yüksekliği | 67.31 | 135.09 | 81.88 |
| Ayrılmış Food görsel genişliği | Ayrı alan yoktu | 72 | 124 |

Eski yüksekliğin piksel eşiti hedeflenmedi: metin/görsel ayrımı, okunabilir 12 px Blood satırları ve 44 px Coach dokunma hedefi korunur. Eski örnekte başlık/görsel çakışması vardı; bu davranış geri getirilmedi.

390 px'de %120: Food 117.41, Blood 166.25, Progress 97.14, Coach 94.06 px. Blood paneli sağdadır. %130'da gerçek genişlik ihtiyacı alanı aşınca Blood aşağı geçer. 320 px / %130 ekranında hem görsel hem panel alt satıra geçebilir; içerik kesilmez.

## Testler ve sonuç

- Üretim Inter ile **50/50 Chromium testi geçti**.
- 9 ekran: 320×568, 360×800, 390×844, 412×915, 430×932, 480×960, 768×1024, 1024×768, 1440×900.
- Her ekran TR/EN × light/dark; %100/%120/%130/%150/%200 yalnız metin büyütmesi ve %200 kök yazı boyutu. 36 test grubu içinde 216 taşma/çakışma senaryosu.
- 390/412/430 × TR/EN × light/dark için ayrıca %100/%120/%130 kompaktlık kontrolleri. Üretim yazı tipinde %100 üst sınırlar: Food 108, Blood 118, Progress 94, Coach 88 px. Görsel genişliği/alanı, panelin sağda kalması, Coach düğmesinin konumu ve Blood satırlarının 12 px kalması doğrulanır.
- 320/%130 için aşağı geçiş ve tüm beş satırın varlığı ayrıca kontrol edildi. Tema geometrisi, var olan görsellerin yüklenmesi, odak, dokunma hedefleri ve bağlantılar da geçti.
- Yedek yazı ailesinde 38 güvenlik/işlev testi ve 12 kompaktlık testi geçti. Daha geniş sistem yazı tiplerine yalnız satır yüksekliği toleransı tanınır; üretim Inter kabul sınırları değişmez.
- Negatif kontrol: yeni 390/%100 kompaktlık testi eski `63ac83e` kaynaklarında **beklendiği gibi başarısız**: Food 132.48 px, sınır 108 px. Sadece “taşma yok” testinin kaçırdığı regresyon yakalanır.
- Kart sözleşmeleri, WebView korumaları ve Journey testleri **74/74 geçti**.
- `npm run build`: başarılı, 61 sayfa. Değiştirilmeyen dosyalardaki dört mevcut lint uyarısı devam eder. `npm run type-check` ve `git diff --check` geçti.
- Hesaplı Dashboard uçtan uca testleri yeni kompaktlık şartları ve dar ekran alt satır davranışı için güncellendi; yerel backend/hesap kurulumu olmadığı için çalıştırılmadı.

## Sınır ve yeniden üretme

ADB/Android emülatörü/gerçek cihaz erişimi yoktur. Metin büyütmesi hesaplanmış CSS yazı boyutlarına uygulanır; Android `WebSettings.textZoom` emülasyonu değildir. Görüntüler gerçek kaynak bileşenlerden oluşan yerel test sayfasıdır; APK veya giriş yapılmış tüm Dashboard görüntüsü değildir. Gerçek cihaz kabulü açık kalır.

`frontend` içinde, derleme bittikten sonra:

```bash
npm run build
DASHBOARD_PRODUCTION_FONTS=1 DASHBOARD_LAYOUT_ARTIFACTS=test-results/compact-final npm run test:dashboard-layout
```

Gerekirse `DASHBOARD_CHROMIUM_PATH` test tarayıcısını seçer. Test otomatik olarak `dashboard-390-text-100.png`, `dashboard-320-text-130.png` ve tam sayfa/tema/stres eklerini üretir. Üretim font testini `.next` dosyalarını yeniden yazan build işlemiyle eşzamanlı çalıştırmayın.


## Visual regression correction follow-up

The compact baseline keeps the responsive reflow architecture, with two visual corrections from the approved dashboard reference:

- Food reserves 132 px for the right artwork at ordinary phone widths and removes the rounded inner-artwork frame so the meal image reads as part of the card rather than a sticker.
- Blood Test restores the source-art blood tube beside the compact preview. The preview and tube form one responsive summary group: they stay on the right at 390/412/430 px and 100% text, then move below the copy when intrinsic width no longer fits.
- Blood preview rows use a smaller 10 px baseline than the main description while still participating in text enlargement.
- The layout matrix includes 320×568, 360×640, 360×800, 375×667, 390×844, 412×915, 430×932, 480×960, 600×960, 768×1024, 800×1280, 1024×1366 and the existing desktop checks.
- No Journey business logic, Android native code, global text scaling, production configuration or deployment marker is changed.
