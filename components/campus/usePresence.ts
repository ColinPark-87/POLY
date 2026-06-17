'use client'
import { useEffect, useState, useRef } from 'react'

export interface Present { user_name: string | null; last_seen: string; editing: boolean }
const HEARTBEAT_MS = 8000      // 8초마다 갱신(편집 상태가 상대에게 빨리 전파되도록)
const EDIT_STICKY_MS = 20000   // 편집 종료 후에도 20초간 '편집 중' 유지(짧은 편집도 상대가 인지)

/** 차량관리 화면 접속 중 하트비트 + 동시 접속자 조회. editing=true면 '편집 중'으로 표시(잔여 20초 유지). */
export function usePresence(campusId?: string, editing = false) {
  const [present, setPresent] = useState<Present[]>([])
  const cq = campusId ? `?campus_id=${campusId}` : ''
  const lastEditRef = useRef(0)
  const beat = useRef<() => void>(() => {})

  beat.current = () => {
    if (editing) lastEditRef.current = Date.now()
    const isEditing = editing || (Date.now() - lastEditRef.current < EDIT_STICKY_MS)
    fetch(`/api/campus/presence${cq}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: isEditing ? 'vehicles-edit' : 'vehicles' }),
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

  // 편집 시작/종료 즉시 서버 반영
  useEffect(() => { beat.current() }, [editing])

  return present
}
