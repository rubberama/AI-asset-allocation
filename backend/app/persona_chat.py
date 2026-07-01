"""
Conversational persona chat — powers the left-panel investment desk.

Three personas answer in-character, grounded in the live app state the
frontend passes as `context`. A lightweight classifier decides whether a
user message is a market VIEW (capture as a consideration), a general
QUESTION (just answer), or a RUN command (fire the optimizer).
"""

import asyncio
import json
import logging

import httpx

from app.config import OPENROUTER_API_KEY, OPENROUTER_API_URL
from app import config  # VIEW_PARSING_MODEL / REASONING_MODEL read live for runtime switching (설정 tab)
from app.llm import clean_and_parse_json

logger = logging.getLogger(__name__)


PERSONA_PROFILES = {
    "chris": {
        "name": "Chris",
        "role": "PM · 최고투자전략가 (CIS)",
        "persona": (
            "You are Chris, the Chief Investment Strategist (PM) of the Etacolla desk. "
            "You own the Black-Litterman methodology, the optimizer settings, and the "
            "interpretation of results. You explain WHY the portfolio looks the way it "
            "does: how the user's views moved posterior returns, why an asset is over/under "
            "weighted, what the deviation cap does, and how to read the risk metrics. "
            "You are precise, calm, and senior — like a CIO talking to a thoughtful client."
        ),
    },
    "jerry": {
        "name": "Jerry",
        "role": "선임 PM · 매크로 데스크",
        "persona": (
            "You are Jerry, the Senior PM running the macro desk at Etacolla. You speak to "
            "rates, inflation, growth, central-bank policy, the market regime, and how the "
            "macro backdrop argues for or against risk assets. You weigh bull vs bear cases "
            "and give a clear house view. You are seasoned and direct, but unfailingly "
            "courteous — you always address the client in polite formal Korean (정중한 존댓말, "
            "문장은 '~입니다 / ~합니다' 체로 끝맺습니다)."
        ),
    },
    "ben": {
        "name": "Ben",
        "role": "마켓 인텔리전스 애널리스트",
        "persona": (
            "You are Ben, the Market Intelligence analyst at Etacolla. You speak to the news "
            "flow, curated research, and the specific sources the user has dropped into the "
            "chat. You assess whether the evidence supports or contradicts a view, and surface "
            "what matters. You are sharp, fast, and evidence-driven."
        ),
    },
}


def _format_chat_context(persona, context):
    """Render the relevant slice of live app state for the chosen persona."""
    if not context:
        return "현재 화면 상태 정보가 제공되지 않았습니다. 일반적인 지식과 페르소나에 기반해 답하세요."
    parts = []
    sim = context.get("sim") or {}
    macro = context.get("macro") or {}
    attached = context.get("attached") or []
    considerations = context.get("considerations") or []

    if persona == "chris" and sim:
        parts.append("=== 현재 최적화 결과 (LIVE) ===")
        if sim.get("optimized_weights"):
            parts.append("최적 비중: " + json.dumps(sim["optimized_weights"], ensure_ascii=False))
        if sim.get("benchmark_weights"):
            parts.append("벤치마크(NPS) 비중: " + json.dumps(sim["benchmark_weights"], ensure_ascii=False))
        if sim.get("risk_metrics"):
            parts.append("리스크 지표: " + json.dumps(sim["risk_metrics"], ensure_ascii=False))
        if sim.get("parsed_views"):
            parts.append("반영된 뷰: " + json.dumps(sim["parsed_views"], ensure_ascii=False))
        if sim.get("posterior_returns"):
            parts.append("사후 기대수익률: " + json.dumps(sim["posterior_returns"], ensure_ascii=False))

    # Ben also gets the macro block so he can explain the numbers on the 매크로
    # dashboard when the user asks him to clarify them.
    if persona in ("jerry", "chris", "ben") and macro:
        parts.append("=== 매크로 상태 (LIVE) ===")
        parts.append("시장 레짐: " + str(macro.get("market_regime", "UNKNOWN")))
        compact = {k: v for k, v in macro.items() if k in ("VIX", "US10Y", "US3M", "YIELD_SPREAD", "DXY", "USD_KRW", "KOSPI", "SPY", "QQQ", "GOLD", "WTI")}
        if compact:
            parts.append("주요 지표: " + json.dumps(compact, ensure_ascii=False))

    if persona == "ben":
        if attached:
            parts.append("=== 사용자가 첨부한 자료 ===")
            for a in attached[:8]:
                summ = (a.get("ai_interpretation") or {}).get("summary") or a.get("content") or ""
                parts.append("- [" + str(a.get("source", "출처")) + "] " + str(a.get("title", "")) + ": " + str(summ)[:300])
        intel = context.get("intel") or []
        if intel:
            parts.append("=== 큐레이션된 마켓 인텔리전스 (상위) ===")
            for it in intel[:6]:
                parts.append("- " + str(it.get("title", "")))

    if considerations:
        parts.append("=== 사용자가 지금까지 표명한 견해(고려사항) ===")
        for c in considerations:
            parts.append("- " + str(c))

    return "\n".join(parts) if parts else "관련 라이브 상태가 비어 있습니다."


