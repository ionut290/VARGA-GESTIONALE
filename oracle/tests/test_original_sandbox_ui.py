"""Validate exact-original-markup Oracle sandbox and demo-only write boundaries."""
import importlib.util
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[2]
P=ROOT/"oracle"
spec=importlib.util.spec_from_file_location("varga_preview_build",P/"build_original_ui_preview.py")
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class SandboxUiTests(unittest.TestCase):
    def test_original_html_unchanged_in_sandbox(self):
        raw=(ROOT/"index.html").read_text(encoding="utf-8")
        result=builder.transform(raw,sandbox=True)
        raw_without_js=re.sub(builder.START,"",raw,flags=re.IGNORECASE)
        rendered=result.replace(builder.BASE,"").replace(builder.SANDBOX_SCRIPTS,"")
        self.assertEqual(raw_without_js,rendered)
        self.assertIn('href="style.css?v=',result)
        self.assertIn('src="/oracle/original-sandbox.js"',result)
        self.assertNotIn("firebasejs",result)
        self.assertNotIn('src="app.js',result)

    def test_write_client_limited_to_demo_workspace(self):
        js=(P/"original-sandbox.js").read_text(encoding="utf-8")
        self.assertIn('const ROOT="gestionale_sandbox_20261027";',js)
        self.assertNotIn("gestionale_backup_20261027",js)
        self.assertIn('if(ROOT!=="gestionale_sandbox_20261027"||!model.user)return;',js)
        self.assertIn('await api.saveSection(ROOT,"clients",updated)',js)
        self.assertIn("if(err.status===409)",js)
        self.assertIn('button.disabled=true;',js)
        self.assertIn('id="addClient"',(ROOT/"index.html").read_text(encoding="utf-8"))
        self.assertIn('input.id!=="cName"',js)
        self.assertIn('btn.matches(".nav[data-view], [data-go], #sidebarLogout, #addClient")',js)
        self.assertIn('if(!/^DEMO[ \\-]/i.test(name)',js)
        self.assertIn("before.length>=50",js)

    def test_no_other_storage_or_write_routes(self):
        js=(P/"original-sandbox.js").read_text(encoding="utf-8")
        for forbidden in ("firebase.", "localStorage", "indexedDB", "sessionStorage",
                          "eval(", "innerHTML=", 'fetch(', "window.location.reload",
                          'api.saveSection(ROOT,"jobs"', 'api.saveSection(ROOT,"quotes"',
                          "api.save(", "migrationReview"):
            self.assertNotIn(forbidden,js)
        self.assertEqual(js.count("api.saveSection("),1)
        self.assertEqual(js.count("saveSection(ROOT"),1)
        self.assertNotIn('event.target.matches("form")',js)

    def test_original_readonly_bridge_still_readonly(self):
        js=(P/"original-preview.js").read_text(encoding="utf-8")
        self.assertIn('const ROOT="gestionale_backup_20261027";',js)
        self.assertNotIn("saveSection(",js)
        self.assertNotIn("original-sandbox",js)

if __name__=="__main__":
    unittest.main()
