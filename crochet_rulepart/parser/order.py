"""단 나누기 → 단 내 순서 → 이전 단 연결. 순수 함수."""

import math
import statistics

from .models import Link, RoundStart, Stitch
from .start_point import _group_by_angle, ang_dist

TWO_PI = 2 * math.pi

CLOSE_TOL = 0.2  # 이 각도(rad) 안에 든 빼뜨기는 단을 닫는 코로 본다
GAP_FRAC = 0.5  # root_r 간격이 코 길이 중앙값의 이 배를 넘으면 단이 바뀐 것


def split_rounds(stitches: list[Stitch]) -> list[list[Stitch]]:
    """안쪽 단부터 순서대로 가른다.

    같은 단의 코는 모두 이전 단 머리에 꽂히므로 root_r 이 뭉친다. 단이 바뀌면
    코 길이만큼 뛴다 — 그 틈을 자른다.

    사슬과 빼뜨기는 root_r 이 자기 단보다 위에 찍혀서 이 규칙에서 빠진다.

    - 기둥사슬은 반지름 방향으로 서 있어 위쪽 사슬 root_r 이 다음 단 높이까지
      올라간다 → 각도로 먼저 묶고, 묶음 전체를 가장 안쪽 사슬의 단에 넣는다
      (기둥사슬은 그 단 바닥에서 올라오니까).
    - 단을 닫는 빼뜨기는 기둥사슬 '머리'에 꽂힌다 → root_r 이 그 단 머리 높이다.
      실측(sample.png): dc root 170~186 인데 빼뜨기 root 409.6.

    ponytail: 빼뜨기를 전부 '단을 닫는 것'으로 본다. 빼뜨기가 본체 코로 쓰인 단
    (슬립스티치 뜨기)은 한 단 안쪽으로 밀린다. 원형 모티브에선 아직 못 봤다.
    ponytail: 연속한 두 단의 기둥사슬이 같은 각도에 정확히 겹치면 한 묶음으로 붙어
    한쪽 단에 몰린다. 두 스택은 반지름이 맞닿아 있어 기하만으로는 못 가른다 —
    가르려면 사슬 개수(표준 2~4개)나 단별 코 수 검증을 근거로 써야 한다.
    ponytail: 단끼리 반지름이 겹치는 도안(부속 모티브, 입체 뜨기)에서는 갈라지지
    않는다. 그때는 worked_into 연결을 먼저 풀고 그래프로 나누는 쪽으로.
    """
    body = [s for s in stitches if s.cls not in ("ch", "slst")]
    if not body:
        return [stitches] if stitches else []

    body.sort(key=lambda s: s.root_r)
    tol = statistics.median(s.head_r - s.root_r for s in body) * GAP_FRAC

    rounds: list[list[Stitch]] = [[body[0]]]
    for a, b in zip(body, body[1:]):
        if b.root_r - a.root_r > tol:
            rounds.append([])
        rounds[-1].append(b)

    def nearest(bands: list[float], value: float) -> int:
        return min(range(len(bands)), key=lambda i: abs(bands[i] - value))

    roots = [min(s.root_r for s in rnd) for rnd in rounds]
    heads = [statistics.median(s.head_r for s in rnd) for rnd in rounds]

    chains = [s for s in stitches if s.cls == "ch"]
    for group in _group_by_angle(chains) if chains else []:
        rounds[nearest(roots, min(s.root_r for s in group))].extend(group)
    for s in stitches:
        if s.cls == "slst":
            rounds[nearest(heads, s.root_r)].append(s)
    return rounds


def is_closing_slst(s: Stitch, start_theta: float) -> bool:
    """단을 닫는 빼뜨기인가. 기둥사슬 머리에 꽂히므로 시작 각도에 겹쳐 있다."""
    rel = (s.theta - start_theta) % TWO_PI
    return s.cls == "slst" and min(rel, TWO_PI - rel) < CLOSE_TOL


def order_round(round_items: list[Stitch], start: RoundStart) -> list[Stitch]:
    """시작점을 0으로 삼아 반시계 방향 정렬. 기둥사슬은 빼고 돌려준다.

    기둥사슬은 코가 아니라 시작 표식이다 (대체하는 코는 start.substitutes_stitch).
    단을 닫는 빼뜨기는 시작 각도에 겹치지만 순서상 마지막이다.

    시계 방향으로 읽는 도안(왼손잡이 표기 등)이면 결과를 reversed() 하면 된다.
    """
    chain = set(start.chain_ids)
    return sorted((s for s in round_items if s.id not in chain), key=lambda s: _key(s, start.theta))


def _key(s: Stitch, start_theta: float) -> float:
    if is_closing_slst(s, start_theta):
        return TWO_PI  # 맨 뒤로
    return (s.theta - start_theta) % TWO_PI


def link_round(cur: list[Stitch], prev: list[Stitch], start: RoundStart) -> list[Link]:
    """각 코가 이전 단 어느 코에 꽂혔는지 잇고 늘림/줄임을 판정한다.

    코는 자기가 꽂힌 코 바로 위에 선다 → 각도가 가장 가까운 이전 단 코가 답이다.
    한 코에 둘이 꽂혔으면 늘림, 아무도 안 꽂힌 이전 단 코는 옆 코와 함께 먹혔으니 줄임.

    기둥사슬은 cur 에 없지만(order_round 가 뺀다) 부모 한 자리를 먹는다. 그 자리를
    미리 찜해두지 않으면 고아로 남아 가짜 줄임이 된다.

    첫 단(prev 없음)은 매직링에 꽂히므로 into=[] 가 정상이다. 예외 없음.

    ponytail: 레이스 도안에서 사슬 아치가 건너뛴 코도 '아무도 안 꽂힘'으로 보여
    줄임으로 오판한다. 사슬 공간(ch-sp) 개념이 들어오면 그때 갈라낼 것.
    """
    start_theta = start.theta
    links = [Link(s.id) for s in cur]
    if not prev:
        for s, link in zip(cur, links):
            if is_closing_slst(s, start_theta):
                link.op = "join"
        return links

    receivers: dict[int, list[int]] = {}
    if start.chain_ids:  # 기둥사슬이 먹은 자리. -1 은 '코는 있는데 cur 에 없다'는 표식
        receivers[min(prev, key=lambda p: ang_dist(start_theta, p.theta)).id] = [-1]

    for i, s in enumerate(cur):
        if is_closing_slst(s, start_theta):
            links[i].op = "join"
            continue
        p = min(prev, key=lambda p: ang_dist(s.theta, p.theta))
        links[i].into.append(p.id)
        receivers.setdefault(p.id, []).append(i)

    workers = [i for i, link in enumerate(links) if link.op != "join"]
    for p in prev:
        if p.id in receivers or not workers:
            continue
        links[min(workers, key=lambda i: ang_dist(cur[i].theta, p.theta))].into.append(p.id)

    for link in links:
        if link.op == "join":
            continue
        if len(link.into) > 1:
            link.op = "dec"
        elif link.into and len(receivers[link.into[0]]) > 1:
            link.op = "inc"
    return links
