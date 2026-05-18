export interface StopSearchRow {
  stopName: string
  busName: string
  dir: 'arr' | 'dep'
  sessionLabel: string
  time: string | null
  count: number
}

interface StudentEntry {
  student_id: string
  name: string
  location: string | null
  pickup_time: string | null
  days: string[]
}

interface TimeGroup {
  session_name: string
  time_range: string
  busMap: Record<string, StudentEntry[]>
}

export function getRunLabel(sessName: string, dir: 'arr' | 'dep'): string {
  if (sessName.includes('방과후')) {
    if (sessName.includes('유치부')) return '유치부'
    return dir === 'dep' ? '매일반' : '방과후'
  }
  if (sessName.includes('매일반')) return '매일반'
  if (sessName.includes('월수금') || sessName.includes('3일반')) return '3일반'
  if (sessName.includes('화목') || sessName.includes('2일반')) return '2일반'
  if (sessName.includes('유치부')) return '유치부'
  return sessName
}

function parseTimeMin(t: string | null | undefined): number {
  if (!t) return 9999
  const m = t.match(/(\d{1,2}):(\d{2})/)
  if (!m) return 9999
  let h = parseInt(m[1])
  if (h < 8) h += 12
  return h * 60 + parseInt(m[2])
}

export function buildStopSearchResults(
  bothDirGroups: Array<{ group: TimeGroup; dir: 'arr' | 'dep' }>,
  query: string
): StopSearchRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const map = new Map<string, StopSearchRow>()

  for (const { group, dir } of bothDirGroups) {
    const sessionLabel = getRunLabel(group.session_name, dir)
    for (const [busName, students] of Object.entries(group.busMap)) {
      for (const s of students) {
        if (!s.location) continue
        const loc = s.location.trim()
        if (!loc.toLowerCase().includes(q)) continue

        const key = `${loc}||${busName}||${dir}||${sessionLabel}`
        if (!map.has(key)) {
          map.set(key, { stopName: loc, busName, dir, sessionLabel, time: s.pickup_time, count: 0 })
        }
        const row = map.get(key)!
        row.count++
        if (s.pickup_time && parseTimeMin(s.pickup_time) < parseTimeMin(row.time)) {
          row.time = s.pickup_time
        }
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.dir !== b.dir) return a.dir === 'dep' ? -1 : 1
    return parseTimeMin(a.time) - parseTimeMin(b.time)
  })
}
