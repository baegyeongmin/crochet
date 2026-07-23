import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "./DeleteButton";

export default async function PatternDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const pattern = await prisma.pattern.findUnique({ where: { id } });
  if (!pattern || pattern.userId !== session.user.id) notFound();

  async function remove() {
    "use server";
    const session = await auth();
    if (!session?.user) redirect("/login");

    const existing = await prisma.pattern.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) redirect("/patterns");

    await prisma.pattern.delete({ where: { id } });
    redirect("/patterns");
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/patterns" className="text-sm text-gray-500">
        ← 목록으로
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">{pattern.title}</h1>
      <pre className="whitespace-pre-wrap border rounded px-4 py-3 bg-gray-50 text-sm">
        {pattern.content}
      </pre>
      <form action={remove} className="mt-6">
        <DeleteButton />
      </form>
    </div>
  );
}
