# Varga Gestionale → Oracle | Avanzamento operativo

**Aggiornato al 27 ottobre 2026.** Evidenza: output delle verifiche sulla VM, API HTTPS e collaudo Oracle. Aggiornare dopo ogni nuova milestone; non è un monitoraggio in tempo reale.

## Completato
- [x] PostgreSQL + API isolate installate sulla VM Oracle; health interno ed esterno ready=true
- [x] Export autenticato cloud/browser del 27 ottobre, SHA256 trasferimento verificato
- [x] Riconciliazione dei backup 15/19/27 ottobre, 29 sezioni attuali e archivio storico di revisione
- [x] Importazione PostgreSQL workspace gestionale_backup_20261027: 30 sezioni e identità JSON verificata
- [x] Account Oracle admin di sola lettura: login riuscito
- [x] API HTTPS del Gestionale e pagina di collaudo: raggiungibili e testate

## Mancante, in ordine di priorità
- [x] Preparazione persistenza rete vg-gestionale-edge e asset Nginx: web Compose aggiornato sulla VM, API Compose aggiornato nel repository; container non ricreati
- [ ] Verificare che il successivo deploy dei container Varga conservi rete, file e configurazione senza interferire con AzuraCast
- [x] Prima interfaccia Oracle-only di consultazione sviluppata in oracle/console.html e oracle/console.js, test automatizzati superati; NON ancora pubblicata sul server
- [ ] Pubblicare e collaudare la console Oracle read-only con oracle/publish_oracle_console.py; il frontend completo è ancora da migrare
- [ ] Migrare autenticazione, utenti, ruoli, recupero password e autorizzazioni collegate a Varga Cantieri
- [ ] Migrare lettura/scrittura e sincronizzazione a sezioni, revisioni, salvataggi locali e dati Cantieri
- [ ] Collaudare moduli preventivi, consuntivi, commesse, fatture, documenti, stampa PDF e Google Drive
- [ ] Confrontare aggiornamenti inseriti dopo il backup del 27 ottobre, importare e validare la versione finale
- [ ] Pianificare cutover e ripristino; rimuovere Firebase solo dopo verifiche complete

## Prossima azione
Da Windows PowerShell eseguire git pull --ff-only e sudo python3 oracle/publish_oracle_console.py sulla VM. Pubblica soltanto nuovi asset della console Oracle, senza toccare il frontend Firebase in uso, la radio o il database. Aprire poi https://gestionale.radio-romanii-italia.duckdns.org/oracle/console.html per il collaudo.

## Metodo di lavoro per accelerare
Procedere in parallelo sul codice del frontend e sulle verifiche backend; usare un solo comando per blocco; segnalare a ogni aggiornamento completato/mancante/prossimo passo.
Non pubblicare backup/credenziali; non toccare Varga Cantieri né AzuraCast.
