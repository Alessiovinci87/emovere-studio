-- Emovere Studio – Fase 1, cartella del bambino: collegare o scollegare un materiale compare nello
-- storico dell'obiettivo (goal_events.kind = 'materiale').
-- Il titolo del materiale si copia nell'evento (i titoli non contengono mai il nome del bambino):
-- lo storico resta leggibile anche dopo l'eliminazione del materiale (material_id diventa null).

alter table app.goal_events
  add column material_id uuid,
  add column material_title text check (char_length(material_title) <= 200),
  add column material_action text check (material_action in ('collegato', 'scollegato')),
  add foreign key (material_id, org_id) references app.materials (id, org_id) on delete set null (material_id),
  add check ((kind = 'materiale') = (material_action is not null));

create index goal_events_material_idx on app.goal_events (material_id) where material_id is not null;
