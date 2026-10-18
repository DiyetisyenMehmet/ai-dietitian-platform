# APP9-ANDROID-GOOGLE-BRIDGE-CI-FAILURE-A1

Raporlayan: 🛠️ Uygulama Çalışan 9  
Yönetici: 👑 Diewish Uygulama Yöneticisi 5  
Tarih: 18 Ekim 2026

Sonuç: **PASS (başarılı) — test ortamı uyumu ve hedefli Android testleri.** Tamamlanma: **%95**; iki ortak CI işinin güncel staging üzerinde yeniden çalışması ve fiziksel Google giriş kabulü bu PR'ın dışında bekliyor.

## Kaynak ve kapsam

- Staging: `feature/staging-preview`.
- İncelenen HEAD (son kayıt): `529b4c15efbd13cf648b18b014606ecdd148abe4`.
- TREE (kod ağacı): `c40679e16478873d9b69eafc23c5b7989526e668`.
- Ayrı çalışma dalı: `feature/app9-google-bridge-robolectric-ci-a1`.
- Uygulama düzeltmesi değil, Robolectric (Android test ortamı) uyumluluğu düzeltmesi. Değişen tek Java dosyası `SessionCookiePersistenceTest.java`; `android/app/src/main`, bağımlılıklar ve iş akışları değişmedi.

## Kök neden kanıtı

İki CI (otomatik doğrulama) işi aynı eski testte başarısız:

| İş | Kayıt |
|---|---|
| Hardening CI / android-native | https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39153568575/job/117752014903 |
| Notification preferences platform checks / android-checks | https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/39153567902/job/117752012493 |

İki kayıtta da 44 test / 1 başarısız var. İkinci işin `notification-alerts-native-test-results` paketindeki XML (yapılandırılmış test raporu) çağrı izi:

```text
UnsupportedOperationException
WebViewFeatureInternal.getUnsupportedOperationException
WebViewCompat.addWebMessageListener
DiewishGoogleAuthBridge.install:110
MainActivity.configureWebView:227
MainActivity.onCreate:101
SessionCookiePersistenceTest.hostRegistersBridgeBeforeLoadKeepsCookiePolicyAndRecreatesWebView:157
```

Kanıt paketi: artifact (test çıktısı paketi) `12146071815`; SHA-256 özeti `7fc142e25cae6e85d78f4cc2592b1c3ba63fb18469897db23700d952d68b45a4`.

Mevcut testin `DocumentStartFeature.isFeatureSupported` taklidi, özellik adını dikkate almadan her sorguya aynı `true` değerini döndürüyordu. Yeni Google köprüsünün `WEB_MESSAGE_LISTENER` sorgusu da bundan etkileniyor. Ancak test yalnız `addDocumentStartJavaScript` çağrısını modelliyordu; mesaj dinleyicisi çağrısı gerçek AndroidX koduna ve bu özelliği sunmayan Robolectric sağlayıcısına ulaşıyor.

