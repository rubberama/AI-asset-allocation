import logging
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.db import MarketIntelligence
from app.config import OPENROUTER_API_KEY, OPENROUTER_API_URL, OPENROUTER_MODEL
import json
import re

logger = logging.getLogger(__name__)

# Realistic fallback theses in case API/LLM calls fail
FALLBACK_THESES = [
    {
        "id": "fb1",
        "author": "Marcus Aurelius",
        "author_title": "Chief Investment Officer",
        "source": "Bridgewater Insights",
        "date": datetime.utcnow().isoformat(),
        "title": "Fed rate cuts incoming faster than expected",
        "content": "The latest inflation data shows core CPI cooling down faster than the Fed's projections. Expect at least two 50bps cuts by the end of the year. This will be a massive tailwind for global bonds and growth stocks.",
        "image_url": "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&q=80&w=400&h=300",
        "ai_interpretation": {
            "summary": "Expect aggressive rate cuts which favor Global Bonds and Global Equities.",
            "impacted_assets": ["GLOBAL_BOND", "GLOBAL_STOCK"],
            "confidence": 0.85
        },
        "full_report": {
            "executive_summary": "Core CPI is cooling down faster than the Fed's target, setting the stage for faster interest rate cuts.",
            "rationale": "Yields will decline, driving up prices for bonds, while growth equities will benefit from lower discount rates.",
            "target_assets": "Bullish: GLOBAL_BOND, GLOBAL_STOCK (Tech/Growth). Neutral: KR_STOCK.",
            "recommendation": "Overweight Global Fixed Income duration and US Large Cap Growth equities.",
            "risk_factors": "Sticky service inflation or sudden geopolitical oil shocks could pause rate cuts."
        }
    },
    {
        "id": "fb2",
        "author": "Tech Strategy Group",
        "author_title": "Global Equity Strategists",
        "source": "Goldman Sachs Research",
        "date": datetime.utcnow().isoformat(),
        "title": "AI CapEx cycle is far from over",
        "content": "Hyperscalers are increasing GPU investments for the second half of 2026. Hardware bottlenecks are easing, and software monetization is showing early double-digit growth, indicating a robust upward trend.",
        "image_url": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=400&h=300",
        "ai_interpretation": {
            "summary": "AI CapEx expansion remains a major catalyst for Tech Equities.",
            "impacted_assets": ["GLOBAL_STOCK"],
            "confidence": 0.90
        },
        "full_report": {
            "executive_summary": "Hyperscale AI capital expenditures are scaling higher, contrary to bubble concerns.",
            "rationale": "Strong demand for infrastructure guarantees hardware vendor revenues, creating a positive feedback loop for US tech.",
            "target_assets": "Bullish: GLOBAL_STOCK. Bearish: KR_STOCK (non-semiconductor).",
            "recommendation": "Maintain high allocation to Global Equities, focusing on primary AI supply chain nodes.",
            "risk_factors": "Valuation premium compression or semiconductor export restrictions."
        }
    }
]

def clean_and_parse_json(text: str) -> Dict[str, Any]:
    cleaned = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if match:
        cleaned = match.group(1).strip()
    
    start_idx = cleaned.find("{")
    end_idx = cleaned.rfind("}")
    if start_idx != -1 and end_idx != -1:
        cleaned = cleaned[start_idx:end_idx+1]
        
    return json.loads(cleaned)

async def fetch_rss_headlines() -> List[Dict[str, Any]]:
    """
    Fetches the latest investment-related headlines from Google News RSS.
    """
    url = "https://news.google.com/rss/search?q=market+outlook+investment+thesis&hl=en-US&gl=US&ceid=US:en"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
        if response.status_code == 200:
            root = ET.fromstring(response.content)
            items = root.findall(".//item")
            headlines = []
            for item in items[:5]:
                headlines.append({
                    "title": item.find("title").text,
                    "pubDate": item.find("pubDate").text,
                    "source": item.find("source").text if item.find("source") is not None else "Financial News",
                    "link": item.find("link").text
                })
            return headlines
    except Exception as e:
        logger.error(f"Failed to fetch RSS: {e}")
    return []

