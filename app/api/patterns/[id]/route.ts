import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const pattern = await prisma.pattern.findUnique({ where: { id } });
  if (!pattern || pattern.userId !== session.user.id) {
    return NextResponse.json({ error: "도안을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ pattern });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const pattern = await prisma.pattern.findUnique({ where: { id } });
  if (!pattern || pattern.userId !== session.user.id) {
    return NextResponse.json({ error: "도안을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.pattern.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
