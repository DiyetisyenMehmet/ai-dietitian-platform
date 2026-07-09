# PROJECT_MEMORY

## Çalışma Kuralları
- İletişim dili Türkçe; teknik isimler İngilizce.
- Üretim kalitesi, doğruluk, güvenlik ve sürdürülebilirlik önceliklidir.
- Doküman birincil doğruluk kaynağıdır.
- Varsayım yapılmayacak; belirsizlik varsa kullanıcıya sorulacak.
- Her faz sonunda onay alınacak.
- Kredi verimliliği gözetilecek.

## Faz 1 Özeti
- Dokümanda regülasyon, AI güvenliği, performans hedefleri ve bazı sınırlar netleştirilmeli.

## Faz 2 Güncel Kararları
- Başlangıç mimarisi: Modular Monolith.
- Domain sınırları mikroservise evrilebilecek şekilde tasarlanacak.
- Business domain modüllerine ek olarak production-grade platform modülleri açıkça tanımlanacak.
- AI kullanıcı deneyimi ile AI yürütme/orchestration katmanı ayrı tasarlanacak.
- Aşağıdaki teknik modüller Faz 2 kapsamına dahil edildi:
  - AI Orchestrator
  - Workflow Engine
  - Background Jobs
  - Cache
  - Feature Flags & Runtime Configuration
  - Consent Management
  - Prompt Registry
- Search, top-level modül değil; ilgili domain'lerde capability olarak ele alınacak.
- API Gateway gerekli bir edge bileşeni olarak kabul edildi ancak Faz 2'de domain modülü olarak sınıflandırılmadı.
- Experiment Management v2+ yol haritasına alındı.

## Faz 2 Ek Bağımsız Mimari Değerlendirme Kararları
- Faz 2 mevcut haliyle tamamen yetersiz değil; küçük revizyonlarla güçlendirilmeli.
- Tenant & Organization Management mantıksal modülü eklendi.
  - MVP'de minimal tenant context desteklenecek.
  - Hibrit multi-tenant stratejisi tam kapsamlı olarak daha sonra açılacak.
- Policy Engine ayrı top-level modül olarak değil, platform capability / mimari karar olarak ele alınacak.
- Secrets Management ayrı domain modülü değildir; cloud/security platform bileşeni olarak zorunlu kabul edildi.
- Event Bus ayrı top-level modül olarak MVP'de zorunlu değil.
  - Ancak Domain Events yaklaşımı mimari karar olarak kabul edildi.
  - Başlangıç yaklaşımı: in-process domain events + outbox uyumlu tasarım.
- Scheduler, Background Jobs & Scheduler modülünün parçası olarak kabul edildi; ayrı top-level modül açılmadı.
- Rate Limiting, platform capability olarak zorunlu kabul edildi.
- API Versioning Strategy, Faz 2'de mimari karar olarak kaydedildi; detay tasarım Faz 8'de yapılacak.

## Faz 3 & 3.1 Özeti - Sistem Mimarisi
- Modular Monolith ve DDD tabanlı sistem tasarımı donduruldu.
- Production Baseline revizyonu (Faz 3.1) ile güvenlik, dayanıklılık (resilience) ve operasyonel standartlar eklendi.
- AI güvenliği için PHI Minimization zorunlu kılındı (AD-039).
- Modül sınırlarının teknik olarak korunması (Boundary Enforcement) kararlaştırıldı.
- Thin Slice Architecture prensibi ile MVP kapsamındaki over-engineering riski minimize edildi.
