import logging
import json
import os
import re
import httpx
from pydantic import BaseModel, Field, ValidationError
from typing import List, Union, Dict, Any, Optional
from app.config import OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_API_URL, VIEW_PARSING_MODEL, REASONING_MODEL
from app.macro_data import fetch_macro_context, format_macro_context_for_llm

logger = logging.getLogger(__name__)

_last_macro_context = {}

# Path to the institutional report style guide the LLM must read before
# composing the final portfolio report.
_REPORT_GUIDE_PATH = os.path.join(os.path.dirname(__file__), "report_style_guide.md")
_report_guide_cache = None


def load_report_style_guide() -> str:
    """
    Loads (and caches) the House Style guide that defines the persona, structure,
    and mandatory Risk & Mitigation rules for the AI-generated final report.
    Returns an empty string if the guide cannot be read.
    """
    global _report_guide_cache
    if _report_guide_cache is None:
        try:
            with open(_REPORT_GUIDE_PATH, encoding="utf-8") as f:
                _report_guide_cache = f.read()
            logger.info("Loaded report style guide from report_style_guide.md")
        except Exception as e:
            logger.warning(f"Could not load report style guide: {e}. Proceeding without it.")
            _report_guide_cache = ""
    return _report_guide_cache

# Define Pydantic models for validation
class AbsoluteView(BaseModel):
    view_type: str = Field("absolute")
    asset: str = Field(..., description="One of: KR_STOCK, GLOBAL_STOCK, KR_BOND, GLOBAL_BOND, ALTERNATIVE")
    expected_return: float = Field(..., description="Expected annualized return (e.g., 0.12 for 12%)")
    confidence: float = Field(..., description="Confidence score between 0.0 and 1.0")
    thesis: str = Field(..., description="Specific investment thesis/rationale for this view based on the user's text")
    sources: List[str] = Field(default=[], description="Specific data sources, indices, or economic indicators supporting this view")

class RelativeView(BaseModel):
    view_type: str = Field("relative")
    asset1: str = Field(..., description="Outperforming asset: KR_STOCK, GLOBAL_STOCK, KR_BOND, GLOBAL_BOND, ALTERNATIVE")
    asset2: str = Field(..., description="Underperforming asset: KR_STOCK, GLOBAL_STOCK, KR_BOND, GLOBAL_BOND, ALTERNATIVE")
    outperformance: float = Field(..., description="Expected difference in return (e.g., 0.05 for 5%)")
    confidence: float = Field(..., description="Confidence score between 0.0 and 1.0")
    thesis: str = Field(..., description="Specific investment thesis/rationale for this relative view based on the user's text")
    sources: List[str] = Field(default=[], description="Specific data sources, indices, or economic indicators supporting this view")

class InvestmentViews(BaseModel):
    views: List[Union[AbsoluteView, RelativeView]]

# Map of standard asset names
VALID_ASSETS = {"KR_STOCK", "GLOBAL_STOCK", "KR_BOND", "GLOBAL_BOND", "ALTERNATIVE"}

def clean_and_parse_json(text: str) -> Dict[str, Any]:
    """
    Cleans markdown formatting and parses JSON string.
    """
    cleaned = text.strip()
    # Remove code blocks if present
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if match:
        cleaned = match.group(1).strip()
    
    # Try to find the first '{' and last '}'
    start_idx = cleaned.find("{")
    end_idx = cleaned.rfind("}")
    if start_idx != -1 and end_idx != -1:
        cleaned = cleaned[start_idx:end_idx+1]
        
    return json.loads(cleaned)

