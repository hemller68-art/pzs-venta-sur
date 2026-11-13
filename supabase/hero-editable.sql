-- Etiqueta editable sobre el título del hero (Panel > Negocio y modo).
alter table negocio add column if not exists campana_etiqueta text;
alter table negocio add column if not exists normal_etiqueta text;
