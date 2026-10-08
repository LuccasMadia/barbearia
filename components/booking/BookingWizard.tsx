"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { getAvailableSlots, createAppointment, lookupClientByPhone } from "@/app/agendar/actions";
import { formatPriceBRL, formatDuration } from "@/lib/format";
import { MonthCalendar } from "./MonthCalendar";
import { ScissorsMark } from "@/components/site/ScissorsMark";

const STEPS = [
  { key: "service", label: "Serviço" },
  { key: "barber", label: "Barbeiro" },
  { key: "datetime", label: "Data e hora" },
  { key: "confirm", label: "Confirmar" },
] as const;

export function BookingWizard({
  services,
  barbers,
}: {
  services: Tables<"services">[];
  barbers: Tables<"barbers">[];
}) {
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const nameRef = useRef(name);
  nameRef.current = name;
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    serviceName: string;
    barberName: string;
    startsAt: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const latestSlotsRequestRef = useRef(0);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;
  const selectedBarber =
    barberId === "any"
      ? { name: "Qualquer disponível" }
      : (barbers.find((b) => b.id === barberId) ?? null);

  const activeStepIndex = !serviceId
    ? 0
    : !barberId
      ? 1
      : !selectedSlot
        ? 2
        : 3;

  async function fetchSlots(forServiceId: string, forBarberId: string, forDate: string) {
    setSelectedSlot(null);
    setSlots([]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(forDate)) return;

    const requestId = ++latestSlotsRequestRef.current;
    const result = await getAvailableSlots({
      serviceId: forServiceId,
      barberId: forBarberId,
      date: forDate,
    });
    if (requestId !== latestSlotsRequestRef.current) return;
    setSlots(result.map((s) => s.time));
  }

  function handleSelectService(id: string) {
    setServiceId(id);
    setBarberId(null);
    setDate("");
    setSlots([]);
    setSelectedSlot(null);
  }

  function handleSelectBarber(id: string) {
    setBarberId(id);
    if (serviceId && date) {
      void fetchSlots(serviceId, id, date);
    }
  }

  function handleDateChange(nextDate: string) {
    setDate(nextDate);
    if (serviceId && barberId) {
      void fetchSlots(serviceId, barberId, nextDate);
    }
  }

  function handlePhoneBlur() {
    if (phone.replace(/\D/g, "").length < 8) return;
    startTransition(async () => {
      const found = await lookupClientByPhone(phone);
      if (found && !nameRef.current) setName(found.name);
    });
  }

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!serviceId || !barberId || !selectedSlot) return;

    setError(null);
    startTransition(async () => {
      const result = await createAppointment({
        serviceId,
        barberId,
        startsAtIso: selectedSlot,
        name,
        phone,
      });

      if (result.success) {
        setSummary(result.summary);
      } else {
        setError(result.error);
      }
    });
  }

  if (summary) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-24 text-center">
        <ScissorsMark className="h-8 w-8 text-gold" />
        <h1 className="mt-6 font-display text-3xl text-paper">
          Agendamento confirmado
        </h1>
        <div className="mt-6 space-y-1 text-paper-dim">
          <p className="text-paper">{summary.serviceName}</p>
          <p>Com {summary.barberName}</p>
          <p>
            {new Date(summary.startsAt).toLocaleString("pt-BR", {
              dateStyle: "long",
              timeStyle: "short",
            })}
          </p>
        </div>
        <Link
          href="/"
          className="mt-10 text-sm text-gold transition-colors hover:text-gold-bright"
        >
          Voltar para o início
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="font-display text-3xl text-paper sm:text-4xl">
        Agende seu horário
      </h1>

      <ol className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {STEPS.map((step, index) => (
          <li key={step.key} className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  index <= activeStepIndex
                    ? "bg-gold text-gold-ink"
                    : "border border-ink-line-strong text-paper-dim"
                }`}
              >
                {index + 1}
              </span>
              <span
                className={
                  index <= activeStepIndex ? "text-paper" : "text-paper-dim"
                }
              >
                {step.label}
              </span>
            </span>
            {index < STEPS.length - 1 && (
              <span className="h-px w-8 bg-ink-line-strong sm:w-12" />
            )}
          </li>
        ))}
      </ol>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1fr_1.2fr_1fr]">
        {/* Serviço */}
        <section>
          <h2 className="text-sm uppercase tracking-[0.2em] text-paper-dim">
            Serviço
          </h2>
          <ul className="mt-5 space-y-2">
            {services.map((service) => (
              <li key={service.id}>
                <button
                  type="button"
                  onClick={() => handleSelectService(service.id)}
                  className={`block w-full rounded-sm border px-4 py-3 text-left transition-colors ${
                    serviceId === service.id
                      ? "border-gold bg-ink-raised"
                      : "border-ink-line hover:border-ink-line-strong"
                  }`}
                >
                  <span className="block text-paper">{service.name}</span>
                  <span className="mt-0.5 block text-xs text-paper-dim">
                    {formatDuration(service.duration_minutes)} ·{" "}
                    {formatPriceBRL(service.price_cents)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Barbeiro */}
        <section
          className={!serviceId ? "pointer-events-none opacity-40" : undefined}
        >
          <h2 className="text-sm uppercase tracking-[0.2em] text-paper-dim">
            Barbeiro
          </h2>
          <ul className="mt-5 space-y-2">
            <li>
              <button
                type="button"
                onClick={() => handleSelectBarber("any")}
                className={`block w-full rounded-sm border px-4 py-3 text-left transition-colors ${
                  barberId === "any"
                    ? "border-gold bg-ink-raised"
                    : "border-ink-line hover:border-ink-line-strong"
                }`}
              >
                Qualquer disponível
              </button>
            </li>
            {barbers.map((barber) => (
              <li key={barber.id}>
                <button
                  type="button"
                  onClick={() => handleSelectBarber(barber.id)}
                  className={`block w-full rounded-sm border px-4 py-3 text-left transition-colors ${
                    barberId === barber.id
                      ? "border-gold bg-ink-raised"
                      : "border-ink-line hover:border-ink-line-strong"
                  }`}
                >
                  {barber.name}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Data e hora */}
        <section
          className={!barberId ? "pointer-events-none opacity-40" : undefined}
        >
          <h2 className="text-sm uppercase tracking-[0.2em] text-paper-dim">
            Data e horário
          </h2>
          <div className="mt-5">
            <MonthCalendar value={date} onChange={handleDateChange} />
          </div>

          {slots.length > 0 && (
            <div className="mt-6 grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-sm border px-2 py-2 text-sm transition-colors ${
                    selectedSlot === slot
                      ? "border-gold bg-gold text-gold-ink"
                      : "border-ink-line text-paper hover:border-ink-line-strong"
                  }`}
                >
                  {new Date(slot).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </button>
              ))}
            </div>
          )}
          {date && slots.length === 0 && (
            <p className="mt-6 text-sm text-paper-dim">
              Nenhum horário disponível nesse dia.
            </p>
          )}
        </section>

        {/* Resumo */}
        <section className="lg:border-l lg:border-ink-line lg:pl-10">
          <h2 className="text-sm uppercase tracking-[0.2em] text-paper-dim">
            Resumo
          </h2>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between border-b border-ink-line pb-3">
              <dt className="text-paper-dim">Serviço</dt>
              <dd className="text-paper">
                {selectedService?.name ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between border-b border-ink-line pb-3">
              <dt className="text-paper-dim">Barbeiro</dt>
              <dd className="text-paper">{selectedBarber?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b border-ink-line pb-3">
              <dt className="text-paper-dim">Data</dt>
              <dd className="text-paper">
                {selectedSlot
                  ? new Date(selectedSlot).toLocaleDateString("pt-BR", {
                      dateStyle: "long",
                    })
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between border-b border-ink-line pb-3">
              <dt className="text-paper-dim">Horário</dt>
              <dd className="text-paper">
                {selectedSlot
                  ? new Date(selectedSlot).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-paper-dim">Total</span>
            <span className="font-display text-xl text-gold">
              {selectedService
                ? formatPriceBRL(selectedService.price_cents)
                : "—"}
            </span>
          </div>

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
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={!selectedSlot || isPending}
              className="w-full rounded-sm bg-gold py-3 text-sm font-semibold text-gold-ink transition-colors hover:bg-gold-bright disabled:opacity-40"
            >
              {isPending ? "Confirmando..." : "Confirmar agendamento"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
