import type { MetadataRoute } from 'next'

// PWA 매니페스트 — 링크(https://poly-system.vercel.app)를 받아 "홈 화면에 추가/설치"하면
// Poly 아이콘 + "Poly 시스템" 이름으로 앱처럼 설치된다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Poly 시스템',
    short_name: 'Poly',
    description: 'Poly 캠퍼스 관리 시스템 (연차·차량)',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#004EA2', // Poly Royal Blue
    lang: 'ko',
    icons: [
      { src: '/icons/poly-any-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/poly-any-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/poly-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/poly-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
