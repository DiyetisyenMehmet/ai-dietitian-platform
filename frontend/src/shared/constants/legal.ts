import { PUBLIC_BUSINESS_INFO } from "@/shared/constants/site";

/** A single block within a legal document. */
export interface LegalSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

/** A full legal document rendered by the shared LegalPage layout. */
export interface LegalDoc {
  title: string;
  updated: string;
  intro?: string;
  sections: LegalSection[];
}

const UPDATED = "3 Eylül 2026";
const legalName = PUBLIC_BUSINESS_INFO.legalName || "[Ticari unvan başvuru öncesi yapılandırılmalıdır]";
const address = PUBLIC_BUSINESS_INFO.registeredAddress || "[Merkez adresi başvuru öncesi yapılandırılmalıdır]";
const email = PUBLIC_BUSINESS_INFO.email;
const phone = PUBLIC_BUSINESS_INFO.phone || "[Telefon başvuru öncesi yapılandırılmalıdır]";
const kep = PUBLIC_BUSINESS_INFO.kepAddress || "[KEP adresi başvuru öncesi yapılandırılmalıdır]";

export const PRIVACY_POLICY: LegalDoc = {
  title: "Gizlilik Politikası",
  updated: UPDATED,
  intro:
    "Bu politika, Diewish web sitesi ve uygulamasında kişisel verilerin hangi kapsamda işlendiğini genel olarak açıklar. KVKK kapsamındaki ayrıntılı aydınlatma metni ayrıca /kvkk sayfasında; sağlık verilerine ilişkin açık rıza metni ise ayrı olarak /health-data-consent sayfasında sunulur.",
  sections: [
    {
      heading: "İşlenen veri kategorileri",
      bullets: [
        "Hesap ve iletişim bilgileri: ad, e-posta, oturum ve güvenlik kayıtları.",
        "Profil ve beslenme bilgileri: yaş, boy, kilo, hedefler, beslenme tercihleri ve kullanıcı tarafından girilen kayıtlar.",
        "Özel nitelikli sağlık verileri: kullanıcının açık rıza vermesi halinde sağlık durumu, alerji bilgileri, kan tahlili dosyaları, sonuçları ve analizleri.",
        "Ürün kullanım verileri: öğün, su, kilo, aktivite ve uygulama içi işlem kayıtları.",
        "Yapay zekâ içerikleri: kullanıcı mesajları, ilgili profil bağlamı ve oluşturulan yanıt/plan kayıtları.",
        "Ödeme kayıtları: plan, tutar, para birimi, ödeme sağlayıcısı işlem kimliği ve ödeme durumu. Kart numarası ve CVV Diewish veritabanında saklanmaz.",
      ],
    },
    {
      heading: "Amaçlar",
      bullets: [
        "Hesabı oluşturmak, kimlik doğrulamak ve güvenliği sağlamak.",
        "Kullanıcının talep ettiği yazılım özelliklerini ve kişiselleştirilmiş uygulama deneyimini sunmak.",
        "Açık rızaya dayalı sağlık/AI özelliklerini çalıştırmak.",
        "Ödeme, abonelik, destek, kötüye kullanım önleme ve yasal yükümlülük süreçlerini yürütmek.",
      ],
    },
    {
      heading: "Hizmet sağlayıcılar ve aktarım",
      paragraphs: [
        "Diewish; barındırma/veritabanı, yapay zekâ çıkarımı, e-posta ve ödeme gibi teknik hizmetler için gerekli olduğu ölçüde hizmet sağlayıcılardan yararlanabilir. Sağlık verileri yalnızca ilgili özelliğin çalışması için gerekli kapsamda işlenir. Yurt dışına veri aktarımı söz konusu olduğunda KVKK'nın yurt dışına aktarım şartları ve uygulanabilir güvence mekanizmaları gözetilir.",
        "Ödeme işlemi etkinleştirildiğinde iyzico'ya yalnızca ödeme ve sahtekârlık önleme için gerekli bilgiler iletilir. Kart bilgileri iyzico'nun ödeme akışında işlenir; Diewish sunucularında kart numarası/CVV tutulmaz.",
      ],
    },
    {
      heading: "Saklama ve silme",
      paragraphs: [
        "Veriler; hizmetin sunulması, güvenlik, yasal yükümlülükler ve uyuşmazlıkların çözümü için gerekli süreyle sınırlı tutulur. Hesap silme ve veri sahibi talepleri mevcut yasal saklama zorunlulukları dikkate alınarak değerlendirilir.",
      ],
    },
    {
      heading: "İletişim",
      paragraphs: [`Gizlilik ve veri sahibi talepleri için ${email} adresinden iletişime geçebilirsiniz.`],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDoc = {
  title: "Kullanım Koşulları",
  updated: UPDATED,
  intro: "Diewish hesabı ve yazılım özelliklerinin kullanımına ilişkin temel koşullar.",
  sections: [
    {
      heading: "Hizmetin niteliği",
      paragraphs: [
        "Diewish, kullanıcıların kendi hesapları üzerinden kullandığı yapay zekâ destekli beslenme ve takip yazılımıdır. Bire bir hekim veya diyetisyen danışmanlığı satılmaz; Diewish bir sağlık kuruluşu değildir.",
      ],
    },
    {
      heading: "Tıbbi sınırlar",
      paragraphs: [
        "Diewish teşhis, tedavi veya acil sağlık hizmeti sunmaz. Kan tahlili özetleri, beslenme planları ve yapay zekâ yanıtları bilgilendirme amaçlıdır ve sağlık profesyonelinin değerlendirmesinin yerine geçmez.",
      ],
    },
    {
      heading: "Kullanıcı yükümlülükleri",
      bullets: [
        "Hesap bilgilerinin doğru ve güncel tutulması.",
        "Hesabın ve giriş bilgilerinin üçüncü kişilerle paylaşılmaması.",
        "Başkasına ait sağlık belgesi veya kişisel verinin yetkisiz yüklenmemesi.",
        "Hizmetin hukuka aykırı, saldırgan veya kötüye kullanım amaçlı kullanılmaması.",
      ],
    },
    {
      heading: "Ücretli erişim",
      paragraphs: [
        "Mevcut V1 modeli, ücretli plan satın alındığında tek seferlik 30 günlük erişim sağlar. Otomatik yenileme veya yıllık abonelik, ayrıca ve açıkça sunulmadıkça uygulanmaz. Güncel fiyat ve dönem ödeme öncesinde kullanıcıya gösterilir.",
        "Ödeme, iyzico entegrasyonu production olarak etkinleştirildikten sonra ödeme sağlayıcısının güvenli akışı üzerinden tamamlanır.",
      ],
    },
    {
      heading: "İptal, cayma ve iade",
      paragraphs: [
        "Cayma ve iade hakları, satın alınan dijital hizmetin niteliğine, ifanın başlayıp başlamamasına, kullanıcının önceden verdiği onaylara ve yürürlükteki tüketici mevzuatına göre değerlendirilir. Ayrıntılar Teslimat, İptal ve İade Koşulları ile Mesafeli Satış Sözleşmesinde yer alır.",
      ],
    },
  ],
};

export const COOKIE_POLICY: LegalDoc = {
  title: "Çerez ve Yerel Depolama Politikası",
  updated: UPDATED,
  intro:
    "Diewish'in web arayüzünde kullanılan çerezler ve tarayıcı yerel depolama mekanizmaları hakkında bilgi verir.",
  sections: [
    {
      heading: "Zorunlu teknolojiler",
      paragraphs: [
        "Oturum, güvenlik ve arayüz tercihleri için teknik olarak gerekli çerez veya tarayıcı depolama mekanizmaları kullanılabilir. Bunların engellenmesi bazı özelliklerin çalışmasını etkileyebilir.",
      ],
    },
    {
      heading: "Analitik ve pazarlama",
      paragraphs: [
        "Diewish'te analitik veya pazarlama amaçlı zorunlu olmayan çerezler devreye alınırsa, uygulanabilir mevzuat gerektiriyorsa kullanıcı tercih/izin mekanizması sağlanır. Aktif olmayan bir analitik hizmet varmış gibi veri toplandığı iddia edilmez.",
      ],
    },
    {
      heading: "İletişim",
      paragraphs: [`Sorularınız için ${email} adresinden iletişime geçebilirsiniz.`],
    },
  ],
};

/** KVKK Article 10 style notice — intentionally separate from consent. */
export const KVKK_POLICY: LegalDoc = {
  title: "KVKK Aydınlatma Metni",
  updated: UPDATED,
  intro:
    "Bu metin 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında aydınlatma amacı taşır. Aydınlatma, açık rızadan ayrıdır; sağlık verisi açık rıza beyanı ayrıca alınır.",
  sections: [
    {
      heading: "1. Veri sorumlusu",
      paragraphs: [
        `Veri sorumlusu: ${legalName}. Marka: ${PUBLIC_BUSINESS_INFO.brandName}. Merkez adresi: ${address}. E-posta: ${email}. KEP: ${kep}. Telefon: ${phone}.`,
      ],
    },
    {
      heading: "2. İşlenen kişisel veriler",
      bullets: [
        "Kimlik ve iletişim: ad, e-posta ve hesap kimliği.",
        "İşlem güvenliği: oturum, cihaz/ağ ve güvenlik kayıtları.",
        "Müşteri işlem ve ödeme: plan, ödeme tutarı, işlem kimliği ve ödeme durumu.",
        "Profil/alışkanlık verileri: boy, kilo, hedef, öğün, su, aktivite ve beslenme tercihleri.",
        "Özel nitelikli sağlık verileri: sağlık durumu, alerjiler, kan tahlili dosyaları/sonuçları ve bunlardan üretilen analizler; yalnızca uygulanabilir işleme şartı mevcutsa.",
        "Yapay zekâ etkileşimleri: kullanıcının mesajları ve talep edilen özelliğin çalışması için gerekli bağlam.",
      ],
    },
    {
      heading: "3. İşleme amaçları",
      bullets: [
        "Üyelik, kimlik doğrulama ve hesap güvenliğini yürütmek.",
        "Kullanıcının talep ettiği uygulama, takip ve AI özelliklerini sunmak.",
        "Ödeme ve ücretli erişim süreçlerini yürütmek.",
        "Destek, hata giderme, kötüye kullanım önleme ve bilgi güvenliğini sağlamak.",
        "Hukuki yükümlülükleri yerine getirmek ve uyuşmazlıkları yönetmek.",
      ],
    },
    {
      heading: "4. Toplama yöntemi ve hukuki sebepler",
      paragraphs: [
        "Veriler; web/mobil arayüzlerindeki kullanıcı girişleri, yüklenen dosyalar, uygulama kullanım kayıtları, ödeme sağlayıcısı bildirimleri ve güvenlik logları aracılığıyla elektronik ortamda toplanır.",
        "İşleme faaliyetleri; sözleşmenin kurulması/ifası, hukuki yükümlülük, hakkın tesisi-kullanılması-korunması, veri sorumlusunun meşru menfaati ve uygulanabildiği ölçüde ilgili kişinin açık rızası gibi KVKK'da öngörülen hukuki sebeplere dayanır. Özel nitelikli sağlık verileri için gerekli özel nitelikli veri işleme şartı ayrıca gözetilir.",
      ],
    },
    {
      heading: "5. Aktarım yapılan alıcı grupları",
      paragraphs: [
        "Veriler; yalnızca amaçla sınırlı ve gerekli ölçüde barındırma/veritabanı, yapay zekâ altyapısı, e-posta, güvenlik ve ödeme hizmeti sağlayıcıları ile yetkili kamu kurumları veya hukuken yetkili kişilerle paylaşılabilir. Yurt dışına aktarım varsa KVKK m.9 kapsamındaki aktarım şartları ve uygun güvenceler uygulanır.",
      ],
    },
    {
      heading: "6. KVKK kapsamındaki haklar",
      bullets: [
        "Kişisel verilerinizin işlenip işlenmediğini öğrenme ve bilgi talep etme.",
        "İşlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme.",
        "Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme.",
        "Eksik veya yanlış işlenen verilerin düzeltilmesini isteme.",
        "Kanuni şartlar oluştuğunda silme veya yok etme talep etme ve aktarım yapılan üçüncü kişilere bildirim isteme.",
        "Münhasıran otomatik sistemlerle analiz sonucu aleyhe bir sonucun ortaya çıkmasına itiraz etme.",
        "Kanuna aykırı işleme nedeniyle zarara uğranması hâlinde zararın giderilmesini talep etme.",
      ],
    },
    {
      heading: "7. Başvuru",
      paragraphs: [
        `Veri sahibi başvuruları ${email} veya ${kep} kanalıyla veri sorumlusuna iletilebilir. Kimlik doğrulama ve başvuru usulü yürürlükteki mevzuata göre uygulanır.`,
      ],
    },
  ],
};

/** Explicit health-data consent — intentionally separate from KVKK notice. */
export const HEALTH_DATA_CONSENT: LegalDoc = {
  title: "Sağlık Verilerinin İşlenmesine İlişkin Açık Rıza Metni",
  updated: UPDATED,
  intro:
    "Bu metin bilgilendirme/aydınlatma metninden ayrı bir açık rıza beyanıdır. Kutunun önceden işaretli olmaması ve kullanıcının özgür iradesiyle olumlu işlem yapması esastır.",
  sections: [
    {
      heading: "Rızanın kapsamı",
      paragraphs: [
        "Diewish'e kendim tarafından girdiğim sağlık durumu ve alerji bilgileri ile yüklediğim kan tahlili dosyaları, tahlil değerleri ve bunlardan üretilen analizlerin; talep ettiğim Diewish özelliklerini kişiselleştirmek, tahlil sonuçlarını bilgilendirme amaçlı sadeleştirmek ve ilgili AI özelliklerini çalıştırmak için işlenmesine açık rıza veriyorum.",
      ],
    },
    {
      heading: "Teknik hizmet sağlayıcıları",
      paragraphs: [
        "Talep edilen özelliğin teknik olarak çalışması için gerekli asgari veri; sözleşmeli barındırma, veritabanı veya yapay zekâ altyapısı sağlayıcıları tarafından veri işleyen sıfatıyla işlenebilir. Yurt dışına aktarım gerektiğinde uygulanabilir KVKK aktarım şartları ayrıca sağlanır.",
      ],
    },
    {
      heading: "Özgür irade ve geri çekme",
      paragraphs: [
        "Bu rızayı vermenin sağlık verisi işleyen özellikleri kullanmak için gerekli olabileceğini, rıza vermediğimde hesabımı ve rıza gerektirmeyen işlevleri kullanmaya devam edebileceğimi, rızamı uygulamadaki Gizlilik ve İzinler alanından ileriye etkili olarak geri çekebileceğimi biliyorum.",
      ],
    },
  ],
};

export const DISTANCE_SALES_AGREEMENT: LegalDoc = {
  title: "Mesafeli Satış Sözleşmesi",
  updated: UPDATED,
  intro:
    "Bu sözleşme, Diewish ücretli dijital erişim paketlerinin mesafeli olarak satın alınmasına ilişkin genel sözleşme koşullarını açıklar. Satın alma anındaki plan, fiyat ve kullanıcı bilgileri ödeme öncesi ayrıca gösterilir.",
  sections: [
    {
      heading: "1. Satıcı / hizmet sağlayıcı",
      paragraphs: [
        `${legalName}; marka: ${PUBLIC_BUSINESS_INFO.brandName}; adres: ${address}; e-posta: ${email}; telefon: ${phone}; KEP: ${kep}.`,
      ],
    },
    {
      heading: "2. Tüketici",
      paragraphs: [
        "Tüketici, Diewish hesabı üzerinden satın alma işlemini başlatan ve ödeme öncesinde kendisine gösterilen kimlik/iletişim bilgileriyle işlem yapan kişidir.",
      ],
    },
    {
      heading: "3. Sözleşmenin konusu",
      paragraphs: [
        "Sözleşmenin konusu, ödeme ekranında seçilen Diewish Premium veya Premium Plus dijital yazılım erişiminin, gösterilen bedel ve dönem için tüketici hesabına tanımlanmasıdır. Fiziksel ürün veya kargo bulunmaz.",
      ],
    },
    {
      heading: "4. Fiyat, ödeme ve süre",
      paragraphs: [
        "Güncel fiyat, para birimi, vergiler dahil toplam bedel ve erişim süresi ödeme başlatılmadan önce kullanıcıya gösterilir. V1 modelinde ücretli erişim 30 gündür ve otomatik yenilenmez. Ödeme iyzico ödeme altyapısı production olarak etkin olduğunda iyzico üzerinden gerçekleştirilir.",
      ],
    },
    {
      heading: "5. İfa / teslim",
      paragraphs: [
        "Ödeme başarıyla doğrulandıktan sonra dijital erişim kullanıcının Diewish hesabına elektronik ortamda tanımlanır. Fiziksel teslimat yapılmaz.",
      ],
    },
    {
      heading: "6. Cayma ve iade",
      paragraphs: [
        "Cayma hakkı ve istisnaları yürürlükteki Mesafeli Sözleşmeler mevzuatına göre uygulanır. Dijital hizmetin cayma süresi dolmadan ifasına başlanmasının talep edildiği durumlarda, kullanıcıdan mevzuatın gerektirdiği ön bilgilendirme/onaylar ayrıca alınır. Hatalı veya mükerrer tahsilat gibi durumlar ayrıca incelenir.",
      ],
    },
    {
      heading: "7. Uyuşmazlık ve başvuru",
      paragraphs: [
        `Destek/ödeme talepleri ${email} üzerinden iletilebilir. Tüketicinin yürürlükteki tüketici mevzuatından doğan hakları saklıdır.`,
      ],
    },
  ],
};

export const DELIVERY_REFUND_POLICY: LegalDoc = {
  title: "Dijital Teslimat, İptal ve İade Koşulları",
  updated: UPDATED,
  intro:
    "Diewish fiziksel ürün satmaz. Ücretli ürün, kullanıcı hesabına tanımlanan süreli dijital yazılım erişimidir.",
  sections: [
    {
      heading: "Dijital teslimat",
      paragraphs: [
        "Başarılı ödeme sağlayıcısı doğrulamasından sonra satın alınan erişim dönemi kullanıcı hesabına elektronik olarak tanımlanır. Kargo veya fiziksel teslimat yoktur.",
      ],
    },
    {
      heading: "Otomatik yenileme",
      paragraphs: [
        "V1 ödeme modelinde 30 günlük erişim otomatik yenilenmez. Süre sonunda yeni dönem istenirse kullanıcı yeni bir ödeme işlemi başlatır.",
      ],
    },
    {
      heading: "İptal ve cayma",
      paragraphs: [
        "Cayma hakkının bulunup bulunmadığı ve kullanılma şekli; hizmetin ifasına başlanması, kullanıcının açık talebi/onayı ve yürürlükteki tüketici mevzuatı dikkate alınarak belirlenir. Satın alma ekranında uygulanabilir ön bilgilendirme ve onay kullanıcıya ayrıca sunulur.",
      ],
    },
    {
      heading: "İade talepleri",
      bullets: [
        "Mükerrer veya hatalı tahsilat iddiaları incelenir.",
        "Ödeme başarılı olduğu halde ücretli erişimin teknik nedenle tanımlanmaması durumunda öncelikle erişim sağlanır; mümkün değilse uygun iade süreci başlatılır.",
        "İade kararı, ödeme sağlayıcısı kuralları ve yürürlükteki tüketici mevzuatıyla birlikte değerlendirilir.",
      ],
    },
    {
      heading: "Başvuru kanalı",
      paragraphs: [`Ödeme ve iade talepleri için ${email} adresine başvurabilirsiniz.`],
    },
  ],
};
