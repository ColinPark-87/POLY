import type { createServiceClient } from '@/lib/supabase/server'

export type UsageArea = 'roster' | 'vehicles'
export interface UsageRow {
  event_type: 'login' | 'edit'
  area: UsageArea | null
  campus_id: string | null
  user_id: string | null
  user_name: string | null
  role: string | null
  created_at: string
}

/** 비차단 기록: 실패해도 throw하지 않음(로그 한 줄 누락만, 본동작 무영향). */
export async function logUsage(
  service: ReturnType<typeof createServiceClient>,
  e: { event_type: 'login' | 'edit'; area?: UsageArea; campusId?: string | null; userId?: string | null; userName?: string | null; role?: string | null },
): Promise<void> {
  try {
    await service.from('usage_logs').insert({
      event_type: e.event_type, area: e.area ?? null,
      campus_id: e.campusId ?? null, user_id: e.userId ?? null,
      user_name: e.userName ?? null, role: e.role ?? null,
    })
  } catch { /* 무시 */ }
}

const dayKST = (iso: string) => new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(0, 10)

export interface CampusStat { campus_id: string; campus_name: string; logins: number; edits: number; activeUsers: number; lastActiveAt: string | null }
export interface UserStat { user_id: string; user_name: string; campus_name: string; role: string; logins: number; edits: number; lastAt: string | null }
export interface DayStat { date: string; logins: number; edits: number }

export function aggregateUsage(rows: UsageRow[], campusMap: Record<string, string>) {
  const cAgg: Record<string, { logins: number; edits: number; users: Set<string>; last: string | null }> = {}
  const uAgg: Record<string, UserStat> = {}
  const dAgg: Record<string, DayStat> = {}
  const allUsers = new Set<string>()
  let logins = 0, edits = 0
  for (const r of rows) {
    const isLogin = r.event_type === 'login'
    if (isLogin) logins++; else edits++
    if (r.user_id) allUsers.add(r.user_id)
    const cid = r.campus_id ?? '(없음)'
    const c = (cAgg[cid] ??= { logins: 0, edits: 0, users: new Set(), last: null })
    if (isLogin) c.logins++; else c.edits++
    if (r.user_id) c.users.add(r.user_id)
    if (!c.last || r.created_at > c.last) c.last = r.created_at
    if (r.user_id) {
      const u = (uAgg[r.user_id] ??= { user_id: r.user_id, user_name: r.user_name ?? '?', campus_name: campusMap[cid] ?? cid, role: r.role ?? '', logins: 0, edits: 0, lastAt: null })
      if (isLogin) u.logins++; else u.edits++
      if (!u.lastAt || r.created_at > u.lastAt) u.lastAt = r.created_at
    }
    const d = dayKST(r.created_at)
    const day = (dAgg[d] ??= { date: d, logins: 0, edits: 0 })
    if (isLogin) day.logins++; else day.edits++
  }
  const byCampus: CampusStat[] = Object.entries(cAgg).map(([campus_id, v]) => ({
    campus_id, campus_name: campusMap[campus_id] ?? campus_id,
    logins: v.logins, edits: v.edits, activeUsers: v.users.size, lastActiveAt: v.last,
  })).sort((a, b) => (b.logins + b.edits) - (a.logins + a.edits))
  const byUser = Object.values(uAgg).sort((a, b) => (b.logins + b.edits) - (a.logins + a.edits))
  const byDay = Object.values(dAgg).sort((a, b) => a.date.localeCompare(b.date))
  return { totals: { logins, edits, activeUsers: allUsers.size }, byCampus, byUser, byDay }
}

export function usageToCsv<T>(rows: T[], cols: (keyof T)[]): string {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const head = cols.map(String).join(',')
  const body = rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n')
  return '﻿' + head + '\n' + body
}
