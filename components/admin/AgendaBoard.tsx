"use client";

import { useState } from "react";
import type { Tables } from "@/lib/database.types";
import type { BarberDayColumn } from "@/lib/admin-data";
import { AppointmentCard } from "./AppointmentCard";
import { WalkInForm } from "./WalkInForm";

type OpenSlot = { barberId: string; barberName: string; time: Date };

export function AgendaBoard({
  barbers,
  services,
}: {
  barbers: BarberDayColumn[];
  services: Tables<"services">[];
}) {
  const [openSlot, setOpenSlot] = useState<OpenSlot | null>(null);

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {barbers.map((barber) => (
        <section key={barber.barberId}>
          <h2 className="text-xs uppercase tracking-[0.2em] text-paper-dim">
            {barber.barberName}
          </h2>

          {!barber.hasScheduleToday ? (
            <p className="mt-4 text-sm text-paper-dim">Fechado hoje.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {barber.slots.map((slot) =>
                slot.type === "appointment" ? (
                  <AppointmentCard key={slot.appointment.id} appointment={slot.appointment} />
                ) : (
                  <button
                    key={slot.time.toISOString()}
                    type="button"
                    onClick={() =>
                      setOpenSlot({
                        barberId: barber.barberId,
                        barberName: barber.barberName,
                        time: slot.time,
                      })
                    }
                    className="block w-full rounded-sm border border-dashed border-ink-line px-3 py-2 text-left text-sm text-paper-dim transition-colors hover:border-gold hover:text-gold"
                  >
                    {slot.time.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · livre
                  </button>
                )
              )}
            </div>
          )}
        </section>
      ))}

      {openSlot && (
        <WalkInForm
          barberId={openSlot.barberId}
          barberName={openSlot.barberName}
          time={openSlot.time}
          services={services}
          onClose={() => setOpenSlot(null)}
        />
      )}
    </div>
  );
}
