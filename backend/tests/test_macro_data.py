import unittest
from fastapi.testclient import TestClient
from app.main import app

class TestMacroDataEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_get_macro_data_returns_history_and_indicators(self):
        response = self.client.get("/macro-data")
        self.assertEqual(response.status_code, 200)
        json_data = response.json()
        self.assertIn("data", json_data)
        data = json_data["data"]
        self.assertIn("SPY", data)
        self.assertIn("history", data["SPY"])
        # With 1-year history, we expect around ~250 trading days, so check if > 150
        self.assertGreater(len(data["SPY"]["history"]), 150)

    def test_get_macro_data_force_refresh(self):
        response = self.client.get("/macro-data?refresh=true")
        self.assertEqual(response.status_code, 200)
        json_data = response.json()
        self.assertIn("data", json_data)
        self.assertIn("SPY", json_data["data"])

    def test_correlation_matrix(self):
        response = self.client.get("/macro-data")
        json_data = response.json()
        self.assertIn("correlation_matrix", json_data["data"])
        matrix = json_data["data"]["correlation_matrix"]
        self.assertIn("SPY", matrix)
        self.assertIn("VIX", matrix["SPY"])
        # SPY and VIX should be negatively correlated
        self.assertLess(matrix["SPY"]["VIX"], 0)
