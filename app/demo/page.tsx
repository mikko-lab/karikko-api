import referenceLevels from '@/lib/reference-levels.json';
import DemoApp from './DemoApp';

export const dynamic = 'force-static';

// Lataa staattisesti vain ne kentät joita client tarvitsee.
// Painava weeks-data EI mene client-bundleen — endpoint laskee sen serverpuolella.
export default function DemoPage() {
  const stations = referenceLevels.stations.map((s) => ({
    stationId: s.stationId,
    name: s.name,
    region: s.region,
    latitude: s.latitude,
    longitude: s.longitude,
  }));

  const referencePeriod = {
    start: referenceLevels.historyStart,
    end: referenceLevels.historyEnd,
  };

  // Keskimääräinen havaintomäärä per asema — kertoo footnotessa vertailudatan
  // syvyyden (~4150 obs/station) ilman omaa "engineering quality" -blokkia.
  const sampleCounts = referenceLevels.stations.map((s) => s.sampleCount);
  const avgSampleCount =
    sampleCounts.length > 0
      ? Math.round(
          sampleCounts.reduce((a, b) => a + b, 0) / sampleCounts.length,
        )
      : 0;

  return (
    <DemoApp
      stations={stations}
      referencePeriod={referencePeriod}
      avgSampleCount={avgSampleCount}
    />
  );
}
