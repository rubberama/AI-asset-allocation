"""Thesis Engine — Stage 2.

Two passes over the ranked research queue, powered by Nemotron Super:
  Pass A  — extract atomic macro claims from each document.
  Pass B  — consolidate claims into one calibrated house view per asset / pair,
            resolving bull-vs-bear conflicts.

Confidence is then *calibrated in code* (not taken at LLM face value) from
corroboration breadth and source credibility, so it can be tested and trusted.
The resulting Thesis rows map directly to Black-Litterman views (see theses_to_views).
"""
import json
import logging
import os
import re
import uuid
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from app.config import (
    OPENROUTER_API_KEY, OPENROUTER_API_URL, ARTICLE_DIGESTION_MODEL, ASSET_CLASSES,
    REASONING_MODEL,
)
from app.db import Document, Thesis
from app.market_intelligence import clean_and_parse_json
from app.collect import get_research_queue

logger = logging.getLogger(__name__)

def _make_headers() -> dict:
    """Build headers fresh each call so .env changes are picked up without restart."""
    from app.config import OPENROUTER_API_KEY as _key
    return {
        "Authorization": f"Bearer {_key}",
        "Content-Type": "application/json",
        "X-Title": "NPS Black-Litterman Platform",
    }

# ── Personas (loaded once from file, cached) ───────────────────────────
_persona_cache: Dict[str, str] = {}

def load_persona(filename: str) -> str:
    global _persona_cache
    if filename not in _persona_cache:
        path = os.path.join(os.path.dirname(__file__), filename)
        try:
            with open(path, encoding="utf-8") as f:
                _persona_cache[filename] = f.read()
            logger.info(f"Loaded persona from {filename}")
        except Exception as e:
            logger.warning(f"Could not load persona {filename}: {e}. Proceeding without it.")
            _persona_cache[filename] = ""
    return _persona_cache[filename]


