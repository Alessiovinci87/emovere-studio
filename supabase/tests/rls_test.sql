-- Collaudo di migrazioni e Row Level Security su un PostgreSQL locale.
-- Si esegue con scripts/test-db.sh (database usa e getta: stub_supabase.sql + migrazioni + questo file).
-- Utenti: A titolare del centro 1, B operatore del centro 1, C titolare del centro 2.
\set ON_ERROR_STOP on
\set QUIET on

create function pg_temp.expect_error(q text, state text) returns void
  language plpgsql
as $$
begin
  execute q;
  raise exception 'TEST FALLITO (nessun errore): %', q;
exception when others then
  if sqlerrm like 'TEST FALLITO%' then
    raise;
  end if;
  if sqlstate <> state then
    raise exception 'TEST FALLITO (atteso %, avuto % "%"): %', state, sqlstate, sqlerrm, q;
  end if;
end
$$;

create function pg_temp.ok(cond boolean, msg text) returns void
  language plpgsql
as $$
begin
  if cond is distinct from true then
    raise exception 'TEST FALLITO: %', msg;
  end if;
end
$$;

grant execute on function pg_temp.expect_error(text, text), pg_temp.ok(boolean, text) to emovere_app, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test');

-- Testo cifrato fittizio nel formato giusto
\set enc '''ev1:1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAA'''

