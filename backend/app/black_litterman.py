import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any

logger = logging.getLogger(__name__)


def omega_idzorek(
    P: np.ndarray,
    Q: np.ndarray,
    Sigma: np.ndarray,
    tau: float,
    Pi: np.ndarray,
    lam: float,
    confidences: np.ndarray,
) -> np.ndarray:
    """Idzorek (2007) view-uncertainty: pick each view's Ω_kk so the posterior tilt away
    from the market portfolio equals the analyst's stated confidence (0..1) times the
    full-confidence tilt. Returns the Ω diagonal. Falls back to the proportional
    He–Litterman uncertainty per view on any numerical failure.
    """
    from scipy.optimize import minimize_scalar
    tauSigma = tau * Sigma
    inv_tauSigma = np.linalg.inv(tauSigma)
    omegas = []
    for k in range(len(Q)):
        Pk = P[k:k + 1]          # 1 x n
        Qk = float(Q[k])
        c = float(np.clip(confidences[k], 0.01, 0.99))
        try:
            # Departure of weights from market at 100% confidence (Ω→0 for this view).
            denom = float(np.asarray(Pk @ tauSigma @ Pk.T).item())
            pk_pi = float(np.asarray(Pk @ Pi).item())
            dmu_100 = (tauSigma @ Pk.T).flatten() / denom * (Qk - pk_pi)
            w_dep_100 = (1.0 / lam) * np.linalg.solve(Sigma, dmu_100)
            target_dep = c * w_dep_100

            def w_dep(omega_k: float) -> np.ndarray:
                ok = max(omega_k, 1e-10)
                post_prec = inv_tauSigma + (Pk.T @ Pk) / ok
                mu_post = np.linalg.solve(post_prec, inv_tauSigma @ Pi + (Pk.T.flatten() * Qk) / ok)
                return (1.0 / lam) * np.linalg.solve(Sigma, mu_post - Pi)

            res = minimize_scalar(
                lambda o: float(np.sum((w_dep(o) - target_dep) ** 2)),
                bounds=(1e-8, 10.0), method="bounded",
            )
            omegas.append(max(1e-8, float(res.x)))
        except Exception:
            # Proportional fallback for this view.
            var_view = float(Pk @ Sigma @ Pk.T)
            omegas.append(max(1e-8, tau * var_view * ((1.0 - c) / c)))
    return np.array(omegas)


