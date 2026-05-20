import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.clone();
  url.pathname = '/api/v1/fairways';
  // muunnetaan radius (asteet) → radius_m (metrit), oletus 5000m jos ei annettu
  const radius = parseFloat(url.searchParams.get('radius') ?? '');
  if (!isNaN(radius)) {
    url.searchParams.set('radius_m', String(Math.round(radius * 111_320)));
    url.searchParams.delete('radius');
  }
  return NextResponse.redirect(url, 301);
}
