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
- [x] Mappati i dati `current_sync` nelle sezioni Cantieri: `vcCommesse` 20, `vcImpianti` 67, `vcOre` 419, `vcRecords` 5.103, `vcSquadre` 420, `vcUtenti` 149, `vcSegnalazioni` 0.
- [ ] Il controllo schermate ha rilevato che i payload `current_sync` possono usare involucri Firestore `{t,v}` e che i record grezzi non bastano per riempire le sezioni operative. Il nuovo mapper decodifica i tag standard, proietta le commesse radice nelle sezioni `jobs` e `clients` e stampa i conteggi di controllo; la sua esecuzione sul server deve ancora essere verificata.
- [x] Anteprima originale pubblicata con il workspace sincronizzato; CSS originale identico verificato e endpoint staging protetto.
- [x] Preparati ciclo ripetibile e timer systemd ogni 5 minuti, con lock, timeout e script di rimozione reversibile.
- [x] Timer systemd installato e verificato attivo ogni cinque minuti; l'ultimo ciclo osservato è terminato con codice 0.
- [ ] Rimangono esclusi dal cutover produzione e dallo spegnimento Firebase; il workspace di sincronizzazione è una preview isolata e in sola lettura.


## Confronto JSON normalizzato sorgente–staging — 28 ottobre 2026

Eseguito sul server dopo il fast-forward del branch `main`; la modifica locale al mapper è stata conservata in uno stash prima dell'aggiornamento. Output del confronto in sola lettura:
- 3.830 percorsi correnti comuni tra `public.varga_sync_state` e `vg.cantieri_source_stage`.
- 3.830 payload uguali dopo la decodifica dei valori legacy; 0 payload differenti e 0 record presenti soltanto nella sorgente.
- 2.431 percorsi presenti soltanto nello staging storico, conservati senza sovrascrittura o cancellazione.
- Raccolte confrontate: calendarEvents, commesse, mezzi, neve_squadre, neve_squadre_storico, oreApprovalRequests, oreReports, personale, servizioNeveClienti, squadreCommesse, squadreStorico, verdeLevatoCommesse, verdeLevatoRecords.

Questo dimostra la parità dei payload fra la sorgente Oracle `varga_sync_state` e lo staging alla data dell'esecuzione. Non prova da solo che la sorgente sia completa o aggiornata rispetto a Firebase/Cantieri, né risolve la mappatura applicativa dei 973 percorsi annidati già rilevati senza corrispondenza esatta. La sincronizzazione dell'interfaccia resta quindi da riconciliare prima del cutover.


## Cicli automatici successivi all'aggiornamento — 28 ottobre 2026

Dopo il fast-forward del checkout Oracle alla versione `1e4051d`, due cicli del servizio `varga-cantieri-sync.service` sono terminati con `Result=success`, `ExecMainStatus=0` e messaggio `MAPPATURA COMPLETATA`:
- 17:45 UTC — completato alle 17:45:29 UTC.
- 17:50 UTC — completato alle 17:50:50 UTC.

I log confermano che `gestionale_candidate_20261027` non è stato modificato. Questi cicli attestano l'esecuzione ripetuta dello staging e mapper isolati; non attestano ancora completezza della sorgente Cantieri rispetto a Firebase né parità completa delle sezioni dell'app.
