"use client";

import { useState, useTransition } from "react";
import type { Tables } from "@/lib/database.types";
import { updateSiteIdentity } from "@/app/admin/configuracoes/actions";

export function IdentityPanel({ siteConfig }: { siteConfig: Tables<"site_config"> }) {
  const [name, setName] = useState(siteConfig.name);
  const [about, setAbout] = useState(siteConfig.about ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSiteIdentity({ name, about });
      if (result.success) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="text-xs uppercase tracking-[0.2em] text-paper-dim">
          Nome da barbearia
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper focus:border-gold"
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-[0.2em] text-paper-dim">
          Texto da hero (abaixo do nome)
        </label>
        <textarea
          rows={3}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          className="mt-1.5 w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper focus:border-gold"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-gold">Salvo.</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
      >
        {isPending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
