-- Emovere Studio – Fase 0: fondamenta del database
--
-- Regole (vedi CLAUDE.md, "Database"):
-- - Le tabelle stanno nello schema `app`, NON esposto dalla Data API di Supabase (PostgREST/GraphQL):
--   il browser non legge né scrive i dati dei bambini, passa sempre dalle funzioni /api.
-- - Le funzioni /api si collegano con DATABASE_URL e, in ogni transazione, fanno
--     set local role emovere_app;  select set_config('app.user_id', '<uuid verificato dal JWT>', true);
--   così la Row Level Security vale anche per il codice del server.
-- - Le colonne *_enc contengono solo testo cifrato (AES-256-GCM a chiave doppia, cifrato da /api):
--   il dominio app.encrypted_text rifiuta qualsiasi testo in chiaro.
-- - Ogni tabella ha org_id; le chiavi esterne composte (id, org_id) impediscono di collegare
--   righe di centri diversi.

create schema if not exists app;
create schema if not exists private;

-- Ruolo con cui girano le query dell'app (nessun login diretto)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'emovere_app') then
    create role emovere_app nologin noinherit;
  end if;
end
$$;
grant emovere_app to postgres;

revoke all on schema app from public;
revoke all on schema private from public;
grant usage on schema app to emovere_app;
grant usage on schema private to emovere_app;
alter default privileges in schema app revoke all on tables from public;
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema app revoke execute on functions from public;

-- ——— Tipi ———

-- Formato prodotto da /api: ev1:{versione chiave}:{IV 12 byte base64}:{testo cifrato + tag base64}
create domain app.encrypted_text as text
  check (value ~ '^ev1:[0-9]{1,5}:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{24,}={0,2}$');

create domain app.material_kind as text
  check (value in ('scheda', 'storia_sociale', 'scenario', 'sequenza', 'guida', 'caa', 'rinforzo', 'attivita'));

-- ——— Funzioni di supporto ———

-- Utente della richiesta, impostato da /api dopo aver verificato il JWT di Supabase Auth
create function private.uid() returns uuid
  language sql stable
  set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create function private.touch_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Il contenuto dei materiali non contiene nome del bambino né appunti (stanno in colonne cifrate)
create function private.content_is_clean(content jsonb) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select jsonb_typeof(content) = 'object'
     and coalesce(content ->> 'childName', '') = ''
     and coalesce(content ->> 'notes', '') = ''
$$;

-- ——— Centri e utenti ———

create table app.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Titolare del trattamento (per Emovere: "Centro Emovere", da confermare col consulente privacy)
  data_controller text check (char_length(data_controller) <= 200),
  -- Impostazioni del centro: nome sui PDF, stampatello predefinito… (mai dati di bambini)
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  logo_path text,
  -- Chiave dati del centro, cifrata con DATA_ENCRYPTION_KEY (che esiste solo su Vercel)
  dek_wrapped text not null,
  dek_key_version smallint not null default 1,
  -- Finché è vuoto, l'app mostra l'avviso "solo dati di prova" (lo attiva solo il titolare)
  privacy_verified_at timestamptz,
  privacy_verified_by uuid,
  next_child_number integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.memberships (
  org_id uuid not null references app.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('titolare', 'operatore')),
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on app.memberships (user_id);

-- Le policy usano queste funzioni: security definer, quindi leggono memberships senza ricorsione RLS
create function private.is_member(org uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from app.memberships m
    where m.org_id = org and m.user_id = private.uid()
  )
$$;

create function private.is_owner(org uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from app.memberships m
    where m.org_id = org and m.user_id = private.uid() and m.role = 'titolare'
  )
$$;

-- ——— Bambini ———

create table app.children (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizations (id) on delete cascade,
  -- Identificativo interno (B-0001, B-0002… per centro), assegnato dal trigger
  code text not null,
  -- Nome usato in tutta l'app: pseudonimo o iniziali
  pseudonym text not null check (char_length(btrim(pseudonym)) between 1 and 60),
  -- Solo l'anno (minimizzazione: mai la data di nascita completa)
  birth_year smallint check (birth_year between 2000 and 2100),
  development_level_enc app.encrypted_text,
  -- Nome da stampare sui materiali (facoltativo): inserito solo all'export
  material_name_enc app.encrypted_text,
  -- Preferenze grafiche: personaggio, varianti… (nessun testo libero)
  graphic_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(graphic_prefs) = 'object'),
  status text not null default 'attivo' check (status in ('attivo', 'archiviato')),
  legacy_id text,
  created_by uuid default private.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cestino: dopo 30 giorni private.purge_deleted() lo elimina davvero
  deleted_at timestamptz,
  unique (org_id, code),
  unique (id, org_id),
  unique (org_id, legacy_id)
);