def parse_with_heuristics(view_text: str) -> List[Dict[str, Any]]:
    """
    Fallback parser using simple keyword heuristic rules if API fails or is not available.
    """
    views = []
    text = view_text.lower()
    
    # Check for relative stock view
    if ("해외주식" in text or "global_stock" in text) and ("국내주식" in text or "kr_stock" in text):
        if "보다" in text or "우세" in text or "더 좋을" in text:
            views.append({
                "view_type": "relative",
                "asset1": "GLOBAL_STOCK",
                "asset2": "KR_STOCK",
                "outperformance": 0.05,
                "confidence": 0.75,
                "thesis": "미국 및 글로벌 증시의 빅테크 주도 성장세가 지속되어 상대적으로 성장 동력이 부족한 국내 주식 대비 초과 성과를 거둘 것으로 분석됩니다.",
                "sources": ["MSCI World Index", "KOSPI 200 Index", "S&P 500 Forward P/E"]
            })
            
    # Check for absolute views
    if "반도체" in text or "국내주식" in text or "kr_stock" in text:
        if "강세" in text or "상승" in text or "좋을 것" in text:
            if not any(v.get("view_type") == "relative" for v in views):
                views.append({
                    "view_type": "absolute",
                    "asset": "KR_STOCK",
                    "expected_return": 0.10,
                    "confidence": 0.8,
                    "thesis": "메모리 반도체 가격 회복 및 인공지능 관련 HBM 부품 수출 증가로 국내 증시의 수익성 개선이 예상됩니다.",
                    "sources": ["DRAMeXchange Index", "산업통상자원부 수출 통계"]
                })
                
    if "미국 증시" in text or "해외주식" in text or "global_stock" in text:
        if "강세" in text or "상승" in text or "좋을 것" in text:
            views.append({
                "view_type": "absolute",
                "asset": "GLOBAL_STOCK",
                "expected_return": 0.12,
                "confidence": 0.8,
                "thesis": "미국 주요 빅테크 기업들의 AI 부문 실적 가시화 및 견고한 고용 지표가 글로벌 증시의 전반적 상승을 지지합니다.",
                "sources": ["Nasdaq 100 Index", "Bureau of Labor Statistics (BLS)"]
            })
            
    if "금리" in text or "채권" in text or "kr_bond" in text or "global_bond" in text:
        if "하락" in text or "인하" in text:
            views.append({
                "view_type": "absolute",
                "asset": "GLOBAL_BOND",
                "expected_return": 0.06,
                "confidence": 0.7,
                "thesis": "미 연준(Fed)의 기준금리 인하 사이클 진입으로 채권 금리가 하락(채권 가격 상승)하여 자본 차익 기회가 커질 것입니다.",
                "sources": ["FOMC Meeting Minutes", "U.S. 10-Year Treasury Yield"]
            })
            views.append({
                "view_type": "absolute",
                "asset": "KR_BOND",
                "expected_return": 0.05,
                "confidence": 0.7,
                "thesis": "한국은행의 금리 인하 기조 동참 가능성으로 국내 채권의 수익률 매력도가 개선될 것으로 보입니다.",
                "sources": ["한국은행 금융통화위원회 의사록", "국고채 3년물 금리"]
            })
            
    # Default fallback view if nothing matched
    if not views:
        views.append({
            "view_type": "absolute",
            "asset": "GLOBAL_STOCK",
            "expected_return": 0.08,
            "confidence": 0.5,
            "thesis": "글로벌 자산 시장의 기본적인 장기 평균 성장세와 인플레이션 헤지 효과를 반영한 일반적 기대치입니다.",
            "sources": ["Historical Asset Class Returns"]
        })
        
    return views

