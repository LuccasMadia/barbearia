import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { ScissorsMark } from "./ScissorsMark";

export function Header({ siteConfig }: { siteConfig: Tables<"site_config"> }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-paper"
        >
          <ScissorsMark className="h-6 w-6 text-gold" />
          <span className="font-display text-lg tracking-tight">
            {siteConfig.name}
          </span>
        </Link>
      </div>
    </header>
  );
}
