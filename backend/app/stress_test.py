import logging
import numpy as np
from typing import Dict, List, Any
from scipy.stats import t as t_dist

logger = logging.getLogger(__name__)

def run_monte_carlo_simulation(
    weights: Dict[str, float],
    expected_returns: Dict[str, float],
    covariance_dict: Dict[str, Dict[str, float]],
    n_simulations: int = 10000,
    n_days: int = 252
) -> dict:
    """
    Runs a Monte Carlo simulation of the portfolio returns.
    
    Calculates:
      - expected_return: mean final return
      - volatility: standard deviation of final returns
      - var_95: Value at Risk at 95% confidence level
      - cvar_95: Conditional Value at Risk at 95% confidence level
      - max_drawdown_estimate: mean maximum drawdown across paths
      - simulation_paths: List of 100 sample paths for UI plotting
      - histogram_bins: Bins and frequencies for plotting the distribution
      
    Returns:
      - results_dict: JSON-serializable dictionary
    """
    assets = list(weights.keys())
    n = len(assets)
    
    # 1. Convert weights, returns, cov to numpy
    w = np.array([weights[a] for a in assets])
    mu = np.array([expected_returns[a] for a in assets])
    
    Sigma = np.zeros((n, n))
    for i, a1 in enumerate(assets):
        for j, a2 in enumerate(assets):
            Sigma[i, j] = covariance_dict[a1][a2]
            
    # Calculate portfolio annualized return and volatility
    port_ann_return = np.dot(w, mu)
    port_ann_vol = np.sqrt(np.dot(w, np.dot(Sigma, w)))
    
    # Avoid zero-volatility edge cases
    port_ann_vol = max(port_ann_vol, 1e-4)
    
    # Daily parameters
    dt = 1.0 / n_days
    mu_daily = port_ann_return / n_days
    vol_daily = port_ann_vol / np.sqrt(n_days)
    
    # 2. Simulate 10,000 paths of daily returns (geometric brownian motion)
    # Drift = (mu - 0.5 * sigma^2) * dt, Volatility component = sigma * sqrt(dt) * Z
    drift_daily = (port_ann_return - 0.5 * (port_ann_vol ** 2)) * dt
    vol_component = port_ann_vol * np.sqrt(dt)
    
    # Z ~ Student-t for fat tails (typical of equity markets)
    rng = np.random.default_rng(42)
    df_t = 5  # Standard for equity markets
    Z = t_dist.rvs(df=df_t, size=(n_simulations, n_days), random_state=rng)
    # Normalize to unit variance (t-distribution has variance df/(df-2))
    Z = Z / np.sqrt(df_t / (df_t - 2))
    
    # Daily log returns
    daily_log_returns = drift_daily + vol_component * Z
    
    # Cumulative log returns: size (n_simulations, n_days)
    cum_log_returns = np.cumsum(daily_log_returns, axis=1)
    
    # Price paths starting from 1.0: size (n_simulations, n_days + 1)
    price_paths = np.ones((n_simulations, n_days + 1))
    price_paths[:, 1:] = np.exp(cum_log_returns)
    
    # Final returns (T = 1 year)
    final_returns = price_paths[:, -1] - 1.0
    
    # 3. Calculate Risk Metrics
    # Expected Return
    expected_mc_return = float(np.mean(final_returns))
    # Volatility of final returns
    mc_vol = float(np.std(final_returns))
    
    # VaR 95% (5th percentile of final returns)
    var_95 = float(np.percentile(final_returns, 5))
    
    # CVaR 95% (mean of returns below the VaR 95% threshold)
    cvar_95 = float(np.mean(final_returns[final_returns <= var_95]))
    
    # Max Drawdown for each path
    # Peak at each point in time
    peaks = np.maximum.accumulate(price_paths, axis=1)
    drawdowns = (price_paths - peaks) / peaks
    max_drawdowns = np.min(drawdowns, axis=1) # The lowest value is the maximum negative drawdown
    expected_mdd = float(np.mean(max_drawdowns))
    
    # 4. Downsample paths for UI rendering (return 100 paths)
    n_sample_paths = min(100, n_simulations)
    sampled_indices = np.linspace(0, n_simulations - 1, n_sample_paths, dtype=int)
    # Convert paths to lists of returns relative to start (i.e. path - 1.0)
    # We round values for cleaner payload size
    sample_paths = [
        [round(float(val - 1.0), 4) for val in price_paths[idx]]
        for idx in sampled_indices
    ]
    
    # 5. Create Histogram Data for Final Returns Distribution
    counts, bin_edges = np.histogram(final_returns, bins=50, density=True)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
    histogram_data = [
        {"x": round(float(bin_centers[i]), 4), "y": round(float(counts[i]), 4)}
        for i in range(len(counts))
    ]
    
    logger.info("Successfully finished Monte Carlo stress test simulation.")
    return {
        "expected_return": expected_mc_return,
        "volatility": mc_vol,
        "var_95": var_95,
        "cvar_95": cvar_95,
        "max_drawdown_estimate": expected_mdd,
        "simulation_paths": sample_paths,
        "histogram_data": histogram_data
    }

