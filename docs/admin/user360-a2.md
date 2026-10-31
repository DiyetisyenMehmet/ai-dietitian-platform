# A2 — Global kullanıcı araması, Kullanıcı 360 ve Tanı Merkezi

Mevcut AdminShell ve `/admin/users/:id` geliştirilir. Yeni kullanıcı yönetimi,
route, tanı endpointi veya yetki sistemi oluşturulmaz.

## Veri ve yetkiler

- Global arama: mevcut `GET /admin/users`, `users.read`, açık form gönderimi,
  en fazla 10 sonuç. E-posta araması mevcut davranışı korur; geçerli tam UUID
  yalnız o hesabı getirir. UUID içeren başka bir e-posta eşleşmez.
- Ad/soyad araması DEFERRED. User.fullName için arama indeksi yok;
  bu turda yeni tarama maliyeti veya migration eklenmez.
- Kullanıcı 360: mevcut güvenli kullanıcı özeti ve mevcut abonelik/oturum bileşenleri.
  Abonelik `entitlements.read`, oturumlar mevcut `users.sessions.revoke`
  gerektirir. Mevcut mutation kontrolleri değiştirilmez.
- Yönetici geçmişi: mevcut audit servisi, `audit.read`, kullanıcı UUID filtresi,
  en fazla 8 yakın olay. UUID filtresi tam hesaba çözülür. Arayüz yalnız olayın
  eylem, modül, risk ve zaman özetini tutar; raw before/after içeriğini göstermez.
- Yetkisiz alt bölüm için istek yapılmaz. Her alt bölümün yüklenme, hata ve tekrar
  deneme durumu bağımsızdır. Kullanıcı değişince önceki bağlam kaldırılır.

## Salt okunur tanılar

Tanı Merkezi mevcut yetkili okuma sonuçlarından üretilir. Sağlık içeriğine
veya provider iç verisine erişmez, mutation çağırmaz.

- Pasif hesap: TESPİT EDİLDİ.
- Doğrulanmamış e-posta / tamamlanmamış kurulum: OLASI NEDEN.
- Başarılı hesap kontrolleri: SORUN TESPİT EDİLEMEDİ; giriş başarısı kanıtı sayılmaz.
- Eksik yetki / yüklenme / API hatası / kanıtsız giriş durumu: DOĞRULANAMADI.
- Plan farklılığı aktif destek hakkıyla açıklanırsa çelişki sayılmaz.
  Açıklanamayan provider/etkin plan farkı yalnız OLASI NEDEN olur.
- Yakın audit yoksa “Görüntülenebilir yakın kayıt bulunamadı” gösterilir;
  yönetici müdahalesi olmadığı iddia edilmez.

## Doğrulama

- `frontend`: `node --test tests/admin-user-diagnostics.test.cjs` (6 kural testi).
- `frontend`: `npx playwright test --config playwright.admin-owner.config.ts admin-user360.spec.ts`
  (17 hedefli test; 390/412/768/1440, light/dark, klavye, çoklu/boş sonuç,
  UUID, permission, kısmi API hatası, kullanıcı değişimi, uzun e-posta/UUID).
- `backend`: mevcut `npm run test:integration` içine A2 yetki ve tam kullanıcı
  izolasyonu testi eklenir. Yalnız geçici test PostgreSQL veritabanı kullanılır.
- Mevcut Admin Owner Center CI yeniden kullanılır: backend lint/type/build/unit/
  integration ve frontend lint/type/build; finalde mevcut Admin tarayıcı regresyonları
  ile A2 testleri tek toplu pakette çalışır. CI deploy içermez.

DB migration, RBAC değişikliği, sağlık verisi, provider mutation, APK veya yayın yoktur.
