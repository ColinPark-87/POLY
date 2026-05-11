import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id').eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get('active') !== 'false'

  let query = service.from('campus_students').select('*').eq('campus_id', campusId).order('name')
  if (activeOnly) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ students: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, position, role').eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (profile?.role !== 'campus_admin' && !/상담/.test(profile?.position ?? ''))
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { name, english_name, grade, enrolled_at, notes } = body
  if (!name?.trim()) return NextResponse.json({ error: '이름 필수' }, { status: 400 })

  const { data, error } = await service.from('campus_students').insert({
    campus_id: campusId, name: name.trim(), english_name: english_name?.trim() || null,
    grade: grade?.trim() || null, enrolled_at: enrolled_at || null, notes: notes?.trim() || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ student: data })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('campus_id, position, role').eq('id', user.id).single()
  const campusId = profile?.campus_id
  if (!campusId) return NextResponse.json({ error: '캠퍼스 없음' }, { status: 400 })
  if (profile?.role !== 'campus_admin' && !/상담/.test(profile?.position ?? ''))
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { id, name, english_name } = body
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: '이름 필수' }, { status: 400 })

  const { data, error } = await service.from('campus_students')
    .update({ name: name.trim(), english_name: english_name?.trim() || null })
    .eq('id', id)
    .eq('campus_id', campusId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ student: data })
}
