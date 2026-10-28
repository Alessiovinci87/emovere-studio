-- Keep-alive del progetto Supabase (piano Free: pausa dopo 7 giorni senza attività).
-- La GitHub Action .github/workflows/supabase-keepalive.yml la chiama ogni giorno con la chiave
-- publishable: restituisce solo l'ora del server, non legge né scrive dati.
create or replace function public.keepalive()
  returns timestamptz
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select pg_catalog.now()
$$;

-- Su Supabase le funzioni in `public` sono eseguibili da tutti i ruoli della Data API: solo `anon`
revoke all on function public.keepalive() from public, authenticated;
grant execute on function public.keepalive() to anon;
