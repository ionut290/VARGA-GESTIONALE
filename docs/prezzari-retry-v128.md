# Riprova condivisione — v128

Il pulsante e la condivisione dopo importazione invocano ora una funzione dedicata ai prezziari, mantenendo la coda seriale comune. Non devono scaricare o riscrivere commesse, fatture e altre sezioni per pubblicare il catalogo.

Il pulsante segnala subito il tentativo, cambia etichetta e blocca i click ripetuti finché termina; espone anche i risultati risolti con ok:false. Dopo 20 secondi senza esito mostra un avviso di attesa: non annulla una richiesta Firestore che potrebbe ancora concludersi. Gli errori di accesso, permessi, catalogo incompleto e conflitto hanno messaggi distinti. Nessuna modifica alle regole Firebase o ai permessi.

Se il cloud è completo e gli ID dei nuovi listini non si sovrappongono a versioni diverse di listini esistenti, il tentativo conserva i listini remoti e aggiunge quelli nuovi. Prezzi diversi sullo stesso listino producono un conflitto, non una sostituzione automatica. Un cloud incompleto rimane bloccato con errore esplicito: non viene svuotato per far riuscire il pulsante.

La pubblicazione usa ancora generazioni immutabili e transazione finale sul manifest; le altre sezioni vengono conservate. La guardia di revisione locale impedisce di rimpiazzare modifiche nate durante la verifica. La conferma cloud non marca come sincronizzate modifiche successive all'invio.

Test: tests/test_catalog_retry.py esegue gli originali 26 scenari e 13 nuovi, inclusi click effettivo sul pulsante, errore di rete seguito da nuovo click, archivio remoto con altra sezione mancante, nuovi listini da due dispositivi e conflitti. Chromium e IndexedDB reali, Firestore simulato, nessun dato aziendale. Verificare i risultati Actions prima del rilascio. Nell'ambiente di sviluppo locale la navigazione Chromium verso il server di prova è bloccata dall'amministratore; nessun successo browser locale è dichiarato.

Dopo il rilascio: Ctrl+F5 senza cancellare i dati del browser; verificare il messaggio finale. Un test simulato non certifica l'accesso al workspace Firebase di produzione.
