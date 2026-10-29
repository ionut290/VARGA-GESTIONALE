/* Manual Google Drive backup for the isolated Oracle Gestionale copy. */
(function(){
  'use strict';
  const DEFAULT_URL='https://script.google.com/macros/s/AKfycbyeendkbDj_CldTfhSJhWQvQSnr8KNd2IoDWx1VG6210Uhaox99M4rbUwo8nFms046A/exec';
  const JOB={id:'oracle-gestionale-backup',title:'Backup Gestionale Oracle',code:'BACKUP'};
  const CHUNK_SIZE=5*1024*1024;
  const $=id=>document.getElementById(id);
  let appData=null;
  const savedConfig=()=>{
    const shared=appData?.company?.driveBridge||{};
    let local={};try{local=JSON.parse(localStorage.getItem('vg_mapMailBridge')||'{}')||{}}catch(_){local={}}
    const url=String(shared.url||local.url||DEFAULT_URL).trim();
    const retired=['AKfycbxS4K2Ox3alB1TV1rD9GjlKmm_D7p499AXRLvmmUVZpxmvXqHMuRvE5aqsAjKzksi3h','AKfycbxiUgHi9zxddpAvNYRLx8W23JIw88VoChVP63uauhPUn-KeScSwTqK6qIaDSaUUzkap','AKfycbyvlLzIBlISKh3I0jRDFCwIL-Bsmmxk7sHAfomwGfZ48KlbRXaHXWpTC3qvu7VanXou'];
    return {url:retired.some(id=>url.includes(id))?DEFAULT_URL:url,token:String(shared.token||local.token||'').trim()};
  };
  function config(){return {url:$('vgOracleDriveUrl')?.value.trim()||DEFAULT_URL,token:$('vgOracleDriveToken')?.value.trim()||''}}
  async function bridge(action,extra={}){
    const c=config();if(!c.token)throw Error('Inserisci la chiave privata del ponte Google Apps Script.');
    if(!/^https:\/\/script\.google\.com\/macros\/s\//i.test(c.url))throw Error('URL del ponte Apps Script non valido.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
    let response;
    try{response=await fetch(c.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token:c.token,job:JOB,...extra}),signal:controller.signal})}
    catch(error){if(error?.name==='AbortError')throw Error('Tempo scaduto durante il collegamento a Google Drive.');throw Error('Collegamento Google Drive non riuscito: '+(error?.message||error))}
    finally{clearTimeout(timer)}
    if(!response.ok)throw Error('Risposta Google Drive HTTP '+response.status+'.');
    let result;try{result=await response.json()}catch{throw Error('Risposta del ponte Google Drive non valida.')}
    if(result?.ok===false)throw Error(result.error||'Google Drive ha rifiutato il salvataggio.');
    return result;
  }
  function setStatus(text,isError=false){const el=$('vgOracleDriveStatus');if(el){el.textContent=text;el.style.color=isError?'#b42318':''}}
  function bytesToBase64(bytes){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary)}
  function base64ToBytes(base64){const raw=atob(base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes}
  async function gunzip(bytes){if(typeof DecompressionStream==='undefined')throw Error('Questo browser non supporta il ripristino del backup compresso.');return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()}
  async function compressedBackup(){
    const data=JSON.parse(JSON.stringify(appData||{}));
    if(data.company?.driveBridge?.token)data.company.driveBridge.token='';
    const content=JSON.stringify({app:'Varga Gestionale Oracle',version:1,workspace:window.VGOraclePersistence?.workspace||'gestionale_varga_ui_sandbox_20261027',createdAt:new Date().toISOString(),data},null,2);
    if(typeof CompressionStream==='undefined'){
      const bytes=new TextEncoder().encode(content);if(bytes.length>8*1024*1024)throw Error('Il backup supera 8 MB e questo browser non supporta la compressione richiesta.');
      return {bytes,name:'Varga-Gestionale-Oracle-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',mimeType:'application/json',compressed:false};
    }
    const stream=new Blob([content]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
    if(bytes.length>8*1024*1024)throw Error('Il backup compresso supera il limite Drive di 8 MB. Scarica il backup JSON e suddividilo prima del caricamento.');
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    return {bytes,name:'Varga-Gestionale-Oracle-backup-'+stamp+'.json.gz',mimeType:'application/gzip',compressed:true};
  }
  async function saveConfig(){
    const c=config();if(!c.token)return setStatus('Inserisci la chiave privata prima di salvare il collegamento.',true);
    const button=$('vgOracleDriveConfigSave');button.disabled=true;setStatus('Verifico il collegamento Google Drive…');
    try{
      await bridge('ping');
      appData.company=appData.company||{};appData.company.driveBridge={url:c.url,token:c.token};
      if(typeof window.save==='function'&&await window.save()===false)throw Error('Configurazione non salvata nel workspace Oracle.');
      await window.VGOraclePersistence.flush();
      setStatus('Collegamento verificato e salvato nel workspace Oracle.');
    }catch(error){setStatus(error.message||String(error),true)}finally{button.disabled=false}
  }
  async function backupNow(){
    const button=$('vgOracleDriveBackupNow');button.disabled=true;setStatus('Salvo prima le modifiche nel workspace Oracle…');
    try{
      await window.VGOraclePersistence.flush();
      setStatus('Preparo il backup compresso…');
      const backup=await compressedBackup();
      const root=await bridge('driveEnsureJob');
      const listing=await bridge('driveList',{folderId:root.folderId});
      let folder=(listing.folders||[]).find(item=>String(item.name||'').toLowerCase()==='backup');
      if(!folder)folder=await bridge('driveCreateFolder',{folderId:root.folderId,name:'Backup'});
      setStatus('Carico il backup su Google Drive…');
      let result;
      if(backup.bytes.length<=CHUNK_SIZE){
        result=await bridge('driveUpload',{folderId:folder.id,name:backup.name,mimeType:backup.mimeType,base64:bytesToBase64(backup.bytes)});
      }else{
        const stamp=backup.name.replace(/\.(json\.gz|json)$/,'');const parts=[];const count=Math.ceil(backup.bytes.length/CHUNK_SIZE);
        for(let i=0;i<count;i++){
          setStatus(`Carico il backup su Google Drive… parte ${i+1} di ${count}`);
          const chunk=backup.bytes.subarray(i*CHUNK_SIZE,Math.min((i+1)*CHUNK_SIZE,backup.bytes.length));
          const part=await bridge('driveUpload',{folderId:folder.id,name:`${stamp}.part-${String(i+1).padStart(3,'0')}.bin`,mimeType:'application/octet-stream',base64:bytesToBase64(chunk)});
          parts.push({id:part.id,name:part.name,size:chunk.length});
        }
        const manifest={app:'Varga Gestionale Oracle',version:1,kind:backup.compressed?'chunked-gzip':'chunked-json',workspace:window.VGOraclePersistence.workspace,createdAt:new Date().toISOString(),originalName:backup.name,compressed:backup.compressed,byteLength:backup.bytes.length,parts};
        result=await bridge('driveUpload',{folderId:folder.id,name:stamp+'.manifest.json',mimeType:'application/json',base64:bytesToBase64(new TextEncoder().encode(JSON.stringify(manifest,null,2)))});
      }
      const url='https://drive.google.com/open?id='+encodeURIComponent(result.id);
      const link=$('vgOracleDriveResult');link.href=url;link.textContent='Apri il backup su Google Drive';link.hidden=false;
      const when=new Date().toLocaleString('it-IT');localStorage.setItem('vg_oracle_drive_backup_at',when);
      if($('lastBackup'))$('lastBackup').textContent=when;
      if($('backupDest'))$('backupDest').textContent='Google Drive';
      setStatus('Backup completato su Google Drive · '+when+' · '+(backup.bytes.length/1048576).toFixed(2)+' MB.');
    }catch(error){setStatus(error.message||String(error),true)}finally{button.disabled=false}
  }
  async function downloadBackup(){
    try{await window.VGOraclePersistence.flush();const data=JSON.parse(JSON.stringify(appData||{}));if(data.company?.driveBridge?.token)data.company.driveBridge.token='';const blob=new Blob([JSON.stringify({app:'Varga Gestionale Oracle',version:1,workspace:window.VGOraclePersistence.workspace,createdAt:new Date().toISOString(),data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Varga-Gestionale-Oracle-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(error){setStatus(error.message||String(error),true)}
  }
  async function restoreBackup(event){
    const file=event.target.files?.[0];if(!file)return;
    try{
      let text;
      text=file.name.toLowerCase().endsWith('.gz')?await gunzip(new Uint8Array(await file.arrayBuffer())):await file.text();
      await applyBackup(JSON.parse(text));
    }catch(error){setStatus(error.message||String(error),true)}finally{event.target.value=''}
  }
  async function applyBackup(parsed){
      if(!parsed?.data||typeof parsed.data!=='object'||Array.isArray(parsed.data))throw Error('Il file non contiene un backup Varga valido.');
      if(parsed.workspace&&parsed.workspace!==window.VGOraclePersistence.workspace)throw Error('Questo backup appartiene a un workspace diverso.');
      if(!confirm('Ripristinare il backup nel workspace Oracle di prova? I dati presenti nelle sezioni incluse verranno sostituiti.')){setStatus('Ripristino annullato.');return}
      const bridgeConfig=appData.company?.driveBridge;
      for(const key of window.VGOraclePersistence.keys){if(Object.prototype.hasOwnProperty.call(parsed.data,key))appData[key]=parsed.data[key]}
      if(bridgeConfig?.token){appData.company=appData.company||{};appData.company.driveBridge={...(appData.company.driveBridge||{}),token:bridgeConfig.token}}
      if(typeof window.save==='function'&&await window.save()===false)throw Error('Salvataggio locale non riuscito.');
      await window.VGOraclePersistence.flush();window.companyToForm?.();window.refresh?.();window.refreshVcCounts?.();
      setStatus('Backup ripristinato e salvato nel workspace Oracle.');
  }
  async function refreshDriveBackups(){
    const select=$('vgOracleDriveRestoreSelect');if(!select)return;
    select.disabled=true;select.innerHTML='<option value="">Caricamento backup Drive…</option>';
    try{
      const root=await bridge('driveEnsureJob'),listing=await bridge('driveList',{folderId:root.folderId}),folder=(listing.folders||[]).find(item=>String(item.name||'').toLowerCase()==='backup');
      if(!folder){select.innerHTML='<option value="">Nessun backup Drive trovato</option>';return}
      const backups=(await bridge('driveList',{folderId:folder.id})).files||[];
      const candidates=backups.filter(file=>/\.manifest\.json$|\.json\.gz$|Varga-Gestionale-Oracle-backup.*\.json$/i.test(file.name)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
      select.innerHTML=candidates.length?'<option value="">Seleziona un backup…</option>'+candidates.map(file=>`<option value="${file.id}">${file.name} · ${new Date(file.updatedAt).toLocaleString('it-IT')}</option>`).join(''):'<option value="">Nessun backup Drive trovato</option>';
    }catch(error){select.innerHTML='<option value="">Errore nel caricamento elenco</option>';setStatus(error.message||String(error),true)}finally{select.disabled=false}
  }
  async function restoreFromDrive(){
    const fileId=$('vgOracleDriveRestoreSelect')?.value;if(!fileId)return setStatus('Seleziona un backup da ripristinare.',true);
    const button=$('vgOracleDriveRestoreNow');button.disabled=true;setStatus('Leggo il backup selezionato da Google Drive…');
    try{
      const response=await bridge('driveGetFile',{fileId}),bytes=base64ToBytes(response.base64||'');let text;
      if(String(response.name||'').endsWith('.manifest.json')){
        const manifest=JSON.parse(new TextDecoder().decode(bytes));
        if(manifest.app!=='Varga Gestionale Oracle'||!Array.isArray(manifest.parts)||manifest.parts.length<1||manifest.parts.length>100)throw Error('Manifest Drive non valido.');
        const chunks=[];
        for(let i=0;i<manifest.parts.length;i++){
          setStatus(`Scarico il backup da Drive… parte ${i+1} di ${manifest.parts.length}`);
          const item=await bridge('driveGetFile',{fileId:manifest.parts[i].id});chunks.push(base64ToBytes(item.base64||''));
        }
        const total=chunks.reduce((sum,chunk)=>sum+chunk.length,0);if(total!==Number(manifest.byteLength))throw Error('Backup incompleto: la dimensione delle parti non corrisponde.');
        const joined=new Uint8Array(total);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length}
        text=manifest.compressed?await gunzip(joined):new TextDecoder().decode(joined);
      }else text=response.name?.toLowerCase().endsWith('.gz')?await gunzip(bytes):new TextDecoder().decode(bytes);
      await applyBackup(JSON.parse(text));
    }catch(error){setStatus(error.message||String(error),true)}finally{button.disabled=false}
  }
  function mount(data){
    if(data)appData=data;
    const section=$('backup');if(!section||!appData)return;
    const subtitle=section.querySelector('.subtitle');if(subtitle)subtitle.textContent='I dati operativi vengono salvati nel workspace Oracle di prova. Da qui puoi creare o ripristinare una copia JSON e salvarla direttamente su Google Drive.';
    if(!$('vgOracleDriveBackupPanel')){
      const panel=document.createElement('div');panel.id='vgOracleDriveBackupPanel';panel.className='panel';
      panel.innerHTML='<h2>Backup diretto su Google Drive</h2><p class="muted">Il backup viene compresso e salvato in <strong>Varga Gestionale / Commesse / BACKUP - Backup Gestionale Oracle / Backup</strong>. I file grandi vengono divisi in parti con un manifest per il ripristino. Le modifiche vengono prima confermate nel workspace Oracle di prova.</p><div class="formgrid"><label>URL ponte Apps Script<input id="vgOracleDriveUrl" type="url" autocomplete="url"></label><label>Chiave privata ponte<input id="vgOracleDriveToken" type="password" autocomplete="off"></label></div><div class="actions left"><button id="vgOracleDriveConfigSave" class="ghost" type="button">VERIFICA E SALVA COLLEGAMENTO</button><button id="vgOracleDriveBackupNow" class="primary" type="button">SALVA BACKUP SU DRIVE</button><a id="vgOracleDriveResult" class="ghost" target="_blank" rel="noopener" hidden></a></div><div class="formgrid"><label>Backup disponibili su Drive<select id="vgOracleDriveRestoreSelect"><option value="">Premi AGGIORNA ELENCO</option></select></label><button id="vgOracleDriveRefresh" class="ghost" type="button">AGGIORNA ELENCO</button><button id="vgOracleDriveRestoreNow" class="ghost" type="button">RIPRISTINA DA DRIVE</button></div><p id="vgOracleDriveStatus" class="muted" aria-live="polite"></p>';
      const first=section.querySelector('.panel');if(first)first.before(panel);else section.append(panel);
      $('vgOracleDriveConfigSave').onclick=saveConfig;$('vgOracleDriveBackupNow').onclick=backupNow;$('vgOracleDriveRefresh').onclick=refreshDriveBackups;$('vgOracleDriveRestoreNow').onclick=restoreFromDrive;
      const cfg=savedConfig();$('vgOracleDriveUrl').value=cfg.url;$('vgOracleDriveToken').value=cfg.token;
      const localFolder=section.querySelector('#chooseFolder')?.closest('.panel');if(localFolder)localFolder.hidden=true;
    }
    if($('exportBackup'))$('exportBackup').onclick=downloadBackup;
    if($('importBackup')){$('importBackup').accept='.json,.gz';$('importBackup').onchange=restoreBackup}
    const latest=localStorage.getItem('vg_oracle_drive_backup_at');
    if($('recordCount'))$('recordCount').textContent=(window.VGOraclePersistence.keys||[]).reduce((total,key)=>total+(Array.isArray(appData[key])?appData[key].length:0),0);
    if(latest){if($('lastBackup'))$('lastBackup').textContent=latest;if($('backupDest'))$('backupDest').textContent='Google Drive';if(!$('vgOracleDriveStatus').textContent)$('vgOracleDriveStatus').textContent='Ultimo backup: '+latest}
    else if($('backupDest'))$('backupDest').textContent=config().token?'Google Drive':'Da configurare';
  }
  window.VargaOracleDriveBackup=Object.freeze({mount});
})();
