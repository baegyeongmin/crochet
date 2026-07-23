import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PatternsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const patterns = await prisma.pattern.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">내 도안</h1>
        <Link
          href="/patterns/new"
          className="bg-black text-white rounded px-4 py-2 text-sm"
        >
          새 도안
        </Link>
      </div>
      {patterns.length === 0 ? (
        <p className="text-gray-500">아직 저장된 도안이 없어요.</p>
      ) : (
        <ul className="divide-y border rounded">
          {patterns.map((pattern) => (
            <li key={pattern.id}>
              <Link
                href={`/patterns/${pattern.id}`}
                className="block px-4 py-3 hover:bg-gray-50"
              >
                <p className="font-medium">{pattern.title}</p>
                <p className="text-xs text-gray-400">
                  {pattern.createdAt.toLocaleDateString("ko-KR")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
