const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('dashboard-company-economics.js','utf8'),ctx);
const aggregate=ctx.VargaCompanyEconomics.aggregate;
const barPercent=ctx.VargaCompanyEconomics.barPercent;
test('counts each job once, costs hours and includes only confirmed MAP in period',()=>{
 const jobs=[{id:'a',title:'INRETE',hourlyRevenueRate:35},{id:'b',title:'INRETE Modena',hourlyRevenueRate:40}];
 const result=aggregate(jobs,[{jobId:'b',data:'2026-06-01',ore:2},{jobId:'a',data:'2026-06-02',ore:'1,5'},{commessa:'INRETE Modena',data:'2026-06-03',ore:1},{jobId:'unknown',commessa:'INRETE',data:'2026-06-04',ore:10}],
 [{id:'p',jobId:'a',amount:1000,status:'DA_CONFERMARE',documentDate:'2026-06-01'},{id:'c',jobId:'b',amount:200,status:'CONFERMATA',mapReceivedAt:'2026-07-01'},{id:'old',jobId:'a',amount:900,status:'CONFERMATA',mapReceivedAt:'2025-12-01'}],'2026-01-01','2026-12-31');
 assert.equal(result.total.hours,4.5);assert.equal(result.total.cost,172.5);assert.equal(result.total.income,200);assert.equal(result.unmatched,1);assert.equal(result.total.months[5].cost,172.5);assert.equal(result.total.months[6].income,200);
});
test('deduplicates document sources, preserves separate MAP entries and avoids ambiguous names',()=>{
 const r=aggregate([{id:'a',title:'Same'},{id:'b',title:'Same'}],[{commessa:'Same',data:'2026-01-01',ore:9}],
 [{id:'1',sourceKey:'doc1',jobId:'a',amount:10,status:'CONFERMATA',documentDate:'2026-01-01',updatedAt:'2026-01-01'},{id:'2',sourceKey:'doc1',jobId:'a',amount:20,status:'CONFERMATA',documentDate:'2026-01-01',updatedAt:'2026-02-01'},{id:'3',sourceKey:'doc2',jobId:'a',amount:30,status:'CONFERMATA',documentDate:'2026-01-01'}],'2026-01-01','2026-12-31');
 assert.equal(r.total.income,50);assert.equal(r.total.cost,0);assert.equal(r.unmatched,1);
});
test('scales compact comparison bars and keeps small non-zero values visible',()=>{
 assert.equal(barPercent(0,100),0);
 assert.equal(barPercent(1,1000),2);
 assert.equal(barPercent(500,1000),50);
 assert.equal(barPercent(2000,1000),100);
});
