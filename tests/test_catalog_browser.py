"""Local Chromium tests. Synthetic data only; Firestore is a deterministic double.
Run: python tests/test_catalog_browser.py (requires playwright and Chromium).
"""
import contextlib, functools, http.server, json, os, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/tests/catalog-harness.html'
results=[]

def check(name,script,after=None):
    ctx=browser.new_context(viewport={'width':1280,'height':950})
    page=ctx.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    try:
        page.goto(URL); page.evaluate('VGPriceCatalog.ready')
        if errors: raise AssertionError(errors)
        value=page.evaluate(script)
        if value is not True: raise AssertionError(value)
        if after: after(ctx,page)
        if errors: raise AssertionError(errors)
        results.append({'test':name,'ok':True});print('PASS',name,flush=True)
    except Exception as e:
        results.append({'test':name,'ok':False,'error':str(e)});print('FAIL',name,str(e),flush=True)
    finally: ctx.close()

def reload_assert(ctx,page):
    page.close(); p=ctx.new_page();p.goto(URL);p.evaluate('VGPriceCatalog.ready')
    assert p.evaluate("db.entries.length===23001 && db.priceLists[0].name==='Test nuovo'")

def after_reopen(ctx,page):
    page.reload();page.evaluate('VGPriceCatalog.ready')
    assert page.evaluate("db.entries.length===4 && db.priceLists[0].id==='pl-test'")

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM') or None,headless=True,args=['--no-sandbox'])
    check('Boot waits for atomic catalog hydration',"""async()=>{await VGPriceCatalog.flush();return db.entries.length===5&&!VGPriceCatalog.status().pending} """)
    check('23,001 rows survive closing and reopening a tab',"""async()=>{await VGPriceCatalog.commit(testCatalog(23001));return db.entries.length===23001 && localStorage.getItem('vg_entries')==='[]'}""",reload_assert)
    check('Second import keeps first catalog',"""async()=>{const a=testCatalog(3);await VGPriceCatalog.commit(a);const b={priceLists:[...a.priceLists,{id:'p2',name:'Secondo'}],entries:[...a.entries,{id:'e-second',priceListId:'p2',description:'Secondo',price:1}]};await VGPriceCatalog.commit(b);return db.priceLists.length===2 && db.entries.length===4}""")
    check('Previous catalog is retained before replacement',"""async()=>{await VGPriceCatalog.commit(testCatalog(4));await VGPriceCatalog.commit(testCatalog(2));const b=await VGPriceCatalog.backup();return b.catalog.entries.length===4 && db.entries.length===2}""")
    check('Smaller latest catalog is not replaced by a larger legacy array',"""async()=>{await VGPriceCatalog.commit(testCatalog(4));const d=await entryDatabase();await new Promise((r,j)=>{const t=d.transaction('priceEntries','readwrite');t.objectStore('priceEntries').put(testCatalog(200).entries,'all');t.oncomplete=r;t.onabort=j});d.close();return true}""",after_reopen)
    check('Transaction abort preserves both names and entries',"""async()=>{await VGPriceCatalog.commit(testCatalog(4));const old=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(this.name==='catalogs'&&k.endsWith(':current')){this.transaction.abort();return {}}return old.call(this,v,k)};let failed=false;try{await VGPriceCatalog.commit(testCatalog(9,'Non salvato'))}catch(e){failed=true}finally{IDBObjectStore.prototype.put=old}return failed&&db.entries.length===4&&VGPriceCatalog.status().catalog.entries.length===4}""",after_reopen)
    check('localStorage quota cannot erase committed IndexedDB catalog',"""async()=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='vg_entries'||k==='vg_priceLists')throw new DOMException('Full','QuotaExceededError');return old.call(this,k,v)};try{await VGPriceCatalog.commit(testCatalog(4))}finally{Storage.prototype.setItem=old}return db.entries.length===4}""",after_reopen)
    check('Duplicate identifiers are rejected without changing archive',"""async()=>{const c=testCatalog(2);c.entries[1].id=c.entries[0].id;let bad=false;try{await VGPriceCatalog.commit(c)}catch(e){bad=true}return bad&&db.entries.length===5}""")
    check('Cloud download persists entries and names across reload',"""async()=>{seedRemote(testCatalog(4));testConnect();await VGIncrementalSync.initialize('varga-azienda:test-user');return db.entries.length===4&&!VGPriceCatalog.status().pending}""",after_reopen)
    check('Missing cloud chunk never replaces local data',"""async()=>{seedRemote(testCatalog(1000));delete testStore.docs['vargaGestionaleWorkspace_varga-azienda_entries_0001'];testConnect();let failed=false;try{await VGIncrementalSync.initialize('varga-azienda:test-user')}catch(e){failed=true}return failed&&db.entries.length===5}""")
    check('Wrong cloud row count is rejected',"""async()=>{seedRemote(testCatalog(5));testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'].entryCount=6;testConnect();let failed=false;try{await VGIncrementalSync.initialize('varga-azienda:test-user')}catch(e){failed=true}return failed&&db.priceLists[0].id==='pl-default'}""")
    check('Invalid JSON in a chunk is rejected',"""async()=>{seedRemote(testCatalog(5));testStore.docs['vargaGestionaleWorkspace_varga-azienda_entries_0000'].dataJson='{';testConnect();let failed=false;try{await VGIncrementalSync.initialize('varga-azienda:test-user')}catch(e){failed=true}return failed&&db.entries[0].id==='e1'}""")
    check('Stale-version cloud chunk is rejected',"""async()=>{seedRemote(testCatalog(5),10);testStore.docs['vargaGestionaleWorkspace_varga-azienda_entries_0000'].version=9;testConnect();let failed=false;try{await VGIncrementalSync.initialize('varga-azienda:test-user')}catch(e){failed=true}return failed&&VGPriceCatalog.status().base.entries===undefined}""")
    check('Offline cloud failure retains pending local import',"""async()=>{await VGPriceCatalog.commit(testCatalog(4));testConnect();testStore.failReads=true;const r=await pushCloudNow(true);return r.ok===false&&db.entries.length===4&&VGPriceCatalog.status().pending}""",after_reopen)
    check('Successful cloud commit acknowledges exact uploaded catalog',"""async()=>{await VGPriceCatalog.commit(testCatalog(1000));testConnect();const r=await pushCloudNow(true);const m=testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'];return r.ok===true&&!VGPriceCatalog.status().pending&&m.entryCount===1000&&!!m.catalogGeneration}""")
    check('Interrupted staging leaves previous published catalog readable',"""async()=>{seedRemote(testCatalog(4),10);testConnect();await VGIncrementalSync.initialize('varga-azienda:test-user');await VGPriceCatalog.commit(testCatalog(23001));testStore.failBatchAt=2;const r=await pushCloudNow(true);const m=testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'];return r.ok===false&&m.versions.entries===10&&m.entryCount===4&&VGPriceCatalog.status().pending&&db.entries.length===23001}""")
    check('Concurrent device update is merged without another click',"""async()=>{seedRemote(testCatalog(4),10);testConnect();await VGIncrementalSync.initialize('varga-azienda:test-user');await VGPriceCatalog.commit(testCatalog(6));seedRemote(testCatalog(8),20);const r=await pushCloudNow(true);const m=testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'];return r.ok===true&&db.entries.length===14&&db.priceLists.some(p=>p.name.includes('copia recuperata'))&&m.versions.entries>20}""")
    check('Concurrent manifest change at final publish is rejected',"""async()=>{seedRemote(testCatalog(4),10);testConnect();await VGIncrementalSync.initialize('varga-azienda:test-user');await VGPriceCatalog.commit(testCatalog(6));testStore.commitHook=()=>{testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'].versions.entries=11};const r=await pushCloudNow(true);return r.ok===false&&db.entries.length===6&&testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'].versions.entries===11}""")
    check('Unsynced local edit is retained during incoming cloud merge',"""async()=>{seedRemote(testCatalog(4),10);testConnect();await VGIncrementalSync.initialize('varga-azienda:test-user');await VGPriceCatalog.commit(testCatalog(6));seedRemote(testCatalog(8),20);const r=await VGIncrementalSync.applyManifest(testSnapshot(),'varga-azienda:test-user');return r.conflict===false&&db.entries.length===14&&db.priceLists.some(p=>p.name.includes('copia recuperata'))&&VGPriceCatalog.status().pending}""")
    check('Different local and cloud price lists merge automatically',"""async()=>{const local={priceLists:[{id:'pl-local',name:'Prezzario aziendale'}],entries:[{id:'local-1',priceListId:'pl-local',description:'Voce locale',price:1}]};const remote={priceLists:[{id:'pl-assoverde',name:'Prezzario ASSOVERDE'}],entries:[{id:'asso-1',priceListId:'pl-assoverde',description:'Voce cloud',price:2}]};await VGPriceCatalog.commit(local);seedRemote(remote,20);testConnect();const r=await VGIncrementalSync.initialize('varga-azienda:test-user');return r.conflict===false&&db.priceLists.length===2&&db.entries.length===2&&VGPriceCatalog.status().pending}""")
    check('Divergent same-ID list preserves local recovery copy',"""async()=>{const local=testCatalog(3,'Aziendale locale');const remote=testCatalog(4,'ASSOVERDE cloud');await VGPriceCatalog.commit(local);seedRemote(remote,20);testConnect();const r=await VGIncrementalSync.initialize('varga-azienda:test-user');return r.conflict===false&&db.priceLists.length===2&&db.entries.length===7&&db.priceLists.some(p=>p.name.includes('copia recuperata'))}""")
    check('Same-account remote update is applied after versions change',"""async()=>{seedRemote(testCatalog(4),10);testConnect();await VGIncrementalSync.initialize('varga-azienda:test-user');seedRemote(testCatalog(9),11);await VGIncrementalSync.applyManifest(testSnapshot(),'varga-azienda:test-user');return db.entries.length===9&&!VGPriceCatalog.status().pending}""")
    check('Legacy cloud migration includes price list entries',"""async()=>{testStore.docs['vargaGestionaleWorkspace_varga-azienda']={snapshotJson:JSON.stringify(testCatalog(7))};testConnect();await VGIncrementalSync.initialize('varga-azienda:test-user');const m=testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'];return db.entries.length===7&&m.versions.entries===m.versions.priceLists&&m.entryCount===7}""")
    check('Byte bounded chunks handle long descriptions',"""()=>{const e=testCatalog(20).entries.map(r=>({...r,description:'à'.repeat(18000)}));const chunks=VGIncrementalSync.splitEntries(e);return chunks.length>1&&chunks.every(c=>new TextEncoder().encode(JSON.stringify(c)).length<=400000)}""")
    check('Acknowledgement never marks a later local edit synchronized',"""async()=>{const a=testCatalog(4);await VGPriceCatalog.commit(a);await VGPriceCatalog.commit(testCatalog(7));await VGPriceCatalog.commit(VGPriceCatalog.status().catalog,{source:'ack',uploadedHash:VGPriceCatalog.hash(a),versions:{priceLists:1,entries:1}});return db.entries.length===7&&VGPriceCatalog.status().pending}""")
    check('Workspace switch blocks writes in old archive',"""async()=>{document.getElementById('workspaceId').value='other';let bad=false;try{await VGPriceCatalog.commit(testCatalog(3))}catch(e){bad=true}return bad&&VGPriceCatalog.status().workspaceId==='varga-azienda'}""")
    # Two tabs exercise real IndexedDB revision conflict protection.
    def second_tab(ctx,page):
        other=ctx.new_page();other.goto(URL);other.evaluate('VGPriceCatalog.ready');page.evaluate('VGPriceCatalog.commit(testCatalog(4))')
        assert other.evaluate("async()=>{try{await VGPriceCatalog.commit(testCatalog(8));return false}catch(e){return e.message.includes('altra scheda')||e.message.includes('altra')||e.message.includes('un’altra')}}")
        other.reload();other.evaluate('VGPriceCatalog.ready');assert other.evaluate('db.entries.length===4')
    check('Stale tab cannot replace another tab committed catalog','()=>true',second_tab)
    # Exercise the unchanged spreadsheet parsing boundary with a deterministic XLSX double.
    def ui_test(ctx,page):
        page.evaluate("""()=>{window.XLSX={read:()=>({SheetNames:['Prezziario'],Sheets:{Prezziario:{}}}),utils:{sheet_to_json:()=>[['CODICE','DESCRIZIONE','U.M.','PREZZO UNITARIO'],['A1','Voce di prova','cad','12,50']]}}}""")
        page.set_input_files('#plNewFile',{'name':'Listino-test.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':b'synthetic-parser-input'})
        page.wait_for_selector('#plConfirm');page.click('#plConfirm');page.wait_for_function("document.getElementById('plImport').textContent.includes('conservate sul dispositivo')")
        assert page.evaluate("db.priceLists.some(p=>p.name==='Listino test')&&db.entries.some(e=>e.code==='A1'&&e.price===12.5)")
        assert 'condivise correttamente' not in page.inner_text('#plImport')
        page.reload();page.evaluate('VGPriceCatalog.ready');assert page.evaluate("db.entries.some(e=>e.code==='A1'&&e.price===12.5)")
        page.screenshot(path=str(ROOT/'tests/prezzari-ui.png'),full_page=True)
    check('UI import confirms local commit; no false cloud-success message','()=>true',ui_test)
    browser.close()
server.shutdown()
(ROOT/'tests/results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
passed=sum(r['ok'] for r in results);print(f'{passed}/{len(results)} passed')
raise SystemExit(0 if passed==len(results) else 1)
