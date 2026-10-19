# Emovere Studio – prototipo

Strumento per comporre schede visive (routine, storie sociali, prima/poi, scelte) per bambini 3-8 anni con autismo, ADHD e DOP, partendo da una libreria di vignette illustrate. Utente iniziale: Martina (psicopedagogista, Centro Emovere). Obiettivo commerciale futuro: vendita ad altri professionisti.

## Nuova direzione del progetto (ottobre 2026)
- `docs/specifica-martina.pdf`: specifica funzionale di Martina ("Assistente per la progettazione di materiali educativi e comportamentali"). Il software passa da compositore di schede ad assistente alla progettazione educativa: obiettivo → situazione → competenza → supporto → personalizzazione → generazione → revisione → utilizzo → osservazione
- `docs/PIANO.md`: piano di sviluppo (Fase 0 fondamenta: login, database in UE, privacy; Fasi 1-3), confronto con il prototipo attuale, decisioni aperte e rischi
- Questi due documenti sono il riferimento per le nuove funzioni. La Fase 0 è avviata: le regole "niente login, niente database" della sezione seguente non valgono più per il nuovo codice

## Fase 0 – decisioni approvate (16 ottobre 2026)
- Backend: Supabase, progetto `vrlryycceswltabasogi` in regione **Irlanda (eu-west-1)**; schema multi-centro con `organizations` da subito
- Funzioni Vercel nella stessa zona del database: regione `dub1` (Dublino), impostata in `vercel.json` (`regions`). Il Blob delle immagini resta in `fra1` (sempre UE)
- Tutti i dati dei bambini passano solo da `/api`; cifratura AES-256-GCM lato server a chiave doppia (chiave dati per centro, cifrata con `DATA_ENCRYPTION_KEY`)
- Ordine dei lavori: 1. migrazioni SQL e RLS · 2. login, MFA e inviti · 3. funzioni `/api` con cifratura · 4. app collegata al server al posto di `store.ts` · 5. migrazione da localStorage/backup · 6. export e cancellazione, audit, cron · 7. funzioni AI con `ai_requests` e anteprima dei dati inviati
- Titolare del trattamento: Centro Emovere (da confermare col consulente privacy). Fornitore AI per i testi: da decidere

