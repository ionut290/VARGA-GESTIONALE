# Modello preventivi Avola - v129, revisione grafica

## Scopo
Un solo generatore per PDF normale e compilabile, collegato ai pulsanti correnti e archivio/commesse. Nessuna modifica alle voci, prezzi, clienti, sincronizzazione, preventivi salvati o autorizzazioni delle firme. Il modulo originale continua a occuparsi dei form e dell'Excel; solo le azioni PDF sono reindirizzate.

## Impaginazione misurata
Formato A4 595,2756 x 841,8898 punti; testo da x=147,42; intestazione data y=79,32; cliente x=374,16; titolo y=147,42; oggetto y=182,58; tabella y=277,44. Cinque colonne, senza U.M. autonoma: unità aggiunta a prezzo e quantità. Descrizioni a capo su larghezza misurata, riferimenti lunghi su più righe, importi a due decimali e prezzo unitario fino a dieci decimali, totale a sinistra con importo sulla riga successiva e nota sicurezza.

Le coordinate sono in punti PDF dall'alto, non pixel. Per contenuto più lungo la tabella e il fondo possono slittare o proseguire su pagine successive. Il timbro usa il renderer e le scelte utente già presenti, in un riquadro separato a destra.

## PDF compilabile
Appearance stream espliciti con le stesse coordinate del PDF normale; widget stampabili, NeedAppearances=false. Nessun pulsante JavaScript di stampa dentro il documento. Una modifica manuale dei campi in un lettore PDF può rigenerare l'aspetto usando il motore di quel lettore; per l'invio finale è preferibile rigenerare il PDF normale dal Gestionale. Nel test PDFium inizializzare i form prima di renderizzare, altrimenti i valori possono non comparire nell'anteprima.

## Limiti di fedeltà da risolvere prima di definirlo identico
Il riferimento usa Arial incorporato, mentre questa versione riusa Helvetica standard PDF come il generatore precedente. La carta intestata pubblica esistente ha una risoluzione inferiore a quella contenuta nel modello. Non viene dichiarata equivalenza pixel-per-pixel. Il generatore accetta font incorporati e parti della carta intestata come opzioni, ma non vengono distribuiti file di font o PDF commerciali sorgente nel repository.

## Verifiche
26 test sul generatore e 14 sull'instradamento pulsanti/API con pdf-lib reale. Dati fittizi nei test; DOM eventi simulati nei test d'integrazione. Verifiche locali con MuPDF e PDFium inizializzato per form sui PDF derivati dagli allegati, mantenuti fuori dal repository pubblico. I test non certificano l'uguaglianza grafica assoluta o un importo commerciale corretto.

La PR rimane separata da main finché la fedeltà grafica residua non è risolta o accettata. Nessuna pubblicazione automatica su main da questa pipeline.
