"""도안 이미지 → Stitch[]. 연결요소와 구멍만 쓴다. 학습도 템플릿도 없다.

실물 도안(data/sample.png)을 재보고 정한 방침:

- 코 기호끼리는 서로 닿지 않는다 → ndimage.label 이 정확한 마스크를 준다.
  회전 템플릿 매칭보다 간단하고 실측에서 더 정확했다.
- 사슬(ch)은 닫힌 타원 = '구멍'이다 → 구멍을 세면 사슬 개수가 정확히 나온다.
  사슬끼리 붙어 한 덩어리가 돼도 개수가 흐트러지지 않는다.
- 매직링 내부도 구멍이며, 가장 큰 구멍이다 → 도안 중심을 그냥 준다.
  검출 좌표에 원을 맞추는 것보다 정확하다.
- 코의 각도는 bbox 중심이 아니라 픽셀 무게중심으로 잰다. T머리가 달린 기호는
  회전하면 bbox 중심이 밀린다 (실측: 간격 std 4.6도 -> 2.4도).

ponytail: 기호가 서로 닿는 도안(촘촘한 레이스, 여러 단이 맞붙는 경우)에서는
연결요소가 뭉친다. 그때는 뭉친 덩어리에만 회전 템플릿 매칭을 돌리는 쪽으로.
지금 도안은 전부 떨어져 있어서 필요 없다.
"""

import math

import numpy as np
from PIL import Image
from scipy import ndimage

from parser.models import Stitch

TWO_PI = 2 * math.pi

BORDER_INK = 0.8  # 이 비율 이상 잉크인 행/열은 캡처 테두리로 보고 자른다
MIN_BLOB_PX = 300  # 이보다 작은 덩어리/구멍은 잡티로 본다
RING_CLEAR = 1.15  # 링 반지름의 이 배 안쪽은 링 자체로 보고 무시
PROFILE_BINS = 24  # 폭 프로파일을 재는 반지름 방향 구간 수
BAR_WIDE = 2.2  # 기둥 폭의 이 배를 넘으면 가로획(빗금/T머리)
SHORT_FRAC = 0.35  # 길이가 중앙값의 이 배 미만이면 기둥 없는 기호

# 기둥에 그어진 빗금 개수 = 코 종류. 코바늘 표기의 표준 규칙이다.
# (프로파일의 가장 바깥 가로획은 T머리이므로 빗금 = 가로획 수 - 1)
CLASS_BY_BARS = {0: "hdc", 1: "dc", 2: "tr", 3: "dtr"}


def _otsu(a: np.ndarray) -> float:
    """양봉 히스토그램의 골을 찾는다. 스캔본의 회색 배경도 견디도록."""
    hist, _ = np.histogram(a, bins=256, range=(0, 256))
    total = hist.sum()
    w = np.cumsum(hist)
    m = np.cumsum(hist * np.arange(256))
    ok = (w > 0) & (total - w > 0)
    between = np.zeros(256)
    between[ok] = (m[-1] * w[ok] / total - m[ok]) ** 2 / (w[ok] * (total - w[ok]))
    return float(np.argmax(between))


def _crop_border(ink: np.ndarray) -> tuple[slice, slice]:
    """화면 캡처에 딸려온 검은 띠를 떨어낸다."""
    rows = np.nonzero(ink.mean(axis=1) <= BORDER_INK)[0]
    cols = np.nonzero(ink.mean(axis=0) <= BORDER_INK)[0]
    if not len(rows) or not len(cols):
        return slice(None), slice(None)
    return slice(rows[0], rows[-1] + 1), slice(cols[0], cols[-1] + 1)


def _polar(mask: np.ndarray, R: np.ndarray, TH: np.ndarray) -> tuple[float, float, float]:
    """마스크 한 덩어리의 (theta, root_r, head_r).

    theta 는 픽셀 각도의 원 평균. root/head 는 1/99 백분위 — 최소/최대를 그대로
    쓰면 안티에일리어싱 픽셀 하나에 끌려간다.
    """
    rr, tt = R[mask], TH[mask]
    theta = math.atan2(float(np.sin(tt).mean()), float(np.cos(tt).mean())) % TWO_PI
    return theta, float(np.percentile(rr, 1)), float(np.percentile(rr, 99))


