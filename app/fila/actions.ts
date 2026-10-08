"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getClientByPhone } from "@/lib/clients-server";
import {
  joinQueue as joinQueueServer,
  getQueueStatusByPhone as getQueueStatusByPhoneServer,
  leaveQueue as leaveQueueServer,
  type JoinQueueResult,
  type QueueStatus,
} from "@/lib/queue-server";

export async function lookupClientByPhone(phone: string): Promise<{ name: string } | null> {
  return getClientByPhone(createAdminClient(), phone);
}

export type { JoinQueueResult, QueueStatus };

export async function joinQueue(input: {
  serviceId: string;
  barberId: string;
  name: string;
  phone: string;
}): Promise<JoinQueueResult> {
  return joinQueueServer(createAdminClient(), input);
}

export async function getQueueStatusByPhone(phone: string): Promise<QueueStatus> {
  return getQueueStatusByPhoneServer(createAdminClient(), phone);
}

export async function leaveQueue(entryId: string): Promise<void> {
  await leaveQueueServer(createAdminClient(), entryId);
}
