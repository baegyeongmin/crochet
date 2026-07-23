import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { auth, signOut } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "코바늘 도안 노트",
  description: "코바늘 도안을 저장하고 관리하는 사이트",
};

async function Header() {
  const session = await auth();

  return (
    <header className="border-b px-6 py-4 flex items-center justify-between">
      <Link href="/" className="font-semibold">
        코바늘 도안 노트
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {session?.user ? (
          <>
            <Link href="/patterns">내 도안</Link>
            <span className="text-gray-500">{session.user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className="text-gray-500 hover:text-black">
                로그아웃
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login">로그인</Link>
            <Link href="/signup">회원가입</Link>
          </>
        )}
      </nav>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
