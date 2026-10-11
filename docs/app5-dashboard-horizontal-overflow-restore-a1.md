# APP5-DASHBOARD-HORIZONTAL-OVERFLOW-RESTORE-A1

Raporu veren çalışan: 🛠️ Uygulama Çalışan 5.

## Kaynak ve sınır

- Uzak staging işe başlarken yeniden doğrulandı: HEAD `1558d93f37b37a6de9874ec23e7be4c9dfb90f42`, TREE `2f5e941dfe15db17094307830954fe2d3da57abf`.
- Çalışma dalı: `feature/app5-dashboard-horizontal-overflow-restore-a1`.
- Kullanıcının `1000448355.mp4` mobil Web ve `1000448356.mp4` Android kayıtları incelendi. Her iki kayıtta Dashboard üzerindeki uzun ad, yatay hareket ve kaybolan/yanlış hizalanan alt menü aynı örüntüyü gösteriyor. Android kaydında diğer sekmelerin menüsü görünür kalıyor.
- Koç senkronizasyonu, braces güvenlik düzeltmesi, auth/session modeli, Android kaynakları, kart ürün davranışları ve QA altyapısı değiştirilmedi. Staging/main birleştirmesi veya yayın yapılmadı.

## Kesin kök neden

`DashboardHomeHeader` ilk boşluğa kadar olan adı seçiyor, fakat boşluksuz adın uzunluğunu sınırlandırmıyordu. `min-w-0 flex-1` h1 kutusunu daraltıyor; `whitespace-nowrap` içindeki metnin kutu dışına taşmasını önlemiyordu. Metin, simgelerin üzerinden geçip belge genişliğini büyütüyordu.

Gerçek mobil Chromium 153.0.8010.12, üretim Dashboard bileşenleri ve aynı sentetik API verileriyle 390×844 ölçümünde:

| Ölçüm | Önce, normal ad | Önce, uzun ad | Sonra, uzun ad |
| --- | ---: | ---: | ---: |
| documentElement.clientWidth | 390 | 390 | 390 |
| window.innerWidth | 390 | 514 | 390 |
| documentElement.scrollWidth | 390 | 514 | 390 |
| body.scrollWidth | 390 | 514 | 390 |
| window.innerHeight | 844 | 1113 | 844 |
| visualViewport genişlik/yükseklik | 390/844 | 390/844 | 390/844 |
| Alt menü üst/alt koordinatı | 770.5/844 | 1039.5/1113 | 770.5/844 |

Uzun adın gerçek metin aralığı 498.0625 px genişlikte; sağ sınırı 514.0625 px idi. h1 kutusunun sağ sınırı 294 px, simgelerinki 300–374 px idi. Taşan eleman doğrudan h1 içeriğidir.

Mobil tarayıcı genişleyen belgenin yerleşim viewport'unu büyüttüğünde, zaten `fixed inset-x-0 bottom-0` olan menü de 514×1113 yerleşim alanına hizalandı. Görünür alan 390×844 kaldığı için menü ekranın altına düştü. Menü atalarında hesaplanan `transform` değerleri `none`; Dashboard animasyonu menünün atası değil. Yatay taşma ve menünün kaybolması için ayrı bir transform/z-index nedeni bulunmadı.

Git geçmişinde `8fddefd` dar ekran için h1 sınırlandırmasını eklemiş; `8af2c38` bunu kaldırmış. `7913b72` ilk ad seçimine geçmiş, fakat boşluksuz uzun ad sorunu devam etmiş. Düzeltme mevcut kompakt tasarımı değiştirmeden bileşenin metin sınırını geri kurar.

Ek olarak %130 yazıda dar ekranda alt menü etiketi iki satıra geçiyor. Gerçek menü yüksekliği 99.875 px; eski içerik payı 96 px. İlk düzeltme turunda son içerik alt sınırı 603.765625 px, menü üstü 600.125 px ölçüldü: 3.64 px örtüşme vardı. Bu nedenle yalnız yatay taşma düzeltmesi içerik açıklığı sözleşmesini tamamlamıyordu.

## Ürün düzeltmesi

1. Yalnız h1 üzerinde `overflow-hidden text-ellipsis` kullanılır. Mevcut ilk ad, tek satır, yazı boyutu, satır yüksekliği ve simge geometrisi korunur. Tam metin DOM ve erişilebilir başlıkta kalır; title da tam selamlamayı içerir. Belgeye global overflow gizleme eklenmez.
2. `BottomNavigation`, kendi border-box yüksekliğini `ResizeObserver` ile ölçer ve yalnız kendi AppShell kapsayıcısına `--bottom-navigation-height` yazar. Border-box gözlemi güvenli alt padding değişimlerini de kapsar. Kaydırmada ölçüm/polling veya rastgele gecikme yoktur; temizlemede gözlemci ve değişken kaldırılır.
3. AppShell normal akışta mevcut 96 px + safe-area alt payını korur; gerçek menü daha yüksekse menü + mevcut 20 px içerik aralığını ayırır. Fill modunda (Koç) alt alan gerçek menü yüksekliği kadar ayrılır. Menüdeki fixed, z-index, ikonlar, metinler, aktif sekme ve tema sınıfları aynıdır.

`dashboard-view.tsx`, `globals.css`, yemek görseli, ilerleme grafiği, Koç kartı, Journey, metrikler ve hızlı işlem bileşenleri değiştirilmedi.

390×844, aynı veriler ve normal yazıda önce/sonra h1, simgeler, üç kart ve hızlı işlem kutularının tüm koordinat/genişlik/yükseklik değerleri birebir eşittir. Yemek/ilerleme kartları 358×85.234375 px, Koç 358×67.3125 px; hızlı işlemler yaklaşık 115.33×72 px kalır. Normal ad görünümü korunur; uzun adın belgeyi genişletmesi sona erer.

