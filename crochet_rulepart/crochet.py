"""도안 이미지 → 뜨개 텍스트. 검출부와 파서부가 만나는 유일한 자리.

메인 프로젝트는 이 파일 하나만 보면 된다:

    from crochet import parse_chart
    result = parse_chart("도안.png")      # 그대로 jsonify 가능한 dict

CLI 로도 쓸 수 있다 (Node 에서 spawn 할 때는 --json):

    python crochet.py 도안.png                 # 텍스트만
    python crochet.py 도안.png --json          # stdout 으로 JSON 통째
    python crochet.py 도안.png 결과.png        # 검출 확인용 그림도 저장
"""

import sys
from dataclasses import asdict
from pathlib import Path

# 이 폴더를 통째로 남의 프로젝트에 떨궈도 detect/parser 가 잡히게 한다.
# 없으면 CLI 로는 되는데 `from crochet_rulepart.crochet import ...` 만 깨진다.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from detect.chart import load_chart, overlay  # noqa: E402
from parser.pattern import parse, render  # noqa: E402


def parse_chart(image_path: str) -> dict:
    """도안 한 장을 파싱한다. 반환값은 전부 JSON 직렬화 가능한 값이다.

    - text     : 화면에 그대로 뿌릴 전체 텍스트
    - rounds   : 단별 결과 (n, text, count, warnings, start_deg, source, confidence)
    - stitches : 검출된 기호 전부. 오버레이나 교정 UI 용
    - warnings : 전 단의 경고를 모은 것. 비어 있으면 파싱이 깨끗했다는 뜻
    """
    stitches, (cx, cy) = load_chart(image_path)
    rounds = parse(stitches)
    return {
        "text": render(rounds),
        "rounds": rounds,
        "stitches": [asdict(s) for s in stitches],
        "center": {"x": cx, "y": cy},
        "confidence": min((r["confidence"] for r in rounds), default=0.0),
        "warnings": [w for r in rounds for w in r["warnings"]],
    }


if __name__ == "__main__":
    import json

    args = [a for a in sys.argv[1:] if a != "--json"]
    src = args[0] if args else "data/sample.png"
    result = parse_chart(src)

    if "--json" in sys.argv:
        # Node 에서 spawn 해 파싱할 출력이다. 여기에 다른 걸 절대 같이 찍지 말 것.
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(result["text"])
        if len(args) > 1:
            print(f"\n검출 확인용 그림: {overlay(src, args[1])}")
