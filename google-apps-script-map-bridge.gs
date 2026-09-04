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
const REQUEST_RECEIPTS_PROP = 'VARGA_REQUEST_RECEIPTS';
const REQUEST_ITEM_PREFIX = 'VARGA_REQUEST_ITEM_';
const REQUEST_LAST_SCAN_PROP = 'VARGA_REQUEST_LAST_SCAN';
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
    if (action === 'installRequestSchedule') {
      saveState_(payload);
      return json_(installRequestSchedule_());
    }
    if (action === 'requestScheduleStatus') return json_(requestScheduleStatus_());
    if (action === 'scan') {
      saveState_(payload);
      return json_(scan_(payload));
    }
    if (action === 'scanRequests') {
      const state = Object.assign({}, loadState_() || {}, payload || {});
      saveState_(state);
      return json_(scanRequests_(state));
    }
    if (action === 'receipts') return json_({ok:true, receipts:loadReceipts_().filter(r=>!r.acknowledged)});
    if (action === 'requestReceipts') return json_({ok:true, requests:loadRequestReceipts_().filter(r=>!r.acknowledged)});
    if (action === 'acknowledge') {
      acknowledgeReceipts_(payload.receiptIds || []);
      return json_({ok:true});
    }
    if (action === 'acknowledgeRequests') {
      acknowledgeRequestReceipts_(payload.requestIds || []);
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
  scanRequests_(payload);
}

function scanRequestsScheduled() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const payload = loadState_();
    if (payload) scanRequests_(Object.assign({}, payload, {forcePeriod:false}));
  } finally {
    lock.releaseLock();
  }
}

function installRequestSchedule_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'scanRequestsScheduled').forEach(t => ScriptApp.deleteTrigger(t));
  [5, 15].forEach(hour => ScriptApp.newTrigger('scanRequestsScheduled').timeBased().atHour(hour).nearMinute(0).everyDays(1).inTimezone('Europe/Rome').create());
  return requestScheduleStatus_();
}

function requestScheduleStatus_() {
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'scanRequestsScheduled');
  return {ok:true, active:triggers.length===2, times:['05:00','15:00'], timezone:'Europe/Rome', triggerCount:triggers.length};
}

function scanRequests_(payload) {
  const now = new Date();
  const previous = PropertiesService.getScriptProperties().getProperty(REQUEST_LAST_SCAN_PROP);
  const scanDays = Math.max(1, Math.min(365, Number(payload.requestScanDays) || 30));
  const periodStart = new Date(now.getTime() - scanDays * 24 * 60 * 60 * 1000);
  const since = payload.forcePeriod ? periodStart : (previous ? new Date(previous) : periodStart);
  const afterDate = Utilities.formatDate(since, Session.getScriptTimeZone() || 'Europe/Rome', 'yyyy/MM/dd');
  const ownEmail = normalizeEmail_(payload.requestEmail || payload.mapEmail || '');
  const senderRules = (payload.requestSenderRules || []).map(rule => ({email:normalizeEmail_(rule.email),jobId:String(rule.jobId||'')})).filter(rule=>rule.email);
  const senderQuery = senderRules.length ? '{' + senderRules.map(rule=>'from:'+rule.email).join(' ') + '} ' : '';
  const query = `${senderQuery}after:${afterDate} -in:spam -in:trash`;
  const stored = loadRequestReceipts_(), storedIds = new Set(stored.map(row=>String(row.id))), additions = [];
  let found = 0, checked = 0;
  const inspectThread = thread => thread.getMessages().forEach(msg => {
    if (msg.getDate().getTime() <= since.getTime()) return;
    const from = normalizeEmail_(msg.getFrom());
    if (!from || (ownEmail && from === ownEmail)) return;
    const senderRule = senderRules.find(rule => rule.email === from);
    if (senderRules.length && !senderRule) return;
    checked++;
    const subject = String(msg.getSubject() || '');
    const body = String(msg.getPlainBody() || '').replace(/\s+/g, ' ').trim();
    const classification = classifyRequest_([subject, body].join(' '));
    if (!classification.relevant && !senderRule) return;
    const id = safeKey_('request::' + msg.getId());
    if (storedIds.has(id)) return;
    const attachments = msg.getAttachments({includeInlineImages:false,includeAttachments:true});
    const files = archiveRequestAttachments_(attachments, id, subject);
    const senderRaw = String(msg.getFrom() || '');
    const nameMatch = senderRaw.match(/^\s*"?([^"<]+)"?\s*</);
    const receipt = {id:id,from:from,fromName:nameMatch?nameMatch[1].trim():'',subject:subject,bodyPreview:body.slice(0,2200),emailDate:msg.getDate().toISOString(),gmailMessageId:String(msg.getId()||''),gmailThreadId:String(thread.getId()||''),type:classification.type,priority:classification.priority,jobId:senderRule?senderRule.jobId:'',attachmentNames:attachments.map(a=>a.getName()),files:files,archivedAt:new Date().toISOString(),acknowledged:false};
    additions.push(receipt);storedIds.add(id);found++;
  });
  for (let start=0; start<500; start+=100) {
    const threads=GmailApp.search(query,start,100);
    threads.forEach(inspectThread);
    if (threads.length<100) break;
  }
  if (additions.length) saveRequestReceipts_(stored.concat(additions));
  PropertiesService.getScriptProperties().setProperty(REQUEST_LAST_SCAN_PROP, now.toISOString());
  return {ok:true,found:found,checked:checked,pendingRequests:loadRequestReceipts_().filter(r=>!r.acknowledged).length,at:now.toISOString()};
}

