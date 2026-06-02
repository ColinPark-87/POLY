import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveHomePath, isCampusStaffOnly, isViceAdmin } from '@/lib/auth/routing'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const isAuthPage = path.startsWith('/login') || path.startsWith('/setup') || path.startsWith('/api/public')

  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 역할 정보가 실제로 필요한 경로에서만 users 조회 (매 요청 DB 쿼리 제거 — 성능)
  //  - 캠퍼스/HQ 가드, 또는 로그인된 채 루트/로그인 진입 시 역할별 홈 결정
  const needsRole =
    !!user && (
      path.startsWith('/campus') ||
      path.startsWith('/hq') ||
      path === '/login' ||
      path === '/'
    )

  if (needsRole) {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: profile } = await adminClient
      .from('users')
      .select('role, position')
      .eq('id', user!.id)
      .maybeSingle()

    const role = profile?.role ?? ''
    const position = profile?.position ?? ''
    const home = resolveHomePath(role, position)

    // 로그인된 채로 로그인/루트 진입 → 역할별 올바른 홈으로 (직원 대시보드로 잘못 떨어지는 버그 수정)
    if (path === '/login' || path === '/') {
      return NextResponse.redirect(new URL(home, request.url))
    }

    const isCampusAdmin = role === 'campus_admin' || role === 'hq_admin' || isViceAdmin(position)
    const staffOnly = isCampusStaffOnly(role, position)

    if (path.startsWith('/campus')) {
      if (!isCampusAdmin && !staffOnly) {
        // 일반 직원 — 캠퍼스 접근 불가
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      if (staffOnly) {
        // 상담부/관리자 등 — 개설반 현황, 차량 관리만 허용 → 그 외 캠퍼스 경로는 홈(개설반)으로
        const allowed =
          path.startsWith('/campus/class-roster') ||
          path.startsWith('/campus/vehicles')
        if (!allowed) {
          return NextResponse.redirect(new URL(home, request.url))
        }
      }
    }

    if (path.startsWith('/hq') && role !== 'hq_admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  // 정적 이미지(public/*.png 등)는 인증 미들웨어 우회 — 캠퍼스 엠블럼 등 항상 로드
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)).*)'],
}
