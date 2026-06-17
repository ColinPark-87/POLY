'use client'
import { useEffect, useState, useRef } from 'react'

export interface Present { user_name: string | null; last_seen: string }
const HEARTBEAT_MS = 15000

/** 차량관리 화면에 머무는 동안 하트비트 전송 + 동시 작업자 목록 조회. */
export function usePresence(campusId?: string) {
  const [present, setPresent] = useState<Present[]>([])
  const beat = useRef<() => void>(() => {})

  const cq = campusId ? `?campus_id=${campusId}` : ''
  beat.current = () => {
    fetch(`/api/campus/presence${cq}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'vehicles' }),
    }).catch(() => {})
    fetch(`/api/campus/presence${cq}`)
      .then(r => r.ok ? r.json() : { present: [] })
      .then(d => setPresent(d.present ?? []))
      .catch(() => {})
  }

  useEffect(() => {
    beat.current()
    const id = setInterval(() => { if (document.visibilityState === 'visible') beat.current() }, HEARTBEAT_MS)
    const onFocus = () => beat.current()
    const leave = () => { fetch(`/api/campus/presence${cq}`, { method: 'DELETE', keepalive: true }).catch(() => {}) }
    window.addEventListener('focus', onFocus)
    window.addEventListener('beforeunload', leave)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('beforeunload', leave)
      leave()
    }
  }, [campusId]) // eslint-disable-line react-hooks/exhaustive-deps

  return present
}
