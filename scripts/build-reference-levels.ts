/**
 * build-reference-levels.ts
 *
 * Rakentaa lib/reference-levels.json -tiedoston, joka sisältää kalenteriviikkokohtaiset
 * vedenkorkeuden vertailutasot (P10/P50/P90) per demo-asema 10 vuoden SYKE-historiasta.
 *
 * Tätä tiedostoa käyttää /api/v1/depth-realtime -endpoint anomalian laskemiseen:
 *   anomaly_cm = current_reading_cm - reference.p50[isoWeek_of_now]
 *
 * Aja: npx tsx scripts/build-reference-levels.ts
 * Kesto: ~10–15 min (10 asemaa × ~10 vuoden historiakysely SYKE-rajapintaan)
 *
 * Tarkoituksellisesti yksi tiedosto, ei riippuvuuksia paitsi Node stdlib + fetch.
 * PoC-vaihe: ei DB:tä, ei cron-jobeja, ei muuta — yksi committattava JSON.
 */

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// --- Konfiguraatio --------------------------------------------------------

const SYKE_BASE =
  'https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.2/odata';
const USER_AGENT = 'Karikko/1.0 (kontakti@example.fi)';

const HISTORY_START = '2015-01-01';
const PAGE_SIZE = 500; // SYKE API palauttaa max 500 kerrallaan
const PAGE_DELAY_MS = 200;

// Suure_Id 1 = vedenkorkeus
const WATER_LEVEL_SUURE_ID = 1;

// Demo-asemat. nameContains täsmää SYKE:n Paikka.Nimi -kenttään substringilla
// (case-insensitive). Region on vain ryhmittelyä varten loggauksessa ja UI:ssa.
const DEMO_STATIONS: ReadonlyArray<{ nameContains: string; region: string }> = [
  // Saimaa
  { nameContains: 'Saimaa, Lauritsala', region: 'Saimaa' },
  { nameContains: 'Pihlajavesi, Savonlinna, ala', region: 'Saimaa' },
  { nameContains: 'Haukivesi, Oravi', region: 'Saimaa' },
  { nameContains: 'Keitele, Viitasaari', region: 'Keitele' },
  // Kallavesi
  { nameContains: 'Kallavesi, Itkonniemi', region: 'Kallavesi' },
  { nameContains: 'Kallavesi, Konnus, ylä', region: 'Kallavesi' },
  // Pielinen
  { nameContains: 'Pielinen, Nurmes', region: 'Pielinen' },
  { nameContains: 'Pielinen, Ahveninen', region: 'Pielinen' },
  // Päijänne
  { nameContains: 'Päijänne, pohj', region: 'Päijänne' },
];

const OUTPUT_PATH = path.join(process.cwd(), 'lib', 'reference-levels.json');

// --- Tyypit ---------------------------------------------------------------

interface SykeStation {
  Paikka_Id: number;
  Suure_Id: number;
  Nimi: string;
  KoordLat: string;
  KoordLong: string;
}

interface Reading {
  Paikka_Id: number;
  Aika: string;
  Arvo: number | null;
  Lippu_id?: number;
}

interface WeekStats {
  p10: number;
  p50: number;
  p90: number;
  n: number;
}

interface StationReference {
  stationId: number;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  historyStart: string;
  historyEnd: string;
  sampleCount: number;
  // Kalenteriviikko 1..53 → tilastot
  weeks: Record<number, WeekStats>;
}

interface OutputFile {
  generatedAt: string;
  historyStart: string;
  historyEnd: string;
  referenceMethod: 'iso-week-p10-p50-p90';
  unit: 'cm';
  note: string;
  stations: StationReference[];
}

// --- Apufunktiot ----------------------------------------------------------

/** SYKE:n DDMMSS-koordinaatti desimaaleiksi (sama logiikka kuin route.ts:ssä). */
function ddmmssToDecimal(ddmmss: string): number {
  const s = ddmmss.padStart(6, '0');
  return (
    parseInt(s.slice(0, 2), 10) +
    parseInt(s.slice(2, 4), 10) / 60 +
    parseInt(s.slice(4, 6), 10) / 3600
  );
}

/** ISO 8601 -viikkonumero (1..53). */
function isoWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

