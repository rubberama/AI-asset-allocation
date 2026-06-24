from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON
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
    Base.metadata.create_all(bind=engine)
