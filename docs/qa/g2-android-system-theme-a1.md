# G2 / A1 — Android sistem teması ve açılış tutarlılığı

Kimlik: 🛠️ UYGULAMA ÇALIŞANI 9  
Yönetici: 👑 UYGULAMA YÖNETİCİSİ 8  
Görev: https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/120  
Tarih: 27 Ekim 2026  
Sonuç: **PARTIAL (kısmi tamamlandı)**. Kod ve belirtilen otomatik kontroller hazır; yeni sürüm fiziksel Android kabulü **%0 / yapılmadı**. Görev tamamlanma: **%90**. Birleştirme, yayın ve APK yok.

## Kaynak ve sahiplik

Başlangıç staging HEAD (son kayıt): `9ea4bf7cd43a1147a600e9b1d48cf716bb280129`. TREE (kod ağacı): `c6c9d9a00b9696d650752325516ec6d1cd8e2b4b`. Dal: `feature/staging-preview`. Çalışma dalı: `feature/app9-g2-android-system-theme-a1`.

#118 yönetim kuralı ve #120 okundu. Dosya kapsamı, düzenlemeden önce [#120 yorumunda](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/120#issuecomment-6443520360) bildirildi. PR #119 ve açık auth/OTP PR'larının dosya listeleri kontrol edildi. Journey veya auth/OTP ürün dosyaları değiştirilmedi. Ek dosyalar yalnız mevcut tema sarmalayıcısı, MainActivity'nin `uiMode` yapılandırması, sunum kaynakları, ilgili testler ve eski iki durumlu düğmeye bağlı test seçicileridir. Başka çalışan dalı değiştirilmedi. Logo, marka görselleri ve oranları değişmedi.

## Kök neden

1. `next-themes` varsayılanı `system` olsa da eski düğme yalnız `light` veya `dark` yazıyordu. Bunlar bilinçli manuel tercihtir; sistem değişiminin bunları ezmemesi doğrudur. Kusur, kullanıcının görünür bir seçenekle tekrar sistem otomatiğine dönememesiydi.
2. Android başlangıç yüzeyi `Configuration.uiMode` ile, Web ise saklı `theme` ve `matchMedia` ile belirleniyordu. Native katman saklı Web tercihini bilmiyordu. Yalnız sistem çubuğu rengini değiştirmek WebView'in ortam tercihiyle aynı şey değildir.
3. Mevcut başlangıç kapısı route/auth/brand hazır oluşunu ve `postVisualStateCallback` sonucunu bekliyordu; ancak tema sınıfı ile `color-scheme` çözümünün tutarlı olmasını aramıyordu. Tema değişiminde MainActivity'nin varsayılan yeniden oluşturulması da WebView belgesini tekrar yükleyebilirdi.

Kaynaklardan kanıtlanan bunlardır. GitHub'daki fiziksel kayıt özeti sonuç kanıtıdır; bu çalışma yeni bir fiziksel telefon kaydı üretmedi. Kullanıcının kaydındaki tek kök nedenin kesin olarak bunların tümü olduğu ileri sürülmez.

## Değişiklikler

- Mevcut görünüm düğmesi, klavye/fokus desteği olan mevcut iletişim kutusunda üç açık tercih sunar: **Sistemle aynı (otomatik), Açık, Koyu**. Seçili tercih ve kısa açıklaması görünür. Admin yolunda eski düğme davranışı korunur; Admin dosyası veya yetkileri değiştirilmez.
- Aynı `next-themes` sağlayıcısı, `theme` depolama anahtarı ve `system` varsayılanı korunur. Toplu tercih sıfırlama/migration (veri dönüştürme) yoktur. Eski manuel tercihler, çıkış ve yeniden açma sonrasında da korunur.
- Mevcut ThemeProvider, çözülmüş tema gerçekten HTML sınıfına ve `color-scheme` değerine uygulandıktan sonra mevcut `DiewishSystemUi` sunum köprüsüne haber verir. Önceki Android sürümlerinin `setDarkTheme` yolu korunur. Köprü yokluğu Web girişini engellemez. Admin bu normal uygulama eşitlemesine girmez.
- Android yalnız `system/light/dark` görünüm tercihini özel yerel tercihlerinde aynalar. Hesap veya sağlık verisi, kimlik anahtarı, oturum bilgisi veya sunucu tercihi eklenmez. Android 12+ üzerinde `setApplicationNightMode` uygulamanın sonraki sistem açılış temasını da bildirir; cihaz genelindeki `setNightMode` kullanılmaz.
- `system` için uygulamaya özel `MODE_NIGHT_AUTO` çağrısının AOSP uygulaması yerel gece override'ını (zorlamayı) `UI_MODE_NIGHT_UNDEFINED` yapar; böylece yeniden cihaz yapılandırmasını izler. Cihazın konum/gece saati ayarına erişim veya izin eklenmez.
- MainActivity yalnız `uiMode` değişimini kendisi ele alır; mevcut WebView korunur. Geceye göre tema nitelikleri, WebView arka planı ve çubuk ikon kontrastı eşitlenir. Açık/koyu kaynaklarda `isLightTheme` açıkça tanımlanır, otomatik renk ters çevirme kapalıdır. Yeni açılış katmanı veya logo animasyonu eklenmez.
- Başlangıç kapısı önceki origin (kaynak), route/auth/brand ve gerçek çizim koşullarını korur; geçerli `color-scheme` ve ona uyan `.dark` sınıfını da arar. Yüzey rengi, son Web çerçevesinin sonucuna göre gerçek çizim geri çağrısından önce uygulanır. Bekleme sırasında tema/rota değişirse gözlem tekrar kurulabilir. Rastgele bekleme, asgari süre veya yeni ağ isteği yoktur.

