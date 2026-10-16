# Diewish Mırmır pilotu

Görev: DIEWISH-MASCOT-COLLECTION-A1-MIRMIR-PILOT

Profil → Maskot tercihleri alanında yalnız Diewish Klasik ve Mırmır bulunur.
Varsayılan Klasik kalır. Seçim, ana sayfadaki mevcut Koç bannerının karakter
alanı ile Koç başlığı/karşılama karakteri için geçerlidir. Mesaj simgeleri ve
Koç kayıt/yanıt/senkronizasyon sistemi değişmez.

## Hesap tercihleri

Mevcut `dashboard_card_preferences` tablosuna yalnız iki görsel tercih alanı
eklenir. `GET /api/account/mascot` okur; `PATCH /api/account/mascot` yalnız
gönderilen alanı değiştirir. Kimlik doğrulaması mevcut kullanıcıdan alınır.
Başka kullanıcı kimliği, sağlık verisi ve bilinmeyen maskot kabul edilmez.
Kart düzenleme işlemi maskot tercihini; maskot işlemi kart düzenini ezmez.

Tek ortak tercih sağlayıcısı iki ekranı besler. Seçim sunucudan doğrulandıktan
sonra uygulanır. Yükleme/kayıt hatası görünürdür ve tekrar yükleme sunulur.
Hesap değişiminde eski hesap yanıtları uygulanmaz. Sayfa dönüşü, pencere odağı
ve uygulama ön plana gelmesi sunucudaki tercihi tekrar doğrular. Sürekli
sunucu sorgulaması yapılmaz. Aynı hesaptaki diğer cihaz tercihi geri dönünce
alır; bu davranış gerçek Android cihazında ayrıca doğrulanmalıdır.

## Görseller ve hareket

Yönetici referans paketindeki iki özgün PNG dosyası, bu sohbetin yüklediği
iki dosyayla SHA-256 düzeyinde aynıdır. Paket ve özgün dosyalar değişmez.
Uygulama için ayrı 512×512 şeffaf, kayıpsız WebP dosyaları üretildi.
İki kare aynı kırpma, ölçek ve merkezlemeyi kullanır; karakterin görünür
sınırları kullanım çözünürlüğünde en fazla bir piksel farklıdır.
Toplam boyut 366.766 bayttır. Kulaklar, kuyruk ve minder görünür kalır.
Üretim komutu: `python3 scripts/prepare-mirmir-assets.py /path/to/pilot`.

Göz kırpma 5,6 saniyede bir 140 milisaniye sürer. Sabit iki görsel arasında
kesikli görünürlük değişir; boyut/konum hareketi, ses, video ve sürekli
JavaScript zamanlayıcısı yoktur. Kapalı kare yüklenmeden animasyon başlamaz.
Tercih kapalıyken, sayfa gizliyken, karakter ekran dışındayken, sayfa arka
plana geçtiğinde ve mevcut Android görünürlük bildirimi pasifken durur.
Hareket azaltma tercihi iki CSS animasyonunu tamamen kaldırır.

## Doğrulama

- `frontend`: `npm run type-check`, `npm run build`
- `frontend`: `node --test tests/mascot-preferences.test.cjs`
- `frontend`: `npm run test:coach-sync`
- `frontend`: `npx playwright test e2e/mascot-preferences.spec.ts --workers=1`
- `backend`: `npm run type-check`, `npm run build`, `npx prisma validate`
- `backend`: `node --import tsx --test src/integration/mascot-preferences.integration.test.ts`

Pilot testleri mevcut Hardening CI hattına dahil edilmiştir. Tarayıcı testi
iki ayrı gerçek tarayıcı oturumunda hesap tercihini doğrular; bu, fiziksel
Android testi değildir. Hareketin görsel doğallığı, gerçek cihazda kaydırma
ve pil tüketimi kapsamlı son kalite kontrolünde ayrıca değerlendirilmelidir.
Test ortamına yayın için mevcut üç yayın kapısının aynı kod kimliğinde
başarılı olması ve başka yayınla çakışma olmaması gerekir.

Diğer 16 görsel, canlı ortam ve ana dal bu pilotun kapsamı dışındadır.

## Mırmır hareket A2

Özgün PNG ve kullanılan iki WebP aynı kalır. Hafif, yerel SVG yer değiştirme
alanı yalnız sağ kıvrık kuyruk ucunu hareket ettirir; görsel kesilmez, kuyruk
silinmez veya yeniden çizilmez. Yumuşak sınırlar katman dikişi, çift kuyruk
ve altından açılan şeffaf boşluk üretmez. Gövdenin üst alanında en fazla
yaklaşık 3 kaynak pikseli (%0,6) nefes hareketi uygulanır. Minder sabit kalır.
10,4 saniyelik döngünün son 2 saniyesinde iki küçük kuyruk salınımı vardır;
nefes döngünün önceki bölümündedir. Göz kırpmanın iki özgün karesi ve
5,6 saniyelik zamanlaması aynen korunur.