def _persona_heuristic_intent(message):
    """Cheap fallback classifier when the LLM call is unavailable/fails."""
    m = (message or "").lower().strip()
    run_kw = ["최적화", "돌려", "실행", "시뮬", "optimize", "run it", "run the", "go ahead", "execute", "리밸런"]
    if any(k in m for k in run_kw):
        return {"intent": "run", "summary": "", "run_params": {}}
    view_kw = [
        "생각", "전망", "같다", "같아", "올라", "내려", "오를", "내릴", "높을", "낮을",
        "상승", "하락", "강세", "약세", "우세", "유망", "예상보다",
        "bullish", "bearish", "i think", "i believe", "expect", "higher than", "lower than",
    ]
    if any(k in m for k in view_kw):
        return {"intent": "view", "summary": (message or "").strip()[:60], "run_params": {}}
    return {"intent": "question", "summary": "", "run_params": {}}


async def classify_chat_intent(message, history=None):
    """
    Classify a chat message into "view", "question", or "run".
    Returns {"intent", "summary", "run_params"}.
    """
    if not OPENROUTER_API_KEY:
        return _persona_heuristic_intent(message)

    sys = (
        "You are an intent classifier for an investment chat. Read the user's latest message "
        "(Korean or English) and classify it as exactly one of:\n"
        "  \"view\"     — the user expresses a market opinion / forecast / conviction that should "
        "influence the portfolio (e.g. 'rates will rise', '해외주식이 더 좋을 것 같다').\n"
        "  \"question\" — a general or informational question, or chit-chat (e.g. 'what's the rate now?', "
        "'what can you do?', 'why is my bond weight high?').\n"
        "  \"run\"      — an explicit instruction to run/execute/re-optimize the portfolio now "
        "(e.g. '이대로 최적화 돌려줘', 'ok run it').\n"
        "A message can ASK a question AND express a view; if it contains a genuine market opinion, "
        "prefer \"view\".\n"
        "Respond with ONLY a JSON object: "
        "{\"intent\": \"view|question|run\", \"summary\": \"<=8-word label of the view, else empty\"}."
    )
    headers = {
        "Authorization": "Bearer " + OPENROUTER_API_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google-antigravity/nps-black-litterman",
        "X-Title": "NPS Black-Litterman Platform",
    }
    payload = {
        "model": config.VIEW_PARSING_MODEL,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": message}],
        "temperature": 0.0,
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=45.0)
        if resp.status_code == 200:
            raw = resp.json()["choices"][0]["message"]["content"]
            parsed = clean_and_parse_json(raw)
            intent = str(parsed.get("intent", "")).lower().strip()
            if intent in ("view", "question", "run"):
                return {
                    "intent": intent,
                    "summary": str(parsed.get("summary", "") or "")[:60],
                    "run_params": parsed.get("run_params", {}) or {},
                }
    except Exception as e:
        logger.warning("classify_chat_intent failed, using heuristic: " + str(e))
    return _persona_heuristic_intent(message)
