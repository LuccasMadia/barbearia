import Link from "next/link";
import type { Tables } from "@/lib/database.types";

export function Header({ siteConfig }: { siteConfig: Tables<"site_config"> }) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
      <span className="text-lg font-semibold">{siteConfig.name}</span>
      <nav className="flex gap-6 text-sm text-neutral-600">
        <Link href="/agendar" className="hover:text-neutral-900">
          Agendar
        </Link>
        <Link href="/cancelar" className="hover:text-neutral-900">
          Cancelar agendamento
        </Link>
      </nav>
    </header>
  );
}
