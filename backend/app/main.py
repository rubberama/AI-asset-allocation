import logging
import numpy as np
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Dict, List, Any, Optional

from app.db import init_db, get_db, Simulation, NpsSnapshot
from app.config import DEFAULT_RISK_AVERSION, DEFAULT_TAU
from app.crawler import fetch_and_sync_nps_data
from app.market_data import fetch_market_data, fetch_risk_free_rate
from app.llm import parse_views_with_llm, get_last_macro_context, generate_portfolio_commentary
from app.black_litterman import run_black_litterman
from app.optimizer import optimize_portfolio, run_efficient_frontier
from app.stress_test import run_monte_carlo_simulation, run_historical_stress_test
from app.market_intelligence import fetch_market_intelligence

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="NPS AI Black-Litterman Asset Allocation Platform API",
    description="Backend API for NPS portfolio asset allocation optimization.",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local development ease. Can restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup DB initialization
@app.on_event("startup")
def on_startup():
    logger.info("Initializing database tables...")
    init_db()
    logger.info("Database initialized.")

# Request / Response Schemas
class SimulateRequest(BaseModel):
    view_text: str = Field(..., description="Natural language investment view", example="미국 주식이 국내 주식보다 더 좋을 것 같고 금리는 하락할 것이다.")
    optimizer: str = Field("markowitz", description="Optimization strategy: markowitz, risk_parity, hrp", example="markowitz")
    max_deviation: Optional[float] = Field(None, description="Maximum deviation limit relative to benchmark weights, e.g., 0.1 for 10%")
    risk_aversion: Optional[float] = Field(None, description="Risk aversion coefficient (lambda). If None, estimated dynamically.")
    tau: Optional[float] = Field(None, description="Uncertainty scaling factor (tau). If None, estimated dynamically.")

class StressTestRequest(BaseModel):
    weights: Dict[str, float] = Field(..., description="Portfolio weights mapping")
    expected_returns: Dict[str, float] = Field(..., description="Expected annualized returns")
    covariance: Dict[str, Dict[str, float]] = Field(..., description="Annualized covariance matrix")

class IngestUrlRequest(BaseModel):
    url: Optional[str] = Field(None, description="Article URL to fetch, read, and analyze into a thesis")
    content: Optional[str] = Field(None, description="Pasted article text (used when the URL is not fetchable)")

class AllocateRequest(BaseModel):
    optimizer: str = Field("markowitz", description="markowitz | risk_parity | hrp | resampled | ensemble")
    max_deviation: Optional[float] = Field(0.10, description="Max deviation vs NPS benchmark weights")
    use_theses: bool = Field(True, description="Use approved theses as Black-Litterman views")


def _estimate_risk_aversion(market_weights: Dict[str, float], covariance: Dict[str, Dict[str, float]]) -> float:
    """Market-implied risk aversion lambda = equity_premium / market variance."""
    assets = list(market_weights.keys())
    w = np.array([market_weights[a] for a in assets])
    Sigma = np.array([[covariance[a1][a2] for a2 in assets] for a1 in assets])
    var_m = float(np.dot(w, np.dot(Sigma, w)))
    return 0.06 / var_m if var_m > 1e-8 else 2.5


def _regime_lambda_multiplier(macro_context: Dict[str, Any]) -> float:
    """Lean more risk-averse in stressed regimes, slightly less in calm ones."""
    regime = (macro_context or {}).get("market_regime", "NORMAL")
    return {"CRISIS": 1.6, "ELEVATED_RISK": 1.25, "NORMAL": 1.0, "LOW_VOL": 0.9}.get(regime, 1.0)

@app.get("/")
def read_root():
    return {"message": "NPS AI Black-Litterman Platform API is running!"}

@app.get("/nps")
def get_nps_weights(db: Session = Depends(get_db)):
    """
    Returns the current NPS target weights.
    Tries to retrieve via crawler/database snapshot.
    """
    try:
        weights = fetch_and_sync_nps_data(db)
        return {"weights": weights}
    except Exception as e:
        logger.error(f"Failed to fetch NPS weights: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch NPS weights: {str(e)}")

