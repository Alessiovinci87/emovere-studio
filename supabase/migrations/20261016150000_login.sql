-- Emovere Studio – Fase 0, punto 2: login, primo centro, membri
--
-- - memberships.email: copia dell'email dell'account, per l'elenco dei membri (emovere_app non legge auth.users)
-- - Il primo centro lo crea il primo utente che entra ("Crea il centro"), una sola volta: le iscrizioni
--   sono chiuse e gli altri account arrivano solo su invito del titolare. Quando si venderà ad altri centri,
--   la creazione passerà da un flusso dedicato.

alter table app.memberships add column email text check (char_length(email) <= 320);

-- C'è ancora da creare il primo centro?
create function app.setup_available() returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select not exists (select 1 from app.organizations)
$$;

drop function app.create_organization(text, text, text);

create function app.create_organization(p_name text, p_dek_wrapped text, p_email text, p_display_name text default null)
  returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  me uuid := private.uid();
  org uuid;
begin
  if me is null then
    raise exception 'Utente non autenticato';
  end if;
  -- Due "Crea il centro" contemporanei: passa solo il primo
  perform pg_advisory_xact_lock(hashtext('app.create_organization'));
  if exists (select 1 from app.organizations) then
    raise exception 'Il centro esiste già: chiedi un invito al titolare' using errcode = 'P0002';
  end if;
  insert into app.organizations (name, data_controller, dek_wrapped)
    values (p_name, p_name, p_dek_wrapped)
    returning id into org;
  insert into app.memberships (org_id, user_id, role, display_name, email)
    values (org, me, 'titolare', p_display_name, p_email);
  return org;
end
$$;

revoke all on function app.setup_available(), app.create_organization(text, text, text, text) from public;
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function app.setup_available(), app.create_organization(text, text, text, text) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app.setup_available(), app.create_organization(text, text, text, text) to emovere_app;
