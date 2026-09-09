# Preventivi: modello Avola v129

## Modifica
Un unico generatore PDF a cinque colonne alimenta le esportazioni normale e compilabile, dai preventivi correnti e salvati. Le misure derivano dal PDF di riferimento fornito: margine sinistro 147.42 pt, destinatario a 374.16 pt, titolo a 147.42 pt dall'alto, tabella a 277.44 pt, totale a sinistra. I testi più lunghi si dispongono su righe successive, le lavorazioni proseguono su più pagine. L'unità compare nel prezzo e nella quantità; i prezzi unitari conservano i decimali. Timbro e firma restano nel componente già configurato dall'utente.

## Carta intestata e caratteri
Per non mettere i PDF dei clienti né risorse tipografiche del documento nel repository pubblico, la carta intestata originale si importa una sola volta da un pacchetto JSON pulito tramite CARICA MODELLO AVOLA nel form Preventivi. Il pacchetto consegnato separatamente contiene esclusivamente carta intestata, le risorse PDF necessarie e relative metriche; non contiene il contenuto del preventivo di riferimento, il suo timbro o la firma.
Il modello viene salvato nella configurazione azienda, preservata anche modificando i dati aziendali. In assenza del pacchetto si usa l'immagine già presente e Helvetica. Il PDF originale include un sottoinsieme di caratteri: caratteri nuovi assenti da quel sottoinsieme usano un sostituto; l'interfaccia lo segnala. Non si dichiara identità pixel per pixel in ogni documento.

## PDF compilabile
I campi hanno un aspetto iniziale costruito con le stesse coordinate del PDF normale; i testi devono risultare visibili anche senza la rigenerazione automatica dei campi nel lettore. Dopo una modifica manuale il lettore PDF può ricostruire l'aspetto usando il font di riserva. I totali nei campi PDF non si ricalcolano automaticamente: modificare i dati nel gestionale e rigenerare il PDF normale per inviarlo al cliente.

## Verifica
26 test Node/pdf-lib con dati sintetici: coordinate, cinque colonne, decimali, quantità zero, testi lunghi, interruzioni pagina, callback firma, costruzione PDF reale, campi e integrazione nel codice di produzione. Quattro verifiche Python controllano testo e limiti pagina e confrontano normale/compilabile con MuPDF e Poppler. Confronto locale ulteriore dei due PDF caricati dall'utente, mai inclusi nel repository o negli artifact pubblici. Non eseguite prove con login nel workspace aziendale.

Non sono modificati listini, preventivi archiviati, sincronizzazione cloud, stato dei preventivi o importazione/esportazione Excel. Viene cambiata solo la generazione PDF e aggiunta la configurazione del modello.
