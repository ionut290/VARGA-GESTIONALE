"use strict";
const assert=require("node:assert/strict");
const {SectionBridge,SANDBOX}=require("../section-bridge.js");
const rows={clients:[{id:"demo-1",name:"DEMO Primo"}],jobs:[],quotes:[]};
const revisions={clients:1,jobs:1,quotes:1};
const copy=x=>JSON.parse(JSON.stringify(x));
function client(){
  const seen={};
  return {
    async manifest(w){assert.equal(w,SANDBOX);return {workspace:w,sections:{clients:{},jobs:{},quotes:{}}}},
    async readSection(w,k){assert.equal(w,SANDBOX);seen[k]=revisions[k];return {workspace:w,section:k,revision:revisions[k],data:copy(rows[k])}},
    async saveSection(w,k,value){
      assert.equal(w,SANDBOX);
      if(seen[k]!==revisions[k]){const e=Error("revision conflict");e.status=409;throw e}
      rows[k]=copy(value);revisions[k]++;seen[k]=revisions[k];
      return {revision:revisions[k]};
    }
  };
}
async function main(){
  const a=client(),b=client();
  assert.throws(()=>new SectionBridge({client:a,workspace:"gestionale_backup_20261027",keys:["clients"],writable:true}),/disabilitata/);
  assert.throws(()=>new SectionBridge({client:a,workspace:"varga-azienda",keys:["clients"],writable:true}),/disabilitata/);
  const one=new SectionBridge({client:a,workspace:SANDBOX,keys:["clients","jobs","quotes"],writable:true});
  const two=new SectionBridge({client:b,workspace:SANDBOX,keys:["clients","jobs","quotes"],writable:true});
  await one.initialize();await two.initialize();
  const old=await two.load("clients");await one.load("clients");
  const d=one.view("clients");d.push({id:"demo-2",name:"DEMO Secondo"});
  assert.equal(one.view("clients").length,1);
  one.stage("clients",d);assert.equal((await one.commit("clients")).revision,2);
  two.stage("clients",[...old,{id:"demo-3",name:"DEMO Terzo"}]);
  const conflict=await two.commit("clients");
  assert.equal(conflict.conflict,true);
  const review=two.conflictValues("clients");
  assert.equal(review.local.length,2);assert.equal(review.remote.length,2);
  await assert.rejects(()=>two.commit("clients"),/Conflitto/);
  two.resolveConflict("clients",[...review.remote,review.local[1]]);
  assert.equal((await two.commit("clients")).revision,3);
  assert.equal(rows.clients.length,3);
  await two.load("jobs");
  two.stage("jobs",[{id:"demo-job",title:"DEMO Commessa"}]);
  assert.equal((await two.commit("jobs")).revision,2);
  const broken={...client(),async saveSection(){throw Error("offline")}};
  const offline=new SectionBridge({client:broken,workspace:SANDBOX,keys:["clients"],writable:true});
  await offline.initialize();await offline.load("clients");
  offline.stage("clients",[...offline.view("clients"),{id:"demo-4",name:"DEMO Quarto"}]);
  await assert.rejects(()=>offline.commit("clients"),/offline/);
  assert.equal(offline.state("clients").dirty,true);
  offline.discardDraft("clients");offline.clear();
  assert.throws(()=>offline.state("clients"),/Inizializzare/);
  const readOnly=new SectionBridge({client:client(),workspace:SANDBOX,keys:["clients"]});
  await readOnly.initialize();await readOnly.load("clients");
  assert.throws(()=>readOnly.stage("clients",[]),/Sola lettura/);
  console.log("OK: Oracle section bridge tested: revisions, conflicts, no automatic overwrite, offline draft.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
