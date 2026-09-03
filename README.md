# Varga Gestionale Cloud — MVP 3

Gestionale aziendale multiutente orientato a preventivi, clienti, commesse e documenti.

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

### Regole Firestore iniziali consigliate per un test privato
Per la produzione servono regole per workspace/ruoli. Per un test limitato ai soli utenti autenticati, la collection usata è:
`vargaGestionaleWorkspaces/{workspaceId}`

Non lasciare il database pubblico.

## Nota limite MVP cloud
Questa versione sincronizza lo stato principale in un singolo documento Firestore per ridurre al minimo le letture e semplificare il realtime. Per sicurezza applica un limite operativo di circa 850 KB. Quando i prezzari diventeranno molto grandi, la versione desktop definitiva dovrà separare i prezzari in collezioni/chunk dedicati.

## Avvio
Estrarre lo ZIP e aprire `index.html` con Chrome o Edge. Per l'app Windows installabile, il progetto potrà essere impacchettato successivamente con Tauri.
