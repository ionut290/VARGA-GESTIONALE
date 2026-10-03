/* Moduli guidati per periodo del giro e registrazione contabile. */
(function(){
'use strict';
const e=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function day(v){const s=String(v||'');let m=s.match(/^(\d{4}-\d{2}-\d{2})/);if(m)return m[1];m=s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:''}
const today=()=>new Date().toLocaleDateString('sv-SE');
function form(title,intro,fields,label,validate=()=>'',notice=''){
 return new Promise(resolve=>{
  const modal=document.createElement('div');modal.style.cssText='position:fixed;inset:0;z-index:100010;background:rgba(4,18,12,.72);padding:16px;display:grid;place-items:center';
  modal.innerHTML=`<form style="background:white;border-radius:16px;padding:20px;width:min(640px,94vw);max-height:92vh;overflow:auto"><h2>${e(title)}</h2><p>${e(intro)}</p>${notice?`<p style="background:#fff4d4;padding:12px;border-radius:8px">${e(notice)}</p>`:''}<div style="display:grid;gap:12px">${fields.map(f=>`<label style="display:grid;gap:4px">${e(f.label)}<input name="${e(f.key)}" type="${f.type||'text'}" value="${e(f.value)}" ${f.required?'required':''} ${f.readonly?'readonly':''} ${f.min!=null?`min="${e(f.min)}"`:''} ${f.max!=null?`max="${e(f.max)}"`:''} ${f.type==='number'?'step="1"':''}></label>`).join('')}</div><p data-error role="alert" style="color:#a12727"></p><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button type="button" class="ghost" data-cancel>ANNULLA</button><button class="primary" type="submit">${e(label)}</button></div></form>`;
  const finish=value=>{modal.remove();resolve(value)};
  modal.querySelector('[data-cancel]').onclick=()=>finish(null);
  modal.onkeydown=ev=>{if(ev.key==='Escape')finish(null)};
  modal.querySelector('form').onsubmit=ev=>{ev.preventDefault();const data=Object.fromEntries(fields.map(f=>[f.key,modal.querySelector(`[name="${f.key}"]`).value.trim()]));const error=validate(data);if(error){modal.querySelector('[data-error]').textContent=error;return}finish(data)};
  document.body.appendChild(modal);modal.querySelector('input')?.focus();
 });
}
function review(x){return form(`Fine giro — ${x.job.title}`,`${x.plants} impianti · ${x.doneRows} FATTO su ${x.totalRows} lavorazioni · ${new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(x.totalAmount)}`,[
 {key:'numeroGiro',label:'Numero reale del giro',type:'number',value:x.number,min:1,required:true,readonly:x.locked},
 {key:'periodStart',label:'Periodo contabile dal',type:'date',value:day(x.details.periodStart),required:true,max:today()},
 {key:'periodEnd',label:'Periodo contabile al',type:'date',value:day(x.details.periodEnd),required:true,max:today()},
 {key:'accountingDueAt',label:'Contabilità da inviare entro',type:'date',value:day(x.details.accountingDueAt),required:true}
 ],'CONTINUA',d=>d.periodEnd<d.periodStart?'La fine del periodo deve essere successiva o uguale all’inizio.':'',x.totalRows>x.doneRows?`${x.totalRows-x.doneRows} lavorazioni sono ancora DA FARE. Anche queste verranno archiviate e tolte dall’elenco attivo; non entrano nel totale della contabilità.`:'Tutte le lavorazioni del giro risultano FATTO.');}
function sent(r){return form(`Contabilità inviata — Giro ${r.numeroGiro}`,r.commessaNome,[
 {key:'accountingSentAt',label:'Data effettiva di invio',type:'date',value:today(),required:true,max:today()},
 {key:'accountingReference',label:'Riferimento invio / protocollo (facoltativo)',value:r.accountingReference||''},
 {key:'mapDueAt',label:'Controllare il MAP entro',type:'date',value:day(r.mapDueAt)||new Date(Date.now()+(Number(r.mapReminderDays)||7)*86400000).toLocaleDateString('sv-SE'),required:true}
 ],'REGISTRA INVIO',d=>d.mapDueAt<d.accountingSentAt?'Il controllo MAP non può precedere l’invio della contabilità.':'');}
function map(r){return form(`MAP ricevuto — Giro ${r.numeroGiro}`,r.commessaNome,[
 {key:'mapReceivedAt',label:'Data effettiva ricezione MAP',type:'date',value:today(),required:true,min:day(r.accountingSentAt),max:today()},
 {key:'mapReference',label:'Numero / riferimento MAP (facoltativo)',value:r.mapReference||''}
 ],'REGISTRA MAP',d=>d.mapReceivedAt<day(r.accountingSentAt)?'La ricezione MAP non può precedere l’invio della contabilità.':'');}
window.VargaRoundWorkflow={day,form,review,sent,map};
})();
