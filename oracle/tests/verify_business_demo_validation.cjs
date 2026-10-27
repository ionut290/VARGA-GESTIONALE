"use strict";
const assert=require("node:assert/strict");
const v=require("../business-demo-validation.js");
const expense=v.expense({date:"2026-10-27",supplier:"DEMO Fornitore",category:"DEMO Materiali",
  amount:"12.349",jobId:"demo-job-123",notes:"DEMO Prova"});
assert.equal(expense.amount,12.35);
assert.equal(expense.jobId,"demo-job-123");
assert.throws(()=>v.expense({date:"2026-10-27",supplier:"Fornitore reale",category:"DEMO",amount:12}));
const deadline=v.deadline({title:"DEMO Telefonata",date:"",time:"09:00",type:"Attività",
  priority:"Normale",assignee:"DEMO Ufficio",jobId:"",notes:"",calendarEnabled:true});
assert.equal(deadline.calendarEnabled,false);
assert.equal(deadline.status,"Da fare");
assert.throws(()=>v.deadline({title:"DEMO Promemoria",date:"",time:"25:99",calendarEnabled:false}));
const document=v.documentRecord({name:"DEMO Contratto",category:"Contratto",clientId:"demo-cl-1",
  jobId:"",driveUrl:"",notes:"DEMO File fittizio"});
assert.equal(document.driveUrl,"");
assert.throws(()=>v.documentRecord({name:"DEMO Contratto",category:"Contratto",driveUrl:"https://drive.google.com/real-file"}));
assert.throws(()=>v.documentRecord({name:"DEMO Contratto",category:"Contratto",clientId:"real-client"}));
const company=v.company({name:"DEMO Azienda",vat:"",address:"",city:"",phone:"",email:"",pec:"",iban:"",footer:""});
assert.equal(company.name,"DEMO Azienda");
assert.throws(()=>v.company({name:"Azienda reale"}));
console.log("OK: validazioni DEMO per Spese, Scadenze, Documenti e Azienda; nessun collegamento esterno.");
