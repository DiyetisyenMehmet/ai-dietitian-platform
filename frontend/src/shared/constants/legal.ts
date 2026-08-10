/**
 * Structured legal content for Diewish public pages. The Privacy, Terms and
 * KVKK copy mirrors the authoritative Turkish documents served by the backend
 * legal module (Sprint 15) so the public site and in-app consent stay
 * consistent. Cookie policy is site-specific and defined here.
 */

/** A single block within a legal document. */
export interface LegalSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

/** A full legal document rendered by the shared LegalPage layout. */
export interface LegalDoc {
  title: string;
  /** Human-readable last-updated label. */
  updated: string;
  intro?: string;
  sections: LegalSection[];
}

const UPDATED = "18 Temmuz 2026";

export const PRIVACY_POLICY: LegalDoc = {
  title: "Gizlilik Politikası",
  updated: UPDATED,
  intro:
    "Diewish olarak kişisel verilerinizin gizliliğine önem veriyoruz. Bu politika, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında hangi verileri işlediğimizi ve bu verileri nasıl koruduğumuzu açıklar.",
  sections: [
    {
      heading: "İşlenen Veriler",
      bullets: [
        "Hesap bilgileri (ad, e-posta).",
        "Sağlık ve beslenme profili (yaş, boy, kilo, hedefler, alerji ve tercihler).",
        "Yüklediğiniz kan tahlili sonuçları ve bunların analizleri.",
        "Yapay zekâ sohbet geçmişi ve oluşturulan beslenme planları.",
        "Ödeme işlemlerine ilişkin işlem kayıtları (kart verisi tarafımızca saklanmaz).",
      ],
    },
    {
      heading: "Verilerin İşlenme Amaçları",
      bullets: [
        "Kişiselleştirilmiş beslenme ve sağlık önerileri sunmak.",
        "Abonelik ve ödeme süreçlerini yürütmek.",
        "Yasal yükümlülüklerimizi yerine getirmek ve hizmet güvenliğini sağlamak.",
      ],
    },
    {
      heading: "Verilerin Aktarılması",
      paragraphs: [
        "Ödeme işlemleri için ödeme hizmeti sağlayıcımız (iyzico) ile yalnızca işlemin gerçekleştirilmesi amacıyla gerekli veriler paylaşılır. Kart bilgileriniz Diewish sunucularında saklanmaz.",
      ],
    },
    {
      heading: "Haklarınız",
      paragraphs: [
        "KVKK kapsamında verilerinize erişme, düzeltme, silme ve işlemeye itiraz etme haklarına sahipsiniz. Hesabınızı ve ilişkili tüm verilerinizi dilediğiniz zaman uygulama üzerinden silme talebinde bulunabilirsiniz.",
      ],
    },
    {
      heading: "İletişim",
      paragraphs: [
        "Gizlilikle ilgili taleplerinizi destek@diewish.com adresi veya uygulama içindeki destek kanalları üzerinden iletebilirsiniz.",
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDoc = {
  title: "Kullanım Koşulları",
  updated: UPDATED,
  intro: "Diewish'i kullanarak aşağıdaki koşulları kabul etmiş olursunuz.",
  sections: [
    {
      heading: "Hizmetin Kapsamı",
      paragraphs: [
        "Diewish, yapay zekâ destekli beslenme rehberliği ve sağlık takibi sunan bir yazılım platformudur. Hizmet \"olduğu gibi\" sunulur.",
      ],
    },
    {
      heading: "Kullanıcı Yükümlülükleri",
      bullets: [
        "Doğru ve güncel bilgi sağlamak.",
        "Hesap güvenliğinizi korumak.",
        "Hizmeti yasalara uygun şekilde kullanmak.",
      ],
    },
    {
      heading: "Abonelik ve Ödemeler",
      paragraphs: [
        "Ücretli planlar (Premium ve Premium Plus) abonelik esasına dayanır ve seçtiğiniz dönem boyunca geçerlidir. Ödemeler iyzico altyapısı üzerinden güvenli şekilde tahsil edilir. Aboneliğinizi dönem sonunda iptal edebilirsiniz.",
      ],
    },
    {
      heading: "Sorumluluğun Sınırlandırılması",
      paragraphs: [
        "Diewish tıbbi teşhis veya tedavi hizmeti sunmaz. Sağlanan içerikler bilgilendirme amaçlıdır ve profesyonel tıbbi tavsiyenin yerine geçmez.",
      ],
    },
    {
      heading: "Değişiklikler",
      paragraphs: [
        "Bu koşullar zaman zaman güncellenebilir. Güncel sürüm uygulama ve web sitesi üzerinden yayımlanır.",
      ],
    },
  ],
};

export const COOKIE_POLICY: LegalDoc = {
  title: "Çerez Politikası",
  updated: UPDATED,
  intro:
    "Bu Çerez Politikası, Diewish web sitesinde ve uygulamasında çerezlerin ve benzeri teknolojilerin nasıl kullanıldığını açıklar.",
  sections: [
    {
      heading: "Çerez Nedir?",
      paragraphs: [
        "Çerezler, ziyaret ettiğiniz web siteleri tarafından cihazınıza kaydedilen küçük metin dosyalarıdır. Oturumunuzun sürdürülmesi ve tercihlerinizin hatırlanması gibi işlevler için kullanılır.",
      ],
    },
    {
      heading: "Kullandığımız Çerez Türleri",
      bullets: [
        "Zorunlu çerezler: Oturum açma ve güvenlik gibi temel işlevler için gereklidir.",
        "Tercih çerezleri: Tema (açık/koyu) gibi seçimlerinizi hatırlar.",
        "Analitik çerezler: Hizmetimizi iyileştirmek için toplu ve anonim kullanım istatistikleri sağlar.",
      ],
    },
    {
      heading: "Çerezleri Yönetme",
      paragraphs: [
        "Tarayıcı ayarlarınız üzerinden çerezleri dilediğiniz zaman silebilir veya engelleyebilirsiniz. Zorunlu çerezlerin devre dışı bırakılması bazı işlevlerin çalışmamasına neden olabilir.",
      ],
    },
    {
      heading: "İletişim",
      paragraphs: [
        "Çerez kullanımıyla ilgili sorularınız için destek@diewish.com adresinden bize ulaşabilirsiniz.",
      ],
    },
  ],
};

export const KVKK_POLICY: LegalDoc = {
  title: "KVKK / GDPR Aydınlatma ve Açık Rıza",
  updated: UPDATED,
  intro:
    "6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve ilgili mevzuat kapsamında, özel nitelikli kişisel veriler dâhil olmak üzere verilerinizin işlenmesine ilişkin aydınlatma metnidir.",
  sections: [
    {
      heading: "Veri Sorumlusu",
      paragraphs: [
        "Kişisel verileriniz, veri sorumlusu sıfatıyla Diewish tarafından aşağıda açıklanan kapsamda işlenmektedir.",
      ],
    },
    {
      heading: "İşlenen Sağlık Verileri",
      paragraphs: [
        "Beslenme profiliniz, kan tahlili sonuçlarınız ve bunların analizleri gibi özel nitelikli sağlık verileriniz, yalnızca kişiselleştirilmiş beslenme ve sağlık hizmetlerinin sunulması amacıyla işlenir.",
      ],
    },
    {
      heading: "Açık Rıza",
      paragraphs: [
        "Sağlık verilerinizin işlenmesi açık rızanıza tabidir. Bu rızanın tamamen özgür iradenizle verildiğini, dilediğiniz zaman uygulama üzerinden geri alınabileceğini ve geri alınması hâlinde ilgili işleme faaliyetinin durdurulacağını belirtiriz.",
      ],
    },
    {
      heading: "Haklarınız",
      bullets: [
        "Verilerinize erişme ve bunları düzeltme.",
        "Verilerinizin silinmesini veya yok edilmesini talep etme.",
        "İşlemeye itiraz etme ve rızanızı geri alma.",
        "Verilerinizin taşınabilirliğini talep etme (GDPR kapsamında).",
      ],
    },
    {
      heading: "Başvuru",
      paragraphs: [
        "KVKK ve GDPR kapsamındaki taleplerinizi destek@diewish.com adresi üzerinden iletebilirsiniz. Başvurularınız en kısa sürede ve her hâlde yasal süreler içinde sonuçlandırılır.",
      ],
    },
  ],
};
