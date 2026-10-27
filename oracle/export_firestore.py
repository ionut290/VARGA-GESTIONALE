"""Export an authorized Firestore workspace. Private output, never commit real data."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
SECTIONS=["clients","quotes","jobs","invoices","expenses","economicEntries","deadlines",
          "documents","consuntivi","depurazioneConsuntivi","discaricheConsuntivi",
          "wteModenaConsuntivi","cadrianoDocuments","requests","company"]
PAT=re.compile(r"^[A-Za-z0-9_-]{1,64}$")

def parse_doc(doc,key,version):
    if not doc.exists:raise ValueError("Missing section: "+key)
    fields=doc.to_dict() or {}
    if int(fields.get("version",-1))!=int(version):raise ValueError("Version mismatch: "+key)
    if not isinstance(fields.get("dataJson"),str):raise ValueError("No JSON section: "+key)
    value=json.loads(fields["dataJson"])
    if (not isinstance(value,dict)) if key=="company" else (not isinstance(value,list)):
        raise ValueError("Bad shape for section: "+key)
    return value

def load_workspace(client,workspace):
    pre="vargaGestionaleWorkspace_"+workspace
    col=client.collection("appConfig")
    ref=col.document(pre+"_manifest")
    manifest=ref.get()
    if not manifest.exists:
        doc=col.document(pre).get()
        if not doc.exists:raise ValueError("Missing legacy snapshot AND incremental manifest")
        data=json.loads((doc.to_dict() or {}).get("snapshotJson") or "{}")
        if not isinstance(data,dict) or not data:raise ValueError("Empty legacy snapshot")
        return data,"legacy"
    m=manifest.to_dict() or {}
    if m.get("mode")!="incremental-v3":raise ValueError("Unknown mode: abort")
    versions=m.get("versions") or {}
    result={}
    for key in SECTIONS:
        if key in versions:
            result[key]=parse_doc(col.document(pre+"_section_"+key).get(),key,versions[key])
    lp=versions.get("priceLists")
    ep=versions.get("entries")
    if bool(lp)!=bool(ep):raise ValueError("Incomplete catalog manifest")
    if lp and ep:
        generation=m.get("catalogGeneration") or ""
        names=pre+"_catalog_"+generation+"_lists" if generation else pre+"_section_priceLists"
        prefix=pre+"_entries_"+generation+"_" if generation else pre+"_entries_"
        result["priceLists"]=parse_doc(col.document(names).get(),"priceLists",lp)
        count=int(m.get("entryChunkCount",-1))
        if count<0 or count>10000:raise ValueError("Invalid catalog chunk count")
        entries=[]
        for i in range(count):
            entries+=parse_doc(col.document(prefix+str(i).zfill(4)).get(),"entries",ep)
        if m.get("entryCount") is not None and len(entries)!=int(m["entryCount"]):
            raise ValueError("Entry count mismatch")
        result["entries"]=entries
    elif not versions:raise ValueError("Empty manifest")
    latest=ref.get().to_dict() or {}
    if latest.get("versions")!=versions or latest.get("catalogGeneration")!=m.get("catalogGeneration"):
        raise ValueError("Manifest updated during export; retry")
    return result,"incremental-v3"

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--workspace",default="varga-azienda")
    ap.add_argument("--output",required=True)
    a=ap.parse_args()
    if not PAT.fullmatch(a.workspace):ap.error("Workspace non valido")
    output=Path(a.output)
    if output.exists():ap.error("Output exists — never overwrite prior backup")
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        ap.error("Set GOOGLE_APPLICATION_CREDENTIALS privately; do not commit key")
    import firebase_admin
    from firebase_admin import firestore
    firebase_admin.initialize_app()
    data,mode=load_workspace(firestore.client(),a.workspace)
    wrapper={"app":"Varga Gestionale","workspace":a.workspace,
             "exported_at":datetime.now(timezone.utc).isoformat(),
             "purpose":"Oracle migration private backup",
             "source_mode":mode,"data":data}
    raw=json.dumps(wrapper,ensure_ascii=False,allow_nan=False,indent=2)
    fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w",encoding="utf-8") as stream:stream.write(raw+"\n")
    print("Exported",mode,"counts",{k:len(v) for k,v in data.items() if isinstance(v,list)})
    print("Saved private 0600 file:",output)
if __name__=="__main__":main()
