import Link from "next/link";
import type { Tables } from "@/lib/database.types";

export function Hero({ siteConfig }: { siteConfig: Tables<"site_config"> }) {
  return (
    <section
      className="flex flex-col items-center gap-6 px-6 py-24 text-center text-white"
      style={{ backgroundColor: siteConfig.primary_color }}
    >
      <h1 className="text-3xl font-bold sm:text-5xl">{siteConfig.name}</h1>
      {siteConfig.about && (
        <p className="max-w-xl text-white/80">{siteConfig.about}</p>
      )}
      <Link
        href="/agendar"
        className="rounded bg-white px-6 py-3 font-semibold text-neutral-900 hover:bg-white/90"
      >
        Agendar horário
      </Link>
    </section>
  );
}
