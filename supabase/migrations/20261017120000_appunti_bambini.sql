-- Emovere Studio – Fase 0, punto 4: appunti del bambino (gli "Appunti" delle cartelle dell'app), cifrati
alter table app.children add column notes_enc app.encrypted_text;