def _bars(mask: np.ndarray, R: np.ndarray, TH: np.ndarray, r0: float, r1: float) -> int:
    """기둥을 뿌리에서 머리로 훑으며 가로획 개수를 센다.

    각 반지름 구간에서 기호가 차지하는 호 길이를 재면, 기둥은 좁고(획 두께)
    빗금과 T머리는 넓다. 넓은 구간이 몇 덩어리인지가 곧 가로획 개수다.
    실측(data/sample.png): dc 14개 전부 2 (빗금 1 + T머리 1), 기둥 폭 15~18px.
    """
    rr, tt = R[mask], TH[mask]
    mean_th = math.atan2(float(np.sin(tt).mean()), float(np.cos(tt).mean()))
    dt = (tt - mean_th + math.pi) % TWO_PI - math.pi  # 0/2pi 경계에서 펴기

    edges = np.linspace(r0, r1, PROFILE_BINS + 1)
    prof = np.zeros(PROFILE_BINS)
    for i in range(PROFILE_BINS):
        sel = (rr >= edges[i]) & (rr < edges[i + 1])
        if sel.sum() >= 3:
            prof[i] = float(dt[sel].max() - dt[sel].min()) * (edges[i] + edges[i + 1]) / 2

    pos = prof[prof > 0]
    if not len(pos):
        return 0
    return int(ndimage.label(prof > float(np.median(pos)) * BAR_WIDE)[1])


def load_chart(path: str) -> tuple[list[Stitch], tuple[float, float]]:
    """도안 이미지에서 코를 뽑는다. (Stitch 목록, 도안 중심) 반환.

    한 단짜리 도안 기준이다. 여러 단이면 반환된 Stitch 를 r 로 나눈 뒤
    (split_rounds) 단별로 detect_round_start 에 넘겨야 한다.
    """
    gray = np.asarray(Image.open(path).convert("L"), dtype=float)
    ink = gray < _otsu(gray)
    ink = ink[_crop_border(ink)]

    holes = ndimage.binary_fill_holes(ink) & ~ink
    hl, hn = ndimage.label(holes)
    hsz = ndimage.sum(holes, hl, range(1, hn + 1))

    # 가장 큰 구멍 = 도안 중심의 고리(매직링이든 사슬 고리든) 내부.
    # 중심과 링 반지름을 바로 준다 — 검출 좌표에 원을 맞추는 것보다 정확하다.
    if not hn or hsz.max() <= MIN_BLOB_PX * 4:
        raise ValueError(
            f"{path}: 중심 고리를 못 찾았다. 원형 모티브 도안이 맞는지, "
            "이진화가 됐는지(배경이 너무 어둡지 않은지) 확인할 것."
        )
    ring = int(np.argmax(hsz)) + 1
    cy, cx = ndimage.center_of_mass(hl == ring)
    r_ring = math.sqrt(float(hsz[ring - 1]) / math.pi)

    Y, X = np.mgrid[0 : ink.shape[0], 0 : ink.shape[1]]
    R = np.hypot(X - cx, Y - cy)
    TH = np.arctan2(cy - Y, X - cx) % TWO_PI

    out: list[Stitch] = []
    chain_holes = np.zeros_like(ink)

    # --- 사슬: 링 밖의 충분히 큰 구멍 하나 = 사슬 하나 ---
    for k in range(hn):
        if k + 1 == ring or hsz[k] < MIN_BLOB_PX:
            continue
        m = hl == k + 1
        if R[m].mean() < r_ring * RING_CLEAR:
            continue  # 링 이중선 사이의 틈
        chain_holes |= m
        theta, r0, r1 = _polar(m, R, TH)
        out.append(Stitch(len(out), "ch", (r0 + r1) / 2, theta, r0, r1))

    # --- 나머지 코: 링 밖 연결요소를 모양으로 분류한다 ---
    lbl, n = ndimage.label(ink & (R > r_ring * RING_CLEAR))
    sz = ndimage.sum(ink, lbl, range(1, n + 1))

    blobs = []
    for k in range(n):
        if sz[k] < MIN_BLOB_PX:
            continue  # 커서 자국 같은 잡티
        m = lbl == k + 1
        if (ndimage.binary_fill_holes(m) & chain_holes).any():
            continue  # 사슬이 든 덩어리 — 위에서 구멍으로 이미 셌다
        blobs.append((m, *_polar(m, R, TH)))

    if blobs:
        med_len = float(np.median([r1 - r0 for _, _, r0, r1 in blobs]))
        for m, theta, r0, r1 in blobs:
            if r1 - r0 < med_len * SHORT_FRAC:
                # 기둥이 없는 기호. 속이 찬 점이면 빼뜨기, 획이 있으면 짧은뜨기.
                cls = "slst" if _bars(m, R, TH, r0, r1) == 0 else "sc"
            else:
                cls = CLASS_BY_BARS.get(_bars(m, R, TH, r0, r1) - 1, "?")
            out.append(Stitch(len(out), cls, (r0 + r1) / 2, theta, r0, r1))

    return out, (float(cx), float(cy))


