'use client'
import { useEffect } from 'react'

// 역할별 홈 라우팅은 미들웨어(proxy.ts)의 resolveHomePath가 단일 소스로 처리.
// 루트로 보내면 미들웨어가 알맞은 화면으로 리다이렉트한다.
export default function RedirectingPage() {
  useEffect(() => {
    window.location.href = '/'
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#00152F] via-[#002149] to-[#003E83]">
      <div className="text-white text-center">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm opacity-70">로그인 중...</p>
      </div>
    </div>
  )
}
