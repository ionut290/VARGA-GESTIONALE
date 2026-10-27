# Varga Gestionale → Oracle: installazione e trasferimento

**Stato al 27 ottobre 2026:** backend FastAPI e PostgreSQL isolati installati sulla VM Oracle; backup storici 15 e 19 ottobre importati in due workspace di prova (28 sezioni ciascuno). Export autenticato del 27 ottobre trasferito in cartella privata, integrità SHA256 verificata: 17 sezioni Firebase e 29 sezioni locali browser. L'export del 27 ottobre **non è ancora importato**, i dati locali non sono ancora riconciliati e il frontend usa tuttora Firebase. Non dismettere Firebase né sovrascrivere workspace di produzione.

Per il confronto non distruttivo fra storico, cloud e browser, sulla VM usare `python3 oracle/audit_three_way.py /home/ubuntu/gestionale-private/Varga-Gestionale-backup-2026-10-19.json /home/ubuntu/gestionale-private/Varga-Gestionale-live-2026-10-27.json` dalla radice del clone dopo `git pull --ff-only`. Lo script mostra solo nomi di sezioni e conteggi, non esporta dati. Solo dopo riconciliazione e collaudi si valuta il cutover.

## Componenti pronti nel branch

- Backend FastAPI isolato `oracle/backend/main.py` e database PostgreSQL `oracle/schema.sql`.
- Compose con **nome stack distinto**, limiti di memoria, nessuna porta PostgreSQL aperta e API solo su loopback `127.0.0.1:18098`.
- `oracle/install_on_vm.sh` genera una password nuova e privata, controlla risorse e porta, costruisce solo lo stack separato e verifica health.
- `oracle/export_firestore.py`: esportazione **con autorizzazione di servizio** dello snapshot reale, inclusa struttura incremental-v3 con manifest, sezioni e blocchi prezziario.
- `oracle/browser-export.js`: esportazione alternativa dal **browser autorizzato come admin**, per archivi cloud e dati locali. Viene caricato solo dalla versione del sito che include `app.js` aggiornato e solo con `?oracle-export=1`. L'esportazione deve essere avviata manualmente con click e salva un file locale: non effettua upload automatici.
- `oracle/backend/admin.py`: bootstrap di utenti locali e importazione dello snapshot su database nuovo/non utilizzato con controllo hash SHA256.
- `oracle/pilot.html` + `client.js`: pagina di collaudo API con login Oracle e sola lettura delle quantità dei record. Questa pagina **non** è la nuova app Gestionale completa.

## VM Oracle: comandi del proprietario

Da Windows PowerShell si accede alla VM con la propria chiave privata autorizzata; non copiare mai la chiave dentro GitHub, qui o nei log. **Nella VM**, da `ubuntu`, controllare prima lo stato:

```bash
cd ~
git clone --branch audit/oracle-gestionale-20261027 --single-branch \
  https://github.com/ionut290/VARGA-GESTIONALE.git gestionale-oracle-stage
cd gestionale-oracle-stage/oracle
bash preflight.sh
```

Se il preflight mostra disco e RAM sufficienti, senza conflitti sulla porta `18098`, installare solo il backend isolato:

```bash
bash install_on_vm.sh
curl --fail http://127.0.0.1:18098/api/gestionale/v1/health
```

Il backend non è automaticamente pubblico. È necessario configurare **solo la route API** del proxy HTTPS già in uso, dopo avere letto la configurazione reale del proxy. Non sostituire il sito esistente, la radio o la route Cantieri.

## Esportazione dati

### Opzione A – amministratore dal browser

Dopo il merge del loader condizionale (e solo dopo quello), aprire la versione del Gestionale con `?oracle-export=1`, accedere come admin e premere **ESPORTA TUTTI I DATI**. Il browser scarica un file JSON contenente `data` dal workspace Firestore, `local_browser_archive` e i conteggi. La copia contiene dati riservati, conservare cifrata e **non inserirla su GitHub o in chat**.

### Opzione B – Firestore Admin SDK

Su un computer amministrativo con `firebase-admin` disponibile, impostare privatamente `GOOGLE_APPLICATION_CREDENTIALS` alla service account originale e usare:

```bash
python oracle/export_firestore.py --workspace varga-azienda --output /percorso-privato/gestionale-export.json
```

Servono permessi di lettura sul workspace e configurazione Google Cloud, mai credenziali incollate in chat.

**In entrambi i casi**, identificare la versione effettiva e confrontare conteggi cloud/browser: non perdere dati da IndexedDB, Google Drive o importazioni Varga Cantieri solo locali.

## Importazione su VM

Passare il backup privato alla VM solo tramite un canale protetto e senza condividerlo nel repository. La copia temporanea può essere passata tramite stdin senza montarla nella API container:

```bash
# All'interno della cartella oracle della VM:
sha256sum /percorso-privato/gestionale-export.json
docker compose -p vg-gestionale-oracle exec -T api python -m backend.admin \
  import-snapshot --workspace varga-azienda --file - --dry-run \
  < /percorso-privato/gestionale-export.json

# SOLO dopo aver controllato i conteggi e il checksum, la prima importazione:
docker compose -p vg-gestionale-oracle exec -T api python -m backend.admin \
  import-snapshot --workspace varga-azienda --file - \
  --confirm-sha256 SHA256_64_CARATTERI \
  < /percorso-privato/gestionale-export.json
```

Non ripetere l'import su un workspace già popolato: la procedura deve rifiutare l'overwrite. Dopo la conferma, creare utenti Oracle tramite `docker compose -p vg-gestionale-oracle exec api python -m backend.admin create-user --email ... --role admin`.

## Aree ancora da portare al backend Oracle prima del taglio finale

L'applicazione completa usa ancora molte chiamate a Firebase: autenticazione condivisa Varga Cantieri, profili, recupero password, sincronizzazione incremental-v3, sincronizzazione Cantieri (callable `getVargaGestionaleChanges`, `getVargaGestionaleSnapshotChunk`, `rebuildVargaGestionaleSnapshot`), moduli commesse, impianti, squadre, gestione documenti e stato operativo. Non basta cambiare un URL.

**Non eliminare Firestore/Auth/Functions prima che l'app sia stata effettivamente portata e collaudata**, anche se non è usata dai dipendenti. I dati esistenti restano una risorsa da preservare.

## Monitoraggio, backup e verifica

1. Conservare snapshot originario integro, checksum, esportazione locale e backup PostgreSQL fuori repo.
2. Confrontare per ogni collezione contatori e ID, verificare documenti e prezziari, evitare scritture doppie.
3. Collegare proxy HTTPS, verificare isolamento e permessi admin/ufficio/operatore, tentativi di accesso non autorizzati, revisioni concorrenti.
4. Portare frontend in Oracle-only, provare preventivi, commesse, fatture, scadenze, stampa PDF, Google Drive e sincronizzazione Cantieri su dati di test.
5. Solo dopo switch definitivo e backup ripristinabile, disattivare Firebase. Non modificare container radio o Varga Cantieri.
