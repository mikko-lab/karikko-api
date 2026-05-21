'use client';

import { useLang } from '@/lib/i18n';
import type {
  DemoStation,
  DepthRealtimeData,
  ErrorPayload,
} from './DemoApp';

interface SidebarProps {
  station: DemoStation | null;
  data: DepthRealtimeData | ErrorPayload | null;
  referencePeriod: { start: string; end: string };
}

function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-switch" role="radiogroup" aria-label="Language">
      <button
        type="button"
        role="radio"
        aria-checked={lang === 'en'}
        data-active={lang === 'en'}
        onClick={() => setLang('en')}
        className="lang-switch__btn"
      >
        EN
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={lang === 'fi'}
        data-active={lang === 'fi'}
        onClick={() => setLang('fi')}
        className="lang-switch__btn"
      >
        FI
      </button>
    </div>
  );
}

/** Sijoittaa neulan mittariin clamping pois ääripäästä. P10/50/90 on 25/50/75 %. */
function needlePosition(
  currentCm: number,
  p10: number,
  p50: number,
  p90: number,
): number {
  // Kolme janaa: ennen P10, P10–P50, P50–P90, P90 jälkeen.
  // Mapataan visuaalisesti 0–25, 25–50, 50–75, 75–100.
  // Yli/alle alueiden klampataan.
  if (currentCm <= p10) {
    // Skaalataan väli edellisen 25%:n kohdalle leveydeltä ~ (p50-p10) suhteessa.
    // Jos alle p10, näytetään pisteenä juuri 5–25% välillä; clamp minimi 4%.
    const span = Math.max(1, p50 - p10);
    const overshoot = Math.min((p10 - currentCm) / span, 1);
    return Math.max(2, 25 - overshoot * 20);
  }
  if (currentCm <= p50) {
    const t = (currentCm - p10) / Math.max(1, p50 - p10);
    return 25 + t * 25;
  }
  if (currentCm <= p90) {
    const t = (currentCm - p50) / Math.max(1, p90 - p50);
    return 50 + t * 25;
  }
  const span = Math.max(1, p90 - p50);
  const overshoot = Math.min((currentCm - p90) / span, 1);
  return Math.min(98, 75 + overshoot * 20);
}

function AnomalyMeter({
  current,
  p10,
  p50,
  p90,
}: {
  current: number;
  p10: number;
  p50: number;
  p90: number;
}) {
  const pct = needlePosition(current, p10, p50, p90);
  return (
    <div
      className="meter"
      role="img"
      aria-label={`Current ${current} cm, percentile range P10 ${p10} – P50 ${p50} – P90 ${p90}`}
    >
      <div className="meter__track" />
      <div className="meter__needle" style={{ left: `${pct}%` }} />
      <div className="meter__labels">
        <span>P10</span>
        <span>P50</span>
        <span>P90</span>
      </div>
    </div>
  );
}

function formatAnomaly(cm: number, t: ReturnType<typeof useLang>['t']) {
  if (cm === 0) return `0 cm ${t('atNormalSuffix')}`;
  const sign = cm > 0 ? '+' : '−';
  const abs = Math.abs(cm);
  const suffix = cm > 0 ? t('aboveNormalSuffix') : t('belowNormalSuffix');
  return `${sign}${abs} cm ${suffix}`;
}

