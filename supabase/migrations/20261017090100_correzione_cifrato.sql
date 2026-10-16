-- Correzione del formato dei campi cifrati: il testo più corto (1 carattere) cifrato con il suo tag
-- di 16 byte occupa 17 byte, cioè 23 caratteri base64 più un "=". Il controllo precedente ne
-- pretendeva almeno 24 e rifiutava i testi di un solo carattere.
alter domain app.encrypted_text drop constraint encrypted_text_check;
alter domain app.encrypted_text add constraint encrypted_text_check
  check (value ~ '^ev1:[0-9]{1,5}:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22,}={0,2}$');
