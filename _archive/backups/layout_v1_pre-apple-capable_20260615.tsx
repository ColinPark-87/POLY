import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '캠퍼스 관리 시스템',
  description: '멀티캠퍼스 관리 시스템',
  manifest: '/manifest.webmanifest',
  // iOS에서 홈 화면 추가 시 앱 이름·전체화면(standalone) 동작
  appleWebApp: {
    capable: true,
    title: 'Poly 시스템',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: '#004EA2', // Poly Royal Blue — 주소창/상태바 색
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  )
}