import json
import asyncio
from fastapi.responses import StreamingResponse

@app.post("/simulate")
async def run_simulation(request: SimulateRequest, db: Session = Depends(get_db)):
    """
    Runs the full simulation pipeline as a real-time SSE stream,
    reporting the progress of each calculation phase to the client.
    """
    async def event_generator():
        try:
            # 1. Fetch current NPS weights
            yield json.dumps({"step": 1, "message": "국민연금 기금운용본부의 공식 자산배분 목표 비중 데이터를 조회하고 있습니다."}) + "\n"
            await asyncio.sleep(0.02)  # Yield slice to allow UI update
            market_weights = fetch_and_sync_nps_data(db)
            
            # 2. Fetch market data (returns, covariance)
            yield json.dumps({"step": 2, "message": "야후 파이낸스에서 대표 ETF 종목 시세 및 국채 금리 데이터를 수집하고 있습니다."}) + "\n"
            await asyncio.sleep(0.02)
            market_data = fetch_market_data()
            expected_returns_hist = market_data["expected_returns"]
            covariance = market_data["covariance"]
            risk_free_rate = fetch_risk_free_rate()
            
            # 3. Parse user views using OpenRouter
            yield json.dumps({"step": 3, "message": "OpenRouter AI 모델(owl-alpha)을 활용하여 자연어 투자 의견을 구조화하고 있습니다."}) + "\n"
            await asyncio.sleep(0.02)
            parsed_views = await parse_views_with_llm(request.view_text)
            
            # 4. Compute/estimate lambda and tau, and run Black-Litterman
            yield json.dumps({"step": 4, "message": "시장 균형수익률(Prior)과 사용자 의견을 결합하여 Black-Litterman 사후 기대수익률을 산정하고 있습니다."}) + "\n"
            await asyncio.sleep(0.02)
            
            # Estimate risk aversion if not provided
            risk_aversion = request.risk_aversion
            if risk_aversion is None:
                w_assets = list(market_weights.keys())
                w_arr = np.array([market_weights[a] for a in w_assets])
                Sigma_m = np.zeros((len(w_assets), len(w_assets)))
                for i, a1 in enumerate(w_assets):
                    for j, a2 in enumerate(w_assets):
                        Sigma_m[i, j] = covariance[a1][a2]
                sigma_m_sq = float(np.dot(w_arr, np.dot(Sigma_m, w_arr)))
                if sigma_m_sq > 1e-8:
                    risk_aversion = 0.06 / sigma_m_sq
                else:
                    risk_aversion = 2.5
            
            # Estimate tau if not provided
            tau = request.tau
            if tau is None:
                tau = 1.0 / (252 * 5)

            prior_returns, post_returns, post_covariance = run_black_litterman(
                market_weights=market_weights,
                covariance_dict=covariance,
                views=parsed_views,
                risk_free_rate=risk_free_rate,
                risk_aversion=risk_aversion,
                tau=tau
            )
            
            # 5. Optimize portfolio using the selected strategy
            yield json.dumps({"step": 5, "message": f"선택한 최적화 알고리즘({request.optimizer.upper()})을 적용하여 자산배분 최적 가중치를 산출하고 있습니다."}) + "\n"
            await asyncio.sleep(0.02)
            optimized_weights = optimize_portfolio(
                strategy=request.optimizer,
                expected_returns=post_returns,
                covariance_dict=post_covariance,
                risk_free_rate=risk_free_rate,
                risk_aversion=risk_aversion,
                benchmark_weights=market_weights,
                max_deviation=request.max_deviation
            )
            
            # 6. Run Monte Carlo stress test on the optimized portfolio
            yield json.dumps({"step": 6, "message": "10,000회 몬테카를로 스트레스 테스트 시뮬레이션을 실행하여 미래 포트폴리오 가치 및 VaR, CVaR, MDD를 도출하고 있습니다."}) + "\n"
            await asyncio.sleep(0.02)
            mc_results = run_monte_carlo_simulation(
                weights=optimized_weights,
                expected_returns=post_returns,
                covariance_dict=post_covariance
            )
            
            # Calculate efficient frontier
            assets_list = list(post_returns.keys())
            n_assets = len(assets_list)
            mu_arr = np.array([post_returns[a] for a in assets_list])
            Sigma_arr = np.zeros((n_assets, n_assets))
            for i, a1 in enumerate(assets_list):
                for j, a2 in enumerate(assets_list):
                    Sigma_arr[i, j] = post_covariance[a1][a2]
                    
            efficient_frontier = run_efficient_frontier(
                mu=mu_arr,
                Sigma=Sigma_arr,
                assets=assets_list,
                benchmark_weights=market_weights,
                max_deviation=request.max_deviation,
                rf=risk_free_rate
            )
            
            # Calculate portfolio stats for benchmark and optimal portfolios
            w_bench_arr = np.array([market_weights.get(a, 0.0) for a in assets_list])
            w_opt_arr = np.array([optimized_weights.get(a, 0.0) for a in assets_list])
            
            bench_return = float(np.dot(w_bench_arr, mu_arr))
            bench_vol = float(np.sqrt(np.dot(w_bench_arr, np.dot(Sigma_arr, w_bench_arr))))
            bench_sharpe = float((bench_return - risk_free_rate) / bench_vol) if bench_vol > 1e-8 else 0.0
            
            opt_return = float(np.dot(w_opt_arr, mu_arr))
            opt_vol = float(np.sqrt(np.dot(w_opt_arr, np.dot(Sigma_arr, w_opt_arr))))
            opt_sharpe = float((opt_return - risk_free_rate) / opt_vol) if opt_vol > 1e-8 else 0.0
            
            # 7. Run Historical Stress Test Scenarios
            yield json.dumps({"step": 7, "message": "역사적 금융 위기 시나리오(GFC, 코로나19 등) 스트레스 테스트를 수행하고 있습니다."}) + "\n"
            await asyncio.sleep(0.02)
            historical_stress_tests = run_historical_stress_test(optimized_weights)

            # 8. Fetch macro context and generate AI commentary
            yield json.dumps({"step": 8, "message": "실시간 거시 경제 환경을 분석하고 AI 포트폴리오 분석 리포트를 작성하고 있습니다."}) + "\n"
            await asyncio.sleep(0.02)
            macro_context = get_last_macro_context()
            
            ai_commentary = await generate_portfolio_commentary(
                optimized_weights=optimized_weights,
                market_weights=market_weights,
                posterior_returns=post_returns,
                risk_metrics=mc_results,
                macro_context=macro_context
            )
            
            # 9. Save simulation to Database
            sim_record = Simulation(
                created_at=datetime.utcnow(),
                user_view=request.view_text,
                optimizer=request.optimizer,
                posterior_returns=post_returns,
                weights={
                    "market_weights": market_weights,
                    "optimized_weights": optimized_weights
                },
                risk_metrics={
                    "expected_return": mc_results["expected_return"],
                    "volatility": mc_results["volatility"],
                    "var_95": mc_results["var_95"],
                    "cvar_95": mc_results["cvar_95"],
                    "max_drawdown_estimate": mc_results["max_drawdown_estimate"],
                    "efficient_frontier": efficient_frontier,
                    "benchmark_portfolio": {
                        "return": bench_return,
                        "volatility": bench_vol,
                        "sharpe": bench_sharpe
                    },
                    "optimized_portfolio": {
                        "return": opt_return,
                        "volatility": opt_vol,
                        "sharpe": opt_sharpe
                    },
                    "prior_returns": prior_returns,
                    "risk_free_rate": risk_free_rate,
                    "parsed_views": parsed_views,
                    "mc_results": mc_results,
                    "risk_aversion": risk_aversion,
                    "tau": tau,
                    "macro_context": macro_context,
                    "ai_commentary": ai_commentary,
                    "historical_stress_tests": historical_stress_tests
                }
            )
            db.add(sim_record)
            db.commit()
            db.refresh(sim_record)
            
            # 10. Return combined response
            result_data = {
                "simulation_id": sim_record.id,
                "market_weights": market_weights,
                "parsed_views": parsed_views,
                "risk_free_rate": risk_free_rate,
                "prior_returns": prior_returns,
                "posterior_returns": post_returns,
                "optimized_weights": optimized_weights,
                "risk_metrics": mc_results,
                "efficient_frontier": efficient_frontier,
                "benchmark_portfolio": {
                    "return": bench_return,
                    "volatility": bench_vol,
                    "sharpe": bench_sharpe
                },
                "optimized_portfolio": {
                    "return": opt_return,
                    "volatility": opt_vol,
                    "sharpe": opt_sharpe
                },
                "risk_aversion": risk_aversion,
                "tau": tau,
                "macro_context": macro_context,
                "ai_commentary": ai_commentary,
                "historical_stress_tests": historical_stress_tests
            }
            yield json.dumps({"step": 9, "message": "자산배분 시뮬레이션이 성공적으로 완료되었습니다.", "data": result_data}) + "\n"
            
        except Exception as e:
            logger.error(f"Simulation streaming failed: {e}", exc_info=True)
            yield json.dumps({"error": str(e)}) + "\n"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/stress-test")
