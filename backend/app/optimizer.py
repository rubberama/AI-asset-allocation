import logging
import numpy as np
from scipy.optimize import minimize
from scipy.cluster.hierarchy import linkage, leaves_list
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

def optimize_portfolio(
    strategy: str,
    expected_returns: Dict[str, float],
    covariance_dict: Dict[str, Dict[str, float]],
    risk_free_rate: float,
    risk_aversion: float = 2.5,
    benchmark_weights: Dict[str, float] = None,
    max_deviation: float = None
) -> Dict[str, float]:
    """
    Directs the portfolio optimization based on the selected strategy.
    
    Returns:
      - weights: Dict of asset -> weight (sums to 1.0)
    """
    assets = list(expected_returns.keys())
    n = len(assets)
    
    # Convert inputs to numpy
    mu = np.array([expected_returns[a] for a in assets])
    
    Sigma = np.zeros((n, n))
    for i, a1 in enumerate(assets):
        for j, a2 in enumerate(assets):
            Sigma[i, j] = covariance_dict[a1][a2]
            
    strategy = strategy.lower().strip()
    
    if strategy == "markowitz":
        weights = run_markowitz_mvo(mu, Sigma, risk_free_rate, assets, benchmark_weights, max_deviation)
    elif strategy == "risk_parity":
        weights = run_risk_parity(Sigma)
    elif strategy == "hrp":
        weights = run_hrp(Sigma, assets)
    elif strategy == "resampled":
        weights = run_resampled_weights(mu, Sigma, risk_free_rate, assets, benchmark_weights, max_deviation)
    elif strategy == "ensemble":
        # Average the three core optimizers to reduce single-model/estimation risk.
        w_mvo = run_markowitz_mvo(mu, Sigma, risk_free_rate, assets, benchmark_weights, max_deviation)
        w_rp = run_risk_parity(Sigma)
        w_hrp = run_hrp(Sigma, assets)
        weights = (w_mvo + w_rp + w_hrp) / 3.0
        weights = weights / np.sum(weights)
    else:
        logger.warning(f"Unknown optimization strategy: {strategy}. Defaulting to Equal Weights.")
        weights = np.ones(n) / n

    return {assets[i]: float(weights[i]) for i in range(n)}


def run_resampled_weights(
    mu: np.ndarray,
    Sigma: np.ndarray,
    rf: float,
    assets: List[str],
    benchmark_weights: Dict[str, float] = None,
    max_deviation: float = None,
    n_resamples: int = 50,
    n_obs: int = 252,
) -> np.ndarray:
    """Michaud resampled efficiency: bootstrap return/cov estimates from the input
    distribution, re-run max-Sharpe each time, and average the weights. This curbs the
    mean-variance optimizer's tendency to over-fit noisy point estimates."""
    n = len(mu)
    rng = np.random.default_rng(42)
    acc = np.zeros(n)
    count = 0
    for _ in range(n_resamples):
        try:
            sample = rng.multivariate_normal(mu, Sigma, size=n_obs)
            mu_s = sample.mean(axis=0)
            Sigma_s = np.cov(sample, rowvar=False)
            w = run_markowitz_mvo(mu_s, Sigma_s, rf, assets, benchmark_weights, max_deviation)
            if np.all(np.isfinite(w)):
                acc += w
                count += 1
        except Exception:
            continue
    if count == 0:
        logger.warning("Resampling produced no valid draws; using equal weights.")
        return np.ones(n) / n
    w = acc / count
    return w / np.sum(w)