def _build_views_system_prompt(macro_context_str: str) -> str:
    return f"""You are an expert financial AI assistant. Your task is to analyze the user's investment view (natural language) and output a structured JSON object representing the qualitative/quantitative view vector for a Black-Litterman model.

Supported assets are exactly:
- KR_STOCK: 국내주식 / South Korean equities
- GLOBAL_STOCK: 해외주식 / Global equities
- KR_BOND: 국내채권 / South Korean bonds
- GLOBAL_BOND: 해외채권 / Global bonds
- ALTERNATIVE: 대체투자 / Alternative investments

Format instructions:
You must output a JSON object containing a single key "views" which points to a list of views.
Each view must be either an "absolute" or a "relative" view.

1. Absolute View Schema:
{{
  "view_type": "absolute",
  "asset": "GLOBAL_STOCK",
  "expected_return": 0.12,
  "confidence": 0.8,
  "thesis": "Specific 1-2 sentence investment thesis explaining this view.",
  "sources": ["Source 1 (e.g., FRED CPI)", "Source 2 (e.g., CBOE VIX)"]
}}

2. Relative View Schema (asset1 will outperform asset2):
{{
  "view_type": "relative",
  "asset1": "GLOBAL_STOCK",
  "asset2": "KR_STOCK",
  "outperformance": 0.05,
  "confidence": 0.75,
  "thesis": "Specific 1-2 sentence investment thesis explaining why asset1 outperforms asset2.",
  "sources": ["Source 1", "Source 2"]
}}

{macro_context_str}

IMPORTANT: Use the real-time market data above to CALIBRATE your expected returns and confidence levels.
- If VIX > 25, lower confidence levels and widen expected return ranges.
- If a market has rallied significantly (6M return > 15%), consider mean reversion risk.
- If yields are dropping, bond expected returns should be higher (price appreciation).

Rules:
- Annualized expected returns MUST be realistic: absolute views in [-0.15, +0.20], relative outperformance in [-0.10, +0.10].
- Confidence strictly between 0.30 and 0.80.
- Provide a professional "thesis" explaining the economic mechanism.
- List 1-3 realistic data sources under "sources".
- Only reference the allowed asset keys.
- Output ONLY valid, parseable JSON. No explanations outside the JSON."""


def _parse_and_clamp_views(answer: str, view_text: str) -> List[Dict[str, Any]]:
    """Parse JSON answer text into validated, clamped BL views. Falls back to heuristics."""
    try:
        parsed_data = clean_and_parse_json(answer)
        validated = InvestmentViews.model_validate(parsed_data)
        filtered: List[Dict[str, Any]] = []
        for v in validated.views:
            vd = v.model_dump()
            if vd["view_type"] == "absolute" and vd.get("asset") in VALID_ASSETS:
                vd["expected_return"] = float(max(-0.15, min(0.20, float(vd["expected_return"]))))
                vd["confidence"] = float(max(0.30, min(0.80, float(vd["confidence"]))))
                filtered.append(vd)
            elif (vd["view_type"] == "relative"
                  and vd.get("asset1") in VALID_ASSETS
                  and vd.get("asset2") in VALID_ASSETS):
                vd["outperformance"] = float(max(-0.10, min(0.10, float(vd["outperformance"]))))
                vd["confidence"] = float(max(0.30, min(0.80, float(vd["confidence"]))))
                filtered.append(vd)
        if filtered:
            logger.info(f"Parsed and clamped {len(filtered)} BL views.")
            return filtered
    except Exception as e:
        logger.warning(f"View parse/validate failed: {e}")
    return parse_heuristics_and_validate(view_text)