def run_custom_stress_test(request: StressTestRequest):
    """
    Executes a Monte Carlo stress test for a custom asset weight portfolio.
    """
    try:
        mc_results = run_monte_carlo_simulation(
            weights=request.weights,
            expected_returns=request.expected_returns,
            covariance_dict=request.covariance
        )
        return mc_results
    except Exception as e:
        logger.error(f"Custom stress test failed: {e}")
        raise HTTPException(status_code=500, detail=f"Stress test error: {str(e)}")

@app.get("/macro-data")
def get_macro_data():
    """
    Fetches real-time macro indicators.
    """
    try:
        macro_context = get_last_macro_context()
        if not macro_context:
            from app.macro_data import fetch_macro_context
            macro_context = fetch_macro_context()
        return {"data": macro_context}
    except Exception as e:
        logger.error(f"Failed to fetch macro data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/market-intelligence")
async def get_market_intelligence(db: Session = Depends(get_db)):
    """
    Fetches curated market intelligence theses.
    """
    try:
        theses = await fetch_market_intelligence(db)
        return {"data": theses}
    except Exception as e:
        logger.error(f"Failed to fetch market intelligence: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/market-intelligence/refresh")
async def refresh_market_intelligence(db: Session = Depends(get_db)):
    """
    Forces a fresh sync from RSS and updates the database cache.
    """
    try:
        from app.market_intelligence import sync_market_intelligence
        theses = await sync_market_intelligence(db, force=True)
        return {"data": theses}
    except Exception as e:
        logger.error(f"Failed to refresh market intelligence: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/market-intelligence/from-url")
