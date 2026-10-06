import Image from "next/image";
import type { Tables } from "@/lib/database.types";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function BarbersSection({
  barbers,
}: {
  barbers: Tables<"barbers">[];
}) {
  if (barbers.length === 0) return null;

  return (
    <section id="barbeiros" className="border-b border-ink-line bg-ink-raised">
      <div className="mx-auto max-w-4xl px-6 py-24">
        <h2 className="font-display text-3xl text-paper sm:text-4xl">
          Barbeiros
        </h2>
        <p className="mt-3 max-w-md text-sm text-paper-dim">
          Profissionais experientes, prontos para cuidar do seu estilo.
        </p>

        <ul className="mt-12 grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
          {barbers.map((barber) => (
            <li
              key={barber.id}
              className="group flex flex-col items-center text-center"
            >
              {barber.photo_url ? (
                <Image
                  src={barber.photo_url}
                  alt={barber.name}
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-full border border-ink-line-strong object-cover transition-transform duration-300 group-hover:scale-105 group-hover:border-gold"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-ink-line-strong bg-ink font-display text-xl text-gold transition-transform duration-300 group-hover:scale-105 group-hover:border-gold">
                  {initials(barber.name)}
                </div>
              )}
              <span className="mt-4 font-display text-base text-paper transition-colors group-hover:text-gold-bright">
                {barber.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
