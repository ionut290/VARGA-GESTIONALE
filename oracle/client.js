"use strict";
/* Oracle client. API sessions use an HttpOnly, Secure cookie; no token is
   exposed to browser JavaScript or saved in localStorage. */
(function(global){
  const DEFAULT_API = "https://gestionale.radio-romanii-italia.duckdns.org/api/gestionale/v1/";
  class OraclePilot {
    constructor(root=DEFAULT_API){
      const parsed = new URL(root);
      if(parsed.protocol!=="https:" && parsed.hostname!=="localhost" && parsed.hostname!=="127.0.0.1")
        throw Error("L'API Oracle richiede HTTPS.");
      this.base=parsed.href.replace(/\/?$/,"/");
      this.revisions=new Map();
    }
    async request(path, options={}){
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),15000);
      const headers={"Accept":"application/json",...(options.body?{"Content-Type":"application/json"}:{})};
      try{
        const res=await fetch(new URL(path,this.base),{...options,headers,signal:controller.signal,
            credentials:"same-origin",cache:"no-store",redirect:"error"});
        const kind=(res.headers.get("content-type")||"").toLowerCase();
        if(!kind.includes("application/json")) throw Error("Risposta inattesa: Oracle API non configurata o pagina HTML al posto del servizio.");
        const body=await res.json();
        if(!res.ok){
          const error=new Error(typeof body.detail==="string"?body.detail:JSON.stringify(body.detail||body));
          error.status=res.status;
          if(res.status===401)this.revisions.clear();
          throw error;
        }
        return body;
      }finally{clearTimeout(timeout)}
    }
    health(){return this.request("health")}
    async login(email,password,remember=true){
      const data=await this.request("auth/login",{method:"POST",body:JSON.stringify({email,password,remember:!!remember})});
      return data.user;
    }
    me(){return this.request("auth/me")}
    async logout(){
      try{await this.request("auth/logout",{method:"POST"})}
      finally{this.revisions.clear()}
    }
    validWorkspace(name){
      if(!/^[A-Za-z0-9_-]{1,64}$/.test(name))throw Error("Nome workspace non valido");
      return encodeURIComponent(name);
    }
    manifest(name){return this.request("workspaces/"+this.validWorkspace(name)+"/manifest")}
    cantieriStageSummary(name){
      return this.request("workspaces/"+this.validWorkspace(name)+"/cantieri-stage/summary");
    }
    cantieriStageDocuments(name,collection,offset=0,limit=100){
      if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(collection))throw Error("Raccolta non valida");
      if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>200)throw Error("Paginazione non valida");
      return this.request("workspaces/"+this.validWorkspace(name)+"/cantieri-stage/documents?collection="+encodeURIComponent(collection)+"&offset="+offset+"&limit="+limit);
    }
    async readSection(name,section){
      this.validWorkspace(section);
      const data=await this.request("workspaces/"+this.validWorkspace(name)+"/sections/"+encodeURIComponent(section));
      this.revisions.set(name+":"+section,data.revision);
      return data;
    }
    async saveSection(name,section,value){
      this.validWorkspace(section);
      const key=name+":"+section;
      if(!this.revisions.has(key))throw Error("Leggere la sezione prima di modificarla.");
      const body=JSON.stringify({expected_revision:this.revisions.get(key),data:{value}});
      const result=await this.request("workspaces/"+this.validWorkspace(name)+"/sections/"+encodeURIComponent(section),{method:"PUT",body});
      this.revisions.set(key,result.revision);
      return result;
    }
    async read(name){
      const data=await this.request("workspaces/"+this.validWorkspace(name));
      this.revisions.set(name,data.revision);
      return data;
    }
    async save(name,payload){
      if(!this.revisions.has(name))throw Error("Leggere il workspace prima di modificarlo.");
      if(!payload||typeof payload!=="object"||Array.isArray(payload))throw Error("Payload non valido.");
      const body=JSON.stringify({expected_revision:this.revisions.get(name),data:payload});
      const answer=await this.request("workspaces/"+this.validWorkspace(name),{method:"PUT",body});
      this.revisions.set(name,answer.revision);
      return answer;
    }
  }
  global.VGOraclePilot=OraclePilot;
})(window);
