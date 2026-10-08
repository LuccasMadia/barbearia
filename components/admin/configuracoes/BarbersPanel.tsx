"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { createBarber, updateBarberName, setBarberActive } from "@/app/admin/configuracoes/actions";

export function BarbersPanel({ barbers }: { barbers: Tables<"barbers">[] }) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createBarber(newName.trim());
      if (result.success) {
        setNewName("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          placeholder="Nome do novo barbeiro"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
        />
        <button
          type="submit"
          disabled={isPending || !newName.trim()}
          className="rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
        >
          Adicionar
        </button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="divide-y divide-ink-line border-t border-ink-line">
        {barbers.map((barber) => (
          <BarberRow key={barber.id} barber={barber} />
        ))}
      </ul>
    </div>
  );
}

function BarberRow({ barber }: { barber: Tables<"barbers"> }) {
  const [name, setName] = useState(barber.name);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRename(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await updateBarberName(barber.id, name.trim());
      setEditing(false);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      {editing ? (
        <form onSubmit={handleRename} className="flex flex-1 gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="flex-1 rounded-sm border border-ink-line bg-transparent px-3 py-1.5 text-sm text-paper focus:border-gold"
          />
          <button type="submit" disabled={isPending} className="text-sm text-gold">
            Salvar
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-paper-dim">
            Cancelar
          </button>
        </form>
      ) : (
        <>
          <span className={`flex-1 text-sm ${barber.active ? "text-paper" : "text-paper-dim line-through"}`}>
            {barber.name}
          </span>
          <Link
            href={`/admin/configuracoes?tab=horarios&barberId=${barber.id}`}
            className="text-xs text-paper-dim transition-colors hover:text-gold"
          >
            editar horário
          </Link>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-paper-dim transition-colors hover:text-gold"
          >
            renomear
          </button>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await setBarberActive(barber.id, !barber.active);
              })
            }
            disabled={isPending}
            className="text-xs text-paper-dim transition-colors hover:text-gold"
          >
            {barber.active ? "desativar" : "reativar"}
          </button>
        </>
      )}
    </li>
  );
}
