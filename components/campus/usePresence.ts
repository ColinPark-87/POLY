'use client'
import { useEffect, useState, useRef } from 'react'

export interface Present { user_name: string | null; last_seen: string; editing: boolean }
const HEARTBEAT_MS = 15000

/** 차량관리 화면 접속 중 하트비트 전송 + 동시 접속자 조회. editing=true면 '편집 중'으로 표시됨. */
export function usePresence(campusId?: string, editing = false) {
  const [present, setPresent] = useState<Present[]>([])
  const cq = campusId ? `?campus_id=${campusId}` : ''
  const pageRef = useRef('vehicles')
  pageRef.current = editing ? 'vehicles-edit' : 'vehicles'
  const beat = useRef<() => void>(() => {})

  beat.current = () => {
    fetch(`/api/campus/presence${cq}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: pageRef.current }),
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

  // 편집 시작/종료 시 즉시 하트비트(편집 중 표시 지연 없이)
  useEffect(() => { beat.current() }, [editing])

  return present
}
