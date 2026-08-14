# crochet_rulepart

코바늘 원형 모티브 **도안 이미지 → 뜨개 텍스트**. 규칙 기반, 학습 모델 없음.

파이프라인 중간 토막이다. 이미지 한 장 넣으면 결과 한 덩어리가 나오고 끝난다.
상태를 들고 있지 않으므로 서버로 띄울 필요 없이 필요할 때 한 번 부르면 된다.

## 설치

```bash
pip install -r requirements.txt      # numpy, scipy, pillow
```

## 부르는 법

**파이썬에서:**

```python
from crochet_rulepart.crochet import parse_chart

result = parse_chart("도안.png")
print(result["text"])
```

**Node / 그 외에서 (stdout 으로 JSON):**

```bash
python crochet_rulepart/crochet.py 도안.png --json
```

```js
const { execFile } = require("node:child_process");
execFile("python", ["crochet_rulepart/crochet.py", imgPath, "--json"],
  (err, stdout) => { const result = JSON.parse(stdout); });
```

`--json` 일 때 stdout 에는 JSON 말고 아무것도 안 찍는다.

## 반환 형태

```json
{
  "text": "1단: 사슬 3(=한길긴뜨기 1코), 한길긴뜨기 14, 빼뜨기로 마무리 (15코)",
  "rounds": [
    { "n": 1, "text": "사슬 3(=한길긴뜨기 1코), ...", "count": 15,
      "warnings": [], "start_deg": 56.0,
      "source": "turning_chain", "confidence": 1.0 }
  ],
  "stitches": [ { "id": 0, "cls": "dc", "r": 299.2, "theta": 1.02,
                  "root_r": 170.5, "head_r": 427.9 } ],
  "center": { "x": 479.8, "y": 455.2 },
  "confidence": 1.0,
  "warnings": []
}
```

- `text` — 그대로 화면에 뿌리면 되는 전체 결과
- `rounds[].warnings` — 파싱이 미심쩍은 지점. **비어 있으면 깨끗하게 읽혔다는 뜻**
- `confidence` — 전 단 중 최저값. 0.5 이하면 사람이 확인하는 게 좋다
- `stitches` — 검출된 기호 전부 (극좌표). 오버레이나 교정 UI 에 쓸 것

## 에러

원형 모티브 도안이 아니거나 이진화가 안 되면 `ValueError` 를 던진다. 메시지에
무엇을 확인해야 하는지 적혀 있으니 그대로 사용자에게 보여주면 된다.
그 외에는 예외를 던지지 않는다 — 못 읽은 단은 `warnings` 로 나온다.

## 검출 확인용 그림 (선택)

```bash
python crochet_rulepart/crochet.py 도안.png 결과.png
```

원본 위에 검출된 코와 시작점을 그려서 저장한다. 상수 튜닝하거나 시연할 때 쓴다.

## 알려진 한계

1. **레이스 도안(사슬 아치)은 아직 깨진다.** 아치가 낱개 사슬로 흩어져 나온다.
   기본 원형 모티브는 정상이다.
2. **여러 단 도안은 합성 데이터로만 검증했다.** 실물은 한 단짜리로만 확인했다.
3. 연속한 두 단의 기둥사슬이 정확히 같은 각도면 한쪽 단에 몰린다.

소스 원본과 테스트 20개는 `crochet-rulepart` 레포에 있다.
