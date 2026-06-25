import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// 스마트보드 교실 변경용: 컴퓨터 번호 ↔ 교실명 목록
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'smartboard') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const classroomId: string = user.user_metadata.classroom_id ?? ''
  const svc = createServiceClient()

  // 내 교실의 campus
  const { data: myRoom } = await svc.from('classrooms').select('campus_id').eq('id', classroomId).maybeSingle()
  const campusId = myRoom?.campus_id ?? user.user_metadata.campus_id

  // 같은 캠퍼스 교실 목록 (account_email로 컴퓨터 번호 추출)
  const { data: rooms } = await svc
    .from('classrooms')
    .select('id, display_name, account_email')
    .eq('campus_id', campusId)
    .order('account_email')

  // computer{N}@... 에서 번호 추출
  const list = (rooms ?? [])
    .map((r: any) => {
      const m = (r.account_email ?? '').match(/computer(\d+)@/)
      return { num: m ? Number(m[1]) : null, display_name: r.display_name, email: r.account_email }
    })
    .filter((r: any) => r.num !== null)
    .sort((a: any, b: any) => a.num - b.num)

  return NextResponse.json({ rooms: list })
}
