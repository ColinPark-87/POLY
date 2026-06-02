import type { NextConfig } from "next";

// 안전한 보안 응답 헤더만 추가 (동작 보존):
//  - CSP 는 인라인 스크립트/맵 타일을 깨뜨릴 위험이 있어 의도적으로 제외.
//  - 아래 헤더들은 클릭재킹/MIME 스니핑/Referer 누출/HTTP 다운그레이드만 차단하며
//    정상 기능에는 영향이 없음.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
