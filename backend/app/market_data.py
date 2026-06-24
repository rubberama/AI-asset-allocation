import logging
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
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