Kullanılan [AndroidX WebKit 1.17.1 kaynak paketi](https://dl.google.com/dl/android/maven2/androidx/webkit/webkit/1.17.1/webkit-1.17.1-sources.jar) incelendi. Normal `WebViewFeature.isFeatureSupported` sorgusu `WebViewFeatureInternal.isSupported` yoluna gider. `WEB_MESSAGE_LISTENER`, yalnız WebView sağlayıcısıyla desteklenen bir özelliktir; `addWebMessageListener` aynı özelliğin sağlayıcı desteğini denetler. Testin yalnız dış sorguyu değiştirmesi bu tutarlılığı bozuyor.

**Bu CI istisnasının nedeni test taklididir. Gerçek Android'de Google girişinin bozuk olduğu bu hatadan çıkarılamaz.** Fiziksel cihazda Google hesabı seçiminin başarılı olduğu da bu yerel testlerle ileri sürülmez.

## En küçük düzeltme

- `DOCUMENT_START_SCRIPT` ve `WEB_MESSAGE_LISTENER` destek durumları testte ayrı tutulur; tanınmayan özellikler destekleniyor sayılmaz.
- Varsayılan test yolu mesaj desteğini açık tutar. Testi geçsin diye köprü kapatılmaz: `addWebMessageListener` ve `removeWebMessageListener` için sınıfa özgü Robolectric modelleri eklenir.
- Model, ilk yüklemeden önce kayıt, tam `BuildConfig.WEB_BASE_URL` kaynak kümesi, doğru köprü adı, gerçek geri çağrının verilmesi ve aynı WebView için tek kayıt şartlarını denetler.
- Mevcut yeniden oluşturma testi, ilk WebView kapanırken dinleyicinin kaldırıldığını ve yeni WebView için yeniden kaydedildiğini de denetler. Kaldırma, WebView yok edilmeden önce gerçekleşmelidir.
- İki desteğin açık/kapalı dört birleşimi kapsanır. İlk taraf çerezleri açık, üçüncü taraf çerezleri kapalı kalır; destek yokken güvensiz JavaScript arayüzüne geçilmez. Eski sağlayıcının sayfa-sonu çerez betiği yolu korunur.
- Test atlama, ürün kodunda istisna yutma, kaynak denetimini gevşetme veya bağımlılık sürümünü değiştirme yoktur.

## Hedefli test sonucu

| Kontrol | Sonuç |
|---|---|
| Eski staging testinin tek başına yerel tekrar üretimi | Beklenen FAIL (başarısız): 1 test, 1 aynı `UnsupportedOperationException`, aynı AndroidX/köprü çağrı izi |
| Düzeltilmiş `SessionCookiePersistenceTest` | PASS — 8 test; 0 atlanan, 0 hata, 0 başarısız |
| Mevcut `GoogleAuthBridgeTest` | PASS — 12 test; 0 atlanan, 0 hata, 0 başarısız |
| Toplam hedefli son çalıştırma | PASS — 20/20; Gradle çıkış kodu 0, `BUILD SUCCESSFUL`, test görevi gerçekten çalıştı |
| Ürün kodu / bağımlılık / iş akışı farkı | Yok; staging kaydıyla `git diff --exit-code` kontrolü başarılı |
| APK dosyası | Yok; `assembleDebug` çalıştırılmadı |

Google köprüsü testleri tam kaynak/üst çerçeve kısıtlarını, giriş sayfası sınırını, proje/istemci eşleşmesini, istek bağını, çift tıklamayı, iptali ve geç kimlik sonucunun bırakılmasını kapsar. Gerçek Google hesabı kullanılmaz. Mevcut tarayıcı, telefon doğrulama, bildirim veya geniş Android test paketleri bu görevde yeniden başlatılmadı.

Son XML raporları 18 Ekim 2026 20:20 UTC'de üretildi. SHA-256 özetleri:

- `SessionCookiePersistenceTest`: `fb195c7c839c1a574d042d0320f449a0e4f60a913d4cf65657fab0c1fce5bcd2`.
- `GoogleAuthBridgeTest`: `30ef2c6a4975cc5b9a6add49bc0c1f5ac76177751ae799cb49a06c526194a325`.

İlk yerel hedefli denemede test sonucu oluşmadan Gradle `EOFException` ile kesildi. Güncel XML raporları yeniden üretilen kesintisiz son çalışmadan doğrulandı; eski başarısız XML dosyası başarı kanıtı olarak kullanılmadı.

Doğrulama komutları; yalnız birim testi görevini kullanır, uygulama APK'sı üretmez:

```bash
# Eski staging testinde tek hatayı yeniden üretme:
gradle --no-daemon -p android :app:testDebugUnitTest \
  --tests 'com.diewish.app.SessionCookiePersistenceTest.hostRegistersBridgeBeforeLoadKeepsCookiePolicyAndRecreatesWebView' \
  -PDIEWISH_WEB_BASE_URL=https://staging.diewish.com

# Düzeltme ve Google köprüsünün güvenlik sözleşmeleri:
gradle --no-daemon -p android :app:testDebugUnitTest \
  --tests 'com.diewish.app.SessionCookiePersistenceTest' \
  --tests 'com.diewish.app.GoogleAuthBridgeTest' \
  -PDIEWISH_WEB_BASE_URL=https://staging.diewish.com
```

Yerel araç kurulumu proje dosyalarına eklenmez. Gradle 9.6.0, JDK (Java geliştirme araçları) 17, Android derleme hedefi 36 ve Robolectric 4.17 / Android test seviyesi 33 kullanılır. Ağ vekili ve sistemin güvenilir sertifika deposu yalnız yerel çalıştırıcıya verilir; TLS (şifreli bağlantı) doğrulaması kapatılmaz. İlk yerel tekrar üretimde SDK 36 AAPT2 (Android kaynak derleyicisi) kullanıldı. Gradle'ın Maven istemcisindeki indirme sorunu nedeniyle son çalıştırmada AGP'nin beklediği aynı `9.4.0-15978811` AAPT2 paketi resmi Google Maven adresinden indirilip yalnız komuta `-Pandroid.aapt2FromMavenOverride=<yerel-aapt2>` verildi. Projenin araç sürümü veya güvenlik kontrolü değiştirilmedi.

İki eski CI kaydı yeniden başlatılmadı; bu ayrı dal, bu iş akışlarının otomatik dal listesinde değildir. Yerel hedefli PASS sonucu tüm staging CI işlerinin yeşil olduğu anlamına gelmez. Herhangi bir iş akışı veya APK görevi elle tetiklenmedi.

## Sınırlar

Gerçek hesap, SMS, kimlik anahtarı veya oturum kullanılmadı/kaydedilmedi. Fiziksel Android testi yapılmadı. Bu görev, belirtilen CI test uyumsuzluğunu kapatır; ortak APK'nın Google/OAuth yapılandırması ve cihaz kabulü yerine geçmez. Staging birleşimi, yayın, APK, production/main veya Admin değişikliği yapılmadı.
