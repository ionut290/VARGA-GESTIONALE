# Migrazione Varga Gestionale a Oracle (ADR)

Data: 28 ottobre 2026  
Stato: lavoro isolato sul ramo `migration/gestionale-oracle-only`; produzione invariata.

## Decisione e perimetro

- Varga Gestionale userà Oracle PostgreSQL e l'API Oracle come unico backend applicativo, archivio e autenticazione.
- Al termine, il bundle Gestionale non inizializzerà né chiamerà Firebase o Firestore.
- Varga Cantieri resta invariato e può continuare a usare Firebase Authentication e Firestore.
- Le due app possono avere collegamenti diretti lato utente. Lo scambio persistente dei dati Cantieri destinati al Gestionale avviene tramite Oracle: Cantieri/Firebase → writer o sincronizzatore controllato → Oracle → Gestionale.
- L'interfaccia originale del Gestionale, inclusi schermate, menu, CSS e flussi, resta invariata. La console Oracle separata è solo diagnostica.
- Non si modificano né si pubblicano gli ambienti Cantieri, RDI, AzuraCast o YouTube come parte di questo lavoro.

## Stato verificato nel repository

- Esiste un backend FastAPI/PostgreSQL Oracle con login locale, cookie HttpOnly, workspace, sezioni e revisioni.
- Esistono builder e bootstrap per una copia Oracle della UI originale: escludono gli script cloud originali, isolano lo storage del browser e caricano un adapter Oracle.
- L'adapter Oracle originale effettua login, lettura e scrittura revisionata delle sezioni, ma usa esclusivamente un workspace sintetico.
- L'anteprima pubblicata dei dati Cantieri resta sola lettura; la copia completa dell'app per il collaudo è distinta e non rappresenta produzione.
- Il bootstrap di produzione `app.js` inizializza ancora Firebase e avvia i moduli cloud. La produzione non è Oracle-only.
- La sincronizzazione Cantieri→Gestionale ha un workspace candidato e uno staging. La documentazione segnala verifiche ancora aperte su mapping, riconciliazione e fonte dei dati; non è quindi ancora una base certificata per il cutover.

## Fasi di realizzazione

1. **Inventario e fotografia immutabile**  
   Rilevare le sezioni usate da ogni modulo, gli account/ruoli, i flussi di login, i riferimenti ai documenti e gli aggiornamenti successivi all'ultima esportazione. Creare e verificare una nuova fotografia Oracle senza sovrascrivere gli archivi esistenti.

2. **Backend Oracle per l'app originale**  
   Portare progressivamente i flussi dell'interfaccia originale all'API Oracle, senza cambiare la UI. Coprire tutte le letture/scritture, autorizzazioni per ruolo, revisioni/conflitti, sessioni, recupero credenziali, documenti e audit. Restare su workspace DEMO finché ogni lotto non è collaudato.

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
- Il build finale del Gestionale non inizializza o chiama Firebase/Firestore; i flussi Cantieri restano funzionanti.

## Lotto 1 — Copia originale e adapter Oracle isolati

La base tecnica è già presente nel repository: builder della copia originale, bootstrap Oracle che esclude i moduli Firebase, namespace separato per localStorage/IndexedDB, login Oracle e adapter a sezioni revisionate. I test automatici controllano parità del markup, esclusione degli script cloud originali, uso dell'API e confinamento al workspace DEMO.

Il commit di questo documento ha attivato la workflow Oracle CI sul ramo: esito `success` il 28 ottobre 2026 alle 15:10 UTC. Questo prova i controlli automatizzati del repository; non equivale a collaudo di tutti i flussi nel browser reale o a una migrazione produzione.

## Prossimo lotto

- Inventariare i moduli e le funzioni del Gestionale che ancora dipendono da Firebase, Cloud Functions, Drive o sincronizzazioni cloud.
- Verificare nell'anteprima completa login, ruoli, lettura/scrittura e conflitti dal browser reale e in due sessioni.
- Completare la copertura Oracle delle funzioni non ancora migrate, inclusi documenti, richieste email, stampa/PDF e recupero delle modifiche offline.
- Mantenere tutte le scritture nel workspace DEMO fino a backup, riconciliazione, autorizzazioni e prova di ripristino.
- Non collegare l'adapter al workspace aziendale e non pubblicare questo lotto come produzione finché i criteri di accettazione non sono soddisfatti.
