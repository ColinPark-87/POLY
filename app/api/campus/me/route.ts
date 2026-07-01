import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolvePermissions } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('name, role, position, campus_id, perm_class_roster, perm_vehicles, perm_vehicles_restricted')
    .eq('id', user.id)
    .single()

  const permissions = resolvePermissions({
    role: profile?.role ?? 'employee',
    position: profile?.position ?? null,
    perm_class_roster: profile?.perm_class_roster ?? null,
    perm_vehicles: profile?.perm_vehicles ?? null,
    perm_vehicles_restricted: profile?.perm_vehicles_restricted ?? null,
  })

  let campusName: string | null = null
  if (profile?.campus_id) {
    const { data: campus } = await service.from('campuses').select('name').eq('id', profile.campus_id).single()
    campusName = campus?.name ?? null
  }

  // 차량선생님(restricted): 본인 호차만 보이도록 — 이름이 호차 기사/안전선생님과 일치하는 호차 목록
  let myBuses: string[] = []
  if (permissions.vehiclesRestricted && profile?.campus_id && profile?.name) {
    const nm = profile.name.trim()
    const { data: bs } = await service.from('campus_buses').select('name, driver, safety').eq('campus_id', profile.campus_id)
    myBuses = (bs ?? []).filter(b => (b.driver ?? '').trim() === nm || (b.safety ?? '').trim() === nm).map(b => b.name)
  }

  return NextResponse.json({ permissions, campusName, campusId: profile?.campus_id ?? null, myBuses })
}
