# AI Dietitian Platform

Kurumsal AI Diyetisyen Platformu.

## Durum (Mevcut İçerik)

Bu depo şu anda projenin **mimari ve planlama dokümantasyonunu** içermektedir.
Uygulama kaynak kodu (frontend/backend) henüz bu çalışma alanında üretilmemiştir;
dolayısıyla depoya import edilecek frontend/backend kaynak dosyası bulunmamaktadır.

### İçerik

- `PROJECT_MEMORY.md` — Proje hafızası, faz özetleri ve çalışma kuralları.
- `ARCHITECTURE_DECISIONS.md` — Mimari kararlar kaydı (AD-001 … AD-045).
- `TODO_MASTER.md` — Faz bazlı ana görev listesi ve ilerleme durumu.
- `docs/Uygulama Projesi.pdf` — Uygulama proje spesifikasyonu.

## Mimari Özet

- Modular Monolith (ileride seçici mikroservisleşme) — AD-002.
- Domain-Driven Design; her modül Application / Domain / Infrastructure katmanlarına sahip.
- AI Application (kullanıcıya dönük) ile AI Orchestrator (yürütme/routing/policy) ayrı.
- Production-grade platform modülleri: Background Jobs, Cache, Feature Flags,
  Consent Management, Prompt Registry, Rate Limiting vb.
- Sağlık verisi için PHI minimization zorunlu (AD-039).

Ayrıntılar için `ARCHITECTURE_DECISIONS.md` ve `PROJECT_MEMORY.md` dosyalarına bakınız.