def run_markowitz_mvo(
    mu: np.ndarray,
    Sigma: np.ndarray,
    rf: float,
    assets: List[str] = None,
    benchmark_weights: Dict[str, float] = None,
    max_deviation: float = None
) -> np.ndarray:
    """
    Maximizes the Sharpe Ratio of the portfolio.
    Minimize negative Sharpe Ratio: - (w^T * mu - rf) / sqrt(w^T * Sigma * w)
    Subject to: sum(w) = 1, w >= 0
    And optional bounds: max(0, w_bench - max_deviation) <= w <= min(1, w_bench + max_deviation)
    """
    n = len(mu)
    
    # Objective function: Negative Sharpe Ratio
    def objective(w):
        port_return = np.dot(w, mu)
        port_vol = np.sqrt(np.dot(w, np.dot(Sigma, w)))
        if port_vol < 1e-8:
            return 0
        return - (port_return - rf) / port_vol
        
    # Constraints: weights sum to 1
    constraints = {"type": "eq", "fun": lambda w: np.sum(w) - 1.0}
    
    # Bounds calculation
    if max_deviation is not None and benchmark_weights is not None and assets is not None:
        w_bench = np.array([benchmark_weights.get(a, 0.0) for a in assets])
        bounds = tuple(
            (max(0.0, float(w_bench[i] - max_deviation)), min(1.0, float(w_bench[i] + max_deviation)))
            for i in range(n)
        )
    else:
        # Default Bounds: 0 <= w_i <= 1
        bounds = tuple((0.0, 1.0) for _ in range(n))
    
    # Initial guess: equal weights or benchmark weights if available and valid
    if benchmark_weights is not None and assets is not None:
        w0 = np.array([benchmark_weights.get(a, 0.0) for a in assets])
        # Ensure it sums to 1.0
        if np.abs(np.sum(w0) - 1.0) > 1e-4:
            w0 = np.ones(n) / n
    else:
        w0 = np.ones(n) / n
    
    result = minimize(
        objective,
        w0,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"maxiter": 1000}
    )
    
    if not result.success:
        logger.error(f"Markowitz MVO optimization failed: {result.message}. Using equal weights fallback.")
        # If optimization failed, check if the benchmark weights are valid under bounds (they always are)
        if benchmark_weights is not None and assets is not None:
            fallback = np.array([benchmark_weights.get(a, 0.0) for a in assets])
            if np.abs(np.sum(fallback) - 1.0) < 1e-4:
                return fallback
        return np.ones(n) / n
        
    return result.x

def run_efficient_frontier(
    mu: np.ndarray,
    Sigma: np.ndarray,
    assets: List[str],
    benchmark_weights: Dict[str, float],
    max_deviation: float,
    rf: float
) -> List[Dict[str, Any]]:
    """
    Calculates 20 optimal portfolios along the Efficient Frontier
    by minimizing portfolio variance for target expected return levels.
    """
    n = len(assets)
    w_bench = np.array([benchmark_weights.get(a, 0.0) for a in assets])
    
    # Calculate bounds based on max_deviation
    if max_deviation is not None and max_deviation < 1.0:
        bounds = tuple(
            (max(0.0, float(w_bench[i] - max_deviation)), min(1.0, float(w_bench[i] + max_deviation)))
            for i in range(n)
        )
    else:
        bounds = tuple((0.0, 1.0) for _ in range(n))
        
    # 1. Find Minimum Variance Portfolio (MVP)
    def mvp_objective(w):
        return np.dot(w, np.dot(Sigma, w))
        
    constraints_mvp = {"type": "eq", "fun": lambda w: np.sum(w) - 1.0}
    
    # Starting point: benchmark weights (always feasible)
    w0 = w_bench if np.abs(np.sum(w_bench) - 1.0) < 1e-4 else np.ones(n) / n
    
    res_mvp = minimize(mvp_objective, w0, method="SLSQP", bounds=bounds, constraints=constraints_mvp)
    if res_mvp.success:
        w_mvp = res_mvp.x
    else:
        w_mvp = w0
        
    r_min = np.dot(w_mvp, mu)
    
    # 2. Find Maximum Return Portfolio under bounds
    def max_ret_objective(w):
        return -np.dot(w, mu)
        
    res_max = minimize(max_ret_objective, w0, method="SLSQP", bounds=bounds, constraints=constraints_mvp)
    if res_max.success:
        w_max = res_max.x
    else:
        w_max = w0
        
    r_max = np.dot(w_max, mu)
    
    # Generate linearly spaced target returns
    if np.abs(r_max - r_min) < 1e-6:
        vol = np.sqrt(np.dot(w_mvp, np.dot(Sigma, w_mvp)))
        sharpe = (r_min - rf) / vol if vol > 1e-8 else 0.0
        return [{
            "return": float(r_min),
            "volatility": float(vol),
            "sharpe": float(sharpe),
            "weights": {assets[i]: float(w_mvp[i]) for i in range(n)}
        }]
        
    target_returns = np.linspace(r_min, r_max, 20)
    frontier_points = []
    
    for r_target in target_returns:
        def target_objective(w):
            return np.dot(w, np.dot(Sigma, w))
            
        constraints = [
            {"type": "eq", "fun": lambda w: np.sum(w) - 1.0},
            {"type": "eq", "fun": lambda w: np.dot(w, mu) - r_target}
        ]
        
        res = minimize(target_objective, w_mvp, method="SLSQP", bounds=bounds, constraints=constraints)
        if res.success:
            w_opt = res.x
            vol = np.sqrt(np.dot(w_opt, np.dot(Sigma, w_opt)))
            sharpe = (r_target - rf) / vol if vol > 1e-8 else 0.0
            frontier_points.append({
                "return": float(r_target),
                "volatility": float(vol),
                "sharpe": float(sharpe),
                "weights": {assets[i]: float(w_opt[i]) for i in range(n)}
            })
            
    return sorted(frontier_points, key=lambda x: x["volatility"])


