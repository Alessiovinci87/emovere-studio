-- Emovere Studio – appunti sull'app: chi prova l'app segna problemi, idee e domande sulla schermata in cui si trova.
-- Il testo e la risposta sono cifrati (potrebbero contenere per sbaglio dati di un bambino). Tutti i membri del
-- centro scrivono e leggono; stato e risposta li cambia solo il titolare; il testo lo cambia solo chi l'ha scritto.

create table app.app_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizations (id) on delete cascade,
  author_id uuid not null default private.uid(),
  -- Schermata (es. "nuovo") e dettaglio (es. "Parametri"): mai id di bambini o materiali
  screen text not null check (char_length(screen) between 1 and 40),
  context text not null default '' check (char_length(context) <= 120),
  kind text not null check (kind in ('problema', 'idea', 'domanda')),
  text_enc app.encrypted_text not null,
  status text not null default 'nuovo' check (status in ('nuovo', 'visto', 'fatto')),
  reply_enc app.encrypted_text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index app_notes_org_idx on app.app_notes (org_id, created_at desc);

create trigger touch before update on app.app_notes for each row execute function private.touch_updated_at();
create trigger keep_org before update on app.app_notes for each row execute function private.keep_org_id();

-- Chi può cambiare cosa: il testo solo l'autore, stato e risposta solo il titolare
create function private.guard_app_note() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'Autore e data di un appunto non cambiano' using errcode = '42501';
  end if;
  if (new.text_enc is distinct from old.text_enc or new.kind is distinct from old.kind or new.screen is distinct from old.screen
      or new.context is distinct from old.context) and old.author_id is distinct from private.uid() then
    raise exception 'Solo chi ha scritto l''appunto può modificarlo' using errcode = '42501';
  end if;
  if (new.status is distinct from old.status or new.reply_enc is distinct from old.reply_enc) and not private.is_owner(old.org_id) then
    raise exception 'Stato e risposta degli appunti: solo il titolare' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger guard before update on app.app_notes for each row execute function private.guard_app_note();

alter table app.app_notes enable row level security;
grant select, insert, delete on app.app_notes to emovere_app;
grant update (kind, text_enc, status, reply_enc) on app.app_notes to emovere_app;

create policy app_notes_select on app.app_notes for select to emovere_app
  using (private.is_member(org_id));
-- Si scrive solo a proprio nome, come appunto nuovo e senza risposta
create policy app_notes_insert on app.app_notes for insert to emovere_app
  with check (private.is_member(org_id) and author_id = private.uid() and status = 'nuovo' and reply_enc is null);
create policy app_notes_update on app.app_notes for update to emovere_app
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy app_notes_delete on app.app_notes for delete to emovere_app
  using (author_id = private.uid() or private.is_owner(org_id));
