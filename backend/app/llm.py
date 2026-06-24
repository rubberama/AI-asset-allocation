import logging
import json
import re
import httpx
from pydantic import BaseModel, Field, ValidationError
from typing import List, Union, Dict, Any, Optional
from app.config import OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_API_URL
from app.macro_data import fetch_macro_context, format_macro_context_for_llm

logger = logging.getLogger(__name__)

_last_macro_context = {}

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

async def parse_views_with_llm(view_text: str) -> List[Dict[str, Any]]:
    """
    Sends natural language investment views to OpenRouter and returns structured views list.
    """
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY not set. Using heuristic fallback parser.")
        return parse_heuristics_and_validate(view_text)

    # Fetch real-time macro context
    try:
        macro_indicators = fetch_macro_context()
        macro_context_str = format_macro_context_for_llm(macro_indicators)
    except Exception as e:
        logger.warning(f"Failed to fetch macro context: {e}")
        macro_context_str = "(Market data unavailable)"
        macro_indicators = {}

    global _last_macro_context
    _last_macro_context = macro_indicators

    system_prompt = f"""
You are an expert financial AI assistant. Your task is to analyze the user's investment view (natural language) and output a structured JSON object representing the qualitative/quantitative view vector for a Black-Litterman model.

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
  "expected_return": 0.12,  // Decimal annualized return (e.g. 12% is 0.12, -5% is -0.05)
  "confidence": 0.8,        // Number between 0.0 (no confidence) and 1.0 (complete confidence)
  "thesis": "Specific detailed 1-2 sentence investment thesis or rationale explaining why this view was formulated.",
  "sources": ["Source 1 (e.g., FRED CPI)", "Source 2 (e.g., CBOE VIX)"]
}}

2. Relative View Schema (asset1 will outperform asset2):
{{
  "view_type": "relative",
  "asset1": "GLOBAL_STOCK",
  "asset2": "KR_STOCK",
  "outperformance": 0.05,  // Difference in returns (e.g. outperforming by 5% is 0.05)
  "confidence": 0.75,      // Number between 0.0 and 1.0
  "thesis": "Specific detailed 1-2 sentence investment thesis or rationale explaining why asset1 outperforms asset2.",
  "sources": ["Source 1", "Source 2"]
}}

{macro_context_str}

IMPORTANT: Use the real-time market data above to CALIBRATE your expected returns and confidence levels.
- If VIX > 25, lower confidence levels and widen expected return ranges.
- If a market has rallied significantly (6M return > 15%), consider mean reversion risk.
- If yields are dropping, bond expected returns should be higher (price appreciation).
- Ground your thesis in the specific market data provided above.

Rules:
- Annualized returns should be realistic (generally between -0.30 and +0.30).
- Confidences should be based on the strength of the user's assertion (strong words like "definitely" -> high confidence, "might" -> lower).
- Provide a highly specific, high-quality, professional "thesis" explaining the economic mechanism behind the view.
- List 1 to 3 realistic financial data sources, indices, database name, or reports under "sources" (e.g., "FRED Consumer Price Index", "IMF World Economic Outlook", "Nasdaq 100", "Yahoo Finance Bond Index", "BOK Monetary Policy Report", "EIA Crude Oil Report").
- Only reference the allowed asset keys.
- Output ONLY valid, parseable JSON. Do not write explanations.
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
            {"role": "user", "content": f"User View: \"{view_text}\""}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1
    }
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=15.0)
                
            if response.status_code != 200:
                logger.error(f"OpenRouter API returned error status: {response.status_code}, response: {response.text}")
                raise httpx.HTTPStatusError("OpenRouter error", request=response.request, response=response)
                
            res_json = response.json()
            choices = res_json.get("choices", [])
            if not choices:
                raise ValueError("No choices in OpenRouter response")
                
            raw_content = choices[0]["message"]["content"]
            parsed_data = clean_and_parse_json(raw_content)
            
            # Validate with Pydantic
            validated = InvestmentViews.model_validate(parsed_data)
            
            # Filter valid asset names just in case
            filtered_views = []
            for v in validated.views:
                v_dict = v.model_dump()
                if v_dict["view_type"] == "absolute":
                    if v_dict["asset"] in VALID_ASSETS:
                        filtered_views.append(v_dict)
                elif v_dict["view_type"] == "relative":
                    if v_dict["asset1"] in VALID_ASSETS and v_dict["asset2"] in VALID_ASSETS:
                        filtered_views.append(v_dict)
            
            if not filtered_views:
                raise ValueError("No valid views remained after asset validation")
                
            logger.info(f"Successfully parsed {len(filtered_views)} views using LLM.")
            return filtered_views
            
        except Exception as e:
            logger.warning(f"Attempt {attempt+1}/{max_retries} failed to parse LLM views: {e}")
            if attempt == max_retries - 1:
                logger.error("All LLM attempts failed. Falling back to heuristics.")
                return parse_heuristics_and_validate(view_text)

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
    
    prompt = f"""You are an expert Korean pension fund portfolio analyst. Generate a concise, professional investment commentary in Korean (한국어) analyzing the portfolio optimization results.

Optimized Weights: {json.dumps(optimized_weights, indent=2)}
Benchmark (NPS) Weights: {json.dumps(market_weights, indent=2)}
Weight Changes vs Benchmark: {json.dumps(weight_changes, indent=2)}
Posterior Expected Returns: {json.dumps(posterior_returns, indent=2)}

Risk Metrics:
- Expected Return: {risk_metrics.get('expected_return', 'N/A')}
- Volatility: {risk_metrics.get('volatility', 'N/A')}
- 95% VaR: {risk_metrics.get('var_95', 'N/A')}
- 95% CVaR: {risk_metrics.get('cvar_95', 'N/A')}
- Max Drawdown: {risk_metrics.get('max_drawdown_estimate', 'N/A')}

Market Regime: {macro_context.get('market_regime', 'UNKNOWN')}
VIX: {macro_context.get('vix', 'N/A')}

Write a professional 3-4 paragraph commentary in Korean that:
1. Explains WHY the optimizer tilted weights in the direction it did
2. Identifies the single biggest risk factor for this portfolio
3. Gives a concrete action recommendation (rebalance frequency, hedge suggestion)
4. References specific market data points

Output ONLY the Korean commentary text, no JSON, no markdown headers."""
    
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
