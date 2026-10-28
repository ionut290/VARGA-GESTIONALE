# Inventario moduli: Gestionale Oracle-only

Aggiornato: 28 ottobre 2026  
Ramo: `migration/gestionale-oracle-only`

## Esito della scansione

La UI originale carica 66 moduli JavaScript da `app.js`. Il bootstrap Oracle usa la stessa interfaccia ma esclude gli script del bootstrap cloud e alcune integrazioni. Una nuova verifica CI controlla che nessuno script effettivamente caricato dal bootstrap Oracle inizializzi o usi direttamente l'SDK Firebase, e che l'HTML Oracle non carichi SDK Firebase o `app.js`.

CI del commit `7466e57898d17bee9ab7828862931e31d9e09df6`: **success**, inclusi test API, PostgreSQL temporaneo, guardia del bundle e validazione statica senza deploy.

## Funzioni cloud escluse dal bundle Oracle

Il bootstrap Oracle esclude questi moduli o collegamenti, quindi il loro comportamento deve essere sostituito prima della parità operativa:

| Modulo/integrazione | Comportamento attuale in Firebase | Lavoro necessario per Oracle-only |
|---|---|---|
| `app-cloud.js` | Login Firebase, snapshot Firestore, sincronizzazione realtime e salvataggi cloud | Login Oracle, ruoli, sezioni revisionate, backup e recupero sessione |
| `cloud-users.js`, `user-document-assets.js` | Approvazioni, profili e asset utente da Firestore | Migrare utenti/ruoli/profili ad Oracle e stabilire un flusso di amministrazione |
| `cloud-incremental-sync.js` | Manifest e sezioni aggiornati da Cloud Functions | Usare l'API Oracle per lettura/scrittura, revisioni e recupero |
| Pulsante Cantieri nell'adapter Oracle (lotto aggiunto nel ramo) | Rilegge `jobs`, `clients` e le sezioni `vc*` dall'API Oracle, senza scartare modifiche locali non salvate | Verificare su VM che il ciclo sorgente Cantieri→staging→workspace resti aggiornato; le scritture di ritorno a Cantieri restano da migrare |
| `job-management-sync.js` | Scrittura delle commesse del Gestionale in Firestore Cantieri | Definire un endpoint controllato Cantieri↔Oracle per la replica richiesta |
| `job-plant-management.js` | Scrittura diretta degli impianti nelle raccolte Firestore Cantieri | Spostare le modifiche su API/contratto di integrazione senza SDK Firebase nel Gestionale |
| `squadre-management-sync.js` | Scrittura di squadre e storico in Firestore Cantieri | Spostare le modifiche su API/contratto di integrazione e gestire conflitti/permessi |
| `map-mail-bridge.js`, Drive bridge | Gmail, Drive e aggiornamenti collegati a Firestore tramite Apps Script | Mantenere solo le funzioni esterne che servono; archiviare metadati e stato del flusso su Oracle e rimuovere scritture Firestore |

`accounting-round-history-v2.js` contiene chiamate a helper `firebase.firestore.FieldValue`, ma nel bundle Oracle è presente solo uno shim locale inerte per timestamp/delete. Va mantenuto coperto dal test per impedire l'introduzione di chiamate SDK o scritture Firestore.

## Protezioni API Oracle aggiunte nel ramo

- Le scritture delle sezioni `company`, `vcCommesse`, `vcImpianti`, `vcOre`, `vcRecords`, `vcSegnalazioni`, `vcSquadre` e `vcUtenti` richiedono ruolo `admin` anche lato server.
- La sostituzione monolitica dell'intero workspace è riservata agli amministratori; la UI Oracle usa endpoint sezionali con revisioni.
- La CI di integrazione verifica che un operatore con permesso workspace possa aggiornare Clienti ma riceva HTTP 403 sulle sezioni amministrative e sulla sostituzione globale.
- Il controllo di ruolo è un primo livello. Prima della produzione restano da definire permessi completi per sezione e verificare che la mappatura degli account rispecchi i ruoli aziendali.

