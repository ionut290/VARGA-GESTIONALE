# Migrazione Varga Gestionale a Oracle (ADR)

Data: 28 ottobre 2026  
Stato: in preparazione su `migration/gestionale-oracle-only`; produzione invariata.

## Decisione e perimetro

- Varga Gestionale userà Oracle PostgreSQL e l'API Oracle come unico backend applicativo, archivio e autenticazione.
- Il codice e l'applicazione Varga Gestionale non inizializzeranno Firebase né Firestore una volta completata la migrazione.
- Varga Cantieri resta invariato e può continuare a usare Firebase Authentication e Firestore.
- Le due app possono avere collegamenti diretti lato utente. Lo scambio persistente dei dati Cantieri destinati al Gestionale avviene tramite Oracle: Cantieri/Firebase → writer o sincronizzatore controllato → Oracle → Gestionale.
- L'interfaccia originale del Gestionale, inclusi schermate, menu, CSS e flussi, resta invariata. La console Oracle separata è solo diagnostica.
- Non si modificano né si pubblicano gli ambienti Cantieri, RDI, AzuraCast o YouTube come parte di questo lavoro.

## Stato verificato nel repository

- Esiste un backend FastAPI/PostgreSQL Oracle con login locale, cookie HttpOnly, workspace, sezioni e revisioni.
- Esiste un adapter per l'interfaccia originale che carica le sezioni e invia gli aggiornamenti a Oracle.
- L'adapter è confinato a un workspace sintetico di prova; l'anteprima Oracle pubblicata è in sola lettura.
- Il bootstrap di produzione `app.js` inizializza ancora Firebase e avvia i moduli cloud. La produzione non è Oracle-only.
- La sincronizzazione Cantieri→Gestionale ha un workspace candidato e uno staging. La documentazione segnala ancora verifiche da completare su mapping, riconciliazione e fonte dei dati; questo non costituisce ancora un collegamento operativo certificato.

## Fasi di realizzazione

1. **Inventario e fotografia immutabile**  
   Rilevare le sezioni usate da ogni modulo, gli account/ruoli, i flussi di login, i riferimenti ai documenti e gli aggiornamenti successivi all'ultima esportazione. Creare e verificare una nuova fotografia Oracle senza sovrascrivere gli archivi esistenti.

2. **Backend Oracle per l'app originale**  
   Separare bootstrap e servizi Oracle dai moduli Firebase. Riutilizzare i moduli UI originali; aggiungere persistenza per tutte le sezioni, autorizzazioni per ruolo, revisioni/conflitti, sessione, recupero credenziali e audit.

3. **Sincronizzazione Cantieri attraverso Oracle**  
   Verificare writer e dati correnti Cantieri, mappature e chiavi stabili. Rendere l'upsert idempotente, registrare checkpoint/errori e quarantena dei conflitti; non cancellare automaticamente record mancanti. Consentire al Gestionale di leggere/scrivere i soli dati di propria competenza.

4. **Collaudo completo**  
   Provare ogni modulo con account e ruoli reali, due sessioni concorrenti, refresh, disconnessione/recupero, documenti, stampa/PDF, backup e ripristino. Verificare che il Gestionale non effettui richieste Firebase e che Cantieri continui a funzionare con la sua configurazione attuale.

5. **Cutover e rollback**  
   Fare il passaggio solo dopo la riconciliazione finale e un ripristino verificato. Conservare Firebase attivo come rollback fino alla finestra di stabilità concordata; disattivare le dipendenze del solo Gestionale solo dopo evidenza che nessun flusso operativo lo usa. Non disabilitare il progetto Firebase condiviso se ciò impatta Cantieri.

## Condizioni di accettazione

- Tutti i dati aziendali e le relazioni sono riconciliati con la fotografia sorgente approvata.
- L'app originale mantiene parità visiva e funzionale.
- Login, ruoli, recupero credenziali, letture e scritture sono coperti per tutti i moduli.
- Il Gestionale funziona con rete disponibile e recupera modifiche in modo documentato dopo un'interruzione; i conflitti non sovrascrivono silenziosamente dati.
- La sincronizzazione Cantieri→Oracle è aggiornata, tracciabile, idempotente e non altera i record sorgente Cantieri.
- Backup/ripristino e rollback sono stati provati.
- Il build finale non inizializza Firebase/Firestore dal Gestionale e i flussi Cantieri restano funzionanti.

## Primo lotto del ramo

Implementare e collaudare in ambiente isolato un bootstrap Oracle per l'app originale, riusando la UI e l'API esistenti; aggiungere test che bloccano l'inizializzazione Firebase nel bundle Oracle e dimostrano che i dati restano confinati nel workspace di prova. Non collegare ancora l'adapter al workspace aziendale né pubblicare il lotto come produzione.
