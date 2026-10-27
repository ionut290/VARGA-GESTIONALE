"""Tests for a safe isolated Oracle API route inserted into a static Gestionale Nginx site."""
import importlib.util
from pathlib import Path
import unittest

src=Path(__file__).resolve().parents[1]/"patch_nginx_oracle.py"
spec=importlib.util.spec_from_file_location("patch_nginx_oracle",src)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class NginxPatchTests(unittest.TestCase):
    original="""server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
"""
    def test_specific_oracle_location_and_home_preserved(self):
        result=module.patch(self.original)
        self.assertIn("location ^~ /api/gestionale/v1/",result)
        self.assertIn("proxy_pass http://vg-gestionale-oracle-api-1:8098;",result)
        self.assertIn("try_files $uri $uri/ /index.html;",result)
        self.assertEqual(result.count("server {"),1)
        self.assertEqual(result.count("proxy_pass"),1)
        self.assertEqual(result.count(module.API_MARKER),1)

    def test_no_double_patching(self):
        with self.assertRaises(ValueError):
            module.patch(module.patch(self.original))

    def test_existing_other_proxy_refused(self):
        other=self.original.replace("    location / {","    location /old { proxy_pass http://somewhere; }\n    location / {")
        # A proxy on one line should also prevent silent transformation.
        # The caller must inspect unexpected topology rather than overwrite it.
        with self.assertRaises(ValueError):
            module.patch(other)

    def test_unknown_no_static_root_refused(self):
        with self.assertRaises(ValueError):
            module.patch(self.original.replace("/usr/share/nginx/html","/private/misc"))

    def test_multiple_server_blocks_refused(self):
        with self.assertRaises(ValueError):
            module.patch(self.original+"\n"+self.original)

if __name__=="__main__":
    unittest.main()
