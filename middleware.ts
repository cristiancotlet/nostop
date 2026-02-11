import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/setup'];
const ALLOWED_HOSTS = ['localhost:3000', '127.0.0.1:3000', 'nostop.app', 'www.nostop.app'];

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const isProduction = process.env.NODE_ENV === 'production';
  const isAllowed =
    ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h)) ||
    host.endsWith('.vercel.app');
  if (isProduction && host && !isAllowed) {
    return new Response('Forbidden', { status: 403 });
  }

  const pathname = request.nextUrl.pathname;
  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseConfigured && pathname !== '/setup' && !pathname.startsWith('/_next')) {
    return Response.redirect(new URL('/setup', request.url));
  }

  const { user, response } = await updateSession(request);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isStatic =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    /\.(ico|png|jpg|jpeg|gif|webp|svg)$/.test(pathname);

  if (isStatic) {
    return response;
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return Response.redirect(url);
  }

  if (user && pathname === '/login') {
    const redirect = request.nextUrl.searchParams.get('redirect') || '/';
    const url = request.nextUrl.clone();
    url.pathname = redirect;
    url.search = '';
    return Response.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
