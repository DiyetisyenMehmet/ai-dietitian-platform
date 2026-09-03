import type { LegalDocumentType } from "@prisma/client";

import { env } from "../../config/env";

export interface LegalDocument {
  type: LegalDocumentType;
  version: string;
  title: string;
  body: string;
  mandatory: boolean;
}

const DOCUMENT_VERSIONS: Record<LegalDocumentType, string> = {
  PRIVACY_POLICY: env.LEGAL_PRIVACY_POLICY_VERSION,
  TERMS_OF_SERVICE: env.LEGAL_TERMS_OF_SERVICE_VERSION,
  MEDICAL_DISCLAIMER: env.LEGAL_MEDICAL_DISCLAIMER_VERSION,
  KVKK_EXPLICIT_CONSENT: env.LEGAL_KVKK_CONSENT_VERSION,
};

const controllerIdentity = [
  `Veri sorumlusu: ${env.LEGAL_CONTROLLER_NAME}.`,
  env.LEGAL_CONTROLLER_ADDRESS ? `Merkez adresi: ${env.LEGAL_CONTROLLER_ADDRESS}.` : "",
  `E-posta: ${env.LEGAL_CONTROLLER_EMAIL}.`,
  env.LEGAL_CONTROLLER_KEP ? `KEP: ${env.LEGAL_CONTROLLER_KEP}.` : "",
  env.LEGAL_CONTROLLER_PHONE ? `Telefon: ${env.LEGAL_CONTROLLER_PHONE}.` : "",
]
  .filter(Boolean)
  .join(" ");

const PRIVACY_POLICY_BODY = `# KVKK Aydınlatma ve Gizlilik Bilgilendirmesi

Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında bilgilendirme amacı taşır. Aydınlatma, açık rızadan ayrıdır; sağlık verilerinin rızaya dayalı işlenmesine ilişkin olumlu beyan ayrıca alınır.

## Veri Sorumlusu
${controllerIdentity}

## İşlenen Veri Kategorileri
- Hesap ve iletişim bilgileri: ad, e-posta, kullanıcı kimliği.
- İşlem güvenliği: oturum, ağ/cihaz ve güvenlik kayıtları.
- Profil ve kullanım verileri: boy, kilo, hedef, öğün, su, aktivite ve beslenme tercihleri.
- Özel nitelikli sağlık verileri: sağlık durumu, alerjiler, kullanıcı tarafından yüklenen kan tahlili dosyaları/sonuçları ve bunlardan üretilen analizler; yalnızca uygulanabilir işleme şartı mevcutsa.
- Yapay zekâ etkileşimleri: kullanıcının mesajları ve talep edilen özelliğin çalışması için gerekli bağlam.
- Ödeme kayıtları: plan, tutar, para birimi, ödeme sağlayıcısı işlem kimliği ve ödeme durumu. Kart numarası ve CVV Diewish veritabanında saklanmaz.

## İşleme Amaçları
- Hesap oluşturmak, kimlik doğrulamak ve güvenliği sağlamak.
- Kullanıcının talep ettiği takip, planlama ve yapay zekâ destekli yazılım özelliklerini sunmak.
- Ücretli erişim ve ödeme süreçlerini yürütmek.
- Destek, hata giderme, kötüye kullanım önleme ve hukuki yükümlülükleri yerine getirmek.

## Toplama Yöntemi ve Hukuki Sebepler
Veriler; kullanıcı girişleri, yüklenen dosyalar, uygulama kullanım kayıtları, ödeme sağlayıcısı bildirimleri ve güvenlik kayıtları yoluyla elektronik ortamda toplanır. İşleme faaliyetleri; sözleşmenin kurulması/ifası, hukuki yükümlülük, hakkın tesisi-kullanılması-korunması, meşru menfaat ve uygulanabildiği ölçüde açık rıza gibi KVKK'da öngörülen hukuki sebeplere dayanır. Özel nitelikli sağlık verileri için ayrıca ilgili özel nitelikli veri işleme şartı gözetilir.

## Aktarım
Veriler yalnızca amaçla sınırlı ve gerekli ölçüde barındırma/veritabanı, yapay zekâ altyapısı, e-posta, güvenlik ve ödeme hizmeti sağlayıcıları ile hukuken yetkili kişi/kurumlara aktarılabilir. Yurt dışına aktarım söz konusu olduğunda KVKK m.9 kapsamındaki şartlar ve uygun güvenceler uygulanır.

## İlgili Kişi Hakları
KVKK kapsamındaki öğrenme, bilgi talep etme, düzeltme, silme/yok etme, aktarım yapılan üçüncü kişilere bildirim, otomatik analiz sonucuna itiraz ve kanuna aykırı işleme nedeniyle zararın giderilmesini talep haklarınız saklıdır.

## Başvuru
Veri sahibi başvurularınızı ${env.LEGAL_CONTROLLER_EMAIL}${env.LEGAL_CONTROLLER_KEP ? ` veya ${env.LEGAL_CONTROLLER_KEP}` : ""} üzerinden iletebilirsiniz.`;

