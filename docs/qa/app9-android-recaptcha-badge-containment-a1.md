# 🛠️ Uygulama Çalışan 9

Görev: **APP9-ANDROID-RECAPTCHA-BADGE-CONTAINMENT-A1**  
Issue: https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/61  
Tarih: 18 Ekim 2026  
Sonuç: **PASS — kod ve hedefli yaşam döngüsü doğrulaması.**  
Tamamlanma: **%90**. Fiziksel Android ve gerçek Google doğrulama arayüzü ortak APK kabulünde bekliyor.

## Kaynak durumu

- Staging dalı: `feature/staging-preview`
- HEAD (son kayıt): `12c15074c71c6bc3c84fc7a32b02eaa71f4f32c7`
- TREE (kaynak ağacı): `b48efe9fbcf229858dfd959a2c6de3304937ee66`
- Ayrı çalışma dalı: `feature/app9-android-recaptcha-badge-containment-a1`
- PR #50 halen ayrı ve birleştirilmemiş: `b69d4425c16364a4d774da23b5ce94d438858944`.

## Kanıtlanan kusur ve sınırı

1. Telefon sayfası mevcut kodda yalnız tamamlanmış `confirmation` (SMS sonucunu doğrulayan nesne) için React temizliği kaydediyordu. `startPhoneVerification` içindeki SDK ve SMS beklemeleri sırasında bu nesne henüz yok. Kullanıcı bu sırada sayfadan ayrılırsa etkin verifier (reCAPTCHA doğrulama örneği) sahipsiz kalıyor. Geç SMS sonucu, kapanmış bileşene dönüyor ve yeni temizlik kaydı kurulamıyor.
2. Kullanılan **Firebase 12.19.0** sürümünün resmi `firebase-auth-compat.js.map` kaynağındaki `recaptcha_verifier.ts` incelendi: `clear()` örneği kapatıyor, fakat çocuk sayfa öğelerini yalnız görünür modda kaldırıyor; görünmez modda kaldırmıyor. Temizliğin widget'ın DOM sahipliğini de kapsaması gerekiyor.
3. Mevcut rozet konumu belirtilmediğinden reCAPTCHA'nın varsayılanı sağ alttır. Böyle bir öğenin ekranın altına sabitlenmesi alt menüyle çakışabilir. Android kabuğu aynı kök WebView üzerinde Diewish adreslerini tutuyor; fakat `setDomStorageEnabled` ayarı tek başına DOM'un saklandığının kanıtı değildir.
4. Gerçek React sayfası ve Next yönlendiricisiyle, geciktirilmiş sentetik Firebase/SMS sınırı kullanılarak aynı belge içinde telefon ekranından ayrılma yeniden üretildi. Eski kodda hem Web hem Android tarayıcı kimliğiyle **1 etkin / 0 temizlenmiş** örnek kaldı. Yeni kodda **0 etkin / 1 temizlenmiş** örnek kaldı; geç sonuç kimlik doğrulaması başlatmadı.

**Bu, Android'e özgü bir kusur olarak kanıtlanmadı.** Kullanıcının Web'de görmemesi ile APK'da görmesi; aynı öncesi/sonrası adımlar, gerçek Google öğeleri ve cihaz üzerinde karşılaştırılmadı. Gerçek cihazdaki rozetin tam olarak hangi önceki işlemden kaldığı henüz belirlenmiş değildir. Kanıtlanan ortak yaşam döngüsü kusuru düzeltilmiştir; fiziksel bulgunun tek nedeninin bu olduğu ileri sürülmez.

## En küçük güvenli düzeltme

- Rozet için Google'ın desteklediği `badge: "inline"` (sayfa içinde gösterim) seçeneği kullanılır. Tam Google rozeti SMS akışında görünür; genel CSS, gizleme, kırpma veya üçüncü taraf iframe taraması eklenmez.
- SMS formundaki buton yerine, hem numara hem kod adımında duran ayrı bir alan kullanılır. Her deneme kendi alt alanına sahiptir.
- Sayfadan çıkış sinyali, sonuç beklenirken de örneği kapatır. SDK temizliğinden sonra yalnız bu denemenin sahip olduğu alan kaldırılır. Tekrar temizleme güvenlidir; yeniden deneme yeni bir alan oluşturur.
- İptal, sayfanın artık beklememesini sağlar. **Firebase'e zaten gönderilmiş SMS isteğini sunucuda iptal ettiği iddia edilmez.** Mevcut reCAPTCHA kontrolü, SMS gönderme, kod doğrulama ve sunucuya kimlik doğrulatma yolu korunur.
- Sayfa kapandıktan gelen sonuçlar kullanıcı arayüzünü veya Diewish oturumunu yayımlamaz. Doğrulama atlama, test modu veya alternatif güvenlik davranışı eklenmez.
- Google giriş fonksiyonları, Android kabuğu, oturum kalıcılığı, alt navigasyon ve Admin kodları değiştirilmez.

## Hedefli test kanıtı

