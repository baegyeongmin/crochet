import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-center">
      <h1 className="text-3xl font-bold mb-4">코바늘 도안 노트</h1>
      <p className="text-gray-600 mb-8">나만의 코바늘 도안을 저장하고 모아보세요.</p>
      {session?.user ? (
        <Link
          href="/patterns"
          className="inline-block bg-black text-white px-5 py-2 rounded"
        >
          내 도안 보러가기
        </Link>
      ) : (
        <div className="flex justify-center gap-3">
          <Link href="/signup" className="bg-black text-white px-5 py-2 rounded">
            회원가입
          </Link>
          <Link href="/login" className="border px-5 py-2 rounded">
            로그인
          </Link>
        </div>
      )}
    </div>
  );
}
