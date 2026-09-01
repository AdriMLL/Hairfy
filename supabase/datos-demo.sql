-- ============================================================
-- DATOS DE DEMO para enseñar la app al dueño de la barbería.
-- ¡OJO! Borra todos los datos actuales (citas, clientes, etc.)
-- y los sustituye por datos de ejemplo realistas.
-- Cliente para la demo en vivo: teléfono 600111222, código HF-DEMO
-- ============================================================

-- Limpieza
delete from public.appointment_products;
delete from public.reviews;
delete from public.appointments;
delete from public.clients;
delete from public.products;
delete from public.services;
delete from public.employees;

-- Empleado (el barbero real; al ser único, la web lo asigna sola)
insert into public.employees (name) values ('Yashim');

-- Servicios de barbería
insert into public.services (name, duration_min, price_eur) values
  ('Corte de pelo', 30, 11.00),
  ('Corte + barba', 45, 15.00),
  ('Arreglo de barba', 30, 7.00),
  ('Corte niño (hasta 12 años)', 30, 9.00),
  ('Afeitado clásico a navaja', 30, 10.00),
  ('Corte + barba + cejas', 60, 18.00);

-- Productos en venta
insert into public.products (name, description, price_eur, stock) values
  ('Cera moldeadora mate', 'Fijación fuerte, acabado natural', 9.90, 12),
  ('Aceite para barba', 'Hidrata y da brillo, aroma sándalo', 12.90, 10),
  ('Champú anticaída 300ml', 'Uso diario', 14.50, 8),
  ('Bálsamo aftershave', 'Calma la piel tras el afeitado', 11.00, 6),
  ('Polvos texturizantes', 'Volumen y efecto mate', 13.90, 9);

-- Clientes de ejemplo (el primero es el de la demo en vivo)
insert into public.clients (name, phone, access_code) values
  ('Cliente Demo', '600111222', 'HF-DEMO'),
  ('Javier Moreno', '611234567', 'HF-2A3B'),
  ('Carlos Ruiz', '622345678', 'HF-4C5D'),
  ('Miguel Ángel Torres', '633456789', 'HF-6E7F'),
  ('David Sánchez', '644567890', 'HF-8G9H'),
  ('Rubén Castillo', '655678901', 'HF-J2K3'),
  ('Álvaro Gil', '666789012', 'HF-M4N5'),
  ('Iván Pardo', '677890123', 'HF-P6Q7');

-- Citas pasadas (últimas ~6 semanas) para llenar estadísticas
do $$
declare
  e_id uuid;
  svc uuid[];
  dur int[];
  cli uuid[];
  i int;
  d int;
  h int;
  base timestamptz;
  st text;
begin
  select id into e_id from public.employees where name = 'Yashim';
  select array_agg(id order by name), array_agg(duration_min order by name)
    into svc, dur from public.services;
  select array_agg(id order by name) into cli from public.clients;

  for i in 1..60 loop
    d := (i % 37) + 2;               -- entre 2 y 38 días atrás
    h := (i * 7) % 10;               -- 9:30 .. 18:30 hora local
    base := (date_trunc('day', (now() at time zone 'Europe/Madrid'))
             - make_interval(days => d)
             + make_interval(hours => 9 + h, mins => 30)) at time zone 'Europe/Madrid';
    st := case when i % 13 = 0 then 'cancelled' else 'confirmed' end;
    insert into public.appointments (employee_id, service_id, client_id, starts_at, ends_at, status)
    values (
      e_id,
      svc[(i % array_length(svc, 1)) + 1],
      cli[(i % array_length(cli, 1)) + 1],
      base,
      base + make_interval(mins => dur[(i % array_length(svc, 1)) + 1]),
      st
    );
  end loop;

  -- Cita de ayer para el Cliente Demo (así puede "Valorar" en la demo)
  base := (date_trunc('day', (now() at time zone 'Europe/Madrid'))
           - interval '1 day' + interval '19 hours') at time zone 'Europe/Madrid';
  insert into public.appointments (employee_id, service_id, client_id, starts_at, ends_at, status)
  select e_id, s.id, c.id, base, base + make_interval(mins => s.duration_min), 'confirmed'
  from public.services s, public.clients c
  where s.name = 'Corte + barba' and c.phone = '600111222';

  -- Citas de mañana y pasado (para la agenda del admin y la web)
  insert into public.appointments (employee_id, service_id, client_id, starts_at, ends_at, status)
  select e_id, s.id, c.id,
    (date_trunc('day', (now() at time zone 'Europe/Madrid'))
      + make_interval(days => x.dd, hours => x.hh, mins => x.mm)) at time zone 'Europe/Madrid',
    (date_trunc('day', (now() at time zone 'Europe/Madrid'))
      + make_interval(days => x.dd, hours => x.hh, mins => x.mm)) at time zone 'Europe/Madrid'
      + make_interval(mins => s.duration_min),
    'confirmed'
  from (values
    (1, 10, 0, 'Corte + barba', '600111222'),
    (1, 11, 30, 'Corte de pelo', '611234567'),
    (1, 12, 30, 'Arreglo de barba', '622345678'),
    (1, 17, 0, 'Corte niño (hasta 12 años)', '644567890'),
    (1, 18, 0, 'Afeitado clásico a navaja', '655678901'),
    (2, 10, 30, 'Corte + barba + cejas', '666789012'),
    (2, 16, 30, 'Corte de pelo', '677890123')
  ) as x(dd, hh, mm, sname, cphone)
  join public.services s on s.name = x.sname
  join public.clients c on c.phone = x.cphone;
end $$;

-- Reseñas aprobadas (sobre citas pasadas, sin tocar las 4 más recientes
-- para que el Cliente Demo pueda valorar la suya en directo)
insert into public.reviews (appointment_id, client_id, rating, comment, approved)
select a.id, a.client_id, r.rating, r.comment, true
from (
  select id, client_id, row_number() over (order by starts_at desc) as rn
  from public.appointments
  where status = 'confirmed' and ends_at < now()
) a
join (values
  (5, 5, 'Brutal el degradado, Yashim es un artista. Repetiré seguro.'),
  (6, 5, 'Reservé online en un minuto y salí encantado. Trato de 10.'),
  (7, 4, 'Muy buen corte y buen precio. El local queda genial con las luces.'),
  (8, 5, 'El mejor arreglo de barba que me han hecho en Leganés.')
) as r(rn, rating, comment) on r.rn = a.rn;

-- Un producto reservado en la cita de mañana del Cliente Demo
insert into public.appointment_products (appointment_id, product_id, quantity)
select a.id, p.id, 1
from public.appointments a
join public.clients c on c.id = a.client_id and c.phone = '600111222'
join public.products p on p.name = 'Cera moldeadora mate'
where a.starts_at > now()
order by a.starts_at
limit 1;