SVG tarayıcının kendi animasyonunu kullanır. Yeni görsel isteği, video,
üçüncü taraf hareket paketi, JavaScript zamanlayıcısı veya sunucu değişikliği
yoktur. Mevcut görünürlük/Android/ekran dışı kontrolleri tüm hareketi kapatır.
Hareket azaltma ayarında SVG animasyon elemanları kaldırılır; ek CSS koruması
filtreyi de kaldırır. Kapalı göz karesi yüklenmezse sabit açık kare korunur.
Yer değiştirme haritası okunamazsa nötr harita ile sabit görsele dönüşür.

`tests/mirmir-motion-browser.cjs` gerçek JSX/CSS ve WebP dosyalarının
Chromium/WebKit çıktısında kuyruk, nefes ve minder bölgelerinin piksel
farkını; 56px kullanım boyutunu; 390/412/430 genişlik ve açık/koyu zemini
ölçer. Önce/sonra kayıtlarını GitHub kontrol çıktısında saklar. Bu bağımsız
görüntü testi uygulama oturumlarını taklit etmez; mevcut
`e2e/mascot-preferences.spec.ts` gerçek uygulamada durdurma, kayıt ve Koç
başlığı davranışlarını ayrıca doğrular. Fiziksel Android, pil/işlemci
ölçümü ve kullanıcının görsel onayı ayrı son kalite kontrolüdür.


## Mırmır A4 — Onaylanan videonun entegrasyonu

Görev: MIRMIR-A4-DIRECT-INTEGRATION. Kullanıcı renk önizlemesini gördükten
sonra 16 Ekim 2026 tarihinde hareketli maskot olarak kullanılmasını onayladı.
`approved-a4.mp4` onaylanan `Mirmir-Referans-Renk-Onizleme.mp4` dosyasının
birebir kopyasıdır: 1280×720, 24 kare/sn, 240 kare, 10 saniye, 2.307.407 bayt.
Video sesi her zaman kapalıdır. Yeni hareket, arka plan temizliği veya renk
üretimi yapılmadı. Videonun başlangıç/sonu doğal olarak eşleşmez; HTML video
10 saniyelik özgün akışı tekrar başlatır, ileri/geri kurgu uygulanmaz.

**Şeffaflık sınırı:** Kullanıcıya açıklandığı üzere bu H.264/yuv420p MP4 gerçek
alfa içermez; dama deseni görüntüye işlenmiştir. Onay bu dosyanın gösterilen
hali içindir. Video şeffaf diye raporlanmaz. Sabit alternatif gerçek alfa
kanallı `still-a4.png` dosyasıdır; mevcut kayıpsız `eyes-open.webp` görselinin
512×512 PNG kodlamasıdır, pikselleri ve karakter tasarımı aynıdır.

A2 SVG kuyruk/nefes deformasyonu ve iki kareli göz kırpma kaldırıldı. Eski
özgün görseller silinmedi. Ortak `MirmirMascot` bileşeni ana sayfa Koç bannerı,
Koç başlığı/karşılama ve mevcut tercih önizlemesini besler. Klasik varsayılan,
hesap tercihleri ve Koç P1/P2 kodu değişmez.

Oynatıcı yalnız animasyon tercihi açık, sayfa/Android uygulaması aktif,
maskot ekran içinde ve hareket azaltma kapalıyken oluşturulur. Bu koşullardan
biri kaybolduğunda oynatıcı durdurulur, kaynak kaldırılır ve video çözücüsü
serbest bırakılır. Koşullar geri geldiğinde özgün akış baştan oynar. Ağ,
biçim veya otomatik oynatma hatasında sabit PNG kalır. Sabit çerçevede
`object-fit: contain` kullanılır; karakter kesilmez, çevreye taşmaz. Video
Klasik/animasyon kapalı/hareket azaltma durumlarında istenmez. 2,31 MB video
onaylanan hali korumak için yeniden sıkıştırılmadı.

Android WebView `setMediaPlaybackRequiresUserGesture(false)` ile sessiz
video otomatik oynatmasına izin verir. Bu bir WebView medya politikasıdır;
mevcut ilk taraf gezinme, çerez, köprü ve ağ güvenliği ayarları değişmez.
Kullanıcı tercihi ve uygulama görünürlük kontrolleri web bileşeninde uygulanır.
Yeni Android kabuk ayarı ancak güncel APK kurulduğunda geçerlidir.

`playwright.mirmir-video.config.ts` gerçek Next uygulamasında sentetik API
cevaplarıyla masaüstü ve Android Chrome emülasyonunu test eder: gerçek kare
ilerlemesi, sessizlik/inline/loop, ekran dışı ve native arka plan, sekme
ömrü, azaltılmış hareket, ağ hatası, tercih kapalı/açık ve Klasik dönüşü.
Üç mobil genişlikte taşmama ve açık/koyu banner kanıtları alınır. Bu test
fiziksel Android/WebView testi değildir. `mascot-preferences.spec.ts` iki
sunucu hesabı oturumunda tercih kalıcılığı kontrolünü korur.
