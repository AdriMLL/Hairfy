-- ============================================================
-- Migración 6: teléfonos canónicos (solo dígitos, sin +34),
-- fusión de fichas duplicadas y códigos nuevos FB-000000
-- Pega este archivo en Supabase -> SQL Editor -> Run
-- ============================================================

-- 1) Normalizar todos los teléfonos a solo dígitos, sin prefijo 34
update public.clients
set phone = case
  when regexp_replace(phone, '\D', '', 'g') like '0034%'
    then substr(regexp_replace(phone, '\D', '', 'g'), 5)
  when length(regexp_replace(phone, '\D', '', 'g')) = 11
       and regexp_replace(phone, '\D', '', 'g') like '34%'
    then substr(regexp_replace(phone, '\D', '', 'g'), 3)
  else regexp_replace(phone, '\D', '', 'g')
end;

-- 2) Fusionar fichas duplicadas (mismo teléfono tras normalizar):
--    se conserva la más antigua y sus citas/pedidos/reseñas se le reasignan
do $$
declare
  dup record;
  keeper uuid;
begin
  for dup in
    select phone from public.clients group by phone having count(*) > 1
  loop
    select id into keeper from public.clients
    where phone = dup.phone order by created_at asc limit 1;

    update public.appointments set client_id = keeper
    where client_id in (select id from public.clients where phone = dup.phone and id <> keeper);

    update public.orders set client_id = keeper
    where client_id in (select id from public.clients where phone = dup.phone and id <> keeper);

    update public.reviews set client_id = keeper
    where client_id in (select id from public.clients where phone = dup.phone and id <> keeper);

    delete from public.clients where phone = dup.phone and id <> keeper;
  end loop;
end $$;

-- 3) Códigos nuevos con formato FB-000000 para todos los clientes
do $$
declare
  c record;
  nuevo text;
  intentos int;
begin
  for c in select id from public.clients loop
    intentos := 0;
    loop
      nuevo := 'FB-' || lpad(floor(random() * 1000000)::text, 6, '0');
      begin
        update public.clients set access_code = nuevo where id = c.id;
        exit;
      exception when unique_violation then
        intentos := intentos + 1;
        if intentos > 5 then raise; end if;
      end;
    end loop;
  end loop;
end $$;

-- 4) El cliente de la demo se queda con un código fácil de recordar
update public.clients set access_code = 'FB-000000' where phone = '600111222';
