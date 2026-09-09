"""Run the original 26 scenarios plus regressions for the actual retry button.
Synthetic fixtures, real Chromium/IndexedDB; production Firestore is not accessed.
"""
from pathlib import Path
original = Path(__file__).with_name('test_catalog_browser.py').read_text()
marker = '    # Two tabs exercise'
assert original.count(marker) == 1, 'Base test suite changed; review integration.'
extra = r'''
    check('Retry publishes only prices when an unrelated cloud section is broken',"""async()=>{seedRemote(testCatalog(4),10);const m=testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'];m.versions.jobs=10;testConnect();const c=JSON.parse(JSON.stringify(VGPriceCatalog.status().catalog));c.priceLists.push({id:'new-one',name:'Importato nuovo'});c.entries.push({id:'new-entry',priceListId:'new-one',price:9});await VGPriceCatalog.commit(c);const before=JSON.stringify(testStore.docs);const result=await retryPriceCatalog();const after=testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'];return result.ok===true&&!VGPriceCatalog.status().pending&&after.versions.jobs===10&&!testStore.docs['vargaGestionaleWorkspace_varga-azienda_section_jobs']&&after.entryCount===10&&db.priceLists.some(p=>p.id==='pl-test')}""")
    check('Retry adds new catalogs across stale baseline without removing remote lists',"""async()=>{seedRemote(testCatalog(4),10);testConnect();await VGIncrementalSync.initialize('varga-azienda:test-user');const c=JSON.parse(JSON.stringify(VGPriceCatalog.status().catalog));c.priceLists.push({id:'new-local',name:'Locale'});c.entries.push({id:'x-local',priceListId:'new-local',price:5});await VGPriceCatalog.commit(c);const remote=testCatalog(4);remote.priceLists.push({id:'new-remote',name:'Altro PC'});remote.entries.push({id:'x-remote',priceListId:'new-remote',price:8});seedRemote(remote,20);const result=await retryPriceCatalog();return result.ok&&db.priceLists.length===3&&db.entries.length===6&&!VGPriceCatalog.status().pending}""")
    check('Retry preserves overlapping price changes as a recovery copy',"""async()=>{seedRemote(testCatalog(4),10);testConnect();await VGIncrementalSync.initialize('varga-azienda:test-user');const c=testCatalog(4);c.entries[0].price=999;await VGPriceCatalog.commit(c);const remote=testCatalog(4);remote.entries[0].price=888;seedRemote(remote,20);const result=await retryPriceCatalog();const version=testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'].versions.entries;return result.ok&&db.priceLists.length===2&&db.entries.length===8&&db.entries.some(e=>e.price===888)&&db.entries.some(e=>e.price===999)&&db.priceLists.some(p=>p.name.includes('copia recuperata'))&&version>20}""")
    check('Retry explains incomplete legacy manifest without publishing over it',"""async()=>{await VGPriceCatalog.commit(testCatalog(4));seedRemote(testCatalog(9),10);delete testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'].versions.entries;testConnect();const before=JSON.stringify(testStore.docs);const r=await retryPriceCatalog();return !r.ok&&r.code==='PREZZIARI_CLOUD_INCOMPLETO'&&JSON.stringify(testStore.docs)===before&&db.entries.length===4}""")
    check('Retry acknowledges matching cloud catalog without staging a duplicate',"""async()=>{await VGPriceCatalog.commit(testCatalog(4));seedRemote(testCatalog(4),10);testConnect();const r=await retryPriceCatalog();return r.ok&&!VGPriceCatalog.status().pending&&testStore.batches===0}""")
    check('Retry preserves subsequent local edits made during upload',"""async()=>{await VGPriceCatalog.commit(testCatalog(4));testConnect();testStore.commitHook=async()=>{await VGPriceCatalog.commit(testCatalog(7))};const r=await retryPriceCatalog();return r.ok&&r.pending===true&&db.entries.length===7&&VGPriceCatalog.status().pending&&testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'].entryCount===4}""")
    check('Retry fails safely when another device publishes during staging',"""async()=>{await VGPriceCatalog.commit(testCatalog(4));testConnect();testStore.commitHook=()=>seedRemote(testCatalog(8),20);const r=await retryPriceCatalog();return !r.ok&&r.code==='PREZZIARI_AGGIORNATI_ALTROVE'&&db.entries.length===4&&testStore.docs['vargaGestionaleWorkspace_varga-azienda_manifest'].entryCount===8}""")
    check('Retry surfaces missing login as a visible result',"""async()=>{const r=await retryPriceCatalog();return !r.ok&&r.code==='PREZZIARI_ACCESSO'&&VGPriceSaveStatus.error&&VGPriceSaveStatus.message.includes('Accedi')}""")
    check('Retry surfaces server permission failure without changing rules or data',"""async()=>{await VGPriceCatalog.commit(testCatalog(4));testConnect();testStore.readHook=async()=>{throw Object.assign(Error('Denied'),{code:'permission-denied'})};const r=await retryPriceCatalog();return !r.ok&&r.code==='permission-denied'&&VGPriceSaveStatus.message.includes('non autorizza')&&db.entries.length===4&&Object.keys(testStore.docs).length===0}""")
    check('Retry survives a failed network attempt and succeeds on the next attempt',"""async()=>{await VGPriceCatalog.commit(testCatalog(4));testConnect();testStore.failReads=true;const first=await retryPriceCatalog();testStore.failReads=false;const second=await retryPriceCatalog();return !first.ok&&second.ok&&!VGPriceCatalog.status().pending}""")
    check('Revision guard never overwrites newer local edits and remains retryable',"""async()=>{const before=VGPriceCatalog.status();await VGPriceCatalog.commit(testCatalog(4));let failed=false;try{await VGPriceCatalog.commit(testCatalog(2),{expectedRevision:before.revision})}catch(e){failed=e.code==='PREZZIARI_REVISIONE'}const latest=await VGPriceCatalog.flush();testConnect();const result=await retryPriceCatalog();return failed&&latest.catalog.entries.length===4&&result.ok&&!VGPriceCatalog.status().pending}""")
    # Click the actual UI button, not just its backend function.
    def retry_ui(ctx,page):
        page.evaluate("async()=>{await VGPriceCatalog.commit(testCatalog(4));testConnect();window.testRelease=null;testStore.readHook=()=>new Promise(r=>{window.testRelease=r})}")
        page.click('#plRetryCloud')
        page.wait_for_function("document.getElementById('plRetryCloud').textContent.includes('IN CORSO')")
        assert page.is_disabled('#plRetryCloud')
        assert 'condivisione' in page.inner_text('#plSaveStatus').lower() or 'prezziari' in page.inner_text('#plSaveStatus').lower()
        page.evaluate("()=>{testStore.readHook=null;window.testRelease()}")
        page.wait_for_function("!document.getElementById('plRetryCloud').disabled")
        assert 'completata' in page.inner_text('#plSaveStatus')
        assert page.evaluate('!VGPriceCatalog.status().pending')
    check('Actual retry button shows busy state then successful completion','()=>true',retry_ui)
    def retry_error_ui(ctx,page):
        page.evaluate("async()=>{await VGPriceCatalog.commit(testCatalog(4));testConnect();testStore.failReads=true}")
        page.click('#plRetryCloud');page.wait_for_function("document.getElementById('plSaveStatus').dataset.error==='true'")
        page.wait_for_function("!document.getElementById('plRetryCloud').disabled")
        assert 'conservata' in page.inner_text('#plSaveStatus').lower()
        page.evaluate('testStore.failReads=false');page.click('#plRetryCloud')
        page.wait_for_function("document.getElementById('plSaveStatus').textContent.includes('Condivisione completata')")
        page.wait_for_function("!document.getElementById('plRetryCloud').disabled")
    check('Actual retry button recovers after a network failure','()=>true',retry_error_ui)
'''
exec(compile(original.replace(marker, extra + marker), __file__, "exec"), globals())
