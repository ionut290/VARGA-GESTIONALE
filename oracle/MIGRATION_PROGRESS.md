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
- [x] Pubblicato /oracle/original-sandbox.html con HTML e CSS originali; asset verificati e confermati tramite HTTPS esterno, primo pulsante Clienti DEMO disponibile
- [x] Preparati anche i pulsanti originali Commesse e Preventivi per scrivere soltanto nel workspace DEMO, con revisioni PostgreSQL e gestione HTTP 409; test automatici superati
- [x] Aggiunto test funzionale Node che simula un browser e salva Cliente → Commessa → Preventivo sul backend Oracle fittizio; ultimo test GitHub CI superato
- [x] Pubblicatore rafforzato: verifica via HTTPS anche il checksum della nuova versione JavaScript
- [x] Ripubblicato il JavaScript per Clienti, Commesse e Preventivi DEMO; server ha verificato HTML, JavaScript HTTPS e SHA256; test simulato intero Clienti → Commessa → Preventivo superato
- [ ] Verificare con account Oracle l'intero flusso anche dal browser reale e da una seconda sessione (utente conferma il 27 ottobre funzionamento di Clienti, Commesse e Preventivi DEMO; ancora da verificare conflitti su due sessioni e persistenza dopo refresh per ogni modulo)
- [x] Implementato adapter Oracle separato `oracle/section-bridge.js`: lettura per sezione, scritture limitate a workspace fittizio, versionamento, blocco conflitti HTTP 409, merge solo esplicito, gestione errori rete in memoria. Test Node superati.
- [x] Collegato l'adapter ai tre moduli DEMO nella stessa HTML/CSS originale e aggiornato il pubblicatore (verifica SHA256 anche dell'adapter); CI completo superato.
- [x] Pubblicato sul server l'adapter aggiornato del laboratorio con `sudo python3 oracle/publish_original_sandbox.py`: output VM commit `81c2623`, tre asset copiati e SHA256 verificati via HTTPS; dati aziendali e radio invariati. Rimane da collaudare la scrittura da browser reale.
- [ ] Migrare lettura/scrittura e sincronizzazione **persistente/offline** a sezioni, revisioni, salvataggi locali e dati Cantieri. Preparati `demo-draft-vault.js`, adapter IndexedDB e collegamento alla UI DEMO; pulsante di recupero confermato dal browser, ma persistenza/recovery dopo perdita di connessione ancora da collaudare e `section-bridge.js` conserva bozze in RAM durante la sessione.
- [ ] Collaudare moduli preventivi, consuntivi, commesse, fatture, documenti, stampa PDF e Google Drive
- [ ] Confrontare aggiornamenti inseriti dopo il backup del 27 ottobre, importare e validare la versione finale
- [ ] Pianificare cutover e ripristino; rimuovere Firebase solo dopo verifiche complete

## Verifica del passaggio definitivo (27 ottobre 2026)
- [x] Creato `oracle/audit_production_cutover.py`: controllo statico in sola lettura, che termina con codice 2 se il passaggio alla produzione non è sicuro.
- [x] Aggiornata GitHub Actions per confermare esplicitamente che l'archivio DEMO resta isolato e che la produzione è bloccata; pipeline dichiarata verde dall'utente il 27 ottobre 2026.
- [ ] Abilitare moduli reali soltanto dopo autorizzazioni server, prove in due sessioni, dati aggiornati, backup/ripristino e verifica separazione dalla radio.
- [ ] Firebase resta attivo: non esiste ancora evidenza sufficiente per rimuoverlo o convertire il workspace reale in scrittura.

## Preparazione Fatture, Consuntivi e Prezzari DEMO
- [x] Validatori puri `accounting-demo-validation.js` per fatture, consuntivi e voci prezzario, senza scritture o dati reali.
- [x] ID clienti DEMO verificati nel formato `demo-cl-*`; esclusi identificativi aziendali.
- [x] Test Node di validazione collegati a GitHub Actions; atteso esito del commit `fd4f39b`.
- [ ] Il database sandbox attuale contiene solo 4 sezioni: per Fatture/Prezzari servono sezioni DEMO aggiuntive predisposte e verificate prima di abilitare pulsanti o pubblicare.

## Prossima azione
Prossima azione: i tre salvataggi DEMO sono confermati dall'utente nel browser reale; verificare in due sessioni il comportamento con modifiche concorrenti e che non vi siano sovrascritture. Collaudare perdita di connessione, recupero manuale IndexedDB e collisioni multi-sessione; poi implementare Fatture, Consuntivi e Prezzari in workspace DEMO separato prima delle prove sul dataset aziendale. Non trattare il componente come sincronizzazione offline di produzione. Per la produzione restano persistenza offline, autenticazione colleghi/ruoli, test moduli e cutover finale.

## Metodo di lavoro per accelerare
Procedere in parallelo sul codice del frontend e sulle verifiche backend; usare un solo comando per blocco; segnalare a ogni aggiornamento completato/mancante/prossimo passo.
Non pubblicare backup/credenziali; non toccare Varga Cantieri né AzuraCast.
