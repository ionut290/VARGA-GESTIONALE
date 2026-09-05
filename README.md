# Varga Gestionale Cloud — MVP 3

Gestionale aziendale multiutente orientato a preventivi, clienti, commesse e documenti.

## Repository ufficiale e aggiornamenti
Questo repository è la fonte unica del progetto **Varga Gestionale**.

Gli aggiornamenti futuri devono essere applicati agli stessi file sorgente tramite nuovi commit GitHub. Non creare per ogni modifica copie del progetto come `Varga-Gestionale-v2`, `v3`, nuovi ZIP o file duplicati. GitHub conserva automaticamente la cronologia delle versioni e permette di tornare a un commit precedente quando necessario.

File sorgente stabili principali:
- `index.html` — interfaccia;
- `style.css` — grafica;
- `app.js` — bootstrap stabile;
- `app-core.js` — dati, navigazione e rendering;
- `app-business.js` — clienti, preventivi, commesse, prezziari e documenti;
- `app-varga.js` — importazione Varga Cantieri;
- `app-sync.js` — snapshot, sincronizzazione e consuntivi;
- `app-cloud.js` — Firebase, multiutente e backup.

## Pubblicazione online senza Netlify
La pubblicazione è predisposta con **GitHub Pages** tramite il workflow `.github/workflows/pages.yml`.

URL previsto dell'app:
`https://ionut290.github.io/VARGA-GESTIONALE/`

Ogni push su `main` avvia automaticamente la pubblicazione su GitHub Pages.

Per la prima attivazione del repository, in GitHub usare:
`Settings → Pages → Build and deployment → Source → GitHub Actions`.

Dopo questa attivazione iniziale non serve ripetere l'operazione: i successivi aggiornamenti su `main` vengono pubblicati automaticamente.

## Funzioni incluse
- Dashboard aziendale
- Clienti e anagrafiche
- Prezzari manuali e importazione Excel XLSX/XLS/CSV
- Ricerca intelligente locale delle voci del prezzario
- Preventivi con calcoli IVA/sconto e stampa PDF
- Conversione preventivo → commessa
- Commesse/lavori
- Registro fatture/incassi
- Spese
- Scadenze
- Archivio documenti con link Google Drive, cliente e commessa associati
- Backup JSON e backup in cartella PC/Google Drive Desktop
- Firebase Authentication Email/Password
- Firestore multiutente in tempo reale
- Cache locale nel browser
- Collegamento con Varga Cantieri e generazione bozze consuntive dalle lavorazioni completate

## Come funziona il cloud
I dati gestionali e i metadati dei documenti vengono sincronizzati in Firestore. L'app mantiene anche una copia locale sul PC.
Google Drive non viene interrogato per mostrare continuamente gli elenchi: nel gestionale viene salvato il link Drive del documento insieme a nome, categoria, cliente e commessa. Drive viene aperto solo quando l'utente sceglie “Apri in Drive”.

## Configurazione Firebase
1. Crea un progetto Firebase.
2. Crea una Web App e copia l'oggetto `firebaseConfig`.
3. Abilita Authentication > Email/Password.
4. Crea Firestore Database.
5. In Varga Gestionale apri `Cloud / Utenti` e incolla la configurazione.
6. Usa lo stesso `Workspace condiviso` su tutti i PC (es. `varga-azienda`).
7. Crea o accedi con gli utenti autorizzati.

Per l'accesso Google da GitHub Pages, aggiungere anche `ionut290.github.io` tra i domini autorizzati di Firebase Authentication.

### Regole Firestore iniziali consigliate per un test privato
Per la produzione servono regole per workspace/ruoli. Per un test limitato ai soli utenti autenticati, la collection usata è:
`vargaGestionaleWorkspaces/{workspaceId}`

Non lasciare il database pubblico.

## Nota limite MVP cloud
Questa versione sincronizza lo stato principale in un singolo documento Firestore per ridurre al minimo le letture e semplificare il realtime. Per sicurezza applica un limite operativo di circa 850 KB. Quando i prezzari diventeranno molto grandi, la versione desktop definitiva dovrà separare i prezzari in collezioni/chunk dedicati.

## Avvio
Online: usare GitHub Pages.
In locale: aprire `index.html` con Chrome o Edge.

## Varga Gestionale Desktop per Windows
Il repository contiene anche il progetto Tauri della versione installabile per Windows.

- L'app desktop apre la versione ufficiale pubblicata su GitHub Pages.
- Le modifiche alle funzioni del gestionale diventano disponibili automaticamente, senza reinstallazione.
- I dati condivisi continuano a essere sincronizzati tramite Firebase.
- GitHub Actions genera due installatori: `.exe` (NSIS) e `.msi`.

Il workflow `Crea Varga Gestionale Desktop` parte quando viene modificata la cartella `src-tauri` oppure può essere avviato manualmente da **Actions**. Gli installatori vengono pubblicati nella sezione **Releases** del repository.
