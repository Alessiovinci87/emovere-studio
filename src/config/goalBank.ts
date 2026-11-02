import type { GoalArea } from './profile'

// Obiettivi pronti da cui partire (bambini 3-8 anni). Sono proposte da adattare: ogni obiettivo scelto
// si può modificare prima di crearlo. Formulati come comportamento osservabile, con un criterio indicativo.
// Bozza da rivedere con Martina.

export interface GoalTemplate {
  area: GoalArea
  title: string
  description: string
  /** Materiale consigliato (solo come suggerimento nel selettore) */
  material?: string
}

export const GOAL_BANK: GoalTemplate[] = [
  // Autonomie
  { area: 'autonomie', title: 'Lavarsi le mani da solo prima dei pasti', description: 'Esegue i passaggi (acqua, sapone, strofinare, sciacquare, asciugare) con al massimo un aiuto verbale, in 4 occasioni su 5.', material: 'Sequenza o checklist' },
  { area: 'autonomie', title: 'Lavarsi i denti seguendo la sequenza', description: 'Mette il dentifricio, spazzola e sciacqua seguendo la sequenza visiva, con aiuto solo gestuale.', material: 'Sequenza' },
  { area: 'autonomie', title: 'Usare il bagno in autonomia', description: 'Va in bagno quando ne ha bisogno, si siede, tira lo sciacquone e si lava le mani con aiuto verbale al massimo.', material: 'Sequenza e storia sociale' },
  { area: 'autonomie', title: 'Vestirsi da solo al mattino', description: 'Indossa i vestiti preparati nell\'ordine indicato dalla sequenza, con aiuto fisico solo per bottoni e lacci.', material: 'Sequenza' },
  { area: 'autonomie', title: 'Preparare lo zaino per la scuola', description: 'Mette nello zaino gli oggetti della checklist e spunta ogni voce, la sera prima, 4 sere su 5.', material: 'Checklist' },
  { area: 'autonomie', title: 'Apparecchiare il proprio posto a tavola', description: 'Mette piatto, bicchiere e posate al proprio posto seguendo l\'immagine di riferimento.', material: 'Sequenza' },
  { area: 'autonomie', title: 'Riordinare i giochi a fine attività', description: 'Rimette i giochi nel contenitore al segnale "fine gioco", entro 2 minuti, con al massimo un richiamo.', material: 'Prima / Poi' },
  { area: 'autonomie', title: 'Seguire la routine della sera', description: 'Completa i passaggi della routine serale (bagno, pigiama, denti, storia, letto) guardando l\'agenda visiva.', material: 'Routine' },

  // Comunicazione
  { area: 'comunicazione', title: 'Chiedere aiuto quando è in difficoltà', description: 'Usa la parola, il gesto o la carta "Aiuto" invece di piangere o lasciare il compito, in 3 occasioni su 5.', material: 'Striscia di comunicazione' },
  { area: 'comunicazione', title: 'Chiedere una pausa', description: 'Usa la carta o la frase "Pausa" quando si sente stanco o sovraccarico, prima di arrivare alla crisi.', material: 'Striscia di comunicazione' },
  { area: 'comunicazione', title: 'Scegliere tra due alternative', description: 'Indica o nomina una tra due possibilità mostrate, entro 10 secondi.', material: 'Scelte · 2' },
  { area: 'comunicazione', title: 'Dire "ho finito"', description: 'Comunica la fine di un\'attività con parola, gesto o carta, invece di alzarsi e andare via.', material: 'Striscia di comunicazione' },
  { area: 'comunicazione', title: 'Rispondere al saluto', description: 'Risponde al saluto di un adulto conosciuto con la parola, il gesto o lo sguardo, all\'arrivo e all\'uscita.', material: 'Storia sociale' },
  { area: 'comunicazione', title: 'Esprimere un rifiuto in modo adeguato', description: 'Dice o mostra "No, grazie" invece di spingere, buttare o urlare.', material: 'Storia sociale' },

  // Emozioni
  { area: 'emozioni', title: 'Riconoscere le emozioni di base', description: 'Indica l\'immagine corrispondente a felice, triste, arrabbiato, spaventato su richiesta, 4 volte su 5.', material: 'Scelte · 4' },
  { area: 'emozioni', title: 'Dire come si sente', description: 'Indica sul termometro delle emozioni il proprio livello quando l\'adulto lo chiede.', material: 'Termometro delle emozioni' },
  { area: 'emozioni', title: 'Usare una strategia per calmarsi', description: 'Quando è arrabbiato sceglie una strategia dal cartellone (respirare, contare, angolo calmo) con aiuto verbale.', material: 'Termometro delle emozioni' },
  { area: 'emozioni', title: 'Tollerare un piccolo imprevisto', description: 'Accetta un cambio di programma annunciato con l\'agenda visiva senza crisi, con il supporto di una storia sociale.', material: 'Storia sociale' },
  { area: 'emozioni', title: 'Accettare di perdere in un gioco', description: 'Al termine di un gioco perso usa una frase o un gesto concordato invece di lanciare o rompere.', material: 'Storia sociale' },

  // Abilità sociali
  { area: 'abilita_sociali', title: 'Aspettare il proprio turno nel gioco', description: 'Aspetta il proprio turno in un gioco a turni con un compagno o un adulto, per almeno 3 turni.', material: 'Carta "Aspetta"' },
  { area: 'abilita_sociali', title: 'Condividere un gioco', description: 'Presta un gioco a un compagno quando gli viene chiesto, con un promemoria visivo.', material: 'Storia sociale' },
  { area: 'abilita_sociali', title: 'Chiedere di giocare insieme', description: 'Si avvicina a un compagno e chiede "Giochiamo?" (o usa la carta), in un momento di gioco libero.', material: 'Storia sociale' },
  { area: 'abilita_sociali', title: 'Rispettare lo spazio personale', description: 'Mantiene la distanza di un braccio durante la fila e il cerchio, con un promemoria visivo.', material: 'Storia sociale' },
  { area: 'abilita_sociali', title: 'Ascoltare un compagno che parla', description: 'Durante il cerchio guarda chi parla e non interrompe per 2 interventi di seguito.', material: 'Storia sociale' },

  // Comportamento
  { area: 'comportamento', title: 'Passare da un\'attività all\'altra senza crisi', description: 'Accetta la fine di un\'attività gradita al segnale (Prima/Poi e timer), in 4 transizioni su 5.', material: 'Prima / Poi' },
  { area: 'comportamento', title: 'Stare seduto durante il pasto', description: 'Resta seduto a tavola fino alla fine del pasto o per 15 minuti, con la tabella a gettoni.', material: 'Tabella a gettoni' },
  { area: 'comportamento', title: 'Mani a posto con i compagni', description: 'Usa le parole o chiama l\'adulto invece di spingere o colpire; riduzione degli episodi registrati settimana per settimana.', material: 'Storia sociale' },
  { area: 'comportamento', title: 'Completare un compito prima dell\'attività gradita', description: 'Completa un compito breve (3-5 minuti) per guadagnare l\'attività scelta, seguendo la tabella a gettoni.', material: 'Tabella a gettoni' },
  { area: 'comportamento', title: 'Aspettare senza protestare', description: 'Aspetta fino a 2 minuti (con la carta "Aspetta" e il timer) prima di ricevere ciò che ha chiesto.', material: 'Carta "Aspetta"' },
  { area: 'comportamento', title: 'Rispettare le regole della classe', description: 'Segue le 3 regole illustrate sul cartellone con al massimo un richiamo visivo per attività.', material: 'Checklist' },

  // Funzioni esecutive
  { area: 'funzioni_esecutive', title: 'Seguire un\'istruzione in due passaggi', description: 'Esegue istruzioni del tipo "prendi il quaderno e mettilo sul tavolo" senza ripetizione, 4 volte su 5.', material: 'Prima / Poi' },
  { area: 'funzioni_esecutive', title: 'Seguire la sequenza delle attività della giornata', description: 'Consulta l\'agenda visiva a ogni cambio di attività e passa alla successiva con aiuto gestuale.', material: 'Agenda della settimana' },
  { area: 'funzioni_esecutive', title: 'Mantenere l\'attenzione su un compito', description: 'Resta sul compito per 5 minuti (poi 10) prima della pausa concordata.', material: 'Tabella a gettoni' },
  { area: 'funzioni_esecutive', title: 'Ricordare cosa serve per un\'attività', description: 'Prende gli oggetti necessari guardando la checklist, senza aiuto verbale.', material: 'Checklist' },

  // Scuola
  { area: 'scuola', title: 'Entrare in classe al mattino con serenità', description: 'Saluta il genitore e entra in classe seguendo la routine dell\'arrivo, in 4 mattine su 5.', material: 'Storia sociale' },
  { area: 'scuola', title: 'Partecipare al cerchio del mattino', description: 'Resta nel cerchio per tutta la durata (10 minuti) con un oggetto o un compito assegnato.', material: 'Storia sociale' },
  { area: 'scuola', title: 'Fare la fila con i compagni', description: 'Si mette in fila e cammina con il gruppo fino alla destinazione con un promemoria visivo.', material: 'Storia sociale' },
  { area: 'scuola', title: 'Chiedere di andare in bagno a scuola', description: 'Chiede all\'insegnante con la parola o la carta "Bagno" quando ne ha bisogno.', material: 'Striscia di comunicazione' },
]