## Proprietà già presenti nella copia di collaudo

- L'HTML pubblicato per il test è generato dalla pagina originale, senza i tag SDK Firebase e senza il loader di produzione `app.js`.
- Il CSP della copia Oracle limita le connessioni dati alla stessa origine.
- L'adapter Oracle autentica via API, carica le sezioni del workspace DEMO e salva le modifiche con revisione; HTTP 409 impedisce sovrascritture concorrenti.
- Questo adapter non è collegato al workspace aziendale e non certifica le funzioni cloud escluse.

## Ordine di completamento

1. **Autenticazione e autorizzazioni**: account Oracle per gli utenti Gestionale, ruoli `admin/ufficio/operatore`, permessi server per workspace e operazioni. Le password Firebase non si trasferiscono in chiaro: predisporre credenziali Oracle e recupero credenziali sicuro.
2. **Letture Cantieri**: verificare il writer Cantieri e la mappatura staging; esporre tramite Oracle i dati aggiornati necessari al Gestionale, con conteggi, checkpoint e aggiornamento visibile.
3. **Scritture verso Cantieri**: definire l'API lato Cantieri o il bridge server-side; il browser Gestionale non deve includere SDK Firebase né credenziali Firebase. Prevedere ID idempotenti, autorizzazioni, revisioni, retry controllati e registro esiti.
4. **Moduli specifici**: migrare impianti, squadre, storico contabile/MAP, profilo utente, richieste email e documenti; usare Oracle come archivio dei dati e degli stati del Gestionale.
5. **Backup/offline**: bozze persistenti protette in IndexedDB, riconciliazione dopo rete assente, conflitti espliciti e prova di ripristino server.
6. **Verifica finale**: ogni schermata e pulsante, due sessioni, dispositivi, aggiornamento Cantieri→Oracle e ritorno richiesto, assenza di richieste Firebase/Firestore dal Gestionale, backup e rollback.

## Evidenza operativa VM Oracle — 28 ottobre 2026

- Il timer `varga-cantieri-sync.timer` risulta attivo con intervallo di cinque minuti. Dopo la correzione mirata della query PL/pgSQL nel file operativo, le esecuzioni delle 15:42 e 15:47 UTC sono terminate con `Result=success`; lo staging e i workspace di prova sono stati aggiornati. Il workspace candidato originale è rimasto invariato.
- Nel confronto aggregato, `vcRecords` ha 5.120 elementi nel workspace di sincronizzazione e 5.116 nella copia UI. I quattro elementi assenti dalla sezione `vcRecords` provengono da `oreReports` (2) e `squadreStorico` (2), esclusi dal filtro delle sole commesse; i conteggi delle sezioni dedicate `vcOre` (421) e `vcSquadre` (422) corrispondono tra workspace di sincronizzazione e copia UI. Il conteggio da solo non prova l'identità semantica di ogni record.
- Dei 5.120 elementi `vcRecords`, 3.830 hanno un percorso esatto nello staging `current_sync`; 1.290 non hanno una corrispondenza esatta. Potrebbero essere record annidati sotto commesse, ma serve verificare il percorso della commessa genitrice e la freschezza dei dati prima di certificare la riconciliazione. I quattro elementi non presenti nella copia UI hanno invece tutti una corrispondenza esatta nello staging corrente.
- Questa verifica riguarda il flusso verso workspace isolati; non costituisce migrazione né cutover del Gestionale live.

## Limiti del risultato

Questo inventario è una scansione statica del codice nel repository. Non prova che i timer sulla VM Oracle siano attivi in questo momento, che i payload Cantieri siano semanticamente corretti, o che gli utenti possano accedere alla copia Oracle. Nessun deploy o cambio ai dati aziendali è stato eseguito.
