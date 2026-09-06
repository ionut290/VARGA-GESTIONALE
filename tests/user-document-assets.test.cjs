const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'user-document-assets.js'),'utf8');

function loadModule(){
  const memory=new Map();
  const context={
    window:{cloudUserProfile:{},dispatchEvent(){}},
    cloudUser:{uid:'utente-1',email:'mario@example.com',displayName:'Mario Rossi'},
    document:{
      head:{appendChild(){}},
      body:{appendChild(){}},
      getElementById(){return null},
      createElement(){return{dataset:{},style:{},classList:{toggle(){}},appendChild(){},remove(){}}}
    },
    localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},
    console,
    setTimeout,
    clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  return context;
}

test('firma e timbro sono personali, persistiti nel profilo e mai come foto originale',()=>{
  assert.match(source,/platformUsers/);
  assert.match(source,/gestionaleDocumentAssets/);
  assert.match(source,/doc\(user\.uid\)|doc\(user\.uid\)\.set|\.doc\(user\.uid\)/);
  assert.match(source,/createImageBitmap/);
  assert.match(source,/getImageData/);
  assert.match(source,/putImageData/);
  assert.match(source,/toDataURL\('image\/png'\)/);
  assert.doesNotMatch(source,/originalDataUrl|originalPhoto|fotoOriginale/);
});

test('selezione documento supporta preimpostati, personali e nessuna immagine',async()=>{
  const context=loadModule(),api=context.window.VargaUserDocumentAssets;
  const signature='data:image/png;base64,AA==',stamp='data:image/png;base64,AQ==';
  await api.onUserReady(context.cloudUser,{gestionaleDocumentAssets:{signatureDataUrl:signature,stampDataUrl:stamp,updatedAt:'2026-09-06T10:00:00.000Z'}});

  assert.equal(api.normalizeSelection().mode,'preset');
  assert.equal(api.resolveForHtml({mode:'none'}).mode,'none');
  assert.match(api.resolveForHtml({mode:'preset'},{preset:'AA=='}).presetDataUrl,/^data:image\/jpeg;base64,/);

  const personal=api.resolveForHtml({mode:'personal',useSignature:true,useStamp:false,ownerUid:'utente-1'});
  assert.equal(personal.signatureDataUrl,signature);
  assert.equal(personal.stampDataUrl,'');

  assert.throws(()=>api.resolveForHtml({mode:'personal',useSignature:false,useStamp:false,ownerUid:'utente-1'}),/almeno la firma o il timbro/);
  assert.throws(()=>api.resolveForHtml({mode:'personal',ownerUid:'utente-2',ownerName:'Altro utente'}),/Solo il titolare/);
});

test('il selettore è collegato a preventivi, consuntivi e contabilità cliente',()=>{
  const files=['preventivi-avola.js','depurazione-consuntivi.js','discariche-consuntivi.js','stradelli-guelfi-consuntivi.js','accounting-client-export-form.js'];
  for(const file of files){
    const code=fs.readFileSync(path.join(root,file),'utf8');
    assert.match(code,/mountPicker/);
    assert.match(code,/documentSeal/);
    assert.match(code,/drawOnPdf|resolveForHtml/);
  }
});

test('il modulo viene caricato prima dei generatori di documenti e ha una sezione profilo',()=>{
  const loader=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(loader.indexOf('user-document-assets.js')<loader.indexOf('preventivi-avola.js'));
  assert.ok(loader.indexOf('user-document-assets.js')<loader.indexOf('depurazione-consuntivi.js'));
  assert.match(html,/data-view="firmaTimbro"/);
  assert.match(html,/id="userDocumentAssetsPanel"/);
});
