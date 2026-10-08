"use client";

import { useState, useTransition } from "react";
import type { Tables } from "@/lib/database.types";
import { formatDuration, formatPriceBRL } from "@/lib/format";
import { createService, updateService, setServiceActive } from "@/app/admin/configuracoes/actions";

export function ServicesPanel({ services }: { services: Tables<"services">[] }) {
  const [editingService, setEditingService] = useState<Tables<"services"> | "new" | null>(null);

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => setEditingService("new")}
        className="rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright"
      >
        Novo serviço
      </button>

      <ul className="divide-y divide-ink-line border-t border-ink-line">
        {services.map((service) => (
          <ServiceRow key={service.id} service={service} onEdit={() => setEditingService(service)} />
        ))}
      </ul>

      {editingService && (
        <ServiceForm
          service={editingService === "new" ? null : editingService}
          onClose={() => setEditingService(null)}
        />
      )}
    </div>
  );
}

function ServiceRow({
  service,
  onEdit,
}: {
  service: Tables<"services">;
  onEdit: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className={`flex-1 text-sm ${service.active ? "text-paper" : "text-paper-dim line-through"}`}>
        {service.name}
      </span>
      <span className="text-xs text-paper-dim">{formatDuration(service.duration_minutes)}</span>
      <span className="text-xs text-paper-dim">{formatPriceBRL(service.price_cents)}</span>
      <button type="button" onClick={onEdit} className="text-xs text-paper-dim transition-colors hover:text-gold">
        editar
      </button>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await setServiceActive(service.id, !service.active);
          })
        }
        disabled={isPending}
        className="text-xs text-paper-dim transition-colors hover:text-gold"
      >
        {service.active ? "desativar" : "reativar"}
      </button>
    </li>
  );
}

function ServiceForm({
  service,
  onClose,
}: {
  service: Tables<"services"> | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(service?.name ?? "");
  const [duration, setDuration] = useState(String(service?.duration_minutes ?? 30));
  const [price, setPrice] = useState(service ? (service.price_cents / 100).toFixed(2) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const durationMinutes = parseInt(duration, 10);
    const priceCents = Math.round(parseFloat(price.replace(",", ".")) * 100);
    if (!name.trim() || !durationMinutes || Number.isNaN(priceCents)) return;

    setError(null);
    startTransition(async () => {
      const result = service
        ? await updateService(service.id, { name: name.trim(), durationMinutes, priceCents })
        : await createService({ name: name.trim(), durationMinutes, priceCents });

      if (result.success) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 px-4">
      <div className="w-full max-w-sm rounded-sm border border-ink-line bg-ink p-6">
        <h2 className="font-display text-lg text-paper">
          {service ? "Editar serviço" : "Novo serviço"}
        </h2>
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="text"
            placeholder="Nome"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
          />
          <input
            type="number"
            min={5}
            step={5}
            placeholder="Duração (minutos)"
            required
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder="Preço (R$)"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-sm border border-ink-line py-2.5 text-sm text-paper-dim transition-colors hover:text-paper"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-sm bg-gold py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
            >
              {isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
