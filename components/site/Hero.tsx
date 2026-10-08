import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function HeroCta({
  href,
  label,
  variant,
}: {
  href: string;
  label: string;
  variant: "solid" | "outline";
}) {
  return (
    <Button
      asChild
      className={cn(
        "group/cta relative h-12 w-fit overflow-hidden rounded-sm ps-7 pe-14 text-sm font-semibold tracking-wide transition-all duration-500 hover:ps-14 hover:pe-7",
        variant === "solid"
          ? "bg-gold text-gold-ink hover:bg-gold-bright"
          : "border border-gold bg-transparent text-gold hover:bg-gold hover:text-gold-ink"
      )}
    >
      <Link href={href}>
        <span className="relative z-10">{label}</span>
        <span
          className={cn(
            "absolute right-1 flex h-10 w-10 items-center justify-center rounded-sm transition-all duration-500 group-hover/cta:right-[calc(100%-44px)] group-hover/cta:rotate-45",
            variant === "solid" ? "bg-gold-ink text-gold" : "bg-gold text-gold-ink"
          )}
        >
          <ArrowUpRight size={16} />
        </span>
      </Link>
    </Button>
  );
}

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
            <HeroCta href="/agendar" label="Agendar horário" variant="solid" />
            <HeroCta href="/fila" label="Fila de atendimento" variant="outline" />
          </div>
          {openingHoursSummary && (
            <p className="mt-4 text-sm text-paper-dim">{openingHoursSummary}</p>
          )}
        </div>
      </div>
    </section>
  );
}
