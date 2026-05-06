import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import MobileHeader from '@/components/MobileHeader'
import EmailSetupBanner from '@/components/EmailSetupBanner'

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const { data: profile } = await serviceClient
    .from('users')
    .select('name, position, role, email')
    .eq('id', user.id)
    .single()

  const userName = profile?.name ?? '사용자'
  const userPosition = profile?.position ?? '직원'
  const needsEmailSetup = profile?.email?.endsWith('@campus.internal') ?? false

  return (
    <div className="flex min-h-screen bg-[#F7F8FA]">
      <Sidebar userName={userName} userPosition={userPosition} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader userName={userName} />
        <EmailSetupBanner needsSetup={needsEmailSetup} />
        <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 overflow-auto">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
