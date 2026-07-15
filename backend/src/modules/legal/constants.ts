import type { LegalDocumentType } from "@prisma/client";

import { env } from "../../config/env";

/**
 * Legal & compliance content for Diewish (Sprint 15).
 *
 * The platform provides AI-assisted nutrition guidance to a Turkish audience,
 * so all user-facing legal copy is authored in Turkish and covers KVKK (Turkey's
 * data-protection law) in addition to standard privacy/terms/medical-disclaimer
 * documents. Document *versions* are sourced from configuration (env) so legal
 * can bump a version without a code change; the version string is stamped onto
 * every consent record for auditability.
 */

/** A single versioned legal document served to clients. */
export interface LegalDocument {
  type: LegalDocumentType;
  /** Stable version identifier (e.g. an ISO date) stamped on consent records. */
  version: string;
  /** Human-readable Turkish title. */
  title: string;
  /** Full Turkish document body (Markdown). */
  body: string;
  /**
   * When true, the document requires explicit, affirmative consent before the
   * user can use the platform (enforced by the require-consent middleware).
   */
  mandatory: boolean;
}

/** Resolves the configured version for each document type. */
const DOCUMENT_VERSIONS: Record<LegalDocumentType, string> = {
  PRIVACY_POLICY: env.LEGAL_PRIVACY_POLICY_VERSION,
  TERMS_OF_SERVICE: env.LEGAL_TERMS_OF_SERVICE_VERSION,
  MEDICAL_DISCLAIMER: env.LEGAL_MEDICAL_DISCLAIMER_VERSION,
  KVKK_EXPLICIT_CONSENT: env.LEGAL_KVKK_CONSENT_VERSION,
};

const PRIVACY_POLICY_BODY = `# Gizlilik Politikası

Diewish olarak kişisel verilerinizin gizliliğine önem veriyoruz. Bu politika,
6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında hangi verileri
işlediğimizi ve bu verileri nasıl koruduğumuzu açıklar.

## İşlenen Veriler
- Hesap bilgileri (ad, e-posta).
- Sağlık ve beslenme profili (yaş, boy, kilo, hedefler, alerji ve tercihler).
- Yüklediğiniz kan tahlili sonuçları ve bunların analizleri.
- Yapay zekâ sohbet geçmişi ve oluşturulan beslenme planları.
- Ödeme işlemlerine ilişkin işlem kayıtları (kart verisi tarafımızca saklanmaz).

## Verilerin İşlenme Amaçları
- Kişiselleştirilmiş beslenme ve sağlık önerileri sunmak.
- Abonelik ve ödeme süreçlerini yürütmek.
- Yasal yükümlülüklerimizi yerine getirmek ve hizmet güvenliğini sağlamak.

## Verilerin Aktarılması
Ödeme işlemleri için ödeme hizmeti sağlayıcımız (iyzico) ile yalnızca işlemin
gerçekleştirilmesi amacıyla gerekli veriler paylaşılır. Kart bilgileriniz
Diewish sunucularında saklanmaz.

## Haklarınız
KVKK kapsamında verilerinize erişme, düzeltme, silme ve işlemeye itiraz etme
haklarına sahipsiniz. Hesabınızı ve ilişkili tüm verilerinizi dilediğiniz zaman
uygulama üzerinden silme talebinde bulunabilirsiniz.

## İletişim
Gizlilikle ilgili taleplerinizi uygulama içindeki destek kanalları üzerinden
iletebilirsiniz.`;

const TERMS_OF_SERVICE_BODY = `# Kullanım Koşulları

Diewish'i kullanarak aşağıdaki koşulları kabul etmiş olursunuz.

## Hizmetin Kapsamı
Diewish, yapay zekâ destekli beslenme rehberliği ve sağlık takibi sunan bir
yazılım platformudur. Hizmet "olduğu gibi" sunulur.

## Kullanıcı Yükümlülükleri
- Doğru ve güncel bilgi sağlamak.
- Hesap güvenliğinizi korumak.
- Hizmeti yasalara uygun şekilde kullanmak.

## Abonelik ve Ödemeler
Ücretli planlar (Premium ve Premium Plus) abonelik esasına dayanır ve seçtiğiniz
dönem boyunca geçerlidir. Ödemeler iyzico altyapısı üzerinden güvenli şekilde
tahsil edilir. Aboneliğinizi dönem sonunda iptal edebilirsiniz.

## Sorumluluğun Sınırlandırılması
Diewish tıbbi teşhis veya tedavi hizmeti sunmaz. Sağlanan içerikler bilgilendirme
amaçlıdır ve profesyonel tıbbi tavsiyenin yerine geçmez.

## Değişiklikler
Bu koşullar zaman zaman güncellenebilir. Güncel sürüm uygulama üzerinden
yayımlanır.`;