## Sistem / Açık / Koyu matrisi

| Cihaz/tarayıcı tercihi | Diewish seçimi | Beklenen görünüm | Otomatik kanıt |
|---|---|---|---|
| Açık | Sistem | Açık; sistem değişimini izler | Chromium + native yapılandırma modeli |
| Koyu | Sistem | Koyu; sistem değişimini izler | Chromium + native yapılandırma modeli |
| Açık | Açık | Açık, manuel kalır | Chromium + native yerel tercih modeli |
| Koyu | Açık | Açık, manuel kalır | Chromium + native yerel tercih modeli |
| Açık | Koyu | Koyu, manuel kalır | Chromium + native yerel tercih modeli |
| Koyu | Koyu | Koyu, manuel kalır | Chromium + native yerel tercih modeli |

Bu altı birleşim 390/412/430px'de: toplam 18 tarayıcı senaryosu. Her biri saklı tercih, soğuk `/dashboard` → `/login`, auth beklemesinin korunması, ilk gözlenen içerik karelerinde doğru tema, mevcut marka, register/reset/login ve yeniden açmayı kapsar.

## Test kanıtı

- **48 hedefli Android birim testi: PASS (başarılı), 0 atlanan.** Robolectric 4.17: `LaunchPresentationTest` 20 (API 28/33), `SystemThemeTest` 8 (API 28/33), `SessionCookiePersistenceTest` 8, `GoogleAuthBridgeTest` 12. Yeni yapılandırma testleri aynı WebView kimliğini ve değişmeyen yükleme sayısını, çubuk ikon kontrastını, kalıcılığı, geçersiz/güvenilmeyen sunum sinyallerini denetler. Son gözlem tekrar kurma düzenlemesi ardından yalnız ilgili 20 açılış testi tekrar denetlendi.
- **6 yeni ön yüz birim testi: PASS.** Tema/DOM uyuşmazlığında erken native bildirim yok; eski köprü desteği; manuel tercih; Admin ayrımı ve eski düğme eylemi; köprü hatasında uygulamanın devamı; gözlem temizliği.
- **23 farklı tarayıcı senaryosu: PASS.** 18 matris senaryosu, yeni kurulum + canlı/arka planda dondurma simülasyonu + manuel seçimden sisteme dönüş, gerçek Java kaynak metninden alınan hazır olma koşulunun çözülmemiş/çelişkili temayı reddetmesi, Admin giriş ayrımı, iki sistem temasında giriş → dashboard → çıkış. İlk çalışmada 20/21 geçti; Admin giriş sayfasında aslında bulunmayan eski tema düğmesini bekleyen yeni test varsayımı düzeltildi. Ardından yalnız ilgili/değişen dört senaryo geçti; başarılı 18 matris yeniden başlatılmadı.
- TypeScript tür denetimi, değişen ürün/test TypeScript dosyalarında ESLint (kod denetimi) ve değişen JavaScript testlerinde sözdizimi kontrolü: PASS.
- Marka dosyaları, Firebase/Google köprü kodu, çerez güvenliği, kamera, barkod, hatırlatıcı, ödeme/abonelik, Admin/RBAC, backend ve veritabanı dosyaları değiştirilmedi. Ürün güvenliği gevşetilmedi. Testler sentetik yerel yanıtlarla, gerçek hesap ve hizmet çağrısı olmadan çalıştı.

Komutlar (depo kökünden; Playwright ön yüz dizininde):

```bash
node --test frontend/tests/system-theme.test.cjs
# frontend dizininde:
npx tsc --noEmit
npx playwright test --config=playwright.system-theme.config.ts
# Android; APK paketleme görevi yok:
gradle --no-daemon -p android :app:testDebugUnitTest \
  --tests com.diewish.app.LaunchPresentationTest \
  --tests com.diewish.app.SystemThemeTest \
  --tests com.diewish.app.SessionCookiePersistenceTest \
  --tests com.diewish.app.GoogleAuthBridgeTest \
  -PDIEWISH_WEB_BASE_URL=https://staging.diewish.com
```

