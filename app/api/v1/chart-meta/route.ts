import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    data: {
      disclaimer: 'Aineisto ei korvaa navigoinnissa käytettävää painettua merikarttaa. Traficom ei vastaa aineiston käytöstä aiheutuvista vahingoista.',
      attribution: '(c) Traficom, CC BY 4.0',
      tileEndpoint: '/api/v1/chart-tile?z={z}&x={x}&y={y}&layer={layer}',
      layers: {
        A: 'Merikarttasarja A - rannikko ja saaristo',
        C: 'Merikarttasarja C - rannikko',
        F: 'Merikarttasarja F - sisavedet',
        G: 'Merikarttasarja G - sisavedet',
      },
    },
    meta: {
      attribution: '(c) Traficom, CC BY 4.0',
      license: 'CC BY 4.0',
      cached_at: new Date().toISOString(),
    },
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
