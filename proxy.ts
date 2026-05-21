import { NextRequest, NextResponse } from 'next/server';

const DEMO_HOSTS = ['demo.karikko.fi'];

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  if (DEMO_HOSTS.some((h) => host === h || host.startsWith(h + ':')) &&
      request.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL('/demo', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/demo'],
};
