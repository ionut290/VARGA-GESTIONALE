const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const ExcelJS=require('../vendor/exceljs.min.js');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('dashboard-company-economics.js','utf8'),ctx);
require('../dashboard-company-economics.js');
const aggregate=ctx.VargaCompanyEconomics.aggregate;
const barPercent=ctx.VargaCompanyEconomics.barPercent;
const pendingMapRows=ctx.VargaCompanyEconomics.pendingMapRows;
const buildWorkbook=global.VargaCompanyEconomics.buildWorkbook;
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
test('exports only MAP still pending with job details and waiting days',()=>{
 const rows=pendingMapRows([{id:'p',jobId:'a',status:'DA_CONFERMARE',type:'Consuntivo',title:'Sfalcio 2',amount:'1.250,50',documentDate:'2026-09-01'},{id:'c',jobId:'a',status:'CONFERMATA',amount:99,documentDate:'2026-09-02'}],[{id:'a',title:'Hera Cadriano',code:'CAD-1'}],new Date('2026-09-07T12:00:00Z'));
 assert.equal(rows.length,1);assert.equal(rows[0].job,'Hera Cadriano');assert.equal(rows[0].code,'CAD-1');assert.equal(rows[0].amount,1250.5);assert.equal(rows[0].days,6);
});
test('dashboard exposes the company Excel report with the three required sheets',()=>{
 const source=fs.readFileSync('dashboard-company-economics.js','utf8');
 assert.match(source,/SCARICA EXCEL/);assert.match(source,/Riepilogo aziendale/);assert.match(source,/Situazione commesse/);assert.match(source,/MAP in attesa/);
});
test('creates a valid Excel workbook with reconciled summary and pending MAP detail',async()=>{
 const jobs=[{id:'a',title:'Hera Cadriano',code:'CAD-1',hourlyRevenueRate:35}],entries=[{id:'p',jobId:'a',status:'DA_CONFERMARE',type:'Consuntivo',title:'Sfalcio 2',amount:1250,documentDate:'2026-09-01'}];
 const result=aggregate(jobs,[{jobId:'a',data:'2026-09-01',ore:10}],[...entries,{id:'c',jobId:'a',status:'CONFERMATA',amount:900,mapReceivedAt:'2026-09-02'}],'2026-01-01','2026-12-31');
 const wb=await buildWorkbook(result,{jobs,entries},2026,ExcelJS,new Date('2026-09-07T12:00:00Z')),buffer=await wb.xlsx.writeBuffer(),readBack=new ExcelJS.Workbook();await readBack.xlsx.load(buffer);
 assert.deepEqual(readBack.worksheets.map(s=>s.name),['Riepilogo aziendale','Situazione commesse','MAP in attesa']);assert.equal(readBack.getWorksheet('Riepilogo aziendale').getCell('B8').value,1250);assert.equal(readBack.getWorksheet('MAP in attesa').getCell('A5').value,'Hera Cadriano');assert.equal(readBack.getWorksheet('MAP in attesa').getCell('I5').value,1250);
});
