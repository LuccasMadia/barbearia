export type QueueBarberState = {
  barberId: string;
  freeAt: Date;
};

export type QueueWaitEntry = {
  entryId: string;
  barberId: string | null;
  durationMinutes: number;
};

export function estimateWaitMinutes(params: {
  now: Date;
  barbers: QueueBarberState[];
  waitingAhead: QueueWaitEntry[];
  target: QueueWaitEntry;
}): number | null {
  const { now, barbers, waitingAhead, target } = params;
  if (barbers.length === 0) return null;

  const freeAtByBarber = new Map(barbers.map((b) => [b.barberId, b.freeAt]));

  function earliestCompatible(preference: string | null): string | null {
    const candidateIds = preference ? [preference] : [...freeAtByBarber.keys()];
    const candidates = candidateIds.filter((id) => freeAtByBarber.has(id));
    if (candidates.length === 0) return null;

    return candidates.reduce((best, id) =>
      freeAtByBarber.get(id)!.getTime() < freeAtByBarber.get(best)!.getTime() ? id : best
    );
  }

  for (const entry of waitingAhead) {
    const barberId = earliestCompatible(entry.barberId);
    if (!barberId) continue;

    const startAt = freeAtByBarber.get(barberId)!;
    const endAt = new Date(
      Math.max(startAt.getTime(), now.getTime()) + entry.durationMinutes * 60_000
    );
    freeAtByBarber.set(barberId, endAt);
  }

  const targetBarberId = earliestCompatible(target.barberId);
  if (!targetBarberId) return null;

  const availableAt = freeAtByBarber.get(targetBarberId)!;
  const waitMs = Math.max(0, availableAt.getTime() - now.getTime());
  return Math.round(waitMs / 60_000);
}