def run_historical_stress_test(
    weights: Dict[str, float]
) -> List[Dict[str, Any]]:
    """
    Tests the portfolio against historical crisis scenarios.
    Returns a list of scenario results.
    """
    assets = list(weights.keys())
    w = np.array([weights[a] for a in assets])
    
    # Historical drawdown vectors (approximate peak-to-trough for each asset class)
    scenarios = [
        {
            "name": "COVID-19 Crash (2020.03)",
            "name_kr": "코로나19 팬데믹 폭락 (2020.03)",
            "shocks": {"KR_STOCK": -0.35, "GLOBAL_STOCK": -0.34, "KR_BOND": 0.02, "GLOBAL_BOND": 0.03, "ALTERNATIVE": -0.28}
        },
        {
            "name": "Global Financial Crisis (2008)",
            "name_kr": "글로벌 금융위기 (2008)",
            "shocks": {"KR_STOCK": -0.55, "GLOBAL_STOCK": -0.50, "KR_BOND": 0.08, "GLOBAL_BOND": 0.10, "ALTERNATIVE": -0.40}
        },
        {
            "name": "Rate Hike Cycle (2022)",
            "name_kr": "급격한 금리인상 사이클 (2022)",
            "shocks": {"KR_STOCK": -0.25, "GLOBAL_STOCK": -0.20, "KR_BOND": -0.10, "GLOBAL_BOND": -0.15, "ALTERNATIVE": -0.30}
        },
        {
            "name": "Taper Tantrum (2013)",
            "name_kr": "테이퍼 탠트럼 (2013)",
            "shocks": {"KR_STOCK": -0.08, "GLOBAL_STOCK": -0.05, "KR_BOND": -0.06, "GLOBAL_BOND": -0.08, "ALTERNATIVE": -0.12}
        },
        {
            "name": "Eurozone Debt Crisis (2011)",
            "name_kr": "유럽 재정위기 (2011)",
            "shocks": {"KR_STOCK": -0.18, "GLOBAL_STOCK": -0.20, "KR_BOND": 0.03, "GLOBAL_BOND": 0.05, "ALTERNATIVE": -0.15}
        }
    ]
    
    results = []
    for scenario in scenarios:
        shock_vec = np.array([scenario["shocks"].get(a, 0.0) for a in assets])
        portfolio_impact = float(np.dot(w, shock_vec))
        results.append({
            "name": scenario["name"],
            "name_kr": scenario["name_kr"],
            "portfolio_return": round(portfolio_impact, 4),
            "asset_impacts": {a: round(scenario["shocks"].get(a, 0.0), 4) for a in assets}
        })
    
    return results