async def parse_views_with_llm_stream(view_text: str):
    """
    Async generator using DeepSeek R1 (free reasoning model) with streaming.
    Yields:
      {"type": "thinking", "chunk": "..."}  — live CoT tokens from <think> block
      {"type": "result",   "views": [...]}  — final parsed BL views (always last)
    """
    if not OPENROUTER_API_KEY:
        logger.warning("No OPENROUTER_API_KEY. Using heuristic fallback.")
        yield {"type": "result", "views": parse_heuristics_and_validate(view_text)}
        return

    try:
        import asyncio
        macro_indicators = await asyncio.to_thread(fetch_macro_context)
        macro_context_str = format_macro_context_for_llm(macro_indicators)
    except Exception as e:
        logger.warning(f"Macro context fetch failed: {e}")
        macro_context_str = "(Market data unavailable)"
        macro_indicators = {}

    global _last_macro_context
    _last_macro_context = macro_indicators

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google-antigravity/nps-black-litterman",
        "X-Title": "NPS Black-Litterman Platform",
    }
    payload = {
        "model": REASONING_MODEL,
        "messages": [
            {"role": "system", "content": _build_views_system_prompt(macro_context_str)},
            {"role": "user", "content": f"User View: \"{view_text}\""},
        ],
        "stream": True,
        "temperature": 0.1,
    }

    full_content = ""
    in_think = False
    last_emitted = 0  # Index into full_content up to which we've yielded thinking text

    try:
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST", OPENROUTER_API_URL, headers=headers, json=payload, timeout=180.0
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    logger.error(f"OpenRouter {response.status_code}: {body[:300]}")
                    yield {"type": "result", "views": parse_heuristics_and_validate(view_text)}
                    return

                async for raw_line in response.aiter_lines():
                    if not raw_line.startswith("data: "):
                        continue
                    data_str = raw_line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk_data = json.loads(data_str)
                        choices = chunk_data.get("choices", [])
                        if not choices:
                            continue
                        token = choices[0].get("delta", {}).get("content") or ""
                        if not token:
                            continue
                        full_content += token

                        # State machine: emit thinking chunks as they stream in
                        while True:
                            if not in_think:
                                idx = full_content.find("<think>", last_emitted)
                                if idx == -1:
                                    break
                                in_think = True
                                last_emitted = idx + 7  # skip past "<think>"
                            else:
                                end_idx = full_content.find("</think>", last_emitted)
                                if end_idx == -1:
                                    # Still inside — emit everything except a 10-char safety buffer
                                    safe_end = max(last_emitted, len(full_content) - 10)
                                    if safe_end > last_emitted:
                                        yield {"type": "thinking", "chunk": full_content[last_emitted:safe_end]}
                                        last_emitted = safe_end
                                    break
                                else:
                                    # Closing tag found — flush remaining thinking content
                                    chunk_text = full_content[last_emitted:end_idx]
                                    if chunk_text:
                                        yield {"type": "thinking", "chunk": chunk_text}
                                    last_emitted = end_idx + 9  # skip past "</think>"
                                    in_think = False
                                    # loop again in case model has multiple think blocks

                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

    except Exception as e:
        logger.error(f"parse_views_with_llm_stream error: {e}", exc_info=True)
        yield {"type": "result", "views": parse_heuristics_and_validate(view_text)}
        return

    # Strip all <think>…</think> blocks, then extract JSON answer
    answer = re.sub(r"<think>.*?</think>", "", full_content, flags=re.DOTALL).strip()
    if not answer:
        answer = full_content.strip()
    yield {"type": "result", "views": _parse_and_clamp_views(answer, view_text)}


async def parse_views_with_llm(view_text: str) -> List[Dict[str, Any]]:
    """Non-streaming wrapper — collects the stream and returns the final views list."""
    views: List[Dict[str, Any]] = []
    async for event in parse_views_with_llm_stream(view_text):
        if event["type"] == "result":
            views = event["views"]
    return views

def parse_heuristics_and_validate(view_text: str) -> List[Dict[str, Any]]:
    """
    Parses with heuristics and passes through Pydantic to ensure schema validity.
    """
    raw_views = parse_with_heuristics(view_text)
    try:
        validated = InvestmentViews.model_validate({"views": raw_views})
        return [v.model_dump() for v in validated.views]
    except Exception as e:
        logger.error(f"Heuristics validation failed: {e}")
        # absolute emergency fallback
        return [{
            "view_type": "absolute",
            "asset": "GLOBAL_STOCK",
            "expected_return": 0.08,
            "confidence": 0.5
        }]


def get_last_macro_context() -> dict:
    global _last_macro_context
    if not _last_macro_context:
        try:
            _last_macro_context = fetch_macro_context()
        except Exception as e:
            logger.warning(f"Failed to lazily fetch macro context: {e}")
            _last_macro_context = {}
    return _last_macro_context