## Prerequisiti per usare dati veri (regola fissa)
- Durante lo sviluppo: piani gratuiti di Supabase e Vercel, **solo dati di prova** (pseudonimi inventati)
- Prima di inserire dati reali, tutti obbligatori:
  1. Supabase Pro (backup giornalieri, protezione dalle password già rubate) e Vercel Pro (uso commerciale)
  2. DPA firmati (Supabase, OpenAI e l'eventuale fornitore dei testi)
  3. Parere del consulente privacy (informativa e consenso dei genitori, registro dei trattamenti, DPIA)
  4. Reset della password del database Supabase (quella attuale è stata condivisa in chat): **ancora da fare**. Dopo il reset aggiornare `DATABASE_URL` su Vercel (e Redeploy) e rifare `npx supabase link --project-ref vrlryycceswltabasogi`
  5. Il titolare attiva "Privacy verificata" (`organizations.privacy_verified_at`, solo ruolo `titolare`)
- Finché "Privacy verificata" non è attiva, la schermata Bambini mostra l'avviso "Solo dati di prova" (`TestDataWarning` in `src/components/ui.tsx`). Prima del login l'avviso è sempre visibile

## Login (Supabase Auth)
- Nessuna iscrizione libera: il primo utente (invitato dal pannello di Supabase) crea il centro ("Crea il centro", solo finché non esiste nessun centro: `app.setup_available()`), poi gli account arrivano solo su invito del titolare (Impostazioni → Membri del centro)
- MFA obbligatoria per tutti (TOTP con app di autenticazione): senza `aal2` né il middleware né `/api` restituiscono dati. Il titolare può azzerare il secondo fattore di un membro; quello del titolare si azzera dal pannello di Supabase
- Percorso (`src/lib/useAuth.ts`, schermate in `src/views/AuthViews.tsx`, cornice `src/AuthGate.tsx`): link dell'email → login → codice MFA → nuova password (dopo invito o reimposta) → attivazione MFA → centro → app
- Email (testi in `supabase/templates/`, da incollare in Authentication → Emails): i link portano a `/benvenuto?token_hash=…&type=invite` e `/reimposta-password?token_hash=…&type=recovery`, verificati dall'app con `verifyOtp` (funzionano anche aprendo l'email su un altro dispositivo). Mittente provvisorio: Gmail SMTP (`smtp.gmail.com:587`, `ale87.v@gmail.com`, password per le app), configurato direttamente in Supabase (Authentication → Emails → SMTP). I template non nominano il mittente
- Password: almeno 12 caratteri con maiuscole, minuscole e numeri (stesse regole su Supabase e in `passwordProblem`)
- Client in `src/lib/supabase.ts` (sessione in cookie con `@supabase/ssr`); chiamate a `/api` con il token in `src/lib/account.ts`. In locale il login è spento (l'app funziona come prima); per provarlo: `VITE_AUTH_DEV=1` con `vercel dev`
- Funzioni: `GET /api/me` (utente, centro, ruolo, privacy), `POST /api/setup` (primo centro, con la chiave dati cifrata), `/api/members` (elenco; invito, ruolo, rimozione, azzera MFA: solo titolare), `PATCH /api/organization` ("Privacy verificata", titolare del trattamento: solo titolare). Ogni modifica finisce in `audit_log`
- Server: `api/_lib/auth.ts` (`requireUser`, `adminAuth` con `SUPABASE_SECRET_KEY`), `api/_lib/db.ts` (`asUser`: transazione con `emovere_app` e `app.user_id`), `api/_lib/crypto.ts` (chiave doppia AES-256-GCM, contesto come AAD)
- Variabili su Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (pubbliche); `SUPABASE_SECRET_KEY`, `DATABASE_URL` (pooler, porta 6543), `DATA_ENCRYPTION_KEY` (32 byte base64, anche nel password manager: senza, i dati cifrati sono persi) come Sensitive. In locale `.env.local` contiene solo le due `VITE_`
- Collaudo delle funzioni: compilare in `.apitest` (vedi "Vignette con AI") e lanciare `node scripts/test-api.mjs` contro un PostgreSQL locale con stub e migrazioni (`TEST_DATABASE_URL`; istruzioni in testa al file; chiavi JWT generate dal test). Inviti e azzeramento MFA (API di amministrazione di Supabase) si provano solo online

## Dati dei bambini sul server (Fase 0, punti 3-4)
- `/api/children` (bambini, nome reale, profilo con `?resource=profile`, obiettivi con `?resource=goals`) e `/api/materials` (materiali, versioni, duplica, collegamento agli obiettivi): descrizione delle richieste in testa a ciascun file
- Cifratura dei campi: `api/_lib/keys.ts` (`sealerFor`: chiave del centro letta sotto RLS; contesto `{tabella}.{colonna}:{id}`), id delle righe generati dal server prima di cifrare
- Il contenuto di un materiale è lo `Sheet` senza `id`, `folderId`, `childName`, `notes`, `status`, `reminder` e date (colonne proprie); il nome sul PDF viene da `children.material_name_enc`
- Controllo di revisione: `materials.revision` cresce solo cambiando titolo o contenuto (trigger). Per modificarli serve `baseRevision`; se non coincide, 409 `{ conflict: true, current }`. Stato, promemoria, apertura, cestino non lo richiedono
- "Pronta" crea da sola una versione fissa; l'export ne chiede un'altra (`?action=version`, `reason: 'export'`)
- Eliminazioni: gli operatori usano il cestino (`trashed`); eliminazione definitiva di bambini, obiettivi e materiali solo del titolare
- `legacyId` in creazione rende l'importazione ripetibile senza doppioni (punto 5)
- Registro: letture del dettaglio di un bambino o di un suo materiale e tutte le modifiche finiscono in `audit_log` (solo id e nomi dei campi)
- Funzioni Vercel: oggi 11 file in `api/`. Il piano Hobby ha un limite al numero di funzioni per deploy: raggruppare per risorsa (`?resource=`, `?action=`) invece di creare un file per operazione
- Punto 4, l'app usa il server (`src/lib/useServerData.ts`, `src/lib/sync.ts`, conversioni in `src/lib/serverData.ts`):
  - L'app lavora ancora su `StoreData` con le operazioni pure di `store.ts`; il motore `ServerSync` confronta i dati con l'ultima versione salvata e manda solo le differenze (cartella → `/api/children`, scheda → `/api/materials`; eliminare = cestino). Gli id li genera l'app (`newId`), il server li accetta: un nuovo tentativo dopo una risposta persa non crea doppioni (409 → già creato)
  - Cartella = bambino: nome = pseudonimo, appunti cifrati (`children.notes_enc`), "Nome sulle schede" = `material_name` cifrato, uno per bambino: cambiandolo da una scheda cambia in tutte le sue schede (`store.setChildName`)
  - Il titolo si salva senza " di {nome}" (`sheetToServer`, flag `nameInTitle` nel contenuto); le copie mettono "(copia)" prima del nome (`copyTitle`), così il nome non finisce mai in chiaro nel titolo
  - Offline: "Non salvato, riprovo…" (editor e barra in alto), nuovo tentativo ogni 5 s e al ritorno della rete; le modifiche non salvate restano nel browser (`emovere.sync.v1:{centro}`) e alla riapertura si rimettono sopra i dati del server, con la revisione di allora
  - Mai "vince l'ultimo": conflitto di revisione → finestra obbligatoria "Tieni la mia" / "Usa quella salvata" / "Salva la mia come copia"; se la scheda non è aperta, avviso in alto con "Apri"
  - Niente più bozza unica: le schede senza bambino sono materiali generici sul server ("Schede senza bambino" in Bambini, "Metti in una cartella" nell'editor); `/scheda/bozza` porta a Oggi
  - Impostazioni del centro (logo, nome, stampatello) in `organizations.settings`: le cambia il titolare, valgono per tutti; copia nel browser come riserva
- Punto 5, importazione (`src/lib/importLocal.ts`, `src/components/ImportDialog.tsx`):
  - Se nel browser ci sono cartelle, schede o bozza della versione precedente, Oggi e Impostazioni propongono "Importa"; anche "Importa backup" (file) usa la stessa finestra e **aggiunge** al centro, non sostituisce
  - Per ogni cartella: pseudonimo, "È il nome vero del bambino" (allora serve un altro pseudonimo; il nome vero si conserva cifrato solo se importa il titolare), "Nome sulle schede" (proposto: il nome più usato nelle sue schede)
  - Cartelle e schede portano il loro id originale (`legacyId`): ripetere l'importazione non crea doppioni. La bozza diventa una scheda senza bambino. Le impostazioni passano al centro solo se importa il titolare e il centro non ne ha
  - Dopo l'importazione (`emovere.imported.v1`) i dati restano nel browser finché in Impostazioni non si sceglie "Elimina la copia da questo browser"
- Prima di ogni deploy che cambia lo schema: applicare le migrazioni (`npx supabase db push`), altrimenti le funzioni falliscono
- Collaudo in locale con il server di prova (`scripts/dev-api.mjs`): PostgreSQL locale con `supabase/tests/stub_supabase.sql` e le migrazioni nel database `DEV_DATABASE_URL` (predefinito `postgres://postgres@localhost:5432/emovere_dev`); `npm run dev:api` (funzioni vere, login simulato, titolare di prova) e in un altro terminale `npm run dev:server` (Vite in modo `devapi`, `/api` → porta 8787). Senza server, `npm run dev` mostra "Serve il server"

## Cestino, esportazione, registro, pulizia (Fase 0, punto 6)
- Cestino (`/cestino`, da Bambini → "Cestino", `src/views/TrashView.tsx`): bambini e materiali eliminati, con i giorni che restano (`trashDaysLeft`). Tutti i membri ripristinano; "Elimina per sempre" solo il titolare. Un materiale di un bambino nel cestino si ripristina solo dopo il bambino. Dopo un ripristino l'app ricarica i dati dal server
- Nella cartella del bambino il titolare ha "Dati del bambino" (`src/components/ChildDataActions.tsx`):
  - "Esporta i dati del bambino": `GET /api/children?id=…&export=1` (solo titolare, registrato come `esporta`) restituisce tutto decifrato, anche ciò che è nel cestino; l'app crea uno ZIP (`src/lib/childExport.ts`, ZIP senza compressione in `src/lib/zip.ts`) con `dati.json`, `LEGGIMI.txt`, il PDF WhatsApp di ogni scheda e delle guide con tutti i punti confermati. Nome `emovere-dati_{codice}_{data}.zip`, mai nomi
  - "Elimina bambino": eliminazione definitiva immediata (senza cestino), si conferma scrivendo il codice B-0001; nel registro resta solo l'id
- Registro degli accessi: Impostazioni → "Registro degli accessi" (solo titolare, `src/components/AuditLogDialog.tsx`), filtri per bambino, persona, azione; `GET /api/organization?resource=audit` (100 righe per volta, `before` per le precedenti)
- Pulizia notturna: Vercel Cron (`crons` in `vercel.json`, ogni notte alle 2 UTC) chiama `GET /api/organization?action=purge` con `Authorization: Bearer CRON_SECRET` (il middleware la lascia passare senza sessione né password, la funzione ricontrolla). Esegue `private.purge_deleted(30)` come ruolo del collegamento e scrive nel registro righe senza utente (`user_id` null, `details.automatico`) = "Pulizia automatica". Variabile su Vercel: `CRON_SECRET` (Sensitive, almeno 16 caratteri casuali); senza, la pulizia risponde 503

## Database (Supabase)
- Migrazioni in `supabase/migrations/` (versionate), configurazione CLI in `supabase/config.toml`. Si applicano con `npx supabase db push` dopo `npx supabase link --project-ref vrlryycceswltabasogi`. Pooler (per `DATABASE_URL`): `aws-0-eu-west-1.pooler.supabase.com`, utente `postgres.vrlryycceswltabasogi`; la password del database non va mai in chat né nel codice
- Tabelle nello schema `app`, **non esposto** dalla Data API: non aggiungerlo mai a `schemas` in `config.toml`. Funzioni di supporto e trigger nello schema `private`
- Le funzioni `/api` si collegano con `DATABASE_URL` e in ogni transazione fanno `set local role emovere_app` e `set_config('app.user_id', <utente verificato dal JWT>, true)`: la RLS vale anche per il server. `private.uid()` legge `app.user_id`
- Ruoli nel centro (`memberships.role`): `titolare` (nome reale, eliminazioni definitive, membri, impostazioni, "Privacy verificata", registro accessi) e `operatore` (bambini, profilo, obiettivi, materiali, osservazioni; elimina solo nel cestino)
- Tabelle: `organizations`, `memberships`, `children` (pseudonimo, codice B-0001 automatico), `child_identity` (nome reale, solo titolare), `child_profile_entries` (una riga per informazione, con `section` e `source`: osservato, genitori, scuola, ipotesi), `goals` + `goal_events`, `materials` + `material_versions` + `material_goals`, `templates` (`org_id` null = modelli di sistema), `observations` (dati registrati separati da note e interpretazioni), `ai_requests` (solo i nomi dei campi inviati), `audit_log`
- Colonne `*_enc`: solo testo cifrato nel formato `ev1:{versione chiave}:{IV}:{cifrato}` (dominio `app.encrypted_text`, il testo in chiaro viene rifiutato)
- `content` dei materiali e dei modelli non contiene `childName` né `notes` (vincolo `private.content_is_clean`); il titolo si salva senza il nome del bambino, che si aggiunge all'export
- Ogni riga ha `org_id`; le chiavi esterne composte impediscono collegamenti tra centri diversi o tra bambini diversi; `org_id` non cambia mai
- Storico, versioni e registri si possono solo aggiungere; cestino di 30 giorni (`deleted_at`, `private.purge_deleted()`)
- Collaudo: `bash scripts/test-db.sh` su un PostgreSQL locale (variabili `PGHOST`, `PGPORT`, `PGUSER`): database usa e getta con `supabase/tests/stub_supabase.sql`, migrazioni e `supabase/tests/rls_test.sql`. Ogni migrazione nuova va accompagnata dai suoi test

## Obiettivo di questa fase
Prototipo da far provare a Martina in 1-2 settimane per capire se vale la pena. Niente login, niente database: dati delle schede nel browser. Unica parte server: le funzioni Vercel per creare vignette con AI. Velocità e semplicità prima di tutto.

## Stack
- React + Vite + TypeScript, Tailwind CSS
- Immagini in `public/library/` (vedi sotto), catalogo in `src/data/catalog.json`
- Funzioni Vercel in `api/` (solo per le vignette AI, vedi "Vignette con AI"); vignette AI e indice su Vercel Blob privato
- Cartelle e schede sul server (Supabase, vedi "Dati dei bambini sul server"), con backup JSON esportabile; nel browser restano solo impostazioni di comodo e le modifiche in attesa di salvataggio
- Export PDF lato client: la scheda è un DOM in formato A4, esportato con `html-to-image` + `jsPDF`
- Deploy di prova su Vercel, protetto da password (vedi "Deploy")

## Libreria immagini
- Originali PNG in sottocartelle per personaggio: `public/library/scenes/{personaggio}/{CODICE}_{personaggio}.png`, es. `scenes/bambina/A01_bambina.png`, `scenes/bambino/A01_bambino.png`. Sono la fonte di verità e l'unica cosa da aggiungere a mano (insieme alla voce nel catalogo)
- File che non rispettano il formato del nome (es. `bambina_ref.png`, riferimenti del personaggio) vengono ignorati
- Generati da `scripts/build-images.mjs`, non versionati in git:
  - `public/library/webp/{personaggio}/{CODICE}_{personaggio}.webp`: dimensione piena, WebP qualità 90 (schermo e PDF WhatsApp)
  - `public/library/thumbs/{personaggio}/{CODICE}_{personaggio}.webp`: miniature 400 px (griglia della libreria)
- Lo script parte da solo prima di `npm run dev` e `npm run build` (`predev`/`prebuild`), a mano con `npm run images`; rigenera solo i file mancanti o più vecchi dell'originale
- I percorsi si costruiscono solo con `sceneImage` / `sceneThumb` in `src/lib/catalog.ts`
- Codice = blocco (A mattino, B igiene, C pasti, D scuola, E emozioni, F sera, G uscite, H regole) + numero scena
- Ogni scena esiste in due versioni (bambina, bambino) con stessa composizione
- Le vignette sono quadrate: il riquadro le dispone come quadrato (unità `cqw`/`cqh`), così angoli arrotondati e simboli seguono l'immagine
- `catalog.json`: una voce per scena con `code`, `block`, `title_f`, `title_m`, `setting`, `outfit`, `actions`, `objects`, `tags`, `characters`, `adults`
- I titoli sono in prima persona e al femminile/maschile in base al personaggio (`title_f` / `title_m`)

## Privacy (regola fissa)
- Nei campi con nomi (cartella, nome del bambino) e negli appunti compare sempre l'avviso: "Usa solo nome o iniziali. Non inserire diagnosi o dati clinici." (`PRIVACY_TEXT` / `PrivacyNote` in `src/components/ui.tsx`)
- Ogni nuovo campo di testo libero riferito a un bambino deve mostrare lo stesso avviso
- I dati dei bambini stanno sul server del centro (UE), con i campi sensibili cifrati; all'AI vanno solo i testi mostrati nell'anteprima, mai nomi. I nomi dei file .ics e di backup non contengono nomi di bambini

## Interfaccia (struttura da app)
- 5 sezioni, ognuna con il suo URL e un titolo in alto (`SectionHeader`): **Oggi** (`/oggi`, schermata iniziale), **Bambini** (`/bambini`, `/bambini/{id}`), **Crea** (`/crea`, `/crea?cartella={id}`), **Libreria** (`/libreria`), **Impostazioni** (`/impostazioni`). Editor: `/scheda/{id}`; guida: `/guida/{id}`
- Router senza librerie in `src/lib/router.ts` (History API): funzionano Indietro dell'app, del browser e il gesto su tablet/telefono; dopo una ricarica si resta sulla stessa schermata. `vercel.json` rimanda tutti gli URL (tranne `/api/`) a `index.html`
- Navigazione (`AppShell`): desktop ≥ 1024 px barra laterale fissa a sinistra; tablet e telefono barra fissa in basso. Icone + nomi, aree touch ≥ 44 px, badge su "Oggi" con promemoria + backup
- Oggi: "Da fare" (promemoria di oggi e scaduti + "Fai un backup"), schede "In lavorazione", ultime 6 schede aperte (`sheet.openedAt`)
- Bambini: cartelle in card con contatori per stato; dentro, schede raggruppate per stato e appunti della cartella
- Crea: galleria dei modelli con anteprima e descrizione; scelto il modello si sceglie la cartella (anche nuova) o "Senza bambino", poi si apre l'editor
- Libreria: ricerca e filtri in una barra fissa in alto; toccare una vignetta la aggiunge al primo riquadro vuoto dell'ultima scheda aperta
- Impostazioni: esporta/importa backup, data dell'ultimo backup, privacy, versione (da `package.json`, `__APP_VERSION__`)
- Editor a schermo intero (`src/components/Editor.tsx`, la navigazione si nasconde): barra in alto con Indietro/Fatto, titolo, stato del salvataggio, bambina/bambino, "Metti in una cartella" (schede senza bambino), menu Esporta (PDF stampa, PDF WhatsApp e, con il cerchietto, stelline); pannello opzioni a sinistra richiudibile (su telefono sale dal basso, con stato e personaggio); foglio al centro adattato allo schermo, zoom −/+/Adatta
- Stile: sfondo crema, card bianche con angoli arrotondati e ombra leggera, molto spazio. **Un solo colore di accento** (`--color-accent`, blu `#3f74b8`, e `accent-soft`) per pulsanti principali, voce attiva, badge e focus. I colori di stati e passaggi sono contenuto, non accento

## Vignette con AI
- Libreria → "Crea nuova vignetta con AI" (`src/components/AiCreateDialog.tsx`):
  1. scelte: personaggio principale (bambina/bambino), ambiente (14), abbigliamento (casa, pigiama, grembiule, uscita), espressione (serena, felice, triste, arrabbiata, spaventata, concentrata, orgogliosa), adulto facoltativo (mamma, papà, maestra: attivi solo se c'è il loro foglio di riferimento)
  2. descrizione in italiano di cosa fa il bambino (es. "si allaccia le scarpe da solo")
  3. "Genera": la versione bambina e la versione bambino vengono create in parallelo; anteprima con "Salva in libreria", "Rigenera", "Annulla"
  4. al salvataggio si confermano titoli (f/m) e tag proposti; il codice è `X` + progressivo (X001, X002…), mai riusato anche dopo un'eliminazione
- In libreria le vignette AI hanno l'etichetta "AI", il filtro "Create con AI" (blocco `X`) e si possono eliminare (con avviso se usate in qualche scheda)
- Server (`api/`, protetto dal login con secondo fattore, vedi "Login" e "Deploy"):
  - `GET /api/generate`: limite, immagini usate oggi, adulti disponibili. `POST /api/generate`: (a) modello di testo economico → frase d'azione in inglese + `title_f`, `title_m`, tag in italiano (JSON a schema fisso); (b) endpoint di modifica immagini, una chiamata per personaggio con il suo foglio di riferimento (+ adulto), qualità media, 1024×1024, WebP
  - Il prompt dell'immagine lo compone solo il server con il template fisso (`buildImagePrompt` in `src/config/ai.ts`); il testo dell'utente non entra mai nel prompt dell'immagine. Rispetto al template base ci sono due righe in più: espressione e, se scelto, adulto
  - Testi fissi di ambienti, abbigliamenti e adulti presi dalla "Libreria prompt scene – Emovere", in `src/config/ai.ts` (lo stesso file definisce modelli, qualità, formato, limite predefinito)
  - Modelli (verificati sulla documentazione OpenAI a ottobre 2026): immagini `gpt-image-2.5-sunburst`, testo `gpt-6-luna`. Si cambiano in `AI_MODELS`
  - Limite di immagini per giorno o per mese (ogni vignetta ne usa 2), configurabile senza toccare il codice con `AI_LIMIT` e `AI_LIMIT_PERIOD`; si azzera a mezzanotte italiana o il primo del mese; messaggio chiaro quando è raggiunto. Prototipo: 100 al giorno. Senza variabili: 30 al giorno
  - `GET/POST/DELETE /api/library`: elenco, salvataggio, eliminazione. `GET /api/image?p=…`: serve le immagini dal Blob privato (stesso dominio: niente CORS per l'export PDF, dietro password)
  - Blob privato (store `emovere-studio-ai`, regione fra1): `bambina/X001_bambina.webp`, `bambino/X001_bambino.webp`, `index.json` (voci della libreria AI, unite a `catalog.json` dall'app con `setAiScenes`), `usage.json` (contatore del periodo)
- Fogli di riferimento in `public/library/refs/`: `bambina_ref.png`, `bambino_ref.png`; gli adulti si aggiungono come `mamma_ref.png`, `papa_ref.png`, `maestra_ref.png` (inclusi nella funzione con `includeFiles` in `vercel.json`)
- In locale (`npm run dev`) le funzioni non girano: la finestra AI dice che funziona solo online. Collaudo delle funzioni: compilare con `tsc -p tsconfig.api.json --noEmit false --outDir .apitest --rootDir .` e simulare OpenAI/Blob (cartella `.apitest` ignorata da git)
- Variabili d'ambiente su Vercel:
  - `OPENAI_API_KEY`: chiave OpenAI, **solo** su Vercel (mai nel codice, nel browser o in chat)
  - `BLOB_READ_WRITE_TOKEN`: creata da Vercel collegando uno store Blob al progetto (o OIDC con `BLOB_STORE_ID`)
  - `AI_LIMIT`: immagini per periodo (prototipo: 100; senza variabile: 30)
  - `AI_LIMIT_PERIOD`: `giorno` o `mese` (senza variabile: `giorno`)
  - `AI_TEXT_LIMIT`: guide (e punti rigenerati) per centro al giorno (senza variabile: 40)
  - Le modifiche alle variabili valgono dal deploy successivo (Redeploy)
  - `APP_PASSWORD`: la password dell'app (vedi "Deploy")
  - `CRON_SECRET`: segreto della pulizia notturna del cestino (vedi "Cestino, esportazione, registro, pulizia")

## Guida per genitori e scuola
- Crea → "Guide per genitori e scuola" (`src/components/GuidesSection.tsx`): nuova guida ed elenco; editor a schermo intero `/guida/{id}` (`src/views/GuideEditor.tsx`). Serve il login: le guide stanno sul server come materiali generici di tipo `guida` (`src/lib/guide.ts`)
- L'utente scrive difficoltà osservata, obiettivo, situazioni (facoltativo), fascia d'età (3-5, 6-8) e linguaggio per la famiglia; ogni campo ha l'avviso privacy. "Cosa viene inviato all'AI" mostra esattamente il testo della richiesta (`guideRequestText`)
- Dati identificativi: l'app blocca l'invio se trova email, telefono, codice fiscale, date, indirizzi o i nomi delle cartelle e delle schede del browser; il server ripete i controlli sui formati e sui pseudonimi e nomi sui materiali dei bambini del centro (`identifyingProblems` in `src/config/guide.ts`)
- `/api/guide`: proposta completa (versione famiglia e scuola, 10 punti della specifica, sezione 10) o un solo punto ("Rigenera questo punto"). Regole fisse del testo in `GUIDE_INSTRUCTIONS` (bozza, ipotesi sempre "da verificare", niente diagnosi, farmaci o punizioni, linguaggio positivo). Modello `AI_MODELS.guide` (`gpt-6.1-sol`, ragionamento `low`), `store: false`. Ogni chiamata in `ai_requests` (solo nomi dei campi, token, costo stimato). Limite per centro al giorno: `AI_TEXT_LIMIT` (predefinito 40)
- Ogni punto è "Da rivedere" finché non si preme "Confermo"; modificare un punto confermato lo riporta "Da rivedere". Il PDF (A4 verticale, versione famiglia, scuola o entrambe, punti distribuiti sulle pagine misurandone l'altezza: `src/lib/exportGuide.tsx`) si crea solo con tutti i punti della versione scelta scritti e confermati; ogni export salva una versione fissa
- Salvataggio: `useAutosave` (vedi "Salvataggio sul server")

## Salvataggio sul server (`src/lib/useAutosave.ts`)
- Ogni modifica si salva da sola dopo 0,8 s con la revisione di partenza (`materialsApi.save`)
- Senza rete o con il server giù: "Non salvato, riprovo…", nuovo tentativo ogni 5 s e al ritorno della rete; le modifiche restano nel browser (`emovere.pending.v1`) anche dopo una ricarica e si salvano alla riapertura
- Revisione cambiata altrove (409): finestra obbligatoria con "Tieni la mia", "Usa quella salvata", "Salva la mia come copia" (nuovo materiale, la versione salvata altrove resta intatta)

## Costi AI e versione in vendita (piano, non ancora fatto)
- Costo: il listino OpenAI per `gpt-image-2.5` è a token (immagini in uscita $30/M, in ingresso $8/M) senza prezzo per immagine; stima 5-10 centesimi per immagine, 10-25 per vignetta (2 immagini + testo, che costa quasi nulla). Il costo reale si legge nella pagina Usage di OpenAI
- Oggi il limite è unico per tutta l'app (un solo account, protetto da password)
- Per la vendita servono prima login e account (fase successiva). Poi: piani con una quota di immagini al mese (es. Base / Pro), contatore per account invece che globale, quota mostrata nell'app, avviso all'80%, eventuale acquisto di pacchetti extra; il limite globale resta come tetto di sicurezza sulla spesa totale
- Email: prima della vendita sostituire il Gmail personale con un dominio del prodotto (mittente tipo `noreply@…`, SPF/DKIM/DMARC) e un servizio SMTP dedicato con DPA (es. Brevo, Postmark); Gmail ha limiti di invio bassi ed è un account personale
- Il codice è già predisposto: quantità e periodo stanno nelle variabili d'ambiente, il contatore è in `api/_lib/storage.ts` (`usedInPeriod`/`addUsage`) e basterà renderlo per account

## Funzioni del prototipo
1. **Libreria**: griglia di vignette, ricerca testuale su titolo e tag (case-insensitive, senza accenti), filtri per blocco, ambiente e personaggio.
2. **Composer scheda**:
   - Template disponibili, definiti in `templates` (`src/lib/sheet.ts`) con `orientation` (verticale/orizzontale), `layout` (`grid`, `stack`, `sequence`, `agenda`) e `defaultText` (frase iniziale = titolo della scena, o vuota):
     - A4 verticale: Routine 4 (2×2, sequenze brevi), Routine 6 (2 colonne × 3 righe: in 3 × 2 le vignette verrebbero troppo piccole), Routine 9 (3×3), Routine 12 (3×4), Prima/Poi (2 riquadri uno sotto l'altro con freccia ↓), Scelte 2 e 3 (in colonna) e 4 (2×2)
     - A4 orizzontale: Prima – Adesso – Dopo (3 riquadri affiancati con frecce, etichette PRIMA/ADESSO/DOPO, ADESSO con bordo più spesso), Ora – Poi (2 riquadri affiancati, ORA con bordo più spesso) e Agenda della settimana (vedi sotto)
     - Checklist (A4 verticale, layout `checklist`): righe con numero, vignetta piccola, frase e casella da spuntare; da 3 a 10 righe (`sheet.checklist.rows`), si conservano sempre 10 riquadri
     - Previsti: Storia sociale (4, 6)
   - "Ricordo sempre" solo nei modelli verticali
   - Sequenze (`sheet.sequence`, distribuite con `SheetLook`): "Numeri dei passaggi" sì/no (modelli numerati e checklist; senza numeri la colonna a sinistra resta solo per un orario già scritto) e "Mostra": Immagini e testo, Solo immagini, Solo testo (la frase grande al posto della vignetta). Valgono a schermo, nel PDF e nelle carte. Non nell'Agenda
   - Orario per riquadro solo nelle routine (`template.times`)
   - Cerchietto della stellina: non nella checklist (c'è la casella) né in "Solo testo" (`usesDoneCircle`)
   - Il modello si sceglie alla creazione e si può cambiare nel composer (conferma se si perdono vignette)
   - Titolo e sottotitolo modificabili
   - Click su un riquadro vuoto → si apre la libreria → la vignetta scelta entra nel riquadro
   - Sotto ogni vignetta: frase modificabile (default = titolo della scena per il personaggio scelto)
   - Numero grande nel riquadro (routine), orario opzionale per riquadro. "Orario come" per scheda: Analogico, Digitale, Entrambi (default). Analogico = orologio SVG con numeri 12-3-6-9 e lancette posizionate correttamente (7:45 → ore tra 7 e 8), sotto il numero, anche nel PDF. Orari riconosciuti: "7:45", "7.45", "7"
   - Stampatello maiuscolo per scheda (titolo, sottotitolo, frasi, Ricordo sempre), solo visualizzazione con `text-transform`: il testo salvato non cambia. Il valore iniziale delle nuove schede si sceglie in Impostazioni
   - Riordino riquadri con drag and drop (su touch: tieni premuto e trascina)
   - Comandi del riquadro pieno (Cambia, Simbolo, Svuota): su desktop compaiono con l'hover; su schermi touch (`pointer: coarse`) un tocco seleziona il riquadro e mostra la barra con pulsanti più grandi, un tocco fuori la chiude. I pulsanti nascosti non sono mai cliccabili (`pointer-events: none`)
   - Riquadro finale opzionale "Ricordo sempre" con 3 frasi modificabili
   - Simboli SVG sopra la vignetta (V verde, X rossa, divieto), in uno dei 4 angoli, visibili anche nel PDF (`SymbolIcon`)
   - Nome del bambino (facoltativo) inserito nel titolo: "La mia mattina" + Sofia → "La mattina di Sofia", altri titoli → "… di Sofia". Se la scheda è in una cartella, il nome della cartella viene proposto in automatico (nuova scheda, salvataggio, duplica/sposta se il nome era quello della cartella di partenza)
3. **Cambio personaggio**: un interruttore bambina/bambino sostituisce tutte le vignette della scheda con la versione dell'altro personaggio (stesso codice) e aggiorna le frasi di default.
4. **Cartelle e schede**:
   - Una cartella per bambino (solo nome o iniziali): crea, rinomina, elimina (elimina anche le sue schede), appunti
   - Schermata principale: elenco cartelle con contatori per stato; dentro la cartella, schede raggruppate per stato
   - Schede: si salvano da sole sul server (anche quelle senza bambino), apri, duplica (anche in un'altra cartella), sposta, elimina (cestino), appunti
   - Stato: Da fare, In lavorazione, Pronta, Stampata/Consegnata. Nella cartella un clic sull'etichetta apre un menu con i 4 stati; nel composer si sceglie direttamente
   - Promemoria: una data e un tipo (Creare, Stampare, Consegnare, Rivedere) per scheda. Quelli di oggi e scaduti non fatti compaiono in "Da fare" nella sezione Oggi (schermata iniziale), con badge sulla voce "Oggi". "Aggiungi al calendario" scarica un .ics (evento di un giorno, avviso alle 9)
   - Backup: "Esporta tutto" (JSON con cartelle e schede) e "Importa backup" (aggiunge al centro senza doppioni, vedi punto 5). La data dell'ultimo export è in localStorage (`emovere.lastBackup.v1`): se ci sono schede salvate e il backup manca o ha più di 7 giorni, "Da fare" (sezione Oggi) mostra "Fai un backup" con il pulsante diretto (conta nel badge)
   - Dopo il PDF di una scheda senza bambino si propone di metterla in una cartella ("No, grazie" non la ripropone per quella scheda)
   - Navigazione: vedi "Interfaccia"
   - Dati in `src/lib/store.ts` (operazioni pure `StoreData → StoreData`); le schede salvate con versioni precedenti vengono completate da `normalizeSheet`
5. **Export**: "PDF stampa" (A4, 300 dpi, margini 10 mm, pronto da plastificare) e "PDF WhatsApp" (immagini compresse, file leggero).

## Schede pronte
- `src/data/presets.json`: `id`, `titolo`, `sottotitolo`, `template`, `scene` (codici in ordine), `opzioni` (es. `uppercase`, `doneCircle`, `timeMode`, `coloring`)
- In Crea, sezione "Pronte da usare" sopra i modelli vuoti; al clic si scelgono personaggio e cartella (o senza bambino) e si apre l'editor già compilato
- I titoli con "o/a" si adattano al personaggio ("Pronto/a" → "Pronta"/"Pronto"); con la cartella si aggiunge il nome ("… di Luca")
- Le schede pronte con codici non presenti nel catalogo (o modello inesistente) non vengono mostrate

## Agenda della settimana
- A4 orizzontale: colonne Lun–Dom (opzione "Solo Lun–Ven"), righe = momenti della giornata da 1 a 4 (default 3: Mattina, Pomeriggio, Sera; la quarta è Notte), nomi modificabili sul foglio
- Si conservano sempre 7 × 4 riquadri (`agendaIndex(riga, giorno)`): cambiando giorni o righe le vignette nascoste restano salvate
- Ogni cella: vignetta dalla libreria e frase breve facoltativa (parte vuota); le celle vuote restano bianche per scrivere a mano
- Trascinando, due celle si scambiano di posto (gli altri giorni non scorrono). "→ Domani" copia una cella nel giorno dopo; la freccia nell'intestazione del giorno copia l'intera colonna (con conferma se sovrascrive)

## Logo e nome del centro
- Impostazioni (`src/lib/settings.ts`; sul server in `organizations.settings`, le cambia il titolare; copia in localStorage `emovere.settings.v1`): logo PNG/JPG/SVG ridotto a max 600 px e salvato come PNG, nome del centro, stampatello predefinito. Inclusi in "Esporta tutto" e "Importa backup" (campo `settings`; i backup più vecchi senza impostazioni le lasciano come sono)
- Per scheda "Mostra logo" (`showLogo`, null = automatico: sì se c'è un logo): piè di pagina sottile nel margine inferiore (logo piccolo + nome, a sinistra), non toglie spazio alle vignette; presente anche nelle pagine di stelline e carte

## Aspetto della pagina
- `SheetLook` (`src/lib/look.ts`) raccoglie stampatello, orario, versione da colorare, piè di pagina e immagini; è passato esplicitamente all'export (che disegna fuori dall'app) e distribuito ai componenti con `SheetLookContext`

## Carte da ritagliare
- Menu Esporta → "Carte da ritagliare…": le vignette della scheda (in ordine, con la frase o il titolo della scena) come carte singole su A4 verticale, bordo arrotondato sottile e linee di taglio tratteggiate; rispettano stampatello e versione da colorare
- Misure: piccola 5 cm (12 per pagina), media 7 cm (6, default), grande 9 cm (4); oltre, il PDF continua sulle pagine successive (`src/components/Cards.tsx`)
- "Aggiungi striscia agenda": caselle vuote della stessa misura delle carte (una per carta, numerate), in colonna, e in fondo "FINITO" più grande, per agende con velcro
- Stampa o WhatsApp. Nome file `{titolo}_carte.pdf` (WhatsApp `{titolo}_carte_whatsapp.pdf`)
- Rispettano "Mostra": solo vignetta, solo frase (grande, al centro della carta) o entrambe

## Versione da riordinare
- Menu Esporta → "Versione da riordinare…" per le sequenze (modelli numerati, Prima/Poi, Ora – Poi, Prima – Adesso – Dopo: `canReorder`)
- Pagina 1: la scheda con i riquadri vuoti (restano numeri, etichette, orari) e un quadrato tratteggiato dove attaccare la carta (`SheetLook.slots`); poi le carte in ordine mescolato (`shuffled`, mai uguale all'ordine giusto), nella misura scelta
- Nome file `{titolo}_riordino.pdf` (WhatsApp `{titolo}_riordino_whatsapp.pdf`)

## Versione da colorare
- Interruttore per scheda (`coloring`) nell'editor e nel menu Esporta: scheda, PDF e carte usano le vignette a contorno; numeri, cornici, etichette, simboli, cerchietto, frecce e Ricordo sempre diventano in bianco e nero (risparmio di inchiostro)
- Le versioni si generano una sola volta per vignetta e personaggio e si riusano: Blob privato `coloring/{CODICE}_{personaggio}_colorare.png`, servite da `/api/image`
- `/api/coloring` (stessa password e stesse variabili delle funzioni AI): `GET` elenco, `POST { code, character, image? }` → endpoint di modifica immagini con il prompt fisso `COLORING_PROMPT` (`src/config/ai.ts`), PNG. Per il catalogo disegnato l'app invia la vignetta WebP; per le vignette AI il server la legge dal Blob. Ogni immagine conta nel limite
- Editor: se mancano versioni per la scheda (personaggio attuale) compare l'avviso con "Genera quelle mancanti (N immagini)", due alla volta con avanzamento; finché mancano, quelle vignette restano a colori
- Libreria: per le vignette AI, "Crea versione da colorare (2 immagini)" (bambina e bambino)
- `npm run coloring` (`scripts/coloring.mjs`): genera le versioni mancanti di tutto il catalogo dai PNG originali, dopo una conferma con numero di immagini e costo stimato (`--yes` per saltarla). Variabili: `OPENAI_API_KEY` (impostarla a mano: su Vercel è "Sensitive") e `BLOB_READ_WRITE_TOKEN` (`npx vercel env pull --environment=production .env.local`). Non conta nel limite dell'app

## Stellina "fatto" (cerchietto per il velcro)
- Interruttore "Cerchietto per la stellina" su tutte le schede (`sheet.doneCircle`): un cerchietto tratteggiato da 2 cm sull'angolo in alto a destra di ogni vignetta piena, dove si incolla un dischetto di velcro e il bambino attacca la stellina quando ha fatto l'azione
- Misure in `src/lib/stars.ts` (diametro `CIRCLE` = 20 mm, adatto ai dischetti di velcro comuni 19-22 mm); disegno in `src/components/Stars.tsx`
- Con il cerchietto l'angolo in alto a destra non è disponibile per i simboli: un simbolo già messo lì viene mostrato in alto a sinistra
- Stelline da ritagliare: A4 verticale, stelle gialle in dischetti da 2 cm (come il cerchietto) con linea di taglio tratteggiata. "Aggiungi stelline da ritagliare al PDF" → pagina 2 del PDF della scheda; "Stelline · stampa" / "Stelline · WhatsApp" → PDF con solo quella pagina
- La "Tabella a gettoni" (righe di caselle in A4 orizzontale) è stata tolta: non era quello che serviva. Le schede salvate con quel modello vengono aperte come Routine 12, con vignette e frasi

## Export PDF
- Scelta accettata: il PDF contiene la pagina come un'unica immagine ad alta risoluzione. Il testo è disegnato in Atkinson Hyperlegible ma non è selezionabile né ricercabile
- La pagina esportata è `PrintSheetView`: stesso impaginato di `SheetView` (componente comune `SheetPage`), senza campi, pulsanti, segnaposto e orari vuoti
- PDF stampa: 300 dpi, PNG originali, immagine della pagina in PNG senza perdita
- PDF WhatsApp: 150 dpi, WebP, pagina in JPEG; la qualità scende finché il file resta sotto 2 MB
- Nome file: titolo senza accenti, spazi → trattini, + personaggio; WhatsApp aggiunge `_whatsapp`. Es. `La-mia-mattina_bambina.pdf`, `La-mia-mattina_bambina_whatsapp.pdf`. Solo stelline: `{titolo}_stelline.pdf` (WhatsApp `{titolo}_stelline_whatsapp.pdf`)
- Un PDF può avere più pagine con orientamento diverso (scheda orizzontale + stelline verticali, carte su più pagine); ogni pagina è un'immagine a 300 dpi (stampa) o 150 dpi (WhatsApp, limite 2 MB sul file intero)

## Deploy
- Vercel, configurazione in `vercel.json`; la build genera le immagini con `sharp`
- Protezione: `middleware.ts` (Vercel Routing Middleware). `/library/*` e `/api/*` richiedono una sessione Supabase valida con secondo fattore (`aal2`), letta dal cookie di `@supabase/ssr` o da `Authorization: Bearer` (`api/_lib/session.ts`, firma verificata con le chiavi pubbliche JWKS del progetto). La pagina dell'app (`index.html`, `/assets`) è pubblica: mostra il login
- Password unica facoltativa: se `APP_PASSWORD` è impostata su Vercel resta una barriera in più davanti a tutto il sito (cookie HttpOnly di un anno, decade cambiando la password); cancellando la variabile si toglie
- In locale (`npm run dev`) il middleware non gira

## Design
- Calmo, pochi elementi, angoli arrotondati, colori pastello coerenti con le illustrazioni
- Font molto leggibile per i bambini: Atkinson Hyperlegible o Lexend
- Numeri dei passaggi grandi e colorati, ordine sempre da sinistra a destra e dall'alto in basso
- Interfaccia in italiano

## Fuori da questa fase
Login e multiutente, database e sincronizzazione delle schede tra dispositivi, abbonamenti, guide per i genitori: arriveranno dopo la validazione con Martina.

## Convenzioni
- Componenti piccoli e tipizzati, niente librerie superflue
- Il catalogo è la fonte di verità: nessun testo di scena scritto a mano nei componenti
