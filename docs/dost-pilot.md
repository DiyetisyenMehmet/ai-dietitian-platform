# Dost — tek karakter pilotu

Görev: DIEWISH-MASCOT-NEXT-CHARACTER-A1 / GitHub #78.
Başlangıç staging HEAD: `6729a834809698fabf5ab341b9f5d2c608e2094e`.
Başlangıç TREE: `b0d832d28e8b84955757d6dc51be2be6b588d871`.

## Kaynak doğrulaması

Kullanıcının `MASKOTLAR.zip` dosyası adı ZIP olsa da gerçek biçimi 7z'dir.
Arşiv bozuk değildir; 18 PNG içerir. Orijinal arşiv ve 18 dosya değişmedi.
İsim, boyut ve SHA-256 envanteri `mascot-source-inventory.json` içindedir.
Dosya adı sırası, karakter sırası olarak kullanılmadı.

13 Ekim 2026 onaylı özgün koleksiyon sırasındaki Mırmır → Dost → Nox
bölümü esas alındı. Dost, oradaki yeşil fularlı sevimli köpektir.
Kullanıcının bu arşivindeki eşleşen özgün dosya:
`file_000000006fd08246914408e28b7c792b.png` (1254×1254).
SHA-256: `94fd65f8b9158455d631833bd75f707c267cc3c8d811368d95692e481312bd8c`.
Mırmır'ın iki karesi ayrıca önceki kaynak kayıtlarıyla birebir eşleşir.
Diğer karakterlerin çiftleri yeni karakter sayılmadı veya elenmedi.

Dost için yalnız göz açık tek poz var. Göz kapalı kare üretilmedi; karakter
yeniden çizilmedi ve yapay hareket eklenmedi. Bu pilot bilinçli olarak statiktir.

## Kullanım kopyası ve entegrasyon

`python3 scripts/prepare-dost-assets.py /path/to/extracted/archive`
yalnız doğrulanmış kaynaktan 512×512 kayıpsız WebP kullanım kopyası üretir.
Tam kare aynı oranda küçültülür; kırpma, renk veya alfa temizliği yapılmaz.
Kodlanmış dosyanın alfa ve görünür renkleri, küçültülmüş kareyle karşılaştırılır.
Dosya: `frontend/public/images/mascots/dost/still.webp`; 190.858 bayt.
Gerçek alfa kanalı vardır; dama deseni/video kullanılmaz.
Kaynak/çıktı kimlikleri ve şeffaf piksel sayıları `dost-assets.json` içindedir.

Mevcut `SelectedMascot`, hesap tercihi ve seçim ekranına yalnız `dost`
kimliği eklendi. Ana sayfa Koç bannerı, Koç başlığı ve karşılama aynı
seçimi kullanır. Yerel ikinci tercih deposu, yeni servis veya zamanlayıcı yoktur.
Sabit Dost hiçbir durumda animasyon çalıştırmaz; hareket azaltma/arka plan
durumlarında da statiktir. Mırmır'ın bileşeni, CSS'i, görselleri ve
3 saniye / yaklaşık 140 ms davranışı değişmez. Klasik varsayılan kalır.
Eski `animationEnabled` API alanı korunur; arayüzde hareket anahtarı yoktur.

## Mevcut veritabanı kısıtının genişletilmesi

`mascotId` sütunu TEXT olsa da eski geçiş yalnız classic/mirmir değerlerini
kabul eden CHECK kısıtı koymuştur. Sadece TypeScript listesine Dost eklemek
kayıt hatasına neden olur. Yeni `20261020110000_dost_mascot_preference`
geçişi, aynı kısıta `dost` ekler. Satır, sütun, varsayılan ve kullanıcı
verileri değişmez; eski geçiş değiştirilmez. İşlem atomiktir.

Ortak yayında önce bu geçiş normal yayın süreciyle uygulanmalı, ardından
yeni sunucu ve arayüz birlikte yayınlanmalıdır. Bu PR staging'e birleştirilmez
ve gerçek sunucuda geçiş/yayın yapılmaz. Eski uygulamaya dönüş gerekirse
genişletilmiş kısıt korunabilir; kullanıcıların Dost seçimi silinmez. Dost
kayıtları varken kısıtı daraltan/veri silen bir geri dönüş uygulanmamalıdır.

## Doğrulama ve sınırlar

- Tür denetimi, mevcut tercih/oturum ve Koç P2 birim kontrolleri.
- Gerçek yerel test veritabanında Dost kaydı, ikinci oturumdan okuma,
  kullanıcılar arası izolasyon, kart düzeni/legacy alan koruması ve geçersiz kimlik reddi.
- Gerçek uygulama tarayıcısında seçim/kayıt/yenileme/ikinci oturum,
  başarısız kayıtta doğrulanmış seçimin korunması ve Klasik'e dönüş.
- 390/412/430 px mobil ve 1280 px masaüstü, açık/koyu tema, banner sınırları,
  metinle çakışmama, kaynak yükleme ve durağanlık; Mırmır regresyonu.

CI yalnız izole sentetik test hesaplarını ve test veritabanını kullanır.
Fiziksel Android cihaz testi yapılmış sayılmaz; final QA'ya aittir.
Yeni Android kabuk kodu veya APK gerekmez. İnceleme/birleştirme/ortak yayın
yöneticiye bırakılır. Bu PR'dan sonra başka maskota geçilmez.
