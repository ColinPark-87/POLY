// Shared read-only roster view for HQ.
// Layout matches campus /campus/class-roster exactly (compact card style).

const CLASS_COLORS = [
  '#FF6B35','#FF9800','#2196F3','#4CAF50','#9C27B0',
  '#E53935','#00897B','#1565C0','#F57C00','#607D8B',
]

const SESS_COLORS: Record<string, string> = {
  '유치부': '#FF6B35',
  '유치부 방과후': '#FF9800',
  '초등부 매일반': '#2196F3',
  '초등부 월수금': '#4CAF50',
  '초등부 화목': '#9C27B0',
  '초등부': '#2196F3',
  '중등부': '#2E7D32',
  '고등부': '#6A1B9A',
}
function sessColor(name: string, fallback: string) {
  if (SESS_COLORS[name]) return SESS_COLORS[name]
  for (const key of Object.keys(SESS_COLORS)) {
    if (name.includes(key)) return SESS_COLORS[key]
  }
  return fallback
}

// ── 타입 ──────────────────────────────────────────────────────────
export interface Session {
  id: string
  name: string
  time_range: string | null
  sort_order: number
}

export interface Class {
  id: string
  session_id: string
  level: string
  teacher: string | null
  kt_teacher: string | null
  room: string | null
  color: string | null
  sort_order: number
}

export interface Enrollment {
  id: string
  class_id: string
  student_id: string
  is_waitlist: boolean
  campus_students: {
    id: string
    name: string
    english_name: string | null
    grade: string | null
  } | null
}

export interface RosterData {
  campus: { id: string; name: string }
  sessions: Session[]
  classes: Class[]
  enrollments: Enrollment[]
  availableMonths: string[]
  currentMonth: string
}

// ── 스피너 ────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ── 통계 계산 헬퍼 ────────────────────────────────────────────────
function getSessCount(sessions: Session[], classes: Class[], enrollments: Enrollment[], filterFn: (name: string) => boolean) {
  return sessions.filter(s => filterFn(s.name)).reduce((sum, s) => {
    const sc = classes.filter(c => c.session_id === s.id)
    return sum + sc.reduce((n, c) => n + enrollments.filter(e => e.class_id === c.id && !e.is_waitlist).length, 0)
  }, 0)
}

