import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '캠퍼스 관리 시스템',
  description: '멀티캠퍼스 관리 시스템',
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
