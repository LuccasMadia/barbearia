alter table site_config add column queue_open boolean not null default false;

alter table appointments drop constraint appointments_origin_check;
alter table appointments add constraint appointments_origin_check
  check (origin in ('online','avulso','fila'));

create table queue_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  service_id uuid not null references services(id),
  barber_id uuid references barbers(id),
  status text not null default 'aguardando'
    check (status in ('aguardando','em_atendimento','concluido','cancelado')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

alter table queue_entries enable row level security;
create policy "owner all queue_entries" on queue_entries for all to authenticated using (true) with check (true);

-- No anon policy at all, same as appointments/clients: every public read/write
-- to queue_entries goes through the service-role admin client inside a
-- Server Action, never through anon RLS.
