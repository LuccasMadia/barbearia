import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { ScissorsMark } from "./ScissorsMark";

export function Footer({
  siteConfig,
  openingHoursSummary,
}: {
  siteConfig: Tables<"site_config">;
  openingHoursSummary: string | null;
}) {
  return (
    <footer className="border-t border-ink-line bg-ink">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2.5 text-paper">
            <ScissorsMark className="h-5 w-5 text-gold" />
            <span className="font-display text-base">{siteConfig.name}</span>
          </div>

          <div className="flex flex-col gap-1 text-sm text-paper-dim">
            {siteConfig.address && <span>{siteConfig.address}</span>}
            {siteConfig.phone && <span>{siteConfig.phone}</span>}
            {openingHoursSummary && <span>{openingHoursSummary}</span>}
          </div>

          <div className="flex gap-6 text-sm">
            <Link
              href="/agendar"
              className="text-gold transition-colors hover:text-gold-bright"
            >
              Agendar horário
            </Link>
            <Link
              href="/cancelar"
              className="text-paper-dim transition-colors hover:text-paper"
            >
              Cancelar agendamento
            </Link>
          </div>
        </div>

        <p className="mt-10 border-t border-ink-line pt-6 text-xs text-paper-dim">
          © {new Date().getFullYear()} {siteConfig.name}. Todos os direitos
          reservados.
        </p>
      </div>
    </footer>
  );
}
