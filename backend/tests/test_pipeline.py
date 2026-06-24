"""Unit tests for the macro research → allocation pipeline (M1–M4)."""
import unittest
import numpy as np

from app.research import score_relevance, recency_weight, dedup_documents, rank_queue
from app.thesis_engine import calibrate_confidence, theses_to_views
from app.black_litterman import run_black_litterman
from app.optimizer import run_resampled_weights
from app.backtest import compute_ic, hit_rate
from app.sources.normalize import make_document, NEWS


class TestResearchScoring(unittest.TestCase):
    def test_relevance_tags_bonds_for_rate_news(self):
        doc = make_document("FT", NEWS, "Fed signals rate cut as inflation cools",
                            "Treasury yields fall on Fed rate cut expectations.")
        rel = score_relevance(doc)
        self.assertGreater(rel["GLOBAL_BOND"], 0.0)
        self.assertGreaterEqual(rel["GLOBAL_BOND"], rel["ALTERNATIVE"])

    def test_recency_decay_monotonic(self):
        from datetime import datetime, timezone, timedelta
        today = datetime.now(timezone.utc).isoformat()
        old = (datetime.now(timezone.utc) - timedelta(days=20)).isoformat()
        self.assertGreater(recency_weight(today), recency_weight(old))

    def test_dedup_groups_near_duplicates(self):
        docs = [
            make_document("a.com", NEWS, "Fed cuts rates sharply", "The Fed cut interest rates today."),
            make_document("b.com", NEWS, "Fed cuts rates sharply today", "The Fed cut interest rates today."),
            make_document("c.com", NEWS, "Oil prices surge on supply shock", "Crude oil jumped on OPEC cuts."),
        ]
        dedup_documents(docs)
        self.assertEqual(docs[0]["dedup_cluster"], docs[1]["dedup_cluster"])
        self.assertNotEqual(docs[0]["dedup_cluster"], docs[2]["dedup_cluster"])

    def test_rank_queue_sorts_and_collapses(self):
        docs = [
            make_document("a.com", NEWS, "Fed cuts rates", "Fed cut interest rates, treasury yields fall."),
            make_document("b.com", NEWS, "Fed cuts rates", "Fed cut interest rates, treasury yields fall."),
        ]
        for d in docs:
            d["composite_score"] = 0.5
            d["relevance"] = {"GLOBAL_BOND": 0.6}
        dedup_documents(docs)
        ranked = rank_queue(docs, collapse_duplicates=True)
        self.assertEqual(len(ranked), 1)  # duplicates collapsed


class TestThesisCalibration(unittest.TestCase):
    def test_corroboration_and_credibility_raise_confidence(self):
        weak = calibrate_confidence(0.9, 1, 0.55)
        strong = calibrate_confidence(0.9, 3, 0.9)
        self.assertLess(weak, strong)
        self.assertLessEqual(strong, 0.99)

    def test_theses_to_views_signs_and_types(self):
        theses = [
            {"view_type": "absolute", "asset": "GLOBAL_BOND", "direction": "bullish", "magnitude": 0.05, "confidence": 0.6},
            {"view_type": "absolute", "asset": "KR_STOCK", "direction": "bearish", "magnitude": 0.04, "confidence": 0.5},
            {"view_type": "relative", "asset1": "GLOBAL_STOCK", "asset2": "KR_STOCK", "magnitude": 0.03, "confidence": 0.55},
        ]
        views = theses_to_views(theses)
        self.assertEqual(views[0]["expected_return"], 0.05)
        self.assertEqual(views[1]["expected_return"], -0.04)
        self.assertEqual(views[2]["view_type"], "relative")


class TestIdzorekOmega(unittest.TestCase):
    def setUp(self):
        self.mw = {"KR_STOCK": 0.5, "GLOBAL_STOCK": 0.3, "KR_BOND": 0.2}
        self.cov = {
            "KR_STOCK": {"KR_STOCK": 0.04, "GLOBAL_STOCK": 0.02, "KR_BOND": -0.005},
            "GLOBAL_STOCK": {"KR_STOCK": 0.02, "GLOBAL_STOCK": 0.09, "KR_BOND": -0.01},
            "KR_BOND": {"KR_STOCK": -0.005, "GLOBAL_STOCK": -0.01, "KR_BOND": 0.01},
        }

    def _post(self, conf):
        _, post, _ = run_black_litterman(
            self.mw, self.cov,
            [{"view_type": "absolute", "asset": "KR_STOCK", "expected_return": 0.15, "confidence": conf}],
            0.03, 2.5, 0.05, omega_method="idzorek")
        return post["KR_STOCK"]

    def test_higher_confidence_pulls_closer_to_view(self):
        low, high = self._post(0.2), self._post(0.8)
        self.assertLess(abs(high - 0.15), abs(low - 0.15))


class TestOptimizerRobustness(unittest.TestCase):
    def test_resampled_weights_sum_to_one(self):
        mu = np.array([0.10, 0.12, 0.05])
        Sig = np.array([[0.04, 0.02, -0.005], [0.02, 0.09, -0.01], [-0.005, -0.01, 0.01]])
        w = run_resampled_weights(mu, Sig, 0.03, ["KR_STOCK", "GLOBAL_STOCK", "KR_BOND"],
                                  {"KR_STOCK": 0.5, "GLOBAL_STOCK": 0.3, "KR_BOND": 0.2}, 0.10, n_resamples=10)
        self.assertAlmostEqual(float(w.sum()), 1.0, places=5)
        self.assertTrue(np.all(w >= -1e-9))


class TestBacktestMath(unittest.TestCase):
    def test_ic_and_hitrate(self):
        pred = [0.05, -0.03, 0.04, -0.02]
        real = [0.06, -0.01, -0.02, -0.05]
        self.assertEqual(hit_rate(pred, real), 0.75)
        self.assertIsNotNone(compute_ic(pred, real))


if __name__ == "__main__":
    unittest.main()