async def ingest_market_intelligence_from_url(request: IngestUrlRequest, db: Session = Depends(get_db)):
    """
    Accepts an article URL (or pasted content), reads and analyzes it, and turns it
    into a structured market-intelligence thesis added to the feed.
    Returns {"status": "needs_content"} if the URL cannot be fetched, prompting the
    client to ask the user to paste the article text.
    """
    try:
        from app.market_intelligence import ingest_article
        result = await ingest_article(db, url=request.url, content=request.content)
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message", "Ingestion failed"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to ingest article: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/research/collect")
async def collect_research(db: Session = Depends(get_db)):
    """Runs the macro collectors (FRED, GDELT, Marketaux), scores and de-dupes the
    results, and persists them as ranked research Documents."""
    try:
        from app.collect import collect_documents
        summary = await collect_documents(db)
        return {"status": "ok", "summary": summary}
    except Exception as e:
        logger.error(f"Research collection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/research/queue")
def research_queue(asset: Optional[str] = None, limit: int = 40, db: Session = Depends(get_db)):
    """Returns the ranked, de-duplicated, asset-tagged macro research queue."""
    try:
        from app.collect import get_research_queue
        return {"data": get_research_queue(db, asset_filter=asset, limit=limit)}
    except Exception as e:
        logger.error(f"Failed to fetch research queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/thesis/build")
