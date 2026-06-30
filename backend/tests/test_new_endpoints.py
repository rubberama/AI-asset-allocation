import unittest
import os
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app, get_db
from app.db import Base, MarketIntelligence, Thesis, Document
from app.market_data import regime_blended_covariance, _nearest_psd_correlation
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import numpy as np

class TestRegimeCovariance(unittest.TestCase):
    def setUp(self):
        self.assets = ["KR_STOCK", "GLOBAL_STOCK", "KR_BOND", "GLOBAL_BOND", "ALTERNATIVE"]
        self.cov_dict = {
            a1: {a2: 0.01 if a1 == a2 else 0.002 for a2 in self.assets}
            for a1 in self.assets
        }

    def test_low_vol_no_op(self):
        # LOW_VOL regime has alpha = 0.0, should return input covariance dict unchanged
        blended = regime_blended_covariance(self.cov_dict, "LOW_VOL")
        self.assertEqual(blended, self.cov_dict)

    def test_crisis_blending(self):
        # CRISIS regime has alpha = 0.75, should modify covariance values
        blended = regime_blended_covariance(self.cov_dict, "CRISIS")
        self.assertNotEqual(blended, self.cov_dict)
        # Verify PSD properties
        assets = list(blended.keys())
        Sigma = np.array([[blended[a1][a2] for a2 in assets] for a1 in assets])
        eigenvalues = np.linalg.eigvalsh(Sigma)
        self.assertTrue(np.all(eigenvalues >= -1e-12))


class TestNewEndpoints(unittest.TestCase):
    def setUp(self):
        # File-based database setup for clean testing isolation (avoiding in-memory connection loss)
        self.db_file = "test_new_endpoints.db"
        if os.path.exists(self.db_file):
            try:
                os.remove(self.db_file)
            except Exception:
                pass
        
        self.engine = create_engine(f"sqlite:///{self.db_file}", connect_args={"check_same_thread": False})
        self.TestingSessionLocal = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        Base.metadata.create_all(bind=self.engine)
        self.db = self.TestingSessionLocal()
        
        # Override FastAPI db dependency
        def override_get_db():
            db = self.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        app.dependency_overrides.clear()
        if os.path.exists(self.db_file):
            try:
                os.remove(self.db_file)
            except Exception:
                pass

    def test_delete_market_intelligence(self):
        # Seed an item
        item = MarketIntelligence(
            id="test-intel-id-123",
            title="Test Intelligence",
            category="NEWS",
            content="Content text",
            author="Author",
            author_title="Title",
            source="Source",
            date="2026-06-29",
            image_url="",
            ai_interpretation={}
        )
        self.db.add(item)
        self.db.commit()

        # Delete the item
        response = self.client.delete("/market-intelligence/test-intel-id-123")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "deleted": "test-intel-id-123"})

        # Query to verify deletion
        db_item = self.db.query(MarketIntelligence).filter(MarketIntelligence.id == "test-intel-id-123").first()
        self.assertIsNone(db_item)

        # Delete non-existent item should return 404
        response404 = self.client.delete("/market-intelligence/non-existent-id")
        self.assertEqual(response404.status_code, 404)

    def test_delete_and_reset_theses(self):
        # Seed a thesis
        t1 = Thesis(
            id="test-thesis-1",
            title="Thesis 1",
            rationale="Rationale 1",
            asset="GLOBAL_STOCK",
            confidence_calibrated=0.8,
            status="approved",
            view_type="absolute"
        )
        t2 = Thesis(
            id="test-thesis-2",
            title="Thesis 2",
            rationale="Rationale 2",
            asset="KR_BOND",
            confidence_calibrated=0.5,
            status="new",
            view_type="absolute"
        )
        self.db.add_all([t1, t2])
        self.db.commit()

        # Delete single thesis
        response = self.client.delete("/theses/test-thesis-1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "deleted": "test-thesis-1"})
        
        # Verify first is deleted, second remains
        self.assertIsNone(self.db.query(Thesis).filter(Thesis.id == "test-thesis-1").first())
        self.assertIsNotNone(self.db.query(Thesis).filter(Thesis.id == "test-thesis-2").first())

        # Reset all theses
        reset_response = self.client.delete("/theses")
        self.assertEqual(reset_response.status_code, 200)
        self.assertEqual(reset_response.json(), {"status": "ok", "deleted_count": 1})

        # Verify all are deleted
        self.assertEqual(self.db.query(Thesis).count(), 0)

    @patch("app.collect.collect_documents_with_progress")
    def test_research_collect_stream(self, mock_stream):
        # Mock stream generator yielding fake SSE dict events
        async def mock_generator(db):
            yield {"type": "phase", "msg": "Starting test..."}
            yield {"type": "source", "name": "FRED", "count": 2}
            yield {"type": "done", "summary": {"FRED": 2}}

        mock_stream.side_effect = mock_generator

        # Call streaming endpoint
        with self.client.stream("GET", "/research/collect-stream") as response:
            self.assertEqual(response.status_code, 200)
            self.assertIn("text/event-stream", response.headers.get("content-type", ""))
            
            # Read first few lines of stream
            lines = []
            for line in response.iter_lines():
                if line:
                    if isinstance(line, bytes):
                        lines.append(line.decode("utf-8"))
                    else:
                        lines.append(line)
            self.assertGreater(len(lines), 0)
            self.assertTrue(any("Starting test..." in l for l in lines))


if __name__ == "__main__":
    unittest.main()
