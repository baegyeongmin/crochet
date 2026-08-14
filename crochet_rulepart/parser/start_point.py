"""단 시작점(기둥사슬) 탐지. 순수 함수 — I/O도 전역 상태도 없다."""

import math

import numpy as np

from .models import RoundStart, Stitch

TWO_PI = 2 * math.pi

ANG_TOL = 0.15  # 사슬 그룹핑 각도 허용치 (rad)
RADIAL_RATIO_MIN = 1.0  # 기둥사슬 판정 임계값
RATIO_CONFIDENT = 3.0  # 이 이상이면 confidence 1.0
MIN_CHAIN_IN_STACK = 2  # 기둥사슬로 인정할 최소 사슬 개수

_SUBSTITUTES = {2: "hdc", 3: "dc", 4: "tr"}


def ang_dist(a: float, b: float) -> float:
    d = abs(a - b) % TWO_PI
    return min(d, TWO_PI - d)


def _circular_mean(thetas: list[float]) -> float:
    s = sum(math.sin(t) for t in thetas)
    c = sum(math.cos(t) for t in thetas)
    return math.atan2(s, c) % TWO_PI


def _group_by_angle(chains: list[Stitch]) -> list[list[Stitch]]:
    """theta 인접 사슬끼리 묶는다. 0/2π 경계에서 갈라진 양 끝 그룹은 병합."""
    chains = sorted(chains, key=lambda s: s.theta)
    groups: list[list[Stitch]] = [[chains[0]]]
    for prev, cur in zip(chains, chains[1:]):
        if ang_dist(prev.theta, cur.theta) <= ANG_TOL:
            groups[-1].append(cur)
        else:
            groups.append([cur])

    if len(groups) > 1 and ang_dist(groups[-1][-1].theta, groups[0][0].theta) <= ANG_TOL:
        groups[0] = groups.pop() + groups[0]
    return groups


def _radial_ratio(group: list[Stitch]) -> float:
    """반지름 방향 퍼짐 / 접선 방향 퍼짐(픽셀 환산). 클수록 기둥사슬."""
    r = np.array([s.r for s in group])
    mean_r = float(r.mean())
    # 원 평균 기준으로 [-π, π)에 펼친다 (np.unwrap과 같은 목적, 순서에 무관).
    m = _circular_mean([s.theta for s in group])
    centered = np.array([(s.theta - m + math.pi) % TWO_PI - math.pi for s in group])

    r_spread = float(r.std())
    arc_spread = float(centered.std()) * mean_r
    return r_spread / (arc_spread + 1e-6)


def detect_round_start(
    round_items: list[Stitch],
    prev_start_theta: float | None = None,
) -> RoundStart:
    """한 단의 시작 각도를 기둥사슬로부터 찾는다. 못 찾으면 폴백(예외 없음)."""
    chains = [s for s in round_items if s.cls == "ch"]

    candidates: list[tuple[list[Stitch], float]] = []
    if chains:
        for g in _group_by_angle(chains):
            if len(g) < MIN_CHAIN_IN_STACK:
                continue
            ratio = _radial_ratio(g)
            if ratio > RADIAL_RATIO_MIN:
                candidates.append((g, ratio))

    if not candidates:
        if prev_start_theta is not None:
            return RoundStart(prev_start_theta % TWO_PI, "prev_round", confidence=0.3)
        return RoundStart(0.0, "none", confidence=0.0)

    def rank(item: tuple[list[Stitch], float]) -> tuple:
        g, _ = item
        theta = _circular_mean([s.theta for s in g])
        near_prev = ang_dist(theta, prev_start_theta) if prev_start_theta is not None else 0.0
        return (-len(g), near_prev, theta)

    group, ratio = min(candidates, key=rank)

    confidence = 1.0 if ratio > RATIO_CONFIDENT else 0.6
    if len(candidates) > 1:
        confidence = min(confidence, 0.5)

    return RoundStart(
        theta=_circular_mean([s.theta for s in group]),
        source="turning_chain",
        chain_ids=[s.id for s in group],
        substitutes_stitch=_SUBSTITUTES.get(len(group)),
        confidence=confidence,
    )