| Kontrol | Sonuç |
|---|---|
| Kimlik yardımcıları ve yeni yaşam döngüsü testleri | PASS — 18 test (11 mevcut ilgili test + 7 yeni) |
| Gerçek React sayfası, yerel Chromium, sentetik Firebase sınırı | PASS — 6 senaryo: 3 Web + 3 Android tarayıcı kimliği |
| Eski staging kodunda aynı bekleyen işlem kusuru | Yeniden üretildi — 2 senaryo, iki kimlikte de etkin örnek 1 / temizlik 0 |
| Yeni kodda aynı geçiş | Etkin örnek 0 / temizlik 1; geç kod doğrulama çağrısı 0 |
| Tür denetimi ve değişen TypeScript dosyalarının kod denetimi | PASS |
| PR #50 ile yerel kaynak uyumu | PASS — `git merge-tree`; dal veya PR birleştirilmedi |
| Fiziksel Android / gerçek Google reCAPTCHA / gerçek SMS | NOT TESTED (test edilmedi) — ortak APK kabulüne bırakıldı |

Tarayıcı testleri gerçek uygulama bileşeni ve sayfa geçişlerini çalıştırır. Google/Firebase hizmet sınırı sentetiktir ve dış SMS/kimlik istekleri engellenir. Android tarayıcı kimliği **gerçek Android WebView değildir**. Sentetik rozetin ekran görüntüsü gerçek Google/cihaz kanıtı olarak hazırlanmadı veya sunulmadı.

PR #50 ile yerel uyum kontrolünde, hem yerel Google hesabı seçme/Firebase kimlik değişimi hem yeni reCAPTCHA sahipliği korunmuştur. Bu kontrolün geçici kaynak ağacı: `bc0c68646ff53f2d7acaa062914daa0e7b09e04a`. Hiçbir dalın ucu bu ağaca taşınmadı; Google giriş testleri tekrar çalıştırılmadı.

Komutlar (ön yüz dizininden):

```bash
node --test tests/identity.test.cjs tests/phone-recaptcha-lifecycle.test.cjs
npm run type-check
npx eslint src/infrastructure/identity/firebase-browser.ts src/app/phone-auth/page.tsx playwright.phone-recaptcha.config.ts
npx playwright test --config=playwright.phone-recaptcha.config.ts
```

Eski sürüm karşılaştırması için aynı testin `pending SMS` senaryosu, staging kaydının ayrı yerel çalışma kopyasında `PHONE_RECAPTCHA_BASELINE=1`, `PHONE_RECAPTCHA_APP_DIRECTORY` ve yerel `PHONE_RECAPTCHA_TEST_URL` ayarlarıyla çalıştırıldı. Temel test sonucu yalnız kusuru yeniden üretir; fiziksel kabul anlamına gelmez. Bu ortamda Chromium headless-shell 153.0.8010.12 kullanıldı; standart Chrome başlatma ve ayrı bağlantı ad alanı sorunları geçici test ortamında giderildi.

## Ortak APK kabulü ve kalan riskler

1. Gerçek telefon ekranında normal reCAPTCHA / gerektiğinde güvenlik sorusu görünür ve kullanılabilir olmalı. Rozet eksiksiz görünmeli; giriş kodu adımında ve klavye açıkken erişilebilir olmalı.
2. Başarılı SMS, yanlış kod, numara değiştirme, başarısız istek ve istek sürerken geri/ana sayfaya çıkış kontrol edilmeli. Uygulama ana ekranına gelindiğinde rozet alt menünün üzerinde kalmamalı.
3. Aynı adımlar normal Web'de de uygulanmalı. Gerçek Android ile Web karşılaştırması bu aşamada tamamlanmalı.
4. İlk açılışta zaten kalmış eski bir üçüncü taraf DOM öğesi için genel tarama/silme yapılmaz. Yeni sahiplik ancak yeni sayfa oturumu ve güncel akışla devreye girer; kabul güncel ön yüzü yükleyen ortak APK ile yapılmalı.
5. Telefon kayıt/kurtarma çalışmaları aynı yardımcıyı veya sayfayı değiştirirse, yeni alan ve çıkış temizliği entegrasyonda korunmalı. Mevcut üç parametreli yardımcı çağrısı uyumludur; dördüncü çıkış sinyali isteğe bağlıdır.

## Resmi kaynaklar

- https://developers.google.com/recaptcha/docs/invisible — `badge: inline` desteklenir; varsayılan konum sağ alttır.
- https://firebase.google.com/docs/auth/web/phone-auth — Firebase'in telefon doğrulama ve reCAPTCHA yolu.
- https://www.gstatic.com/firebasejs/12.19.0/firebase-auth-compat.js.map — kullanılan sürümün gerçek kaynak haritası. SHA-256: `104120e32ee34a86db03800fdf5eedcb132066999b17e5efc3acecc63844bfa0`.

Yeni APK, staging yayını, canlı ortam değişikliği, PR birleştirmesi veya güvenlik yapılandırması değişikliği yapılmadı. Güvenlik kontrolü değiştirilmediğinden Güvenlik Uzmanı'na davranış değişikliği talebi açılması gerekmedi.
