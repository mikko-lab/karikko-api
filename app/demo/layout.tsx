import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './demo.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--type-display-loaded',
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--type-body-loaded',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--type-mono-loaded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Karikko — Real-time water level overlay',
  description:
    'Decision-support data for Nordic inland waters. Real-time water level anomalies layered alongside nautical charts.',
  robots: { index: false, follow: false },
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  // Fontit ladataan vain demo-routelle. demo-root saa muuttujat samaan
  // varilliseen scopeen kuin CSS-token-määritykset.
  return (
    <div
      className={`demo-root ${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
      style={
        {
          // Override fallback-fonttijonon ensimmäinen alkio Next/font-luokkaan
          '--type-display': `var(--type-display-loaded), Georgia, 'Times New Roman', serif`,
          '--type-body': `var(--type-body-loaded), -apple-system, system-ui, sans-serif`,
          '--type-mono': `var(--type-mono-loaded), ui-monospace, 'SF Mono', monospace`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
