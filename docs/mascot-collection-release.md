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
# 21 October 2026 — approved publication after #90

The user explicitly requested publication. #90 is now closed with runtime cutover evidence;
normal staging readiness is 200/database up. PR #91 incorporates current staging
`47d1107732c32aa2bef37a020a92d1900d7920ff` without changing its router or branding.

The legacy general deployment remains blocked. `mascot-test2-release.yml` runs only
on a trusted staging push with `[mascot-split-release]`, after all three mandatory
checks pass for that exact source. Its bounded release does the following:

- Verify fresh immutable legacy Admin tag, Test2 tag, split-aware frontend, source
  identity, separate Test2 secret version 1, disabled automation and PAUSED schedulers.
- Verify Test2 database/role identity and all 50 existing migration checksums. Only
  the two reviewed mascot CHECK expansions may be pending; no other migration is allowed.
- Build both images from the exact source without database access. Apply the two
  migrations through Prisma on the dedicated direct Test2 connection only.
- Prepare no-traffic backend and frontend candidates. Run real synthetic API
  selection/readback for all 16 IDs plus cookie refresh and logout/login persistence;
  delete only the generated synthetic account through its own account API.
- Move the normal Test2 tag and frontend traffic only. Legacy backend default
  traffic and Admin tag stay unchanged. Verify live collection assets, repeat the
  focused public API acceptance and compare Admin routing to its original backend.
- Automatically restore the previous **Test2** tag and split-aware frontend if
  acceptance fails. Expanded CHECK remains backward compatible. This rollback
  preserves the new database and never reverts normal traffic to the unavailable old DB.

No IAM/secret payload/production/Scheduler/APK mutation is included. No mail, AI,
payment or health-data operation is used. Actual device QA remains distinct from
Android browser emulation. Source/CI/runtime evidence will be recorded in PR #91.

