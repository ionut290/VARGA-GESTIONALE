// Piccolo adattamento anagrafica clienti per i preventivi Avola.
(function(){
  if(typeof db==='undefined'||typeof $!=='function')return;
  const city=$('cCity');
  if(city&&!$('cZip')){
    const zip=document.createElement('input');zip.id='cZip';zip.placeholder='CAP';
    city.parentNode.insertBefore(zip,city);
  }
  if($('addClient'))$('addClient').onclick=()=>{
    const name=$('cName').value.trim();if(!name)return alert('Inserisci il cliente.');
    const zip=$('cZip')?.value.trim()||'',cityName=$('cCity').value.trim();
    const cityLine=[zip,cityName].filter(Boolean).join(' ');
    db.clients.push({id:uid(),name,vat:$('cVat').value,address:$('cAddress').value,zip,city:cityLine,email:$('cEmail').value,phone:$('cPhone').value,priceListId:$('cPriceList').value,notes:$('cNotes').value});
    ['cName','cVat','cAddress','cZip','cCity','cEmail','cPhone','cNotes'].forEach(i=>{if($(i))$(i).value=''});save();
  };
})();
