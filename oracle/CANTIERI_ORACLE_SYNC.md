# Sincronizzazione Varga Cantieri → Varga Gestionale (Oracle)
Fonte: PostgreSQL Cantieri `db-postgres-1`, database `varga_cantieri`.
Destinazione: database Gestionale `vg-gestionale-oracle`, workspace candidato `gestionale_candidate_20261027`.

## Stato
Il candidato contiene già `vcCommesse`, `vcImpianti`, `vcOre`, `vcRecords`, `vcSquadre`, `vcUtenti`, `vcSegnalazioni` dalla precedente esportazione browser, **non è vuoto**. La fonte Cantieri è più recente e va confrontata senza duplicare i dati.

## Percorso richiesto prima di attivare l'automatico
1. Eseguire `inventory_cantieri_source.sh`, sola lettura, per verificare che la fonte Oracle sia disponibile e quali raccolte siano presenti.
2. Estrarre e mappare *in privato* il modello `public.pu` di Cantieri per ricostruire gli stessi oggetti `vc*`; non presumere corrispondenza tra `collection_name` e chiavi `vc*`.
3. Calcolare chiavi stabili e confrontare ID/hash; definire cancellazioni, allegati, aggiornamenti e referenze, con quarantena dei conflitti.
4. Eseguire un'importazione atomica solo verso un workspace di sincronizzazione distinto dal candidato, dopo backup e verifica dei conteggi/hash. Non cambiare dati Cantieri.
5. Solo dopo confronto esatto + test di riavvio e di conflitto, predisporre timer `systemd` con blocco concorrenza `flock`, logging essenziale, checkpoint e recupero.
6. Fare il cutover del workspace di produzione solo dopo la migrazione completa dell'app; mai scrivere nei workspace `gestionale_backup_*`.

**Non impostare sincronizzazione automatica né affermare che i dati siano copiati finché lo schema della fonte e le chiavi non sono confermati.**
