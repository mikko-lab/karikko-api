'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Lang = 'en' | 'fi';

const STORAGE_KEY = 'karikko-demo-lang';

// Yksisivuinen demo → ei next-intl. Sanakirja literaalina.
const dict = {
  en: {
    title: 'Real-time water level overlay',
    subtitle: 'Decision-support data for Nordic inland waters',
    intro:
      "Marine charts show depths against a fixed reference. This overlay shows how today's water level compares to the long-term seasonal normal at each station — so you know when chart depths can be trusted, and when they can't.",
    instructions: 'Click a marker to inspect.',
    stationPlaceholder: 'Select a station from the map.',
    sectionStation: 'Station',
    sectionCurrent: 'Current',
    sectionReference: 'Seasonal normal',
    sectionAnomaly: 'Anomaly',
    measuredAt: 'Measured',
    distance: 'Distance from click',
    referencePeriodLabel: (start: string, end: string) =>
      `ISO-week median, ${start}–${end}`,
    sampleSize: (n: number) => `${n} historical observations this week`,
    disclaimerTitle: 'Decision-support data, not a chart correction',
    disclaimerBody:
      'The official nautical chart remains the authoritative reference. This overlay surfaces real-time hydrological data alongside the chart so the operator can make informed decisions. The boater retains full responsibility for navigation.',
    levelBelowP10: 'Exceptionally low — below 10th percentile',
    levelP10P50: 'Lower than normal — below seasonal median',
    levelP50P90: 'Within normal range — above seasonal median',
    levelAboveP90: 'Exceptionally high — above 90th percentile',
    sourcesHeading: 'Sources',
    sourceSyke: 'Water level — SYKE Hydrologiarajapinta',
    sourceTraficom: 'Nautical charts — Traficom open data',
    belowNormalSuffix: 'below normal',
    aboveNormalSuffix: 'above normal',
    atNormalSuffix: 'at normal',
    errorNoReference: 'No reference station within 150 km of this point.',
    errorUpstream: 'Could not reach the water level service.',
    errorStale: 'Latest measurement is older than 72 hours.',
    loading: 'Loading…',
    legend: 'Legend',
    otherStations: 'Other stations',
    noAnomalyData: 'no data',
    dataFootnote: (startYear: number, endYear: number, avgN: number) =>
      `Reference period: ${startYear}–${endYear} · ~${avgN} obs/station`,
  },
  fi: {
    title: 'Reaaliaikainen vedenkorkeus-overlay',
    subtitle: 'Päätöksentuki Pohjoismaiden sisävesille',
    intro:
      'Merikartta näyttää syvyydet kiinteällä vertailutasolla. Tämä overlay kertoo miten tämän hetken vedenkorkeus suhtautuu kunkin aseman pitkän ajan kausinormaaliin — joten tiedät milloin kartan syvyyksiin voi luottaa ja milloin ei.',
    instructions: 'Klikkaa karttamerkkiä nähdäksesi tiedot.',
    stationPlaceholder: 'Valitse asema kartalta.',
    sectionStation: 'Asema',
    sectionCurrent: 'Nykyinen',
    sectionReference: 'Kausinormaali',
    sectionAnomaly: 'Poikkeama',
    measuredAt: 'Mitattu',
    distance: 'Etäisyys klikkauspisteestä',
    referencePeriodLabel: (start: string, end: string) =>
      `ISO-viikon mediaani, ${start}–${end}`,
    sampleSize: (n: number) => `${n} historiallista havaintoa tällä viikolla`,
    disclaimerTitle: 'Päätöksentuki-data, ei karttakorjaus',
    disclaimerBody:
      'Virallinen merikartta on edelleen ainoa auktoritatiivinen lähde. Tämä overlay tuo reaaliaikaisen hydrologisen tiedon kartan rinnalle, jotta käyttäjä voi tehdä päätöksiä tietoisena tilanteesta. Veneilijä on vastuussa navigoinnista.',
    levelBelowP10: 'Poikkeuksellisen matala — alle 10. persentiilin',
    levelP10P50: 'Normaalia matalampi — alle kausimediaanin',
    levelP50P90: 'Normaali vaihtelu — yli kausimediaanin',
    levelAboveP90: 'Poikkeuksellisen korkea — yli 90. persentiilin',
    sourcesHeading: 'Lähteet',
    sourceSyke: 'Vedenkorkeus — SYKE Hydrologiarajapinta',
    sourceTraficom: 'Merikartat — Traficom avoin data',
    belowNormalSuffix: 'normaalin alle',
    aboveNormalSuffix: 'normaalin yli',
    atNormalSuffix: 'normaalitasolla',
    errorNoReference: 'Ei viiteasemaa 150 km säteellä tästä pisteestä.',
    errorUpstream: 'Vedenkorkeuspalveluun ei saatu yhteyttä.',
    errorStale: 'Tuorein mittaus on yli 72 tuntia vanha.',
    loading: 'Ladataan…',
    legend: 'Merkit',
    otherStations: 'Muut asemat',
    noAnomalyData: 'ei dataa',
    dataFootnote: (startYear: number, endYear: number, avgN: number) =>
      `Vertailujakso: ${startYear}–${endYear} · ~${avgN} havaintoa/asema`,
  },
} as const;

type Dict = (typeof dict)['en'];
type DictKey = keyof Dict;

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: <K extends DictKey>(key: K) => Dict[K];
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  // Hydraation jälkeen: lue tallennettu valinta
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'fi') setLangState(saved);
    } catch {
      // localStorage voi olla pois käytöstä
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    <K extends DictKey>(key: K): Dict[K] => (dict[lang] as Dict)[key],
    [lang],
  );

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error('useLang must be used inside <LangProvider>');
  }
  return ctx;
}
