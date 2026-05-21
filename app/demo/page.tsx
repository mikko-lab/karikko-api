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

  return (
    <DemoApp stations={stations} referencePeriod={referencePeriod} />
  );
}
