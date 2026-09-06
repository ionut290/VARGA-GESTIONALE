/*
VARGA GESTIONALE - ARCHIVIO DOPPIO CONSUNTIVI DEPURAZIONE
Mantiene il salvataggio principale esistente e crea automaticamente
una copia identica del PDF anche nella cartella Drive indicata dall'amministratore.
*/

const DEPURAZIONE_CONSUNTIVI_SECONDARY_ROOT_ID = '15aCYTerAtaNCJHvnzQmEgxbMxf8HWCFX';

// La funzione originale e' definita in google-apps-script-map-bridge.gs.
// Le dichiarazioni di funzione di Apps Script sono disponibili nel namespace globale;
// conserviamo quindi il comportamento originale e aggiungiamo solo il secondo archivio.
const saveDepurazioneConsuntivoPrimary_ = saveDepurazioneConsuntivo_;

saveDepurazioneConsuntivo_ = function(payload) {
  // 1) Salvataggio principale invariato.
  const primary = saveDepurazioneConsuntivoPrimary_(payload);

  // 2) Copia aggiuntiva nella cartella Drive richiesta.
  const raw = String(payload && payload.base64 || '');
  const plant = safe_(payload && payload.plantName || 'Impianto');
  const dateKey = String(payload && payload.dateKey || '').replace(/[^0-9]/g, '');
  if (!raw || !/^[0-9]{8}$/.test(dateKey)) {
    throw new Error('PDF, data o impianto non validi per archivio secondario');
  }

  const bytes = Utilities.base64Decode(raw);
  if (bytes.length > 8 * 1024 * 1024) {
    throw new Error('Il PDF supera il limite di 8 MB');
  }

  const secondaryRoot = DriveApp.getFolderById(DEPURAZIONE_CONSUNTIVI_SECONDARY_ROOT_ID);
  const folderName = dateKey + ' - ' + plant;
  const secondaryFolder = getOrCreateFolder_(secondaryRoot, folderName);
  const fileName = dateKey + ' - ' + plant + '.pdf';

  // Evita duplicati quando un consuntivo viene completato nuovamente dopo una modifica.
  const existing = secondaryFolder.getFilesByName(fileName);
  while (existing.hasNext()) existing.next().setTrashed(true);

  const secondaryFile = secondaryFolder.createFile(
    Utilities.newBlob(bytes, 'application/pdf', fileName)
  );

  return Object.assign({}, primary, {
    secondaryFolderId: secondaryFolder.getId(),
    secondaryFolderUrl: secondaryFolder.getUrl(),
    secondaryFileId: secondaryFile.getId(),
    secondaryFileUrl: secondaryFile.getUrl()
  });
};
