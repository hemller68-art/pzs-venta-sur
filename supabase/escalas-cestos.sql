-- PROLIMSO Zona Sur: descuento por volumen (escala por paquetes) para los cestos.
-- Ejecutar UNA vez en Supabase > SQL Editor. Se puede repetir sin riesgo.
-- Los precios de la tabla son los precios oficiales: el tramo de 1 a 4 paquetes es el PRECIO DE LISTA y pasa a ser el precio vigente.
-- d = desde cuántos paquetes (de 12 unidades) aplica; u = precio por unidad. Cada tramo reemplaza al anterior (1-4, 5-9, 10-29, 30-59, 60-99, 100 o más).

alter table public.precios add column if not exists escala jsonb;

-- Ratán Grande
update public.precios set escala = '[{"d":1,"u":23.5},{"d":5,"u":23.0},{"d":10,"u":22.5},{"d":30,"u":22.0},{"d":60,"u":21.5},{"d":100,"u":20.5}]'::jsonb where codigo in ('CES0002','CES0003','CES0004','CES0027','CES0028','CES0029') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
update public.precios set precio_unidad = 23.5, precio_empaque = 282.0, vigente_desde = current_date where codigo in ('CES0002','CES0003','CES0004','CES0027','CES0028','CES0029') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
-- Yute N° 60
update public.precios set escala = '[{"d":1,"u":28.3},{"d":5,"u":27.8},{"d":10,"u":27.2},{"d":30,"u":26.6},{"d":60,"u":26.0},{"d":100,"u":24.7}]'::jsonb where codigo in ('CES0024','CES0025','CES0026') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
update public.precios set precio_unidad = 28.3, precio_empaque = 339.6, vigente_desde = current_date where codigo in ('CES0024','CES0025','CES0026') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
-- Yute N° 40
update public.precios set escala = '[{"d":1,"u":17.4},{"d":5,"u":17.0},{"d":10,"u":16.7},{"d":30,"u":16.3},{"d":60,"u":16.0},{"d":100,"u":15.2}]'::jsonb where codigo in ('CES0021','CES0022','CES0023') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
update public.precios set precio_unidad = 17.4, precio_empaque = 208.8, vigente_desde = current_date where codigo in ('CES0021','CES0022','CES0023') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
-- Pitay N° 60
update public.precios set escala = '[{"d":1,"u":29.4},{"d":5,"u":28.8},{"d":10,"u":28.2},{"d":30,"u":27.6},{"d":60,"u":27.0},{"d":100,"u":25.7}]'::jsonb where codigo in ('CES0017','CES0018','CES0019','CES0020') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
update public.precios set precio_unidad = 29.4, precio_empaque = 352.8, vigente_desde = current_date where codigo in ('CES0017','CES0018','CES0019','CES0020') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
-- Pitay N° 40
update public.precios set escala = '[{"d":1,"u":24.8},{"d":5,"u":24.3},{"d":10,"u":23.8},{"d":30,"u":23.2},{"d":60,"u":22.7},{"d":100,"u":21.6}]'::jsonb where codigo in ('CES0013','CES0014','CES0015','CES0016') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
update public.precios set precio_unidad = 24.8, precio_empaque = 297.6, vigente_desde = current_date where codigo in ('CES0013','CES0014','CES0015','CES0016') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));

-- El acceso del cliente ahora también devuelve la escala (solo de SU lista).
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
    select coalesce(jsonb_object_agg(codigo, jsonb_build_object('u', precio_unidad, 'e', precio_empaque, 'esc', escala)), '{}'::jsonb)
      into pr from public.precios where lista_id = l.id and precio_empaque is not null;
  end if;
  return jsonb_build_object('ok', true, 'nombre', c.nombre, 'tipo', c.doc_tipo, 'lista', coalesce(l.nombre, ''),
    'con_precios', coalesce(l.con_precios, false) and pr is not null, 'precios', coalesce(pr, '{}'::jsonb));
end $$;
revoke all on function public.cliente_acceso(text, text) from public;
grant execute on function public.cliente_acceso(text, text) to anon, authenticated;
