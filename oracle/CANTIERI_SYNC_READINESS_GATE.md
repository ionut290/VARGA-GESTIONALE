# Oracle Cantieri -> Gestionale: readiness gate

Status al 28 ottobre 2026: la sorgente `public.varga_sync_state` non è vuota (3.830 righe `source='firebase'`, `pending=false`); il timer `varga-cantieri-sync.timer` è attivo ogni cinque minuti e i cicli osservati alle 15:42 e 15:47 UTC sono terminati con codice 0. Il ciclo aggiorna solo staging e workspace di prova isolati; il candidato originale e la produzione restano invariati.

La query di sola lettura ha trovato 328 percorsi `lavorazioni`, 260 `impianti` e 253 `impiantiFisici` annidati sotto commesse nella sincronizzazione corrente. Il massimo `updated_at` osservato era 2026-10-28 14:46:37 UTC; questo campo non è stato verificato come heartbeat del writer.

`public.firestore_documents` in Cantieri risultava in una verifica precedente con un solo record `test_oracle`; va chiarito se `varga_sync_state` è il writer completo e autorevole o una proiezione parziale.

**Non eseguire il cutover del Gestionale live né disattivare Firebase finché provenienza, completezza, mapping e riconciliazione non sono verificati.**

For production synchronization:
1. Confirm Cantieri's live writer actually persists real business collections on Oracle rather than only Firebase.
2. Compare source document versions and retain the destination's historical-only entries.
3. Run staged, idempotent upserts; never remove missing records automatically.
4. Record checkpoint, error and freshness; enforce lock against concurrent runs.
5. Enable scheduling after a full sample reconciliation and restoration rehearsal.

Until the live writer is confirmed, the 6,125 staged documents remain historical copies, not real-time sync.


## Confronto payload storico vs sincronizzazione corrente (27 ottobre 2026)

Ultima verifica read-only dopo la decodifica dei tag storici `{t,v}`:
- 3.694 percorsi in comune; 6 payload semanticamente uguali e 3.688 differenti.
- 119 percorsi presenti solo nella sincronizzazione corrente; 2.431 solo nell'archivio storico.
- Le differenze più frequenti includono date con lo stesso tipo ma valori diversi, metadati di replica e campi di commessa. Non sono semplici differenze di codifica.
- Politica di riconciliazione proposta: per percorsi condivisi mantenere il payload corrente; conservare separatamente i record storici esclusivi come archivio da revisionare; aggiungere i record correnti mancanti nello staging candidato dopo backup e validazione. Nessuna cancellazione automatica.
- Questo confronto non dimostra ancora che `varga_sync_state` sia alimentato da un writer Cantieri affidabile né che le righe siano già mappate nelle sezioni `vc*` dell'app.

**Stato: nessuna importazione eseguita.** Prima di attivare la sincronizzazione vanno verificati origine, versioni, modello dati e mappatura applicativa; il candidato deve restare isolato dalla produzione.




## Verifica operativa e riconciliazione (28 ottobre 2026)

- [x] Errore PostgreSQL di ambiguità `item` corretto nel file operativo con backup; il ciclo successivo ha completato staging, mapping e sincronizzazione della preview con `Result=success`.
- [x] Il timer è rimasto `active/waiting`; due esecuzioni consecutive verificate (15:42 e 15:47 UTC) hanno concluso senza errori.
- [x] La copia UI `gestionale_varga_ui_sandbox_20261027` e il workspace `gestionale_cantieri_sync_20261027` risultano aggiornati nei conteggi delle sezioni `vcOre` (421) e `vcSquadre` (422). `vcRecords` contiene 5.116 elementi nella copia UI contro 5.120 nel workspace di sincronizzazione; i quattro record esclusi dal filtro delle sole commesse sono due da `oreReports` e due da `squadreStorico`, instradati nelle rispettive sezioni.
- [ ] Dei 1.290 record `vcRecords` senza percorso esatto nello snapshot corrente, 973 sono annidati sotto una radice di commessa corrente ma non hanno corrispondenza esatta né in `current_sync` né in `previous_sync`. La sorgente sincronizzata contiene 328 `lavorazioni`, 260 `impianti` e 253 `impiantiFisici`; l’identità e la freschezza dei record annidati conservati devono essere riconciliate prima del cutover.
- [ ] I risultati non attestano parità semantica completa, utenti/account pronti, copertura funzionale o ripristino. Nessun cutover produzione è stato eseguito.

## Primo trasferimento della sorgente corrente in Oracle staging (27 ottobre 2026)

- [x] Lo script incrementale ha letto e validato 3.813 record `source='firebase'` e `pending=false` da `varga_sync_state`.
- [x] Upsert transazionale in `vg.cantieri_source_stage`: 3.813 righe elaborate; staging totale 6.244. I record presenti solo nello storico sono rimasti.
- [x] Nessun workspace o sezione `vc*` è stato modificato; nessuna cancellazione eseguita.
- [ ] Prossimo passaggio: mappare i documenti staging nelle sezioni del workspace candidato su una copia isolata, validare conteggi e associazioni, poi collegare l'anteprima originale a tale copia.
- [ ] Il trasferimento staging non è ancora sincronizzazione automatica né cutover di produzione.



## Workspace Gestionale sincronizzato (27 ottobre 2026)

- [x] Creato `gestionale_cantieri_sync_20261027` come copia isolata del candidato precedente; i membri sono stati copiati con accesso in sola lettura.
- [x] Mappati i dati `current_sync` nelle sezioni Cantieri: `vcCommesse` 20, `vcImpianti` 67, `vcOre` 419, `vcRecords` 5.103, `vcSquadre` 420, `vcUtenti` 149, `vcSegnalazioni` 0.
- [ ] Il controllo schermate ha rilevato che i payload `current_sync` possono usare involucri Firestore `{t,v}` e che i record grezzi non bastano per riempire le sezioni operative. Il nuovo mapper decodifica i tag standard, proietta le commesse radice nelle sezioni `jobs` e `clients` e stampa i conteggi di controllo; la sua esecuzione sul server deve ancora essere verificata.
- [x] Anteprima originale pubblicata con il workspace sincronizzato; CSS originale identico verificato e endpoint staging protetto.
- [x] Preparati ciclo ripetibile e timer systemd ogni 5 minuti, con lock, timeout e script di rimozione reversibile.
- [x] Timer systemd installato e verificato attivo ogni cinque minuti; l'ultimo ciclo osservato è terminato con codice 0.
- [ ] Rimangono esclusi dal cutover produzione e dallo spegnimento Firebase; il workspace di sincronizzazione è una preview isolata e in sola lettura.
