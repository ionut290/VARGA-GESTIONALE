# Varga Gestionale → Oracle | Avanzamento operativo

## REQUISITO VINCOLANTE: INTERFACCIA IDENTICA

La versione finale deve essere graficamente e funzionalmente **identica** a https://ionut290.github.io/VARGA-GESTIONALE/: stessi menu, dashboard, schermate, campi, pulsanti, CSS e flussi di lavoro. Il lavoro Oracle riguarda **solo backend, autenticazione, autorizzazioni, API, salvataggio e sincronizzazione** dell'originale. **Non sostituire index.html con oracle/console.html**, non trasferire il design della console separata al prodotto finale.

Guardrail CI: oracle/tests/test_ui_parity_guard.py verifica l'identità dei file originali index.html, style.css, view-scenes.js, ui-overhaul.js e desktop-varga-navigation.js; qualsiasi modifica richiede revisione esplicita dell'identità grafica. Le modifiche al backend devono essere fatte in adapter/moduli distinti, preferibilmente tramite il bootstrap esistente app.js senza toccare il markup.

La pagina /oracle/console.html è solo un laboratorio di collaudo amministrativo, NON è il nuovo aspetto di Varga Gestionale.


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
- [x] Console diagnostica Oracle separata sviluppata e pubblicata, senza sostituire il Gestionale originale
- [x] Console Oracle read-only pubblicata sulla VM e disponibile via HTTPS
- [x] Anteprima read-only creata **dalla stessa index.html originale**, con CSS originale, loader Oracle separato, senza eseguire script Firebase o scrivere sullo storage del browser; test di parità HTML e sicurezza implementati
- [x] Pubblicazione di /oracle/original-preview.html completata: CSS SHA256 originale verificato, entrambi gli asset pubblicati e pagina pubblica HTTPS confermata
- [ ] Portare il codice del Gestionale ORIGINALE su backend Oracle mantenendo index.html, style.css, menu e interfaccia identici
- [ ] Migrare autenticazione, utenti, ruoli, recupero password e autorizzazioni collegate a Varga Cantieri
- [x] Sandbox Oracle creato e collaudato sulla VM (4 sezioni fittizie); API scrittura OK, conflitto revisione HTTP 409 OK e ripristino record OK; workspace aziendale di 30 sezioni invariato
- [x] Preparata la schermata Clienti della grafica originale per salvare **soltanto clienti DEMO** nel workspace sintetico, con gestione conflitti; test automatici superati
- [ ] Pubblicare /oracle/original-sandbox.html (HTML/CSS identici all'originale), collaudare un cliente DEMO sul sito
- [ ] Migrare lettura/scrittura e sincronizzazione a sezioni, revisioni, salvataggi locali e dati Cantieri
- [ ] Collaudare moduli preventivi, consuntivi, commesse, fatture, documenti, stampa PDF e Google Drive
- [ ] Confrontare aggiornamenti inseriti dopo il backup del 27 ottobre, importare e validare la versione finale
- [ ] Pianificare cutover e ripristino; rimuovere Firebase solo dopo verifiche complete

## Prossima azione
Prossima azione: da Windows PowerShell effettuare git pull --ff-only e sudo python3 oracle/publish_original_sandbox.py. Lo script controlla che lo stile attivo sia identico all'originale e pubblica SOLTANTO /oracle/original-sandbox.html e /oracle/original-sandbox.js. Il Gestionale principale, l'anteprima di sola lettura, il database reale, Firebase e la radio non vengono modificati. Aprire la nuova pagina, autenticarsi Oracle, selezionare Clienti e inserire un nome che inizi con DEMO. I salvataggi saranno limitati a gestionale_sandbox_20261027.

## Metodo di lavoro per accelerare
Procedere in parallelo sul codice del frontend e sulle verifiche backend; usare un solo comando per blocco; segnalare a ogni aggiornamento completato/mancante/prossimo passo.
Non pubblicare backup/credenziali; non toccare Varga Cantieri né AzuraCast.
