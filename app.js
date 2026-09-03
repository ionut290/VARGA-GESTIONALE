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

const VG_BUILD='20260903-2002-firestore-workspace1';
[
  'app-core.js',
  'app-business.js',
  'app-varga.js',
  'app-sync.js',
  'app-cloud.js'
].forEach(function(src){
  document.write('<script src="'+src+'?v='+VG_BUILD+'"></scr'+'ipt>');
});

// app-cloud.js definisce inizialmente una collection dedicata che non è ammessa dalle regole
// di Varga Cantieri. Dopo il caricamento la sostituiamo con un documento appConfig,
// già autorizzato agli utenti autenticati e agli admin.
document.write('<script>workspaceRef=function(){var el=document.getElementById("workspaceId");var id=((el&&el.value)||cloudCfg.workspaceId||"varga-azienda").trim().replace(/[^a-zA-Z0-9_-]/g,"_");return cloudStore.collection("appConfig").doc("vargaGestionaleWorkspace_"+id)};if(cloudUser){stopCloudRealtime();startCloudRealtime();}console.info("Varga Gestionale workspace Firestore:","appConfig/vargaGestionaleWorkspace_"+((document.getElementById("workspaceId")&&document.getElementById("workspaceId").value)||"varga-azienda"));</scr'+'ipt>');
