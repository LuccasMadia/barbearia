import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { ScissorsMark } from "./ScissorsMark";

const NAV_LINKS = [
  { href: "#servicos", label: "Serviços" },
  { href: "#barbeiros", label: "Barbeiros" },
  { href: "#contato", label: "Contato" },
];

export function Header({ siteConfig }: { siteConfig: Tables<"site_config"> }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-paper"
        >
          <ScissorsMark className="h-6 w-6 text-gold" />
          <span className="font-display text-lg tracking-tight">
            {siteConfig.name}
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-paper-dim md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-gold-bright"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Link
          href="/agendar"
          className="rounded-sm border border-gold px-4 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold hover:text-gold-ink"
        >
          Agendar
        </Link>
      </div>
    </header>
  );
}
