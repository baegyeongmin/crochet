import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPolishConfigured } from "@/lib/polish";
import { ChartParseField } from "./ChartParseField";

// next.config.ts 의 serverActions.bodySizeLimit 보다 작아야 한다. 크게 잡으면
// 프레임워크가 먼저 요청을 끊어서 아래 검사가 실행조차 되지 않는다.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
      redirect("/patterns/new?error=missing");
    }

    let image: string | null = null;
    const imageFile = formData.get("image");
    if (imageFile instanceof File && imageFile.size > 0) {
      if (!imageFile.type.startsWith("image/")) {
        redirect("/patterns/new?error=image-type");
      }
      if (imageFile.size > MAX_IMAGE_BYTES) {
        redirect("/patterns/new?error=image-size");
      }
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      image = `data:${imageFile.type};base64,${buffer.toString("base64")}`;
    }

    const pattern = await prisma.pattern.create({
      data: { title, content, image, userId: session.user.id },
    });
    redirect(`/patterns/${pattern.id}`);
  }

  const errorMessage =
    error === "image-type"
      ? "이미지 파일만 업로드할 수 있어요."
      : error === "image-size"
        ? "이미지는 5MB 이하만 업로드할 수 있어요."
        : error === "missing"
          ? "제목과 내용을 모두 입력해주세요."
          : null;

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
        <ChartParseField polishAvailable={isPolishConfigured()} />
        {errorMessage && <p className="text-red-600 text-sm">{errorMessage}</p>}
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