const MEDICAL_DISCLAIMER_BODY = `# Tıbbi Sorumluluk Reddi

Diewish tarafından sunulan beslenme planları, kan tahlili analizleri ve yapay
zekâ sohbet yanıtları yalnızca **genel bilgilendirme** amaçlıdır ve **tıbbi
tavsiye niteliği taşımaz**.

- Diewish bir hekim, diyetisyen veya sağlık kuruluşu değildir ve teşhis ya da
  tedavi hizmeti sunmaz.
- Sağlığınıza ilişkin kararlar almadan önce mutlaka yetkili bir sağlık
  profesyoneline danışın.
- Acil bir sağlık durumunda derhal en yakın sağlık kuruluşuna başvurun veya acil
  servisi arayın.
- Kan tahlili analizleri otomatik olarak üretilir ve bir hekim değerlendirmesinin
  yerine geçmez.

Bu hizmeti kullanarak, içeriğin tıbbi tavsiye olmadığını ve Diewish'in bu
içeriğe dayanarak alınan kararlardan sorumlu olmadığını kabul edersiniz.`;

const KVKK_CONSENT_BODY = `# KVKK Açık Rıza Metni

6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında, özel nitelikli
kişisel veriler dâhil olmak üzere sağlık verilerimin (beslenme profili, kan
tahlili sonuçları ve analizleri) Diewish tarafından kişiselleştirilmiş beslenme
ve sağlık hizmetlerinin sunulması amacıyla işlenmesine **açık rızam** ile onay
veriyorum.

Bu rızanın:
- Tamamen özgür irademle verildiğini,
- Dilediğim zaman uygulama üzerinden geri alınabileceğini,
- Geri alınması hâlinde ilgili işleme faaliyetinin durdurulacağını

biliyor ve kabul ediyorum.`;

const DOCUMENT_CONTENT: Record<
  LegalDocumentType,
  { title: string; body: string; mandatory: boolean }
> = {
  PRIVACY_POLICY: {
    title: "Gizlilik Politikası",
    body: PRIVACY_POLICY_BODY,
    mandatory: true,
  },
  TERMS_OF_SERVICE: {
    title: "Kullanım Koşulları",
    body: TERMS_OF_SERVICE_BODY,
    mandatory: true,
  },
  MEDICAL_DISCLAIMER: {
    title: "Tıbbi Sorumluluk Reddi",
    body: MEDICAL_DISCLAIMER_BODY,
    mandatory: true,
  },
  KVKK_EXPLICIT_CONSENT: {
    title: "KVKK Açık Rıza Metni",
    body: KVKK_CONSENT_BODY,
    mandatory: true,
  },
};

/** All legal documents, resolved with their configured versions. */
export const LEGAL_DOCUMENTS: LegalDocument[] = (
  Object.keys(DOCUMENT_CONTENT) as LegalDocumentType[]
).map((type) => ({
  type,
  version: DOCUMENT_VERSIONS[type],
  title: DOCUMENT_CONTENT[type].title,
  body: DOCUMENT_CONTENT[type].body,
  mandatory: DOCUMENT_CONTENT[type].mandatory,
}));

/** Fast lookup of a document by type. */
export const LEGAL_DOCUMENT_BY_TYPE: Record<LegalDocumentType, LegalDocument> =
  LEGAL_DOCUMENTS.reduce(
    (acc, doc) => {
      acc[doc.type] = doc;
      return acc;
    },
    {} as Record<LegalDocumentType, LegalDocument>,
  );

/**
 * Document types that require affirmative consent before the platform may be
 * used. Consumed by the require-consent middleware and the consent-status view.
 */
export const MANDATORY_CONSENTS: LegalDocumentType[] = LEGAL_DOCUMENTS.filter(
  (doc) => doc.mandatory,
).map((doc) => doc.type);

/** Machine-readable error code emitted when mandatory consent is missing. */
export const CONSENT_REQUIRED_CODE = "CONSENT_REQUIRED";
