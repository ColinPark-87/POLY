import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import SafetyTodayView from './SafetyTodayView'

export default async function EmployeeVehiclesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('name, position, campus_id')
    .eq('id', user.id)
    .single()

  // POLY안전선생님만 접근 허용
  const isSafety = profile?.position?.includes('안전') || profile?.position?.includes('POLY')
  if (!isSafety) redirect('/dashboard')

  // 담당 버스 조회 (buses.safety === 직원 이름)
  const { data: buses } = await service
    .from('campus_buses')
    .select('name, safety')
    .eq('campus_id', profile?.campus_id ?? '')

  const assignedBuses = (buses ?? [])
    .filter((b: { name: string; safety: string | null }) => b.safety === profile?.name)
    .map((b: { name: string }) => b.name)

  return (
    <SafetyTodayView
      assignedBuses={assignedBuses}
      staffName={profile?.name ?? ''}
    />
  )
}
