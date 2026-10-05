"use client";

import { useRef, useState, useTransition } from "react";
import type { Tables } from "@/lib/database.types";
import { getAvailableSlots, createAppointment } from "@/app/agendar/actions";

type Step = "service" | "barber" | "datetime" | "contact";
const STEP_ORDER: Step[] = ["service", "barber", "datetime", "contact"];

export function BookingWizard({
  services,
  barbers,
}: {
  services: Tables<"services">[];
  barbers: Tables<"barbers">[];
}) {
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    serviceName: string;
    barberName: string;
    startsAt: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const latestSlotsRequestRef = useRef(0);

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  }

  async function handleDateChange(nextDate: string) {
    setDate(nextDate);
    setSelectedSlot(null);
    setSlots([]);
    if (!serviceId || !barberId || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;

    const requestId = ++latestSlotsRequestRef.current;
    const result = await getAvailableSlots({ serviceId, barberId, date: nextDate });
    if (requestId !== latestSlotsRequestRef.current) return;
    setSlots(result.map((s) => s.time));
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
      <div className="mx-auto max-w-md space-y-2 px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Agendamento confirmado!</h1>
        <p>{summary.serviceName}</p>
        <p>Com {summary.barberName}</p>
        <p>
          {new Date(summary.startsAt).toLocaleString("pt-BR", {
            dateStyle: "long",
            timeStyle: "short",
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-6 py-16">
      {step !== "service" && (
        <button
          type="button"
          onClick={goBack}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← Voltar
        </button>
      )}

      {step === "service" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Escolha o serviço</h2>
          {services.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => {
                setServiceId(service.id);
                setStep("barber");
              }}
              className="block w-full rounded border border-neutral-300 px-4 py-3 text-left hover:border-neutral-900"
            >
              {service.name}
            </button>
          ))}
        </div>
      )}

      {step === "barber" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Escolha o profissional</h2>
          <button
            type="button"
            onClick={() => {
              setBarberId("any");
              setStep("datetime");
            }}
            className="block w-full rounded border border-neutral-300 px-4 py-3 text-left hover:border-neutral-900"
          >
            Qualquer disponível
          </button>
          {barbers.map((barber) => (
            <button
              key={barber.id}
              type="button"
              onClick={() => {
                setBarberId(barber.id);
                setStep("datetime");
              }}
              className="block w-full rounded border border-neutral-300 px-4 py-3 text-left hover:border-neutral-900"
            >
              {barber.name}
            </button>
          ))}
        </div>
      )}

      {step === "datetime" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Escolha data e horário</h2>
          <input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          {slots.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded border px-2 py-2 text-sm ${
                    selectedSlot === slot
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300"
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
            <p className="text-sm text-neutral-500">
              Nenhum horário disponível nesse dia.
            </p>
          )}
          <button
            type="button"
            disabled={!selectedSlot}
            onClick={() => setStep("contact")}
            className="w-full rounded bg-neutral-900 py-2 text-white disabled:opacity-50"
          >
            Continuar
          </button>
        </div>
      )}

      {step === "contact" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-lg font-semibold">Seus dados</h2>
          <input
            type="text"
            placeholder="Nome"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          <input
            type="tel"
            placeholder="Telefone"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded bg-neutral-900 py-2 text-white disabled:opacity-50"
          >
            {isPending ? "Confirmando..." : "Confirmar agendamento"}
          </button>
        </form>
      )}
    </div>
  );
}
