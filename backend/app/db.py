from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import DATABASE_URL

Base = declarative_base()

class NpsSnapshot(Base):
    __tablename__ = "nps_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, nullable=False)  # e.g., "2026-06"
    weights = Column(JSON, nullable=False)  # e.g., {"KR_STOCK": 0.208, ...}
    source_url = Column(String, nullable=True)

class Simulation(Base):
    __tablename__ = "simulations"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    user_view = Column(String, nullable=False)
    optimizer = Column(String, nullable=False)  # "markowitz" | "risk_parity" | "hrp"
    posterior_returns = Column(JSON, nullable=False)
    weights = Column(JSON, nullable=False)  # {"market_weights": {...}, "optimized_weights": {...}}
    risk_metrics = Column(JSON, nullable=False)  # {"expected_return": ..., "volatility": ..., "var_95": ..., "cvar_95": ..., "max_drawdown_estimate": ...}

class MarketIntelligence(Base):
    __tablename__ = "market_intelligence"

    id = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    author = Column(String, nullable=False)
    author_title = Column(String, nullable=False)
    source = Column(String, nullable=False)
    date = Column(String, nullable=False)
    title = Column(String, nullable=False)
    content = Column(String, nullable=False)
    image_url = Column(String, nullable=False)
    ai_interpretation = Column(JSON, nullable=False)
    full_report = Column(JSON, nullable=True) # Full structured report: executive_summary, rationale, target_assets, recommendation, risk_factors
    category = Column(String, default="NEWS", nullable=True) # NEWS | RESEARCH | USER_ASSET


class Document(Base):
    """A normalized unit of macro research (a news article, a macro data observation,
    or a geopolitical event) collected from a source and scored for relevance."""
    __tablename__ = "documents"

    id = Column(String, primary_key=True, index=True)  # stable hash of source+url/title
    source = Column(String, nullable=False)            # e.g. "FRED", "GDELT", "Marketaux"
    source_type = Column(String, nullable=False)       # NEWS | MACRO_DATA | EVENT
    title = Column(String, nullable=False)
    text = Column(String, nullable=True)               # summary / snippet / observation text
    url = Column(String, nullable=True)
    published_at = Column(String, nullable=True)        # ISO timestamp
    fetched_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    payload = Column(JSON, nullable=True)               # raw source-specific fields (e.g. FRED value/delta, GDELT tone)
    relevance = Column(JSON, nullable=True)             # {asset_class: score} for the 5 sleeves
    credibility = Column(JSON, nullable=True)           # source credibility weight (0..1), stored as float in JSON
    recency_score = Column(JSON, nullable=True)         # recency decay weight (0..1)
    composite_score = Column(JSON, nullable=True)       # final ranking score
    dedup_cluster = Column(String, nullable=True)       # cluster id for near-duplicate grouping
    status = Column(String, default="new", nullable=False)  # new | selected | used | dismissed


class Thesis(Base):
    """A consolidated, calibrated macro house-view that maps to a Black-Litterman view,
    with provenance back to the Documents that support it."""
    __tablename__ = "theses"

    id = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    view_type = Column(String, nullable=False)          # absolute | relative
    asset = Column(String, nullable=True)               # absolute view target
    asset1 = Column(String, nullable=True)              # relative: outperformer
    asset2 = Column(String, nullable=True)              # relative: underperformer
    direction = Column(String, nullable=True)           # bullish | bearish (absolute)
    magnitude = Column(JSON, nullable=True)             # expected_return or outperformance (decimal)
    horizon = Column(String, nullable=True)             # e.g. "3M", "12M"
    confidence_calibrated = Column(JSON, nullable=False)  # 0..1 calibrated confidence
    title = Column(String, nullable=True)
    rationale = Column(String, nullable=True)
    provenance = Column(JSON, nullable=True)            # list of Document ids
    evidence = Column(JSON, nullable=True)              # supporting quotes / data points
    status = Column(String, default="draft", nullable=False)  # draft | approved | rejected


# Connect arguments needed for sqlite concurrency
connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from sqlalchemy import inspect
    inspector = inspect(engine)
    try:
        if "market_intelligence" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("market_intelligence")]
            if "category" not in columns:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE market_intelligence ADD COLUMN category VARCHAR(50) DEFAULT 'NEWS'"))
                print("Added category column to market_intelligence table via migration.")
    except Exception as e:
        print(f"Migration check warning: {e}")
    Base.metadata.create_all(bind=engine)
