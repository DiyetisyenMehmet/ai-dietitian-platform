import type { LegalDoc } from "@/shared/constants/legal";

/**
 * Shared layout for rendering a structured {@link LegalDoc}. Produces a clean,
 * readable legal document (title, last-updated, intro, and sections) without
 * requiring a markdown/typography plugin.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <div className="container max-w-3xl py-14 sm:py-16">
      <article className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{doc.title}</h1>
          <p className="text-sm text-muted-foreground">Son güncelleme: {doc.updated}</p>
        </header>

        {doc.intro && <p className="text-base leading-relaxed text-muted-foreground">{doc.intro}</p>}

        <div className="space-y-8">
          {doc.sections.map((section, index) => (
            <section key={section.heading ?? index} className="space-y-3">
              {section.heading && (
                <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
              )}
              {section.paragraphs?.map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                  {section.bullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
