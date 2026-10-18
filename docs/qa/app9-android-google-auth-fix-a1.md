# RAPORU VEREN: 🛠️ Uygulama Çalışan 9

GÖREV: APP9-ANDROID-GOOGLE-AUTH-FIX-A1  
İlgili kayıt: https://github.com/DiyetisyenMehmet/ai-dietitian-platform/issues/47  
Tarih: 17 Ekim 2026

## Karar

**BLOCKED (kabul doğrulaması bekliyor).** Kod düzeltmesi ayrı dalda hazırlanmıştır. Fiziksel Android cihazında gerçek Google hesabı ile tamamlanmış giriş, doğru Diewish hesabı ve uygulama kapatılıp açıldıktan sonra oturumun korunması doğrulanmadan görev PASS sayılamaz. Yeni APK veya yayın yapılmadı.

Tamamlanma: **%90** — kod ve hedefli kontroller tamam; gerçek cihaz kabulü bekliyor.

## İncelenen başlangıç

- Dal: `feature/staging-preview`
- HEAD (son kayıt): `de3bbc689d8e5f8b6bdfa74e93f6ba6877fb79b5`
- TREE (kaynak ağacı): `bd2003432e1fc7d817a8d3122d67c1390043fc88`
- Çalışma dalı: `feature/app9-android-google-auth-fix-a1`

## Kök neden

`firebase-browser.ts`, Android ve web için aynı `signInWithPopup` (açılır pencereyle giriş) yolunu kullanıyordu. Android kabuğunda çoklu pencere desteği kapalı; Diewish dışındaki gezinmeler `ACTION_VIEW` ile dış tarayıcıya gönderiliyor. Firebase girişini başlatan WebView ile dış tarayıcı farklı başlangıç/oturum depolarına sahip. Bu nedenle dış tarayıcıdaki Firebase sayfası uygulamanın başlangıç durumuna erişemiyor. Koddaki bu uyumsuzluk, #47'deki fiziksel cihaz kanıtıyla tutarlı; bu çalışma sırasında fiziksel cihazda yeniden üretim yapılmadı.

## Yapılan değişiklik

