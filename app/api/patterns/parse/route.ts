import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ChartParseError, parseChart } from "@/lib/chart-parse";

/** child_process 를 쓰므로 Edge 로 내려가면 안 된다. */
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "이미지를 읽지 못했습니다." },
      { status: 400 },
    );
  }

  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json(
      { error: "도안 이미지를 선택해주세요." },
      { status: 400 },
    );
  }
  if (!image.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "이미지 파일만 분석할 수 있어요." },
      { status: 400 },
    );
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "이미지는 8MB 이하만 분석할 수 있어요." },
      { status: 400 },
    );
  }

  try {
    const result = await parseChart(
      Buffer.from(await image.arrayBuffer()),
      image.name,
    );

    // stitches 는 교정 UI 용이라 지금은 안 보낸다 (수백 KB 가 될 수 있다).
    return NextResponse.json({
      text: result.text,
      warnings: result.warnings,
      confidence: result.confidence,
      rounds: result.rounds.map(({ n, count, source, confidence }) => ({
        n,
        count,
        source,
        confidence,
      })),
      stitchCount: result.stitches.length,
    });
  } catch (err) {
    if (err instanceof ChartParseError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[api/patterns/parse] 예상치 못한 오류:", err);
    return NextResponse.json(
      { error: "도안 분석 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
