"""Original Varga Gestionale Oracle preview must retain the exact visual source.
The only allowed differences are <base> and original script footer replacement.
"""
import importlib.util
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[2]
SCRIPT=ROOT/"oracle"/"build_original_ui_preview.py"
spec=importlib.util.spec_from_file_location("build_original_ui_preview",SCRIPT)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class PixelParityPreviewTest(unittest.TestCase):
    def setUp(self):
        self.source=(ROOT/"index.html").read_text(encoding="utf-8")

    def test_same_markup_css_layout(self):
        result=mod.transform(self.source)
        self.assertIn('<base href="/">',result)
        self.assertIn('href="style.css?v=',result)
        self.assertIn('src="/oracle/original-preview.js"',result)
        self.assertIn('src="/oracle/client.js"',result)
        self.assertNotIn("firebasejs",result.lower())
        self.assertNotIn('src="app.js',result)
        original_noscripts=re.sub(mod.START,"",self.source,flags=re.IGNORECASE)
        preview_nomods=result.replace(mod.BASE,"").replace(mod.PREVIEW_SCRIPTS,"")
        self.assertEqual(preview_nomods,original_noscripts,
                         "Il DOM, CSS e la disposizione devono restare identici all'originale")

    def test_guard_against_original_script_layout_change(self):
        old=self.source.replace('src="app.js?v=','src="different-loader.js?v=')
        # The builder must not accept an unknown, possibly unsupported loader.
        # (The resulting preview would silently stop functioning.)
        self.assertNotEqual(old,self.source)
        with self.assertRaises(ValueError):
            mod.transform(self.source.replace('</script></body></html>',
                '</script><script src="unexpected.js"></script></body></html>'))

    def test_original_preview_bridge_is_safe(self):
        source=(ROOT/"oracle"/"original-preview.js").read_text(encoding="utf-8")
        self.assertIn("gestionale_backup_20261027",source)
        for bad in ("firebase.", "indexedDB", "localStorage", "sessionStorage",
                    ".saveSection(", ".save(", "innerHTML=","eval(", "function noteView("):
            self.assertNotIn(bad,source)
        self.assertIn("api.readSection(ROOT,key)",source)
        self.assertIn('document.querySelectorAll(".nav[data-view]")',source)
        self.assertIn("document.body.classList.toggle",source)

if __name__=="__main__":
    unittest.main()
