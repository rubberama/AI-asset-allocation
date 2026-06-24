import unittest
import numpy as np
from app.black_litterman import run_black_litterman

class TestBlackLitterman(unittest.TestCase):
    def setUp(self):
        # 3 assets for simple testing
        self.market_weights = {
            "KR_STOCK": 0.5,
            "GLOBAL_STOCK": 0.3,
            "KR_BOND": 0.2
        }
        
        # Simple positive definite covariance matrix
        self.covariance = {
            "KR_STOCK": {"KR_STOCK": 0.04, "GLOBAL_STOCK": 0.02, "KR_BOND": -0.005},
            "GLOBAL_STOCK": {"KR_STOCK": 0.02, "GLOBAL_STOCK": 0.09, "KR_BOND": -0.01},
            "KR_BOND": {"KR_STOCK": -0.005, "GLOBAL_STOCK": -0.01, "KR_BOND": 0.01}
        }
        
        self.rf = 0.03
        self.risk_aversion = 2.5
        
    def test_no_views(self):
        """
        If there are no views, posterior expected returns should equal market implied excess returns + risk-free rate.
        """
        prior_returns, post_returns, post_cov = run_black_litterman(
            market_weights=self.market_weights,
            covariance_dict=self.covariance,
            views=[],
            risk_free_rate=self.rf,
            risk_aversion=self.risk_aversion
        )
        
        # Calculate manually
        Sigma = np.array([
            [0.04, 0.02, -0.005],
            [0.02, 0.09, -0.01],
            [-0.005, -0.01, 0.01]
        ])
        w = np.array([0.5, 0.3, 0.2])
        Pi = self.risk_aversion * np.dot(Sigma, w)
        expected_returns = Pi + self.rf
        
        self.assertAlmostEqual(post_returns["KR_STOCK"], expected_returns[0], places=5)
        self.assertAlmostEqual(post_returns["GLOBAL_STOCK"], expected_returns[1], places=5)
        self.assertAlmostEqual(post_returns["KR_BOND"], expected_returns[2], places=5)

    def test_strong_absolute_view(self):
        """
        An absolute view with 99.9% confidence should pull the posterior return very close to the view.
        """
        # User thinks KR_STOCK will return 15% (0.15) with 99.9% confidence
        views = [{
            "view_type": "absolute",
            "asset": "KR_STOCK",
            "expected_return": 0.15,
            "confidence": 0.999
        }]
        
        prior_returns, post_returns, post_cov = run_black_litterman(
            market_weights=self.market_weights,
            covariance_dict=self.covariance,
            views=views,
            risk_free_rate=self.rf,
            risk_aversion=self.risk_aversion,
            tau=0.01  # Smaller tau makes view transition sharper
        )
        
        # The return of KR_STOCK should be pulled very close to 15% (0.15)
        self.assertAlmostEqual(post_returns["KR_STOCK"], 0.15, places=2)

if __name__ == "__main__":
    unittest.main()