def run_risk_parity(Sigma: np.ndarray) -> np.ndarray:
    """
    Solves the convex formulation for Equal Risk Contribution:
    Minimize: 0.5 * x^T * Sigma * x - sum(ln(x_i))
    Subject to: x_i > 0
    Then normalized weights w = x / sum(x)
    """
    n = len(Sigma)
    
    def objective(x):
        # Prevent log of negative or tiny numbers
        if np.any(x <= 1e-10):
            return 1e10
        return 0.5 * np.dot(x, np.dot(Sigma, x)) - np.sum(np.log(x))
        
    # Bounds: x_i > 0
    bounds = tuple((1e-8, 10.0) for _ in range(n))
    
    # Initial guess
    x0 = np.ones(n) / n
    
    result = minimize(
        objective,
        x0,
        method="L-BFGS-B",
        bounds=bounds
    )
    
    if not result.success:
        logger.error(f"Risk Parity optimization failed: {result.message}. Using equal weights fallback.")
        return np.ones(n) / n
        
    # Normalize weights to sum to 1
    x_opt = result.x
    w_opt = x_opt / np.sum(x_opt)
    return w_opt

def run_hrp(Sigma: np.ndarray, assets: List[str]) -> np.ndarray:
    """
    Implements Hierarchical Risk Parity (HRP).
    """
    n = len(assets)
    if n <= 1:
        return np.ones(n)
        
    # 1. Compute Correlation Matrix
    vols = np.sqrt(np.diag(Sigma))
    corr = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if vols[i] * vols[j] > 1e-8:
                corr[i, j] = Sigma[i, j] / (vols[i] * vols[j])
            else:
                corr[i, j] = 0.0
    
    # 2. Compute Distance Matrix: d(i, j) = sqrt(0.5 * (1 - corr(i, j)))
    # For single linkage clustering
    dist = np.sqrt(0.5 * (1.0 - np.clip(corr, -1.0, 1.0)))
    
    # Extract upper triangle condensed distance vector for scipy linkage
    from scipy.spatial.distance import squareform
    # Avoid zero distances on diagonal
    np.fill_diagonal(dist, 0.0)
    condensed_dist = squareform(dist, checks=False)
    
    # 3. Hierarchical Clustering (Single Linkage)
    link = linkage(condensed_dist, method="single")
    
    # 4. Quasi-Diagonalization (Sort leaves)
    sort_indices = leaves_list(link)
    
    # 5. Recursive Bisection
    weights = np.ones(n)
    
    # Helper recursive function
    def recurse_bisection(w_vector: np.ndarray, indices: np.ndarray):
        if len(indices) <= 1:
            return
            
        # Split index list into two halves
        mid = len(indices) // 2
        left_idx = indices[:mid]
        right_idx = indices[mid:]
        
        # Calculate variance of left and right clusters
        var_left = get_cluster_var(Sigma, left_idx)
        var_right = get_cluster_var(Sigma, right_idx)
        
        # Calculate split factor alpha (weights allocations based on inverse variance)
        if var_left + var_right > 1e-12:
            alpha = 1.0 - (var_left / (var_left + var_right))
        else:
            alpha = 0.5
            
        # Update weights
        w_vector[left_idx] *= alpha
        w_vector[right_idx] *= (1.0 - alpha)
        
        # Recurse
        recurse_bisection(w_vector, left_idx)
        recurse_bisection(w_vector, right_idx)
        
    recurse_bisection(weights, sort_indices)
    
    # Normalize final weights
    return weights / np.sum(weights)

def get_cluster_var(Sigma: np.ndarray, cluster_indices: np.ndarray) -> float:
    """
    Computes the variance of a sub-portfolio using inverse-variance weights.
    """
    # Extract sub-covariance matrix
    sub_Sigma = Sigma[cluster_indices][:, cluster_indices]
    
    # Calculate inverse-variance weights
    diag = np.diag(sub_Sigma)
    inv_var = 1.0 / np.clip(diag, 1e-8, None)
    w = inv_var / np.sum(inv_var)
    
    # Portfolio variance
    return float(np.dot(w, np.dot(sub_Sigma, w)))
