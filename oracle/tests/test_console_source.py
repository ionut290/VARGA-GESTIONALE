"""Static safety guards for the Oracle-only staging UI, no application secrets."""
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class Elements(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=set();self.scripts=[]
    def handle_starttag(self,tag,attrs):
        props=dict(attrs)
        if "id" in props:self.ids.add(props["id"])
        if tag=="script":self.scripts.append(props.get("src",""))

class TestOracleConsole(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=(ROOT/"console.html").read_text(encoding="utf-8")
        cls.js=(ROOT/"console.js").read_text(encoding="utf-8")

    def test_expected_dependency_and_dom_ids(self):
        parser=Elements();parser.feed(self.html)
        self.assertEqual(parser.scripts,["client.js","console.js"])
        for target in ("nav","login-panel","login-form","login-submit","email",
            "password","workspace","stats","load","records","table-area",
            "search","search-button","clear-button","previous","next","page-index",
            "feedback","session","logout","section-name","section-info","module-overview"):
            self.assertIn(target,parser.ids)

    def test_no_firebase_or_write_actions(self):
        self.assertNotIn("firebase.",self.js.lower())
        for forbidden in (".saveSection(",'.save(', "localStorage", "sessionStorage",
                          "innerHTML", "eval("):
            self.assertNotIn(forbidden,self.js)
        self.assertIn("WORKSPACE=\"gestionale_backup_20261027\"",self.js)
        self.assertIn("migrationReview",self.js)
        self.assertIn("client.readSection(",self.js)
        self.assertIn('const SECRET=',self.js)

    def test_csp_and_login(self):
        self.assertIn("Content-Security-Policy",self.html)
        self.assertIn("script-src 'self'",self.html)
        self.assertIn('autocomplete="current-password"',self.html)
        self.assertIn("Sola lettura",self.html)

if __name__=="__main__":
    unittest.main()
