import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// 로그인 전 컴퓨터 탭용: 컴퓨터 번호 ↔ 교실명 (중계 캠퍼스)
const JUNGKYE_CAMPUS_ID = 'ebb499c6-8fb4-4207-9f34-a75c1d29d973'

export async function GET() {
  const svc = createServiceClient()
  const { data: rooms } = await svc
    .from('classrooms')
    .select('display_name, account_email')
    .eq('campus_id', JUNGKYE_CAMPUS_ID)

  const list = (rooms ?? [])
    .map((r: any) => {
      const m = (r.account_email ?? '').match(/computer(\d+)@/)
      return { num: m ? Number(m[1]) : null, display_name: r.display_name }
    })
    .filter((r: any) => r.num !== null)
    .sort((a: any, b: any) => a.num - b.num)

  return NextResponse.json({ rooms: list })
}
