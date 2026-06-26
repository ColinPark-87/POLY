import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// 스마트보드 본인 교실의 테스트 팝업 자동 해제 (보드 닫을 때 호출 → stuck 방지)
// __TEST__ sentinel 일 때만 해제 (실제 수업 force_popup 은 건드리지 않음)
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'smartboard') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const classroomId: string = user.user_metadata.classroom_id ?? ''
  if (!classroomId) return NextResponse.json({ ok: true })

  const svc = createServiceClient()
  await svc
    .from('classrooms')
    .update({ force_popup_class_id: null })
    .eq('id', classroomId)
    .like('force_popup_class_id', '__TEST__%')

  return NextResponse.json({ ok: true })
}