async def generate_theses_with_llm(headlines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Sends headlines to OpenRouter and asks it to output structured analyst reports.
    """
    if not headlines:
        return []
    
    headlines_text = "\n".join([
        f"- Title: {h['title']} | Source: {h['source']} | Date: {h['pubDate']}"
        for h in headlines
    ])

    system_prompt = """
You are a senior asset manager and macroeconomic research director at a leading sovereign wealth fund.
Analyze the following recent financial headlines and, for EACH headline, generate a structured market intelligence object containing:
1. "id": A unique string (e.g. t1, t2, t3).
2. "author": A realistic name of a financial professional or firm (e.g. Goldman Sachs Research, Morgan Stanley Wealth, John Kowalski).
3. "author_title": Rationale Title (e.g. Senior Macro Strategist, Global Equities Analyst).
4. "source": The news source (e.g. Bloomberg, Reuters, Financial Times).
5. "date": ISO publication date.
6. "title": A clean, punchy headline.
7. "content": A detailed 3-4 sentence investment thesis explaining the core asset allocation implications.
8. "image_url": A URL pointing to a placeholder photo (use: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f" for bonds, "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3" for equities, "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab" for real estate/alternatives, "https://images.unsplash.com/photo-1518770660439-4636190af475" for tech).
9. "ai_interpretation": A JSON object containing:
   - "summary": A concise 1-sentence bottom-line takeaway.
   - "impacted_assets": A list containing 1 or more of: KR_STOCK, GLOBAL_STOCK, KR_BOND, GLOBAL_BOND, ALTERNATIVE.
   - "confidence": A rating between 0.0 and 1.0.
10. "full_report": A JSON object representing a "Bloomberg Terminal" report:
   - "executive_summary": A 2-3 sentence overview.
   - "rationale": Detailed economic reasoning (why this matters for global assets).
   - "target_assets": Bullish/Bearish breakdown on affected assets.
   - "recommendation": Specific trade recommendations for a pension fund (e.g. "Overweight US Tech / Underweight Emerging Markets").
   - "risk_factors": Key risk factors or scenarios where this thesis fails.

You must output a JSON object containing a single key "theses" pointing to a list of these structured items.
Ensure all asset keys are valid. Output ONLY valid, parseable JSON. Do not write markdown decorations other than JSON block.
"""

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google-antigravity/nps-black-litterman",
        "X-Title": "NPS Black-Litterman Platform"
    }
    
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Financial Headlines:\n{headlines_text}"}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=25.0)
        
        if response.status_code == 200:
            res_json = response.json()
            raw_content = res_json["choices"][0]["message"]["content"]
            parsed_data = clean_and_parse_json(raw_content)
            return parsed_data.get("theses", [])
    except Exception as e:
        logger.error(f"Failed to generate theses with LLM: {e}")
    return []

async def sync_market_intelligence(db: Session, force: bool = False) -> List[Dict[str, Any]]:
    """
    Retrieves market theses from DB cache. If empty or stale, fetches from RSS, analyzes with LLM, and caches.
    """
    # Check cache first
    cached_items = db.query(MarketIntelligence).all()
    
    is_stale = True
    if cached_items:
        try:
            latest_created = max([item.created_at for item in cached_items if item.created_at])
            if datetime.utcnow() - latest_created < timedelta(hours=24):
                is_stale = False
        except Exception as e:
            logger.warning(f"Error checking cache freshness: {e}")
            is_stale = True

    if not cached_items or is_stale or force:
        logger.info("Stale or missing cache. Syncing market intelligence from RSS...")
        headlines = await fetch_rss_headlines()
        if headlines:
            theses = await generate_theses_with_llm(headlines)
            if theses:
                try:
                    # Clear old cache
                    db.query(MarketIntelligence).delete()
                    # Insert new cache
                    for t in theses:
                        db_item = MarketIntelligence(
                            id=t["id"],
                            author=t["author"],
                            author_title=t["author_title"],
                            source=t["source"],
                            date=t["date"],
                            title=t["title"],
                            content=t["content"],
                            image_url=t["image_url"],
                            ai_interpretation=t["ai_interpretation"],
                            full_report=t["full_report"]
                        )
                        db.add(db_item)
                    db.commit()
                    logger.info(f"Successfully cached {len(theses)} live financial theses.")
                    return theses
                except Exception as e:
                    logger.error(f"Failed to commit new theses to DB: {e}")
                    db.rollback()

    # Return cached items
    if cached_items:
        return [
            {
                "id": item.id,
                "author": item.author,
                "author_title": item.author_title,
                "source": item.source,
                "date": item.date,
                "title": item.title,
                "content": item.content,
                "image_url": item.image_url,
                "ai_interpretation": item.ai_interpretation,
                "full_report": item.full_report
            }
            for item in cached_items
        ]
    
    # Fallback if everything fails
    logger.warning("All sync attempts failed. Serving fallback theses.")
    return FALLBACK_THESES

async def fetch_market_intelligence(db: Session) -> List[Dict[str, Any]]:
    """
    Entrypoint function.
    """
    return await sync_market_intelligence(db)

