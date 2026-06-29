import logging
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict
from sklearn.covariance import LedoitWolf
from app.config import ETF_TICKER_MAPPING, DEFAULT_RISK_FREE_RATE

logger = logging.getLogger(__name__)

def fetch_risk_free_rate() -> float:
    """
    Fetches the 10-Year U.S. Treasury Yield (^TNX) from Yahoo Finance.
    Returns the rate as a decimal (e.g., 0.042 for 4.2%).
    Falls back to DEFAULT_RISK_FREE_RATE if fetching fails.
    """
    try:
        ticker = yf.Ticker("^TNX")
        # Fetch the last 5 days of data to make sure we get a valid close price
        df = ticker.history(period="5d")
        if not df.empty and "Close" in df.columns:
            # ^TNX price is yield * 10 (e.g., 4.25 means 4.25%)
            latest_yield = df["Close"].iloc[-1]
            rate = float(latest_yield) / 100.0
            logger.info(f"Fetched 10-Year Treasury Yield (^TNX): {rate:.4f} ({latest_yield:.2f}%)")
            return rate
        else:
            raise ValueError("Empty dataframe returned for ^TNX")
    except Exception as e:
        logger.error(f"Failed to fetch ^TNX from Yahoo Finance: {e}. Falling back to default: {DEFAULT_RISK_FREE_RATE}")
        return DEFAULT_RISK_FREE_RATE

def fetch_market_data(period: str = "5y") -> dict:
    """
    Downloads historical close prices for the assets defined in ETF_TICKER_MAPPING.
    Calculates:
      - Annualized expected returns
      - Annualized covariance matrix (Sigma)
      - Correlation matrix
    Returns a dictionary with pandas dataframes/matrices converted to serializable formats.
    """
    tickers = list(ETF_TICKER_MAPPING.values())
    asset_keys = list(ETF_TICKER_MAPPING.keys())
    
    logger.info(f"Downloading historical data for ETFs: {ETF_TICKER_MAPPING} for period: {period}")
    
    try:
        # Download prices
        data = yf.download(tickers, period=period, progress=False)
        
        # yfinance can return a MultiIndex if multiple columns, or single index.
        # We extract the 'Close' or 'Adj Close' price.
        if "Adj Close" in data.columns:
            prices = data["Adj Close"]
        elif "Close" in data.columns:
            prices = data["Close"]
        else:
            # If data is a Series (only 1 ticker downloaded, which shouldn't happen here)
            prices = data
            
        # If columns are MultiIndex, clean them
        if isinstance(prices.columns, pd.MultiIndex):
            prices.columns = prices.columns.get_level_values(-1)
            
        # Reorder/rename columns to match our asset names
        # Map ticker -> asset_name
        ticker_to_asset = {v: k for k, v in ETF_TICKER_MAPPING.items()}
        prices = prices.rename(columns=ticker_to_asset)
        
        # Keep only the columns we mapped
        prices = prices[asset_keys]
        
        # Handle missing data (forward fill, then backward fill for any leading NaNs)
        prices = prices.ffill().bfill()
        
        # Calculate daily returns
        daily_returns = prices.pct_change().dropna()
        
        # Annualized expected returns (historical mean * 252)
        ann_returns = daily_returns.mean() * 252
        
        # Annualized covariance matrix (Ledoit-Wolf shrinkage)
        lw = LedoitWolf().fit(daily_returns.values)
        cov_matrix = pd.DataFrame(lw.covariance_ * 252, index=daily_returns.columns, columns=daily_returns.columns)
        
        # Correlation matrix
        corr_matrix = daily_returns.corr()
        
        # Convert to serializable dict
        result = {
            "assets": asset_keys,
            "tickers": {k: v for k, v in ETF_TICKER_MAPPING.items()},
            "expected_returns": ann_returns.to_dict(),
            "covariance": cov_matrix.to_dict(),
            "correlation": corr_matrix.to_dict(),
            "raw_returns": daily_returns.to_dict(orient="list"),
            "success": True
        }
        logger.info("Successfully fetched and processed historical market data.")
        return result
        
    except Exception as e:
        logger.error(f"Failed to fetch market data: {e}. Generating synthetic backup data.")
        return generate_synthetic_data(asset_keys)

# ── Regime-conditional covariance ─────────────────────────────────────────────
# The detected market regime (from VIX) already scales risk-aversion, but the
# covariance matrix Σ — which drives the prior returns, the Black-Litterman
# posterior, the optimizer, the efficient frontier, and the Monte-Carlo risk
# metrics — is otherwise a single static full-sample estimate. That is internally
# inconsistent: in a crisis the model becomes cautious yet still believes assets
# diversify like in calm times, even though correlations empirically converge toward
# 1 during drawdowns. The blend below pulls Σ toward a crisis covariance by an amount
# α that rises with the regime, so the whole pipeline reflects the regime it detects.

# How much weight to put on the stress covariance, by regime.
_REGIME_STRESS_ALPHA = {
    "CRISIS": 0.75,
    "ELEVATED_RISK": 0.45,
    "NORMAL": 0.15,
    "LOW_VOL": 0.0,
}
# Volatilities spike in crises; scale the long-run vols by this when building Σ_stress.
_STRESS_VOL_MULTIPLIER = 1.6


