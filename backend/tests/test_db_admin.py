"""Tests for app.db_admin — the data-class-aware DB reset.

Runs entirely against a throwaway temp-file SQLite DB. It never touches the
real nps_platform.db or any real .env.
"""
import os
import tempfile
import unittest
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import (
    Base,
    NpsSnapshot,
    Simulation,
    MarketIntelligence,
    Document,
    Thesis,
)
from app.db_admin import reset_database, classes_for_scope, DataClass


def _mi(id_, category):
    """A MarketIntelligence row with the given category."""
    return MarketIntelligence(
        id=id_, author="a", author_title="t", source="s",
        date="2026-06-30", title="ti", content="c", image_url="",
        ai_interpretation={}, category=category,
    )


class TestDbAdmin(unittest.TestCase):
    def setUp(self):
        # Temp-file (not :memory:) so VACUUM has a real file to operate on and
        # the engine/connection survive across reset_database calls.
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.engine = create_engine(f"sqlite:///{self.db_path}")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self._seed()

    def tearDown(self):
        self.engine.dispose()
        os.remove(self.db_path)

    def _seed(self):
        db = self.Session()
        # EPHEMERAL
        db.add(Document(id="d1", source="FRED", source_type="MACRO_DATA", title="doc1"))
        db.add(Document(id="d2", source="GDELT", source_type="NEWS", title="doc2"))
        db.add(_mi("mi-news", "NEWS"))
        db.add(_mi("mi-null", None))  # category IS NULL -> ephemeral
        # USER
        db.add(_mi("mi-user", "USER_ASSET"))
        db.add(_mi("mi-research", "RESEARCH"))
        db.add(Simulation(
            id=1, created_at=datetime.utcnow(), user_view="v", optimizer="hrp",
            posterior_returns={}, weights={}, risk_metrics={},
        ))
        db.add(Thesis(id="th1", view_type="absolute", confidence_calibrated=0.7))
        # REFERENCE
        db.add(NpsSnapshot(id=1, date="2026-06", weights={"KR_STOCK": 0.2}))
        db.commit()
        db.close()

    def _counts(self):
        db = self.Session()
        try:
            return {
                "documents": db.query(Document).count(),
                "mi_ephemeral": db.query(MarketIntelligence).filter(
                    (MarketIntelligence.category == "NEWS")
                    | (MarketIntelligence.category.is_(None))
                ).count(),
                "mi_user": db.query(MarketIntelligence).filter(
                    MarketIntelligence.category.in_(["USER_ASSET", "RESEARCH"])
                ).count(),
                "simulations": db.query(Simulation).count(),
                "theses": db.query(Thesis).count(),
                "nps_snapshots": db.query(NpsSnapshot).count(),
            }
        finally:
            db.close()

    # ── scope resolution ────────────────────────────────────────────────
    def test_classes_for_scope(self):
        self.assertEqual(classes_for_scope("ephemeral"), {DataClass.EPHEMERAL})
        self.assertEqual(classes_for_scope("user"), {DataClass.USER})
        self.assertEqual(
            classes_for_scope("all"),
            {DataClass.EPHEMERAL, DataClass.USER},
        )
        self.assertEqual(
            classes_for_scope("all", force_reference=True),
            {DataClass.EPHEMERAL, DataClass.USER, DataClass.REFERENCE},
        )
        with self.assertRaises(ValueError):
            classes_for_scope("bogus")

    # ── ephemeral scope ─────────────────────────────────────────────────
    def test_reset_ephemeral_clears_only_cache(self):
        summary = reset_database("ephemeral", engine=self.engine)
        c = self._counts()
        # cleared
        self.assertEqual(c["documents"], 0)
        self.assertEqual(c["mi_ephemeral"], 0)
        # preserved
        self.assertEqual(c["mi_user"], 2)
        self.assertEqual(c["simulations"], 1)
        self.assertEqual(c["theses"], 1)
        self.assertEqual(c["nps_snapshots"], 1)
        # 2 docs + 2 ephemeral MI rows
        self.assertEqual(summary["total_deleted"], 4)

    # ── user scope ──────────────────────────────────────────────────────
    def test_reset_user_clears_only_user_artifacts(self):
        reset_database("user", engine=self.engine)
        c = self._counts()
        # cleared
        self.assertEqual(c["mi_user"], 0)
        self.assertEqual(c["simulations"], 0)
        self.assertEqual(c["theses"], 0)
        # preserved
        self.assertEqual(c["documents"], 2)
        self.assertEqual(c["mi_ephemeral"], 2)
        self.assertEqual(c["nps_snapshots"], 1)

    # ── all scope ───────────────────────────────────────────────────────
    def test_reset_all_preserves_reference(self):
        reset_database("all", engine=self.engine)
        c = self._counts()
        self.assertEqual(c["documents"], 0)
        self.assertEqual(c["mi_ephemeral"], 0)
        self.assertEqual(c["mi_user"], 0)
        self.assertEqual(c["simulations"], 0)
        self.assertEqual(c["theses"], 0)
        # REFERENCE survives without the force flag
        self.assertEqual(c["nps_snapshots"], 1)

    def test_reset_all_force_reference_clears_everything(self):
        reset_database("all", force_reference=True, engine=self.engine)
        c = self._counts()
        self.assertTrue(all(v == 0 for v in c.values()), c)

    # ── dry run ─────────────────────────────────────────────────────────
    def test_dry_run_changes_nothing(self):
        before = self._counts()
        summary = reset_database("all", force_reference=True,
                                 engine=self.engine, dry_run=True)
        after = self._counts()
        self.assertEqual(before, after)
        self.assertTrue(summary["dry_run"])
        # dry run still reports what WOULD be deleted
        self.assertGreater(summary["total_deleted"], 0)


if __name__ == "__main__":
    unittest.main()