def _get_pending_prefix_len(text: str, tag: str) -> int:
    text_lower = text.lower()
    tag_lower = tag.lower()
    for i in range(len(tag_lower) - 1, 0, -1):
        if text_lower.endswith(tag_lower[:i]):
            return i
    return 0


def _find_tag_case_insensitive(text: str, tag: str, start: int) -> int:
    return text.lower().find(tag.lower(), start)


async def chat_with_persona_stream(persona, message, history=None, context=None):
    """
    Stream a conversational answer from the chosen persona, grounded in live
    app state. Yields {"type": "token", "chunk": "..."} events (answer text only).
    """
    profile = PERSONA_PROFILES.get(persona, PERSONA_PROFILES["chris"])
    ctx_str = _format_chat_context(persona, context)

    system_prompt = (
        profile["persona"] + "\n\n"
        + "당신의 이름은 " + profile["name"] + ", 직책은 " + profile["role"] + "입니다. "
        + "항상 한국어로, 1인칭으로, 페르소나를 유지하며 답하세요. 간결하고 전문적으로 "
        + "(보통 2~5문장), 마크다운 기호 없이 자연스러운 대화체로 답합니다. 아래 'LIVE 상태'에 "
        + "실제 수치가 있으면 그 수치를 근거로 구체적으로 설명하고, 추측한 숫자를 지어내지 마세요. "
        + "사용자가 시장에 대한 견해를 밝히면, 그 견해에 대해 동료처럼 논평하고 함의를 짚어 주세요 "
        + "(그 견해는 시스템이 별도로 '고려사항'으로 기록합니다).\n\n"
        + "=== LIVE 상태 ===\n" + ctx_str
    )

    messages = [{"role": "system", "content": system_prompt}]
    for h in (history or [])[-8:]:
        role = "assistant" if h.get("role") == "assistant" else "user"
        content = (h.get("content") or "").strip()
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    async for evt in _stream_answer(messages, temperature=0.4):
        yield evt


async def _stream_answer(messages, temperature=0.4):
    """
    Stream an OpenRouter chat completion, emitting only the answer text with any
    <think>…</think> spans the model embeds stripped out. Yields
    {"type": "token", "chunk": "..."} events. Shared by the persona chat and the
    Jerry daily-brief generator so think-stripping/error handling stay identical.
    """
    if not OPENROUTER_API_KEY:
        yield {"type": "token", "chunk": "(오프라인 모드: LLM 키가 설정되지 않아 답변을 생성할 수 없습니다.)"}
        return

    headers = {
        "Authorization": "Bearer " + OPENROUTER_API_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google-antigravity/nps-black-litterman",
        "X-Title": "NPS Black-Litterman Platform",
    }
    payload = {"model": config.REASONING_MODEL, "messages": messages, "stream": True, "temperature": temperature}

    full = ""
    in_think = False
    last = 0
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST", OPENROUTER_API_URL, headers=headers, json=payload, timeout=600.0
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    logger.error("_stream_answer " + str(response.status_code) + ": " + str(body[:300]))
                    if response.status_code == 429:
                        msg = ("(지금은 무료 AI 사용량 한도를 초과했습니다 — OpenRouter 무료 등급의 "
                               "일일 한도에 도달했어요. 잠시 후(한도 초기화 시) 다시 시도하거나 크레딧을 추가해 주세요.)")
                    else:
                        msg = "(답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.)"
                    yield {"type": "token", "chunk": msg}
                    return
                async for raw_line in response.aiter_lines():
                    if not raw_line.startswith("data: "):
                        continue
                    data_str = raw_line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        delta = json.loads(data_str).get("choices", [{}])[0].get("delta", {})
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
                    token = delta.get("content") or ""
                    if not token:
                        continue
                    full += token
                    # Strip any <think>…</think> the model embeds in content; emit only the answer.
                    while True:
                        if not in_think:
                            idx = _find_tag_case_insensitive(full, "<think>", last)
                            if idx == -1:
                                p_len = _get_pending_prefix_len(full, "<think>")
                                safe_len = len(full) - p_len
                                emit = full[last:safe_len]
                                if emit:
                                    yield {"type": "token", "chunk": emit}
                                last = safe_len
                                break
                            if idx > last:
                                yield {"type": "token", "chunk": full[last:idx]}
                            in_think = True
                            last = idx + 7
                        else:
                            end_idx = _find_tag_case_insensitive(full, "</think>", last)
                            if end_idx == -1:
                                p_len = _get_pending_prefix_len(full, "</think>")
                                last = len(full) - p_len
                                break
                            in_think = False
                            last = end_idx + 8
    except Exception as e:
        logger.error("_stream_answer error: " + str(e))
        yield {"type": "token", "chunk": "(답변 생성 중 오류가 발생했습니다.)"}


