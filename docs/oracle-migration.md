# Varga Gestionale → Oracle Cloud: stato e piano di migrazione

Audit codice effettuato il **27 ottobre 2026**. Questa scheda è preparatoria: **non trasferisce dati, non attiva Oracle e non disabilita Firebase**.

## Stato verificato sul branch `main`

- Repository ufficiale: `ionut290/VARGA-GESTIONALE`; pubblicazione web tramite GitHub Pages e involucro Windows Tauri.
- `app.js` prepara ancora il progetto Firebase `hera-app-6cd2b`; `app-cloud.js` inizializza Firebase Authentication, Firestore e Cloud Functions nella regione `europe-west1`.
- **Percorso effettivo del workspace:** in `app-cloud.js` esiste una definizione legacy `vargaGestionaleWorkspaces/{workspaceId}`, ma `app.js` ridefinisce `workspaceRef` al termine del bootstrap. Il codice operativo punta quindi a `appConfig/vargaGestionaleWorkspace_{workspaceId}` (workspace predefinito: `varga-azienda`); verificare sul dato reale prima di esportare, evitando letture dal percorso legacy come unica fonte.
- `pushCloudNow` invia uno snapshot legacy `cloudState()` in `snapshotJson` (limite circa 850 KB), **ma** `cloud-incremental-sync.js` implementa anche `incremental-v3`: documenti `*_manifest`, `*_section_*` e blocchi catalogo `*_entries_*`. **Un export del solo snapshotJson non è completo** se è attivo il manifest; verificare generazioni/versioni e ricostruire tutti i record.
- La login usa `firebase.auth()`, mentre `authorizeCloudUser` verifica l'accesso/ruolo di Varga Cantieri; bisogna migrare **entrambe** le parti, non solo il database.
- `app-sync.js` usa le callable Functions `rebuildVargaGestionaleSnapshot`, `getVargaGestionaleChanges`, `getVargaGestionaleSnapshotChunk` per leggere Cantieri e aggiornare consuntivi. La sorgente dei dati Cantieri deve restare autorevole: nessun doppio sistema di scrittura.
- Copia locale in localStorage/IndexedDB; alcuni prezzari grandi e archivi di Cantieri hanno persistenza separata. I documenti possono avere URL Google Drive: copiare i metadati senza sostituire né cancellare i documenti esterni.
- **Nessun client Oracle/postgres attivo** è stato riscontrato in questi moduli; la migrazione end-to-end di Gestionale non è dimostrata.

## Obiettivo dell'architettura

1. **Isolamento:** un database o schema PostgreSQL `varga_gestionale`, credenziali e backup propri sul server Oracle; niente tabelle condivise in scrittura con Varga Cantieri. AzuraCast/Radio RDI devono rimanere isolati.
2. **API privata HTTPS** per Gestionale con endpoint `/api/gestionale/v1/health`, `/workspace` (lettura/salvataggio condizionale a `revision` per prevenire modifiche perse), `/sync/cantieri` (delta autenticati, cursor stabile) e amministrazione utenti/ruoli. Rotte e prefisso sono una *proposta*, non servizi esistenti.
3. **Autenticazione compatibile:** login/password e Google ove supportati, profilo/ruolo centralizzato e applicazione server-side delle autorizzazioni; niente password/hash esportati con procedure improvvisate. Durante test si può mantenere l'account Firebase solo come ponte con verifica del token lato server, ma la dismissione totale richiede un sistema Oracle completo e collaudato.
4. **Integrazione Cantieri unidirezionale:** mantenere la semantica di `mapSnapshotRecords` (ID sorgente stabili, cancellazioni archiviate, solo lavorazioni FATTO per i consuntivi, cursori delta e riconciliazione). La nuova API deve leggere dal servizio Oracle di Cantieri solo quando autorizzata.
5. **Prezziari e snapshot voluminosi:** separare dati in entità/pagine o blocchi versionati; mai rimpiazzare lo snapshot complessivo con un delta parziale. Conflitti devono essere rilevati e non sovrascritti silenziosamente.

## Sequenza prima del passaggio in produzione

