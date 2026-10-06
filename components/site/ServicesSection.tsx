import type { Tables } from "@/lib/database.types";
import { formatPriceBRL, formatDuration } from "@/lib/format";

export function ServicesSection({
  services,
}: {
  services: Tables<"services">[];
}) {
  if (services.length === 0) return null;

  return (
    <section id="servicos" className="border-b border-ink-line">
      <div className="mx-auto max-w-4xl px-6 py-24">
        <h2 className="font-display text-3xl text-paper sm:text-4xl">
          Serviços
        </h2>
        <p className="mt-3 max-w-md text-sm text-paper-dim">
          Cada atendimento inclui toalha quente e acabamento com produtos
          selecionados.
        </p>

        <ul className="mt-12 divide-y divide-ink-line">
          {services.map((service) => (
            <li
              key={service.id}
              className="group flex items-baseline gap-4 py-5"
            >
              <span className="font-display text-lg text-paper transition-colors group-hover:text-gold-bright">
                {service.name}
              </span>
              <span
                aria-hidden="true"
                className="h-px flex-1 translate-y-[-0.3em] border-b border-dotted border-ink-line-strong"
              />
              <span className="shrink-0 text-sm text-paper-dim">
                {formatDuration(service.duration_minutes)}
              </span>
              <span className="shrink-0 font-display text-lg text-gold">
                {formatPriceBRL(service.price_cents)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
