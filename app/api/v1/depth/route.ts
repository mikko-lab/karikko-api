import { NextRequest, NextResponse } from 'next/server';
import { latLonSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const EMODNET_WCS = 'https://ows.emodnet-bathymetry.eu/wcs';
const USER_AGENT = 'Karikko/1.0 (kontakti@example.fi)';
const GRID = 3; // 3×3 pixel sample — central pixel is most representative

function parseTiffDepth(buffer: ArrayBuffer): number | null {
  const view = new DataView(buffer);
  if (view.byteLength < 8) return null;

  const byteOrder = view.getUint16(0);
  if (byteOrder !== 0x4d4d && byteOrder !== 0x4949) return null;
  const le = byteOrder === 0x4949;

  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);
  const f32 = (o: number) => view.getFloat32(o, le);

  const ifdOffset = u32(4);
  if (ifdOffset + 2 > view.byteLength) return null;
  const entryCount = u16(ifdOffset);

  let width = 0, height = 0;
  let tileWidth = 0, tileLength = 0;
  let tileOffset = 0;   // TileOffsets (tag 324)
  let stripOffset = 0;  // StripOffsets (tag 273)

  for (let i = 0; i < entryCount; i++) {
    const base = ifdOffset + 2 + i * 12;
    if (base + 12 > view.byteLength) break;
    const tag = u16(base);
    const type = u16(base + 2);
    // For SHORT (type 3) with count 1: value is a 2-byte quantity in the 4-byte field
    const val = type === 3 ? u16(base + 8) : u32(base + 8);
    if (tag === 256) width = val;
    else if (tag === 257) height = val;
    else if (tag === 322) tileWidth = val;
    else if (tag === 323) tileLength = val;
    else if (tag === 324) tileOffset = u32(base + 8); // always LONG
    else if (tag === 273) stripOffset = u32(base + 8);
  }

  if (!width || !height) return null;

  const depths: number[] = [];

  if (tileOffset && tileWidth && tileLength) {
    // Tiled TIFF: image rows are mapped into tiles
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const pixelOffset = tileOffset + (row * tileWidth + col) * 4;
        if (pixelOffset + 4 > view.byteLength) continue;
        const val = f32(pixelOffset);
        if (isFinite(val) && val < -0.5 && val > -2000) depths.push(Math.abs(val));
      }
    }
  } else if (stripOffset) {
    for (let i = 0; i < width * height; i++) {
      const offset = stripOffset + i * 4;
      if (offset + 4 > view.byteLength) break;
      const val = f32(offset);
      if (isFinite(val) && val < -0.5 && val > -2000) depths.push(Math.abs(val));
    }
  }

  if (depths.length === 0) return null;
  depths.sort((a, b) => a - b);
  return Math.round(depths[Math.floor(depths.length / 2)] * 10) / 10;
}

export async function GET(req: NextRequest) {
  const parsed = latLonSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: 'INVALID_PARAMS' },
      { status: 400 },
    );
  }

  const { lat, lon } = parsed.data;
  const delta = 0.02;
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  const url =
    `${EMODNET_WCS}?service=WCS&version=1.0.0&request=GetCoverage` +
    `&coverage=emodnet:mean&bbox=${bbox}` +
    `&width=${GRID}&height=${GRID}&format=image/tiff&crs=EPSG:4326`;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'EMODnet unavailable', code: 'UPSTREAM_ERROR' }, { status: 502 });
  }

  const buf = await res.arrayBuffer();
  const depthM = parseTiffDepth(buf);

  console.log(JSON.stringify({ event: 'depth_get', lat, lon, depth_m: depthM }));

  return NextResponse.json(
    {
      data: {
        depth_m: depthM,
        note: depthM === null ? 'Ei syvyystietoa (maa tai katvealue)' : null,
        coverage: 'Merialueet ja rannikkovedet (EMODnet). Sisavedet eivat kateta.',
      },
      meta: {
        attribution: 'EMODnet Bathymetry, CC BY 4.0',
        license: 'CC BY 4.0',
        cached_at: new Date().toISOString(),
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } },
  );
}
