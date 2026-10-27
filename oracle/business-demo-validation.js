"use strict";
/* Pure validation for synthetic-only Oracle business forms. */
(function(root,factory){
  const value=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=value;
  if(root)root.VGOracleBusinessDemo=value;
})(typeof window!=="undefined"?window:null,function(){
  const DEMO=/^DEMO(?:[ -]|$)/i;
  const TYPES=new Set(["Attività","Pagamento","Sopralluogo","Cliente","Commessa","Documento","Rinnovo","Generale"]);
  const PRIORITIES=new Set(["Normale","Alta","Urgente","Bassa"]);
  const CATEGORIES=new Set(["Preventivo","Contratto","Fattura","Foto","POS","Altro"]);
  function text(value,label,{required=true,max=240}={}){
    const out=String(value??"").trim();
    if((required&&!out)||out.length>max||(out&&!DEMO.test(out)))
      throw Error(label+" deve essere vuoto oppure iniziare con DEMO; massimo "+max+" caratteri.");
    return out;
  }
  function money(value){
    const amount=Number(value);
    if(value===""||value===null||value===undefined||!Number.isFinite(amount)||amount<0||amount>1000000)
      throw Error("Importo DEMO non valido.");
    return Math.round((amount+Number.EPSILON)*100)/100;
  }
  function date(value,{required=false}={}){
    const out=String(value??"");
    if(!out&&!required)return "";
    if(!/^\d{4}-\d{2}-\d{2}$/.test(out)||Number.isNaN(Date.parse(out))||
       new Date(out).toISOString().slice(0,10)!==out)throw Error("Data DEMO non valida.");
    return out;
  }
  function id(value,prefix,label,{required=false}={}){
    const out=String(value??"").trim();
    if(!out&&!required)return "";
    if(!new RegExp("^demo-"+prefix+"-[a-z0-9-]{1,100}$","i").test(out))
      throw Error(label+" deve appartenere al workspace DEMO.");
    return out;
  }
  function expense(x){
    if(!x||typeof x!=="object")throw Error("Spesa DEMO mancante.");
    return Object.freeze({date:date(x.date),
      supplier:text(x.supplier,"Fornitore DEMO",{max:100}),
      category:text(x.category,"Categoria DEMO",{max:80}),
      amount:money(x.amount),jobId:id(x.jobId,"job","Commessa DEMO"),
      notes:text(x.notes,"Note DEMO",{required:false,max:300})});
  }
  function deadline(x){
    if(!x||typeof x!=="object")throw Error("Attività DEMO mancante.");
    const dateValue=date(x.date);
    const time=String(x.time||"");
    if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error("Ora DEMO non valida.");
    const type=String(x.type||"Attività"),priority=String(x.priority||"Normale");
    if(!TYPES.has(type)||!PRIORITIES.has(priority))throw Error("Tipo o priorità DEMO non validi.");
    return Object.freeze({title:text(x.title,"Titolo DEMO",{max:120}),date:dateValue,time,
      type,priority,assignee:text(x.assignee,"Responsabile DEMO",{required:false,max:100}),
      jobId:id(x.jobId,"job","Commessa DEMO"),
      notes:text(x.notes,"Note DEMO",{required:false,max:500}),
      calendarEnabled:false,status:"Da fare",done:false});
  }
  function documentRecord(x){
    if(!x||typeof x!=="object")throw Error("Documento DEMO mancante.");
    const category=String(x.category||"Altro");
    if(!CATEGORIES.has(category))throw Error("Categoria documento DEMO non valida.");
    if(String(x.driveUrl||"").trim())throw Error("I link Drive sono disabilitati nel laboratorio DEMO.");
    return Object.freeze({name:text(x.name,"Nome documento DEMO",{max:120}),category,
      clientId:id(x.clientId,"cl","Cliente DEMO"),jobId:id(x.jobId,"job","Commessa DEMO"),
      driveUrl:"",notes:text(x.notes,"Note DEMO",{required:false,max:300})});
  }
  function company(x){
    if(!x||typeof x!=="object")throw Error("Dati azienda DEMO mancanti.");
    const fields={name:100,vat:80,address:160,city:100,phone:60,email:120,pec:120,iban:80,footer:500};
    const result={};
    for(const [key,max] of Object.entries(fields))result[key]=text(x[key],"Campo "+key+" DEMO",{required:key==="name",max});
    return Object.freeze(result);
  }
  return Object.freeze({expense,deadline,documentRecord,company});
});
