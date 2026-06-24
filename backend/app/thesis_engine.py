"""Thesis Engine — Stage 2.

Two passes over the ranked research queue, powered by Nemotron Ultra:
  Pass A  — extract atomic macro claims from each document.
  Pass B  — consolidate claims into one calibrated house view per asset / pair,
            resolving bull-vs-bear conflicts.

Confidence is then *calibrated in code* (not taken at LLM face value) from
corroboration breadth and source credibility, so it can be tested and trusted.
The resulting Thesis rows map directly to Black-Litterman views (see theses_to_views).
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from app.config import (
    OPENROUTER_API_KEY, OPENROUTER_API_URL, ARTICLE_DIGESTION_MODEL, ASSET_CLASSES,
)
from app.db import Document, Thesis
from app.market_intelligence import clean_and_parse_json
from app.collect import get_research_queue

logger = logging.getLogger(__name__)

_HEADERS = {
    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    "Content-Type": "application/json",
    "X-Title": "NPS Black-Litterman Platform",
}


async def _call_llm(system_prompt: str, user_content: str, timeout: float = 90.0) -> Optional[Dict[str, Any]]:
    """Single OpenRouter (Nemotron Ultra) JSON call. Returns parsed dict or None."""
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY not set; thesis engine cannot run.")
        return None
    payload = {
        "model": ARTICLE_DIGESTION_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        # Cap output so OpenRouter's credit reservation stays affordable; the structured
        # JSON outputs here are small. (Nemotron's default max output is very large.)
        "max_tokens": 5000,
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(OPENROUTER_API_URL, headers=_HEADERS, json=payload, timeout=timeout)
        if resp.status_code != 200:
            logger.error(f"Thesis LLM call returned {resp.status_code}: {resp.text[:200]}")
            return None
        return clean_and_parse_json(resp.json()["choices"][0]["message"]["content"])
    except Exception as e:
        logger.error(f"Thesis LLM call failed: {e}")
        return None


# ---- Pass A: atomic claims -------------------------------------------------

_PASS_A_PROMPT = f"""You are a macro research analyst. From the documents below, extract ATOMIC
investment claims relevant to these five asset classes ONLY: {", ".join(ASSET_CLASSES)}.

For EACH distinct claim output an object:
{{
  "doc_id": "<the id of the source document>",
  "assets": ["GLOBAL_BOND", ...],     // affected sleeves (subset of the five)
  "direction": "bullish" | "bearish",  // for the FIRST listed asset
  "magnitude": 0.05,                    // expected annualized impact as a decimal (e.g. 0.05 = +5%)
  "horizon": "3M" | "6M" | "12M",
  "confidence": 0.0-1.0,                // raw confidence from the strength of the evidence
  "evidence_quote": "<short supporting phrase from the document>"
}}

Rules: only use the five allowed asset keys; magnitudes realistic (-0.30..0.30); ignore
single-company noise — stay top-down/macro. Output JSON: {{"claims": [ ... ]}} only."""


async def extract_claims(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not docs:
        return []
    doc_block = "\n\n".join(
        f"[doc_id: {d['id']}] ({d.get('source')}, {d.get('source_type')})\n{d.get('title','')}\n{d.get('text','')[:600]}"
        for d in docs
    )
    parsed = await _call_llm(_PASS_A_PROMPT, f"Documents:\n{doc_block}")
    claims = (parsed or {}).get("claims", [])
    # keep only claims that reference allowed assets
    out = []
    for c in claims:
        assets = [a for a in (c.get("assets") or []) if a in ASSET_CLASSES]
        if assets:
            c["assets"] = assets
            out.append(c)
    logger.info(f"Pass A extracted {len(out)} atomic claims from {len(docs)} docs.")
    return out


# ---- Pass B: consolidation -------------------------------------------------

_PASS_B_PROMPT = f"""You are the chief macro strategist. Consolidate the atomic claims below into a
small set of HOUSE VIEWS for asset allocation across these sleeves: {", ".join(ASSET_CLASSES)}.

Merge claims on the same asset; resolve bull-vs-bear conflicts into a single net view; prefer
RELATIVE views when two sleeves are compared. For each consolidated view output:
{{
  "view_type": "absolute" | "relative",
  "asset": "GLOBAL_BOND",              // absolute only
  "asset1": "...", "asset2": "...",    // relative only (asset1 outperforms asset2)
  "direction": "bullish" | "bearish",  // absolute only
  "magnitude": 0.05,                    // decimal: expected_return (absolute) or outperformance (relative)
  "horizon": "12M",
  "confidence": 0.0-1.0,                // net conviction after merging
  "title": "<punchy headline>",
  "rationale": "<2-3 sentence macro reasoning>",
  "supporting_doc_ids": ["<doc_id>", ...]  // which claims/docs support this view
}}

