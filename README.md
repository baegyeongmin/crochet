# 코바늘 도안 노트

도안 이미지를 올리면 뜨개 텍스트로 읽어주고, 그 결과를 저장/관리하는 사이트.

두 덩어리로 되어 있다:

- **Next.js 앱** (`app/`, `lib/`) — 로그인, 도안 CRUD
- **`crochet_rulepart`** (Python) — 도안 이미지 → 뜨개 텍스트. 규칙 기반, 학습 모델 없음.
  요청마다 서브프로세스로 부른다 (`lib/chart-parse.ts` → `app/api/patterns/parse`)
- **AI 다듬기** (선택) — 인식된 기계적인 문장을 Claude Haiku 로 읽기 좋게 고친다
  (`lib/polish.ts` → `app/api/patterns/polish`)

```
도안 이미지 ──► crochet_rulepart ──► "한길긴뜨기 14"      ← 정확하지만 기계적
                    (규칙 기반)              │
                                            ▼
                              Claude Haiku ──► "한길긴뜨기 14코"  ← 읽기 좋음
                                 (선택)
```

인식은 규칙 기반이 담당하고 모델은 말투만 만진다. 코 수를 모델이 바꿔버리면
도안이 망가지므로, 다듬은 결과의 단 번호·총 코 수·경고 줄을 원본과 대조해서
어긋나면 버리고 원본을 유지한다 (`lib/polish.ts` 의 `keepsNumbers`).

## 로컬 실행

### 1. Node 의존성

```bash
npm install
```

### 2. 파이썬 분석기

`crochet_rulepart` 는 numpy/scipy/pillow 가 필요하다.

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r crochet_rulepart/requirements.txt
```

### 3. 환경변수

`.env.local.example` 을 보고 `.env.local` 을 만든다. 세 개가 필요하다.

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | SQLite 파일 경로. **절대경로로 쓸 것** (아래 주의사항) |
| `AUTH_SECRET` | NextAuth 서명 키. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `PYTHON_BIN` | 위에서 만든 venv 의 파이썬. 생략하면 PATH 의 `python` |
| `ANTHROPIC_API_KEY` | **선택.** AI 다듬기용. 없으면 그 버튼만 비활성화되고 나머지는 정상 동작 |
| `ANTHROPIC_MODEL` | 선택. 생략하면 `claude-haiku-4-5-20251001` |

> **주의 — Windows 에서 `DATABASE_URL` 은 절대경로여야 한다.**
> `file:./prisma/dev.db` 처럼 상대경로를 쓰면 Prisma CLI 와 Next.js 런타임이
> 서로 다른 기준 디렉터리로 해석해서 `unable to open the database file` 이 난다.
> `file:C:/path/to/crochet/prisma/dev.db` 형태로 적을 것.

### 4. DB 준비

Prisma 클라이언트는 `app/generated/prisma` 로 생성되며 git 에 올라가지 않는다.
받아온 직후에는 반드시 한 번 생성해야 한다.

```bash
npx prisma generate
npx prisma migrate deploy
```

### 5. 실행

```bash
npm run dev        # http://localhost:3000
```

## 점검

```bash
npm run lint
npm run typecheck
npm test              # lib/*.test.ts
npm run chart:sample  # 합성 도안 생성 (crochet_rulepart/data/)
npm run verify        # dev 서버가 떠 있어야 한다. 종단간 점검
```

`npm run verify` 는 회원가입 → 로그인 → 도안 이미지 분석 → 저장 → 조회 →
삭제까지 실제 HTTP 로 훑는다. 각 단계를 PASS/FAIL 로 찍는다.

### 합성 도안이 필요한 이유

`crochet_rulepart` 의 원본 샘플 이미지(`data/sample.png`)와 파이썬 테스트 20개는
별도 `crochet-rulepart` 레포에 있고 이 레포에는 없다. 그래서
`scripts/make_sample_chart.py` 가 검출기 규칙에 맞는 1단 원형 모티브를 직접
그려서 검증 입력으로 쓴다. 기대 출력은 `crochet_rulepart/README.md` 의 예시와
같다:

```
1단: 사슬 3(=한길긴뜨기 1코), 한길긴뜨기 14, 빼뜨기로 마무리 (15코)
```

검출이 눈으로 맞는지 보려면:

```bash
.venv/Scripts/python.exe crochet_rulepart/crochet.py crochet_rulepart/data/sample.png out.png
```

원본 위에 검출된 코(빨강)와 단 시작점(초록)을 그려서 저장한다.

## AI 다듬기

`ANTHROPIC_API_KEY` 를 넣으면 `/patterns/new` 에 "AI로 문장 다듬기" 버튼이 켜진다.
키가 없으면 버튼이 비활성화되고 안내만 뜬다 — 앱의 다른 기능은 영향받지 않는다.

모델에 허용한 것과 막은 것:

| | |
| --- | --- |
| 허용 | 조사·어미 다듬기, 쉼표/띄어쓰기 정리, 반복 구간 표현 개선 |
| 금지 | 숫자 변경, 단 개수/순서 변경, 없는 정보(실 굵기·바늘 호수·게이지) 추가 |

금지 항목은 프롬프트로만 부탁하지 않고 응답을 기계로 검사한다. 단 번호, 괄호 안
총 코 수, `⚠` 경고 줄이 원본과 순서까지 같지 않으면 결과를 버리고 422 로 돌려준다.
이 판정 로직은 `lib/polish.test.ts` 에서 12개 경우로 검증한다 (`npm test`).

다듬은 뒤에도 화면에서 **되돌리기**로 원본으로 복구할 수 있다.

## 아직 없는 것

- 도안 **수정** — 스키마에 `updatedAt` 은 있지만 `PUT`/`PATCH` 와 편집 화면이 없다
- 이미지를 base64 로 SQLite `TEXT` 컬럼에 넣고 있다 (5MB 이미지 → 약 6.8MB 행)
- 비밀번호 재설정, 이메일 인증, 로그인 레이트리밋
- 목록 페이지네이션/검색
- `error.tsx` / `not-found.tsx` / `loading.tsx`
- 배포 설정 — 파이썬 서브프로세스에 의존하므로 Vercel 서버리스에 그대로는 안 올라간다