const TERMS_OF_SERVICE_BODY = `# Kullanım Koşulları

Diewish, kullanıcıların kendi hesapları üzerinden kullandığı yapay zekâ destekli beslenme ve takip yazılım platformudur. Diewish üzerinden bire bir hekim veya diyetisyen danışmanlığı satılmaz.

## Kullanıcı Yükümlülükleri
- Doğru ve güncel bilgi sağlamak.
- Hesap güvenliğini korumak.
- Başkasına ait kişisel/sağlık verisini yetkisiz şekilde yüklememek.
- Hizmeti hukuka aykırı veya kötüye kullanım amacıyla kullanmamak.

## Ücretli Erişim
Mevcut V1 ödeme modeli, Premium veya Premium Plus satın alındığında tek seferlik 30 günlük dijital yazılım erişimi sağlar. Otomatik yenileme ve yıllık tahsilat ayrıca açıkça sunulmadıkça uygulanmaz. Güncel plan, toplam bedel ve süre ödeme öncesinde gösterilir.

## Ödeme
Production ödeme özelliği etkinleştirildiğinde kart işlemi iyzico'nun güvenli ödeme akışında tamamlanır. Diewish kart numarası veya CVV bilgisini kendi veritabanında saklamaz.

## Tıbbi Sınırlar
Diewish teşhis, tedavi veya acil sağlık hizmeti sunmaz. Üretilen içerikler bilgilendirme amaçlıdır ve sağlık profesyonelinin değerlendirmesinin yerine geçmez.`;

const MEDICAL_DISCLAIMER_BODY = `# Tıbbi Sorumluluk Reddi

Diewish tarafından oluşturulan beslenme planları, kan tahlili özetleri ve yapay zekâ sohbet yanıtları yalnızca genel bilgilendirme amaçlıdır ve tıbbi tavsiye niteliği taşımaz.

- Diewish bir hekim, diyetisyen veya sağlık kuruluşu değildir; teşhis veya tedavi hizmeti sunmaz.
- Sağlık kararları almadan önce yetkili bir sağlık profesyoneline danışın.
- Acil durumda en yakın sağlık kuruluşuna başvurun veya acil yardım hizmetlerini kullanın.
- Otomatik kan tahlili özetleri hekim değerlendirmesinin yerine geçmez.`;

const KVKK_CONSENT_BODY = `# Sağlık Verilerinin İşlenmesine İlişkin Açık Rıza Metni

KVKK aydınlatma metnini okudum. Diewish'e kendim tarafından girdiğim sağlık durumu ve alerji bilgileri ile yüklediğim kan tahlili dosyaları, tahlil değerleri ve bunlardan üretilen analizlerin; talep ettiğim Diewish özelliklerini kişiselleştirmek, tahlil sonuçlarını bilgilendirme amaçlı sadeleştirmek ve ilgili yapay zekâ özelliklerini çalıştırmak amacıyla işlenmesine açık rıza veriyorum.

Talep edilen özelliğin teknik olarak çalışması için gerekli asgari verinin, sözleşmeli barındırma/veritabanı veya yapay zekâ altyapısı sağlayıcıları tarafından veri işleyen sıfatıyla işlenebileceği konusunda bilgilendirildim. Yurt dışına aktarım gerektiğinde uygulanabilir KVKK aktarım şartlarının ayrıca sağlanması gerektiğini biliyorum.

Bu rızayı özgür irademle verdiğimi, rıza vermediğimde hesabımı ve rıza gerektirmeyen işlevleri kullanmaya devam edebileceğimi ve rızamı uygulamadaki Gizlilik ve İzinler alanından ileriye etkili olarak geri çekebileceğimi biliyorum.`;

const DOCUMENT_CONTENT: Record<
  LegalDocumentType,
  { title: string; body: string; mandatory: boolean }
> = {
  PRIVACY_POLICY: {
    title: "KVKK Aydınlatma ve Gizlilik Bilgilendirmesi",
    body: PRIVACY_POLICY_BODY,
    // Illumination is information, not consent. It remains available publicly
    // and in-app but is not represented as an affirmative privacy permission.
    mandatory: false,
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
    title: "Sağlık Verisi Açık Rıza Metni",
    body: KVKK_CONSENT_BODY,
    mandatory: true,
  },
};

export const LEGAL_DOCUMENTS: LegalDocument[] = (
  Object.keys(DOCUMENT_CONTENT) as LegalDocumentType[]
).map((type) => ({
  type,
  version: DOCUMENT_VERSIONS[type],
  title: DOCUMENT_CONTENT[type].title,
  body: DOCUMENT_CONTENT[type].body,
  mandatory: DOCUMENT_CONTENT[type].mandatory,
}));

export const LEGAL_DOCUMENT_BY_TYPE: Record<LegalDocumentType, LegalDocument> =
  LEGAL_DOCUMENTS.reduce(
    (acc, doc) => {
      acc[doc.type] = doc;
      return acc;
    },
    {} as Record<LegalDocumentType, LegalDocument>,
  );

export const MANDATORY_CONSENTS: LegalDocumentType[] = LEGAL_DOCUMENTS.filter(
  (doc) => doc.mandatory,
).map((doc) => doc.type);

export const CONSENT_REQUIRED_CODE = "CONSENT_REQUIRED";
