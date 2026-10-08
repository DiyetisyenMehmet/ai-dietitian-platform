============================================================
RAPORU VEREN ÇALIŞAN:
🧰 Çalışma Modu 2
============================================================

GÖREV:
WORKMODE-NOTIFICATION-PREFERENCES-A1

# Faz 6 — Entegrasyona hazırlık

Tarih: 2026-10-08. Yeni ürün özelliği eklenmedi. Staging'e birleştirme, deploy, database migration veya production/main işlemi yapılmadı. Çalışma dalı `feature/workmode-notification-preferences-a1`; force push kullanılmadı.

## Doğrulanan kaynaklar

- Staging HEAD: `f11b0ba708a6902b13fe1a700febfc2c16442300`
- Staging TREE: `97e4070aeec4829091f2fc5c8f789da3cbff9d92`
- Doğrulanan kod/CI HEAD: `49cf2148850a0d0aa526cc2d1af014996220a1dd`
- Doğrulanan kod/CI TREE: `4a44210483d626c99d0ca5f220d412c802998337`
- Başlangıçta çalışma dalı staging'den 12 kayıt ileride / 0 gerideydi; güncel staging zaten içeriliyordu. Dashboard ürün kaynakları staging ile aynı kaldı.
- [Platform CI doğrulaması](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/37774137364). Bu akış yalnız çalışma dalında test/derleme yapar. Son rapor belge kaydından sonraki remote HEAD/TREE'yi ayrıca verir.

## Yapılan sınırlı düzeltmeler

- Öğün planı ekranı izin verilmişken de focus, visibility ve mevcut native izin olayını izler. Sistem izni sonradan kapandığında eski etkin teslim açıklaması kalmaz; yalnız öğün alarmları iptal edilir. İzin geri geldiğinde mevcut plan kurulur. Hesap tercihi veya su/aktivite/uyku kuyruğu bu işlemle değiştirilmez.
- Next ve eşleşen ESLint ayarı 15.5.25 → 15.5.27 güvenlik yama sürümüne alındı. Yalnız CSS derlemesinde kullanılan `tailwindcss-animate` geliştirme bağımlılığına taşındı; tema/sınıflar/ürün davranışı korunur. Büyük Tailwind sürüm geçişi yapılmadı.
- Dashboard'ın eski kaynak testi güncel staging'in onaylı küçük yazı boyutlarına uyarlandı. Dashboard ürün kodu değiştirilmedi.
- Migration doğrulayıcı gerçek 40 kayıtlık staging migration geçmişini, mevcut ham ödeme/cihaz tabloları dahil kullanır. Yeni şema eklemez. Node ES module biçiminde lint kontrolünden geçer; yalnız localhost/127.0.0.1 üzerindeki sabit test veritabanı adına izin verir.
- Native regresyon testi 240 öğün sınırını, plan değiştirilince eski alarmların temizlenmesini ve wellness kuyruğunun korunmasını birlikte kontrol eder. Ses ekranı görüntüleri sayfa başında, giriş animasyonu kapalı alınır; sabit başlık ekran görüntüsünün ortasına taşınmaz.

## Test sonuçları

| Kontrol | Başarılı senaryo |
| --- | ---: |
| Ön yüz birim/yerleşim testleri | 184 |
| Arka uç birim/regresyon testleri | 265 |
| Bildirim, gerçek oturum, hesap izolasyonu, Dashboard ve Koç entegrasyonu — PostgreSQL 17 | 26 |
| Tarayıcı uçtan uca kontrolleri | 99 |
| Android native birim/Robolectric kontrolleri | 25 |
| Toplam ayrı senaryo | 599 |

Tekrar çalıştırmalar toplamı artırmaz. Ön/arka uç tip kontrolleri ve derlemeler, ilgili ön/arka uç lint kontrolleri ve Android debug derlemesi geçti. 390×844, 412×915, 430 px açık/koyu tema; ana ekran, kategori detayları, çoklu su planı/sheet ve altı ses ekranı kontrol edildi. Dashboard/Koç paneli ayrıca büyük yazı, klavye, odağın korunması ve kaydırma açısından kontrol edildi.

