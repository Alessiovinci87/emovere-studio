# Emovere Studio – prototipo

Strumento per comporre schede visive (routine, storie sociali, prima/poi, scelte) per bambini 3-8 anni con autismo, ADHD e DOP, partendo da una libreria di vignette illustrate. Utente iniziale: Martina (psicopedagogista, Centro Emovere). Obiettivo commerciale futuro: vendita ad altri professionisti.

## Obiettivo di questa fase
Prototipo da far provare a Martina in 1-2 settimane per capire se vale la pena. Niente login, niente backend, niente generazione AI. Velocità e semplicità prima di tutto.

## Stack
- React + Vite + TypeScript, Tailwind CSS
- Nessun backend: immagini in `public/library/scenes/`, catalogo in `src/data/catalog.json`
- Salvataggio schede in localStorage (solo per il prototipo)
- Export PDF lato client: la scheda è un DOM in formato A4, esportato con `html-to-image` + `jsPDF`
- Deploy di prova su Vercel

## Libreria immagini
- Nome file: `{CODICE}_{personaggio}.png`, es. `A01_bambina.png`, `A01_bambino.png`
- Codice = blocco (A mattino, B igiene, C pasti, D scuola, E emozioni, F sera, G uscite, H regole) + numero scena
- Ogni scena esiste in due versioni (bambina, bambino) con stessa composizione
- `catalog.json`: una voce per scena con `code`, `block`, `title_f`, `title_m`, `setting`, `outfit`, `actions`, `objects`, `tags`, `characters`, `adults`
- I titoli sono in prima persona e al femminile/maschile in base al personaggio (`title_f` / `title_m`)

## Funzioni del prototipo
1. **Libreria**: griglia di vignette, ricerca testuale su titolo e tag (case-insensitive, senza accenti), filtri per blocco, ambiente e personaggio.
2. **Composer scheda**:
   - Template: Routine (6, 9, 12 riquadri), Storia sociale (4, 6), Prima/Poi (2), Scelte (2, 3, 4)
   - Titolo e sottotitolo modificabili
   - Click su un riquadro vuoto → si apre la libreria → la vignetta scelta entra nel riquadro
   - Sotto ogni vignetta: frase modificabile (default = titolo della scena per il personaggio scelto)
   - Numero grande nel riquadro (routine), orario opzionale per riquadro
   - Riordino riquadri con drag and drop
   - Riquadro finale opzionale "Ricordo sempre" con 3 frasi modificabili
3. **Cambio personaggio**: un interruttore bambina/bambino sostituisce tutte le vignette della scheda con la versione dell'altro personaggio (stesso codice) e aggiorna le frasi di default.
4. **Schede salvate**: salva, apri, duplica, elimina.
5. **Export**: "PDF stampa" (A4, 300 dpi, margini 10 mm, pronto da plastificare) e "PDF WhatsApp" (immagini compresse, file leggero).

## Design
- Calmo, pochi elementi, angoli arrotondati, colori pastello coerenti con le illustrazioni
- Font molto leggibile per i bambini: Atkinson Hyperlegible o Lexend
- Numeri dei passaggi grandi e colorati, ordine sempre da sinistra a destra e dall'alto in basso
- Interfaccia in italiano

## Fuori da questa fase
Login e multiutente, backend e database, generazione AI delle immagini, abbonamenti, guide per i genitori, simboli SVG (V, X, frecce): arriveranno dopo la validazione con Martina.

## Convenzioni
- Componenti piccoli e tipizzati, niente librerie superflue
- Il catalogo è la fonte di verità: nessun testo di scena scritto a mano nei componenti
