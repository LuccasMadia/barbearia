-- Demo data for local/dev dashboards — NOT the template seed.
-- supabase/seed.sql is the real per-client template seed and must stay
-- generic; this file is never referenced by it or by any app code.
--
-- Run this manually, only against your own dev/demo Supabase project:
--   supabase db execute -f supabase/demo-seed.sql
-- or paste it into the Supabase SQL editor.
--
-- Assumes at least one active barber and one active service already
-- exist (run supabase/seed.sql first, or use real cadastro data).

insert into clients (name, phone)
values
  ('Cliente Demo 1', '11900000001'),
  ('Cliente Demo 2', '11900000002'),
  ('Cliente Demo 3', '11900000003'),
  ('Cliente Demo 4', '11900000004'),
  ('Cliente Demo 5', '11900000005')
on conflict (phone) do nothing;

with
  barber_list as (
    select id, row_number() over (order by created_at) as rn
    from barbers where active = true
  ),
  barber_count as (select count(*) as n from barber_list),
  service_list as (
    select id, duration_minutes, row_number() over (order by created_at) as rn
    from services where active = true
  ),
  service_count as (select count(*) as n from service_list),
  client_list as (
    select id, row_number() over (order by created_at) as rn
    from clients where phone like '1190000%'
  ),
  client_count as (select count(*) as n from client_list),
  slots as (
    select
      d.day_offset,
      t.slot_time,
      row_number() over (order by d.day_offset, t.slot_time) as rn
    from generate_series(-28, 6) as d(day_offset)
    cross join (values (time '10:00'), (time '15:30')) as t(slot_time)
  )
insert into appointments (client_id, barber_id, service_id, starts_at, ends_at, status, origin)
select
  cl.id,
  b.id,
  sv.id,
  (current_date + s.day_offset + s.slot_time) as starts_at,
  (current_date + s.day_offset + s.slot_time) + (sv.duration_minutes || ' minutes')::interval as ends_at,
  case
    when s.day_offset > 0 then 'agendado'
    when s.rn % 9 = 0 then 'cancelado'
    when s.rn % 13 = 0 then 'faltou'
    else 'concluido'
  end as status,
  'avulso' as origin
from slots s
join client_list cl on cl.rn = ((s.rn - 1) % (select n from client_count)) + 1
join barber_list b on b.rn = ((s.rn - 1 + 1) % (select n from barber_count)) + 1
join service_list sv on sv.rn = ((s.rn - 1 + 2) % (select n from service_count)) + 1;
