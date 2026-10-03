# Android Dashboard metin yerleşimi — geliştirme ve doğrulama

Tarih: 3 Ekim 2026 (Türkiye). Kapsam yalnız Dashboard kartları ve Journey satırlarıdır.

## Başlangıç ve kapsam

- Depo: `DiyetisyenMehmet/ai-dietitian-platform`
- Dal: `feature/staging-preview`
- Başlangıç ve son kontrol edilen uzak HEAD: `84ccfc43402f7046a244b45402b0703b8efe2318`
- Başlangıç ve uzak TREE: `8fcc4dfe138b0a6a395e9a806db774900543696d`
- Kullanıcının gerçek cihaz görüntüsü `1000444443.jpg` ve 54 saniyelik `1000444445.mp4` incelendi. Görüntüde tarayıcı başlığı görsele, tahlil başlığı durum etiketine taşıyor; videoda Journey başlık ve açıklamaları kesiliyor.
- Android cihazı, ADB veya emülatör bulunmadı. Cihazın sistem yazı ölçeği, WebView sürümü ve çalışırken hesaplanan stilleri ölçülemedi.

## Kanıtlanan neden ve Android'e ilişkin sınır

Kartların önceki mimarisi `21:5` oranını dış çerçevede sabitliyor, canlı metni mutlak koordinatlara bağlıyor, `cqw` ile büyütüyor ve `nowrap` ile satır kaydırmayı kapatıyordu. Tahlil tema kapsayıcısı da aynı sabit yüksekliği dayatıyordu. Metin uzadığında veya büyüdüğünde komşu alanın genişliği ve kartın yüksekliği değişmiyordu. Journey'de başlık ve açıklama `truncate` ile kesiliyor, uzun durum etiketi başlıktan yer alıyordu.

Native `MainActivity.java` sistem yazı büyütmesini geçersiz kılan `setTextZoom` çağrısı yapmıyor. Mevcut CSS `text-size-adjust:100%` yalnız otomatik metin büyütme davranışını hedefliyordu; bunu Android'in kullanıcı yazı ölçeğiyle eşitlemek doğru değil. Chromium'un resmi açıklaması, geleneksel WebView davranışında Android yazı ölçeğinin tüm yazılara uygulanabildiğini ve Chrome ile fark oluşturduğunu doğruluyor:

- https://chromium.googlesource.com/chromium/src/+/b29d63222d10f4c7e620d057578d737969eb7ae3
- https://developer.android.com/reference/android/webkit/WebSettings#setTextZoom(int)

Bu mekanizma cihaz kanıtıyla uyumlu olası tetikleyicidir; bu cihazdaki kesin tetikleyici olarak ölçülmüş değildir. `device-width` ve başlangıç ölçeği zaten tanımlı. Ekran modeli, kullanıcı aracısı veya font küçültme yaması eklenmedi. Global yazı ölçeği, mevcut viewport ve native uzun basma davranışı değiştirilmedi.

## Ölçüm

Chromium 145.0.7632.6 çalıştırıldı. Eski kayıttaki gerçek bileşenlerden üretilen karşılaştırmada 390×844 görünüm, 358 px kart genişliği ve yaklaşık 85.23 px sabit kart yüksekliği ölçüldü. Türkçe karakter kodlaması düzeltilip üretim Inter dosyalarıyla son karşılaştırma yapıldı.

| Yazı çarpanı | Tahlil başlığı/durum çakışması | En büyük tahlil etiket/değer çakışması |
| --- | ---: | ---: |
| %100 | 1.56 px | Yok |
| %130 | 18.56 px | 8.38 px |
| %200 | 58.56 px | 47.38 px |

Önceki ara ölçümler farklı yazı/kodlama koşullarındaydı; yukarıdaki tablo son karşılaştırmadır. Bu bir yerel bileşen karşılaştırmasıdır, kullanıcının düzgün görünen web oturumunun ölçümü değildir. WebView testi yerine geçmez.

## Mimari değişiklik

