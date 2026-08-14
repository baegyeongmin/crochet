"""파서 스테이지 2 데이터 모델. 인식(스테이지 1) 모듈을 import 하지 않는다."""

from dataclasses import dataclass, field


@dataclass
class Stitch:
    """단 분리까지 끝난 기호 하나. 극좌표가 계산된 상태로 들어온다."""

    id: int
    cls: str  # "ch" | "sc" | "hdc" | "dc" | "tr" | "slst"
    r: float
    theta: float  # [0, 2π)
    root_r: float
    head_r: float


@dataclass
class Link:
    """이 코가 이전 단의 어느 코에 꽂혔는가."""

    stitch_id: int
    into: list[int] = field(default_factory=list)  # 이전 단 코 id (줄임이면 2개 이상)
    op: str = "plain"  # "plain" | "inc" | "dec" | "join"(단을 닫는 빼뜨기)


@dataclass
class RoundStart:
    theta: float
    source: str  # "turning_chain" | "prev_round" | "none"
    chain_ids: list[int] = field(default_factory=list)
    substitutes_stitch: str | None = None
    confidence: float = 0.0
