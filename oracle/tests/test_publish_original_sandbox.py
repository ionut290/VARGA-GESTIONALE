"""Prevent reintroducing obsolete direct API-save checks in Oracle demo deploy."""
from pathlib import Path
import importlib.util
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("oracle_sandbox_publisher",ROOT/"publish_original_sandbox.py")
publisher=importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

class SandboxPublisherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js=(ROOT/"original-sandbox.js").read_bytes()
        cls.bridge=(ROOT/"section-bridge.js").read_bytes()
        cls.html=publisher.pub.load_builder().transform(
            (ROOT.parent/"index.html").read_text(encoding="utf-8"),sandbox=True
        ).encode("utf-8")

    def test_current_source_can_be_published(self):
        publisher.validate_assets(self.js,self.bridge,self.html)

    def test_rejects_stale_demo_section_manifest(self):
        expected=b'keys:["clients","jobs","quotes","consuntivi","invoices","priceLists","entries"]'
        self.assertIn(expected,self.js)
        stale=self.js.replace(expected,b'keys:["clients","jobs","quotes"]')
        with self.assertRaisesRegex(ValueError,"Adapter"):
            publisher.validate_assets(stale,self.bridge,self.html)

    def test_rejects_direct_api_save(self):
        with self.assertRaisesRegex(ValueError,"diretti"):
            publisher.validate_assets(
                self.js+b'\\napi.saveSection(',self.bridge,self.html)

    def test_rejects_real_data_target(self):
        with self.assertRaises(ValueError):
            publisher.validate_assets(
                self.js.replace(b'gestionale_sandbox_20261027',
                                b'gestionale_backup_20261027'),
                self.bridge,self.html)

    def test_rejects_incomplete_bridge(self):
        with self.assertRaisesRegex(ValueError,"Protezione"):
            publisher.validate_assets(
                self.js,
                self.bridge.replace(b'if(writable && this.workspace!==SANDBOX)',
                                    b'if(false)'),
                self.html)

    def test_rejects_missing_bridge_loader(self):
        with self.assertRaisesRegex(ValueError,"loader"):
            publisher.validate_assets(
                self.js,self.bridge,
                self.html.replace(b'/oracle/section-bridge.js',
                                  b'/oracle/missing-bridge.js'))

    def test_rejects_stale_direct_save_implementation(self):
        old=self.js.replace(b'await bridge.commit(key)',
                            b'await api.saveSection(ROOT,"clients",updated)')
        with self.assertRaises(ValueError):
            publisher.validate_assets(old,self.bridge,self.html)

    def test_never_overwrites_production_web_assets(self):
        source=(ROOT/"publish_original_sandbox.py").read_text(encoding="utf-8")
        self.assertIn('("section-bridge.js",bridge)',source)
        self.assertIn('(NAME+".js",js)',source)
        self.assertIn('(NAME+".html",html)',source)
        self.assertNotIn("docker compose up",source)
        self.assertNotIn("style.css",source.replace("original CSS","").replace("CSS.",""))

if __name__=="__main__":
    unittest.main()
