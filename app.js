// Bootstrap stabile di Varga Gestionale.
// Firebase di Varga Cantieri è preconfigurato: l'utente deve solo accedere con Google.
(function seedVargaGestionaleFirebaseConfig(){
  const firebaseConfig={
    apiKey:"AIzaSyBHZG9D1H5YOT9QUzG-cdSdftlreDJNa_k",
    authDomain:"hera-app-6cd2b.firebaseapp.com",
    projectId:"hera-app-6cd2b",
    storageBucket:"hera-app-6cd2b.firebasestorage.app",
    messagingSenderId:"645390631375",
    appId:"1:645390631375:web:df3659a23812560e4012ba"
  };
  try{
    const key='vg_cloudConfig';
    let current={};
    try{current=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(_){current={}}
    current.firebaseConfig=firebaseConfig;
    current.workspaceId=current.workspaceId||'varga-azienda';
    localStorage.setItem(key,JSON.stringify(current));
  }catch(err){console.warn('Configurazione Firebase automatica non salvata',err)}
})();

// Versione univoca per impedire a GitHub Pages/browser di riusare vecchi moduli cloud.
const VG_BUILD='20260903-1948-firebase-live1';
document.write(
  '<script src="app-core.js?v='+VG_BUILD+'"><\\/script>'+ 
  '<script src="app-business.js?v='+VG_BUILD+'"><\\/script>'+ 
  '<script src="app-varga.js?v='+VG_BUILD+'"><\\/script>'+ 
  '<script src="app-sync.js?v='+VG_BUILD+'"><\\/script>'+ 
  '<script src="app-cloud.js?v='+VG_BUILD+'"><\\/script>'+ 
  '<script>workspaceRef=function(){var id=(document.getElementById("workspaceId")?.value||cloudCfg.workspaceId||"varga-azienda").trim();return cloudStore.collection("appConfig").doc("vargaGestionaleWorkspace_"+id)};console.info("Varga Gestionale Firebase LIVE",cloudCfg.firebaseConfig?.projectId);<\\/script>'
);
