# Piano di sviluppo – Emovere Studio

16 ottobre 2026 · basato sulla specifica funzionale di Martina ("SPECIFICHE FUNZIONALI DEL SOFTWARE – Assistente per la progettazione di materiali educativi e comportamentali")

## Sintesi

La specifica di Martina sposta il software da **compositore di schede** ad **assistente alla progettazione educativa**. Il flusso centrale non parte più dal modello di scheda, ma dal bisogno del bambino:

**Obiettivo → situazione → competenza da insegnare → supporto adatto → personalizzazione → generazione → revisione → utilizzo → osservazione**

Il prototipo attuale copre bene la parte finale del flusso (impaginazione, immagini coerenti, PDF, carte, archivio di base). Mancano tre pilastri:

1. **Cartella del bambino strutturata**, con obiettivi e storico. Contiene dati di minori e informazioni potenzialmente sanitarie: richiede login, database protetto e regole privacy prima di qualsiasi altra cosa.
2. **Motore AI per i testi**: storie sociali, scenari comportamentali e guide per genitori e scuola nascono da un testo proposto dall'AI e corretto da Martina, non da una libreria fissa.
3. **Immagini generate su richiesta per ogni scena**, coerenti tra loro, con la possibilità di rigenerarne una sola. La base esiste già (vignette AI con riferimento del personaggio).

Il piano aggiunge una **Fase 0 di fondamenta** prima delle tre fasi indicate da Martina, e anticipa le **guide per genitori e scuola** nella Fase 1, perché la specifica le definisce prioritarie e sono solo testo, quindi rapide da costruire.

## Cosa c'è già e cosa manca

Dei 13 moduli della specifica, 2 sono coperti in buona parte (sequenze e impaginazione), 8 in parte e 3 sono da costruire da zero (funzioni esecutive, guide, osservazioni).