-- Nome reale: tabella separata, visibile solo al titolare, mai inviato all'AI
create table app.child_identity (
  child_id uuid primary key,
  org_id uuid not null,
  real_name_enc app.encrypted_text,
  updated_at timestamptz not null default now(),
  foreign key (child_id, org_id) references app.children (id, org_id) on delete cascade
);

-- Profilo: una riga per informazione, con la sua provenienza
create table app.child_profile_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  child_id uuid not null,
  section text not null check (section in (
    'comunicazione',  -- competenze comunicative e livello di comprensione
    'autonomie',      -- autonomie e abilità già acquisite
    'interessi',      -- interessi, giochi e personaggi preferiti
    'difficolta',     -- difficoltà e situazioni critiche osservate
    'contesti',       -- contesti di vita: studio, casa, scuola…
    'preferenze',     -- preferenze grafiche e comunicative
    'rinforzatori',   -- rinforzatori e attività motivanti
    'uso',            -- modalità di utilizzo e risposte osservate
    'note'            -- note generali (es. appunti delle cartelle importate)
  )),
  text_enc app.encrypted_text not null,
  source text not null check (source in ('osservato', 'genitori', 'scuola', 'ipotesi')),
  recorded_on date not null default current_date,
  author_id uuid default private.uid(),
  archived_at timestamptz,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (child_id, org_id) references app.children (id, org_id) on delete cascade,
  unique (org_id, legacy_id)
);
create index child_profile_entries_child_idx on app.child_profile_entries (child_id);

-- ——— Obiettivi ———

create table app.goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  child_id uuid not null,
  title_enc app.encrypted_text not null,
  description_enc app.encrypted_text,
  area text check (area in (
    'autonomie', 'comunicazione', 'emozioni', 'abilita_sociali', 'comportamento',
    'funzioni_esecutive', 'scuola', 'altro'
  )),
  status text not null default 'attivo' check (status in ('attivo', 'raggiunto', 'archiviato')),
  started_on date not null default current_date,
  closed_on date,
  created_by uuid default private.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (child_id, org_id) references app.children (id, org_id) on delete cascade,
  unique (id, org_id),
  unique (id, child_id)
);
create index goals_child_idx on app.goals (child_id);

-- Storico degli obiettivi (solo aggiunte, mai modifiche)
create table app.goal_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  goal_id uuid not null,
  kind text not null check (kind in ('creato', 'stato', 'nota', 'materiale')),
  from_status text,
  to_status text,
  note_enc app.encrypted_text,
  author_id uuid default private.uid(),
  created_at timestamptz not null default now(),
  foreign key (goal_id, org_id) references app.goals (id, org_id) on delete cascade
);
create index goal_events_goal_idx on app.goal_events (goal_id, created_at);

-- ——— Materiali, versioni, modelli ———

create table app.templates (
  id uuid primary key default gen_random_uuid(),
  -- null = modello di sistema (le schede pronte), visibile a tutti i centri
  org_id uuid references app.organizations (id) on delete cascade,
  kind app.material_kind not null,
  title text not null check (char_length(title) <= 200),
  description text check (char_length(description) <= 2000),
  content jsonb not null check (private.content_is_clean(content)),
  -- Materiale da cui è nato ("usa come modello"): solo provenienza, il contenuto è una copia
  from_material_id uuid,
  legacy_id text,
  created_by uuid default private.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index templates_legacy_idx
  on app.templates (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), legacy_id)
  where legacy_id is not null;

create table app.materials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizations (id) on delete cascade,
  -- null = materiale generico, senza bambino
  child_id uuid,
  is_generic boolean not null default false,
  kind app.material_kind not null,
  -- Titolo senza il nome del bambino (il nome si aggiunge all'export)
  title text not null check (char_length(title) <= 200),
  status text not null default 'da-fare' check (status in ('da-fare', 'in-lavorazione', 'pronta', 'consegnata')),
  -- Copia di lavoro (oggi: lo Sheet senza childName e notes); il salvataggio automatico aggiorna questa
  content jsonb not null check (private.content_is_clean(content)),
  content_schema smallint not null default 1,
  current_version integer not null default 0,
  from_template_id uuid references app.templates (id) on delete set null,
  notes_enc app.encrypted_text,
  reminder_date date,
  reminder_kind text check (reminder_kind in ('creare', 'stampare', 'consegnare', 'rivedere')),
  reminder_done boolean not null default false,
  opened_at timestamptz,
  legacy_id text,
  created_by uuid default private.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (child_id is not null or is_generic),
  check ((reminder_date is null) = (reminder_kind is null)),
  foreign key (child_id, org_id) references app.children (id, org_id) on delete cascade,
  unique (id, org_id),
  unique (id, child_id),
  unique (org_id, legacy_id)
);
create index materials_org_child_idx on app.materials (org_id, child_id);
create index materials_reminder_idx on app.materials (org_id, reminder_date) where reminder_date is not null and not reminder_done;

