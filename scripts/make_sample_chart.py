"""합성 도안 생성기 — crochet_rulepart 검증용 입력을 만든다.

레포에 data/sample.png 가 없어서(원본은 crochet-rulepart 레포에 있다) 파이프라인이
로컬에서 도는지 확인할 수 없다. 그래서 detect/chart.py 가 기대하는 규칙에 맞춰
1단 원형 모티브를 직접 그린다.

    python scripts/make_sample_chart.py

기대 결과 (crochet_rulepart/README.md 의 예시와 동일):
    1단: 사슬 3(=한길긴뜨기 1코), 한길긴뜨기 14, 빼뜨기로 마무리 (15코)

detect/chart.py 가 의존하는 성질을 그대로 지킨다:
  - 매직링 내부가 가장 큰 '구멍' → 도안 중심과 링 반지름
  - 사슬 = 닫힌 타원(= 구멍) 하나
  - 코 기호끼리 서로 닿지 않는다 (연결요소가 곧 기호 하나)
  - 기둥 + 빗금 1개 + T머리 1개 = 가로획 2개 → dc
  - 기둥사슬 3개가 반지름 방향으로 쌓임 → 시작점, dc 1코를 대체
  - 시작 각도에 놓인 속 찬 점 = 단을 닫는 빼뜨기
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

SS = 3  # 초과샘플 배율. 3배로 그린 뒤 축소해 경계에 회색을 만든다.
# 완전 이진(0/255뿐) 이미지는 detect.chart._otsu 가 임계값 0을 돌려주는 바람에
# 잉크가 0픽셀이 되어 "중심 고리를 못 찾았다" 로 죽는다. 실제 스캔본에는 항상
# 안티에일리어싱 회색이 있으므로, 검증 입력도 그 성질을 갖추게 한다.

W, H = 960, 910
CX, CY = 480.0, 455.0

RING_OUTER = 62  # 매직링 바깥 반지름
RING_INNER = 57  # 링 내부 구멍 → r_ring ≈ 57, 면적 ≈ 10200px (MIN_BLOB_PX*4 훨씬 초과)

SLOTS = 15  # 한 단의 코 자리 수 (기둥사슬 1 + dc 14)
START_DEG = 56.0  # README 예시의 start_deg

ROOT_R = 170.0  # dc 뿌리 반지름
HEAD_R = 428.0  # dc 머리 반지름
STEM_W = 7  # 기둥 두께 (가로획 판정의 기준 폭)

BAR_HALF = 22  # T머리 / 빗금 반쪽 길이 → 호 폭 44px ≈ 기둥의 6배 (BAR_WIDE=2.2 초과)
BAR_W = 7
SLASH_R = 300.0  # 빗금 반지름 (기둥 중간)
HEAD_BAR_R = 424.0  # T머리 반지름 (기둥 맨 바깥)

CHAIN_RS = (200.0, 265.0, 330.0)  # 기둥사슬 3개가 쌓이는 반지름
CHAIN_A = 26  # 접선 방향 반장축
CHAIN_B = 15  # 반지름 방향 반단축
CHAIN_S = 4  # 선 두께

SLST_R = 428.0  # 마무리 빼뜨기 위치 (dc 머리 높이)
SLST_RAD = 11  # 속 찬 점 반지름 → 면적 ≈ 380px

BLACK = 0
WHITE = 255


def unit(deg: float) -> tuple[float, float]:
    """각도 deg 의 반지름 방향 단위벡터 (화면 좌표, y 는 아래로 증가).

    detect/chart.py 의 TH = arctan2(cy - Y, X - cx) 와 같은 규약이다.
    """
    t = math.radians(deg)
    return math.cos(t), -math.sin(t)


def tangent(deg: float) -> tuple[float, float]:
    """반지름 방향에 수직인 단위벡터."""
    t = math.radians(deg)
    return math.sin(t), math.cos(t)


def at(deg: float, r: float) -> tuple[float, float]:
    """논리 좌표(각도, 반지름) → 초과샘플된 캔버스 픽셀 좌표."""
    ux, uy = unit(deg)
    return (CX + r * ux) * SS, (CY + r * uy) * SS


def draw_bar(dr: ImageDraw.ImageDraw, deg: float, r: float, half: int, width: int) -> None:
    """반지름 r 에서 접선 방향으로 뻗은 가로획. _bars 가 세는 대상이다."""
    px, py = at(deg, r)
    tx, ty = tangent(deg)
    h = half * SS
    dr.line(
        [px - h * tx, py - h * ty, px + h * tx, py + h * ty],
        fill=BLACK,
        width=width * SS,
    )


def draw_dc(dr: ImageDraw.ImageDraw, deg: float) -> None:
    """한길긴뜨기: 기둥 + 빗금 1개 + T머리 1개 → 가로획 2개 → CLASS_BY_BARS[1]."""
    dr.line([*at(deg, ROOT_R), *at(deg, HEAD_R)], fill=BLACK, width=STEM_W * SS)
    draw_bar(dr, deg, SLASH_R, BAR_HALF, BAR_W)
    draw_bar(dr, deg, HEAD_BAR_R, BAR_HALF, BAR_W)


def ellipse_pts(deg: float, r: float, a: float, b: float) -> list[tuple[float, float]]:
    """접선 방향으로 누운 타원 둘레. 회전 붙여넣기 없이 좌표로 직접 만든다."""
    cx, cy = at(deg, r)
    tx, ty = tangent(deg)
    ux, uy = unit(deg)
    pts = []
    for i in range(72):
        t = 2 * math.pi * i / 72
        ca, sb = a * SS * math.cos(t), b * SS * math.sin(t)
        pts.append((cx + ca * tx + sb * ux, cy + ca * ty + sb * uy))
    return pts


def draw_chain(dr: ImageDraw.ImageDraw, deg: float, r: float) -> None:
    """사슬: 속이 빈 타원. 내부 흰 영역이 binary_fill_holes 에서 '구멍'이 된다."""
    dr.polygon(ellipse_pts(deg, r, CHAIN_A + CHAIN_S, CHAIN_B + CHAIN_S), fill=BLACK)
    dr.polygon(ellipse_pts(deg, r, CHAIN_A, CHAIN_B), fill=WHITE)


def main() -> None:
    img = Image.new("L", (W * SS, H * SS), WHITE)
    dr = ImageDraw.Draw(img)

    # 매직링: 도넛. 내부 구멍이 도안 전체에서 가장 큰 구멍이어야 한다.
    for rad, col in ((RING_OUTER, BLACK), (RING_INNER, WHITE)):
        dr.ellipse(
            [(CX - rad) * SS, (CY - rad) * SS, (CX + rad) * SS, (CY + rad) * SS],
            fill=col,
        )

    step = 360.0 / SLOTS
    # 0번 자리는 기둥사슬이 차지한다. dc 는 1..14 번 자리.
    for k in range(1, SLOTS):
        draw_dc(dr, START_DEG + k * step)

    for r in CHAIN_RS:
        draw_chain(dr, START_DEG, r)

    # 단을 닫는 빼뜨기: 시작 각도, dc 머리 높이의 속 찬 점.
    sx, sy = at(START_DEG, SLST_R)
    rad = SLST_RAD * SS
    dr.ellipse([sx - rad, sy - rad, sx + rad, sy + rad], fill=BLACK)

    # 축소하면서 경계 픽셀이 회색이 된다 → Otsu 가 제대로 골을 찾는다.
    img = img.resize((W, H), Image.BOX)

    data = Path(__file__).resolve().parent.parent / "crochet_rulepart" / "data"
    data.mkdir(parents=True, exist_ok=True)

    out = data / "sample.png"
    img.save(out)
    print(out)

    print(make_blank(data / "not-a-chart.png"))


def make_blank(out: Path) -> Path:
    """도안이 아닌 이미지. 중심 고리가 없어 ValueError 가 나는 경로를 확인한다.

    잉크는 있어야 한다(이진화 자체는 되게). 다만 닫힌 영역이 없어서 '구멍'이
    하나도 안 잡히므로 load_chart 가 중심을 못 찾고 예외를 던진다.
    """
    img = Image.new("L", (300 * SS, 300 * SS), WHITE)
    dr = ImageDraw.Draw(img)
    for i in range(4):
        y = (60 + i * 50) * SS
        dr.line([40 * SS, y, 260 * SS, y], fill=BLACK, width=8 * SS)
    img.resize((300, 300), Image.BOX).save(out)
    return out


if __name__ == "__main__":
    main()
