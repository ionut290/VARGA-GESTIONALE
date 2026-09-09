# Prezziari: persistenza v127

## Ambito
Corregge la perdita dei prezziari alla riapertura, l'omissione delle voci dal salvataggio locale dopo un download e dalla migrazione legacy, e il falso messaggio di condivisione riuscita dopo un errore cloud. Nessun listino aziendale è incluso nel codice o nei test.

## Strategia
- IndexedDB conserva in una sola transazione nomi, voci, revisione locale, stato in attesa e versioni cloud riconosciute, separati per workspace.
- Prima di un cambiamento si conserva il catalogo precedente nella stessa transazione. Il vecchio IndexedDB e i vecchi documenti cloud non vengono eliminati.
- La memoria viene aggiornata soltanto a transazione completata; localStorage rimane una cache compatibile, non la fonte autorevole.
- I blocchi cloud sono preparati con una generazione distinta. Soltanto una transazione finale sul manifest rende leggibile la generazione completa. Download incompleti o con versioni discordanti non sostituiscono i dati locali.
- Gli aggiornamenti simultanei vengono bloccati con controllo delle versioni, senza unione automatica o cancellazioni implicite.
- Lo stato distingue salvataggio sul dispositivo, condivisione in attesa ed effettiva conferma cloud. È disponibile un'esportazione delle copie locali corrente e precedente.

## Verifica
`python tests/test_catalog_browser.py` esegue 26 scenari su Chromium e IndexedDB reali in un'origine HTTP locale, con dati sintetici. Firestore e il confine del parser XLSX sono doppi di test: questi test non certificano le regole Firestore, l'autenticazione o il sistema di produzione. La pipeline PR esegue gli stessi controlli.

## Rilascio
Prima del rilascio verificare l'esito della pipeline e conservare un backup aziendale. Fare ricaricare la nuova versione a tutti i dispositivi e chiudere le schede con codice precedente: i vecchi client non comprendono il puntatore `catalogGeneration`. Il percorso dei documenti rimane sotto la collezione appConfig, con lo stesso prefisso workspace. Le regole effettive e l'archivio cloud aziendale non sono stati modificati o verificati con credenziali di produzione.

## Limiti
Una cancellazione dei dati del browser, un guasto al dispositivo o un'azione effettuata da un vecchio client non sono esclusi da questo intervento. Conservare backup esterni e verificare la conferma cloud. In presenza di un conflitto si conserva la copia locale e si interrompe la sincronizzazione, richiedendo una verifica esplicita prima della riconciliazione. Le generazioni caricate ma non pubblicate non vengono eliminate automaticamente, per evitare cancellazioni pericolose.
