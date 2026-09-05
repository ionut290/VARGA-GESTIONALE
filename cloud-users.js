// Accesso condiviso con Varga Cantieri: stesso Firebase Auth, profilo e ruolo.
(function installSharedVargaAccess(){
  'use strict';

  let currentRole='';
  let currentProfile=null;
  const $=id=>document.getElementById(id);
  const labels={admin:'Amministratore',ufficio:'Ufficio',operatore:'Operatore'};
  const policy=window.VargaSharedAuthPolicy;

  function serverTime(){return firebase.firestore.FieldValue.serverTimestamp()}
  function profileRef(user){return cloudStore.collection('platformUsers').doc(user.uid)}
  function adminConfigRef(){return cloudStore.collection('appConfig').doc('adminUsers')}

  function accessPanel(){
    const sync=$('cloudInfo')?.closest('.panel');
    if(!sync||$('cloudMembersPanel'))return;
    sync.insertAdjacentHTML('beforebegin','<div class="panel" id="cloudMembersPanel"><h2>Accesso condiviso con Varga Cantieri</h2><p class="muted">Utenti, approvazioni e ruoli provengono direttamente da Varga Cantieri. Non esiste un secondo elenco separato.</p><div id="cloudMembersList" class="list"><div class="empty">Verifica account in corso…</div></div></div>');
  }

  function installUi(){
    const cards=$('cloud')?.querySelector('.cards');
    if(cards&&!$('cloudRole'))cards.insertAdjacentHTML('beforeend','<div class="card"><span>Ruolo Varga</span><strong class="small" id="cloudRole">-</strong></div>');
    accessPanel();
  }

  function render(){
    installUi();
    if($('cloudRole'))$('cloudRole').textContent=labels[currentRole]||'Non autorizzato';
    const list=$('cloudMembersList');
    if(!list)return;
    if(!cloudUser){list.innerHTML='<div class="empty">Accedi per visualizzare il profilo.</div>';return}
    const name=currentProfile?.nomeCompleto||currentProfile?.displayName||cloudUser.displayName||cloudUser.email||'Utente';
    const status=currentRole?(labels[currentRole]||currentRole):'Accesso non autorizzato';
    const safe=value=>typeof esc==='function'?esc(value):String(value||'');
    list.innerHTML=`<div class="item"><div class="item-main"><div class="item-title">${safe(name)}</div><div class="item-sub">${safe(cloudUser.email||'')} • ${safe(status)}</div></div></div>`;
  }

  async function readAdminEmails(){
    try{
      const snap=await adminConfigRef().get();
      return snap.exists&&Array.isArray(snap.data()?.emails)?snap.data().emails:[];
    }catch(error){
      if(String(error?.code||'').includes('permission-denied'))return[];
      throw error;
    }
  }

  async function ensureCantieriProfile(user,profile){
    if(profile)return profile;
    const displayName=user.displayName||user.email||'Utente';
    const parts=String(displayName).trim().split(/\s+/).filter(Boolean);
    const pending={
      uid:user.uid,
      email:user.email||'',
      displayName,
      nome:parts[0]||'',
      cognome:parts.slice(1).join(' '),
      nomeCompleto:displayName,
      emailVerified:user.emailVerified===true,
      statoAccount:'in_attesa',
      accountStatus:'in_attesa',
      role:'user',
      ruolo:'user',
      isAdmin:false,
      admin:false,
      banned:false,
      primoAccessoAt:serverTime(),
      firstLoginAt:serverTime(),
      createdFrom:'Varga Gestionale'
    };
    await profileRef(user).set(pending);
    return pending;
  }

  window.createPendingCantieriProfile=async function createPendingCantieriProfile(user){
    const snap=await profileRef(user).get();
    return ensureCantieriProfile(user,snap.exists?snap.data():null);
  };

  window.authorizeCloudUser=async function authorizeCloudUser(user){
    installUi();
    window.cloudUserAccessReason='';
    const [profileSnap,adminEmails]=await Promise.all([
      profileRef(user).get(),
      readAdminEmails()
    ]);
    let profile=profileSnap.exists?profileSnap.data():null;
    if(!profile)profile=await ensureCantieriProfile(user,profile);
    const access=policy.resolveAccess({user,profile,adminEmails});

    currentProfile=profile;
    currentRole=access.role||'';
    window.cloudUserRole=currentRole;
    window.cloudUserProfile=profile||null;
    window.cloudUserAccessReason=access.reason||'';

    if(access.allowed&&profile){
      profileRef(user).set({
        lastGestionaleLoginAt:serverTime(),
        lastGestionaleLoginEmail:user.email||'',
        emailVerified:user.emailVerified===true
      },{merge:true}).catch(error=>console.warn('Aggiornamento ultimo accesso non riuscito',error));
    }
    render();
    return access.allowed;
  };

  window.cloudUserSignedOut=function cloudUserSignedOut(){
    currentRole='';
    currentProfile=null;
    window.cloudUserRole='';
    window.cloudUserProfile=null;
    window.cloudUserAccessReason='';
    render();
  };

  installUi();
})();
