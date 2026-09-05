-- Migración 13 (v23): cierres parciales (por horas)
-- Si starts_time/ends_time son NULL, el cierre es de día(s) completo(s).
-- Si tienen valor, solo se bloquea ese tramo horario de cada día del rango.
alter table public.closures
  add column if not exists starts_time time,
  add column if not exists ends_time time;