| Modulo (specifica di Martina) | Già fatto | Da fare |
| --- | --- | --- |
| 3. Cartella del bambino | Cartelle con nome o iniziali, appunti, stati delle schede, promemoria | Profilo strutturato (età, comunicazione, autonomie, interessi, difficoltà, contesti, rinforzatori), obiettivi attivi e archiviati, provenienza del dato (osservato / riferito / ipotesi), scelta dei dati da usare in ogni generazione |
| 4. Storie sociali | Vignette AI singole con riferimento del personaggio | Generatore guidato: obiettivo e situazione → testo proposto dall'AI e modificabile → immagini per scena coerenti → rigenera una scena; parametri (numero di scene, lunghezza, linguaggio, fumetti o didascalie, formato) |
| 5. Scenari comportamentali | Prima/Poi e Scelte come base grafica | Tutti e cinque i tipi: causa-effetto, comportamento e alternativa, scenari a scelta, conseguenze emotive, più esempi dallo stesso obiettivo |
| 6. Sequenze e routine | Routine 4/6/9/12, Prima/Poi, Prima-Adesso-Dopo, Agenda settimanale, carte da ritagliare, striscia agenda, numeri, orologio | Versione mescolata, versione senza numeri, modalità testo / simboli / entrambi, checklist, "ora-poi" |
| 7. Comunicazione e CAA | Carte da ritagliare, simboli V/X/divieto | Tabelle di scelta e strisce comunicative con frasi pronte (aiuto, pausa, ho finito…), pittogrammi con licenza adatta |
| 8. Rinforzi e regolazione | Cerchietto stellina e stelline da ritagliare | Token economy configurabile (gettoni, criteri, rinforzatore), termometro della rabbia, scale di attivazione, carte delle emozioni, piani per le transizioni |
| 9. Funzioni esecutive | — | Attività graduabili per livello: attenzione, inibizione, flessibilità, memoria, pianificazione, incongruenze, ordinamento |
| 10. Guide genitori e scuola | — | Guida in 10 punti dall'obiettivo, versione famiglia e versione scuola, scheda di una pagina, promemoria per adulti, breve report |
| 11. Archivio dei materiali | Salva, duplica, sposta, stati, PDF | Associazione agli obiettivi, data e versione, generico o personalizzato, archivio modelli separato (modificare una copia non tocca l'originale) |
| 12. Grafica e impaginazione | A4 verticale e orizzontale, griglie, tessere, colori e bianco/nero, testo modificabile, personaggi coerenti, logo | "Una scena per pagina", dimensioni regolabili di immagini e didascalie, stili alternativi (pittogrammi) |
| 13. Osservazioni e monitoraggio | — | Registro (antecedente, comportamento, conseguenza, livello di aiuto, frequenza), andamento degli obiettivi nel tempo |
| 14. Flusso guidato | Crea → modello → editor | Percorso "bambino → obiettivo → situazione → tipo di materiale → proposta → revisione → export → osservazione" |
| 15. Sicurezza e dati | Password unica, avvisi privacy, nessun dato inviato all'AI | Login personale, database protetto in UE, backup automatico, pseudonimi, cancellazione dei dati, controllo di cosa viene inviato all'AI |

Nota: la Tabella a gettoni era stata realizzata e poi tolta. La specifica la richiede di nuovo, in forma configurabile.

## Fase 0 – Fondamenta (1-2 settimane)

Prima della cartella del bambino serve un vero backend: oggi i dati stanno nel browser e la protezione è una password unica.

1. **Login personale**: account per ogni professionista, sessioni sicure, recupero password. Pensato da subito per più utenti (servirà per la vendita), con i dati di ognuno separati.
2. **Database in UE**: PostgreSQL ospitato in Europa (es. Supabase regione Francoforte, oppure Laravel + Postgres su hosting europeo). Funzioni Vercel sulla regione europea.
3. **Modello dei dati**: bambino, profilo, obiettivi, materiali con versioni, modelli generici separati dalle copie personalizzate, osservazioni.
4. **Migrazione**: import automatico di cartelle e schede oggi salvate nel browser, tramite il file di backup.
5. **Privacy fin dalla progettazione**:
    - pseudonimo come default, nome reale facoltativo e separato dai materiali;
    - campi sensibili cifrati;
    - esportazione e cancellazione completa dei dati di un bambino;
    - backup automatici giornalieri;
    - prima di ogni chiamata all'AI, anteprima dei dati inviati, con possibilità di togliere voci; mai nome, diagnosi o dati identificativi.
6. **Motore AI per i testi**: una funzione server unica che riceve obiettivo, situazione e parametri e restituisce testo strutturato (scene, frasi, punti della guida), sempre modificabile prima della generazione delle immagini. Regole fisse nel prompt: linguaggio positivo, prima persona per le storie, rapporto di Carol Gray, ipotesi sempre indicate come "da verificare".
7. **Immagini per scena**: estensione della generazione AI attuale a più scene in sequenza, con lo stesso riferimento del personaggio e lo stesso ambiente, e rigenerazione di una sola scena.

## Fase 1 – MVP di Martina (4-6 settimane)

Ordine consigliato: ogni passo usa il precedente.

1. **Cartella del bambino**
    - Profilo con le sezioni della specifica; ogni voce ha l'etichetta di provenienza: osservato, riferito dai genitori, riferito dalla scuola, ipotesi.
    - Obiettivi con stato (attivo, raggiunto, archiviato) e storico.
    - Tutti i materiali del bambino collegati agli obiettivi.
2. **Flusso guidato "Nuovo materiale"**: bambino o "materiale generico" → obiettivo → situazione descritta a parole → tipo di materiale → parametri (età, comprensione, lunghezza, contesto) → scelta dei dati del profilo da usare → proposta. È l'ingresso comune a tutti i generatori.
3. **Generatore di storie sociali**: struttura e testo proposti dall'AI per scena, modificabili; poi immagini per scena con personaggio e ambiente coerenti; rigenerazione di una sola scena; impaginazione "una scena per pagina" o a griglia; fumetti o didascalie.
4. **Sequenze e supporti visivi, completamento**: versione mescolata da riordinare, senza numeri, testo / simboli / entrambi, checklist con passaggi spuntabili, "ora-poi". Si appoggia ai modelli già esistenti.
5. **Scenari comportamentali**: i cinque tipi (causa-effetto, comportamento e alternativa, scenari a scelta, conseguenze emotive, varianti in più contesti), con la scelta esplicita della competenza da insegnare. Le emozioni sono sempre presentate come possibilità.
6. **Guide per genitori e scuola** (anticipate): guida in 10 punti dall'obiettivo, versione famiglia e versione scuola, scheda di una pagina.
7. **Archivio con versioni**: data e versione per ogni materiale, etichetta generico/personalizzato, archivio dei modelli separato, "usa come modello" che crea una copia indipendente.

Alla fine della Fase 1, Martina può partire da una difficoltà reale e arrivare a storia sociale, sequenza, scenario e guida per la famiglia, tutti salvati nella cartella del bambino.

## Fase 2 – Personalizzazione e intervento (3-4 settimane)

1. **Comunicazione funzionale e CAA**: tessere, tabelle di scelta e strisce con frasi pronte ("Voglio aiuto", "Ancora un minuto", "Ho finito"…), adattabili al sistema CAA già in uso dal bambino.
2. **Token economy configurabile**: numero di gettoni, criterio di completamento, rinforzatore scelto dal bambino, "prima il compito, poi l'attività gradita".
3. **Strumenti di regolazione**: termometro della rabbia, scala di attivazione, carte delle emozioni, strategie di regolazione, piani visivi per le transizioni.
4. **Promemoria e report per gli adulti**: promemoria di una pagina e breve report sul lavoro svolto, generati dalla cartella.
5. **Personaggi**: varianti (capelli, carnagione, occhiali, età 7-8) e adulti di riferimento, scelti nella cartella del bambino come "preferenze grafiche".

## Fase 3 – Monitoraggio e ampliamento (3-4 settimane)

1. **Registro delle osservazioni**: data, contesto, antecedente, comportamento, conseguenza, livello di aiuto, frequenza o durata, risposta al materiale, note. Dati registrati separati dalle interpretazioni.
2. **Monitoraggio degli obiettivi**: andamento nel tempo per obiettivo, con le modifiche al materiale segnate sulla linea del tempo; nessuna conclusione automatica di efficacia.
3. **Funzioni esecutive**: attività graduabili per livello di difficoltà, con generazione di varianti.
4. **Generalizzazione**: dallo stesso obiettivo, varianti dello stesso materiale ambientate a casa, a scuola, in studio e fuori.
5. **Storico delle versioni** consultabile e confronto tra versioni di un materiale.

## Decisioni da prendere prima della Fase 0

- [ ] Backend: Supabase (più veloce da avviare) oppure Laravel + Postgres?
- [ ] Hosting e budget mensile: database e storage in UE, piano Vercel Pro (necessario per l'uso commerciale).
- [ ] Fornitori AI: OpenAI per le immagini; per i testi OpenAI o Anthropic. Verificare per entrambi i contratti di trattamento dati (DPA) e la conservazione zero dei dati.
- [ ] Privacy: chi è titolare del trattamento (Martina o il Centro), informativa e consenso dei genitori, registro dei trattamenti. Parere di un consulente privacy prima di inserire dati reali.
- [ ] Vendita: un solo centro o multi-centro da subito? Cambia il modello dei dati.

## Rischi e regole

- **Dati sanitari di minori**: categoria più protetta dal GDPR. Fino alla Fase 0 completata, niente profili reali nel software: solo pseudonimi e materiali generici.
- **Personaggi preferiti dei bambini**: il generatore non può disegnare personaggi protetti (cartoni, supereroi): si usano solo come parole nel testo o con personaggi originali ispirati al tema.
- **Pittogrammi ARASAAC**: licenza non commerciale, non inseribili nel prodotto in vendita.
- **Costi AI**: le storie sociali generano molte immagini per volta. Serve un limite mensile e il riuso delle scene già create.
- **Ruolo dell'AI**: le proposte (ipotesi funzionali, emozioni, guide) restano sempre bozze. Ogni testo generato mostra "da rivedere" finché Martina non lo conferma. Il software non formula diagnosi né decide il trattamento.
