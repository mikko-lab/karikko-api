import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function redirect(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = url.pathname.replace('/api/hazards', '/api/v1/hazards');
  return NextResponse.redirect(url, 301);
}

export async function GET(req: NextRequest) { return redirect(req); }
export async function POST(req: NextRequest) { return redirect(req); }
