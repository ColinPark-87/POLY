import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CLASSROOM_ORDER = [
  'classroom_america', 'classroom_belgium', 'classroom_canada',
  'classroom_denmark', 'classroom_england', 'classroom_france',
  'classroom_germany', 'classroom_hungary', 'classroom_italy',
  'classroom_sweden', 'classroom_norway',
]

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createServiceClient()
  const { data: profile } = await serviceClient
    .from('users').select('campus_id, role').eq('id', user.id).maybeSingle()
  if (!profile?.campus_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 교실 목록 조회
  const { data: classrooms } = await serviceClient
    .from('classrooms')
    .select('id, display_name')
    .eq('campus_id', profile.campus_id)
    .order('id')

  const results: { email: string; classroom: string; status: string }[] = []

  for (let i = 0; i < CLASSROOM_ORDER.length; i++) {
    const classroomId = CLASSROOM_ORDER[i]
    const classroom = (classrooms ?? []).find((r: any) => r.id === classroomId)
    if (!classroom) continue

    const email = `computer${i + 1}@jungkye.poly`
    const displayName = classroom.display_name

    try {
      // 계정 생성
      const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
        email,
        password: '7659',
        email_confirm: true,
        user_metadata: {
          role: 'smartboard',
          classroom_id: classroomId,
          campus_id: profile.campus_id,
          display_name: `컴퓨터${i + 1} (${displayName})`,
        },
      })

      if (createErr && !createErr.message.includes('already been registered')) {
        results.push({ email, classroom: displayName, status: `오류: ${createErr.message}` })
        continue
      }

      // 교실 account_email 업데이트
      await serviceClient
        .from('classrooms')
        .update({ account_email: email })
        .eq('id', classroomId)
        .eq('campus_id', profile.campus_id)

      results.push({ email, classroom: displayName, status: createErr ? '이미 존재 (이메일 연결 완료)' : '생성 완료' })
    } catch (e: any) {
      results.push({ email, classroom: displayName, status: `실패: ${e.message}` })
    }
  }

  return NextResponse.json({ results })
}