Ön yüz üretim derlemesindeki dört önceden mevcut görev dışı uyarı (auth-service kullanılmayan eski parametre, admin audit effect bağımlılığı, barcode ikon import'u, plan geçmişi effect bağımlılığı) sürer; hata değildir.

### Kapsanan bildirim davranışları

- Altı kategori aç/kapat, mevcut program/saat/gün, kayıt, yenileme ve yeniden girişte kalıcılık, başarısız kayıtta son başarılı değere dönüş, mantıksal ses/titreşim.
- Su: günlük/haftalık mod, çoklu saat, en çok 8, gün aç/kapat, ekle/sil, kopyalama, hafta içi/sonu işlemleri ve kontrollü temizleme.
- Android su tohumları mevcut scheduler içinde yenilenir; 56 su + 30 aktivite + 30 uyku = en çok 116 wellness kaydı. 128 wellness ve ayrı 240 öğün sınırı korunur. Haftalık yenileme, reboot, eski/iptal yayın koruması ve izin reddedilirken yenileme kontrol edilir.
- Öğün: aktif plan kimliği/saatleri, Premium/Plus, FREE ve bitmiş plan korumaları, gece yarısı, eski plan alarm temizliği ve diğer kuyruğun korunması. Beslenme planı üretim kodu değiştirilmedi; mevcut üretim/güvenlik testleri geçti.
- Haftalık özet/Koç: mevcut sunucu teslimi, sahip izolasyonu, eşzamanlı claim, sınırlı retry ve data-only payload. Haftalık düzenleme yalnız uygun gelecekteki teslim edilmemiş kaydı değiştirir; teslim edilmiş, diğer kullanıcıya ait veya Koç kaydı değişmez. Yeni yerel duplicate yoktur; Koç olay temelli kalır.
- Damla/Nazik gerçek, Web/Android kopyaları eş WAV assetleridir. Native 120 kategori/ses/titreşim kanal eşlemesi ve dört desen + kapalı kontrol edilir.
- Test: mevcut cihaz önizlemesi, ortam/izin/yetenek koruması; uzak test endpoint'i, backend kuyruğu, geçmiş, okunmamış sayısı, kota veya preference yazısı yok. Test başarısızlığı tercihi bozmaz.
- Cihaz izni, token, channel ve donanım yeteneği hesap tercihine yazılmaz. İzin default/granted/denied/unavailable ve sonradan değişim ayrı gösterilir; eksik API başarı üretmez. Çıkış ve süresi dolan oturum yerel cihaz temizliğini çalıştırır.

## Migration durumu

1. `20261007124500_water_reminder_schedule`: mevcut tercih satırına nullable JSONB.
2. `20261007160000_notification_category_alerts`: mevcut tercih satırına nullable JSONB.

Gerçek PostgreSQL 17'de tüm 42 migration boş veritabanına uygulandı. Ayrı veritabanında staging'in gerçek ilk 40 migration'ı uygulandı, eski kullanıcı/bayrak/saat kaydı eklendi ve iki ek migration Prisma deploy ile sırayla uygulandı. Her iki migration ledger'ı 42 tamamlanmış kayıt; iki alan nullable JSONB; eski saat 13:55 ve açık bayrak korunuyor, yeni alanlar NULL. Yeni kullanıcı/default tercih oluşturma da çalışır. Staging kaynak şemasının farkı yalnız bu iki optional hesap alanıdır.

Staging veritabanına migration uygulanmadı; canlı staging migration ledger'ı bu görevde doğrudan okunmadı. Entegrasyonun mevcut `start:migrate` adımı yeni backend trafiğinden önce çalışmalıdır. Eski uygulamaya dönülürse additive sütunlar tutulmalı; DROP ile tercih verisi silinmemeli.

## Güvenlik/bağımlılık durumu

Ön/arka uç `npm audit --omit=dev` sonucu sıfır açık; CI de bunu doğrular. Tam ön yüz taraması geliştirme araçlarının `braces` açık kaydını 7 dolaylı paket yolunda raporlar. Arka uç tam npm audit komutu süre sınırında kesildi; aynı kilit dosyasındaki 360 kamu paketinin npm advisory bulk sorgusu tek doğrudan `braces` uyarısı gösterdi. `npm ls` yolu bunun geliştirme ESLint/TypeScript parser zincirinde olduğunu doğrular.

Bu uyarı gizlenmedi veya override ile susturulmadı. Mevcut güvenilir kaynak glob'larını işleyen derleme/lint araçlarına aittir; kullanıcı bildirimi, saat planı, sunucu preference API'si veya production bağımlılığı değildir. Büyük derleme aracı geçişi bu ürün görevinin dışında bakım maddesi olarak kalır. Denetim tarihi itibarıyla tam geliştirme bağımlılığı taraması sıfır açık değildir.

## Platformlar ve kalan QA

- 🌐 Web: gerçek Chromium 134 motorunda arayüz, kayıt, oturum, mobil temalar ve gerçek izin API'sinin reddedilmiş sonucu doğrulandı. Diğer izin geçişleri kontrollü köprü/API senaryolarıdır. Özel sistem sesi/titreşim desteği sahte şekilde açılmaz. Gerçek kullanıcı izin penceresi ve uzak Web push teslimi ayrı QA'da; bunlara PASS verilmedi.
- 📱 Android: 25 kontrollü native test ve debug derlemesi başarılı. Bu fiziksel cihazda duyulan ses, hissedilen titreşim, OEM arka plan teslimi veya gerçek FCM teslimi doğrulaması değildir. Bunlara PASS verilmedi. Yeni native davranışın dağıtımı ayrıca onaylı yeni APK gerektirir.
- 🍎 iOS: ortak hesap modeli iOS'u dışlamaz; cihaz kayıt hattı hâlen yalnız Android/Web kabul eder. **Native iOS hattı henüz mevcut değil / doğrulanmadı; PASS verilmedi.**

Fiziksel Android/iOS kontrolleri ayrı çapraz platform QA hattında kalır. Su yenilenmesinin force-stop/OEM güç yönetimi, saat dilimi değişimi sonrası mevcut iptal/yeniden senkronizasyon, eski APK ve çevrimdışı başka cihaz opt-out sınırları sürer. Aktivite/uyku mevcut 30 günlük, öğün plan süresi sınırını korur; bu faz yeni scheduler kurmaz. Gerçek sunucu/push provider yapılandırması bu lokal/CI kontrollerinin yerini almaz.

## Sonuç

**READY FOR INTEGRATION — kendi teknik doğrulama kapsamı tamamlandı.** Yukarıdaki fiziksel platform QA ve geliştirme aracı bakım maddeleri açıkça ayrıldı. Entegrasyon/deploy için ayrı kullanıcı onayı gerekir. Faz 6 sonunda duruldu.
