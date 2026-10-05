insert into site_config (name, address, phone, opening_hours, about)
values (
  'Minha Barbearia',
  'Rua Exemplo, 123 - Centro',
  '(11) 99999-9999',
  'Seg a Sáb, 09:00 às 19:00',
  'Edite esta descrição no painel administrativo em Configurações.'
);

with new_barber as (
  insert into barbers (name, active) values ('Barbeiro Exemplo', true)
  returning id
)
insert into barber_schedules (barber_id, weekday, start_time, end_time)
select new_barber.id, weekday, '09:00', '18:00'
from new_barber, generate_series(1, 5) as weekday; -- Mon(1)-Fri(5)

insert into services (name, duration_minutes, price_cents, active)
values ('Corte de Cabelo', 30, 4000, true);
