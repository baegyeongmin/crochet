import { NextResponse } from "next/server";
import { createUser } from "@/lib/signup";

export async function POST(request: Request) {
  const body = await request.json();
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  const result = await createUser(email, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