-- ——— Centro 1 (A) e centro 2 (C) ———
set role emovere_app;
select set_config('app.user_id', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.ok(app.setup_available(), 'primo centro da creare');
select set_config('t.org1', app.create_organization('Centro Emovere', 'kv1:fake', 'a@test', 'Martina')::text, false);
select pg_temp.ok(not app.setup_available(), 'primo centro creato');
select pg_temp.ok((select data_controller = 'Centro Emovere' from app.organizations), 'titolare del trattamento = nome del centro');
select pg_temp.ok((select email = 'a@test' and role = 'titolare' from app.memberships), 'A titolare con email');
insert into app.memberships (org_id, user_id, role)
  values (current_setting('t.org1')::uuid, '00000000-0000-0000-0000-00000000000b', 'operatore');

-- Il secondo centro non si crea dall'app (lo inseriamo come amministratore)
select set_config('app.user_id', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.expect_error($q$select app.create_organization('Altro centro', 'kv1:fake', 'c@test')$q$, 'P0002');
reset role;
with o as (insert into app.organizations (name, dek_wrapped) values ('Altro centro', 'kv1:fake') returning id),
     m as (insert into app.memberships (org_id, user_id, role) select id, '00000000-0000-0000-0000-00000000000c', 'titolare' from o)
select set_config('t.org2', id::text, false) from o;
set role emovere_app;
insert into app.children (org_id, pseudonym) values (current_setting('t.org2')::uuid, 'Gufo');

-- C non può aggiungersi al centro 1
select pg_temp.expect_error(format(
  $q$insert into app.memberships (org_id, user_id, role) values (%L, %L, 'titolare')$q$,
  current_setting('t.org1'), '00000000-0000-0000-0000-00000000000c'), '42501');

-- ——— Bambini e codici ———
select set_config('app.user_id', '00000000-0000-0000-0000-00000000000a', false);
with x as (insert into app.children (org_id, pseudonym, development_level_enc) values (current_setting('t.org1')::uuid, 'Stella', :enc) returning id) select set_config('t.child1', id::text, false) from x;
with x as (insert into app.children (org_id, pseudonym, code) values (current_setting('t.org1')::uuid, 'Luna', 'B-9999') returning id) select set_config('t.child2', id::text, false) from x;
select pg_temp.ok((select code from app.children where id = current_setting('t.child1')::uuid) = 'B-0001', 'primo codice B-0001');
select pg_temp.ok((select code from app.children where id = current_setting('t.child2')::uuid) = 'B-0002', 'il codice non si sceglie');
select pg_temp.ok((select count(*) from app.children) = 2, 'A vede solo i bambini del suo centro');
update app.children set code = 'X' where id = current_setting('t.child1')::uuid;
select pg_temp.ok((select code from app.children where id = current_setting('t.child1')::uuid) = 'B-0001', 'il codice non cambia');

-- Testo in chiaro nelle colonne cifrate: rifiutato
select pg_temp.expect_error(format(
  $q$update app.children set development_level_enc = 'ritardo del linguaggio' where id = %L$q$, current_setting('t.child1')), '23514');
select pg_temp.expect_error(format(
  $q$insert into app.child_profile_entries (org_id, child_id, section, text_enc, source) values (%L, %L, 'difficolta', 'testo in chiaro', 'osservato')$q$,
  current_setting('t.org1'), current_setting('t.child1')), '23514');
insert into app.child_profile_entries (org_id, child_id, section, text_enc, source)
  values (current_setting('t.org1')::uuid, current_setting('t.child1')::uuid, 'interessi', :enc, 'genitori');

-- Nome reale: solo il titolare
insert into app.child_identity (child_id, org_id, real_name_enc)
  values (current_setting('t.child1')::uuid, current_setting('t.org1')::uuid, :enc);

select set_config('app.user_id', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.ok((select count(*) from app.children) = 2, 'B (operatore) vede i bambini del centro');
select pg_temp.ok((select count(*) from app.child_identity) = 0, 'B non vede il nome reale');
select pg_temp.expect_error(format(
  $q$insert into app.child_identity (child_id, org_id, real_name_enc) values (%L, %L, %s)$q$,
  current_setting('t.child2'), current_setting('t.org1'), :'enc'), '42501');
delete from app.children where id = current_setting('t.child2')::uuid;
select pg_temp.ok((select count(*) from app.children where id = current_setting('t.child2')::uuid) = 1, 'B non elimina definitivamente');
update app.children set deleted_at = now() where id = current_setting('t.child2')::uuid;
select pg_temp.ok((select deleted_at is not null from app.children where id = current_setting('t.child2')::uuid), 'B sposta nel cestino');

-- B non può cambiare ruoli né "Privacy verificata"
update app.memberships set role = 'titolare' where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select role from app.memberships where user_id = '00000000-0000-0000-0000-00000000000b') = 'operatore', 'B resta operatore');
update app.organizations set privacy_verified_at = now();
select pg_temp.ok((select privacy_verified_at is null from app.organizations), 'B non verifica la privacy');

-- C non vede niente del centro 1
select set_config('app.user_id', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.ok((select count(*) from app.children) = 1, 'C vede solo il suo bambino');
select pg_temp.ok((select count(*) from app.child_profile_entries) = 0, 'C non vede profili altrui');
select pg_temp.ok((select count(*) from app.organizations) = 1, 'C vede solo il suo centro');
select pg_temp.expect_error(format(
  $q$insert into app.materials (org_id, child_id, kind, title, content) values (%L, %L, 'scheda', 'x', '{}')$q$,
  current_setting('t.org1'), current_setting('t.child1')), '42501');
-- C non può collegare un suo materiale a un bambino del centro 1
select pg_temp.expect_error(format(
  $q$insert into app.materials (org_id, child_id, kind, title, content) values (%L, %L, 'scheda', 'x', '{}')$q$,
  current_setting('t.org2'), current_setting('t.child1')), '23503');

-- Utente senza app.user_id: niente
select set_config('app.user_id', '', false);
select pg_temp.ok((select count(*) from app.children) = 0, 'senza utente non si vede niente');
select pg_temp.expect_error($q$select app.create_organization('x', 'y', 'z')$q$, 'P0001');

-- ——— Privacy verificata (titolare) ———
select set_config('app.user_id', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect_error($q$update app.organizations set privacy_verified_by = '00000000-0000-0000-0000-00000000000b'$q$, '42501');
update app.organizations set privacy_verified_at = '2000-01-01' where id = current_setting('t.org1')::uuid;
select pg_temp.ok((select privacy_verified_by = '00000000-0000-0000-0000-00000000000a' and privacy_verified_at > '2020-01-01'
  from app.organizations where id = current_setting('t.org1')::uuid), 'privacy verificata da A, adesso');
select pg_temp.expect_error($q$update app.organizations set dek_wrapped = 'altro'$q$, '42501');
select pg_temp.expect_error($q$update app.organizations set next_child_number = 1$q$, '42501');

-- Ultimo titolare
select pg_temp.expect_error($q$delete from app.memberships where user_id = '00000000-0000-0000-0000-00000000000a'$q$, 'P0001');
select pg_temp.expect_error($q$update app.memberships set role = 'operatore' where user_id = '00000000-0000-0000-0000-00000000000a'$q$, 'P0001');

-- ——— Materiali, versioni, obiettivi ———
select pg_temp.expect_error(format(
  $q$insert into app.materials (org_id, child_id, kind, title, content) values (%L, %L, 'scheda', 'La mia mattina', '{"childName":"Sofia"}')$q$,
  current_setting('t.org1'), current_setting('t.child1')), '23514');
select pg_temp.expect_error(format(
  $q$insert into app.materials (org_id, kind, title, content) values (%L, 'scheda', 'x', '{}')$q$,
  current_setting('t.org1')), '23514');  -- senza bambino deve essere generico

with x as (insert into app.materials (org_id, child_id, kind, title, content, legacy_id) values (current_setting('t.org1')::uuid, current_setting('t.child1')::uuid, 'scheda', 'La mia mattina', '{"childName":""}', 'old-1') returning id) select set_config('t.mat1', id::text, false) from x;
with x as (insert into app.materials (org_id, child_id, kind, title, content) values (current_setting('t.org1')::uuid, current_setting('t.child2')::uuid, 'scheda', 'Altra', '{}') returning id) select set_config('t.mat2', id::text, false) from x;
select pg_temp.expect_error(format(
  $q$insert into app.materials (org_id, child_id, kind, title, content, legacy_id) values (%L, %L, 'scheda', 'doppione', '{}', 'old-1')$q$,
  current_setting('t.org1'), current_setting('t.child1')), '23505');

insert into app.material_versions (org_id, material_id, title, content, reason, version_no)
  values (current_setting('t.org1')::uuid, current_setting('t.mat1')::uuid, 'v', '{}', 'pronta', 77);
insert into app.material_versions (org_id, material_id, title, content, reason)
  values (current_setting('t.org1')::uuid, current_setting('t.mat1')::uuid, 'v', '{}', 'export');
select pg_temp.ok((select array_agg(version_no order by version_no) = '{1,2}' from app.material_versions), 'versioni 1 e 2');
select pg_temp.ok((select current_version = 2 from app.materials where id = current_setting('t.mat1')::uuid), 'current_version = 2');
select pg_temp.expect_error($q$update app.material_versions set title = 'x'$q$, '42501');
select pg_temp.expect_error($q$delete from app.material_versions$q$, '42501');

with x as (insert into app.goals (org_id, child_id, title_enc) values (current_setting('t.org1')::uuid, current_setting('t.child1')::uuid, :enc) returning id) select set_config('t.goal1', id::text, false) from x;
insert into app.material_goals (material_id, goal_id, child_id, org_id)
  values (current_setting('t.mat1')::uuid, current_setting('t.goal1')::uuid, current_setting('t.child1')::uuid, current_setting('t.org1')::uuid);
-- obiettivo del bambino 1 con materiale del bambino 2: rifiutato
select pg_temp.expect_error(format(
  $q$insert into app.material_goals (material_id, goal_id, child_id, org_id) values (%L, %L, %L, %L)$q$,
  current_setting('t.mat2'), current_setting('t.goal1'), current_setting('t.child1'), current_setting('t.org1')), '23503');
select pg_temp.expect_error(format(
  $q$insert into app.material_goals (material_id, goal_id, child_id, org_id) values (%L, %L, %L, %L)$q$,
  current_setting('t.mat2'), current_setting('t.goal1'), current_setting('t.child2'), current_setting('t.org1')), '23503');

insert into app.goal_events (org_id, goal_id, kind, to_status)
  values (current_setting('t.org1')::uuid, current_setting('t.goal1')::uuid, 'creato', 'attivo');
select pg_temp.expect_error(format(
  $q$insert into app.goal_events (org_id, goal_id, kind, author_id) values (%L, %L, 'nota', '00000000-0000-0000-0000-00000000000b')$q$,
  current_setting('t.org1'), current_setting('t.goal1')), '42501');

-- Osservazione collegata all'obiettivo: eliminato l'obiettivo, resta l'osservazione
insert into app.observations (org_id, child_id, goal_id, material_id, behavior_enc, prompt_level)
  values (current_setting('t.org1')::uuid, current_setting('t.child1')::uuid, current_setting('t.goal1')::uuid,
          current_setting('t.mat1')::uuid, :enc, 'verbale');
delete from app.goals where id = current_setting('t.goal1')::uuid;
select pg_temp.ok((select goal_id is null and child_id is not null from app.observations), 'osservazione senza obiettivo, bambino conservato');

-- Una riga non cambia centro
update app.materials set org_id = current_setting('t.org2')::uuid where id = current_setting('t.mat1')::uuid;
select pg_temp.ok((select org_id = current_setting('t.org1')::uuid from app.materials where id = current_setting('t.mat1')::uuid), 'org_id immutabile');

-- ——— Registri ———
insert into app.audit_log (org_id, child_id, action, entity, entity_id)
  values (current_setting('t.org1')::uuid, current_setting('t.child1')::uuid, 'legge', 'children', current_setting('t.child1')::uuid);
insert into app.ai_requests (org_id, child_id, kind, fields_sent, model, images)
  values (current_setting('t.org1')::uuid, current_setting('t.child1')::uuid, 'testo', '{interessi}', 'test', 0);
select pg_temp.expect_error(format(
  $q$insert into app.audit_log (org_id, action, entity, user_id) values (%L, 'legge', 'x', '00000000-0000-0000-0000-00000000000b')$q$,
  current_setting('t.org1')), '42501');
select set_config('app.user_id', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.ok((select count(*) from app.audit_log) = 0, 'B non legge il registro degli accessi');
select pg_temp.ok((select count(*) from app.ai_requests) = 1, 'B vede le chiamate AI del centro');

-- ——— Modelli di sistema ———
reset role;
insert into app.templates (kind, title, content, legacy_id) values ('scheda', 'Pronto/a per uscire', '{}', 'preset-uscire');
set role emovere_app;
select pg_temp.ok((select count(*) from app.templates) = 1, 'B vede i modelli di sistema');
update app.templates set title = 'x';
select pg_temp.ok((select title from app.templates) = 'Pronto/a per uscire', 'B non modifica i modelli di sistema');
select pg_temp.expect_error($q$insert into app.templates (kind, title, content) values ('scheda', 'x', '{}')$q$, '42501');
insert into app.templates (org_id, kind, title, content, from_material_id)
  values (current_setting('t.org1')::uuid, 'scheda', 'Copia', '{}', current_setting('t.mat1')::uuid);
select set_config('app.user_id', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.ok((select count(*) from app.templates) = 1, 'C vede solo i modelli di sistema');

-- ——— Data API di Supabase: nessun accesso ———
reset role;
set role authenticated;
select pg_temp.expect_error($q$select * from app.children$q$, '42501');
select pg_temp.expect_error($q$select private.is_member(null)$q$, '42501');
reset role;
set role anon;
select pg_temp.expect_error($q$select * from app.materials$q$, '42501');
reset role;

-- ——— Cestino ———
update app.children set deleted_at = now() - interval '31 days' where id = current_setting('t.child2')::uuid;
select pg_temp.ok((select children_deleted = 1 from private.purge_deleted()), 'cestino svuotato dopo 30 giorni');
select pg_temp.ok((select count(*) from app.materials where id = current_setting('t.mat2')::uuid) = 0, 'materiali del bambino eliminati');

-- Eliminare un centro elimina tutto, senza bloccarsi sul "titolare unico"
delete from app.organizations where id = current_setting('t.org1')::uuid;
select pg_temp.ok((select count(*) from app.children where org_id = current_setting('t.org1')::uuid) = 0, 'centro eliminato con tutti i dati');

\echo 'Tutti i test superati'