alter table app.templates
  add foreign key (from_material_id) references app.materials (id) on delete set null;

-- Versioni fisse (pronta, export PDF, "Salva versione"): solo aggiunte
create table app.material_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  material_id uuid not null,
  version_no integer not null,
  title text not null,
  content jsonb not null check (private.content_is_clean(content)),
  reason text not null check (reason in ('pronta', 'export', 'manuale', 'importato')),
  created_by uuid default private.uid(),
  created_at timestamptz not null default now(),
  foreign key (material_id, org_id) references app.materials (id, org_id) on delete cascade,
  unique (material_id, version_no)
);

-- Materiale ↔ obiettivi: le chiavi composte garantiscono che siano dello stesso bambino
create table app.material_goals (
  material_id uuid not null,
  goal_id uuid not null,
  child_id uuid not null,
  org_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (material_id, goal_id),
  foreign key (material_id, child_id) references app.materials (id, child_id) on delete cascade,
  foreign key (goal_id, child_id) references app.goals (id, child_id) on delete cascade,
  foreign key (child_id, org_id) references app.children (id, org_id) on delete cascade
);
create index material_goals_goal_idx on app.material_goals (goal_id);

-- ——— Osservazioni (interfaccia in Fase 3) ———

create table app.observations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  child_id uuid not null,
  goal_id uuid,
  material_id uuid,
  observed_at timestamptz not null default now(),
  context text check (context in ('studio', 'casa', 'scuola', 'altro')),
  -- Dati registrati
  antecedent_enc app.encrypted_text,
  behavior_enc app.encrypted_text,
  consequence_enc app.encrypted_text,
  prompt_level text check (prompt_level in (
    'autonomo', 'verbale', 'gestuale', 'modello', 'fisico_parziale', 'fisico_totale'
  )),
  frequency integer check (frequency >= 0),
  duration_seconds integer check (duration_seconds >= 0),
  material_response_enc app.encrypted_text,
  -- Note e interpretazioni dell'operatore, separate dai dati registrati
  operator_notes_enc app.encrypted_text,
  interpretation_enc app.encrypted_text,
  author_id uuid default private.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (child_id, org_id) references app.children (id, org_id) on delete cascade,
  foreign key (goal_id, child_id) references app.goals (id, child_id) on delete set null (goal_id),
  foreign key (material_id, org_id) references app.materials (id, org_id) on delete set null (material_id)
);
create index observations_child_idx on app.observations (child_id, observed_at);
create index observations_goal_idx on app.observations (goal_id, observed_at);

-- ——— Registri ———

-- Chiamate all'AI: quali campi sono stati inviati (solo i nomi, mai il contenuto) e quanto costano
create table app.ai_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizations (id) on delete cascade,
  user_id uuid not null default private.uid(),
  child_id uuid,
  kind text not null check (kind in ('vignetta', 'colorare', 'testo', 'scena')),
  fields_sent text[] not null default '{}',
  model text not null,
  images integer not null default 0 check (images >= 0),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cost_estimate_usd numeric(10, 4),
  created_at timestamptz not null default now(),
  foreign key (child_id, org_id) references app.children (id, org_id) on delete set null (child_id)
);
create index ai_requests_org_idx on app.ai_requests (org_id, created_at);

