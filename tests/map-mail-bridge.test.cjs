const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('map-mail-bridge.js','utf8');
function setup(shared,local,reject=false){
 const elements={azienda:{appendChild(p){elements[p.id]=p}},mapBridgeInfo:{},saveMapBridge:{},testMapBridge:{},checkMapBridge:{},mapBridgeUrl:{value:'https://script.google.com/macros/s/new/exec'},mapBridgeToken:{value:'new-key'}};
 const requests=[];let saves=0;
 const ctx={db:{company:{driveBridge:shared}},window:{},localStorage:{getItem:()=>JSON.stringify(local),setItem(){}},document:{getElementById:id=>elements[id],createElement:()=>({}),documentElement:{},readyState:'complete'},MutationObserver:class{observe(){}},setTimeout(){},clearTimeout(){},setInterval(){},AbortController,save(){saves++},alert(){},fetch:async(url,opts)=>{requests.push({url,...JSON.parse(opts.body)});return{ok:true,json:async()=>reject?{ok:false,error:'Token ponte non valido'}:{ok:true}}}};
 vm.runInNewContext(source,ctx);return{ctx,elements,requests,saves:()=>saves};
}
test('shared connection replaces stale local URL and token together',async()=>{
 const x=setup({url:'https://script.google.com/shared',token:'current'},{url:'https://script.google.com/old',token:'stale'});
 await x.ctx.window.VargaMailBridgeCall('ping');assert.equal(x.requests[0].token,'current');assert.equal(x.requests[0].url,'https://script.google.com/shared');
});
test('vault call removes the browser and shared token after server verification',async()=>{
 const x=setup({url:'https://script.google.com/shared',token:'old-key'},{url:'https://script.google.com/shared',token:'old-key'});
 let cached={url:'https://script.google.com/shared',token:'old-key'};
 x.ctx.localStorage.getItem=()=>JSON.stringify(cached);
 x.ctx.localStorage.setItem=(_,value)=>{cached=JSON.parse(value)};
 const sent=[];x.ctx.cloudUser={uid:'owner'};
 x.ctx.cloudFunctions={httpsCallable:()=>async payload=>{sent.push(payload);return{data:{ok:true}}}};
 await x.ctx.window.VargaMailBridgeCall('driveList',{folderId:'folder'});
 assert.deepEqual(sent.map(x=>x.action),['ping','driveList']);
 assert.equal(sent[1].token,undefined);assert.equal(cached.token,'');
 assert.equal(x.ctx.db.company.driveBridge.token,'');assert.equal(cached.vault,true);
 assert.equal(x.requests.length,0);
});
test('does not mix a missing shared key with an unrelated local key',async()=>{
 const x=setup({url:'https://script.google.com/shared'},{token:'stale'});await x.ctx.window.VargaMailBridgeCall('ping');assert.equal(x.requests[0].token,'');
});
test('rejected settings do not overwrite existing connection',async()=>{
 const x=setup({url:'https://script.google.com/shared',token:'current'},{},true);await x.elements.saveMapBridge.onclick();assert.equal(x.saves(),0);assert.equal(x.ctx.db.company.driveBridge.token,'current');assert.match(x.elements.mapBridgeInfo.textContent,/VARGA_MAP_TOKEN/);assert.equal(x.requests.length,1);
});
test('valid settings are verified before persistence and configuration',async()=>{
 const x=setup({},{});await x.elements.saveMapBridge.onclick();assert.equal(x.saves(),1);assert.deepEqual(x.requests.map(r=>r.action),['ping','configure']);assert.equal(x.requests[0].token,'new-key');assert.equal(x.ctx.db.company.driveBridge.token,'new-key');
});
test('recovers a valid local key when the shared copy is stale',async()=>{
 const x=setup({url:'https://script.google.com/shared',token:'stale'},{url:'https://script.google.com/shared',token:'current'});
 x.ctx.fetch=async(url,opts)=>{const request=JSON.parse(opts.body);x.requests.push({url,...request});return{ok:true,json:async()=>request.token==='current'?{ok:true}:{ok:false,error:'Token ponte non valido'}}};
 const result=await x.ctx.window.VargaMailBridgeCall('ping');assert.equal(result.ok,true);assert.deepEqual(x.requests.map(r=>r.token),['stale','current']);assert.equal(x.ctx.db.company.driveBridge.token,'current');assert.equal(x.saves(),1);
});
test('never tries a key cached for a different URL',async()=>{
 const x=setup({url:'https://script.google.com/shared',token:'stale'},{url:'https://script.google.com/other',token:'current'},true);
 await assert.rejects(x.ctx.window.VargaMailBridgeCall('ping'),/VARGA_MAP_TOKEN/);assert.equal(x.requests.length,1);assert.equal(x.saves(),0);
});
