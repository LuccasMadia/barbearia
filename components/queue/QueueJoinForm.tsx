"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Tables } from "@/lib/database.types";
import { joinQueue, lookupClientByPhone } from "@/app/fila/actions";
import { formatDuration, formatPriceBRL } from "@/lib/format";

export function QueueJoinForm({
  services,
  barbers,
}: {
  services: Tables<"services">[];
  barbers: Tables<"barbers">[];
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [barberId, setBarberId] = useState("any");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePhoneBlur() {
    if (phone.replace(/\D/g, "").length < 8) return;
    startTransition(async () => {
      const found = await lookupClientByPhone(phone);
      if (found && !nameRef.current) setName(found.name);
    });
  }

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!serviceId) return;

    setError(null);
    startTransition(async () => {
      const result = await joinQueue({ serviceId, barberId, name, phone });
      if (result.success) {
        router.push(`/fila/status?phone=${encodeURIComponent(phone)}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-3xl text-paper">Entrar na fila</h1>
      <form onSubmit={handleSubmit} className="mt-8 space-y-3">
        <input
          type="tel"
          placeholder="Telefone"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={handlePhoneBlur}
          className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
        />
        <input
          type="text"
          placeholder="Nome"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper placeholder:text-paper-dim focus:border-gold"
        />
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
        <select
          value={barberId}
          onChange={(e) => setBarberId(e.target.value)}
          className="w-full rounded-sm border border-ink-line bg-transparent px-3 py-2.5 text-sm text-paper focus:border-gold"
        >
          <option value="any" className="bg-ink">
            Qualquer disponível
          </option>
          {barbers.map((barber) => (
            <option key={barber.id} value={barber.id} className="bg-ink">
              {barber.name}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={isPending || !serviceId}
          className="w-full rounded-sm bg-gold py-3 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
        >
          {isPending ? "Entrando..." : "Entrar na fila"}
        </button>
      </form>
    </div>
  );
}
