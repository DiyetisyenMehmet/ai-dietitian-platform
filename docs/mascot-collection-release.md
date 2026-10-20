# Özgün koleksiyon — ortak yayın hazırlığı

Kullanıcı 21 Ekim 2026 tarihinde tek karakter sınırını kaldırdı ve bütün
koleksiyonu ortak staging yayınına hazırlamayı/yayınlamayı istedi. Bu çalışma
önceki Dost PR #83'teki kodu da içerir; Nox için ayrı yayın oluşturulmaz.

## Tam kaynak kapsamı

18 orijinal PNG = 15 kaynak karakter. Aynı karakterin göz kareleri ayrı
karakter sayılmaz. Mevcut Diewish Klasik varsayılan kimliği/görünümü korunur;
arşivdeki tam boy beyaz robot ayrıca Diewish Robot olarak sunulur. Toplam
16 seçim vardır. Arşiv ve kaynak PNG'ler değişmez; her kaynak dosyası
`mascot-collection-assets.json` içinde bir karakter grubuna bağlanmıştır.

Kaynak karakterler: Diewish Robot, Miniş, Bilge, Enerjik, Lina, Bulut,
Yeşil Damla, Minik Bulut, Mırmır, Dost, Nox, Fit, Güçlü, Tombiş, Mini Robot.
İki kaynak adlandırması güvenle doğrulanamadığı için Yeşil Damla ve Minik
Bulut açıklayıcı etiketleri kullanıldı; bunlar Pofi/Mini Dino diye
yanlış adlandırılmadı. Arşivde eski listede tarif edilen yeşil dinozor
referansları yoktur; yeni karakter üretilmez. İsimler görsel incelemede
kesinleştirilebilir, tercihler kararlı kaynak kimlikleriyle saklanır.

Mırmır'ın özgün kullanım dosyaları, 3 sn / yaklaşık 140 ms zamanlaması ve CSS'i
korunur. Mevcut iki kareli bileşen yalnız dosya yolları/kimlik parametreleriyle
genişletilir. Lina ve Bulut özgün göz çiftleriyle aynı hafif altyapıyı
kullanır. Minik Bulut'un iki pozu tek kaynak görselin iki ayrı yarısındadır;
kullanım kopyaları ayrı kareler olarak saklanır, özgün görsel değiştirilmez.
Bu pozlar el/gövde hareketi de içerdiğinden zorla göz kırpma yapılmaz.
Diğer tek pozlu karakterler statiktir. Kuyruk/nefes/baş deformasyonu, video,
zamanlayıcı paketi ve hareket aç/kapat kontrolü eklenmez.

Uygulama yalnız seçilen karakterin dosyalarını gösterir. Profil resimleri
512×512 kayıpsız, gerçek alfa kanallı WebP'dir; Image'ın mevcut tembel
yüklemesi korunur. Üretim komutu:
`python3 scripts/prepare-mascot-collection.py /path/to/extracted/archive`.
Görünür renk ve alfa, kodlama öncesi kullanım karesiyle karşılaştırılır.

## Kayıt ve uyumluluk

Tek mevcut hesap tercihi/SelectedMascot yolu genişletilir. Klasik varsayılan,
Mırmır ve Dost kimlikleri ile eski animationEnabled kayıtları korunur.
Hesap izolasyonu, kayıt hatasında geri dönüş ve Koç P2 kodu değişmez.

Dost'un önceki geçişi ile tam koleksiyon geçişi sırayla mevcut CHECK
kısıtını genişletir. Tablo/sütun/varsayılan veya kayıt silinmez/değiştirilmez.
Ortak yayında bu geçişler doğru staging DB'de uygulanmadan yeni backend/UI
yayınlanmamalıdır. Yeni kimlikler kullanılırken kısıtı daraltan rollback
uygulanmaz; eski uygulama sürümüne dönmek için genişletilmiş kısıt korunabilir.

## Yayın için gözlenen gerçek engel

Salt okunur incelemede `https://staging.diewish.com/api/health` 200 dönüyor;
bu yalnız sürecin ayakta olduğunu gösterir, DB erişimini kanıtlamaz.
`https://staging.diewish.com/api/health/ready` ise 503,
`SERVICE_UNAVAILABLE`, `Database is not reachable`, `database: down` döndü.

GitHub #90 aynı alan adını koruyarak Neon Test 2'ye geçişi ele alıyor;
eski DB kota engeli ve paylaşılan Admin bağlantısı/geri dönüş koşulları
henüz bu görevde çözüldüğü kanıtlanmış değildir. Genel staging yayın iş
akışı eski DB secret'ına migration çalıştırabilir. Bu yüzden onu körlemesine
tetiklemek, DB değiştirmek, Admin'i yeni veritabanına taşımak veya scheduler
açmak bu maskot yayınının güvenli bir yolu değildir.

Bu engel kalkmadan yayın tamamlandı olarak raporlanmaz. Kaynak/CI paketi
hazırlanır; #90 geçişinin sorumlusu ile mevcut staging DB, Admin izolasyonu
ve doğru secret referansı doğrulandıktan sonra aynı test edilmiş kayıt
üzerinden yetkili ortak yayın sürdürülebilir. Production/main değişmez.
