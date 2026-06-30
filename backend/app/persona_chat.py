"""
Conversational persona chat — powers the left-panel investment desk.

Three personas answer in-character, grounded in the live app state the
frontend passes as `context`. A lightweight classifier decides whether a
user message is a market VIEW (capture as a consideration), a general
QUESTION (just answer), or a RUN command (fire the optimizer).
"""

import json
import logging

import httpx

from app.config import OPENROUTER_API_KEY, OPENROUTER_API_URL, VIEW_PARSING_MODEL, REASONING_MODEL
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
            "and give a clear house view. You are seasoned and direct."
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

    if persona in ("jerry", "chris") and macro:
        parts.append("=== 매크로 상태 (LIVE) ===")
        parts.append("시장 레짐: " + str(macro.get("market_regime", "UNKNOWN")))
        compact = {k: v for k, v in macro.items() if k in ("VIX", "US10Y", "DXY", "USD_KRW", "KOSPI", "SPY")}
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
        "model": VIEW_PARSING_MODEL,
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

    if not OPENROUTER_API_KEY:
        yield {"type": "token", "chunk": "(오프라인 모드: LLM 키가 설정되지 않아 답변을 생성할 수 없습니다.)"}
        return

    headers = {
        "Authorization": "Bearer " + OPENROUTER_API_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google-antigravity/nps-black-litterman",
        "X-Title": "NPS Black-Litterman Platform",
    }
    payload = {"model": REASONING_MODEL, "messages": messages, "stream": True, "temperature": 0.4}

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
                    logger.error("chat_with_persona_stream " + str(response.status_code) + ": " + str(body[:300]))
                    yield {"type": "token", "chunk": "(답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.)"}
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
                            idx = full.find("<think>", last)
                            if idx == -1:
                                emit = full[last:]
                                if emit:
                                    yield {"type": "token", "chunk": emit}
                                    last = len(full)
                                break
                            if idx > last:
                                yield {"type": "token", "chunk": full[last:idx]}
                            in_think = True
                            last = idx + 7
                        else:
                            end_idx = full.find("</think>", last)
                            if end_idx == -1:
                                last = len(full)
                                break
                            in_think = False
                            last = end_idx + 8
    except Exception as e:
        logger.error("chat_with_persona_stream error: " + str(e))
        yield {"type": "token", "chunk": "(답변 생성 중 오류가 발생했습니다.)"}