// ── 메인 RosterView ───────────────────────────────────────────────
export function RosterView({ data }: { data: RosterData }) {
  const { sessions, classes, enrollments } = data

  const getEnrollments = (classId: string) => enrollments.filter(e => e.class_id === classId && !e.is_waitlist)
  const getWaitlist = (classId: string) => enrollments.filter(e => e.class_id === classId && e.is_waitlist)

  // 통계 (방과후 제외)
  const 유치부Total = getSessCount(sessions, classes, enrollments, n => n.includes('유치부') && !n.includes('방과후'))
  const 방과후Total = getSessCount(sessions, classes, enrollments, n => n.includes('방과후'))
  const 매일반Total = getSessCount(sessions, classes, enrollments, n => n.includes('매일반') && !n.includes('유치부'))
  const 삼일반Total = getSessCount(sessions, classes, enrollments, n => n.includes('월수금') || (n.includes('3일반') && !n.includes('유치부')))
  const 이일반Total = getSessCount(sessions, classes, enrollments, n => n.includes('화목') || (n.includes('2일반') && !n.includes('유치부')))
  const 초등부Total = 매일반Total + 삼일반Total + 이일반Total
  const grandTotal = 유치부Total + 초등부Total

  if (sessions.length === 0) {
    return (
      <div className="text-center py-16 text-[#94A3B8]">
        <p className="text-4xl mb-3">📚</p>
        <p className="font-medium">세션이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 통계 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-[#1e3a5f] text-white rounded-lg px-3 py-1.5 flex flex-col min-w-[60px]">
          <span className="text-[9px] font-semibold opacity-60 uppercase">수강</span>
          <span className="text-xl font-black leading-tight">{grandTotal}</span>
        </div>
        {유치부Total > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[60px]">
            <span className="text-[9px] font-semibold uppercase" style={{ color: '#FF6B35' }}>유치부</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{유치부Total}</span>
          </div>
        )}
        {방과후Total > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[60px]">
            <span className="text-[9px] font-semibold uppercase" style={{ color: '#FF9800' }}>방과후</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{방과후Total}</span>
          </div>
        )}
        {초등부Total > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[60px]">
            <span className="text-[9px] font-semibold uppercase" style={{ color: '#2196F3' }}>초등부</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{초등부Total}</span>
          </div>
        )}
        {매일반Total > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[50px]">
            <span className="text-[9px] font-semibold text-[#94A3B8] uppercase">매일반</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{매일반Total}</span>
          </div>
        )}
        {삼일반Total > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[50px]">
            <span className="text-[9px] font-semibold text-[#94A3B8] uppercase">3일반</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{삼일반Total}</span>
          </div>
        )}
        {이일반Total > 0 && (
          <div className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 flex flex-col min-w-[50px]">
            <span className="text-[9px] font-semibold text-[#94A3B8] uppercase">2일반</span>
            <span className="text-xl font-black leading-tight text-[#1E293B]">{이일반Total}</span>
          </div>
        )}
        <div className="ml-auto text-[10px] text-[#94A3B8] bg-[#F1F5F9] px-2 py-1 rounded-lg">읽기 전용</div>
      </div>

      {/* 세션 목록 */}
      {sessions.map((sess, sessIdx) => {
        const color = sessColor(sess.name, CLASS_COLORS[sessIdx % CLASS_COLORS.length])
        const sessClasses = classes.filter(c => c.session_id === sess.id)
        const sessEnrollCount = sessClasses.reduce((n, c) => n + getEnrollments(c.id).length, 0)
        const cols = Math.min(sessClasses.length, 16)
        const cardWidth = cols > 0 ? `calc((100% - ${(cols - 1) * 6}px) / ${cols})` : '120px'

        return (
          <div key={sess.id}>
            {/* 세션 헤더 */}
            <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: `2px solid ${color}` }}>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-extrabold" style={{ color }}>{sess.name}</span>
                {sess.time_range && (
                  <span className="text-[11px] text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-full">{sess.time_range}</span>
                )}
                <span className="text-[11px] text-[#94A3B8]">{sessClasses.length}반 · {sessEnrollCount}명</span>
              </div>
            </div>

            {/* 반 카드 목록 */}
            {sessClasses.length === 0 ? (
              <div className="border border-dashed border-[#E2E8F0] rounded-lg py-6 text-center text-[#CBD5E1] text-xs">
                반이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1 px-1 pb-1">
                <div className="flex flex-nowrap sm:flex-wrap gap-[6px]" style={{ minWidth: 'max-content' }}>
                  {sessClasses.map(cls => {
                    const enrs = getEnrollments(cls.id)
                    const waitlist = getWaitlist(cls.id)

                    return (
                      <div
                        key={cls.id}
                        className="flex-shrink-0 rounded-[9px] border-[1.5px] border-[#e0e0e0] bg-white shadow-sm overflow-hidden"
                        style={{ width: cardWidth, minWidth: '150px' }}
                      >
                        {/* 반 헤더 */}
                        <div className="px-1.5 py-1 text-white" style={{ background: color }}>
                          <div className="flex items-center gap-0.5">
                            <span className="font-extrabold text-[11px] leading-tight truncate flex-1">{cls.level}</span>
                            <span className="text-[9px] font-bold bg-white/30 px-1 py-px rounded flex-shrink-0">{enrs.length}</span>
                          </div>
                          {(cls.room || cls.teacher || cls.kt_teacher) && (
                            <div className="mt-0.5 space-y-px">
                              {cls.room && (
                                <div className="text-[7.5px] opacity-75 flex gap-0.5 truncate">
                                  <span className="opacity-60">교</span>
                                  <span className="bg-white/15 px-0.5 rounded truncate">{cls.room}</span>
                                </div>
                              )}
                              {cls.teacher && (
                                <div className="text-[7.5px] opacity-75 flex gap-0.5 truncate">
                                  <span className="opacity-60">강</span>
                                  <span className="bg-white/15 px-0.5 rounded truncate">{cls.teacher}</span>
                                </div>
                              )}
                              {cls.kt_teacher && (
                                <div className="text-[7.5px] opacity-75 flex gap-0.5 truncate">
                                  <span className="opacity-60">KT</span>
                                  <span className="bg-white/15 px-0.5 rounded truncate">{cls.kt_teacher}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 학생 목록 */}
                        <div>
                          {enrs.map((enr, i) => {
                            const stu = enr.campus_students
                            const hasEng = !!stu?.english_name
                            return (
                              <div
                                key={enr.id}
                                className="flex items-center gap-0.5 px-1 border-b border-[#f0f0f0]"
                                style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : '#ffffff', minHeight: hasEng ? '26px' : '18px' }}
                              >
                                <span className="text-[8px] text-[#ccc] w-2.5 text-right flex-shrink-0 self-center">{i + 1}</span>
                                <div className="flex-1 min-w-0 overflow-hidden">
                                  <div className="text-[10px] font-semibold text-[#1a1a1a] truncate leading-tight">{stu?.name ?? '-'}</div>
                                  {hasEng && <div className="text-[8px] text-[#aaa] truncate leading-tight">{stu?.english_name}</div>}
                                </div>
                              </div>
                            )
                          })}
                          {enrs.length === 0 && (
                            <div className="h-[18px] flex items-center justify-center text-[#CBD5E1] text-[9px]">수강생 없음</div>
                          )}
                        </div>

                        {/* 대기자 섹션 */}
                        {waitlist.length > 0 && (
                          <div className="border-t-2 border-[#F9A825] bg-[#FFFDE7] px-1.5 py-0.5">
                            <p className="text-[9px] font-bold text-[#F9A825]">대기 {waitlist.length}</p>
                            {waitlist.map(enr => (
                              <div key={enr.id} className="text-[9px] text-[#92400E] truncate">
                                {enr.campus_students?.name ?? '-'}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