async def _call_llm(system_prompt: str, user_content: str, timeout: float = 600.0) -> Optional[Dict[str, Any]]:
    """Single OpenRouter JSON call using ARTICLE_DIGESTION_MODEL. Returns parsed dict or None."""
    from app.config import OPENROUTER_API_KEY as _key, OPENROUTER_API_URL as _url, ARTICLE_DIGESTION_MODEL as _model
    if not _key:
        logger.warning("OPENROUTER_API_KEY not set; thesis engine cannot run.")
        return None
    payload = {
        "model": _model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        "max_tokens": 5000,
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(_url, headers=_make_headers(), json=payload, timeout=timeout)
        if resp.status_code != 200:
            logger.error(f"Thesis LLM call returned {resp.status_code}: {resp.text[:200]}")
            return None
        return clean_and_parse_json(resp.json()["choices"][0]["message"]["content"])
    except Exception as e:
        logger.error(f"Thesis LLM call failed: {e}")
        return None


async def _call_reasoning_llm(system_prompt: str, user_content: str, timeout: float = 600.0) -> Optional[Dict[str, Any]]:
    """
    OpenRouter call using REASONING_MODEL (Nemotron 3 Super, free).
    Strips <think>…</think> CoT blocks before JSON parsing.
    Timeout is long because free R1 can take 60-120 s.
    """
    from app.config import OPENROUTER_API_KEY as _key, OPENROUTER_API_URL as _url
    if not _key:
        logger.warning("OPENROUTER_API_KEY not set; reasoning LLM cannot run.")
        return None
    payload = {
        "model": REASONING_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.2,
        "max_tokens": 8000,
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(_url, headers=_make_headers(), json=payload, timeout=timeout)
        if resp.status_code != 200:
            logger.error(f"Reasoning LLM call returned {resp.status_code}: {resp.text[:200]}")
            return None
        content = resp.json()["choices"][0]["message"]["content"]
        # Strip CoT thinking block before JSON extraction
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
        return clean_and_parse_json(content)
    except Exception as e:
        logger.error(f"Reasoning LLM call failed: {e}")
        return None


# ---- Pass A: atomic claims (Bull / Bear) -----------------------------------

_PASS_A_TASK = f"""
============================================================================
YOUR TASK — PASS A: ATOMIC CLAIM EXTRACTION
============================================================================

Read your persona above. From the research documents below, extract ALL distinct atomic investment claims relevant to these five asset classes ONLY: {", ".join(ASSET_CLASSES)}.

Apply your persona's rules strictly. Ignore single-company noise — stay top-down and macro.

Output JSON: {{"claims": [ ... ]}} only. No commentary outside the JSON.
"""

async def extract_claims_with_persona(docs: List[Dict[str, Any]], persona_file: str) -> List[Dict[str, Any]]:
    if not docs:
        return []
    persona = load_persona(persona_file)
    system_prompt = f"{persona}\n\n{_PASS_A_TASK}" if persona else _PASS_A_TASK
    doc_block = "\n\n".join(
        f"[doc_id: {d['id']}] ({d.get('source')}, {d.get('source_type')})\n{d.get('title','')}\n{d.get('text','')[:600]}"
        for d in docs
    )
    parsed = await _call_llm(system_prompt, f"Research documents to analyze:\n{doc_block}")
    claims = (parsed or {}).get("claims", [])
    out = []
    for c in claims:
        assets = [a for a in (c.get("assets") or []) if a in ASSET_CLASSES]
        if assets:
            c["assets"] = assets
            out.append(c)
    logger.info(f"[{persona_file}] extracted {len(out)} claims from {len(docs)} docs.")
    return out


# ---- Pass B: consolidation (Portfolio Manager) -----------------------------

_PASS_B_TASK = f"""
============================================================================
JERRY'S TASK — PASS B: HOUSE VIEW CONSOLIDATION
============================================================================

You are Jerry, the Portfolio Manager. Re-read your persona above before proceeding.

Below are the atomic claims extracted by the Bull and the Bear across the research queue.
Consolidate them into a small set of unified HOUSE VIEWS (3–7 maximum) for asset allocation
across these sleeves: {", ".join(ASSET_CLASSES)}.

Apply Jerry's consolidation rules. For each consolidated view, output one object conforming to Jerry's Pass B Output Standard:
{{
  "view_type": "absolute" | "relative",
  "asset": "GLOBAL_BOND",
  "asset1": "...", "asset2": "...",
  "direction": "bullish" | "bearish",
  "magnitude": 0.05,
  "horizon": "6M",
  "confidence": 0.0-1.0,
  "title": "<Jerry's internal memo headline — terse, directional>",
  "rationale": "<2–3 sentences of Jerry's economic reasoning, explicitly stating WHY the Bull or Bear won the debate>",
  "debate_log": [
    {{"speaker": "Bull", "message": "<Summarized bullish case>"}},
    {{"speaker": "Bear", "message": "<Summarized bearish case>"}},
    {{"speaker": "Portfolio Manager", "message": "<Final decision>"}}
  ],
  "bull_claims_used": ["<doc_id>"],
  "bear_claims_used": ["<doc_id>"],
  "supporting_doc_ids": ["<doc_id>", ...]
}}

Output JSON: {{"views": [ ... ]}} only. No commentary outside the JSON.
"""

async def consolidate_claims(bull_claims: List[Dict[str, Any]], bear_claims: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not bull_claims and not bear_claims:
        return []
    persona = load_persona("thesis_persona.md")
    system_prompt = f"{persona}\n\n{_PASS_B_TASK}" if persona else _PASS_B_TASK
    content = f"Bull Claims:\n{json.dumps(bull_claims, ensure_ascii=False)}\n\nBear Claims:\n{json.dumps(bear_claims, ensure_ascii=False)}"
    # Pass B uses the Nemotron 3 Super reasoning model — it weighs conflicting macro evidence
    parsed = await _call_reasoning_llm(system_prompt, content)
    views = (parsed or {}).get("views", [])
    logger.info(f"Jerry Pass B (Nemotron 3 Super) consolidated {len(bull_claims)} bull + {len(bear_claims)} bear claims → {len(views)} house views.")
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
    """Full Stage-2 build: queue → Pass A (Bull/Bear) → Pass B (PM) → calibrate → persist."""
    queue = get_research_queue(db, limit=top_n)
    if not queue:
        logger.info("No documents in research queue; run /research/collect first.")
        return []

    bull_claims, bear_claims = await asyncio.gather(
        extract_claims_with_persona(queue, "bull_persona.md"),
        extract_claims_with_persona(queue, "bear_persona.md")
    )
    
    views = await consolidate_claims(bull_claims, bear_claims)
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
        evidence = {
            "bull_claims_used": v.get("bull_claims_used", []),
            "bear_claims_used": v.get("bear_claims_used", []),
            "debate_log": v.get("debate_log", []),
            "raw_evidence": v.get("evidence")
        }
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
            evidence=evidence,
            status="draft",
        )
        db.add(row)
        db.flush()  # populate server-side defaults (created_at) before serializing
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
        "evidence": t.evidence,
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
                "is_active_tilt": True,
                "confidence": conf,
                "thesis": t.get("rationale", ""),
            })
    return views