Yerel araçlar: Gradle 9.6.0, JDK (Java geliştirme araçları) 17, SDK 36; Chromium Headless Shell 153.0.8010.12. Yerel ağ vekili ve güvenilir sertifika deposu test çalıştırıcısına verildi; TLS (şifreli bağlantı) doğrulaması kapatılmadı. Playwright indirme uç noktası çalışmadığında aynı sürüm resmi Chrome for Testing deposundan alındı. Bunlar proje ayarı/bağımlılık değişikliği değildir.

## Ek tam derleme kontrolündeki engel

`npm run build` denemesi **FAIL (başarısız)**: `Noto_Sans_Arabic` için `next/font/google` yükleyicisinde `TypeError: Cannot read properties of null (reading '1')`, `google/loader.js:122`. `src/app/layout.tsx`, yazı tipi tanımları, Next sürümü ve bağımlılık kilidi bu görevde değişmedi. Bu ek hatanın kesin kök nedeni bu görevde doğrulanmadı; tema değişikliğinden bağımsız olduğu yalnız hata konumuna bakılarak kesin ilan edilmez. Font/bağımlılık altyapısına kapsam dışı düzeltme eklenmedi. Yukarıdaki tür, geliştirme tarayıcısı ve Android testleri geçerlidir; tam üretim derlemesi veya yayın hazır olma PASS değildir.

Bu engel nedeniyle, üretim derlemesi gerektiren mevcut geniş Dashboard paketi çalıştırılmadı. Mevcut test seçicileri yalnız yeni üç seçenekli kontrolün gerçek eylemine uyarlandı; o eski paketlerin yeniden PASS olduğu ileri sürülmez. Yeni iki gerçek React dashboard/giriş/çıkış senaryosu ve 18 dar tema matrisi çalıştırıldı.

## Performans ve sınırlar

Kodda yeni timeout (zaman aşımı beklemesi), yapay splash süresi, ağ turu veya sayfa yenileme yoktur. Önceki görsel durum geri çağrısı korunur. Tema değişiminin yeniden yükleme yapmaması native yapılandırma modelinde ve tarayıcıdaki belge sayacında doğrulandı. Test geliştirme sunucusunun ilk rota derlemesinde Fast Refresh yeniden yükleme kaydı vardır; bu bir üretim açılış süresi ölçümü olarak sunulmaz. #45'in performans QA işi yeniden yapılmadı. Fiziksel açılışta milisaniye karşılaştırması yoktur; gerçek cihazda hız/parıltı kabulü bekliyor.

Önemli geçiş sınırı: güncelleme öncesinden yalnız Web depolamasında bulunan manuel tercih, Android'in henüz hiç aynalamadığı ilk yükseltme açılışında OS (işletim sistemi) starting window (ilk sistem penceresi) tarafından okunamaz. İlk başarılı Web eşitlemesi o açılıştaki mevcut yüzeyi düzeltir ve Android 12+ sonraki sistem açılışı için tercihi kaydeder. Tercih sıfırlanmaz. Android 8–11'de sistemin süreç başlamadan çizdiği ilk pencerenin karşıt manuel tercihle tam eşleşmesi de bu kod/testlerle garanti edilmez. Bu kenarlar ayrı cihaz kabulünde özellikle görülmelidir; kusursuz ilk OS karesi iddia edilmez.

Chromium'un sistem tercihi ve dondurulmuş sayfa deneyi gerçek Android WebView değildir. Robolectric, gerçek WebView `matchMedia` değişimini veya fiziksel klavye/sistem çubuğu çizimini çalıştırmaz. Android emülatör ve yeni APK fiziksel testi yapılmadı; APK üretimi yasak olduğu için test kapsamı genişletilmedi.

Yöneticiye sıradaki işlem: tek PR'ın kod incelemesi; ayrı izinli ortak APK kabulünde ilk kurulum/eski manuel tercih yükseltmesi, Android 12+ sistem açılışı, ön/arka plan tema değişimi, gerçek klavye ve sistem çubukları, giriş/çıkış ve açılış hızı. Issue fiziksel final kabul bitmiş sayılmadan kapatılmamalı.

## Resmi kaynaklar

- https://developer.android.com/develop/ui/views/layout/webapps/dark-theme — WebView `prefers-color-scheme` ve `isLightTheme` bağı.
- https://developer.android.com/develop/ui/views/theming/darktheme — Sistem/Açık/Koyu ve uygulamaya özel gece modu.
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/UiModeManagerService.java — `setApplicationNightMode` içinde AUTO/CUSTOM → tanımsız uygulama gece zorlaması.
