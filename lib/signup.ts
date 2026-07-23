import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignupResult = { ok: true } | { ok: false; error: string };

export async function createUser(email: string, password: string): Promise<SignupResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!EMAIL_RE.test(normalizedEmail)) {
    return { ok: false, error: "올바른 이메일을 입력해주세요." };
  }
  if (password.length < 8) {
    return { ok: false, error: "비밀번호는 8자 이상이어야 합니다." };
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { ok: false, error: "이미 가입된 이메일입니다." };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({ data: { email: normalizedEmail, passwordHash } });
  return { ok: true };
}