async def build_thesis(db: Session = Depends(get_db)):
    """Stage 2: digest the research queue into calibrated house-view theses (Nemotron Ultra, 2-pass)."""
    try:
        from app.thesis_engine import build_theses
        theses = await build_theses(db)
        return {"status": "ok", "data": theses}
    except Exception as e:
        logger.error(f"Thesis build failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/theses")
def list_theses(status: Optional[str] = None, db: Session = Depends(get_db)):
    """Returns stored theses (optionally filtered by status: draft|approved|rejected)."""
    try:
        from app.thesis_engine import get_theses
        return {"data": get_theses(db, status=status)}
    except Exception as e:
        logger.error(f"Failed to list theses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/theses/{thesis_id}/status")
def set_thesis_status(thesis_id: str, status: str, db: Session = Depends(get_db)):
    """Approve/reject a thesis (human-in-the-loop gate before it feeds the optimizer)."""
    from app.db import Thesis
    t = db.query(Thesis).filter(Thesis.id == thesis_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Thesis not found")
    if status not in ("draft", "approved", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")
    t.status = status
    db.commit()
    return {"status": "ok", "id": thesis_id, "new_status": status}


@app.post("/allocate")
def allocate_from_theses(request: AllocateRequest, db: Session = Depends(get_db)):
    """Stage 3: turn APPROVED theses into an allocation decision package.

    Pipeline: approved theses → BL views → Idzorek-calibrated Black-Litterman with a
    regime-scaled risk-aversion → optimizer → Monte-Carlo risk → benchmark attribution.
    """
    try:
        market_weights = fetch_and_sync_nps_data(db)
        market_data = fetch_market_data()
        covariance = market_data["covariance"]
        rf = fetch_risk_free_rate()

        from app.thesis_engine import get_theses, theses_to_views
        theses = get_theses(db, status="approved") if request.use_theses else []
        views = theses_to_views(theses)

        macro_context = get_last_macro_context()
        base_lambda = _estimate_risk_aversion(market_weights, covariance)
        risk_aversion = base_lambda * _regime_lambda_multiplier(macro_context)
        tau = 1.0 / (252 * 5)

        prior_returns, post_returns, post_covariance = run_black_litterman(
            market_weights=market_weights, covariance_dict=covariance, views=views,
            risk_free_rate=rf, risk_aversion=risk_aversion, tau=tau, omega_method="idzorek",
        )
        optimized_weights = optimize_portfolio(
            strategy=request.optimizer, expected_returns=post_returns, covariance_dict=post_covariance,
            risk_free_rate=rf, risk_aversion=risk_aversion, benchmark_weights=market_weights,
            max_deviation=request.max_deviation,
        )
        mc_results = run_monte_carlo_simulation(optimized_weights, post_returns, post_covariance)

        attribution = {
            a: round((optimized_weights.get(a, 0.0) - market_weights.get(a, 0.0)) * 100, 2)
            for a in optimized_weights
        }
        return {
            "status": "ok",
            "market_weights": market_weights,
            "optimized_weights": optimized_weights,
            "attribution_pp": attribution,
            "posterior_returns": post_returns,
            "risk_metrics": {k: mc_results[k] for k in
                             ("expected_return", "volatility", "var_95", "cvar_95", "max_drawdown_estimate")},
            "risk_aversion": risk_aversion,
            "regime": (macro_context or {}).get("market_regime", "NORMAL"),
            "omega_method": "idzorek",
            "theses_used": theses,
            "n_views": len(views),
        }
    except Exception as e:
        logger.error(f"Allocation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/backtest")
def backtest(db: Session = Depends(get_db)):
    """Scores stored theses (whose horizon has elapsed) against realized ETF returns:
    Information Coefficient + hit-rate."""
    try:
        from app.thesis_engine import get_theses
        from app.backtest import run_thesis_backtest
        return run_thesis_backtest(get_theses(db))
    except Exception as e:
        logger.error(f"Backtest failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/market-intelligence/from-pdf")
async def ingest_market_intelligence_from_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Accepts a PDF upload (research report, policy paper, etc.), extracts its text,
    and analyzes it into a structured thesis added to the feed."""
    try:
        from app.market_intelligence import extract_pdf_text, ingest_article, MIN_ARTICLE_CHARS
        data = await file.read()
        text = extract_pdf_text(data)
        if not text or len(text) < MIN_ARTICLE_CHARS:
            return {
                "status": "needs_content",
                "message": "PDF에서 텍스트를 추출하지 못했습니다 (스캔 이미지 PDF일 수 있습니다). "
                           "기사/리포트 본문을 복사하여 붙여넣어 주세요.",
            }
        result = await ingest_article(db, content=text, source_label=f"PDF: {file.filename}")
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message", "Ingestion failed"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to ingest PDF: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/simulations")
def list_simulations(db: Session = Depends(get_db)):
    """
    Fetches the history of past simulations.
    """
    try:
        simulations = db.query(Simulation).order_by(Simulation.id.desc()).all()
        return [
            {
                "id": s.id,
                "created_at": s.created_at.isoformat(),
                "user_view": s.user_view,
                "optimizer": s.optimizer
            }
            for s in simulations
        ]
    except Exception as e:
        logger.error(f"Failed to fetch simulations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/simulations/{simulation_id}")
def get_simulation_detail(simulation_id: int, db: Session = Depends(get_db)):
    """
    Fetches the full detail of a specific past simulation.
    """
    try:
        sim = db.query(Simulation).filter(Simulation.id == simulation_id).first()
        if not sim:
            raise HTTPException(status_code=404, detail="Simulation not found")
            
        market_weights = sim.weights.get("market_weights", {})
        optimized_weights = sim.weights.get("optimized_weights", {})
        
        parsed_views = sim.risk_metrics.get("parsed_views", [])
        risk_free_rate = sim.risk_metrics.get("risk_free_rate", 0.035)
        prior_returns = sim.risk_metrics.get("prior_returns", {})
        
        if "mc_results" in sim.risk_metrics:
            mc_results = sim.risk_metrics["mc_results"]
        else:
            mc_results = {
                "expected_return": sim.risk_metrics.get("expected_return", 0.0),
                "volatility": sim.risk_metrics.get("volatility", 0.0),
                "var_95": sim.risk_metrics.get("var_95", 0.0),
                "cvar_95": sim.risk_metrics.get("cvar_95", 0.0),
                "max_drawdown_estimate": sim.risk_metrics.get("max_drawdown_estimate", 0.0),
                "simulation_paths": sim.risk_metrics.get("simulation_paths", []),
                "histogram_data": sim.risk_metrics.get("histogram_data", [])
            }
            
        efficient_frontier = sim.risk_metrics.get("efficient_frontier", [])
        benchmark_portfolio = sim.risk_metrics.get("benchmark_portfolio", {})
        optimized_portfolio = sim.risk_metrics.get("optimized_portfolio", {})
        
        return {
            "simulation_id": sim.id,
            "market_weights": market_weights,
            "parsed_views": parsed_views,
            "risk_free_rate": risk_free_rate,
            "prior_returns": prior_returns,
            "posterior_returns": sim.posterior_returns,
            "optimized_weights": optimized_weights,
            "risk_metrics": mc_results,
            "efficient_frontier": efficient_frontier,
            "benchmark_portfolio": benchmark_portfolio,
            "optimized_portfolio": optimized_portfolio,
            "risk_aversion": sim.risk_metrics.get("risk_aversion"),
            "tau": sim.risk_metrics.get("tau"),
            "macro_context": sim.risk_metrics.get("macro_context"),
            "ai_commentary": sim.risk_metrics.get("ai_commentary"),
            "historical_stress_tests": sim.risk_metrics.get("historical_stress_tests")
        }
    except Exception as e:
        logger.error(f"Failed to fetch simulation detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))
