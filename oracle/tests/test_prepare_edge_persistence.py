"""Regression tests for Compose-only Oracle edge persistence preparation.
No Docker, secret access, file writes or container restarts in tests.
"""
import importlib.util
from pathlib import Path
import unittest

src=Path(__file__).resolve().parents[1]/"prepare_edge_persistence.py"
spec=importlib.util.spec_from_file_location("prepare_edge_persistence",src)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PersistenceComposeTests(unittest.TestCase):
    inline="""services:
  varga-gestionale-web:
    build: .
    ports: ["127.0.0.1:18086:80"]
    networks: [public_proxy]
    restart: unless-stopped
  worker:
    image: nginx:alpine
    networks: [public_proxy]
networks:
  public_proxy:
    external: true
    name: varga_proxy
"""
    multiline="""services:
  varga-gestionale-web:
    build:
      context: .
    networks:
      - public_proxy
    ports:
      - "127.0.0.1:18086:80"
networks:
  public_proxy:
    external: true
    name: varga_proxy
"""

    def test_inline_network_single_web_only(self):
        after=module.patch_compose(self.inline)
        self.assertIn("networks: [public_proxy, gestionale_edge]",after)
        self.assertEqual(after.count("vg-gestionale-edge"),1)
        self.assertIn("/usr/share/nginx/html/oracle",after)
        self.assertIn("/etc/nginx/conf.d/default.conf",after)
        self.assertIn("  worker:\n    image: nginx:alpine\n    networks: [public_proxy]",after)
        self.assertIn("  gestionale_edge:\n    external: true",after)

    def test_multiline_network(self):
        after=module.patch_compose(self.multiline)
        self.assertIn("      - public_proxy\n      - gestionale_edge\n",after)
        self.assertIn("    volumes:\n",after)

    def test_no_double_application(self):
        with self.assertRaises(ValueError):
            module.patch_compose(module.patch_compose(self.inline))

    def test_missing_web_service_abort(self):
        with self.assertRaises(ValueError):
            module.patch_compose(self.inline.replace("varga-gestionale-web:","unrelated:"))

    def test_existing_web_mount_abort(self):
        prev=self.inline.replace("    restart: unless-stopped",
            "    volumes:\n      - ./stuff:/tmp\n    restart: unless-stopped")
        with self.assertRaises(ValueError):
            module.patch_compose(prev)

    def test_validate_exact_deltas(self):
        before={"name":"project",
                "services":{"varga-gestionale-web":{"image":"some-web",
                  "networks":{"public_proxy":None},"ports":[{"published":"18086"}]},
                  "worker":{"image":"some-worker"}},
                "networks":{"public_proxy":{"name":"varga_proxy","external":True}}}
        new=__import__("copy").deepcopy(before)
        new["services"]["varga-gestionale-web"]["networks"]["gestionale_edge"]=None
        new["services"]["varga-gestionale-web"]["volumes"]=[
          {"type":"bind","source":str(module.ASSETS/"nginx.conf"),
            "target":module.CONF_TARGET,"read_only":True},
          {"type":"bind","source":str(module.ASSETS/"oracle"),
            "target":module.ORACLE_TARGET,"read_only":True}]
        new["networks"]["gestionale_edge"]={"name":module.EDGE,"external":True}
        module.validate_diff(before,new)
        new["services"]["worker"]["image"]="changed"
        with self.assertRaises(ValueError):
            module.validate_diff(before,new)

if __name__=="__main__":
    unittest.main()