def _cur(macro, key):
    """Return (current, change_1d) for a macro indicator, or (None, None)."""
    d = macro.get(key) if macro else None
    if isinstance(d, dict):
        return d.get("current"), d.get("change_1d")
    return None, None


def build_daily_brief_text(macro):
    """
    Build Jerry's daily macro brief deterministically from our own indicators.
    Because the text is assembled in Python — not by an LLM — the tone (polite
    '~입니다/합니다'), the labeled blank-line blocks, and above all the numbers are
    guaranteed: every figure is copied straight from the macro snapshot, so the
    brief cannot invent or web-source a value. Blocks are skipped when their data
    is missing rather than fabricated.
    """
    if not macro or not any(isinstance(v, dict) and "current" in v for v in macro.values()):
        return ("죄송합니다. 지금은 매크로 수치를 불러오지 못했습니다. 잠시 후 다시 시도해 주시면 "
                "오늘의 브리핑을 준비하겠습니다.")

    blocks = []

    # ① 레짐
    regime = macro.get("market_regime", "NORMAL")
    regime_kr = macro.get("regime_kr") or "정상 시장 국면"
    regime_note = {
        "CRISIS": "위험 회피가 우선인 국면입니다",
        "ELEVATED_RISK": "리스크 관리에 무게를 두어야 하는 국면입니다",
        "LOW_VOL": "변동성이 낮아 비교적 안정적인 국면입니다",
        "NORMAL": "특별한 스트레스 신호는 보이지 않습니다",
    }.get(regime, "특별한 스트레스 신호는 보이지 않습니다")
    blocks.append(f"레짐 · 오늘 시장은 {regime_kr}이며, {regime_note}.")

    # ② 금리
    us3m, _ = _cur(macro, "US3M")
    us10y, _ = _cur(macro, "US10Y")
    spread, _ = _cur(macro, "YIELD_SPREAD")
    if us3m is not None and us10y is not None:
        line = f"금리 · 미국 3개월물은 {us3m:.2f}%, 10년물은 {us10y:.2f}%입니다"
        if spread is not None:
            if spread < 0:
                shape = "장단기 금리가 역전되어 경기 둔화 우려를 반영합니다"
            elif spread < 0.5:
                shape = "장단기 스프레드가 좁아 곡선이 완만합니다"
            else:
                shape = "곡선이 정상적으로 우상향하고 있습니다"
            line += f". 10Y-3M 스프레드는 {spread:.2f}%p로, {shape}"
        blocks.append(line + ".")

    # ③ 달러·환율
    dxy, _ = _cur(macro, "DXY")
    krw, krw1 = _cur(macro, "USD_KRW")
    if dxy is not None or krw is not None:
        parts = []
        if dxy is not None:
            parts.append(f"달러인덱스는 {dxy:,.2f}")
        if krw is not None:
            parts.append(f"원/달러 환율은 {krw:,.1f}원")
        line = "달러·환율 · " + ", ".join(parts) + "입니다"
        if krw1 is not None:
            tone = "약세" if krw1 > 0 else "강세" if krw1 < 0 else "보합"
            line += f". 원화는 전일 대비 소폭 {tone}({krw1:+.2f}%)입니다"
        blocks.append(line + ".")

    # ④ 주식
    kospi, k1 = _cur(macro, "KOSPI")
    spy, s1 = _cur(macro, "SPY")
    qqq, q1 = _cur(macro, "QQQ")
    if kospi is not None or spy is not None:
        parts = []
        if kospi is not None:
            parts.append(f"코스피는 {kospi:,.1f}" + (f"(전일 {k1:+.2f}%)" if k1 is not None else ""))
        us = []
        if spy is not None:
            us.append(f"SPY {spy:,.2f}" + (f"({s1:+.2f}%)" if s1 is not None else ""))
        if qqq is not None:
            us.append(f"QQQ {qqq:,.2f}" + (f"({q1:+.2f}%)" if q1 is not None else ""))
        if us:
            parts.append("미국은 " + "·".join(us))
        line = "주식 · " + ", ".join(parts) + "입니다"
        if k1 is not None and s1 is not None:
            line += ". 국내 증시는 미국 대비 " + ("상대적으로 부진합니다" if k1 < s1 else "견조한 흐름입니다")
        blocks.append(line + ".")

    # ⑤ 원자재·변동성
    vix, _ = _cur(macro, "VIX")
    move, _ = _cur(macro, "MOVE")
    gold, _ = _cur(macro, "GOLD")
    wti, _ = _cur(macro, "WTI")
    parts = []
    if vix is not None:
        parts.append(f"VIX는 {vix:.2f}")
    if move is not None:
        parts.append(f"MOVE는 {move:.1f}")
    if gold is not None:
        parts.append(f"금은 {gold:,.1f}")
    if wti is not None:
        parts.append(f"WTI 유가는 {wti:,.2f}")
    if parts:
        line = "원자재·변동성 · " + ", ".join(parts) + "입니다"
        if vix is not None:
            line += ". " + ("주식 변동성은 낮은 편입니다" if vix < 20 else "주식 변동성이 높아 경계가 필요합니다")
        blocks.append(line + ".")

    # ⑥ 하우스 성향
    lean = {
        "CRISIS": "위험자산 비중을 방어적으로 축소하는 것을 우선합니다",
        "ELEVATED_RISK": "위험자산은 신중하고 방어적으로 접근합니다",
        "LOW_VOL": "위험자산에 대해 중립에서 소폭 선호이며, 선택적 비중 확대가 가능합니다",
        "NORMAL": "위험자산에 대해 중립적이며, 선택적 비중 확대가 가능합니다",
    }.get(regime, "위험자산에 대해 중립적입니다")
    blocks.append(f"하우스 성향 · {lean}.")

    blocks.append("이어서 무엇을 도와드릴까요? 아래에서 골라 주시면 바로 도와드리겠습니다.")
    return "\n\n".join(blocks)


async def generate_daily_brief_stream(macro_context):
    """
    Stream Jerry's daily macro brief. The text is built deterministically by
    build_daily_brief_text (guaranteed polite tone / block formatting / real
    numbers only), then emitted in small chunks so the UI keeps its live 'typing'
    feel. Yields {"type": "token", "chunk": "..."} events.
    """
    text = build_daily_brief_text(macro_context)
    step = 3
    for i in range(0, len(text), step):
        yield {"type": "token", "chunk": text[i:i + step]}
        await asyncio.sleep(0.012)
