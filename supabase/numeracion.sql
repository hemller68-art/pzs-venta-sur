-- PROLIMSO Zona Sur · Numeración de pedidos (PED-AAAA-NNNNNN), registro seguro y "repetir último pedido"
alter table public.pedidos add column if not exists numero text;

create or replace function public.pedidos_numero() returns trigger language plpgsql as $$
begin
  new.numero := 'PED-' || to_char(new.created_at at time zone 'America/Lima', 'YYYY') || '-' || lpad(new.id::text, 6, '0');
  return new;
end $$;
drop trigger if exists pedidos_numero_t on public.pedidos;
create trigger pedidos_numero_t before insert on public.pedidos for each row execute function public.pedidos_numero();

-- Numera los pedidos que ya existen
update public.pedidos set numero = 'PED-' || to_char(created_at at time zone 'America/Lima', 'YYYY') || '-' || lpad(id::text, 6, '0') where numero is null;
create unique index if not exists pedidos_numero_uq on public.pedidos (numero);

-- Registra el pedido y devuelve su número (las validaciones son las mismas de la política de seguridad)
create or replace function public.registrar_pedido(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare r public.pedidos;
begin
  if length(coalesce(p->>'nombre','')) not between 1 and 160 then raise exception 'nombre no válido'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 80 then raise exception 'productos no válidos'; end if;
  if not ((p->>'doc_tipo' = 'RUC' and p->>'doc_num' ~ '^[0-9]{11}$') or (p->>'doc_tipo' = 'DNI' and p->>'doc_num' ~ '^[0-9]{8}$')) then raise exception 'documento no válido'; end if;
  if length(coalesce(p->>'observaciones','')) > 2000 then raise exception 'observaciones muy largas'; end if;
  if not ((length(coalesce(p->>'whatsapp','')) between 6 and 40 and length(coalesce(p->>'ciudad','')) between 1 and 80) or (p->'origen'->>'cartera' = 'true')) then raise exception 'contacto no válido'; end if;
  insert into public.pedidos (doc_tipo, doc_num, nombre, contacto, whatsapp, ciudad, tipo_negocio, volumen, items, observaciones, clasificacion, origen, modo)
  values (p->>'doc_tipo', p->>'doc_num', p->>'nombre', coalesce(p->>'contacto',''), coalesce(p->>'whatsapp',''), coalesce(p->>'ciudad',''), coalesce(p->>'tipo_negocio',''), coalesce(p->>'volumen',''),
          p->'items', coalesce(p->>'observaciones',''), coalesce(p->>'clasificacion','C'), coalesce(p->'origen','{}'::jsonb), coalesce(p->>'modo',''))
  returning * into r;
  return r.numero;
end $$;
revoke all on function public.registrar_pedido(jsonb) from public;
grant execute on function public.registrar_pedido(jsonb) to anon, authenticated;

-- Acceso de cliente: ahora también devuelve su último pedido (para repetirlo y precargar agencia y condición)
create or replace function public.cliente_acceso(p_doc text, p_clave text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.clientes; l public.listas_precio; pr jsonb; ult jsonb;
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
    select coalesce(jsonb_object_agg(codigo, jsonb_build_object('u', precio_unidad, 'e', precio_empaque, 'esc', escala, 'g', escala_grupo, 'bon', bonif)), '{}'::jsonb)
      into pr from public.precios where lista_id = l.id and precio_empaque is not null;
  end if;
  select jsonb_build_object('numero', numero, 'fecha', created_at, 'items', items, 'condicion', origen->>'condicion', 'agencia', origen->'transporte'->>'agencia', 'datos', origen->'transporte'->>'datos')
    into ult from public.pedidos where doc_tipo = c.doc_tipo and doc_num = c.doc_num order by created_at desc limit 1;
  return jsonb_build_object('ok', true, 'nombre', c.nombre, 'tipo', c.doc_tipo, 'lista', coalesce(l.nombre, ''),
    'con_precios', coalesce(l.con_precios, false) and pr is not null, 'precios', coalesce(pr, '{}'::jsonb), 'dc', c.desc_contado, 'ultimo', ult);
end $$;
revoke all on function public.cliente_acceso(text, text) from public;
grant execute on function public.cliente_acceso(text, text) to anon, authenticated;

select count(*) as pedidos_numerados, min(numero) as primero, max(numero) as ultimo from public.pedidos;
