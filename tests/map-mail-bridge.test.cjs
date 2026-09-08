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
test('does not mix a missing shared key with an unrelated local key',async()=>{
 const x=setup({url:'https://script.google.com/shared'},{token:'stale'});await x.ctx.window.VargaMailBridgeCall('ping');assert.equal(x.requests[0].token,'');
});
test('rejected settings do not overwrite existing connection',async()=>{
 const x=setup({url:'https://script.google.com/shared',token:'current'},{},true);await x.elements.saveMapBridge.onclick();assert.equal(x.saves(),0);assert.equal(x.ctx.db.company.driveBridge.token,'current');assert.match(x.elements.mapBridgeInfo.textContent,/VARGA_MAP_TOKEN/);assert.equal(x.requests.length,1);
});
test('valid settings are verified before persistence and configuration',async()=>{
 const x=setup({},{});await x.elements.saveMapBridge.onclick();assert.equal(x.saves(),1);assert.deepEqual(x.requests.map(r=>r.action),['ping','configure']);assert.equal(x.requests[0].token,'new-key');assert.equal(x.ctx.db.company.driveBridge.token,'new-key');
});
