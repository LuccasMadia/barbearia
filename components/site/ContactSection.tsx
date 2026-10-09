import type { Tables } from "@/lib/database.types";

export function ContactSection({
  siteConfig,
  openingHoursSummary,
}: {
  siteConfig: Tables<"site_config">;
  openingHoursSummary: string | null;
}) {
  const hasContact =
    siteConfig.address ||
    siteConfig.phone ||
    siteConfig.whatsapp ||
    siteConfig.instagram ||
    openingHoursSummary;

  if (!hasContact) return null;

  return (
    <section
      id="contato"
      className="flex min-h-screen items-center border-b border-ink-line"
    >
      <div className="mx-auto grid w-full max-w-4xl gap-12 px-6 py-24 sm:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl text-paper sm:text-4xl">
            Contato
          </h2>
          <dl className="mt-10 space-y-5 text-sm">
            {openingHoursSummary && (
              <div className="border-t border-ink-line pt-5">
                <dt className="text-xs uppercase tracking-[0.2em] text-paper-dim">
                  Horário
                </dt>
                <dd className="mt-1.5 text-paper">{openingHoursSummary}</dd>
              </div>
            )}
            {siteConfig.address && (
              <div className="border-t border-ink-line pt-5">
                <dt className="text-xs uppercase tracking-[0.2em] text-paper-dim">
                  Endereço
                </dt>
                <dd className="mt-1.5 text-paper">{siteConfig.address}</dd>
              </div>
            )}
            {siteConfig.phone && (
              <div className="border-t border-ink-line pt-5">
                <dt className="text-xs uppercase tracking-[0.2em] text-paper-dim">
                  Telefone
                </dt>
                <dd className="mt-1.5 text-paper">{siteConfig.phone}</dd>
              </div>
            )}
            {siteConfig.whatsapp && (
              <div className="border-t border-ink-line pt-5">
                <dt className="text-xs uppercase tracking-[0.2em] text-paper-dim">
                  WhatsApp
                </dt>
                <dd className="mt-1.5 text-paper">{siteConfig.whatsapp}</dd>
              </div>
            )}
            {siteConfig.instagram && (
              <div className="border-t border-ink-line pt-5">
                <dt className="text-xs uppercase tracking-[0.2em] text-paper-dim">
                  Instagram
                </dt>
                <dd className="mt-1.5 text-paper">{siteConfig.instagram}</dd>
              </div>
            )}
          </dl>
        </div>

        {siteConfig.address && (
          <iframe
            title="Localização"
            className="h-full min-h-[320px] w-full rounded-sm border border-ink-line grayscale invert-[0.92] contrast-[0.9]"
            loading="lazy"
            src={`https://www.google.com/maps?q=${encodeURIComponent(
              siteConfig.address
            )}&output=embed`}
          />
        )}
      </div>
    </section>
  );
}
