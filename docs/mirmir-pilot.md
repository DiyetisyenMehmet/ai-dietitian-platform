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