function classifyRequest_(value) {
  const text = normalizeText_(value);
  let type = 'Comunicazione', relevant = false;
  if (/segnal|pericol|guasto|danno|anomali|cadut|ostru|urgente|emergenza/.test(text)) {type='Segnalazione';relevant=true;}
  else if (/richiest.*preventiv|offerta|quotazione/.test(text)) {type='Richiesta preventivo';relevant=true;}
  else if (/ordine.*lavor|odl|incarico|affidamento/.test(text)) {type='Ordine di lavoro';relevant=true;}
  else if (/intervento|manutenz|sfalcio|potatur|abbatt|diserb|ripristin|sopralluogo/.test(text)) {type='Richiesta intervento';relevant=true;}
  else if (/fattur|pagament|contabil|document|contratt|pec/.test(text)) {type='Amministrazione';relevant=true;}
  const priority = /emergenza|immediato|pericolo|rischio|urgente|cadut/.test(text) ? 'Urgente' : /entro oggi|sollecito|priorita|quanto prima/.test(text) ? 'Alta' : 'Normale';
  return {type:type,priority:priority,relevant:relevant};
}

function archiveRequestAttachments_(attachments, receiptId, subject) {
  if (!attachments || !attachments.length) return [];
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  const requests = getOrCreateFolder_(root, 'Richieste e segnalazioni');
  const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Rome', 'yyyy-MM-dd');
  const folder = getOrCreateFolder_(requests, day + ' - ' + safe_(subject).slice(0,80) + ' - ' + receiptId.slice(0,8));
  return attachments.map(att => {const file=folder.createFile(att.copyBlob()).setName(att.getName()||('Allegato-'+Date.now()));return{name:file.getName(),driveFileId:file.getId(),driveUrl:file.getUrl()};});
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
function saveState_(payload){const previous=loadState_()||{};const state={mapEmail:payload.mapEmail||previous.mapEmail||'',requestEmail:payload.requestEmail||previous.requestEmail||'',requestScanDays:Number(payload.requestScanDays)||previous.requestScanDays||30,requestSenderRules:Array.isArray(payload.requestSenderRules)?payload.requestSenderRules:(previous.requestSenderRules||[]),jobs:payload.jobs||previous.jobs||[],rounds:payload.rounds||previous.rounds||[],updatedAt:new Date().toISOString()};PropertiesService.getScriptProperties().setProperty(STATE_PROP,JSON.stringify(state))}
function loadState_(){const s=PropertiesService.getScriptProperties().getProperty(STATE_PROP);return s?JSON.parse(s):null}
function loadReceipts_(){try{return JSON.parse(PropertiesService.getScriptProperties().getProperty(RECEIPTS_PROP)||'[]')||[]}catch(_){return[]}}
function saveReceipts_(arr){PropertiesService.getScriptProperties().setProperty(RECEIPTS_PROP,JSON.stringify((arr||[]).slice(-MAX_RECEIPTS)))}
function saveReceipt_(receipt){const arr=loadReceipts_();if(arr.some(r=>r.id===receipt.id))return false;arr.push(receipt);saveReceipts_(arr);return true}
function acknowledgeReceipts_(ids){const set=new Set((ids||[]).map(String));if(!set.size)return;const arr=loadReceipts_();arr.forEach(r=>{if(set.has(String(r.id)))r.acknowledged=true});saveReceipts_(arr)}
function loadRequestReceipts_(){
  const props=PropertiesService.getScriptProperties();
  try{
    const index=JSON.parse(props.getProperty(REQUEST_RECEIPTS_PROP)||'[]')||[];
    if(index.length&&typeof index[0]==='object')return index; // compatibilità con la prima versione
    return index.map(id=>{try{return JSON.parse(props.getProperty(REQUEST_ITEM_PREFIX+id)||'null')}catch(_){return null}}).filter(Boolean);
  }catch(_){return[]}
}
function saveRequestReceipts_(arr){
  const props=PropertiesService.getScriptProperties(),rows=(arr||[]).slice(-MAX_RECEIPTS),values={};
  rows.forEach(r=>{values[REQUEST_ITEM_PREFIX+r.id]=JSON.stringify(r)});
  if(Object.keys(values).length)props.setProperties(values,false);
  props.setProperty(REQUEST_RECEIPTS_PROP,JSON.stringify(rows.map(r=>r.id)));
}
function acknowledgeRequestReceipts_(ids){
  const props=PropertiesService.getScriptProperties(),set=new Set((ids||[]).map(String));if(!set.size)return;
  const remaining=loadRequestReceipts_().filter(r=>!set.has(String(r.id)));
  set.forEach(id=>props.deleteProperty(REQUEST_ITEM_PREFIX+id));
  saveRequestReceipts_(remaining);
}
