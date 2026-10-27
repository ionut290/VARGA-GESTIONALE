## Confronto Firebase del 27 ottobre 2026 (audit sola lettura)
- [x] Archivio Oracle preesistente: 30 sezioni e 34.403 elementi in array; identità JSON con snapshot privato verificata.
- [x] Nuovo export autenticato: 17 sezioni Firebase e 29 sezioni locali del browser.
- [x] Nuove righe rispetto alla fotografia precedente: 2 `consuntivi`, 1 `depurazioneConsuntivi`, 1 `economicEntries`, 5 `vcRecords` (nel browser). Inoltre 25 consuntivi condivisi hanno contenuto modificato.
- [x] Nessuna differenza materiale rilevata tra le liste Firebase e browser confrontabili; gli oggetti `company` e `priceCatalog` richiedono confronto strutturale separato.
- [ ] La sezione `migrationReview` è metadato dello staging precedente, non cancellarla.
- [ ] Realizzare nuova fotografia immutabile con identificatore diverso dallo staging 20261027; NON tentare di riutilizzare `stage_reconciled.sh` contro lo stesso workspace.
- [ ] Verificare integrità della nuova fotografia, blocchi documentali e ripristino prima di cutover. Nessuna abilitazione produzione ora.


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

## Estensione isolata database DEMO (27 ottobre 2026)
- [x] Preparata `oracle/extend_accounting_demo.sql`: inserimento **solo delle sezioni DEMO mancanti** `invoices`, `priceLists`, `entries` in un'unica transazione PostgreSQL; non modifica sezioni già esistenti grazie a `ON CONFLICT DO NOTHING`.
- [x] Aggiunto test Python statico in `oracle/tests/test_extend_accounting_demo.py`, rilevato automaticamente dalla pipeline unittests.
- [ ] Script SQL **NON eseguito su Oracle**: richiede collaudo e verifica prima dell'applicazione al workspace fittizio.
- [ ] Collegare form e pulsanti ai nuovi moduli dopo la creazione verificata delle sezioni DEMO sul server.

## Lotto Oracle DEMO completo — 27 ottobre 2026
- [x] Collegata la lettura delle 16 sezioni nel laboratorio originale (non produzione).
- [x] Preparata estensione additiva delle 9 sezioni aggiuntive via `extend_remaining_demo.sql`.
- [x] Creato `deploy_demo_batch.sh` per aggiornare schema e pagina DEMO nello stesso intervento, con interruzione automatica se fallisce SQL.
- [x] Aggiunti controlli statici di sicurezza `tests/test_deploy_demo_batch.py`.
- [ ] La pipeline CI aggiornata deve essere verificata prima del deploy.
- [ ] **Non completati**: backend di scrittura per tutti i moduli, permessi definitivi, documenti binari, integrazioni Google, sincronizzazione online/offline, riconciliazione finale da Firebase, backup/ripristino e release produzione.
- [ ] Solo dopo queste verifiche autorizzare lo spegnimento di Firebase. La pagina DEMO non è la nuova produzione.

## Prossima azione
Prossima azione: i tre salvataggi DEMO sono confermati dall'utente nel browser reale; verificare in due sessioni il comportamento con modifiche concorrenti e che non vi siano sovrascritture. Collaudare perdita di connessione, recupero manuale IndexedDB e collisioni multi-sessione; poi implementare Fatture, Consuntivi e Prezzari in workspace DEMO separato prima delle prove sul dataset aziendale. Non trattare il componente come sincronizzazione offline di produzione. Per la produzione restano persistenza offline, autenticazione colleghi/ruoli, test moduli e cutover finale.

## Estensione dei moduli DEMO — 27 ottobre 2026
- [x] Aggiunte prove di scrittura revision-safe per Spese, Scadenze, Documenti (solo metadati) e Dati azienda, oltre ai moduli DEMO esistenti.
- [x] I validatori rifiutano dati non prefissati `DEMO`, impediscono riferimenti a clienti/commesse non dimostrativi e non inviano link Drive né eventi Google Calendar.
- [x] Recupero delle bozze DEMO esteso alle nuove sezioni; il publisher controlla il nuovo asset prima di copiare qualunque file.
- [x] Test mock browser: 7 sezioni scritte solo nel workspace `gestionale_sandbox_20261027`; test negativi su dati reali; grafica HTML/CSS originale immutata.
- [x] Suite Python completa: 75 test superati. Test Node per il browser mock, bridge e validatori superati.
- [ ] **Non pubblicato sulla VM Oracle:** aggiornati codice e controlli soltanto nel repository. Nessuna migrazione del workspace aziendale, Firebase o container eseguita.
- [ ] Da fare prima di usare il laboratorio sulla VM: applicare l'estensione SQL solo al workspace sintetico con `sudo bash oracle/deploy_demo_batch.sh`, poi provare le quattro nuove schermate con account di test e verificare revisioni/conflitti da due sessioni.
- [ ] Restano fuori da questo lotto: fatture fiscali/SDI, upload binari e Drive, Calendar, email, modifica dei dati sorgente Varga Cantieri, autenticazione e autorizzazioni di produzione, sincronizzazione offline completa e cutover.

## Metodo di lavoro per accelerare
Procedere in parallelo sul codice del frontend e sulle verifiche backend; usare un solo comando per blocco; segnalare a ogni aggiornamento completato/mancante/prossimo passo.
Non pubblicare backup/credenziali; non toccare Varga Cantieri né AzuraCast.
