// Deterministic Firestore double: exercises application code, not production rules.
(function(){
const cp=x=>JSON.parse(JSON.stringify(x));
const state={docs:{},batches:0,failBatchAt:0,failReads:false,commitHook:null,readHook:null,listener:null};
function snapshot(key){return {exists:Object.hasOwn(state.docs,key),data:()=>cp(state.docs[key]),metadata:{fromCache:false,hasPendingWrites:false}}}
function merge(old,v){const out={...old,...cp(v)};if(v.versions)out.versions={...old?.versions,...v.versions};return out}
function reference(key){return {key,async get(){if(state.failReads)throw Error('Rete assente (test)');if(state.readHook)await state.readHook(key);return snapshot(key)},onSnapshot(fn){state.listener=fn;return()=>{state.listener=null}}}}
const store={collection:()=>({doc:reference}),batch(){const writes=[];return {set(ref,value){writes.push([ref.key,cp(value)])},async commit(){state.batches++;if(state.failBatchAt===state.batches)throw Error('Invio interrotto (test)');for(const [key,value]of writes)state.docs[key]=value}}},async runTransaction(fn){const writes=[];if(state.commitHook){const hook=state.commitHook;state.commitHook=null;await hook()}const result=await fn({get:async ref=>snapshot(ref.key),set(ref,value,opts){writes.push([ref.key,cp(value),opts])}});for(const [key,value,opts]of writes)state.docs[key]=opts?.merge?merge(state.docs[key],value):value;return result}};
window.firebase={firestore:{FieldValue:{serverTimestamp:()=>Date.now()}}};
window.testStore=state;window.testConnect=()=>{cloudUser={uid:'test-user'};cloudStore=store};
window.testCatalog=(n=3,name='Test nuovo')=>({priceLists:[{id:'pl-test',name}],entries:Array.from({length:n},(_,i)=>({id:'t'+i,priceListId:'pl-test',code:'TEST.'+i,description:'Voce sintetica '+i,unit:'cad',price:i+.5}))});
window.seedRemote=(catalog,version=10,generation='')=>{const pre='vargaGestionaleWorkspace_varga-azienda';const chunks=[];for(let i=0;i<catalog.entries.length;i+=900)chunks.push(catalog.entries.slice(i,i+900));const manifest={versions:{priceLists:version,entries:version},entryChunkCount:chunks.length,entryCount:catalog.entries.length,catalogHash:VGPriceCatalog.hash(catalog),catalogGeneration:generation,updatedBy:'test-user'};state.docs[pre+'_manifest']=manifest;state.docs[pre+(generation?'_catalog_'+generation+'_lists':'_section_priceLists')]={version,dataJson:JSON.stringify(catalog.priceLists)};chunks.forEach((rows,i)=>state.docs[pre+'_entries_'+(generation?generation+'_':'')+String(i).padStart(4,'0')]={version,dataJson:JSON.stringify(rows)});return manifest};
window.testSnapshot=()=>snapshot('vargaGestionaleWorkspace_varga-azienda_manifest');
})();
