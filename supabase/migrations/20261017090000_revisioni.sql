-- Emovere Studio – Fase 0, punto 3: controllo di versione dei materiali
--
-- materials.revision cresce a ogni modifica di titolo o contenuto. L'app salva indicando la revisione
-- da cui è partita (/api/materials, baseRevision): se nel frattempo è cambiata (altro dispositivo,
-- altra persona, modifiche fatte offline) il server risponde 409 con la versione attuale e l'app
-- lascia scegliere quale tenere, o salvare la propria come copia. Nessun "vince l'ultimo".

alter table app.materials add column revision integer not null default 1;

create function private.bump_revision() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.content is distinct from old.content or new.title is distinct from old.title then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  return new;
end
$$;
create trigger bump_revision before update on app.materials
  for each row execute function private.bump_revision();
