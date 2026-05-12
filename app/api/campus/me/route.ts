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
    .select('role, position, campus_id, perm_class_roster, perm_vehicles, perm_vehicles_restricted')
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

  return NextResponse.json({ permissions, campusName })
}
