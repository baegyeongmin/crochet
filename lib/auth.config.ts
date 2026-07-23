import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnPatterns = nextUrl.pathname.startsWith("/patterns");
      if (isOnPatterns) return isLoggedIn;
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
