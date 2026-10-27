"""Smoke tests without access to business data or Oracle."""
import unittest
from fastapi.testclient import TestClient
from backend.main import app, PH, WORKSPACE_PATTERN

class BasicTests(unittest.TestCase):
    def test_health(self):
        response=TestClient(app).get("/api/gestionale/v1/health")
        self.assertIn(response.status_code,(200,503))
        self.assertEqual(response.json()["service"],"varga-gestionale")
    def test_anonymous_read_denied(self):
        response=TestClient(app).get("/api/gestionale/v1/workspaces/varga-azienda")
        self.assertEqual(response.status_code,401)
    def test_anonymous_write_denied(self):
        response=TestClient(app).put("/api/gestionale/v1/workspaces/varga-azienda",
            json={"expected_revision":0,"data":{"clients":[]}})
        self.assertEqual(response.status_code,401)
    def test_workspace_name_sanitized(self):
        self.assertIsNotNone(WORKSPACE_PATTERN.fullmatch("varga-azienda"))
        self.assertIsNone(WORKSPACE_PATTERN.fullmatch("../other"))
    def test_argon_password_hash(self):
        self.assertTrue(PH.verify(PH.hash("Example-test-only-long-password"),"Example-test-only-long-password"))

if __name__=="__main__":unittest.main()