def _nearest_psd_correlation(corr: np.ndarray) -> np.ndarray:
    """Floor negative eigenvalues to make a symmetric matrix positive semi-definite,
    then renormalize the diagonal back to 1 so it is a valid correlation matrix."""
    corr = np.nan_to_num((corr + corr.T) / 2.0, nan=0.0)
    vals, vecs = np.linalg.eigh(corr)
    vals = np.clip(vals, 1e-8, None)
    psd = vecs @ np.diag(vals) @ vecs.T
    d = np.sqrt(np.clip(np.diag(psd), 1e-12, None))
    psd = psd / np.outer(d, d)
    np.fill_diagonal(psd, 1.0)
    return np.clip(psd, -0.999, 0.999)


def _crisis_correlation(assets: list) -> np.ndarray:
    """Estimate the correlation structure assets exhibit in crises, from the historical
    stress scenario shock vectors (each scenario = one joint crisis observation)."""
    from app.stress_test import HISTORICAL_STRESS_SCENARIOS
    rows = [[float(s["shocks"].get(a, 0.0)) for a in assets] for s in HISTORICAL_STRESS_SCENARIOS]
    S = np.array(rows)  # (n_scenarios, n_assets)
    if S.shape[0] < 3:
        return np.eye(len(assets))
    corr = np.corrcoef(S, rowvar=False)
    np.fill_diagonal(corr, 1.0)
    return _nearest_psd_correlation(corr)


def regime_blended_covariance(
    covariance_dict: Dict[str, Dict[str, float]],
    regime: str,
    alpha: float = None,
) -> Dict[str, Dict[str, float]]:
    """Blend the long-run covariance with a crisis covariance by an amount set by the
    market regime:  Σ_used = (1−α)·Σ_long + α·Σ_stress.

    Σ_stress keeps each asset's long-run volatility scaled up by _STRESS_VOL_MULTIPLIER,
    but replaces the calm-market correlations with the crisis correlations estimated from
    historical drawdowns. Both inputs are PSD so the convex blend is PSD. α=0 returns the
    input unchanged (LOW_VOL / unknown regime), so this is safe and a no-op when calm.
    """
    if alpha is None:
        alpha = _REGIME_STRESS_ALPHA.get((regime or "NORMAL").upper(), 0.15)
    if alpha <= 0.0:
        return covariance_dict

    assets = list(covariance_dict.keys())
    n = len(assets)
    Sigma_long = np.array([[covariance_dict[a1][a2] for a2 in assets] for a1 in assets])

    vols = np.sqrt(np.clip(np.diag(Sigma_long), 1e-12, None))
    stress_vols = vols * _STRESS_VOL_MULTIPLIER
    corr_crisis = _crisis_correlation(assets)
    Sigma_stress = np.outer(stress_vols, stress_vols) * corr_crisis

    Sigma_blend = (1.0 - alpha) * Sigma_long + alpha * Sigma_stress
    logger.info(f"Regime-blended covariance: regime={regime}, alpha={alpha:.2f} "
                f"(stress weight on Σ).")
    return {a1: {a2: float(Sigma_blend[i, j]) for j, a2 in enumerate(assets)}
            for i, a1 in enumerate(assets)}


def generate_synthetic_data(assets: list) -> dict:
    """
    Generates realistic synthetic financial data if yfinance fails.
    """
    np.random.seed(42)
    n_assets = len(assets)
    n_days = 252 * 5  # 5 years of daily data
    
    # Define typical annualized returns and volatilities
    # KR_STOCK, GLOBAL_STOCK, KR_BOND, GLOBAL_BOND, ALTERNATIVE
    typical_returns = [0.07, 0.09, 0.035, 0.03, 0.06]
    typical_vols = [0.18, 0.15, 0.05, 0.04, 0.12]
    
    # Generate daily returns using multivariate normal distribution
    # Define a target correlation matrix
    corr = np.array([
        [1.0, 0.6, -0.1, -0.1, 0.4],  # KR_STOCK
        [0.6, 1.0, -0.15, -0.1, 0.45], # GLOBAL_STOCK
        [-0.1, -0.15, 1.0, 0.7, -0.05], # KR_BOND
        [-0.1, -0.1, 0.7, 1.0, -0.02], # GLOBAL_BOND
        [0.4, 0.45, -0.05, -0.02, 1.0] # ALTERNATIVE
    ])
    
    cov = np.zeros((n_assets, n_assets))
    for i in range(n_assets):
        for j in range(n_assets):
            cov[i, j] = corr[i, j] * typical_vols[i] * typical_vols[j]
            
    # Convert annual covariance to daily covariance
    daily_cov = cov / 252
    daily_means = np.array(typical_returns) / 252
    
    # Simulate returns
    simulated_returns = np.random.multivariate_normal(daily_means, daily_cov, n_days)
    df_returns = pd.DataFrame(simulated_returns, columns=assets)
    
    # Re-estimate annual stats from simulated data to ensure consistency
    ann_returns = df_returns.mean() * 252
    cov_matrix = df_returns.cov() * 252
    corr_matrix = df_returns.corr()
    
    return {
        "assets": assets,
        "tickers": {k: v for k, v in ETF_TICKER_MAPPING.items()},
        "expected_returns": ann_returns.to_dict(),
        "covariance": cov_matrix.to_dict(),
        "correlation": corr_matrix.to_dict(),
        "raw_returns": df_returns.to_dict(orient="list"),
        "success": False,
        "warning": "Using synthetic data due to download failure."
    }
