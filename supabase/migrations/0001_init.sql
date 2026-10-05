create extension if not exists "pgcrypto";

-- site_config: singleton row with business identity/branding
create table site_config (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Minha Barbearia',
  logo_url text,
  primary_color text not null default '#111111',
  address text,
  phone text,
  whatsapp text,
  instagram text,
  opening_hours text,
  about text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table barbers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table barber_schedules (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references barbers(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (start_time < end_time)
);

create table barber_time_off (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references barbers(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  check (start_at < end_at)
);

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  barber_id uuid not null references barbers(id),
  service_id uuid not null references services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'agendado' check (status in ('agendado','concluido','cancelado','faltou')),
  origin text not null default 'online' check (origin in ('online','avulso')),
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  benefits text not null,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table client_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  plan_id uuid not null references plans(id),
  started_at date not null default current_date,
  valid_until date not null,
  status text not null default 'ativo' check (status in ('ativo','inadimplente','cancelado')),
  last_payment_at date,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  message text not null,
  appointment_id uuid references appointments(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS
alter table site_config enable row level security;
alter table barbers enable row level security;
alter table barber_schedules enable row level security;
alter table barber_time_off enable row level security;
alter table services enable row level security;
alter table clients enable row level security;
alter table appointments enable row level security;
alter table plans enable row level security;
alter table client_plans enable row level security;
alter table notifications enable row level security;

-- Public (anon) can read marketing-relevant data only
create policy "public read site_config" on site_config for select to anon, authenticated using (true);
create policy "public read barbers" on barbers for select to anon, authenticated using (true);
create policy "public read services" on services for select to anon, authenticated using (true);

-- Everything else (including writes to site_config/barbers/services) is owner-only.
-- "owner" = any authenticated user, since this template has exactly one admin account.
create policy "owner write site_config" on site_config for all to authenticated using (true) with check (true);
create policy "owner write barbers" on barbers for all to authenticated using (true) with check (true);
create policy "owner write services" on services for all to authenticated using (true) with check (true);

create policy "owner all barber_schedules" on barber_schedules for all to authenticated using (true) with check (true);
create policy "owner all barber_time_off" on barber_time_off for all to authenticated using (true) with check (true);
create policy "owner all clients" on clients for all to authenticated using (true) with check (true);
create policy "owner all appointments" on appointments for all to authenticated using (true) with check (true);
create policy "owner all plans" on plans for all to authenticated using (true) with check (true);
create policy "owner all client_plans" on client_plans for all to authenticated using (true) with check (true);
create policy "owner all notifications" on notifications for all to authenticated using (true) with check (true);

-- No policy at all for anon on barber_schedules, barber_time_off, clients,
-- appointments, plans, client_plans, notifications: anon has zero access.
-- Public booking/cancellation flows (Plans 3-4) read/write these through
-- the service-role admin client in server-only code, never through anon RLS.
