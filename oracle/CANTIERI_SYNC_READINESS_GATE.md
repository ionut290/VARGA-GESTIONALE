# Oracle Cantieri -> Gestionale: readiness gate

Status: staging contains 6,125 unique business documents, but source `public.firestore_documents` in Cantieri last showed only one `test_oracle` entry.

**Do not schedule automatic imports from empty source.**

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


## Primo trasferimento della sorgente corrente in Oracle staging (27 ottobre 2026)

- [x] Lo script incrementale ha letto e validato 3.813 record `source='firebase'` e `pending=false` da `varga_sync_state`.
- [x] Upsert transazionale in `vg.cantieri_source_stage`: 3.813 righe elaborate; staging totale 6.244. I record presenti solo nello storico sono rimasti.
- [x] Nessun workspace o sezione `vc*` è stato modificato; nessuna cancellazione eseguita.
- [ ] Prossimo passaggio: mappare i documenti staging nelle sezioni del workspace candidato su una copia isolata, validare conteggi e associazioni, poi collegare l'anteprima originale a tale copia.
- [ ] Il trasferimento staging non è ancora sincronizzazione automatica né cutover di produzione.



## Workspace Gestionale sincronizzato (27 ottobre 2026)

- [x] Creato `gestionale_cantieri_sync_20261027` come copia isolata del candidato precedente; i membri sono stati copiati con accesso in sola lettura.
- [x] Mappati i dati `current_sync` nelle sezioni Cantieri tramite le regole già usate da `app-sync.js`; conteggi verificati: `vcCommesse` 20, `vcImpianti` 67, `vcOre` 419, `vcRecords` 5.103, `vcSquadre` 420, `vcUtenti` 149, `vcSegnalazioni` 0.
- [x] Anteprima originale pubblicata con il workspace sincronizzato; CSS originale identico verificato e endpoint staging protetto.
- [x] Preparati ciclo ripetibile e timer systemd ogni 5 minuti, con lock, timeout e script di rimozione reversibile.
- [ ] Il timer non è ancora installato. La sincronizzazione ricorrente partirà quando verrà eseguito `sudo bash oracle/install_cantieri_sync_timer.sh`.
- [ ] Rimangono esclusi dal cutover produzione e dallo spegnimento Firebase; il workspace di sincronizzazione è una preview isolata e in sola lettura.
