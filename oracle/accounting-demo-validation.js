"use strict";
/* Pure validation for future DEMO modules. No network, storage or business writes. */
(function(root,factory){
  const value=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=value;
  if(root)root.VGOracleAccountingDemo=value;
})(typeof window!=="undefined"?window:null,function(){
  function required(v,max=120){
    const x=String(v??"").trim();
    if(!x||x.length>max||!/^DEMO(?:[ -]|$)/i.test(x))
      throw Error("Usare esclusivamente descrizioni DEMO");
    return x;
  }
  function money(v){
    const n=Number(v);
    if(v===""||v===null||v===undefined||!Number.isFinite(n)||n<0||n>1000000)
      throw Error("Importo DEMO non valido");
    return Math.round((n+Number.EPSILON)*100)/100;
  }
  function date(v){
    if(typeof v!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v)||
       Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)
      throw Error("Data DEMO non valida");
    return v;
  }
  function demoClientId(v){
    const id=String(v??"").trim();
    if(!/^demo-cl-[a-z0-9-]{1,100}$/i.test(id))throw Error("Cliente DEMO non valido");
    return id;
  }
  function invoice(x){
    if(!x||typeof x!=="object")throw Error("Fattura DEMO mancante");
    const amount=money(x.amount);
    return Object.freeze({number:required(x.number,60),clientId:demoClientId(x.clientId),
      amount,date:date(x.date),due:date(x.due),status:"Da emettere"});
  }
  function consuntivo(x){
    if(!x||typeof x!=="object")throw Error("Consuntivo DEMO mancante");
    const quantity=Number(x.quantity),unitPrice=money(x.unitPrice);
    if(!Number.isFinite(quantity)||quantity<=0||quantity>10000)
      throw Error("Quantità DEMO non valida");
    return Object.freeze({title:required(x.title),code:required(x.code,60),
      quantity,unitPrice,total:money(quantity*unitPrice),status:"Da verificare"});
  }
  function priceEntry(x){
    if(!x||typeof x!=="object")throw Error("Voce DEMO mancante");
    return Object.freeze({code:required(x.code,60),description:required(x.description,240),
      unit:required(x.unit,30),price:money(x.price)});
  }
  return Object.freeze({invoice,consuntivo,priceEntry});
});