- [ ] Accedere in sola lettura alla configurazione effettiva del server Oracle e identificare servizi, database, versioni, spazi e backup; **non assumere** che esista già un backend Gestionale.
- [ ] Esportare **con privilegi autorizzati** il workspace effettivo di Firestore e una copia locale dei dati disponibili; conservare copie cifrate **fuori dal repository**. Elencare quantità per clienti, preventivi, commesse, fatture, spese, scadenze, documenti, prezzari, consuntivi e riferimenti a Cantieri.
- [ ] Fare export tecnico dei ruoli e degli utenti autorizzati, senza esportare password. Mappare il flusso di creazione account, recupero password e autorizzazioni.
- [ ] Creare su Oracle schema/utente con privilegi minimi, backup e test di ripristino; limiti di RAM/CPU per non compromettere radio e Cantieri.
- [ ] Implementare e testare API su ambiente di prova con dataset sintetico: autenticazione, controllo accessi negativi, isolamento workspace, recupero revisioni, offline/retry, upload prezzari grandi, merge concorrenti e cancellazioni.
- [ ] Eseguire **dry-run di importazione** senza scrivere ai dati di produzione, riconciliare totali e campioni (non solo numero complessivo di documenti). Registrare versione/checksum e stato di importazione.
- [ ] Introdurre client configurabile Firebase/Oracle con feature flag **disattivato di default**; il branch `main` deve continuare a funzionare normalmente fino al collaudo.
- [ ] Testare su due account e due browser contemporanei; verificare CRUD clienti/preventivi/commesse/consuntivi, PDF, Drive, login, sync Cantieri e installazione Windows.
- [ ] Pianificare finestra di sola lettura, importazione finale, controllo completezza, switch atomico e monitoraggio; rollback documentato prima del taglio. Solo dopo esito positivo dismettere Firestore/Functions/Auth secondo le dipendenze reali.

## Condizioni di blocco

**Non eliminare Firebase** senza backup ripristinabile, inventario validato, migrazione autenticazione/ruoli completata, verifica dei delta Cantieri, confronto record e prova di rollback. **Non pubblicare credenziali, token, dati clienti o backup su GitHub.** Questo documento non prova lo stato live del server Oracle; per quello serve accesso diretto alla VM o output di comandi verificati.

## Punti di controllo per riprendere

- Frontend: `app.js`, `app-cloud.js`, `app-sync.js`, `app-core.js` e moduli persistenza `cantieri-persistence.js`, `prezzari-persistence.js`.
- Autorizzazioni: funzione globale `authorizeCloudUser`, flussi Firebase login/Google, ruoli ereditati da Varga Cantieri.
- Workspace: identificare sempre la **versione finale in esecuzione di `workspaceRef`** e verificare se altri moduli la modificano.
- Backend Cantieri: verificare nome container, porta interna, schema PostgreSQL, endpoint di sola lettura e politica di autenticazione sull'istanza Oracle prima di integrare.

## Preparazione del backend Oracle — 27 ottobre 2026

- È stato generato in questa sessione ChatGPT un pacchetto ZIP di **prova** con FastAPI/PostgreSQL in Compose, tabelle utenti/ruoli/workspace/sessioni, login Argon2id, controllo revisione 409, API privata, esportatore Firestore legacy + incremental-v3 e script PowerShell per **copia in sola preparazione** sulla VM. Il pacchetto non contiene credenziali né dati aziendali.
- Verifiche locali: 8 unit test superati (richieste anonime, login hashing, validazione nomi, ricostruzione dati legacy/incremental e rifiuto di chunk mancante). **Non sono test di produzione con PostgreSQL, Firebase o Oracle.**
- I file del pacchetto non sono ancora stati distribuiti sulla VM né integrati nel branch `main`; l'allegato è scaricabile nel contesto ChatGPT della sessione. Non confondere questa documentazione con un deploy.
- L'URL pubblico `https://gestionale.radio-romanii-italia.duckdns.org/` espone ancora testo relativo a Firestore; la route di health Oracle non è stata confermata come API attiva.
- **Blocchi reali**: accesso SSH alla VM, export autorizzato del workspace completo e dati locali, backend Oracle in produzione, conversione frontend e dei moduli che usano Firebase (`cloud-users.js`, `cloud-incremental-sync.js`, `app-sync.js`, `job-management-sync.js`, `plant-registry.js`, ecc.), collegamento sicuro ai dati/permessi di Cantieri, test di due utenti e rollback. Senza questi passaggi, non è corretto affermare che il Gestionale sia interamente migrato.
