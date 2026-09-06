/* Ciclo documenti Drive: BOZZE -> cartella definitiva. */
(function(){
'use strict';
const safe=v=>String(v||'Documento').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim()||'Documento';
const jobData=job=>({id:String(job?.id||'documenti-generali'),title:String(job?.title||job?.jobName||'Documenti generali'),code:String(job?.code||job?.jobCode||'')});
const call=(action,payload)=>{if(typeof window.VargaMailBridgeCall!=='function')throw Error('Collegamento Google Drive non configurato.');return window.VargaMailBridgeCall(action,payload)};
async function folder(job,name){const data={job:jobData(job)},root=await call('driveEnsureJob',data),list=await call('driveList',{...data,folderId:root.rootId}),found=(list.folders||[]).find(x=>String(x.name||'').toLowerCase()===String(name).toLowerCase());return found?.id||(await call('driveCreateFolder',{...data,folderId:root.rootId,name})).id}
async function base64(blob){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary)}
async function upload(job,folderName,name,blob,oldId){const data={job:jobData(job)},folderId=await folder(job,folderName),out=await call('driveUpload',{...data,folderId,name:safe(name),mimeType:blob.type||'application/octet-stream',base64:await base64(blob)});if(oldId&&oldId!==out.id){try{await call('driveTrash',{...data,itemId:oldId,kind:'file'})}catch(e){console.warn('Vecchia versione Drive non eliminata',e)}}return out}
async function saveDraft(record,job,type){if(!record?.id)return record;const clean={...record};delete clean.draftDriveFileId;delete clean.driveFileId;const blob=new Blob([JSON.stringify(clean,null,2)],{type:'application/json'}),out=await upload(job,'BOZZE',`${type} - ${record.id}.json`,blob,record.draftDriveFileId);record.draftDriveFileId=out.id;record.draftDriveName=out.name;return record}
async function removeDraft(record,job){if(!record?.draftDriveFileId)return;const data={job:jobData(job)};await call('driveTrash',{...data,itemId:record.draftDriveFileId,kind:'file'});delete record.draftDriveFileId;delete record.draftDriveName}
async function finalizeJson(record,job,type,folderName){const clean={...record,status:'Completato'};delete clean.draftDriveFileId;delete clean.draftDriveName;const blob=new Blob([JSON.stringify(clean,null,2)],{type:'application/json'}),out=await upload(job,folderName,`${type} - ${record.number||record.id}.json`,blob,record.driveArchiveFileId);record.driveArchiveFileId=out.id;await removeDraft(record,job);return record}
window.VargaDriveLifecycle={folder,upload,saveDraft,removeDraft,finalizeJson,jobData};
})();