/** Lineaarisesti interpoloitu persentiili lajitellusta numerotaulukosta. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sykeFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`SYKE ${res.status}: ${url}`);
  }
  return res.json() as Promise<T>;
}

// --- Asemien haku ---------------------------------------------------------

let stationCache: SykeStation[] | null = null;

async function getAllWaterLevelStations(): Promise<SykeStation[]> {
  if (stationCache) return stationCache;
  console.log('  Haetaan kaikki vedenkorkeusasemat...');
  const url =
    `${SYKE_BASE}/Paikka` +
    `?$filter=Suure_Id%20eq%20${WATER_LEVEL_SUURE_ID}` +
    `&$select=Paikka_Id,Suure_Id,Nimi,KoordLat,KoordLong` +
    `&$top=5000`;
  const data = await sykeFetch<{ value: SykeStation[] }>(url);
  stationCache = data.value ?? [];
  console.log(`  ${stationCache.length} vedenkorkeusasemaa SYKE:ssä.`);
  return stationCache;
}

async function resolveStation(
  nameContains: string,
): Promise<SykeStation | null> {
  const all = await getAllWaterLevelStations();
  const needle = nameContains.toLowerCase();
  const matches = all.filter((s) => s.Nimi.toLowerCase().includes(needle));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    console.log(
      `  Useita osumia hakusanalle "${nameContains}":`,
      matches.map((m) => `${m.Nimi.trim()}(#${m.Paikka_Id})`).join(', '),
    );
    console.log(`  → Valitaan ensimmäinen: ${matches[0].Nimi.trim()}`);
  }
  return matches[0];
}

// --- Historiadatan haku ---------------------------------------------------

async function fetchHistory(
  stationId: number,
  sinceIso: string,
): Promise<Reading[]> {
  const all: Reading[] = [];
  let skip = 0;
  let page = 0;

  while (true) {
    const url =
      `${SYKE_BASE}/Vedenkorkeus` +
      `?$filter=Paikka_Id%20eq%20${stationId}` +
      `%20and%20Aika%20ge%20datetime'${sinceIso}T00:00:00'` +
      `&$orderby=Aika%20asc` +
      `&$top=${PAGE_SIZE}` +
      `&$skip=${skip}`;

    const data = await sykeFetch<{ value: Reading[] }>(url);
    const rows = data.value ?? [];
    all.push(...rows);
    page++;

    if (rows.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;

    // Progress log joka 10. sivu
    if (page % 10 === 0) {
      process.stdout.write(`    ...${all.length} havaintoa\r`);
    }

    await sleep(PAGE_DELAY_MS);
  }

  return all;
}

// --- Yhden aseman käsittely -----------------------------------------------

async function buildForStation(
  spec: { nameContains: string; region: string },
): Promise<StationReference | null> {
  console.log(`\n→ ${spec.region}: "${spec.nameContains}"`);
  const station = await resolveStation(spec.nameContains);
  if (!station) {
    console.warn(`  ⚠ Ei löytynyt SYKE:stä.`);
    return null;
  }
  console.log(
    `  Asema: ${station.Nimi.trim()} (Paikka_Id=${station.Paikka_Id})`,
  );

  const readings = await fetchHistory(station.Paikka_Id, HISTORY_START);
  console.log(`  ${readings.length} havaintoa ${HISTORY_START}–nyt`);

  if (readings.length === 0) {
    console.warn(`  ⚠ Ei dataa, ohitetaan.`);
    return null;
  }

  // Ryhmittele ISO-viikoittain. Sanity check: jotkut asemat käyttävät N2000-korkeuksia
  // (esim. Pielinen ~9380 cm = 93.80 m mpy), joten ylärajana 15000.
  const byWeek = new Map<number, number[]>();
  let valid = 0;
  for (const r of readings) {
    if (r.Arvo == null) continue;
    if (r.Arvo < 0 || r.Arvo > 15000) continue;
    const w = isoWeek(new Date(r.Aika));
    const list = byWeek.get(w);
    if (list) list.push(r.Arvo);
    else byWeek.set(w, [r.Arvo]);
    valid++;
  }

  const weeks: Record<number, WeekStats> = {};
  for (const [w, values] of byWeek) {
    values.sort((a, b) => a - b);
    weeks[w] = {
      p10: Math.round(percentile(values, 0.1)),
      p50: Math.round(percentile(values, 0.5)),
      p90: Math.round(percentile(values, 0.9)),
      n: values.length,
    };
  }

  return {
    stationId: station.Paikka_Id,
    name: station.Nimi.trim(),
    region: spec.region,
    latitude: ddmmssToDecimal(station.KoordLat),
    longitude: ddmmssToDecimal(station.KoordLong),
    historyStart: HISTORY_START,
    historyEnd: new Date().toISOString().slice(0, 10),
    sampleCount: valid,
    weeks,
  };
}

// --- Main -----------------------------------------------------------------

async function main() {
  console.log(`build-reference-levels.ts`);
  console.log(`  Historia: ${HISTORY_START} – tänään`);
  console.log(`  Asemia:   ${DEMO_STATIONS.length}`);
  console.log(`  Kohde:    ${OUTPUT_PATH}\n`);

  const results: StationReference[] = [];
  for (const spec of DEMO_STATIONS) {
    try {
      const built = await buildForStation(spec);
      if (built) results.push(built);
    } catch (e) {
      console.error(
        `  ❌ Virhe asemalle "${spec.nameContains}": ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  const output: OutputFile = {
    generatedAt: new Date().toISOString(),
    historyStart: HISTORY_START,
    historyEnd: new Date().toISOString().slice(0, 10),
    referenceMethod: 'iso-week-p10-p50-p90',
    unit: 'cm',
    note:
      'Vedenkorkeudet aseman omassa mitta-asteikossa (SYKE Hydrologiarajapinta). ' +
      'Anomalia lasketaan: current_cm - weeks[isoWeek(now)].p50. ' +
      'Tilastoja ei voi vertailla asemien välillä koska jokaisella asemalla on oma referenssi.',
    stations: results,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  console.log(
    `\n✓ Kirjoitettu ${OUTPUT_PATH}\n  Asemia: ${results.length}/${DEMO_STATIONS.length}\n  Yhteensä havaintoja: ${results.reduce((a, s) => a + s.sampleCount, 0)}`,
  );
}

main().catch((e) => {
  console.error('\n❌ Skripti epäonnistui:', e);
  process.exit(1);
});
