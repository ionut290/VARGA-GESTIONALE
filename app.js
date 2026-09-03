// Bootstrap stabile di Varga Gestionale.
// I moduli sotto vengono aggiornati in-place tramite commit GitHub; non vengono creati file versione-v2/v3 ad ogni modifica.
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
    if(!current.firebaseConfig||current.firebaseConfig.projectId!==firebaseConfig.projectId){
      current.firebaseConfig=firebaseConfig;
    }
    current.workspaceId=current.workspaceId||'varga-azienda';
    localStorage.setItem(key,JSON.stringify(current));
  }catch(err){console.warn('Configurazione Firebase automatica non salvata',err)}
})();
document.write('<script src="app-core.js"><\/script><script src="app-business.js"><\/script><script src="app-varga.js"><\/script><script src="app-sync.js"><\/script><script src="app-cloud.js"><\/script>');
