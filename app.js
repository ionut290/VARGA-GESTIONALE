// Bootstrap stabile di Varga Gestionale.
// Firebase di Varga Cantieri è preconfigurato: l'utente deve solo accedere con Google.
(function seedVargaGestionaleFirebaseConfig(){
  const firebaseConfig={apiKey:"AIzaSyBHZG9D1H5YOT9QUzG-cdSdftlreDJNa_k",authDomain:"hera-app-6cd2b.firebaseapp.com",projectId:"hera-app-6cd2b",storageBucket:"hera-app-6cd2b.firebasestorage.app",messagingSenderId:"645390631375",appId:"1:645390631375:web:df3659a23812560e4012ba"};
  try{const key='vg_cloudConfig';let current={};try{current=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(_){current={}}current.firebaseConfig=firebaseConfig;current.workspaceId=current.workspaceId||'varga-azienda';localStorage.setItem(key,JSON.stringify(current));}catch(err){console.warn('Configurazione Firebase automatica non salvata',err)}
})();
const VG_BUILD='20260905-job-remaining-value-v29';
window.VG_BUILD=VG_BUILD;
['app-core.js','app-business.js','clienti-avola.js','assets/avola-sidebar-1.js','assets/avola-sidebar-2.js','assets/avola-sidebar-3.js','assets/avola-sign-1.js','assets/avola-sign-2.js','assets/avola-image-loader.js','preventivi-avola.js','app-varga.js','app-sync.js','app-cloud.js','cloud-users.js','cloud-incremental-sync.js','accounting-sheet-view.js','accounting-sheet-tools.js','accounting-client-export-form.js','accounting-round-history-v2.js','dashboard-accounting-rounds.js','round-dashboard-settings.js','map-mail-bridge.js','request-mail-center.js','workforce-history.js','rapportini-lavoro.js','prezzari-excel-view.js','job-workspace.js'].forEach(function(src){document.write('<script src="'+src+'?v='+VG_BUILD+'"></scr'+'ipt>');});
document.write('<script>workspaceRef=function(){var el=document.getElementById("workspaceId");var id=((el&&el.value)||cloudCfg.workspaceId||"varga-azienda").trim().replace(/[^a-zA-Z0-9_-]/g,"_");return cloudStore.collection("appConfig").doc("vargaGestionaleWorkspace_"+id)};if(cloudUser){stopCloudRealtime();startCloudRealtime();}</scr'+'ipt>');