-- Chi ha fatto cosa sui dati dei bambini (child_id senza chiave esterna: resta dopo l'eliminazione)
create table app.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references app.organizations (id) on delete cascade,
  user_id uuid not null default private.uid(),
  child_id uuid,
  action text not null check (action in ('crea', 'legge', 'modifica', 'esporta', 'elimina', 'ripristina', 'importa')),
  entity text not null,
  entity_id uuid,
  -- Mai contenuti: solo identificativi e nomi dei campi
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on app.audit_log (org_id, created_at);
create index audit_log_child_idx on app.audit_log (child_id, created_at);

-- ——— Trigger ———

create trigger touch before update on app.organizations for each row execute function private.touch_updated_at();
create trigger touch before update on app.children for each row execute function private.touch_updated_at();
create trigger touch before update on app.child_identity for each row execute function private.touch_updated_at();
create trigger touch before update on app.child_profile_entries for each row execute function private.touch_updated_at();
create trigger touch before update on app.goals for each row execute function private.touch_updated_at();
create trigger touch before update on app.templates for each row execute function private.touch_updated_at();
create trigger touch before update on app.materials for each row execute function private.touch_updated_at();
create trigger touch before update on app.observations for each row execute function private.touch_updated_at();

-- Una riga non cambia mai centro (la chiave dati è per centro)
create function private.keep_org_id() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.org_id := old.org_id;
  return new;
end
$$;
create trigger keep_org before update on app.child_identity for each row execute function private.keep_org_id();
create trigger keep_org before update on app.child_profile_entries for each row execute function private.keep_org_id();
create trigger keep_org before update on app.goals for each row execute function private.keep_org_id();
create trigger keep_org before update on app.templates for each row execute function private.keep_org_id();
create trigger keep_org before update on app.materials for each row execute function private.keep_org_id();
create trigger keep_org before update on app.observations for each row execute function private.keep_org_id();
create trigger keep_org before update on app.memberships for each row execute function private.keep_org_id();

-- Codice interno del bambino: B-0001, B-0002… per centro, mai riusato
create function private.assign_child_code() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  n integer;
begin
  update app.organizations
     set next_child_number = next_child_number + 1
   where id = new.org_id
  returning next_child_number - 1 into n;
  if n is null then
    raise exception 'Centro inesistente';
  end if;
  new.code := 'B-' || lpad(n::text, 4, '0');
  return new;
end
$$;
create trigger assign_code before insert on app.children
  for each row execute function private.assign_child_code();

-- Il codice non si cambia
create function private.keep_child_code() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.code := old.code;
  new.org_id := old.org_id;
  return new;
end
$$;
create trigger keep_code before update on app.children
  for each row execute function private.keep_child_code();

-- Numero di versione progressivo per materiale
create function private.assign_version_no() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  n integer;
begin
  update app.materials
     set current_version = current_version + 1
   where id = new.material_id and org_id = new.org_id
  returning current_version into n;
  if n is null then
    raise exception 'Materiale inesistente';
  end if;
  new.version_no := n;
  return new;
end
$$;
create trigger assign_version before insert on app.material_versions
  for each row execute function private.assign_version_no();

-- "Privacy verificata": registra chi e quando (l'update è permesso solo al titolare)
create function private.stamp_privacy() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.privacy_verified_at is distinct from old.privacy_verified_at then
    if new.privacy_verified_at is null then
      new.privacy_verified_by := null;
    else
      new.privacy_verified_at := now();
      new.privacy_verified_by := private.uid();
    end if;
  else
    new.privacy_verified_by := old.privacy_verified_by;
  end if;
  return new;
end
$$;
create trigger stamp_privacy before update on app.organizations
  for each row execute function private.stamp_privacy();

-- Ogni centro deve avere almeno un titolare
create function private.keep_one_owner() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if old.role = 'titolare'
     and (tg_op = 'DELETE' or new.role <> 'titolare' or new.org_id <> old.org_id)
     and exists (select 1 from app.organizations o where o.id = old.org_id)
     and not exists (
       select 1 from app.memberships m
       where m.org_id = old.org_id and m.role = 'titolare' and m.user_id <> old.user_id
     ) then
    raise exception 'Il centro deve avere almeno un titolare';
  end if;
  return coalesce(new, old);
end
$$;
create trigger keep_one_owner before update or delete on app.memberships
  for each row execute function private.keep_one_owner();

-- ——— Operazioni ———

-- Crea un centro e rende titolare chi lo crea (dek_wrapped la genera /api)
create function app.create_organization(p_name text, p_dek_wrapped text, p_display_name text default null)
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
  insert into app.organizations (name, dek_wrapped) values (p_name, p_dek_wrapped) returning id into org;
  insert into app.memberships (org_id, user_id, role, display_name) values (org, me, 'titolare', p_display_name);
  return org;
end
$$;

-- Svuota il cestino: bambini e materiali eliminati da più di `days` giorni (job notturno, ruolo postgres)
create function private.purge_deleted(days integer default 30)
  returns table (children_deleted integer, materials_deleted integer)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  c integer;
  m integer;
begin
  delete from app.materials where deleted_at < now() - make_interval(days => days);
  get diagnostics m = row_count;
  delete from app.children where deleted_at < now() - make_interval(days => days);
  get diagnostics c = row_count;
  return query select c, m;
end
$$;
