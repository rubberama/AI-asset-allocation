import unittest
from app.stress_test import run_monte_carlo_simulation

class TestStressTest(unittest.TestCase):
    def setUp(self):
        self.weights = {
            "KR_STOCK": 0.2,
            "GLOBAL_STOCK": 0.4,
            "KR_BOND": 0.2,
            "GLOBAL_BOND": 0.1,
            "ALTERNATIVE": 0.1
        }
        
        self.expected_returns = {
            "KR_STOCK": 0.08,
            "GLOBAL_STOCK": 0.10,
            "KR_BOND": 0.04,
            "GLOBAL_BOND": 0.035,
            "ALTERNATIVE": 0.06
        }
        
        self.covariance = {
            "KR_STOCK": {
                "KR_STOCK": 0.04, "GLOBAL_STOCK": 0.02, "KR_BOND": 0.0, "GLOBAL_BOND": 0.0, "ALTERNATIVE": 0.01
            },
            "GLOBAL_STOCK": {
                "KR_STOCK": 0.02, "GLOBAL_STOCK": 0.06, "KR_BOND": 0.0, "GLOBAL_BOND": 0.0, "ALTERNATIVE": 0.015
            },
            "KR_BOND": {
                "KR_STOCK": 0.0, "GLOBAL_STOCK": 0.0, "KR_BOND": 0.002, "GLOBAL_BOND": 0.001, "ALTERNATIVE": 0.0
            },
            "GLOBAL_BOND": {
                "KR_STOCK": 0.0, "GLOBAL_STOCK": 0.0, "KR_BOND": 0.001, "GLOBAL_BOND": 0.0015, "ALTERNATIVE": 0.0
            },
            "ALTERNATIVE": {
                "KR_STOCK": 0.01, "GLOBAL_STOCK": 0.015, "KR_BOND": 0.0, "GLOBAL_BOND": 0.0, "ALTERNATIVE": 0.03
            }
        }
        
    def test_simulation_metrics(self):
        """
        Monte Carlo simulation should return expected keys and plausible risk metrics.
        """
        results = run_monte_carlo_simulation(
            weights=self.weights,
            expected_returns=self.expected_returns,
            covariance_dict=self.covariance,
            n_simulations=1000,  # 1000 is enough for unit test speed
            n_days=252
        )
        
        # Check keys
        required_keys = {
            "expected_return", "volatility", "var_95", "cvar_95", 
            "max_drawdown_estimate", "simulation_paths", "histogram_data"
        }
        self.assertTrue(required_keys.issubset(results.keys()))
        
        # Check that VaR is less than expected return and usually negative (or small positive)
        self.assertLess(results["var_95"], results["expected_return"])
        
        # CVaR should be worse than or equal to VaR
        self.assertLessEqual(results["cvar_95"], results["var_95"])
        
        # Max drawdown estimate should be negative
        self.assertLess(results["max_drawdown_estimate"], 0.0)
        
        # Simulation paths should be exactly 100 paths
        self.assertEqual(len(results["simulation_paths"]), 100)
        
        # Each path should have 253 elements (1.0 + 252 steps, but returns relative to start so S_t - 1.0, length 253)
        self.assertEqual(len(results["simulation_paths"][0]), 253)
        
        # Histogram data should have 50 elements
        self.assertEqual(len(results["histogram_data"]), 50)
        
if __name__ == "__main__":
    unittest.main()
