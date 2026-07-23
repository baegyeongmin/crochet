import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/patterns",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect("/login?error=1");
      }
      throw err;
    }
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-6">로그인</h1>
      <form action={login} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="이메일"
          required
          autoComplete="off"
          className="border rounded px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="비밀번호"
          required
          autoComplete="off"
          className="border rounded px-3 py-2"
        />
        {error && (
          <p className="text-red-600 text-sm">
            이메일 또는 비밀번호가 올바르지 않습니다.
          </p>
        )}
        <button type="submit" className="bg-black text-white rounded px-3 py-2">
          로그인
        </button>
      </form>
      <p className="text-sm text-gray-500 mt-4">
        계정이 없으신가요?{" "}
        <Link href="/signup" className="underline">
          회원가입
        </Link>
      </p>
    </div>
  );
}
