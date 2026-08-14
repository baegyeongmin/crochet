import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { MAX_INPUT_CHARS, polishPattern } from "@/lib/polish";

/** 외부 API 를 호출하고 키를 다루므로 서버(Node)에서만 돈다. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  // 유료 호출이다. 로그인한 사용자만.
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "요청 본문을 읽지 못했습니다." },
      { status: 400 },
    );
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return NextResponse.json(
      { error: "다듬을 내용을 보내주세요." },
      { status: 400 },
    );
  }
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: `내용이 너무 깁니다. ${MAX_INPUT_CHARS}자 이하만 다듬을 수 있어요.` },
      { status: 413 },
    );
  }

  const result = await polishPattern(text);

  if (!result.ok) {
    // no-key 는 설정 누락이라 서버 상태(501), unsafe 는 검증 실패(422),
    // 나머지는 외부 API 문제(502)로 구분한다.
    const status =
      result.reason === "no-key"
        ? 501
        : result.reason === "unsafe"
          ? 422
          : result.reason === "too-long"
            ? 413
            : 502;
    return NextResponse.json(
      { error: result.message, reason: result.reason },
      { status },
    );
  }

  return NextResponse.json({
    text: result.text,
    model: result.model,
    changed: result.changed,
  });
}