- Metinler normal belge akışına alındı. Kart yüksekliğini içerik belirliyor; metin boyutu ekran genişliğine bağlanmıyor.
- Mevcut görseller yeniden üretilmedi. Sadece dekoratif ikon ve çizimler kendi SVG pencerelerinde ayrıldı; görsel koordinatları artık canlı metin konumunu belirlemiyor.
- Metin, resim ve ok için ayrılmış alanlar var. Koyu/açık tema aynı düzeni kullanıyor.
- Tahlil başlığı ve açıklaması ile örnek panel esnek yerleşime geçti. Dar alanda panel aşağı geçiyor; başlık/durum ve etiket/değer çiftleri gerektiğinde ayrı satırlara sarılıyor. Paneldeki sabit örnekler görünür olarak etiketlendi ve bağlantının erişilebilir adından çıkarıldı.
- `BloodTestThemeSlot` üzerindeki sabit oran ve mutlak konum kaldırıldı. Yalnız görünen tema yüksekliğe katkıda bulunuyor.
- Koç metni ve eylemi sarılabilir düzende. Eylem yüksekliği en az 44 px. TR/EN metin karşılığı eklendi.
- Journey başlık, açıklama ve durum etiketleri kesilmeden sarılıyor; satır yüksekliği yazıyla büyüyor. Motorun karar ve veri davranışı değiştirilmedi.
- Sonuç bilinçli olarak daha yüksek kartlar ve dar telefonda alt alta tahlil panelidir. Eski banner yüksekliğini koruma iddiası yoktur.

## Doğrulama sonuçları

- Yerel son `npm run build`: başarılı; 61 sayfa üretildi. Değiştirilmeyen dosyalarda dört mevcut lint uyarısı var.
- `npm run type-check`: başarılı; son derleme de tür kontrolünü tamamladı.
- Kart sözleşmeleri, WebView güvenlik sınırları, Journey motoru/kaynakları/aktivasyonu: **74/74 geçti**.
- Gerçek bileşenler ve gerçek Tailwind CSS ile bağımsız Chromium testi: yedek Arial yazı tipinde **33/33**, üretim Inter dosyalarında **33/33 geçti**.
- Her yazı tipi için 8 ekran × 2 dil × 2 tema × 5 ölçek durumu = **160 düzen senaryosu**. İki yazı tipi toplamı 320 senaryo. Ek test gezinme, dokunma, odak, tema geometrisi ve görsel yüklemesini doğruluyor.
- Ekranlar: 320×568, 360×800, 390×844, 412×915, 480×960, 768×1024, 1024×768, 1440×900.
- Ölçekler: %100/%130/%150/%200 yalnız metin büyütmesi; ayrıca kök yazı boyutu %200. Sadece ekran piksel yoğunluğunu değiştirmekle yetinilmedi.
- Kontroller: gerçek metin satırlarının sınırları, yatay taşma, kırpılma, komşu alanların kesişmesi, satır etiket/değer ayrımı, tema yüksekliği eşitliği, var olan resimlerin yüklenmesi, dört bağlantının yerel dokunmayla doğru hedefe gitmesi, klavye odağı.
- `git diff --check`: başarılı.
- Test matrisi mevcut frontend CI işine eklendi; sunucu/veritabanı olmadan çalışır. Bu görev sırasında uzak CI başlatılmadı.

Testte yazı büyütmesi hesaplanmış CSS font boyutlarını değiştirir; Android `WebSettings.textZoom` veya yeni Android doğrusal olmayan erişilebilirlik davranışının birebir emülasyonu değildir. Bileşenler sunucuda gerçek kaynak koddan oluşturulur; hesapla giriş ve React hydration akışının uçtan uca doğrulaması değildir. Mevcut gerçek Dashboard uçtan uca testleri yeni mimariye güncellendi, ancak yerel hesap/veritabanı kurulmadığı için bu oturumda çalıştırılmadı.

## Yeniden çalıştırma

`frontend` dizininde:

```bash
npm ci
npx playwright install chromium
npm run build
DASHBOARD_PRODUCTION_FONTS=1 npm run test:dashboard-layout
node --test tests/dashboard-live-feature-card.test.cjs tests/dashboard-blood-test-card.test.cjs tests/dashboard-webview-parity.test.cjs tests/journey-dashboard-activation.test.cjs tests/journey-engine.test.cjs tests/journey-sources.test.cjs
```

İsteğe bağlı `DASHBOARD_CHROMIUM_PATH` sistemdeki Chromium yolunu, `DASHBOARD_LAYOUT_ARTIFACTS` ekran görüntüsü klasörünü belirler. Bu ortamda Playwright'ın varsayılan indirmesi bozuk döndüğü için Google'ın resmi Chrome for Testing 145.0.7632.6 paketi kullanıldı; bağımlılık sürümleri değiştirilmedi.

## Açık kalan doğrulama

Gerçek Android APK/WebView: sistem yazı ölçeği ve WebView sürümü kaydedilerek varsayılan/büyütülmüş yazıda kartların, uzun basmanın ve gezinmenin kontrol edilmesi gerekir. Bu nedenle genel durum %90; geliştirme ve yerel test tamamlandı, gerçek cihaz ve hesaplı uçtan uca doğrulama tamamlanmadı.

Staging veya production yayını yapılmadı. Main değiştirilmedi. Kod yerel `feature/staging-preview` dalında kaydedildi; uzak dala gönderim yapılmadı.
