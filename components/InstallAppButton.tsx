'use client'

import { useEffect, useState } from 'react'

// Chrome/Edge/Android에서 발생하는 설치 프롬프트 이벤트 (표준 타입에 아직 없어 직접 선언)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * 로그인 화면 등에 두는 "앱 설치" 버튼.
 * - Chrome/Edge/Android: 클릭 시 브라우저 기본 설치 프롬프트를 바로 띄움
 * - iPhone(Safari): 설치 프롬프트 API가 없어 "공유 → 홈 화면에 추가" 단계 안내
 * - 이미 설치(standalone)된 경우: 버튼 자체를 숨김
 */
export default function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [guide, setGuide] = useState<null | 'ios' | 'manual'>(null)

  useEffect(() => {
    // 이미 앱으로 실행 중이면(홈 화면/설치본) 버튼 숨김
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) {
      setInstalled(true)
      return
    }

    // iOS 판별 (iPadOS 13+ 는 Mac으로 보고되므로 터치 수로 보정)
    const ua = window.navigator.userAgent.toLowerCase()
    const iOS =
      /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(iOS)

    const onPrompt = (e: Event) => {
      e.preventDefault() // 브라우저 기본 미니배너 막고, 버튼 클릭 시점에 우리가 띄움
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  async function handleClick() {
    if (deferred) {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setDeferred(null)
      return
    }
    // 네이티브 프롬프트가 없으면(iOS 또는 이미 설치/미지원) 안내 표시
    setGuide(isIOS ? 'ios' : 'manual')
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="w-full mt-3 flex items-center justify-center gap-2 border border-[#004EA2] text-[#004EA2] hover:bg-[#EAF2FB] font-semibold py-2.5 rounded-xl text-sm transition-colors"
      >
        <span className="text-base">📲</span>
        이 기기에 앱으로 설치
      </button>

      {guide && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
          onClick={() => setGuide(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="inline-flex items-center justify-center w-9 h-9 bg-[#004EA2] rounded-xl">
                <span className="text-white text-sm font-black">P</span>
              </div>
              <h3 className="font-bold text-[#1E293B] text-lg">앱으로 설치하기</h3>
            </div>

            {guide === 'ios' ? (
              <ol className="space-y-3 text-sm text-[#1E293B]">
                <li className="flex gap-3">
                  <span className="flex-none w-6 h-6 rounded-full bg-[#EAF2FB] text-[#004EA2] font-bold text-xs flex items-center justify-center">1</span>
                  <span>하단 가운데 <b>공유 버튼</b>(네모 안에 ↑ 화살표)을 누릅니다.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-none w-6 h-6 rounded-full bg-[#EAF2FB] text-[#004EA2] font-bold text-xs flex items-center justify-center">2</span>
                  <span>메뉴를 내려 <b>&ldquo;홈 화면에 추가&rdquo;</b>를 누릅니다.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-none w-6 h-6 rounded-full bg-[#EAF2FB] text-[#004EA2] font-bold text-xs flex items-center justify-center">3</span>
                  <span>우측 상단 <b>&ldquo;추가&rdquo;</b>를 누르면 끝.</span>
                </li>
                <li className="text-[12px] text-[#94A3B8] pl-9">
                  ⚠️ 아이폰은 반드시 <b>Safari</b>에서 진행하세요. (크롬·네이버앱 불가)
                </li>
              </ol>
            ) : (
              <ol className="space-y-3 text-sm text-[#1E293B]">
                <li className="flex gap-3">
                  <span className="flex-none w-6 h-6 rounded-full bg-[#EAF2FB] text-[#004EA2] font-bold text-xs flex items-center justify-center">1</span>
                  <span>주소창 오른쪽의 <b>설치 아이콘</b>(모니터에 ↓ 화살표)을 누릅니다.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-none w-6 h-6 rounded-full bg-[#EAF2FB] text-[#004EA2] font-bold text-xs flex items-center justify-center">2</span>
                  <span>안 보이면 우측 상단 <b>⋮ 메뉴 → 저장 및 공유 → 페이지를 앱으로 설치</b> (Edge는 <b>앱 → 이 사이트를 앱으로 설치</b>).</span>
                </li>
                <li className="text-[12px] text-[#94A3B8] pl-9">
                  이미 설치되어 있으면 버튼이 보이지 않을 수 있습니다.
                </li>
              </ol>
            )}

            <button
              onClick={() => setGuide(null)}
              className="w-full mt-5 bg-[#004EA2] text-white font-semibold py-2.5 rounded-xl text-sm"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  )
}
