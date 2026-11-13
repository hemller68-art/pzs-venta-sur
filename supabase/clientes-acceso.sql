-- PROLIMSO Zona Sur: acceso de clientes de cartera (RUC + clave) y carga de la cartera.
-- Ejecutar UNA vez en Supabase > SQL Editor. Se puede repetir sin riesgo (no duplica ni borra claves).

alter table public.clientes add column if not exists clave text default '';
alter table public.clientes add column if not exists activo boolean not null default true;
alter table public.clientes add column if not exists intentos int not null default 0;
alter table public.clientes add column if not exists bloqueo_hasta timestamptz;
alter table public.clientes add column if not exists ultimo_acceso timestamptz;

-- Verifica RUC/DNI + clave y devuelve SOLO los precios de la lista de ese cliente.
-- 5 claves incorrectas bloquean el acceso de ese cliente por 15 minutos.
create or replace function public.cliente_acceso(p_doc text, p_clave text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.clientes; l public.listas_precio; pr jsonb;
begin
  p_doc := regexp_replace(coalesce(p_doc,''), '\D', '', 'g');
  p_clave := regexp_replace(coalesce(p_clave,''), '\D', '', 'g');
  select * into c from public.clientes where doc_num = p_doc and activo limit 1;
  if not found or coalesce(c.clave,'') = '' then
    perform pg_sleep(0.4);
    return jsonb_build_object('ok', false, 'motivo', 'invalido');
  end if;
  if c.bloqueo_hasta is not null and c.bloqueo_hasta > now() then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;
  if c.clave <> p_clave then
    update public.clientes set
      bloqueo_hasta = case when intentos + 1 >= 5 then now() + interval '15 minutes' else bloqueo_hasta end,
      intentos = case when intentos + 1 >= 5 then 0 else intentos + 1 end
    where id = c.id;
    perform pg_sleep(0.4);
    return jsonb_build_object('ok', false, 'motivo', 'invalido');
  end if;
  update public.clientes set intentos = 0, bloqueo_hasta = null, ultimo_acceso = now() where id = c.id;
  select * into l from public.listas_precio where id = c.lista_id;
  if found and l.con_precios then
    select coalesce(jsonb_object_agg(codigo, jsonb_build_object('u', precio_unidad, 'e', precio_empaque)), '{}'::jsonb)
      into pr from public.precios where lista_id = l.id and precio_empaque is not null;
  end if;
  return jsonb_build_object('ok', true, 'nombre', c.nombre, 'tipo', c.doc_tipo, 'lista', coalesce(l.nombre, ''),
    'con_precios', coalesce(l.con_precios, false) and pr is not null, 'precios', coalesce(pr, '{}'::jsonb));
end $$;
revoke all on function public.cliente_acceso(text, text) from public;
grant execute on function public.cliente_acceso(text, text) to anon, authenticated;

