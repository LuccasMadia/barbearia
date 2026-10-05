export interface ScheduleRule {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface TimeRange {
  startAt: Date;
  endAt: Date;
}

export function getAvailableSlots(params: {
  date: Date;
  serviceDurationMinutes: number;
  scheduleRules: ScheduleRule[];
  timeOff: TimeRange[];
  bookedAppointments: TimeRange[];
  slotIntervalMinutes?: number;
  now?: Date;
}): Date[] {
  const {
    date,
    serviceDurationMinutes,
    scheduleRules,
    timeOff,
    bookedAppointments,
    slotIntervalMinutes = 15,
    now = new Date(),
  } = params;

  const weekday = date.getDay();
  const rulesForDay = scheduleRules.filter((rule) => rule.weekday === weekday);
  if (rulesForDay.length === 0) return [];

  const durationMs = serviceDurationMinutes * 60_000;
  const intervalMs = slotIntervalMinutes * 60_000;
  const slots: Date[] = [];

  for (const rule of rulesForDay) {
    const windowStart = timeStringToDate(date, rule.startTime);
    const windowEnd = timeStringToDate(date, rule.endTime);

    for (
      let candidate = new Date(windowStart);
      candidate.getTime() + durationMs <= windowEnd.getTime();
      candidate = new Date(candidate.getTime() + intervalMs)
    ) {
      if (candidate < now) continue;

      const candidateEnd = new Date(candidate.getTime() + durationMs);

      const blocked =
        timeOff.some((block) => overlaps(candidate, candidateEnd, block.startAt, block.endAt)) ||
        bookedAppointments.some((block) =>
          overlaps(candidate, candidateEnd, block.startAt, block.endAt)
        );

      if (!blocked) slots.push(candidate);
    }
  }

  return slots.sort((a, b) => a.getTime() - b.getTime());
}

function timeStringToDate(date: Date, time: string): Date {
  const [hours, minutes, seconds] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, seconds ?? 0, 0);
  return result;
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}