async def generate_portfolio_commentary(
    optimized_weights: Dict[str, float],
    market_weights: Dict[str, float],
    posterior_returns: Dict[str, float],
    risk_metrics: Dict[str, Any],
    macro_context: Dict[str, Any]
) -> str:
    """
    Uses AI to generate a human-readable portfolio commentary explaining
    the optimization results and key risk factors.
    """
    if not OPENROUTER_API_KEY:
        return _generate_fallback_commentary(optimized_weights, market_weights, risk_metrics)
    
    # Build context
    weight_changes = {}
    for asset in optimized_weights:
        change = optimized_weights[asset] - market_weights.get(asset, 0)
        weight_changes[asset] = round(change * 100, 2)
    
    style_guide = load_report_style_guide()

    prompt = f"""{style_guide}

=============================================================================
END OF HOUSE STYLE GUIDE. You have now read it in full. Compose the FINAL
REPORT below, conforming to every rule above — especially the MANDATORY
Risk & Mitigation section (≥ 3 portfolio-specific risk→mitigation blocks).
=============================================================================

=== DATA CONTEXT FOR THIS REPORT (use ONLY these figures) ===

Optimized Weights: {json.dumps(optimized_weights, indent=2)}
Benchmark (NPS) Weights: {json.dumps(market_weights, indent=2)}
Weight Changes vs Benchmark (percentage points): {json.dumps(weight_changes, indent=2)}
Posterior Expected Returns: {json.dumps(posterior_returns, indent=2)}

Risk Metrics:
- Expected Return: {risk_metrics.get('expected_return', 'N/A')}
- Volatility: {risk_metrics.get('volatility', 'N/A')}
- 95% VaR: {risk_metrics.get('var_95', 'N/A')}
- 95% CVaR: {risk_metrics.get('cvar_95', 'N/A')}
- Max Drawdown (Monte Carlo): {risk_metrics.get('max_drawdown_estimate', 'N/A')}

Market Regime: {macro_context.get('market_regime', 'UNKNOWN')}
VIX: {macro_context.get('vix', 'N/A')}

Now write the report. Output ONLY the report body in Korean, plain text per the
guide's formatting rules — no JSON, no Markdown syntax, no preamble or sign-off."""
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google-antigravity/nps-black-litterman",
        "X-Title": "NPS Black-Litterman Platform"
    }
    
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=20.0)
        
        if response.status_code == 200:
            res_json = response.json()
            choices = res_json.get("choices", [])
            if choices:
                commentary = choices[0]["message"]["content"].strip()
                logger.info("Successfully generated AI portfolio commentary.")
                return commentary
    except Exception as e:
        logger.warning(f"AI commentary generation failed: {e}")
    
    return _generate_fallback_commentary(optimized_weights, market_weights, risk_metrics)


def _generate_fallback_commentary(
    optimized_weights: Dict[str, float],
    market_weights: Dict[str, float],
    risk_metrics: Dict[str, Any]
) -> str:
    """
    Generates a basic template commentary when AI is unavailable.
    """
    biggest_overweight = max(optimized_weights.keys(), 
                           key=lambda a: optimized_weights[a] - market_weights.get(a, 0))
    biggest_underweight = min(optimized_weights.keys(),
                            key=lambda a: optimized_weights[a] - market_weights.get(a, 0))
    
    asset_names = {
        "KR_STOCK": "국내주식", "GLOBAL_STOCK": "해외주식",
        "KR_BOND": "국내채권", "GLOBAL_BOND": "해외채권", "ALTERNATIVE": "대체투자"
    }
    
    ow_name = asset_names.get(biggest_overweight, biggest_overweight)
    uw_name = asset_names.get(biggest_underweight, biggest_underweight)
    ow_delta = (optimized_weights[biggest_overweight] - market_weights.get(biggest_overweight, 0)) * 100
    uw_delta = (optimized_weights[biggest_underweight] - market_weights.get(biggest_underweight, 0)) * 100
    
    return (f"최적화 결과, {ow_name} 비중이 벤치마크 대비 {ow_delta:+.1f}%p 증가하고 "
            f"{uw_name} 비중이 {uw_delta:+.1f}%p 감소하였습니다. "
            f"포트폴리오의 예상 연간 수익률은 {risk_metrics.get('expected_return', 0)*100:.2f}%이며, "
            f"연간 변동성은 {risk_metrics.get('volatility', 0)*100:.2f}%로 산출되었습니다. "
            f"95% 신뢰수준에서의 최대 예상 손실(VaR)은 {risk_metrics.get('var_95', 0)*100:.2f}%입니다.")


