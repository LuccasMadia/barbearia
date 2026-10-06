"use client";

import { useState, useTransition } from "react";
import type { Tables } from "@/lib/database.types";
import { createWalkInAppointment } from "@/app/admin/agenda/actions";
import { formatDuration, formatPriceBRL } from "@/lib/format";

export function WalkInForm({
  barberId,
  barberName,
  time,
  services,
  onClose,
}: {
  barberId: string;
  barberName: string;
  time: Date;
  services: Tables<"services">[];
  onClose: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!serviceId) return;

    setError(null);
    startTransition(async () => {
      const result = await createWalkInAppointment({
        serviceId,
        barberId,
        startsAtIso: time.toISOString(),
        name,
        phone,
      });

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
        <h2 className="font-display text-lg text-paper">Agendamento avulso</h2>
        <p className="mt-1 text-sm text-paper-dim">
          {barberName} ·{" "}
          {time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            required
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper focus:border-gold"
          >
            {services.map((service) => (
              <option key={service.id} value={service.id} className="bg-ink">
                {service.name} · {formatDuration(service.duration_minutes)} ·{" "}
                {formatPriceBRL(service.price_cents)}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Nome"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
          />
          <input
            type="tel"
            placeholder="Telefone"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
              disabled={isPending || !serviceId}
              className="flex-1 rounded-sm bg-gold py-2.5 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
            >
              {isPending ? "Criando..." : "Criar agendamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
