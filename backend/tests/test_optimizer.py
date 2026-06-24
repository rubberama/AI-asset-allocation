import unittest
import numpy as np
from app.optimizer import optimize_portfolio

class TestOptimizer(unittest.TestCase):
    def setUp(self):
        self.expected_returns = {
            "KR_STOCK": 0.12,
            "GLOBAL_STOCK": 0.14,
            "KR_BOND": 0.05,
            "GLOBAL_BOND": 0.04,
            "ALTERNATIVE": 0.08
        }
        
        # Positive-definite covariance matrix
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
        self.rf = 0.03
        
    def test_markowitz_mvo(self):
        """
        Markowitz optimization should yield weights that sum to 1.0, and all weights must be >= 0.
        """
        weights = optimize_portfolio(
            strategy="markowitz",
            expected_returns=self.expected_returns,
            covariance_dict=self.covariance,
            risk_free_rate=self.rf
        )
        
        sum_weights = sum(weights.values())
        self.assertAlmostEqual(sum_weights, 1.0, places=4)
        for asset, w in weights.items():
            self.assertGreaterEqual(w, -1e-7, f"{asset} weight is negative: {w}")
            self.assertLessEqual(w, 1.0 + 1e-7, f"{asset} weight exceeds 1.0: {w}")

    def test_risk_parity(self):
        """
        Risk Parity optimization should yield weights that sum to 1.0, and all weights must be >= 0.
        """
        weights = optimize_portfolio(
            strategy="risk_parity",
            expected_returns=self.expected_returns,
            covariance_dict=self.covariance,
            risk_free_rate=self.rf
        )
        
        sum_weights = sum(weights.values())
        self.assertAlmostEqual(sum_weights, 1.0, places=4)
        for asset, w in weights.items():
            self.assertGreaterEqual(w, -1e-7, f"{asset} weight is negative: {w}")
            
    def test_hrp(self):
        """
        HRP optimization should yield weights that sum to 1.0, and all weights must be >= 0.
        """
        weights = optimize_portfolio(
            strategy="hrp",
            expected_returns=self.expected_returns,
            covariance_dict=self.covariance,
            risk_free_rate=self.rf
        )
        
        sum_weights = sum(weights.values())
        self.assertAlmostEqual(sum_weights, 1.0, places=4)
        for asset, w in weights.items():
            self.assertGreaterEqual(w, -1e-7, f"{asset} weight is negative: {w}")
    def test_markowitz_deviation_bounds(self):
        """
        Markowitz MVO with max_deviation constraint should keep weights within bounds.
        """
        benchmark_weights = {
            "KR_STOCK": 0.20,
            "GLOBAL_STOCK": 0.30,
            "KR_BOND": 0.25,
            "GLOBAL_BOND": 0.10,
            "ALTERNATIVE": 0.15
        }
        max_dev = 0.05  # 5% max deviation
        
        weights = optimize_portfolio(
            strategy="markowitz",
            expected_returns=self.expected_returns,
            covariance_dict=self.covariance,
            risk_free_rate=self.rf,
            benchmark_weights=benchmark_weights,
            max_deviation=max_dev
        )
        
        sum_weights = sum(weights.values())
        self.assertAlmostEqual(sum_weights, 1.0, places=4)
        
        for asset, w in weights.items():
            bench_w = benchmark_weights[asset]
            lower_bound = max(0.0, bench_w - max_dev)
            upper_bound = min(1.0, bench_w + max_dev)
            self.assertGreaterEqual(w, lower_bound - 1e-6, f"{asset} weight {w} below lower bound {lower_bound}")
            self.assertLessEqual(w, upper_bound + 1e-6, f"{asset} weight {w} exceeds upper bound {upper_bound}")

    def test_efficient_frontier(self):
        """
        Efficient Frontier calculation should yield a valid list of frontier points.
        """
        from app.optimizer import run_efficient_frontier
        
        benchmark_weights = {
            "KR_STOCK": 0.20,
            "GLOBAL_STOCK": 0.30,
            "KR_BOND": 0.25,
            "GLOBAL_BOND": 0.10,
            "ALTERNATIVE": 0.15
        }
        
        assets = list(self.expected_returns.keys())
        n = len(assets)
        mu = np.array([self.expected_returns[a] for a in assets])
        Sigma = np.zeros((n, n))
        for i, a1 in enumerate(assets):
            for j, a2 in enumerate(assets):
                Sigma[i, j] = self.covariance[a1][a2]
                
        frontier = run_efficient_frontier(
            mu=mu,
            Sigma=Sigma,
            assets=assets,
            benchmark_weights=benchmark_weights,
            max_deviation=0.10,
            rf=self.rf
        )
        
        self.assertGreater(len(frontier), 0)
        for pt in frontier:
            self.assertIn("return", pt)
            self.assertIn("volatility", pt)
            self.assertIn("sharpe", pt)
            self.assertIn("weights", pt)
            
            # Check weight sum
            pt_weights = pt["weights"]
            self.assertAlmostEqual(sum(pt_weights.values()), 1.0, places=4)

if __name__ == "__main__":
    unittest.main()
