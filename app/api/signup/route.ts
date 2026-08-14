import { NextResponse } from "next/server";
import { createUser } from "@/lib/signup";

function readCredentials(body: unknown): { email: string; password: string } {
  const o = (body ?? {}) as Record<string, unknown>;
  return {
    email: typeof o.email === "string" ? o.email : "",
    password: typeof o.password === "string" ? o.password : "",
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "요청 본문을 읽지 못했습니다." },
      { status: 400 },
    );
  }

  const { email, password } = readCredentials(body);

  const result = await createUser(email, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
