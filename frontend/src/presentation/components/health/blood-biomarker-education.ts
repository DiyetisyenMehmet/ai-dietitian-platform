import type { BloodTestNormalizedValue } from "@/infrastructure/tracking/blood-test-client";

/**
 * Deterministic, non-diagnostic laboratory glossary used by the Premium blood
 * result UI. This content is intentionally curated in source instead of being
 * generated per request: common biomarker meanings stay consistent, do not cost
 * AI tokens, and cannot hallucinate a different definition from one analysis to
 * the next. The user's actual value/status always comes from the analyzed lab
 * record and its report-specific reference range.
 */
export interface BiomarkerEducation {
  title: string;
  category: string;
  whatItMeasures: string;
  whyItMatters: string;
}

const EDUCATION: Record<string, BiomarkerEducation> = {
  WBC: {
    title: "Lökosit / Beyaz Kan Hücresi (WBC)",
    category: "Hemogram • Bağışıklık",
    whatItMeasures: "Kandaki toplam beyaz kan hücresi sayısını gösterir.",
    whyItMatters: "Beyaz kan hücreleri bağışıklık sisteminin parçalarıdır. WBC, diğer lökosit alt gruplarıyla birlikte genel bağışıklık hücresi dağılımını anlamaya yardımcı olur.",
  },
  RBC: {
    title: "Eritrosit / Kırmızı Kan Hücresi (RBC)",
    category: "Hemogram • Alyuvarlar",
    whatItMeasures: "Kandaki kırmızı kan hücresi sayısını gösterir.",
    whyItMatters: "Eritrositler oksijen taşınmasına katkı sağlar. RBC; hemoglobin, hematokrit, MCV, MCH ve RDW ile birlikte değerlendirilir.",
  },
  HGB: {
    title: "Hemoglobin (HGB/Hb)",
    category: "Hemogram • Oksijen taşıma",
    whatItMeasures: "Kırmızı kan hücrelerindeki oksijen taşıyan hemoglobin proteininin kandaki miktarını gösterir.",
    whyItMatters: "Hemoglobin, dokulara oksijen taşınmasının temel göstergelerinden biridir ve eritrosit göstergeleriyle birlikte yorumlanır.",
  },
  HCT: {
    title: "Hematokrit (HCT)",
    category: "Hemogram • Alyuvarlar",
    whatItMeasures: "Kan hacminin yaklaşık ne kadarının kırmızı kan hücrelerinden oluştuğunu yüzde olarak gösterir.",
    whyItMatters: "Hematokrit, RBC ve hemoglobinle birlikte kırmızı kan hücresi durumunun genel değerlendirilmesine katkı sağlar.",
  },
  MCV: {
    title: "Ortalama Eritrosit Hacmi (MCV)",
    category: "Hemogram • Alyuvar indeksleri",
    whatItMeasures: "Kırmızı kan hücrelerinin ortalama büyüklüğünü gösterir.",
    whyItMatters: "MCV, alyuvarların boyut özelliklerini anlamaya yardımcı olur ve hemoglobin, RDW ve diğer eritrosit indeksleriyle birlikte değerlendirilir.",
  },
  MCH: {
    title: "Ortalama Eritrosit Hemoglobini (MCH)",
    category: "Hemogram • Alyuvar indeksleri",
    whatItMeasures: "Bir kırmızı kan hücresinde ortalama ne kadar hemoglobin bulunduğunu gösterir.",
    whyItMatters: "MCH, kırmızı kan hücrelerinin hemoglobin içeriğini tanımlar ve MCV/MCHC gibi diğer eritrosit indeksleriyle birlikte anlam kazanır.",
  },
  MCHC: {
    title: "Ortalama Eritrosit Hemoglobin Konsantrasyonu (MCHC)",
    category: "Hemogram • Alyuvar indeksleri",
    whatItMeasures: "Kırmızı kan hücreleri içindeki ortalama hemoglobin yoğunluğunu gösterir.",
    whyItMatters: "MCHC, eritrositlerin hemoglobin yoğunluğunu değerlendiren bir indekstir; HGB, MCV ve MCH ile birlikte ele alınır.",
  },
  RDW_CV: {
    title: "Eritrosit Dağılım Genişliği (RDW-CV)",
    category: "Hemogram • Alyuvar indeksleri",
    whatItMeasures: "Kırmızı kan hücrelerinin boyutlarının birbirinden ne kadar farklı olduğunu yüzde olarak gösterir.",
    whyItMatters: "RDW-CV, alyuvar boyutlarındaki değişkenliği gösterir. Tek başına değil, özellikle MCV ve hemoglobin gibi değerlerle birlikte değerlendirilir.",
  },
  RDW_SD: {
    title: "Eritrosit Dağılım Genişliği (RDW-SD)",
    category: "Hemogram • Alyuvar indeksleri",
    whatItMeasures: "Kırmızı kan hücresi boyutlarındaki dağılım genişliğini fL cinsinden gösterir.",
    whyItMatters: "RDW-SD de alyuvar boyutlarının ne kadar değişken olduğunu anlatır; RDW-CV, MCV ve diğer eritrosit göstergeleriyle birlikte değerlendirilir.",
  },
  PLT: {
    title: "Trombosit (PLT / Platelets)",
    category: "Hemogram • Pıhtılaşma",
    whatItMeasures: "Kandaki trombosit sayısını gösterir.",
    whyItMatters: "Trombositler kanamanın durdurulması ve pıhtı oluşum sürecinde görev alan hücresel yapılardır. PLT; MPV, PDW ve diğer klinik bilgilerle birlikte değerlendirilir.",
  },
  MPV: {
    title: "Ortalama Trombosit Hacmi (MPV)",
    category: "Hemogram • Trombosit indeksleri",
    whatItMeasures: "Trombositlerin ortalama büyüklüğünü gösterir.",
    whyItMatters: "MPV trombositlerin boyut özelliğini anlatır. PLT sayısı ve diğer trombosit indeksleriyle birlikte değerlendirilmesi daha anlamlıdır.",
  },
  PDW: {
    title: "Trombosit Dağılım Genişliği (PDW)",
    category: "Hemogram • Trombosit indeksleri",
    whatItMeasures: "Trombositlerin boyutlarının birbirinden ne kadar farklı olduğunu gösterir.",
    whyItMatters: "PDW, trombosit boyutlarındaki değişkenliği tanımlar. Tek başına tanısal değildir; PLT ve MPV gibi diğer trombosit göstergeleriyle birlikte değerlendirilir.",
  },
  P_LCR: {
    title: "Büyük Trombosit Oranı (P-LCR)",
    category: "Hemogram • Trombosit indeksleri",
    whatItMeasures: "Kandaki daha büyük hacimli trombositlerin toplam trombositler içindeki oranını gösterir.",
    whyItMatters: "Trombosit boyut dağılımı hakkında tamamlayıcı bilgi verir ve PLT, MPV ve PDW ile birlikte değerlendirilir.",
  },
  NEUT_ABS: {
    title: "Nötrofil Mutlak Sayısı (NEUT#)",
    category: "Hemogram • Beyaz kan hücreleri",
    whatItMeasures: "Kandaki nötrofillerin mutlak sayısını gösterir.",
    whyItMatters: "Nötrofiller bağışıklık sisteminin önemli beyaz kan hücresi gruplarındandır. Mutlak sayı, yüzde değeri ve toplam WBC ile birlikte değerlendirilir.",
  },
  NEUT_PCT: {
    title: "Nötrofil Oranı (NEUT%)",
    category: "Hemogram • Beyaz kan hücreleri",
    whatItMeasures: "Beyaz kan hücrelerinin yüzde kaçının nötrofil olduğunu gösterir.",
    whyItMatters: "Bağışıklık hücrelerinin dağılımını gösteren bir orandır; mutlak nötrofil sayısı ve toplam WBC ile birlikte okunmalıdır.",
  },
  LYMPH_ABS: {
    title: "Lenfosit Mutlak Sayısı (LYMPH#)",
    category: "Hemogram • Beyaz kan hücreleri",
    whatItMeasures: "Kandaki lenfositlerin mutlak sayısını gösterir.",
    whyItMatters: "Lenfositler bağışıklık yanıtında görev alan beyaz kan hücreleridir. Mutlak sayı, lenfosit yüzdesi ve WBC ile birlikte değerlendirilir.",
  },
  LYMPH_PCT: {
    title: "Lenfosit Oranı (LYMPH%)",
    category: "Hemogram • Beyaz kan hücreleri",
    whatItMeasures: "Beyaz kan hücrelerinin yüzde kaçının lenfosit olduğunu gösterir.",
    whyItMatters: "Bağışıklık hücre dağılımına ilişkin bir orandır; mutlak lenfosit sayısı ve toplam WBC ile birlikte değerlendirilir.",
  },
  MONO_ABS: {
    title: "Monosit Mutlak Sayısı (MONO#)",
    category: "Hemogram • Beyaz kan hücreleri",
    whatItMeasures: "Kandaki monositlerin mutlak sayısını gösterir.",
    whyItMatters: "Monositler bağışıklık sisteminde görev alan beyaz kan hücreleridir. Sonuç, monosit yüzdesi ve diğer lökosit değerleriyle birlikte ele alınır.",
  },
  MONO_PCT: {
    title: "Monosit Oranı (MONO%)",
    category: "Hemogram • Beyaz kan hücreleri",
    whatItMeasures: "Beyaz kan hücrelerinin yüzde kaçının monosit olduğunu gösterir.",
    whyItMatters: "Lökosit dağılımının bir parçasıdır ve mutlak monosit sayısı ile toplam WBC bağlamında değerlendirilir.",
  },
  EOS_ABS: {
    title: "Eozinofil Mutlak Sayısı (EO#/EOS#)",
    category: "Hemogram • Beyaz kan hücreleri",
    whatItMeasures: "Kandaki eozinofillerin mutlak sayısını gösterir.",
    whyItMatters: "Eozinofiller bağışıklık hücrelerinin bir alt grubudur. Sonuç, eozinofil yüzdesi ve diğer lökosit değerleriyle birlikte değerlendirilir.",
  },
  EOS_PCT: {
    title: "Eozinofil Oranı (EO%/EOS%)",
    category: "Hemogram • Beyaz kan hücreleri",
    whatItMeasures: "Beyaz kan hücrelerinin yüzde kaçının eozinofil olduğunu gösterir.",
    whyItMatters: "Lökosit dağılımının bir parçasıdır ve mutlak eozinofil sayısıyla birlikte daha anlamlıdır.",
  },
  BASO_ABS: {
    title: "Bazofil Mutlak Sayısı (BASO#)",
    category: "Hemogram • Beyaz kan hücreleri",
    whatItMeasures: "Kandaki bazofillerin mutlak sayısını gösterir.",
    whyItMatters: "Bazofiller beyaz kan hücrelerinin küçük bir alt grubudur. Sonuç, bazofil yüzdesi ve diğer lökosit göstergeleriyle birlikte değerlendirilir.",
  },
  BASO_PCT: {
    title: "Bazofil Oranı (BASO%)",
    category: "Hemogram • Beyaz kan hücreleri",
    whatItMeasures: "Beyaz kan hücrelerinin yüzde kaçının bazofil olduğunu gösterir.",
    whyItMatters: "Lökosit dağılımını tamamlayan bir orandır; mutlak bazofil sayısı ve toplam WBC ile birlikte ele alınır.",
  },
  NLR: {
    title: "Nötrofil / Lenfosit Oranı (NLR)",
    category: "Hemogram • Türetilmiş oran",
    whatItMeasures: "Mutlak nötrofil sayısının mutlak lenfosit sayısına oranını gösterir.",
    whyItMatters: "NLR tek bir hücre sayısı değil, iki lökosit grubundan türetilen bir orandır. Tek başına tanısal değildir ve klinik bağlam olmadan hastalık sonucu çıkarılmamalıdır.",
  },
  HBA1C: {
    title: "Glikolize Hemoglobin (HbA1c)",
    category: "Kan şekeri",
    whatItMeasures: "Hemoglobine bağlanmış glukoz oranını ölçerek yakın geçmişteki ortalama kan şekeri düzeyi hakkında bilgi verir.",
    whyItMatters: "Tek bir anlık glukoz ölçümünden farklı olarak daha uzun dönemli kan şekeri örüntüsünü değerlendirmeye yardımcı olur. Raporun kendi referans aralığı esas alınır.",
  },
  TIBC: {
    title: "Total Demir Bağlama Kapasitesi (TDBK / TIBC)",
    category: "Demir metabolizması",
    whatItMeasures: "Kandaki demir taşıma proteinlerinin demir bağlama kapasitesini yansıtan laboratuvar ölçümüdür.",
    whyItMatters: "Serum demiri ile aynı test değildir. Demir metabolizması değerlendirilirken serum demiri, ferritin ve gerektiğinde transferrin satürasyonu gibi diğer ölçümlerle birlikte ele alınır.",
  },
  IRON: {
    title: "Serum Demiri",
    category: "Demir metabolizması",
    whatItMeasures: "Kan serumunda ölçülen demir miktarını gösterir.",
    whyItMatters: "Serum demiri gün içi ve beslenme gibi etkenlerden etkilenebilir; tek başına demir depolarını göstermez ve ferritin/TDBK gibi diğer testlerle birlikte değerlendirilir.",
  },
  FERRITIN: {
    title: "Ferritin",
    category: "Demir metabolizması",
    whatItMeasures: "Vücuttaki demir depolarıyla ilişkili ferritin proteininin kandaki düzeyini ölçer.",
    whyItMatters: "Demir durumunun değerlendirilmesinde kullanılan önemli ölçümlerden biridir; sonuç diğer kan değerleri ve klinik bağlamla birlikte yorumlanır.",
  },
  GLUCOSE: {
    title: "Glukoz / Kan Şekeri",
    category: "Kan şekeri",
    whatItMeasures: "Kan örneğinde ölçüm anındaki glukoz düzeyini gösterir.",
    whyItMatters: "Sonucun anlamı açlık/tokluk durumu ve laboratuvar referansına göre değişebilir. HbA1c gibi diğer ölçümlerle birlikte değerlendirilmesi gerekebilir.",
  },
  INSULIN: {
    title: "İnsülin",
    category: "Kan şekeri",
    whatItMeasures: "Kandaki insülin hormonunun düzeyini ölçer.",
    whyItMatters: "İnsülin sonucu örnekleme koşulları ve glukozla birlikte değerlendirilir; tek başına metabolik durum hakkında kesin sonuç vermez.",
  },
  VITAMIN_D: {
    title: "25-OH D Vitamini",
    category: "Vitaminler",
    whatItMeasures: "D vitamini durumunu değerlendirmede yaygın kullanılan 25-hidroksi D vitamini düzeyini ölçer.",
    whyItMatters: "Sonuç laboratuvarın yöntem ve referans aralığına göre değerlendirilir. Diewish ölçülmemiş bir D vitamini eksikliği varsaymaz.",
  },
  VITAMIN_B12: {
    title: "Vitamin B12",
    category: "Vitaminler",
    whatItMeasures: "Kandaki B12 vitamini düzeyini ölçer.",
    whyItMatters: "B12 çeşitli hücresel süreçlerde görev alır. Diewish yalnızca gerçekten ölçülmüş sonucu ve rapordaki referansı dikkate alır.",
  },
  FOLATE: {
    title: "Folat (Vitamin B9)",
    category: "Vitaminler",
    whatItMeasures: "Kandaki folat düzeyini ölçer.",
    whyItMatters: "Folat hücre bölünmesi ve kan hücresi üretimiyle ilişkili süreçlerde rol oynar; sonuç laboratuvar referansına göre ele alınır.",
  },
  CREATININE: {
    title: "Kreatinin",
    category: "Böbrek fonksiyonları",
    whatItMeasures: "Kas metabolizması sonucu oluşan kreatininin kandaki düzeyini ölçer.",
    whyItMatters: "Böbreklerin süzme fonksiyonunu değerlendiren ölçümlerden biridir ve eGFR gibi diğer bilgilerle birlikte yorumlanır.",
  },
  EGFR: {
    title: "Tahmini Glomerüler Filtrasyon Hızı (eGFR)",
    category: "Böbrek fonksiyonları",
    whatItMeasures: "Böbreklerin kanı süzme kapasitesini tahmini olarak ifade eder.",
    whyItMatters: "Hesaplanmış bir değerdir; yaş, kreatinin ve kullanılan formül gibi etkenlere bağlıdır. Tek başına tanı amacıyla kullanılmaz.",
  },
  BUN: {
    title: "Üre Azotu (BUN)",
    category: "Böbrek fonksiyonları",
    whatItMeasures: "Protein metabolizması sonrası oluşan üre azotunun kandaki düzeyini ölçer.",
    whyItMatters: "Sıvı durumu, beslenme ve böbrek fonksiyonu gibi birçok etkenden etkilenebilir; kreatinin ve diğer bulgularla birlikte değerlendirilir.",
  },
  TSH: {
    title: "Tiroid Uyarıcı Hormon (TSH)",
    category: "Tiroid",
    whatItMeasures: "Hipofiz bezinden salgılanan ve tiroid bezini uyaran TSH hormonunun düzeyini ölçer.",
    whyItMatters: "Tiroid değerlendirmesinde temel testlerden biridir; gerektiğinde serbest T4/T3 gibi diğer sonuçlarla birlikte ele alınır.",
  },
  FT3: {
    title: "Serbest T3 (fT3)",
    category: "Tiroid",
    whatItMeasures: "Kandaki serbest triiodotironin (T3) hormon düzeyini ölçer.",
    whyItMatters: "Tiroid hormon durumunun bir parçasıdır ve TSH/fT4 ile birlikte değerlendirilir.",
  },
  FT4: {
    title: "Serbest T4 (fT4)",
    category: "Tiroid",
    whatItMeasures: "Kandaki serbest tiroksin (T4) hormon düzeyini ölçer.",
    whyItMatters: "Tiroid fonksiyonlarının değerlendirilmesinde TSH ile birlikte sık kullanılan tamamlayıcı bir ölçümdür.",
  },
  TOTAL_CHOLESTEROL: {
    title: "Total Kolesterol",
    category: "Lipid profili",
    whatItMeasures: "Kandaki toplam kolesterol miktarını gösterir.",
    whyItMatters: "Lipid profili değerlendirilirken LDL, HDL ve trigliserid gibi diğer yağ ölçümleriyle birlikte ele alınır.",
  },
  LDL: {
    title: "LDL Kolesterol",
    category: "Lipid profili",
    whatItMeasures: "LDL parçacıklarıyla taşınan kolesterol miktarını gösterir.",
    whyItMatters: "Lipid profilinin önemli bileşenlerinden biridir; değerlendirme diğer lipid sonuçları ve kişisel sağlık bağlamıyla birlikte yapılır.",
  },
  HDL: {
    title: "HDL Kolesterol",
    category: "Lipid profili",
    whatItMeasures: "HDL parçacıklarıyla taşınan kolesterol miktarını gösterir.",
    whyItMatters: "Total kolesterol, LDL ve trigliserid ile birlikte lipid profilinin bütününü anlamaya yardımcı olur.",
  },
  TRIGLYCERIDES: {
    title: "Trigliserid",
    category: "Lipid profili",
    whatItMeasures: "Kandaki trigliserid adı verilen yağların düzeyini ölçer.",
    whyItMatters: "Beslenme ve örnekleme koşullarından etkilenebilir; lipid profilinin diğer bileşenleriyle birlikte değerlendirilir.",
  },
  ALT: {
    title: "Alanin Aminotransferaz (ALT)",
    category: "Karaciğer enzimleri",
    whatItMeasures: "Başta karaciğer hücrelerinde bulunan ALT enziminin kandaki aktivitesini ölçer.",
    whyItMatters: "Karaciğer enzimleri arasında değerlendirilir; tek bir ALT sonucu neden veya tanı göstermez ve diğer bulgularla birlikte ele alınır.",
  },
  AST: {
    title: "Aspartat Aminotransferaz (AST)",
    category: "Karaciğer enzimleri",
    whatItMeasures: "Karaciğer ve başka dokularda bulunan AST enziminin kandaki aktivitesini ölçer.",
    whyItMatters: "ALT ve diğer laboratuvar sonuçlarıyla birlikte değerlendirilir; tek başına belirli bir neden göstermez.",
  },
  ALP: {
    title: "Alkalen Fosfataz (ALP)",
    category: "Karaciğer / kemik ilişkili enzim",
    whatItMeasures: "Başta safra yolları ve kemik dokusuyla ilişkili kaynaklardan gelebilen ALP enziminin kandaki aktivitesini ölçer.",
    whyItMatters: "ALP sonucu diğer karaciğer enzimleri ve kişisel klinik bağlamla birlikte değerlendirilir.",
  },
  ALBUMIN: {
    title: "Albümin",
    category: "Proteinler",
    whatItMeasures: "Kandaki başlıca proteinlerden albüminin düzeyini ölçer.",
    whyItMatters: "Beslenme dahil birçok farklı durumdan etkilenebilen bir ölçümdür; tek başına beslenme yetersizliği veya hastalık tanısı göstermez.",
  },
};