COLORS = {"ch": (0, 140, 255), "dc": (255, 40, 40), "hdc": (255, 150, 0),
          "tr": (190, 0, 190), "sc": (0, 170, 60), "slst": (120, 60, 0), "?": (0, 0, 0)}


def overlay(path: str, out_path: str) -> str:
    """검출 결과를 원본 위에 그려 저장한다. 상수 튜닝할 때 눈으로 보는 용도.

    좌표는 전부 load_chart / detect_round_start 출력이다. 극좌표를 화면 좌표로
    되돌리기만 하므로, 선이 획 위에 얹히면 검출이 맞다는 뜻이다.
    """
    from PIL import ImageDraw

    from parser.start_point import detect_round_start

    stitches, (cx, cy) = load_chart(path)
    start = detect_round_start(stitches)

    gray = np.asarray(Image.open(path).convert("L"), dtype=float)
    ink = gray < _otsu(gray)
    vis = Image.fromarray(gray[_crop_border(ink)].astype(np.uint8)).convert("RGB")
    dr = ImageDraw.Draw(vis)

    for s in stitches:
        c = COLORS.get(s.cls, (0, 0, 0))
        pts = [(cx + r * math.cos(s.theta), cy - r * math.sin(s.theta)) for r in (s.root_r, s.head_r)]
        dr.line([*pts[0], *pts[1]], fill=c, width=4)
        for px, py in pts:
            dr.ellipse([px - 6, py - 6, px + 6, py + 6], fill=c)

    reach = max((s.head_r for s in stitches), default=100.0) * 1.05
    dr.line([cx, cy, cx + reach * math.cos(start.theta), cy - reach * math.sin(start.theta)],
            fill=(0, 190, 0), width=6)
    dr.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=(0, 190, 0))
    vis.save(out_path)
    return out_path


if __name__ == "__main__":
    import collections
    import sys

    src = sys.argv[1] if len(sys.argv) > 1 else "data/sample.png"
    dst = sys.argv[2] if len(sys.argv) > 2 else "data/_result.png"

    stitches, (cx, cy) = load_chart(src)
    from parser.start_point import detect_round_start

    start = detect_round_start(stitches)
    print(f"중심   ({cx:.1f}, {cy:.1f})")
    print(f"기호   {dict(collections.Counter(s.cls for s in stitches))}")
    print(f"시작   {math.degrees(start.theta):.1f}deg  {start.source}  "
          f"substitutes={start.substitutes_stitch}  conf={start.confidence}")
    print(f"그림   {overlay(src, dst)}")
