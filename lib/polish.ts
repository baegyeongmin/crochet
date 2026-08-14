/**
 * 파서가 뽑은 뜨개 텍스트를 Claude Haiku 로 다듬는다.
 *
 * 규칙 기반 파서의 출력은 정확하지만 기계적이다("한길긴뜨기 14"). 사람이 읽는
 * 도안 말투로 고르는 일만 모델에 맡긴다.
 *
 * 중요한 제약: 모델은 **숫자를 바꿀 수 없다**. 코 수나 단 번호가 틀어지면
 * 도안 자체가 망가지므로, 다듬은 결과를 원본과 대조해서 숫자 구조가 어긋나면
 * 버리고 원본을 그대로 쓴다 (verify 참고).
 *
 * SDK 대신 fetch 를 쓴다. 필요한 건 POST 하나뿐이라 의존성을 늘릴 이유가 없다.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/**
 * 기본값은 스냅샷으로 못 박는다. 별칭(claude-haiku-4-5)은 가리키는 대상이
 * 바뀔 수 있어서 결과가 조용히 달라진다.
 */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const MAX_TOKENS = 2048;
const TIMEOUT_MS = 30_000;

/** 다듬기는 유료 호출이다. 터무니없이 긴 입력은 받지 않는다. */
export const MAX_INPUT_CHARS = 10_000;

const SYSTEM_PROMPT = `당신은 코바늘 도안 텍스트를 다듬는 편집자다.

입력은 도안 이미지를 기호 단위로 인식해 만든 기계적인 한국어 텍스트다.
이것을 뜨개하는 사람이 읽기 편한 문장으로 다듬는 것이 당신의 일이다.

반드시 지킬 것:
- 숫자를 절대 바꾸지 마라. 단 번호, 코 수, 반복 횟수 모두 그대로 둔다.
- 없는 정보를 추가하지 마라. 실 굵기, 바늘 호수, 게이지, 완성 크기 같은 건
  입력에 없으므로 지어내면 안 된다.
- 단의 개수와 순서를 바꾸지 마라.
- "N단: ... (M코)" 형태의 뼈대를 유지하라. 괄호 안의 총 코 수도 그대로 둔다.
- "⚠" 로 시작하는 줄은 파서가 남긴 경고다. 한 글자도 고치지 말고 그대로 옮겨라.

해도 되는 것:
- 조사와 어미를 자연스럽게 다듬기 ("한길긴뜨기 14" → "한길긴뜨기 14코")
- 쉼표와 띄어쓰기 정리
- 반복 구간을 읽기 쉽게 표현하기 (횟수는 그대로)

출력은 다듬은 도안 텍스트만 낸다. 설명, 인사말, 코드 블록 표시를 붙이지 마라.`;

export type PolishResult =
  | { ok: true; text: string; model: string; changed: boolean }
  | { ok: false; reason: "no-key" | "too-long" | "failed" | "unsafe"; message: string };

/** 키가 설정돼 있는지. UI 에서 버튼을 보여줄지 판단하는 데 쓴다. */
export function isPolishConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * 다듬은 텍스트가 원본의 숫자 구조를 지켰는지 확인한다.
 *
 * 모델이 코 수를 슬쩍 바꿔도 사람 눈에는 안 보인다. 그래서 기계로 대조한다.
 * 단 번호와 괄호 안 총 코 수, 그리고 경고 줄이 순서까지 같아야 통과다.
 *
 * API 키 없이는 실행되지 않는 경로라 lib/polish.test.ts 로 따로 검증한다.
 */
export function keepsNumbers(original: string, polished: string): boolean {
  const rounds = (s: string) => s.match(/\d+(?=단)/g)?.join(",") ?? "";
  const totals = (s: string) => s.match(/\(\s*\d+\s*코\s*\)/g)?.join(",").replace(/\s/g, "") ?? "";
  const warnings = (s: string) =>
    (s.match(/⚠.*/g) ?? []).map((w) => w.trim()).join("|");

  return (
    rounds(original) === rounds(polished) &&
    totals(original) === totals(polished) &&
    warnings(original) === warnings(polished)
  );
}

/** 모델이 붙일 수 있는 코드블록 울타리나 군더더기를 걷어낸다. */
export function cleanup(text: string): string {
  let out = text.trim();
  const fence = /^```[\w]*\n([\s\S]*?)\n```$/.exec(out);
  if (fence) out = fence[1].trim();
  return out;
}

export async function polishPattern(raw: string): Promise<PolishResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "no-key",
      message: "AI 다듬기가 설정되지 않았습니다. ANTHROPIC_API_KEY 를 넣어주세요.",
    };
  }

  const input = raw.trim();
  if (!input) {
    return { ok: false, reason: "failed", message: "다듬을 내용이 없습니다." };
  }
  if (input.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      reason: "too-long",
      message: `내용이 너무 깁니다. ${MAX_INPUT_CHARS}자 이하만 다듬을 수 있어요.`,
    };
  }

  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        // 교정 작업이라 매번 같은 결과가 나오는 게 낫다.
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: input }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[polish] 요청 실패:", err);
    return {
      ok: false,
      reason: "failed",
      message: "AI 다듬기 서버에 연결하지 못했습니다.",
    };
  }

  if (!res.ok) {
    // 본문에 키가 섞여 나올 일은 없지만, 그대로 사용자에게 넘기지는 않는다.
    console.error(`[polish] HTTP ${res.status}:`, await res.text().catch(() => ""));
    const message =
      res.status === 401
        ? "AI 다듬기 인증에 실패했습니다. API 키를 확인해주세요."
        : res.status === 429
          ? "AI 다듬기 요청이 많습니다. 잠시 후 다시 시도해주세요."
          : "AI 다듬기에 실패했습니다.";
    return { ok: false, reason: "failed", message };
  }

  let polished: string;
  try {
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    polished = cleanup(
      (data.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join(""),
    );
  } catch (err) {
    console.error("[polish] 응답 파싱 실패:", err);
    return { ok: false, reason: "failed", message: "AI 응답을 읽지 못했습니다." };
  }

  if (!polished) {
    return { ok: false, reason: "failed", message: "AI 가 빈 응답을 보냈습니다." };
  }

  if (!keepsNumbers(input, polished)) {
    console.warn("[polish] 숫자 구조가 어긋나 결과를 버렸다.", {
      input,
      polished,
    });
    return {
      ok: false,
      reason: "unsafe",
      message:
        "다듬은 결과에서 코 수가 어긋나 적용하지 않았습니다. 원본을 그대로 두세요.",
    };
  }

  return { ok: true, text: polished, model, changed: polished !== input };
}
