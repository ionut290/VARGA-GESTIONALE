# Cassaforte Drive per Varga Gestionale

Il Gestionale resta su GitHub Pages. La funzione `callVargaBridgeVault` del progetto Firebase `hera-app-6cd2b` verifica l'accesso dell'account proprietario e inoltra le richieste ad Apps Script. La chiave non viene inviata al browser.

## Attivazione

1. Nel progetto Google Cloud/Firebase `hera-app-6cd2b`, creare in Secret Manager due segreti con una versione abilitata: `VARGA_MAP_TOKEN` (stesso valore delle proprietà dello script Apps Script) e `VARGA_MAP_BRIDGE_URL` (URL della Web App Apps Script che termina in `/exec`). Non inserire i valori in GitHub, nel codice o in chat.
2. Dopo aver creato i segreti, aggiungere `functions:callVargaBridgeVault` alla lista `--only` nel workflow `hera-app/.github/workflows/deploy-firebase-functions.yml` e pubblicare/deployare la funzione. Il service account Firebase Functions deve poter leggere entrambi i segreti.
3. Accedere al Gestionale con l'account proprietario e premere **TESTA COLLEGAMENTO** in Impostazioni → Azienda. Il primo collegamento riuscito tramite la funzione cancella il token corrente dalle impostazioni locali e aziendali; le chiamate successive usano la cassaforte.
4. Ruotare la vecchia chiave in Apps Script e aggiornare il segreto `VARGA_MAP_TOKEN`: vecchi backup o versioni storiche dei dati sincronizzati possono contenere la chiave precedente.

Finché la funzione non risponde, il collegamento esistente continua a funzionare. Non eliminare la chiave dal Gestionale prima del primo test riuscito della cassaforte.
