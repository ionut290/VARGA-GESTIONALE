/*
VARGA GESTIONALE - PONTE MAP GMAIL/DRIVE
Da copiare in un progetto Google Apps Script e distribuire come Web App.
Impostare nelle Proprietà script: VARGA_MAP_TOKEN = una chiave privata scelta dall'amministratore.
Creare anche un trigger temporale sulla funzione scanScheduled, ad esempio ogni ora.

ARCHITETTURA A BASSO CONSUMO FIRESTORE:
- il trigger controlla solo Gmail + Drive + ScriptProperties;
- nessuna lettura/scrittura Firestore durante i controlli periodici;
- quando trova un MAP salva una ricevuta locale nel ponte;
- Varga Gestionale, quando aperto, legge le ricevute e aggiorna una sola volta il documento del giro.
*/

const ROOT_FOLDER_NAME = 'Varga Gestionale';
const ACCOUNTING_FOLDER_NAME = 'Contabilita';
const STATE_PROP = 'VARGA_MAP_STATE';
const RECEIPTS_PROP = 'VARGA_MAP_RECEIPTS';
const MAX_RECEIPTS = 200;

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(payload.token);
    const action = String(payload.action || '');
    if (action === 'configure') {
      saveState_(payload);
      return json_({ok:true, configured:true});
    }
    if (action === 'ping') return json_({ok:true, service:'Varga MAP Bridge'});
    if (action === 'scan') {
      saveState_(payload);
      return json_(scan_(payload));
    }
    if (action === 'receipts') return json_({ok:true, receipts:loadReceipts_().filter(r=>!r.acknowledged)});
    if (action === 'acknowledge') {
      acknowledgeReceipts_(payload.receiptIds || []);
      return json_({ok:true});
    }
    return json_({ok:false, error:'Azione non supportata'});
  } catch (err) {
    return json_({ok:false, error:String(err && err.message || err)});
  }
}

function scanScheduled() {
  const payload = loadState_();
  if (!payload) return;
  scan_(payload);
}

function scan_(payload) {
  const rounds = (payload.rounds || []).filter(r => r && r.accountingSentAt && String(r.mapStatus || '').toUpperCase() !== 'RICEVUTO');
  const jobs = payload.jobs || [];
  let matched = 0, ambiguous = 0, checked = 0;
  rounds.forEach(round => {
    const job = findJob_(round, jobs);
    if (!job) return;
    const senders = (job.mapSenders || []).map(normalizeEmail_).filter(Boolean);
    if (!senders.length) return;
    const after = new Date(round.accountingSentAt);
    if (isNaN(after)) return;
    const afterDate = Utilities.formatDate(after, Session.getScriptTimeZone() || 'Europe/Rome', 'yyyy/MM/dd');
    const fromQuery = '(' + senders.map(s => 'from:' + s).join(' OR ') + ')';
    const query = `${fromQuery} after:${afterDate} has:attachment -in:spam -in:trash`;
    const threads = GmailApp.search(query, 0, 50);
    const candidates = [];
    threads.forEach(thread => thread.getMessages().forEach(msg => {
      if (msg.getDate().getTime() < after.getTime()) return;
      const from = normalizeEmail_(msg.getFrom());
      if (!senders.includes(from)) return;
      const atts = msg.getAttachments({includeInlineImages:false,includeAttachments:true}).filter(isMapAttachment_);
      if (!atts.length) return;
      checked += 1;
      const score = scoreMessage_(msg, round, job, atts);
      candidates.push({msg, atts, score, from});
    }));
    candidates.sort((a,b)=>b.score-a.score || b.msg.getDate()-a.msg.getDate());
    if (!candidates.length) return;
    const best = candidates[0];
    const second = candidates[1];
    if (best.score < 3 || (second && second.score === best.score)) {
      ambiguous += 1;
      return;
    }
    const receipt = archiveMap_(best, round, job);
    if (receipt && saveReceipt_(receipt)) matched += 1;
  });
  return {ok:true, matched, ambiguous, checked, scannedRounds:rounds.length, pendingReceipts:loadReceipts_().filter(r=>!r.acknowledged).length, at:new Date().toISOString()};
}

