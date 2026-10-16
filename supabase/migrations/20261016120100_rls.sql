-- Emovere Studio – Fase 0: permessi e Row Level Security
--
-- Le policy valgono per il ruolo emovere_app (usato da /api con `set local role`).
-- anon, authenticated e service_role (Data API di Supabase) non hanno alcun accesso allo schema app.
-- Ruoli nel centro: titolare (tutto, compresi nome reale, eliminazioni definitive e "Privacy verificata")
-- e operatore (lavoro quotidiano su bambini, obiettivi, materiali e osservazioni).

-- ——— Row Level Security attiva su tutte le tabelle ———

alter table app.organizations enable row level security;
alter table app.memberships enable row level security;
alter table app.children enable row level security;
alter table app.child_identity enable row level security;
alter table app.child_profile_entries enable row level security;
alter table app.goals enable row level security;
alter table app.goal_events enable row level security;
alter table app.templates enable row level security;
alter table app.materials enable row level security;
alter table app.material_versions enable row level security;
alter table app.material_goals enable row level security;
alter table app.observations enable row level security;
alter table app.ai_requests enable row level security;
alter table app.audit_log enable row level security;

-- ——— Privilegi (le policy restringono poi le righe) ———

grant select on app.organizations to emovere_app;
-- dek_wrapped, next_child_number e date non si toccano dall'app
grant update (name, data_controller, settings, logo_path, privacy_verified_at) on app.organizations to emovere_app;

grant select, insert, delete on app.memberships to emovere_app;
grant update (role, display_name) on app.memberships to emovere_app;

grant select, insert, update, delete on
  app.children, app.child_identity, app.child_profile_entries, app.goals,
  app.templates, app.materials, app.observations
  to emovere_app;

-- Solo aggiunte: storico obiettivi, versioni, registri
grant select, insert on app.goal_events, app.material_versions, app.ai_requests, app.audit_log to emovere_app;
grant select, insert, delete on app.material_goals to emovere_app;

-- Nessun accesso dalla Data API (anche se in futuro lo schema venisse esposto per errore)
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema app, private from %I', r);
      execute format('revoke all on all tables in schema app from %I', r);
      execute format('revoke all on all sequences in schema app from %I', r);
      execute format('revoke all on all functions in schema app, private from %I', r);
    end if;
  end loop;
end
$$;
revoke all on all functions in schema app, private from public;
grant execute on function private.uid() to emovere_app;
grant execute on function private.is_member(uuid) to emovere_app;
grant execute on function private.is_owner(uuid) to emovere_app;
grant execute on function private.content_is_clean(jsonb) to emovere_app;
grant execute on function app.create_organization(text, text, text) to emovere_app;

-- ——— Policy ———

-- Centri: li vede chi ne fa parte, li modifica il titolare (inserimento solo con app.create_organization)
create policy org_select on app.organizations for select to emovere_app
  using (private.is_member(id));
create policy org_update on app.organizations for update to emovere_app
  using (private.is_owner(id)) with check (private.is_owner(id));

-- Membri: visibili ai colleghi, gestiti dal titolare
create policy memberships_select on app.memberships for select to emovere_app
  using (private.is_member(org_id));
create policy memberships_insert on app.memberships for insert to emovere_app
  with check (private.is_owner(org_id));
create policy memberships_update on app.memberships for update to emovere_app
  using (private.is_owner(org_id)) with check (private.is_owner(org_id));
create policy memberships_delete on app.memberships for delete to emovere_app
  using (private.is_owner(org_id));

-- Bambini: lavoro di tutti i membri; eliminazione definitiva solo del titolare
-- (gli operatori spostano nel cestino con deleted_at)
create policy children_select on app.children for select to emovere_app
  using (private.is_member(org_id));
create policy children_insert on app.children for insert to emovere_app
  with check (private.is_member(org_id));
create policy children_update on app.children for update to emovere_app
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy children_delete on app.children for delete to emovere_app
  using (private.is_owner(org_id));

-- Nome reale: solo il titolare
create policy child_identity_owner on app.child_identity for all to emovere_app
  using (private.is_owner(org_id)) with check (private.is_owner(org_id));

-- Profilo, materiali, osservazioni: tutti i membri del centro
create policy profile_member on app.child_profile_entries for all to emovere_app
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy materials_member on app.materials for all to emovere_app
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy observations_member on app.observations for all to emovere_app
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy material_goals_select on app.material_goals for select to emovere_app
  using (private.is_member(org_id));
create policy material_goals_insert on app.material_goals for insert to emovere_app
  with check (private.is_member(org_id));
create policy material_goals_delete on app.material_goals for delete to emovere_app
  using (private.is_member(org_id));

-- Obiettivi: si archiviano; eliminazione definitiva solo del titolare
create policy goals_select on app.goals for select to emovere_app
  using (private.is_member(org_id));
create policy goals_insert on app.goals for insert to emovere_app
  with check (private.is_member(org_id));
create policy goals_update on app.goals for update to emovere_app
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy goals_delete on app.goals for delete to emovere_app
  using (private.is_owner(org_id));

-- Storico e versioni: si leggono e si aggiungono
create policy goal_events_select on app.goal_events for select to emovere_app
  using (private.is_member(org_id));
create policy goal_events_insert on app.goal_events for insert to emovere_app
  with check (private.is_member(org_id) and author_id = private.uid());
create policy material_versions_select on app.material_versions for select to emovere_app
  using (private.is_member(org_id));
create policy material_versions_insert on app.material_versions for insert to emovere_app
  with check (private.is_member(org_id) and created_by = private.uid());

-- Modelli: quelli di sistema (org_id null) li vedono tutti e non li modifica nessuno dall'app
create policy templates_select on app.templates for select to emovere_app
  using (org_id is null or private.is_member(org_id));
create policy templates_insert on app.templates for insert to emovere_app
  with check (org_id is not null and private.is_member(org_id));
create policy templates_update on app.templates for update to emovere_app
  using (org_id is not null and private.is_member(org_id))
  with check (org_id is not null and private.is_member(org_id));
create policy templates_delete on app.templates for delete to emovere_app
  using (org_id is not null and private.is_member(org_id));

-- Registri: ognuno scrive a proprio nome; le chiamate AI le vedono i membri, l'audit solo il titolare
create policy ai_requests_select on app.ai_requests for select to emovere_app
  using (private.is_member(org_id));
create policy ai_requests_insert on app.ai_requests for insert to emovere_app
  with check (private.is_member(org_id) and user_id = private.uid());
create policy audit_select on app.audit_log for select to emovere_app
  using (private.is_owner(org_id));
create policy audit_insert on app.audit_log for insert to emovere_app
  with check (private.is_member(org_id) and user_id = private.uid());
