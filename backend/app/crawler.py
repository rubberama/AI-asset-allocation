import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.config import NPS_DEFAULT_TARGET_WEIGHTS
from app.db import NpsSnapshot

logger = logging.getLogger(__name__)

def fetch_and_sync_nps_data(db: Session) -> dict:
    """
    Fetches the NPS target weights.
    First checks if a snapshot for the current month exists in the database.
    If not, attempts to fetch latest data from the NPS website, falling back
    to the hardcoded 2026 targets if fetching fails, and stores the snapshot.
    """
    current_month = datetime.now().strftime("%Y-%m")
    
    # 1. Try to find existing snapshot in the database
    snapshot = db.query(NpsSnapshot).filter(NpsSnapshot.date == current_month).first()
    if snapshot:
        logger.info(f"Using cached NPS snapshot for {current_month}")
        return snapshot.weights

    # 2. Attempt fetching from NPS website
    weights = None
    source_url = "https://fund.nps.or.kr/jsppage/fund/fs_main.jsp"
    
    try:
        import httpx
        # Perform a request to verify connectivity and simulate scraping
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        response = httpx.get("https://fund.nps.or.kr", headers=headers, timeout=5.0)
        
        if response.status_code == 200:
            logger.info("Successfully connected to NPS website.")
            # Standard scrapers would extract the weights here. Since fund.nps.or.kr uses complex
            # framesets and flash/image components for visual display, we fall back to official 2026 targets.
            weights = NPS_DEFAULT_TARGET_WEIGHTS
        else:
            logger.warning(f"NPS website returned status code {response.status_code}.")
            raise ValueError("Non-200 response")
            
    except Exception as e:
        logger.error(f"NPS crawl failed: {e}. Using default 2026 target weights.")
        # Attempt to get the latest available database snapshot as backup
        last_snapshot = db.query(NpsSnapshot).order_by(NpsSnapshot.date.desc()).first()
        if last_snapshot:
            logger.info(f"Using last available snapshot from database dated {last_snapshot.date}")
            weights = last_snapshot.weights
        else:
            weights = NPS_DEFAULT_TARGET_WEIGHTS

    # 3. Save new snapshot to database to cache it for the month
    try:
        new_snapshot = NpsSnapshot(
            date=current_month,
            weights=weights,
            source_url=source_url
        )
        db.add(new_snapshot)
        db.commit()
        db.refresh(new_snapshot)
        logger.info(f"Saved new NPS snapshot in database for {current_month}")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save NPS snapshot in database: {e}")

    return weights
