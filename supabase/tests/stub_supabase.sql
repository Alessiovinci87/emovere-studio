-- Solo per il collaudo su un PostgreSQL locale (non è una migrazione):
-- ricrea le parti di Supabase da cui dipendono le migrazioni.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end
$$;
