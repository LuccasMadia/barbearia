import type { Tables } from "@/lib/database.types";
import { formatPriceBRL, formatDuration } from "@/lib/format";

export function ServicesSection({
  services,
}: {
  services: Tables<"services">[];
}) {
  if (services.length === 0) return null;

  return (
    <section className="px-6 py-16">
      <h2 className="mb-8 text-center text-2xl font-semibold">Serviços</h2>
      <ul className="mx-auto grid max-w-2xl gap-4">
        {services.map((service) => (
          <li
            key={service.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 px-5 py-4"
          >
            <div>
              <p className="font-medium">{service.name}</p>
              <p className="text-sm text-neutral-500">
                {formatDuration(service.duration_minutes)}
              </p>
            </div>
            <p className="font-semibold">
              {formatPriceBRL(service.price_cents)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