def run_black_litterman(
    market_weights: Dict[str, float],
    covariance_dict: Dict[str, Dict[str, float]],
    views: List[Dict[str, Any]],
    risk_free_rate: float,
    risk_aversion: Optional[float] = None,
    tau: Optional[float] = None,
    omega_method: str = "proportional"
) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, Dict[str, float]]]:
    """
    Computes Black-Litterman posterior expected returns and covariance matrix.
    
    Parameters:
      - market_weights: Dict of asset -> weight (sums to 1.0)
      - covariance_dict: Nested dict representing covariance matrix Sigma (annualized)
      - views: List of parsed LLM views (absolute/relative)
      - risk_free_rate: Decimal risk-free rate (e.g. 0.035)
      - risk_aversion: Risk aversion coefficient lambda (default: dynamically estimated)
      - tau: Uncertainty scaling parameter (default: Bayesian 1/T estimate)
      
    Returns:
      - prior_returns: Dict of asset -> market equilibrium expected total return
      - posterior_returns: Dict of asset -> posterior expected total return
      - posterior_covariance: Nested dict of the posterior covariance matrix (Sigma_BL)
    """
    assets = list(market_weights.keys())
    n = len(assets)
    asset_to_idx = {asset: i for i, asset in enumerate(assets)}
    
    # 1. Convert inputs to numpy arrays
    w = np.array([market_weights[a] for a in assets])
    
    # Covariance Matrix Sigma
    Sigma = np.zeros((n, n))
    for i, a1 in enumerate(assets):
        for j, a2 in enumerate(assets):
            Sigma[i, j] = covariance_dict[a1][a2]

    # 2. Dynamically estimate risk aversion if not provided
    if risk_aversion is None:
        # Estimate lambda from market implied Sharpe ratio
        # lambda = (mu_m - rf) / sigma_m^2
        sigma_m_sq = float(np.dot(w, np.dot(Sigma, w)))
        if sigma_m_sq > 1e-8:
            # Use a reasonable market excess return estimate (historical equity premium ~5-7%)
            market_excess_return = 0.06  # 6% equity premium as base
            risk_aversion = market_excess_return / sigma_m_sq
        else:
            risk_aversion = 2.5  # fallback
        logger.info(f"Dynamically estimated risk aversion lambda = {risk_aversion:.4f}")

    # Estimate tau using Bayesian approach if not provided
    if tau is None:
        # Meucci (2010) approach: tau = 1/T where T is the number of observations
        # We approximate T from 5 years of daily data
        tau = 1.0 / (252 * 5)
        logger.info(f"Using Bayesian-estimated tau = {tau:.6f}")

    # Market Implied Excess Returns (Pi = lambda * Sigma * w)
    Pi = risk_aversion * np.dot(Sigma, w)
    
    # If no views are provided, posterior excess returns = Pi
    if not views:
        logger.info("No views provided. Posterior returns equal market equilibrium returns.")
        post_excess = Pi
        post_Sigma = Sigma + tau * Sigma # or just Sigma
        
        # Convert total returns (excess + rf)
        post_total = post_excess + risk_free_rate
        
        # Return dicts
        prior_returns_dict = {assets[i]: float(post_total[i]) for i in range(n)}
        post_returns_dict = {assets[i]: float(post_total[i]) for i in range(n)}
        post_cov_dict = {a1: {a2: float(post_Sigma[i, j]) for j, a2 in enumerate(assets)} for i, a1 in enumerate(assets)}
        return prior_returns_dict, post_returns_dict, post_cov_dict

    # 3. Construct P, Q, and Omega matrices for views
    k = len(views)
    P = np.zeros((k, n))
    Q = np.zeros(k)
    Omega_diag = []
    confidences = []

    for idx, view in enumerate(views):
        confidence = max(0.001, min(0.999, view["confidence"])) # Clamp to avoid division by zero/negative
        confidences.append(confidence)
        
        if view["view_type"] == "absolute":
            asset = view["asset"]
            asset_idx = asset_to_idx[asset]
            P[idx, asset_idx] = 1.0
            # Q represents excess return.
            if view.get("is_active_tilt", False):
                # Active view: excess expected return = prior implied excess return + signed tilt.
                Q[idx] = Pi[asset_idx] + view["expected_return"]
            else:
                # User total return input: excess expected return = total expected return - risk-free rate.
                Q[idx] = view["expected_return"] - risk_free_rate
            
        elif view["view_type"] == "relative":
            asset1 = view["asset1"]
            asset2 = view["asset2"]
            idx1 = asset_to_idx[asset1]
            idx2 = asset_to_idx[asset2]
            P[idx, idx1] = 1.0
            P[idx, idx2] = -1.0
            # Q is the relative outperformance difference, which is already an excess measure
            Q[idx] = view["outperformance"]
            
        # Compute Omega_jj = tau * p_j * Sigma * p_j^T * (1 - c_j) / c_j
        p_j = P[idx]
        variance_prior_view = np.dot(p_j, np.dot(Sigma, p_j))
        
        # Scale uncertainty: high confidence -> small Omega (low variance of view)
        # low confidence -> large Omega (high variance of view)
        omega_j = tau * variance_prior_view * ((1.0 - confidence) / confidence)
        # Add a tiny epsilon to prevent complete singularity if confidence is close to 1.0
        omega_j = max(1e-8, omega_j)
        Omega_diag.append(omega_j)

    # Optionally replace the proportional Ω with Idzorek (2007) confidence-tilt matching.
    if omega_method == "idzorek":
        try:
            Omega_diag = omega_idzorek(P, Q, Sigma, tau, Pi, risk_aversion, np.array(confidences))
            logger.info("Using Idzorek confidence-calibrated Omega.")
        except Exception as e:
            logger.warning(f"Idzorek Omega failed ({e}); falling back to proportional Omega.")

    Omega = np.diag(Omega_diag)
    
    # 4. Compute Posterior Excess Returns
    # Formula: mu_bl = [ (tau*Sigma)^-1 + P^T * Omega^-1 * P ]^-1 * [ (tau*Sigma)^-1 * Pi + P^T * Omega^-1 * Q ]
    try:
        inv_tau_Sigma = np.linalg.inv(tau * Sigma)
        inv_Omega = np.linalg.inv(Omega)
        
        # Intermediate term: [ (tau*Sigma)^-1 + P^T * Omega^-1 * P ]
        post_precision = inv_tau_Sigma + np.dot(P.T, np.dot(inv_Omega, P))
        post_covariance_excess = np.linalg.inv(post_precision)
        
        # Right hand side term: [ (tau*Sigma)^-1 * Pi + P^T * Omega^-1 * Q ]
        rhs = np.dot(inv_tau_Sigma, Pi) + np.dot(P.T, np.dot(inv_Omega, Q))
        
        # Posterior excess returns
        post_excess = np.dot(post_covariance_excess, rhs)
        
        # Posterior covariance matrix (including the scaling variance from prior)
        # Sigma_bl = Sigma + [ (tau*Sigma)^-1 + P^T * Omega^-1 * P ]^-1
        post_Sigma = Sigma + post_covariance_excess
        
    except np.linalg.LinAlgError as e:
        logger.error(f"Matrix inversion failed in Black-Litterman calculations: {e}. Falling back to default prior.")
        post_excess = Pi
        post_Sigma = Sigma + tau * Sigma
        
    # Convert excess returns back to total expected returns: R_bl = mu_bl + risk_free_rate
    prior_total = Pi + risk_free_rate
    post_total = post_excess + risk_free_rate
    
    # Map back to dictionaries
    prior_returns_dict = {assets[i]: float(prior_total[i]) for i in range(n)}
    post_returns_dict = {assets[i]: float(post_total[i]) for i in range(n)}
    post_cov_dict = {a1: {a2: float(post_Sigma[i, j]) for j, a2 in enumerate(assets)} for i, a1 in enumerate(assets)}
    
    logger.info("Successfully executed Black-Litterman posterior calculation.")
    return prior_returns_dict, post_returns_dict, post_cov_dict
