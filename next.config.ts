import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 도안 저장은 서버 액션으로 간다. 기본 1MB 라서 이미지를 올리면
      // app/patterns/new 의 5MB 검사에 닿기도 전에 프레임워크가 끊는다.
      // 멀티파트 경계/헤더 오버헤드까지 감싸도록 여유를 둔다.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
