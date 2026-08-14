"""Stitch[] → 뜨개 텍스트. 스테이지 2 전체를 잇는 자리. 순수 함수."""

import math
from dataclasses import replace

from .models import Link, RoundStart, Stitch
from .order import is_closing_slst, link_round, order_round, split_rounds
from .start_point import detect_round_start

NAMES = {  # 영문 표기로 바꾸려면 이 표만 갈아끼우면 된다
    "ch": "사슬",
    "sc": "짧은뜨기",
    "hdc": "긴뜨기",
    "dc": "한길긴뜨기",
    "tr": "두길긴뜨기",
    "dtr": "세길긴뜨기",
    "slst": "빼뜨기",
    "?": "미분류",
}

MAX_UNIT = 8  # 반복 단위가 이보다 길면 펼쳐 쓰는 게 읽기 낫다
LOW_CONF = 0.6


def to_text(stitches: list[Stitch]) -> str:
    """도안 기호 전체를 단별 뜨개 텍스트로. 경고는 ⚠ 줄로 함께 낸다."""
    return render(parse(stitches))


def render(rounds: list[dict]) -> str:
    """parse 결과를 사람이 읽는 글자로. 화면에 그대로 뿌릴 수 있는 형태."""
    if not rounds:
        return "코를 하나도 찾지 못했다."
    lines = []
    for r in rounds:
        lines.append(f"{r['n']}단: {r['text']} ({r['count']}코)")
        lines += [f"  ⚠ {w}" for w in r["warnings"]]
    return "\n".join(lines)


def parse(stitches: list[Stitch]) -> list[dict]:
    """단별 파싱 결과. 전부 JSON 으로 바로 나가는 값들이다.

    글자로 뭉치기 전 단계라 메인 쪽에서 단별로 렌더하든 경고만 뽑든 자유롭다.
    """
    rounds: list[dict] = []
    prev_items: list[Stitch] = []
    prev_theta: float | None = None
    prev_count = 0
    fallbacks = 0

    for n, items in enumerate(split_rounds(stitches), start=1):
        start = detect_round_start(items, prev_theta)
        ordered = order_round(items, start)
        links = link_round(ordered, prev_items, start)

        slots = _slots(items, ordered, start)
        count = len(slots)
        rounds.append({
            "n": n,
            "text": _body(ordered, links, start),
            "count": count,
            "warnings": _warn(start, ordered, links, prev_count, count, fallbacks),
            "start_deg": round(math.degrees(start.theta), 1),
            "source": start.source,
            "confidence": start.confidence,
        })

        fallbacks = fallbacks + 1 if start.source != "turning_chain" else 0
        prev_items, prev_theta, prev_count = slots, start.theta, count

    return rounds


def _slots(items: list[Stitch], ordered: list[Stitch], start: RoundStart) -> list[Stitch]:
    """이번 단이 만든 코 자리 = 다음 단이 꽂을 부모.

    기둥사슬은 자기가 대신하는 코 하나로 세고 그 머리를 부모로 내놓는다. 이게
    없으면 기둥사슬 위에 선 다음 단 코가 옆 코에 붙어 가짜 늘림이 된다.
    마무리 빼뜨기는 코 자리가 아니므로 뺀다.
    """
    out = [s for s in ordered if not is_closing_slst(s, start.theta)]
    if start.substitutes_stitch:
        chain = set(start.chain_ids)
        top = max((s for s in items if s.id in chain), key=lambda s: s.r)
        out.append(replace(top, cls=start.substitutes_stitch))
    return out


def _body(ordered: list[Stitch], links: list[Link], start: RoundStart) -> str:
    head = []
    if start.chain_ids:
        sub = f"(={NAMES[start.substitutes_stitch]} 1코)" if start.substitutes_stitch else ""
        head.append(f"사슬 {len(start.chain_ids)}{sub}")

    toks = _tokens(ordered, links)
    p = _period(toks)
    if 2 <= p <= MAX_UNIT and p < len(toks):
        head.append(f"[{_rle(toks[:p])}] x{len(toks) // p}")
    elif toks:
        head.append(_rle(toks))

    if any(l.op == "join" for l in links):
        head.append("빼뜨기로 마무리")
    return ", ".join(head)


def _tokens(ordered: list[Stitch], links: list[Link]) -> list[str]:
    """코 하나 = 토큰 하나. 단, 한 부모를 나눠 쓰는 늘림은 묶어서 하나로."""
    toks, i = [], 0
    while i < len(ordered):
        name, link = NAMES.get(ordered[i].cls, ordered[i].cls), links[i]
        if link.op == "join":
            i += 1
        elif link.op == "dec":
            toks.append(f"{name} {len(link.into)}코모아뜨기")
            i += 1
        elif link.op == "inc":
            j = i
            while j + 1 < len(ordered) and links[j + 1].op == "inc" and links[j + 1].into == link.into:
                j += 1
            toks.append(f"{name} {j - i + 1}코 늘림")
            i = j + 1
        else:
            toks.append(name)
            i += 1
    return toks


def _rle(toks: list[str]) -> str:
    out, i = [], 0
    while i < len(toks):
        j = i
        while j + 1 < len(toks) and toks[j + 1] == toks[i]:
            j += 1
        out.append(f"{toks[i]} {j - i + 1}" if j > i else toks[i])
        i = j + 1
    return ", ".join(out)


def _period(toks: list[str]) -> int:
    """가장 짧은 반복 주기. 없으면 전체 길이.

    ponytail: O(n^2) 완전탐색. 한 단이 수백 코가 되면 KMP 실패함수로 바꿀 것.
    """
    for p in range(1, len(toks) // 2 + 1):
        if len(toks) % p == 0 and toks == toks[:p] * (len(toks) // p):
            return p
    return len(toks)


def _warn(start, ordered, links, prev_count, count, fallbacks) -> list[str]:
    out = []
    if start.source != "turning_chain":
        out.append(f"시작점을 못 찾아 {start.source} 로 대체했다 (연속 {fallbacks + 1}단)")
        if fallbacks >= 1:
            out.append("나선 도안이거나 사슬 인식이 통째로 실패했다. 원본을 확인할 것")
    elif start.confidence < LOW_CONF:
        out.append(f"시작점 확신도 {start.confidence} — 기둥사슬 후보가 애매했다")

    if prev_count:
        inc = sum(1 for l in links if l.op == "inc")
        dec = sum(len(l.into) - 1 for l in links if l.op == "dec")
        expected = prev_count + inc // 2 - dec  # 늘림 한 쌍이 1코 증가
        if expected != count:
            out.append(f"코 수가 안 맞는다: 이전 {prev_count}코 기준 {expected} 예상, {count} 나옴")

    bad = sum(1 for s in ordered if s.cls == "?")
    if bad:
        out.append(f"분류 실패한 기호 {bad}개 — 기호 인식부터 확인할 것")
    return out
