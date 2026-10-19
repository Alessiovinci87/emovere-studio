-- Emovere Studio – Fase 0, punto 6: cestino, pulizia notturna, registro degli accessi
--
-- - La pulizia automatica (Vercel Cron → /api/organization?action=purge, ruolo postgres) elimina bambini
--   e materiali nel cestino da più di 30 giorni e lo scrive nel registro: righe senza utente (user_id null)
--   con details.automatico. Dall'app (emovere_app) resta obbligatorio scrivere a proprio nome (policy audit_insert).
-- - Indice per leggere il registro dal più recente, anche filtrato per utente.

alter table app.audit_log alter column user_id drop not null;

create index audit_log_org_user_idx on app.audit_log (org_id, user_id, id desc);

drop function private.purge_deleted(integer);

create function private.purge_deleted(days integer default 30)
  returns table (children_deleted integer, materials_deleted integer)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  c integer;
  m integer;
begin
  -- Prima i materiali nel cestino (anche di bambini ancora attivi), poi i bambini con tutto ciò che contengono
  with gone as (
    delete from app.materials where deleted_at < now() - make_interval(days => days)
    returning org_id, id, child_id
  )
  insert into app.audit_log (org_id, user_id, child_id, action, entity, entity_id, details)
  select org_id, null, child_id, 'elimina', 'materials', id, '{"definitivo": true, "automatico": true}'::jsonb from gone;
  get diagnostics m = row_count;

  with gone as (
    delete from app.children where deleted_at < now() - make_interval(days => days)
    returning org_id, id
  )
  insert into app.audit_log (org_id, user_id, child_id, action, entity, entity_id, details)
  select org_id, null, id, 'elimina', 'children', id, '{"definitivo": true, "automatico": true}'::jsonb from gone;
  get diagnostics c = row_count;

  return query select c, m;
end
$$;

revoke all on function private.purge_deleted(integer) from public;
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'emovere_app'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function private.purge_deleted(integer) from %I', r);
    end if;
  end loop;
end
$$;
