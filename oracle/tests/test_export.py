import unittest
from export_firestore import load_workspace
class Snapshot:
    def __init__(self,data):self.data=data;self.exists=data is not None
    def to_dict(self):return self.data
class Ref:
    def __init__(self,files,key):self.files=files;self.key=key
    def get(self):return Snapshot(self.files.get(self.key))
class Collection:
    def __init__(self,files):self.files=files
    def document(self,key):return Ref(self.files,key)
class Client:
    def __init__(self,files):self.files=files
    def collection(self,name):
        assert name=="appConfig"
        return Collection(self.files)
class ExportTests(unittest.TestCase):
    def test_legacy(self):
        files={"vargaGestionaleWorkspace_varga-azienda":{"snapshotJson":'{"clients":[{"id":"a"}]}'}}
        data,mode=load_workspace(Client(files),"varga-azienda")
        self.assertEqual(mode,"legacy")
        self.assertEqual(data["clients"][0]["id"],"a")
    def test_incremental(self):
        pre="vargaGestionaleWorkspace_varga-azienda"
        files={
          pre+"_manifest":{"mode":"incremental-v3","versions":{"clients":2,"priceLists":4,"entries":4},
                            "catalogGeneration":"g4abc","entryChunkCount":1,"entryCount":1},
          pre+"_section_clients":{"version":2,"dataJson":'[{"id":"u"}]'},
          pre+"_catalog_g4abc_lists":{"version":4,"dataJson":'[{"id":"list"}]'},
          pre+"_entries_g4abc_0000":{"version":4,"dataJson":'[{"id":"item","priceListId":"list"}]'}
        }
        data,mode=load_workspace(Client(files),"varga-azienda")
        self.assertEqual(mode,"incremental-v3")
        self.assertEqual(len(data["entries"]),1)
    def test_missing_chunk_is_error(self):
        pre="vargaGestionaleWorkspace_varga-azienda"
        files={pre+"_manifest":{"mode":"incremental-v3","versions":{"priceLists":4,"entries":4},
                                "catalogGeneration":"x","entryChunkCount":1,"entryCount":1},
               pre+"_catalog_x_lists":{"version":4,"dataJson":"[]"}}
        with self.assertRaises(ValueError):load_workspace(Client(files),"varga-azienda")
if __name__=="__main__":unittest.main()
