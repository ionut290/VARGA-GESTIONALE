// Firma e timbro personali per i documenti di Varga Gestionale.
// Le fotografie vengono elaborate nel browser: l'originale non viene mai salvato o inviato.
(function installUserDocumentAssets(){
  'use strict';

  const PROFILE_FIELD='gestionaleDocumentAssets';
  const MAX_FILE_BYTES=20*1024*1024;
  const MAX_ASSET_CHARS=270000;
  const MAX_PROFILE_CHARS=570000;
  const pickers=new Set();
  let pickerSequence=0;
  let loadedUid='';
  let loadSequence=0;
  let assets=emptyAssets();

  const E=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

  function emptyAssets(){
    return{version:1,signatureDataUrl:'',stampDataUrl:'',updatedAt:'',updatedByUid:'',updatedByName:''};
  }

  function currentUser(){
    try{return typeof cloudUser!=='undefined'&&cloudUser?cloudUser:null}catch(_){return null}
  }

  function currentName(){
    const user=currentUser(),profile=window.cloudUserProfile||{};
    return profile.nomeCompleto||profile.displayName||user?.displayName||user?.email||'Utente';
  }

  function validDataUrl(value){
    value=String(value||'').trim();
    return /^data:image\/(?:png|jpe?g);base64,[a-z0-9+/=]+$/i.test(value)&&value.length<=MAX_ASSET_CHARS?value:'';
  }

  function normalizeAssets(value){
    value=value&&typeof value==='object'?value:{};
    return{
      version:1,
      signatureDataUrl:validDataUrl(value.signatureDataUrl),
      stampDataUrl:validDataUrl(value.stampDataUrl),
      updatedAt:String(value.updatedAt||''),
      updatedByUid:String(value.updatedByUid||''),
      updatedByName:String(value.updatedByName||'')
    };
  }

  function normalizeSelection(value){
    value=value&&typeof value==='object'?value:{};
    const mode=['preset','personal','none'].includes(value.mode)?value.mode:'preset';
    return{
      mode,
      useSignature:value.useSignature!==false,
      useStamp:value.useStamp!==false,
      ownerUid:String(value.ownerUid||''),
      ownerName:String(value.ownerName||''),
      assetUpdatedAt:String(value.assetUpdatedAt||'')
    };
  }

  function localKey(uid){return`vg_document_assets_${uid}`}

  function readLocal(uid){
    if(!uid)return emptyAssets();
    try{return normalizeAssets(JSON.parse(localStorage.getItem(localKey(uid))||'{}'))}catch(_){return emptyAssets()}
  }

  function writeLocal(uid,value){
    if(!uid)return;
    try{localStorage.setItem(localKey(uid),JSON.stringify(value))}catch(error){console.warn('Cache locale firma/timbro non disponibile',error)}
  }

  function publishAssets(value){
    assets=normalizeAssets(value);
    window.dispatchEvent(new CustomEvent('varga:user-document-assets-changed',{detail:{...assets}}));
    refreshPickers();
    renderProfilePanel();
  }

  async function loadForUser(user,profile){
    if(!user?.uid){loadedUid='';publishAssets(emptyAssets());return assets}
    const sequence=++loadSequence;
    loadedUid=user.uid;
    const cached=readLocal(user.uid);
    publishAssets(cached);
    try{
      let remote=profile?.[PROFILE_FIELD];
      if(!remote&&typeof cloudStore!=='undefined'&&cloudStore){
        const snap=await cloudStore.collection('platformUsers').doc(user.uid).get();
        remote=snap.exists?snap.data()?.[PROFILE_FIELD]:null;
      }
      if(sequence!==loadSequence||loadedUid!==user.uid)return assets;
      if(remote){const clean=normalizeAssets(remote);writeLocal(user.uid,clean);publishAssets(clean)}
    }catch(error){
      console.warn('Caricamento firma/timbro personali non riuscito',error);
    }
    return assets;
  }

  async function saveForCurrentUser(value){
    const user=currentUser();
    if(!user?.uid)throw new Error('Accedi prima di salvare firma e timbro.');
    const clean=normalizeAssets({...value,updatedAt:new Date().toISOString(),updatedByUid:user.uid,updatedByName:currentName()});
    if(JSON.stringify(clean).length>MAX_PROFILE_CHARS)throw new Error('Le immagini sono ancora troppo grandi. Rifotografale lasciando meno spazio bianco attorno.');
    loadedUid=user.uid;
    writeLocal(user.uid,clean);
    publishAssets(clean);
    try{
      if(typeof cloudStore==='undefined'||!cloudStore)throw new Error('Cloud non disponibile.');
      await cloudStore.collection('platformUsers').doc(user.uid).set({[PROFILE_FIELD]:clean},{merge:true});
      window.cloudUserProfile={...(window.cloudUserProfile||{}),[PROFILE_FIELD]:clean};
      return{synced:true,assets:{...clean}};
    }catch(error){
      const wrapped=new Error('Salvato su questo dispositivo, ma non sincronizzato nel profilo cloud: '+(error?.message||error));
      wrapped.localSaved=true;
      throw wrapped;
    }
  }

  async function decodePhoto(file){
    if(!file)throw new Error('Scegli una fotografia.');
    if(!String(file.type||'').startsWith('image/'))throw new Error('Il file scelto non è una fotografia.');
    if(file.size>MAX_FILE_BYTES)throw new Error('La fotografia è troppo grande. Usa una foto inferiore a 20 MB.');
    if(typeof createImageBitmap==='function'){
      try{return await createImageBitmap(file,{imageOrientation:'from-image'})}catch(_){return createImageBitmap(file)}
    }
    const source=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('Lettura fotografia non riuscita'));reader.readAsDataURL(file);
    });
    return new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Fotografia non leggibile'));image.src=source;
    });
  }

  function estimatePaper(data,width,height){
    const samples=[];
    const step=Math.max(2,Math.floor(Math.min(width,height)/80));
    const add=(x,y)=>{const index=(y*width+x)*4,r=data[index],g=data[index+1],b=data[index+2];samples.push({r,g,b,l:.2126*r+.7152*g+.0722*b})};
    for(let x=0;x<width;x+=step){add(x,0);add(x,height-1)}
    for(let y=step;y<height-step;y+=step){add(0,y);add(width-1,y)}
    samples.sort((a,b)=>b.l-a.l);
    const bright=samples.slice(0,Math.max(8,Math.ceil(samples.length*.55)));
    return bright.reduce((out,pixel)=>({r:out.r+pixel.r/bright.length,g:out.g+pixel.g/bright.length,b:out.b+pixel.b/bright.length}),{r:0,g:0,b:0});
  }

  function compactTransparentCanvas(source,maxWidth,maxHeight){
    let current=source;
    const fit=Math.min(1,maxWidth/current.width,maxHeight/current.height);
    if(fit<1){
      const resized=document.createElement('canvas');resized.width=Math.max(1,Math.round(current.width*fit));resized.height=Math.max(1,Math.round(current.height*fit));
      resized.getContext('2d').drawImage(current,0,0,resized.width,resized.height);current=resized;
    }
    let dataUrl=current.toDataURL('image/png');
    while(dataUrl.length>MAX_ASSET_CHARS&&current.width>240&&current.height>100){
      const resized=document.createElement('canvas');resized.width=Math.max(1,Math.round(current.width*.82));resized.height=Math.max(1,Math.round(current.height*.82));
      resized.getContext('2d').drawImage(current,0,0,resized.width,resized.height);current=resized;dataUrl=current.toDataURL('image/png');
    }
    if(dataUrl.length>MAX_ASSET_CHARS)throw new Error('L’immagine elaborata è troppo grande. Avvicina la fotocamera alla firma o al timbro e riprova.');
    return dataUrl;
  }

  async function processPhoto(file,kind){
    const decoded=await decodePhoto(file);
    try{
      const originalWidth=decoded.width||decoded.naturalWidth,originalHeight=decoded.height||decoded.naturalHeight;
      if(!originalWidth||!originalHeight)throw new Error('La fotografia non contiene un’immagine valida.');
      const sourceScale=Math.min(1,1800/Math.max(originalWidth,originalHeight));
      const width=Math.max(1,Math.round(originalWidth*sourceScale)),height=Math.max(1,Math.round(originalHeight*sourceScale));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(decoded,0,0,width,height);
      const image=context.getImageData(0,0,width,height),pixels=image.data,paper=estimatePaper(pixels,width,height),paperLum=.2126*paper.r+.7152*paper.g+.0722*paper.b;
      let left=width,top=height,right=-1,bottom=-1,inkPixels=0;
      const threshold=kind==='signature'?24:20;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const index=(y*width+x)*4,r=pixels[index],g=pixels[index+1],b=pixels[index+2];
        const distance=Math.hypot(r-paper.r,g-paper.g,b-paper.b),lum=.2126*r+.7152*g+.0722*b,darkness=Math.max(0,paperLum-lum),chroma=Math.max(r,g,b)-Math.min(r,g,b);
        const strength=Math.max(distance*1.18,darkness+chroma*.25);
        let alpha=clamp(Math.round((strength-threshold)*255/64),0,255);
        if(alpha<24)alpha=0;
        if(alpha){
          const boost=kind==='signature'&&chroma<22?1.32:1.12;
          pixels[index]=clamp(Math.round(255-(paper.r-r)*boost),0,255);
          pixels[index+1]=clamp(Math.round(255-(paper.g-g)*boost),0,255);
          pixels[index+2]=clamp(Math.round(255-(paper.b-b)*boost),0,255);
          pixels[index+3]=alpha;
          if(alpha>42){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);inkPixels++}
        }else{pixels[index]=pixels[index+1]=pixels[index+2]=255;pixels[index+3]=0}
      }
      if(right<left||bottom<top||inkPixels<35)throw new Error(`Non riesco a riconoscere ${kind==='signature'?'la firma':'il timbro'}. Usa un foglio bianco, più luce e avvicina la fotocamera.`);
      const boxWidth=right-left+1,boxHeight=bottom-top+1;
      if(boxWidth>width*.98&&boxHeight>height*.98)throw new Error('Lo sfondo non è abbastanza chiaro. Rifai la foto su un foglio bianco senza ombre.');
      context.putImageData(image,0,0);
      const padding=Math.max(8,Math.round(Math.max(boxWidth,boxHeight)*.045));
      left=Math.max(0,left-padding);top=Math.max(0,top-padding);right=Math.min(width-1,right+padding);bottom=Math.min(height-1,bottom+padding);
      const cropped=document.createElement('canvas');cropped.width=right-left+1;cropped.height=bottom-top+1;
      cropped.getContext('2d').drawImage(canvas,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
      return compactTransparentCanvas(cropped,kind==='signature'?1050:760,kind==='signature'?360:760);
    }finally{if(typeof decoded.close==='function')decoded.close()}
  }

  function previewMarkup(kind,value){
    const label=kind==='signature'?'Firma':'Timbro',ready=Boolean(value);
    return`<article class="vg-asset-card" data-vg-asset-card="${kind}">
      <div class="vg-asset-card-head"><div><strong>${label}</strong><small>${ready?'Pronto per i documenti':'Non ancora caricato'}</small></div><span class="vg-asset-state ${ready?'ready':''}">${ready?'PRONTO':'DA CREARE'}</span></div>
      <div class="vg-asset-preview ${ready?'has-image':''}">${ready?`<img alt="Anteprima ${label.toLowerCase()}">`:`<span>${kind==='signature'?'✍️':'🔵'}</span><small>Fotografa ${label.toLowerCase()} su un foglio bianco</small>`}</div>
      <div class="vg-asset-card-actions"><button type="button" class="primary" data-vg-capture="${kind}">${ready?'RIFAI FOTO':'FOTOGRAFA / CARICA'}</button><button type="button" class="ghost" data-vg-remove="${kind}" ${ready?'':'disabled'}>ELIMINA</button></div>
      <input type="file" accept="image/*" capture="environment" data-vg-file="${kind}" hidden>
      <p class="vg-asset-card-status muted" data-vg-status="${kind}"></p>
    </article>`;
  }

  function managerMarkup(value,modal){
    return`<div class="vg-asset-manager ${modal?'is-modal':''}">
      <div class="vg-asset-manager-head"><div><p class="vg-asset-kicker">Profilo personale</p><h2>La mia firma e il mio timbro</h2><p>Fotografali separatamente su un foglio bianco. Il Gestionale ritaglia l’immagine, elimina lo sfondo e la prepara per preventivi e consuntivi.</p></div>${modal?'<button type="button" class="ghost" data-vg-assets-close>CHIUDI</button>':''}</div>
      <div class="vg-asset-privacy"><strong>La foto originale non viene salvata.</strong> L’elaborazione avviene sul dispositivo; nel profilo resta soltanto l’immagine ripulita con sfondo trasparente.</div>
      <div class="vg-asset-grid">${previewMarkup('signature',value.signatureDataUrl)}${previewMarkup('stamp',value.stampDataUrl)}</div>
      <div class="vg-asset-tips"><strong>Per un risultato pulito:</strong><span>foglio bianco</span><span>luce uniforme</span><span>foto dritta</span><span>nessuna ombra</span></div>
      <div class="vg-asset-save-row"><p class="muted" data-vg-save-status>${value.updatedAt?'Ultimo salvataggio: '+E(new Date(value.updatedAt).toLocaleString('it-IT')):'Le immagini non sono ancora salvate nel profilo.'}</p><button type="button" class="primary" data-vg-assets-save>SALVA FIRMA E TIMBRO</button></div>
    </div>`;
  }

  function bindManager(host,options={}){
    const user=currentUser();
    if(!user?.uid){host.innerHTML='<div class="panel"><h2>La mia firma e il mio timbro</h2><p class="muted">Accedi per creare e salvare le immagini personali.</p></div>';return}
    const working={...assets};
    host.innerHTML=managerMarkup(working,Boolean(options.modal));
    const setPreview=(kind,value)=>{
      working[kind==='signature'?'signatureDataUrl':'stampDataUrl']=value;
      const card=host.querySelector(`[data-vg-asset-card="${kind}"]`),preview=card.querySelector('.vg-asset-preview'),state=card.querySelector('.vg-asset-state'),remove=card.querySelector(`[data-vg-remove="${kind}"]`),capture=card.querySelector(`[data-vg-capture="${kind}"]`);
      preview.classList.toggle('has-image',Boolean(value));preview.innerHTML=value?`<img alt="Anteprima ${kind==='signature'?'firma':'timbro'}">`:`<span>${kind==='signature'?'✍️':'🔵'}</span><small>Fotografa ${kind==='signature'?'firma':'timbro'} su un foglio bianco</small>`;
      const image=preview.querySelector('img');if(image)image.src=value;
      state.classList.toggle('ready',Boolean(value));state.textContent=value?'PRONTO':'DA CREARE';card.querySelector('small').textContent=value?'Pronto per i documenti':'Non ancora caricato';remove.disabled=!value;capture.textContent=value?'RIFAI FOTO':'FOTOGRAFA / CARICA';
    };
    ['signature','stamp'].forEach(kind=>{
      const key=kind==='signature'?'signatureDataUrl':'stampDataUrl';setPreview(kind,working[key]);
      const input=host.querySelector(`[data-vg-file="${kind}"]`),status=host.querySelector(`[data-vg-status="${kind}"]`),capture=host.querySelector(`[data-vg-capture="${kind}"]`);
      capture.onclick=()=>input.click();
      input.onchange=async()=>{
        const file=input.files?.[0];if(!file)return;
        try{capture.disabled=true;status.textContent='Ritaglio e rimozione dello sfondo in corso…';const result=await processPhoto(file,kind);setPreview(kind,result);status.textContent='Immagine adattata. Controlla l’anteprima e premi SALVA.'}
        catch(error){status.textContent=error?.message||'Elaborazione non riuscita.'}
        finally{capture.disabled=false;input.value=''}
      };
      host.querySelector(`[data-vg-remove="${kind}"]`).onclick=()=>{setPreview(kind,'');status.textContent='Immagine rimossa. Premi SALVA per confermare.'};
    });
    const saveButton=host.querySelector('[data-vg-assets-save]'),saveStatus=host.querySelector('[data-vg-save-status]');
    saveButton.onclick=async()=>{
      if(!working.signatureDataUrl&&!working.stampDataUrl&&!confirm('Salvare il profilo senza firma e senza timbro?'))return;
      try{saveButton.disabled=true;saveStatus.textContent='Salvataggio nel profilo personale…';await saveForCurrentUser(working);saveStatus.textContent='Firma e timbro salvati nel tuo profilo.'}
      catch(error){saveStatus.textContent=error?.message||'Salvataggio non riuscito.'}
      finally{saveButton.disabled=false}
    };
    const close=host.querySelector('[data-vg-assets-close]');if(close)close.onclick=()=>options.onClose?.();
  }

  function renderProfilePanel(){
    const host=document.getElementById('userDocumentAssetsPanel');if(host&&!host.closest('[data-vg-assets-modal]'))bindManager(host);
  }

  function openManager(){
    const overlay=document.createElement('div');overlay.className='vg-assets-modal';overlay.dataset.vgAssetsModal='1';overlay.innerHTML='<div class="vg-assets-modal-card" data-vg-assets-modal-card></div>';document.body.appendChild(overlay);
    const close=()=>overlay.remove();bindManager(overlay.querySelector('[data-vg-assets-modal-card]'),{modal:true,onClose:close});
    overlay.addEventListener('click',event=>{if(event.target===overlay)close()});
  }

  function pickerStatus(selection){
    if(selection.mode==='none')return'Nessuna immagine verrà inserita.';
    if(selection.mode==='preset')return'Il documento userà la firma e il timbro aziendali preimpostati.';
    const chosen=[];if(selection.useSignature)chosen.push(assets.signatureDataUrl?'firma':'firma non caricata');if(selection.useStamp)chosen.push(assets.stampDataUrl?'timbro':'timbro non caricato');
    return chosen.length?`Nel documento: ${chosen.join(' + ')}.`:'Seleziona almeno firma o timbro.';
  }

  function renderPicker(host){
    if(!host?.isConnected)return pickers.delete(host);
    const selection=normalizeSelection(host.__vgDocumentSeal),name=host.dataset.vgSealName||(host.dataset.vgSealName=`vg-document-seal-${++pickerSequence}`);
    host.className='vg-document-seal-picker';
    host.innerHTML=`<div class="vg-document-seal-head"><div><strong>Firma e timbro nel documento</strong><small>Scegli cosa inserire nel PDF.</small></div><button type="button" class="mini ghost" data-vg-manage-assets>GESTISCI I MIEI</button></div>
      <div class="vg-document-seal-options">
        <label><input type="radio" name="${name}" value="preset" ${selection.mode==='preset'?'checked':''}> PREIMPOSTATI</label>
        <label><input type="radio" name="${name}" value="personal" ${selection.mode==='personal'?'checked':''}> I MIEI</label>
        <label><input type="radio" name="${name}" value="none" ${selection.mode==='none'?'checked':''}> NESSUNO</label>
      </div>
      <div class="vg-personal-asset-options" ${selection.mode==='personal'?'':'hidden'}>
        <label><input type="checkbox" data-vg-use-signature ${selection.useSignature&&assets.signatureDataUrl?'checked':''} ${assets.signatureDataUrl?'':'disabled'}> Firma ${assets.signatureDataUrl?'':'(da creare)'}</label>
        <label><input type="checkbox" data-vg-use-stamp ${selection.useStamp&&assets.stampDataUrl?'checked':''} ${assets.stampDataUrl?'':'disabled'}> Timbro ${assets.stampDataUrl?'':'(da creare)'}</label>
        <div class="vg-document-seal-previews">${assets.signatureDataUrl?'<img data-vg-signature-preview alt="Firma personale">':''}${assets.stampDataUrl?'<img data-vg-stamp-preview alt="Timbro personale">':''}</div>
      </div>
      <p class="muted vg-document-seal-status">${E(pickerStatus(selection))}</p>`;
    const signaturePreview=host.querySelector('[data-vg-signature-preview]'),stampPreview=host.querySelector('[data-vg-stamp-preview]');if(signaturePreview)signaturePreview.src=assets.signatureDataUrl;if(stampPreview)stampPreview.src=assets.stampDataUrl;
    const sync=()=>{
      const mode=host.querySelector(`input[name="${name}"]:checked`)?.value||'preset',signature=host.querySelector('[data-vg-use-signature]'),stamp=host.querySelector('[data-vg-use-stamp]');
      host.__vgDocumentSeal=normalizeSelection({mode,useSignature:signature?.checked!==false,useStamp:stamp?.checked!==false,ownerUid:mode==='personal'?(currentUser()?.uid||''):'',ownerName:mode==='personal'?currentName():'',assetUpdatedAt:mode==='personal'?assets.updatedAt:''});
      const personal=host.querySelector('.vg-personal-asset-options');if(personal)personal.hidden=mode!=='personal';const status=host.querySelector('.vg-document-seal-status');if(status)status.textContent=pickerStatus(host.__vgDocumentSeal);
    };
    host.querySelectorAll(`input[name="${name}"], [data-vg-use-signature], [data-vg-use-stamp]`).forEach(input=>input.onchange=sync);
    host.querySelector('[data-vg-manage-assets]').onclick=openManager;
  }

  function refreshPickers(){for(const host of [...pickers])renderPicker(host)}

  function mountPicker(host,value){if(!host)return null;host.__vgDocumentSeal=normalizeSelection(value);pickers.add(host);renderPicker(host);return host}

  function readPicker(host){
    if(!host)return normalizeSelection();
    const selection=normalizeSelection(host.__vgDocumentSeal);
    if(selection.mode==='personal'){
      selection.ownerUid=currentUser()?.uid||selection.ownerUid;selection.ownerName=currentName();selection.assetUpdatedAt=assets.updatedAt;
    }
    return selection;
  }

  function asDataUrl(value,mime='image/jpeg'){
    value=String(value||'').trim();if(!value)return'';if(value.startsWith('data:image/'))return value;return`data:${mime};base64,${value}`;
  }

  async function embed(pdf,dataUrl){
    const match=String(dataUrl||'').match(/^data:image\/(png|jpe?g);base64,(.+)$/i);if(!match)throw new Error('Formato firma/timbro non supportato.');
    const bytes=Uint8Array.from(atob(match[2]),char=>char.charCodeAt(0));
    return match[1].toLowerCase()==='png'?pdf.embedPng(bytes):pdf.embedJpg(bytes);
  }

  function drawFit(page,image,box){
    const scale=Math.min(box.width/image.width,box.height/image.height),width=image.width*scale,height=image.height*scale;
    page.drawImage(image,{x:box.x+(box.width-width)/2,y:box.y+(box.height-height)/2,width,height});
  }

  function resolveForHtml(selection,options={}){
    selection=normalizeSelection(selection);
    if(selection.mode==='none')return{mode:'none',signatureDataUrl:'',stampDataUrl:'',presetDataUrl:''};
    if(selection.mode==='preset')return{mode:'preset',signatureDataUrl:'',stampDataUrl:'',presetDataUrl:asDataUrl(options.preset,options.presetMime||'image/jpeg')};
    const user=currentUser();
    if(selection.ownerUid&&user?.uid&&selection.ownerUid!==user.uid)throw new Error(`Questo documento usa la firma personale di ${selection.ownerName||'un altro utente'}. Solo il titolare può rigenerarlo con quella firma.`);
    if(!selection.useSignature&&!selection.useStamp)throw new Error('Seleziona almeno la firma o il timbro personale.');
    const signatureDataUrl=selection.useSignature?assets.signatureDataUrl:'',stampDataUrl=selection.useStamp?assets.stampDataUrl:'';
    if(selection.useSignature&&!signatureDataUrl)throw new Error('La firma personale scelta non è disponibile. Apri “Firma e timbro” e creala di nuovo.');
    if(selection.useStamp&&!stampDataUrl)throw new Error('Il timbro personale scelto non è disponibile. Apri “Firma e timbro” e crealo di nuovo.');
    return{mode:'personal',signatureDataUrl,stampDataUrl,presetDataUrl:''};
  }

  async function drawOnPdf(pdf,page,selection,options={}){
    selection=normalizeSelection(selection);
    const box={x:Number(options.x||0),y:Number(options.y||0),width:Number(options.width||120),height:Number(options.height||50)};
    if(selection.mode==='none')return false;
    if(selection.mode==='preset'){
      const preset=asDataUrl(options.preset,options.presetMime||'image/jpeg');if(!preset)return false;drawFit(page,await embed(pdf,preset),box);return true;
    }
    const user=currentUser();
    if(selection.ownerUid&&user?.uid&&selection.ownerUid!==user.uid)throw new Error(`Questo documento usa la firma personale di ${selection.ownerName||'un altro utente'}. Solo il titolare può rigenerarlo con quella firma.`);
    if(user?.uid&&loadedUid!==user.uid)await loadForUser(user,window.cloudUserProfile||null);
    const signature=selection.useSignature?assets.signatureDataUrl:'',stamp=selection.useStamp?assets.stampDataUrl:'';
    if(!selection.useSignature&&!selection.useStamp)throw new Error('Seleziona almeno la firma o il timbro personale.');
    if(selection.useSignature&&!signature)throw new Error('La firma personale scelta non è disponibile. Apri “Firma e timbro” e creala di nuovo.');
    if(selection.useStamp&&!stamp)throw new Error('Il timbro personale scelto non è disponibile. Apri “Firma e timbro” e crealo di nuovo.');
    if(!signature&&!stamp)throw new Error('Nessuna firma o timbro personale disponibile.');
    if(stamp){const image=await embed(pdf,stamp);const stampBox=signature?{x:box.x+box.width*.42,y:box.y,width:box.width*.58,height:box.height}:box;drawFit(page,image,stampBox)}
    if(signature){const image=await embed(pdf,signature);const signatureBox=stamp?{x:box.x,y:box.y+box.height*.08,width:box.width*.7,height:box.height*.76}:box;drawFit(page,image,signatureBox)}
    return true;
  }

  function addStyles(){
    if(document.getElementById('vgUserAssetsStyle'))return;
    const style=document.createElement('style');style.id='vgUserAssetsStyle';style.textContent=`
      .vg-asset-manager{display:grid;gap:16px}.vg-asset-manager-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.vg-asset-manager-head h2{margin:3px 0 7px}.vg-asset-manager-head p{margin:0;max-width:760px;line-height:1.45}.vg-asset-kicker{color:#176b48;font-size:11px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.vg-asset-privacy{padding:12px 14px;border:1px solid #bddccb;border-radius:11px;background:#eef9f3;color:#24583f;line-height:1.45}.vg-asset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.vg-asset-card{border:1px solid #d5e1da;border-radius:14px;background:#fff;padding:15px}.vg-asset-card-head{display:flex;justify-content:space-between;gap:12px}.vg-asset-card-head>div{display:grid;gap:3px}.vg-asset-card-head small{color:#718078}.vg-asset-state{align-self:start;border-radius:999px;background:#fff1cf;color:#76530a;padding:5px 8px;font-size:10px;font-weight:900}.vg-asset-state.ready{background:#dff4e7;color:#08703b}.vg-asset-preview{height:190px;margin:13px 0;display:grid;place-items:center;align-content:center;gap:8px;border:2px dashed #cddbd3;border-radius:12px;background:linear-gradient(135deg,#fbfdfc,#f0f6f3);color:#718078}.vg-asset-preview>span{font-size:38px}.vg-asset-preview.has-image{background:repeating-conic-gradient(#f4f4f4 0 25%,#fff 0 50%) 0/20px 20px}.vg-asset-preview img{display:block;max-width:94%;max-height:170px;object-fit:contain}.vg-asset-card-actions{display:flex;gap:8px}.vg-asset-card-status{min-height:18px;margin:9px 0 0}.vg-asset-tips{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.vg-asset-tips span{padding:5px 8px;border-radius:999px;background:#edf3f0;font-size:11px;font-weight:800}.vg-asset-save-row{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #e0e7e3;padding-top:14px}.vg-assets-modal{position:fixed;inset:0;z-index:120000;background:rgba(8,25,18,.72);padding:18px;overflow:auto}.vg-assets-modal-card{width:min(1050px,100%);margin:0 auto;border-radius:16px;background:#f7f9f8;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.28)}
      .vg-document-seal-picker{margin:12px 0;padding:13px;border:1px solid #c9ddd2;border-radius:12px;background:#f7fbf9}.vg-document-seal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.vg-document-seal-head>div{display:grid;gap:3px}.vg-document-seal-head small{color:#6d7b74}.vg-document-seal-options,.vg-personal-asset-options{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:11px}.vg-document-seal-options label,.vg-personal-asset-options>label{display:flex;flex-direction:row;align-items:center;gap:6px;border:1px solid #ccdcd3;border-radius:999px;background:#fff;padding:7px 10px;font-size:11px;font-weight:850;cursor:pointer}.vg-document-seal-options input,.vg-personal-asset-options input{width:auto;margin:0;accent-color:#176b48}.vg-document-seal-previews{display:flex;gap:6px}.vg-document-seal-previews img{width:72px;height:38px;object-fit:contain;border:1px solid #dbe5df;border-radius:6px;background:#fff}.vg-document-seal-status{margin:9px 0 0}
      @media(max-width:700px){.vg-asset-grid{grid-template-columns:1fr}.vg-asset-manager-head,.vg-asset-save-row,.vg-document-seal-head{flex-direction:column}.vg-asset-manager-head button,.vg-asset-save-row button{width:100%}.vg-assets-modal{padding:0}.vg-assets-modal-card{min-height:100vh;border-radius:0;padding:14px}.vg-asset-preview{height:150px}}
    `;document.head.appendChild(style);
  }

  window.VargaUserDocumentAssets=Object.freeze({
    onUserReady:(user,profile)=>loadForUser(user,profile),
    onUserSignedOut:()=>{loadedUid='';loadSequence++;publishAssets(emptyAssets())},
    mountPicker,
    readPicker,
    openManager,
    drawOnPdf,
    resolveForHtml,
    processPhoto,
    refresh:renderProfilePanel,
    getAssets:()=>({...assets}),
    normalizeSelection
  });

  addStyles();renderProfilePanel();
  if(currentUser()?.uid)loadForUser(currentUser(),window.cloudUserProfile||null);
})();