function archiveMap_(candidate, round, job) {
  const messageId = String(candidate.msg.getId() || '');
  const receiptId = safeKey_([round.path || '', messageId, candidate.atts.map(a=>a.getName()).join('|')].join('::'));
  const existingReceipt = loadReceipts_().find(r=>r.id===receiptId);
  if (existingReceipt) return existingReceipt;

  const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  const accounting = getOrCreateFolder_(root, ACCOUNTING_FOLDER_NAME);
  const commessa = getOrCreateFolder_(accounting, safe_(round.commessaNome || job.title || 'Commessa'));
  const giro = getOrCreateFolder_(commessa, 'Giro-' + String(round.numeroGiro || '').padStart(2,'0'));
  const mapFolder = getOrCreateFolder_(giro, 'MAP');
  const savedFiles = [];
  candidate.atts.forEach(att => {
    const name = att.getName() || ('MAP-' + Date.now());
    const existing = mapFolder.getFilesByName(name);
    let file;
    if (existing.hasNext()) file = existing.next();
    else file = mapFolder.createFile(att.copyBlob()).setName(name);
    savedFiles.push({name, driveFileId:file.getId(), driveUrl:file.getUrl()});
  });
  const meta = {
    id: receiptId,
    roundPath: round.path || '',
    commessa: round.commessaNome || job.title || '',
    giro: round.numeroGiro || '',
    from: candidate.from,
    subject: candidate.msg.getSubject(),
    emailDate: candidate.msg.getDate().toISOString(),
    gmailMessageId: messageId,
    attachmentNames: candidate.atts.map(a=>a.getName()),
    files: savedFiles,
    archivedAt: new Date().toISOString(),
    acknowledged: false
  };
  const files = giro.getFilesByName('MAP-ricevuto.json');
  while (files.hasNext()) files.next().setTrashed(true);
  giro.createFile('MAP-ricevuto.json', JSON.stringify(meta,null,2), MimeType.PLAIN_TEXT);
  return meta;
}

function scoreMessage_(msg, round, job, atts) {
  const text = normalizeText_([msg.getSubject(), msg.getPlainBody(), atts.map(a=>a.getName()).join(' ')].join(' '));
  let score = 0;
  const name = normalizeText_(round.commessaNome || job.title || '');
  const code = normalizeText_(round.codiceCommessa || job.code || '');
  const giro = String(round.numeroGiro || '').trim();
  if (name && text.includes(name)) score += 3;
  if (code && text.includes(code)) score += 3;
  if (giro && (text.includes('giro '+giro) || text.includes('giro-'+giro) || text.includes('giro_'+giro))) score += 2;
  if (/\bmap\b/i.test(text)) score += 2;
  return score;
}

function isMapAttachment_(att) {
  const name = String(att.getName() || '').toLowerCase();
  const type = String(att.getContentType() || '').toLowerCase();
  return /map|contabil|consuntiv|misur|lavor/i.test(name) || /pdf|spreadsheet|excel|word|zip/.test(type);
}

function findJob_(round, jobs) {
  const path = String(round.path || '');
  const m = path.match(/^commesse\/([^/]+)\//);
  const source = m ? 'commesse/' + m[1] : '';
  return jobs.find(j => source && j.vcSourceId === source)
    || jobs.find(j => normalizeText_(j.title) === normalizeText_(round.commessaNome))
    || jobs.find(j => j.code && String(j.code) === String(round.codiceCommessa || ''))
    || null;
}

function normalizeEmail_(v) {
  const s = String(v || '').toLowerCase();
  const m = s.match(/<([^>]+@[^>]+)>/) || s.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? (m[1] || m[0]).trim().toLowerCase() : '';
}
function normalizeText_(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function safe_(v){return String(v||'Commessa').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim() || 'Commessa'}
function safeKey_(v){const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(v||''));return digest.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('').slice(0,40)}
function getOrCreateFolder_(parent,name){const it=parent.getFoldersByName(name);return it.hasNext()?it.next():parent.createFolder(name)}
function json_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function checkToken_(token){const expected=PropertiesService.getScriptProperties().getProperty('VARGA_MAP_TOKEN')||'';if(!expected||String(token||'')!==expected)throw new Error('Token ponte non valido')}
function saveState_(payload){const state={mapEmail:payload.mapEmail||'',jobs:payload.jobs||[],rounds:payload.rounds||[],updatedAt:new Date().toISOString()};PropertiesService.getScriptProperties().setProperty(STATE_PROP,JSON.stringify(state))}
function loadState_(){const s=PropertiesService.getScriptProperties().getProperty(STATE_PROP);return s?JSON.parse(s):null}
function loadReceipts_(){try{return JSON.parse(PropertiesService.getScriptProperties().getProperty(RECEIPTS_PROP)||'[]')||[]}catch(_){return[]}}
function saveReceipts_(arr){PropertiesService.getScriptProperties().setProperty(RECEIPTS_PROP,JSON.stringify((arr||[]).slice(-MAX_RECEIPTS)))}
function saveReceipt_(receipt){const arr=loadReceipts_();if(arr.some(r=>r.id===receipt.id))return false;arr.push(receipt);saveReceipts_(arr);return true}
function acknowledgeReceipts_(ids){const set=new Set((ids||[]).map(String));if(!set.size)return;const arr=loadReceipts_();arr.forEach(r=>{if(set.has(String(r.id)))r.acknowledged=true});saveReceipts_(arr)}