function formatMeasuredAt(iso: string, lang: 'en' | 'fi') {
  try {
    const d = new Date(iso);
    const locale = lang === 'fi' ? 'fi-FI' : 'en-GB';
    return d.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function anomalyValueClass(
  level: DepthRealtimeData['level'],
): string {
  switch (level) {
    case 'below_p10':
      return 'anomaly__value anomaly__value--below';
    case 'p10_to_p50':
      return 'anomaly__value anomaly__value--mild-below';
    case 'p50_to_p90':
      return 'anomaly__value anomaly__value--above-normal';
    case 'above_p90':
      return 'anomaly__value anomaly__value--high';
  }
}

function levelLabelKey(level: DepthRealtimeData['level']) {
  switch (level) {
    case 'below_p10':
      return 'levelBelowP10' as const;
    case 'p10_to_p50':
      return 'levelP10P50' as const;
    case 'p50_to_p90':
      return 'levelP50P90' as const;
    case 'above_p90':
      return 'levelAboveP90' as const;
  }
}

export default function Sidebar({
  station,
  data,
  referencePeriod,
}: SidebarProps) {
  const { t, lang } = useLang();

  const okData: DepthRealtimeData | null =
    data != null && !('error' in data) ? data : null;
  const errorData: ErrorPayload | null =
    data != null && 'error' in data ? data : null;

  return (
    <aside className="demo-sidebar" aria-label="Station details">
      {/* Brand + language switch */}
      <div className="sidebar-top">
        <div className="demo-brand">
          <div className="demo-brand__mark">
            Karikko <em>· overlay</em>
          </div>
        </div>
        <LangSwitcher />
      </div>

      {/* Intro */}
      <div>
        <div className="intro__overline">{t('subtitle')}</div>
        <h1 className="intro__title">
          {lang === 'en' ? (
            <>
              Real-time <em>water level</em> overlay
            </>
          ) : (
            <>
              Reaaliaikainen <em>vedenkorkeus</em>-overlay
            </>
          )}
        </h1>
        <p className="intro__lede">{t('intro')}</p>
      </div>

      <hr className="divider" />

      {/* Station name */}
      <div>
        <div className="station__overline">
          <span>{t('sectionStation')}</span>
          {okData && (
            <span style={{ color: 'var(--color-fg-muted)' }}>
              ≈ {okData.distKm} km
            </span>
          )}
        </div>
        {station ? (
          <>
            <h2 className="station__name">{station.name}</h2>
            <div className="station__region">{station.region}</div>
          </>
        ) : (
          <div className="station__placeholder">
            {t('stationPlaceholder')}
          </div>
        )}
      </div>

      {/* Anomaly hero */}
      {okData && (
        <div className="anomaly" data-level={okData.level}>
          <div className="anomaly__label">{t('sectionAnomaly')}</div>
          <div className={anomalyValueClass(okData.level)}>
            {formatAnomaly(okData.anomalyCm, t)}
          </div>
          <div className="anomaly__category">
            {t(levelLabelKey(okData.level))}
          </div>
          <AnomalyMeter
            current={okData.currentCm}
            p10={okData.reference.p10}
            p50={okData.reference.p50}
            p90={okData.reference.p90}
          />
        </div>
      )}

      {/* Data grid */}
      {okData && (
        <div className="data-grid">
          <div className="data-grid__item">
            <div className="data-grid__label">{t('sectionCurrent')}</div>
            <div className="data-grid__value">
              {okData.currentCm}
              <span className="data-grid__unit"> cm</span>
            </div>
            <div className="data-grid__hint">
              {t('measuredAt')}: {formatMeasuredAt(okData.measuredAt, lang)}
            </div>
          </div>
          <div className="data-grid__item">
            <div className="data-grid__label">{t('sectionReference')}</div>
            <div className="data-grid__value">
              {okData.reference.p50}
              <span className="data-grid__unit"> cm</span>
            </div>
            <div className="data-grid__hint">
              {t('sampleSize')(okData.reference.n)}
            </div>
          </div>
        </div>
      )}

      {/* Reference period meta */}
      {okData && (
        <div className="reference-detail">
          <div>
            {t('referencePeriodLabel')(
              referencePeriod.start,
              referencePeriod.end,
            )}
          </div>
          <div>
            ISO-week {okData.reference.isoWeek} · P10 {okData.reference.p10} ·
            P50 {okData.reference.p50} · P90 {okData.reference.p90}
          </div>
        </div>
      )}

      {/* Error states */}
      {errorData && (
        <div className="anomaly" data-level="below_p10">
          <div className="anomaly__label">Error</div>
          <div className="anomaly__category">
            {errorData.code === 'NO_REFERENCE' && t('errorNoReference')}
            {errorData.code === 'UPSTREAM_ERROR' && t('errorUpstream')}
            {errorData.code === 'STALE_DATA' && t('errorStale')}
            {errorData.code === 'NO_DATA' && t('errorUpstream')}
            {errorData.code === 'INVALID_PARAMS' && errorData.error}
            {errorData.code === 'NO_REFERENCE_WEEK' && errorData.error}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="disclaimer">
        <p className="disclaimer__title">{t('disclaimerTitle')}</p>
        <p className="disclaimer__body">{t('disclaimerBody')}</p>
      </div>

      {/* Sources */}
      <div className="sources">
        <div className="sources__heading">{t('sourcesHeading')}</div>
        <div>{t('sourceSyke')}</div>
        <div>{t('sourceTraficom')}</div>
      </div>
    </aside>
  );
}
