# Emovere Studio – prototipo

Strumento per comporre schede visive (routine, storie sociali, prima/poi, scelte) per bambini 3-8 anni con autismo, ADHD e DOP, partendo da una libreria di vignette illustrate. Utente iniziale: Martina (psicopedagogista, Centro Emovere). Obiettivo commerciale futuro: vendita ad altri professionisti.

## Obiettivo di questa fase
Prototipo da far provare a Martina in 1-2 settimane per capire se vale la pena. Niente login, niente backend, niente generazione AI. Velocità e semplicità prima di tutto.

## Stack
- React + Vite + TypeScript, Tailwind CSS
- Nessun backend: immagini in `public/library/` (vedi sotto), catalogo in `src/data/catalog.json`
- Cartelle, schede e bozza in localStorage (solo per il prototipo), con backup JSON esportabile
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
- Nessun dato lascia il browser, tranne i file che l'utente scarica (PDF, .ics, backup). I nomi dei file .ics e di backup non contengono nomi di bambini

## Funzioni del prototipo
1. **Libreria**: griglia di vignette, ricerca testuale su titolo e tag (case-insensitive, senza accenti), filtri per blocco, ambiente e personaggio.
2. **Composer scheda**:
   - Template disponibili: Routine 6 (2 colonne × 3 righe: in 3 × 2 su A4 verticale le vignette verrebbero troppo piccole), Routine 9 (3×3), Routine 12 (3×4), Prima/Poi (2 riquadri grandi uno sotto l'altro con freccia ↓), Scelte 2 e 3 (in colonna) e 4 (2×2), Tabella a gettoni (A4 orizzontale, vedi sotto). Previsti: Storia sociale (4, 6). Definiti in `templates` (`src/lib/sheet.ts`): `kind` (`grid` o `tokens`) e `orientation` (`portrait` o `landscape`); composer ed export usano l'orientamento del modello
   - Il modello si sceglie alla creazione e si può cambiare nel composer (conferma se si perdono vignette)
   - Titolo e sottotitolo modificabili
   - Click su un riquadro vuoto → si apre la libreria → la vignetta scelta entra nel riquadro
   - Sotto ogni vignetta: frase modificabile (default = titolo della scena per il personaggio scelto)
   - Numero grande nel riquadro (routine), orario opzionale per riquadro
   - Riordino riquadri con drag and drop (su touch: tieni premuto e trascina)
   - Comandi del riquadro pieno (Cambia, Simbolo, Svuota): su desktop compaiono con l'hover; su schermi touch (`pointer: coarse`) un tocco seleziona il riquadro e mostra la barra con pulsanti più grandi, un tocco fuori la chiude. I pulsanti nascosti non sono mai cliccabili (`pointer-events: none`)
   - Riquadro finale opzionale "Ricordo sempre" con 3 frasi modificabili
   - Simboli SVG sopra la vignetta (V verde, X rossa, divieto), in uno dei 4 angoli, visibili anche nel PDF (`SymbolIcon`)
   - Nome del bambino (facoltativo) inserito nel titolo: "La mia mattina" + Sofia → "La mattina di Sofia", altri titoli → "… di Sofia". Se la scheda è in una cartella, il nome della cartella viene proposto in automatico (nuova scheda, salvataggio, duplica/sposta se il nome era quello della cartella di partenza)
3. **Cambio personaggio**: un interruttore bambina/bambino sostituisce tutte le vignette della scheda con la versione dell'altro personaggio (stesso codice) e aggiorna le frasi di default.
4. **Cartelle e schede**:
   - Una cartella per bambino (solo nome o iniziali): crea, rinomina, elimina (elimina anche le sue schede), appunti
   - Schermata principale: elenco cartelle con contatori per stato; dentro la cartella, schede raggruppate per stato
   - Schede: salva (una scheda nuova è una bozza finché non la si salva in una cartella; dopo, le modifiche si salvano da sole), apri, duplica (anche in un'altra cartella), sposta, elimina, appunti
   - Stato: Da fare, In lavorazione, Pronta, Stampata/Consegnata. Nella cartella un clic sull'etichetta apre un menu con i 4 stati; nel composer si sceglie direttamente
   - Promemoria: una data e un tipo (Creare, Stampare, Consegnare, Rivedere) per scheda. All'apertura, se ci sono promemoria di oggi o scaduti non fatti, si apre il pannello "Da fare"; il menu mostra un badge con il numero. "Aggiungi al calendario" scarica un .ics (evento di un giorno, avviso alle 9)
   - Backup: "Esporta tutto" (JSON con cartelle e schede, non la bozza) e "Importa backup" (sostituisce tutto, dopo conferma). La data dell'ultimo export è in localStorage (`emovere.lastBackup.v1`): se ci sono schede salvate e il backup manca o ha più di 7 giorni, il pannello "Da fare" mostra "Fai un backup" con il pulsante diretto (conta nel badge)
   - Dopo il PDF di una bozza non salvata si propone di salvarla in una cartella ("No, grazie" non la ripropone per quella bozza)
   - Navigazione: tasti "Home" (cartelle) e "← Indietro" nell'intestazione, anche il logo porta alla home. Le schermate sono voci della cronologia del browser, quindi funzionano anche il tasto indietro del browser e il gesto indietro su tablet/telefono; dopo una ricarica si resta sulla stessa schermata
   - Dati in `src/lib/store.ts` (operazioni pure `StoreData → StoreData`); le schede salvate con versioni precedenti vengono completate da `normalizeSheet`
5. **Export**: "PDF stampa" (A4, 300 dpi, margini 10 mm, pronto da plastificare) e "PDF WhatsApp" (immagini compresse, file leggero).

## Tabella a gettoni
- A4 orizzontale. Titolo e sottotitolo in alto (default "Le mie stelline", con il nome "Le stelline di {nome}")
- Righe (da 1 a 6, iniziali 3): titolo del compito sopra la riga (default = titolo della scena), vignetta a sinistra (dalla libreria, con simboli), caselle per le stelline. Ogni riga è un `Cell` di `sheet.cells`, con `tokens: { mode, count }`
- Modalità per riga: Conteggio (da 3 a 10 caselle, default 5) o Settimana (7 caselle Lun…Dom)
- Caselle quadrate da 2,5 cm (mai meno: ci si attacca una stellina vera), angoli arrotondati, contorno tenue di una stella
- Riquadro "Premio" a destra su tutta l'altezza: testo modificabile (default "Quando completo le stelline…") e vignetta facoltativa (`sheet.reward`)
- Spazio: con caselle da 2,5 cm stanno al massimo 7 caselle per fila; da 8 a 10 vanno su due file (riga alta il doppio, vignetta più grande). In altezza stanno al massimo 5 righe da una fila. "Aggiungi riga", "+ casella" e "Settimana" si disattivano quando la pagina è piena, con un messaggio. Misure e calcolo in `src/lib/tokens.ts`: sono le stesse usate per disegnare la pagina
- Stelline da ritagliare: A4 verticale, griglia di stelle gialle piene in quadrati da 2,5 cm (come le caselle) con linee di taglio tratteggiate. Casella "Aggiungi stelline da ritagliare" → pagina 2 del PDF della scheda; "Stelline · stampa" / "Stelline · WhatsApp" → PDF con solo quella pagina
- Su tablet valgono le stesse regole touch degli altri modelli (tocco sulla vignetta piena per i comandi)

## Export PDF
- Scelta accettata: il PDF contiene la pagina come un'unica immagine ad alta risoluzione. Il testo è disegnato in Atkinson Hyperlegible ma non è selezionabile né ricercabile
- La pagina esportata è `PrintSheetView`: stesso impaginato di `SheetView` (componente comune `SheetPage`), senza campi, pulsanti, segnaposto e orari vuoti
- PDF stampa: 300 dpi, PNG originali, immagine della pagina in PNG senza perdita
- PDF WhatsApp: 150 dpi, WebP, pagina in JPEG; la qualità scende finché il file resta sotto 2 MB
- Nome file: titolo senza accenti, spazi → trattini, + personaggio; WhatsApp aggiunge `_whatsapp`. Es. `La-mia-mattina_bambina.pdf`, `La-mia-mattina_bambina_whatsapp.pdf`. Solo stelline: `{titolo}_stelline.pdf` (WhatsApp `{titolo}_stelline_whatsapp.pdf`)
- Un PDF può avere più pagine con orientamento diverso (tabella a gettoni orizzontale + stelline verticale); ogni pagina è un'immagine a 300 dpi (stampa) o 150 dpi (WhatsApp, limite 2 MB sul file intero)

## Deploy
- Vercel, configurazione in `vercel.json`; la build genera le immagini con `sharp`
- Protezione: `middleware.ts` (Vercel Routing Middleware) mostra una schermata con password prima di qualunque pagina o immagine
- Password nella variabile d'ambiente `APP_PASSWORD` (su Vercel, mai nel codice); senza variabile il sito resta chiuso
- Dopo l'accesso un cookie HttpOnly ricorda il browser per un anno; cambiando la password tutti i cookie vecchi decadono
- In locale (`npm run dev`) il middleware non gira

## Design
- Calmo, pochi elementi, angoli arrotondati, colori pastello coerenti con le illustrazioni
- Font molto leggibile per i bambini: Atkinson Hyperlegible o Lexend
- Numeri dei passaggi grandi e colorati, ordine sempre da sinistra a destra e dall'alto in basso
- Interfaccia in italiano

## Fuori da questa fase
Login e multiutente, backend e database, sincronizzazione tra dispositivi, generazione AI delle immagini, abbonamenti, guide per i genitori: arriveranno dopo la validazione con Martina.

## Convenzioni
- Componenti piccoli e tipizzati, niente librerie superflue
- Il catalogo è la fonte di verità: nessun testo di scena scritto a mano nei componenti
