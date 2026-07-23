import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { createUser } from "@/lib/signup";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function signup(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await createUser(email, password);
    if (!result.ok) {
      redirect(`/signup?error=${encodeURIComponent(result.error)}`);
    }

    await signIn("credentials", { email, password, redirectTo: "/patterns" });
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-6">회원가입</h1>
      <form action={signup} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="이메일"
          required
          className="border rounded px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="비밀번호 (8자 이상)"
          required
          minLength={8}
          className="border rounded px-3 py-2"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" className="bg-black text-white rounded px-3 py-2">
          가입하기
        </button>
      </form>
      <p className="text-sm text-gray-500 mt-4">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
