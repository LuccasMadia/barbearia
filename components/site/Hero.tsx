import Image from "next/image";
import Link from "next/link";
import type { Tables } from "@/lib/database.types";

export function Hero({
  siteConfig,
  openingHoursSummary,
}: {
  siteConfig: Tables<"site_config">;
  openingHoursSummary: string | null;
}) {
  return (
    <section className="group relative isolate overflow-hidden border-b border-ink-line">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/hero-barber.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[38%_32%] grayscale-[0.1] brightness-[1.05] saturate-[1.05] transition-transform duration-700 ease-out group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-ink via-ink/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-ink/10" />
      </div>

      <div className="relative mx-auto flex min-h-[640px] max-w-6xl flex-col justify-center px-6 py-28">
        <div className="ml-auto max-w-xl animate-rise-in text-right">
          <h1 className="font-display text-5xl leading-[1.05] text-paper sm:text-6xl">
            {siteConfig.name}
          </h1>
          {siteConfig.about && (
            <p className="mt-6 ml-auto max-w-md text-balance text-base leading-relaxed text-paper-dim">
              {siteConfig.about}
            </p>
          )}
          <div className="mt-10 flex flex-wrap items-center justify-end gap-4">
            <Link
              href="/agendar"
              className="rounded-sm bg-gold px-7 py-3.5 text-sm font-semibold tracking-wide text-gold-ink transition-colors hover:bg-gold-bright"
            >
              Agendar horário
            </Link>
            <Link
              href="/fila"
              className="rounded-sm border border-gold px-7 py-3.5 text-sm font-semibold tracking-wide text-gold transition-colors hover:bg-gold hover:text-gold-ink"
            >
              Fila de atendimento
            </Link>
          </div>
          {openingHoursSummary && (
            <p className="mt-4 text-sm text-paper-dim">{openingHoursSummary}</p>
          )}
        </div>
      </div>
    </section>
  );
}