## Otomatik doğrulama

- Yeni `frontend/tests/dashboard-viewport-layout.test.cjs` gerçek Next uygulamasını yerel sunucuda açar. CSS metnini kontrol etmekle yetinmez. API yanıtları sentetiktir; staging hesabı/şifresi veya oturum depolaması enjekte edilmez. Bu bir auth uçtan uca testi değildir.
- 320/360/390/412/430/768 px × normal/uzun boşluksuz ad × açık/koyu tema × %100/%130 yazı: 48 senaryo.
- Her senaryoda gerçek belge genişlikleri, fiziksel ekranla karşılaştırılan innerWidth, scrollX, başlık/simge ayrımı, dört metrik, kart genişliği, eşit hızlı işlemler, beş görünür/tıklanabilir menü öğesi ölçülür. Uzun detay alanı açılır; beş aşağı/yukarı kaydırma ve yatay kaydırma girişimi yapılır. En altta içerik menünün üzerinde kalır.
- %100 ve %130 yazıda CDP `Emulation.setSafeAreaInsetsOverride` ile gerçek CSS env değeri 34 px yapılır; 844→700→915→844 yükseklik değişimleri denenir. Bu tarayıcı viewport değişimi testidir; gerçek adres çubuğu veya Android sistem arayüzü testi olarak sunulmaz.
- Diğer test gerçek sekme tıklamalarıyla Beslenme/Koç/İlerleme/Profil/Dashboard geçişini, tema ve bildirim düğmelerini, kişiselleştirmede klavyeyle sıralamayı/Kaydet'i ve yeniden açıldığında sıranın korunmasını doğrular.
- Toplam yeni tarayıcı testleri: 51. Mevcut frontend testleri: 205/205 PASS. Backend birim testleri: 265/265 PASS. Backend testi mevcut CI'ın sentetik test ortamı değerleriyle, gerçek staging secret'ları olmadan çalıştırıldı.
- Frontend tür kontrolü, üretim derlemesi ve lint başarılı. Değiştirilen bileşenler/yeni test için ESLint sıfır uyarı/hata; genel lint'te değişmeyen dört mevcut uyarı var.
- Frontend/backend tam bağımlılık audit: 0 açık. İki katmandaki mevcut braces GHSA derinlik kontrolü PASS. Paket manifestleri/lock dosyaları/vendor değiştirilmedi.

Yerel eski/sonraki derlemeler karşılaştırılırken Next runtime route-cache eski bundle'a işaret edebildi. Son ölçümler mevcut immutable build seed dosyalarından yapıldı; eski üretilmiş runtime cache temizlendi. Yeni test sunucunun gerçekten güncel Dashboard bundle'ını sunduğunu da doğrular; eski cache ile testi geçirmenin yolu yoktur.

## Son yatay taşma ve alt menü sonuçları

| Ekran | html/body genişliği (uzun ad) | Menü üstü, başlangıç | Menü üstü, en altta | scrollX |
| --- | --- | ---: | ---: | ---: |
| 320×700 | 320/320 | 610 | 610 | 0 |
| 360×800 | 360/360 | 726.5 | 726.5 | 0 |
| 390×844 | 390/390 | 770.5 | 770.5 | 0 |
| 412×915 | 412/412 | 841.5 | 841.5 | 0 |
| 430×932 | 430/430 | 858.5 | 858.5 | 0 |
| 768×1024 | 768/768 | 950.5 | 950.5 | 0 |

Tablo %100 yazı/açık tema örneğidir; matrisin tüm 48 durumunda belge taşması ve scrollX sıfırdır. 320 px/%130 yazıda gerçek menü 99.875 px, içerik payı 119.875 px olur; en alt içerik 580.296875 px, menü üstü 600.125 px. Yazı ve ikonlar küçültülmez.

## Android sınırı ve teslim

Gerçek Android APK/WebView testi ve yeni APK derlemesi bu ortamda çalıştırılmadı: Android SDK/ADB/emülatör ve KVM bulunmuyor. Mobil Chromium sonucu Android PASS değildir. Native kaynak incelemesinde MainActivity'nin sistem barı/display-cutout insets'lerini WebView dışından padding ile ayırıp tükettiği, textZoom=100 kullandığı doğrulandı; bu davranışa dokunulmadı. Gerçek cihazda uzun ad, dikey kaydırma, tüm sekmeler, tema ve sistem alt çubuğu tekrar kontrol edilmelidir.

Geliştirme ve yerel tarayıcı/test kapsamı tamamlandı; gerçek Android doğrulaması açık kaldığı için toplam tamamlanma %90. Entegrasyon adayı: **READY FOR INTEGRATION**. Staging/main'e merge/deploy veya force push yapılmaz.

## Yeniden çalıştırma

`frontend` içinde temiz üretim derlemesiyle:

```bash
npm ci
npx playwright install chromium
# Önce eski üretilmiş .next klasörünü çalışma alanından kaldır/ayır.
NEXT_PUBLIC_API_BASE_URL=/api npm run build
node --test tests/dashboard-viewport-layout.test.cjs
node --test tests/*.test.cjs
npm run type-check
npm run lint
npm audit
node ../scripts/security-braces-depth-guard.cjs frontend
```

`DASHBOARD_VIEWPORT_ARTIFACTS` verilirse sentetik önce/sonra karşılaştırması için son ekran görüntüleri ve tüm matris ölçümleri yazılır. Bunlar gerçek hesaplı Android kanıtı değildir.
