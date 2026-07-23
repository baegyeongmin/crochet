import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function NewPatternPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function create(formData: FormData) {
    "use server";
    const session = await auth();
    if (!session?.user) redirect("/login");

    const title = String(formData.get("title") ?? "").trim();
    const content = String(formData.get("content") ?? "").trim();
    if (!title || !content) {
      redirect("/patterns/new?error=1");
    }

    const pattern = await prisma.pattern.create({
      data: { title, content, userId: session.user.id },
    });
    redirect(`/patterns/${pattern.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">새 도안</h1>
      <form action={create} className="flex flex-col gap-3">
        <input
          name="title"
          placeholder="제목"
          required
          className="border rounded px-3 py-2"
        />
        <textarea
          name="content"
          placeholder="도안 내용 (예: 1단: 사슬 6, 짧은뜨기 5...)"
          required
          rows={12}
          className="border rounded px-3 py-2 font-mono text-sm"
        />
        {error && (
          <p className="text-red-600 text-sm">제목과 내용을 모두 입력해주세요.</p>
        )}
        <button
          type="submit"
          className="bg-black text-white rounded px-3 py-2 self-start"
        >
          저장
        </button>
      </form>
    </div>
  );
}