async def generate_pm_memo(parsed_views: List[Dict[str, Any]], macro_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a qualitative investment memo from the Portfolio Manager (Jerry)
    reviewing the user's views in the context of the real-time macro indicators.
    """
    if not OPENROUTER_API_KEY:
        return {
            "macro_regime_sentiment": "NEUTRAL",
            "investment_thesis_summary": "AI memo generation disabled (API key not set).",
            "key_risks_considered": ["Market volatility"],
            "strategic_positioning_advice": "Maintain benchmark weights.",
            "adjusted_views_rationale": "Defaulting to prior views."
        }

    # Format the inputs for the prompt
    views_formatted = []
    for idx, v in enumerate(parsed_views):
        if v.get("view_type") == "absolute":
            views_formatted.append(
                f"- Absolute View: {v.get('asset')} | Expected Return: {v.get('expected_return'):+.2%} | Confidence: {v.get('confidence'):.2f}\n"
                f"  Thesis: {v.get('thesis')}\n"
                f"  Sources: {', '.join(v.get('sources', []))}"
            )
        elif v.get("view_type") == "relative":
            views_formatted.append(
                f"- Relative View: {v.get('asset1')} outperforming {v.get('asset2')} by {v.get('outperformance'):+.2%} | Confidence: {v.get('confidence'):.2f}\n"
                f"  Thesis: {v.get('thesis')}\n"
                f"  Sources: {', '.join(v.get('sources', []))}"
            )
    views_text = "\n".join(views_formatted)

    macro_context_str = format_macro_context_for_llm(macro_context)

    system_prompt = """
You are Jerry, the Senior Portfolio Manager & Head of Asset Allocation at the NPS investment research desk. You hold a PhD in Economics and have 20 years of experience.
Your task is to write a concise internal macro-asset allocation memo ("Jerry's PM Memo") reviewing the proposed active views under the current real-time macroeconomic environment.

Your output must be a valid JSON object matching this schema exactly:
{
  "macro_regime_sentiment": "RISK-OFF" | "RISK-ON" | "NEUTRAL",
  "investment_thesis_summary": "A 2-3 sentence overview of the consolidated investment thesis (what macro developments are driving this portfolio repositioning).",
  "key_risks_considered": [
    "Risk 1 (e.g. Fed policy error, inflation bounce, high VIX)",
    "Risk 2",
    "Risk 3"
  ],
  "strategic_positioning_advice": "A 1-2 sentence recommendation for Chris (Portfolio Management) explaining how the portfolio is tilting (e.g. tilting into Korean fixed income to capture capital gains, cutting global stock exposure).",
  "adjusted_views_rationale": "A 1-2 sentence explanation of your calibration rationale (e.g. why returns are clamped or why confidence is adjusted based on VIX and historical base rates)."
}

Do NOT write markdown decorations other than the JSON block. Do not write explanations outside the JSON.
"""

    user_content = f"""
=== REAL-TIME MACRO CONTEXT ===
{macro_context_str}

=== ACTIVE INVESTMENT VIEWS TO BE MERGED ===
{views_text}

Provide your Portfolio Manager (Jerry's) internal memo analyzing these views against the macro environment.
"""

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google-antigravity/nps-black-litterman",
        "X-Title": "NPS Black-Litterman Platform"
    }

    payload = {
        "model": VIEW_PARSING_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=20.0)

        if response.status_code == 200:
            res_json = response.json()
            raw_content = res_json["choices"][0]["message"]["content"]
            parsed_memo = clean_and_parse_json(raw_content)
            logger.info("Successfully generated PM Investment Memo (Jerry's reasoning).")
            return parsed_memo
    except Exception as e:
        logger.error(f"Failed to generate PM Investment Memo: {e}")

    # Fallback memo
    return {
        "macro_regime_sentiment": "NEUTRAL",
        "investment_thesis_summary": "Proposed active views are being integrated into the Black-Litterman model.",
        "key_risks_considered": ["General estimation error", "Market regimes shifts"],
        "strategic_positioning_advice": "Tilt weights cautiously according to the active views.",
        "adjusted_views_rationale": "Standard Prior weights modified by user active views."
    }