Output JSON: {{"views": [ ... ]}} only. Keep to the 5 allowed asset keys."""


async def consolidate_claims(claims: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not claims:
        return []
    parsed = await _call_llm(_PASS_B_PROMPT, f"Atomic claims:\n{json.dumps(claims, ensure_ascii=False)}")
    views = (parsed or {}).get("views", [])
    logger.info(f"Pass B consolidated {len(claims)} claims into {len(views)} house views.")
    return views


# ---- Calibration (deterministic, testable) ---------------------------------

def calibrate_confidence(raw_confidence: float, n_sources: int, avg_credibility: float) -> float:
    """Down-weights LLM face-value confidence by corroboration breadth and source quality.

    - corroboration: saturates at 3 independent sources.
    - credibility:   averaged source weight (0..1).
    LLMs are overconfident, so the multiplier is < 1 unless evidence is broad and credible.
    """
    raw = max(0.0, min(1.0, float(raw_confidence)))
    corroboration = 0.4 + 0.6 * min(1.0, max(0, n_sources) / 3.0)   # 0.4 (1 weak source) .. 1.0 (3+)
    credibility = 0.5 + 0.5 * max(0.0, min(1.0, avg_credibility))    # 0.5 .. 1.0
    return round(max(0.01, min(0.99, raw * corroboration * credibility)), 3)


def _avg_credibility(db: Session, doc_ids: List[str]) -> float:
    if not doc_ids:
        return 0.5
    rows = db.query(Document).filter(Document.id.in_(doc_ids)).all()
    creds = [float(r.credibility) for r in rows if r.credibility is not None]
    return sum(creds) / len(creds) if creds else 0.5


# ---- Orchestration ---------------------------------------------------------

async def build_theses(db: Session, top_n: int = 12) -> List[Dict[str, Any]]:
    """Full Stage-2 build: queue → Pass A → Pass B → calibrate → persist."""
    queue = get_research_queue(db, limit=top_n)
    if not queue:
        logger.info("No documents in research queue; run /research/collect first.")
        return []

    claims = await extract_claims(queue)
    views = await consolidate_claims(claims)
    if not views:
        return []

    # Replace prior draft theses (keep approved ones).
    db.query(Thesis).filter(Thesis.status == "draft").delete()

    stored: List[Dict[str, Any]] = []
    for v in views:
        doc_ids = [d for d in (v.get("supporting_doc_ids") or []) if d]
        n_sources = len(set(doc_ids))
        calibrated = calibrate_confidence(v.get("confidence", 0.5), n_sources, _avg_credibility(db, doc_ids))
        tid = f"th-{uuid.uuid4().hex[:10]}"
        row = Thesis(
            id=tid,
            view_type=v.get("view_type", "absolute"),
            asset=v.get("asset"),
            asset1=v.get("asset1"),
            asset2=v.get("asset2"),
            direction=v.get("direction"),
            magnitude=v.get("magnitude"),
            horizon=v.get("horizon"),
            confidence_calibrated=calibrated,
            title=v.get("title"),
            rationale=v.get("rationale"),
            provenance=doc_ids,
            evidence=v.get("evidence"),
            status="draft",
        )
        db.add(row)
        stored.append(_thesis_to_dict(row))
    db.commit()
    logger.info(f"Built and stored {len(stored)} calibrated theses.")
    return stored


def _thesis_to_dict(t: Thesis) -> Dict[str, Any]:
    return {
        "id": t.id,
        "view_type": t.view_type,
        "asset": t.asset,
        "asset1": t.asset1,
        "asset2": t.asset2,
        "direction": t.direction,
        "magnitude": t.magnitude,
        "horizon": t.horizon,
        "confidence": t.confidence_calibrated,
        "title": t.title,
        "rationale": t.rationale,
        "provenance": t.provenance or [],
        "status": t.status,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def get_theses(db: Session, status: Optional[str] = None) -> List[Dict[str, Any]]:
    q = db.query(Thesis)
    if status:
        q = q.filter(Thesis.status == status)
    return [_thesis_to_dict(t) for t in q.order_by(Thesis.created_at.desc()).all()]


def theses_to_views(theses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Maps consolidated theses into the Black-Litterman view schema
    (matches app.llm AbsoluteView / RelativeView)."""
    views: List[Dict[str, Any]] = []
    for t in theses:
        conf = float(t.get("confidence", 0.5))
        mag = float(t.get("magnitude") or 0.0)
        if t.get("view_type") == "relative" and t.get("asset1") and t.get("asset2"):
            views.append({
                "view_type": "relative",
                "asset1": t["asset1"],
                "asset2": t["asset2"],
                "outperformance": abs(mag),
                "confidence": conf,
                "thesis": t.get("rationale", ""),
            })
        elif t.get("asset"):
            # Absolute view: sign the magnitude by direction; express as a total return.
            signed = -abs(mag) if t.get("direction") == "bearish" else abs(mag)
            views.append({
                "view_type": "absolute",
                "asset": t["asset"],
                "expected_return": signed,
                "confidence": conf,
                "thesis": t.get("rationale", ""),
            })
    return views