const RAW_NAME_ALIASES: Record<string, string> = {
  "rdw-cv": "RDW_CV",
  "rdw cv": "RDW_CV",
  "rdw-sd": "RDW_SD",
  "rdw sd": "RDW_SD",
  "platelets": "PLT",
  "platelet": "PLT",
  "trombosit": "PLT",
  "total demir bağlama kapasitesi": "TIBC",
  "demir bağlama kapasitesi": "TIBC",
  "tdbk": "TIBC",
  "tibc": "TIBC",
  "%hb a1c (ngsp)": "HBA1C",
  "%hb a1c": "HBA1C",
  "hba1c": "HBA1C",
  "hb a1c": "HBA1C",
};

function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[_()[\]:.,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves curated education for a normalized result. PCT is intentionally
 * disambiguated: in a CBC it commonly means plateletcrit, but the abbreviation
 * can also mean procalcitonin. We only present the plateletcrit explanation when
 * the report itself expresses PCT as a percentage.
 */
export function getBiomarkerEducation(
  value: BloodTestNormalizedValue,
): BiomarkerEducation | null {
  const code = value.biomarkerCode?.toUpperCase();
  if (code && EDUCATION[code]) return EDUCATION[code];

  const rawName = normalizeName(value.biomarkerName || value.biomarkerCode || "");
  if (rawName === "pct" && value.unit.trim() === "%") {
    return {
      title: "Plateletkrit (PCT)",
      category: "Hemogram • Trombosit indeksleri",
      whatItMeasures: "Trombositlerin toplam kan hacmi içinde kapladığı yaklaşık hacim oranını gösterir.",
      whyItMatters: "Trombosit sayısı ve ortalama trombosit hacmiyle ilişkili türetilmiş bir indekstir. PLT ve MPV ile birlikte değerlendirilir; tek başına tanısal değildir.",
    };
  }

  const aliasCode = RAW_NAME_ALIASES[rawName];
  return aliasCode ? EDUCATION[aliasCode] ?? null : null;
}
