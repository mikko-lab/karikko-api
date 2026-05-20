import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.clone();
  url.pathname = '/api/v1/water-level';
  return NextResponse.redirect(url, 301);
}