1. Android Google butonu, Credential Manager (Android'in yerel kimlik seçicisi) üzerinden açık hesap seçimi başlatır. `GetSignInWithGoogleOption` kullanılır; eski/bozuk açılır pencereye geri dönüş yapılmaz.
2. Dönüş yalnız izin verilen HTTPS kaynağının ana çerçevesine ve o isteği başlatan belgeye bağlı `WebMessage` (güvenli uygulama–sayfa iletişimi) yanıtıyla yapılır. `/login` ve `/register` dışındaki sayfalar, alt çerçeveler, farklı kaynak/bağlantı noktaları reddedilir.
3. İstek kimliği, tek etkin giriş, kriptografik rastgele nonce (tek kullanımlık istek değeri), Google istemci hedefi ve Firebase proje eşleşmesi kontrol edilir. Yerel çözümleme imza doğrulaması yerine kullanılmaz.
4. Google kimliği **aynı web Firebase örneğinde** `signInWithCredential` ile doğrulanır. Dönen Firebase kimliği, değişmeyen `/identity/external` sunucu doğrulamasından geçer. Uygulama hesap eşleştirme ve oturum oluşturma mantığı değiştirilmez.
5. İptal, zaman aşımı, sayfa değişikliği, uygulama ekranının kapanması ve geç gelen yanıtlar ele alınır. Hata metinleri güvenli Türkçe mesajlara çevrilir. Gerçek kimlik bilgileri günlüğe, URL'ye, dosyaya veya yerel Android oturum deposuna yazılmaz.
6. Mevcut isteğe bağlı staging APK adımına aynı Firebase Android yapılandırmasındaki **web** OAuth istemci kimliğinin aktarımı eklenir. Eksik, belirsiz veya farklı proje yapılandırması reddedilir. Bu iş akışı çalıştırılmadı; imza/yetki/proje ayarı değiştirilmedi.

## Doğrulamalar

| Kontrol | Sonuç |
|---|---|
| Hedefli web/kimlik davranış testleri | PASS — 24 test |
| TypeScript tür denetimi | PASS |
| Değişen ön yüz dosyalarının kod denetimi | PASS |
| İş akışının YAML ve Bash sözdizimi | PASS |
| Yapılandırma adımının sentetik çalıştırılması | PASS — doğru istemci, eksik istemci, belirsiz istemci, farklı proje |
| Android uygulama ve test kaynaklarının derlenmesi | PASS — APK üretilmeden |
| Yeni Android köprü güvenlik testleri | PASS — 12 test, hata/atlama yok |
| Fiziksel Android Google giriş ve doğru hesap | NOT TESTED (test edilmedi) |
| Fiziksel Android kapat/aç oturum kalıcılığı | NOT TESTED (test edilmedi) |
| Gerçek web Google hesabıyla giriş | NOT TESTED — otomatik test mevcut web yolunu koruyor |

Tekrarlanabilir hedefli komutlar:

```bash
cd frontend
node --test tests/identity.test.cjs tests/android-google-auth.test.cjs
npm run type-check
npx eslint src/infrastructure/identity/android-google-auth.ts src/infrastructure/identity/firebase-browser.ts src/infrastructure/identity/auth-feedback.ts src/presentation/components/auth/auth-alternatives.tsx
cd ..
python3 scripts/android-google-config.test.py
gradle --no-daemon -p android :app:testDebugUnitTest --tests com.diewish.app.GoogleAuthBridgeTest -PDIEWISH_WEB_BASE_URL=https://staging.diewish.com
```

Android testinde JDK 17, Android 36 SDK ve Gradle 9.6.0 kullanıldı. Başlangıçtaki yerel Java derleyicisi/bağlantı eksikleri geçici test ortamında giderildi; ürünün derleme sürümleri değiştirilmedi. `adb devices` (bağlı cihaz listesi) boştu. `assemble` veya APK üretim/yayın adımı çalıştırılmadı; çıktı dizinlerinde APK bulunmadı.

Yalnız değişen kimlik koduyla ilgili kontroller yapıldı. Genel Koç, beslenme, Admin veya geniş platform testleri tekrarlanmadı. Mevcut HttpOnly oturum çerezi kaydetme/kurtarma kodu değiştirilmedi. Uygulama oturumunun fiziksel cihazda korunması bu çalışmada kanıtlanmış sayılmaz.

## Entegrasyon öncesi açık maddeler

- İleride yetkilendirilen test APK'sında kullanılan `com.diewish.app` paketinin gerçek imza sertifikası özeti, **aynı staging Google/Firebase projesindeki Android OAuth istemcisiyle** eşleşmeli. Mevcut bulut kaydı ve imza eşleşmesine bu çalışma ortamından erişilmedi; eşleştiği iddia edilmiyor.
- Derleme başına oluşturulabilen debug (geliştirme) anahtarının sabit/kayıtlı olduğu varsayılmamalı. Yetkili APK hazırlığında gerçek imza ve istemci kaydı doğrulanmalı; gerekirse yönetici ayrı altyapı görevini açmalı.
- Yalnız ön yüz yayını eski APK'ya yerel hesap seçici ekleyemez. Kod birleştirme, ön yüz yayını ve uyumlu APK üretimi yöneticinin ayrı kararıdır.
- Fiziksel cihazda: mevcut Google hesabı → hesap seçimi → doğru Diewish kullanıcı kimliği → kapat/aç → aynı oturum; iptal ve farklı hesap seçimi de kontrol edilmeli.
- Gerçek web Google ve mevcut e-posta/parola girişinde kısa kabul kontrolü yapılmalı.

## Sınırlar

Production (canlı ortam), `main` ve staging dallarına kayıt yapılmadı. Dal birleştirilmedi. Yayın, APK üretimi, gerçek kullanıcı işlemi veya bulut kimlik/yetki değişikliği yapılmadı. Koç, beslenme ve Admin uygulama kodları değiştirilmedi.

## Kullanılan resmi teknik kaynaklar

- https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation
- https://developer.android.com/jetpack/androidx/releases/credentials
- https://firebase.google.com/docs/auth/web/google-signin#advanced_handle_the_sign-in_flow_manually
- https://firebase.google.com/docs/auth/android/google-signin
