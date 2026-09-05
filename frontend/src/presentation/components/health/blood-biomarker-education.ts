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

/**
 * Premium explanatory layer: tells the user what the measured cell/substance or
 * index actually does in the body. These are deliberately short, stable and
 * non-diagnostic. For calculated/index values, the text explicitly says the
 * value itself is an index rather than pretending it has a biological function.
 */
const BODY_ROLE: Record<string, string> = {
  WBC: "Lökositler vücudu mikroorganizmalara ve yabancı yapılara karşı savunan bağışıklık hücreleridir.",
  RBC: "Eritrositlerin temel görevi hemoglobin aracılığıyla akciğerlerden dokulara oksijen taşımak ve karbondioksitin taşınmasına katkı sağlamaktır.",
  HGB: "Hemoglobin eritrositlerin içindeki oksijen bağlayan proteindir; oksijenin akciğerlerden dokulara taşınmasının ana taşıyıcılarından biridir.",
  HCT: "Hematokrit bir madde değildir; kan hacminin ne kadarının eritrositlerden oluştuğunu ifade eden orandır.",
  MCV: "MCV bir hücre veya madde değil, eritrositlerin ortalama büyüklüğünü gösteren indekstir. Eritrositler oksijen taşır.",
  MCH: "MCH bir indekstir; tek bir eritrositte ortalama ne kadar hemoglobin bulunduğunu anlatır. Hemoglobin oksijen taşır.",
  MCHC: "MCHC bir indekstir; eritrosit içindeki hemoglobinin ortalama yoğunluğunu gösterir. Hemoglobin oksijen taşınmasında görev yapar.",
  RDW_CV: "RDW-CV'nin kendisi bir hücre veya hormon değildir; eritrosit boyutlarının birbirinden ne kadar farklı olduğunu gösteren indekstir. Eritrositlerin temel görevi oksijen taşımaktır.",
  RDW_SD: "RDW-SD'nin kendisi bir hücre veya hormon değildir; eritrosit boyut değişkenliğini fL cinsinden ölçen indekstir. Eritrositlerin temel görevi oksijen taşımaktır.",
  PLT: "Trombositler damar hasarı olduğunda birbirine tutunarak kanamanın durdurulmasına ve pıhtı tıkacının oluşmasına katkı sağlar.",
  MPV: "MPV bir trombosit sayısı değil, trombositlerin ortalama hacmini gösteren indekstir; trombositler pıhtılaşma ve kanamanın durdurulmasında görev alır.",
  PDW: "PDW bir hücre değildir; trombosit boyutlarının ne kadar değişken olduğunu gösteren indekstir. Trombositlerin temel görevi kanamanın durdurulmasına katkı sağlamaktır.",
  P_LCR: "P-LCR bir hücre değildir; büyük hacimli trombositlerin toplam trombositler içindeki oranını gösterir. Trombositler pıhtılaşma sürecine katılır.",
  NEUT_ABS: "Nötrofiller doğuştan bağışıklığın önemli hücrelerindendir; özellikle mikroorganizmaları tanıyıp etkisizleştirmeye ve fagosite etmeye katkı sağlar.",
  NEUT_PCT: "NEUT% bir hücre değil, nötrofillerin lökositler içindeki payıdır. Nötrofiller doğuştan bağışıklık savunmasında görev alır.",
  LYMPH_ABS: "Lenfositler bağışıklık hafızası, antikor yanıtı ve hücresel bağışıklık gibi görevleri üstlenen B, T ve NK hücre gruplarını kapsar.",
  LYMPH_PCT: "LYMPH% bir hücre değil, lenfositlerin lökositler içindeki payıdır. Lenfositler özgül bağışıklık yanıtının önemli parçalarıdır.",
  MONO_ABS: "Monositler mikroorganizmaların ve hücresel artıkların temizlenmesine katkı sağlayan bağışıklık hücreleridir; dokularda makrofaj benzeri hücrelere dönüşebilirler.",
  MONO_PCT: "MONO% bir hücre değil, monositlerin lökositler içindeki payıdır. Monositler yabancı maddelerin ve hücresel artıkların temizlenmesine katkı sağlar.",
  EOS_ABS: "Eozinofiller özellikle parazitlere karşı savunma ile alerjik ve bazı inflamatuvar yanıtlarda görev alan bağışıklık hücreleridir.",
  EOS_PCT: "EO% bir hücre değil, eozinofillerin lökositler içindeki payıdır. Eozinofiller parazit savunması ile alerjik/inflamatuvar yanıtlara katılır.",
  BASO_ABS: "Bazofiller alerjik ve inflamatuvar yanıtlarda histamin gibi mediyatörlerin salınmasına katkı sağlayan nadir beyaz kan hücreleridir.",
  BASO_PCT: "BASO% bir hücre değil, bazofillerin lökositler içindeki payıdır. Bazofiller alerjik ve inflamatuvar yanıtlara katılır.",
  NLR: "NLR'nin kendisinin vücutta bir görevi yoktur; nötrofil sayısının lenfosit sayısına bölünmesiyle elde edilen türetilmiş bir orandır.",
  HBA1C: "HbA1c, glukozun hemoglobine bağlanmasıyla oluşur ve eritrositlerin yaşam süresi boyunca kan şekeri maruziyetini yansıtan bir göstergedir.",
  TIBC: "TDBK/TIBC'nin kendisi bir taşıyıcı değildir; başta transferrin olmak üzere kandaki demir taşıyan proteinlerin ne kadar demir bağlayabildiğini yansıtır. Transferrin demirin kanda taşınmasına yardım eder.",
  IRON: "Demir; hemoglobinin yapısında bulunur, oksijen taşınması ve birçok enzimin çalışması için gereklidir.",
  FERRITIN: "Ferritin hücrelerde demiri depolayan proteindir; kandaki ferritin düzeyi demir depoları hakkında dolaylı bilgi verir.",
  GLUCOSE: "Glukoz hücrelerin temel enerji kaynaklarından biridir; özellikle beyin ve çalışan kas dokusu enerji için glukozdan yararlanır.",
  INSULIN: "İnsülin pankreastan salgılanan hormondur; glukozun hücrelere alınmasını ve enerji metabolizmasının düzenlenmesini sağlar.",
  VITAMIN_D: "D vitamini kalsiyum-fosfor dengesinin ve kemik mineralizasyonunun düzenlenmesine katkı sağlar; bağışıklık dahil başka hücresel süreçlerde de rol oynar.",
  VITAMIN_B12: "B12 vitamini DNA sentezi, sinir sistemi işlevleri ve normal kan hücresi üretimi için gereklidir.",
  FOLATE: "Folat DNA sentezi ve hücre bölünmesi için gereklidir; hızlı yenilenen dokular ve kan hücresi üretiminde önem taşır.",
  CREATININE: "Kreatinin kas metabolizması sırasında oluşan atık üründür ve büyük ölçüde böbrekler yoluyla süzülerek atılır.",
  EGFR: "eGFR'nin kendisi bir madde değildir; böbreklerin kanı süzme hızını tahmin eden hesaplanmış göstergedir.",
  BUN: "Üre azotu proteinlerin parçalanması sonucu oluşan atıkların dolaşımdaki bir göstergesidir ve böbrekler yoluyla uzaklaştırılır.",
  TSH: "TSH hipofiz bezinden salgılanır ve tiroid bezini T4/T3 hormonlarını üretmesi için uyarır.",
  FT3: "T3 tiroid hormonlarından biridir; enerji kullanımı ve metabolik hız dahil birçok hücresel sürecin düzenlenmesine katkı sağlar.",
  FT4: "T4 tiroid bezinin ürettiği başlıca hormonlardan biridir ve dokularda T3'e dönüşerek metabolik süreçlerin düzenlenmesine katkı sağlar.",
  TOTAL_CHOLESTEROL: "Kolesterol hücre zarlarının, safra asitlerinin ve bazı hormonların yapımında kullanılan bir lipittir; total kolesterol farklı taşıyıcı parçacıklardaki kolesterolün toplamını yansıtır.",
  LDL: "LDL parçacıkları kolesterolü karaciğerden ve dolaşımdan çeşitli dokulara taşır.",
  HDL: "HDL parçacıkları kolesterolün dokulardan karaciğere geri taşınmasına katkı sağlar.",
  TRIGLYCERIDES: "Trigliseridler vücudun başlıca enerji depolama biçimlerinden biridir; gerektiğinde yağ dokusundan enerji için kullanılabilir.",
  ALT: "ALT hücrelerde aminoasit metabolizmasına katılan bir enzimdir ve özellikle karaciğer hücrelerinde yoğun bulunur.",
  AST: "AST aminoasit metabolizmasına katılan bir enzimdir; karaciğerin yanı sıra kas ve başka dokularda da bulunur.",
  ALP: "ALP fosfat gruplarının işlenmesine katılan enzim grubudur; safra yolları ve kemik dokusu önemli kaynaklarındandır.",
  ALBUMIN: "Albümin kanda sıvı dengesinin korunmasına ve hormon, yağ asidi, ilaç gibi birçok maddenin taşınmasına katkı sağlayan başlıca plazma proteinidir.",
};

function withBodyRole(code: string): BiomarkerEducation | null {
  const education = EDUCATION[code];
  if (!education) return null;
  const role = BODY_ROLE[code];
  return role
    ? { ...education, whyItMatters: `${role} ${education.whyItMatters}` }
    : education;
}

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
  if (code && EDUCATION[code]) return withBodyRole(code);

  const rawName = normalizeName(value.biomarkerName || value.biomarkerCode || "");
  if (rawName === "pct" && value.unit.trim() === "%") {
    return {
      title: "Plateletkrit (PCT)",
      category: "Hemogram • Trombosit indeksleri",
      whatItMeasures: "Trombositlerin toplam kan hacmi içinde kapladığı yaklaşık hacim oranını gösterir.",
      whyItMatters: "PCT'nin kendisi bir hücre değildir; trombositlerin toplam kan hacmi içindeki payını gösteren türetilmiş bir indekstir. Trombositler kanamanın durdurulması ve pıhtı oluşumunda görev alır. PCT; PLT ve MPV ile birlikte değerlendirilir ve tek başına tanısal değildir.",
    };
  }

  const aliasCode = RAW_NAME_ALIASES[rawName];
  return aliasCode ? withBodyRole(aliasCode) : null;
}
