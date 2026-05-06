import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const service = createServiceClient()
  const { data } = await service
    .from('campuses')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  return NextResponse.json({ campuses: data ?? [] })
}
