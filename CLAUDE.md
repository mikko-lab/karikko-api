@AGENTS.md

# Karikko-API

Veneilijöiden matalikkomerkintäpalvelu ja merenkulun apurajapinta Suomen vesille.

## Stack

- Next.js 15 App Router, TypeScript strict
- Neon PostgreSQL (serverless), `@neondatabase/serverless`-ajuri
- Vercel (Edge Runtime missä mahdollista, Node muuten)
- Zod validointiin, Vitest + MSW testaukseen

## Konventiot

- Endpointit `/api/v1/...`-polussa
- Query-parametrit: `lat`, `lon` desimaaliasteina (WGS84), `radius_m` metreinä
- Vastausmuoto: `{ data: ..., meta: { attribution, license, cached_at } }`
- Virheet: `{ error: string, code: string }` HTTP-statuskoodilla
- Aikaleimat: ISO 8601 UTC

## Ulkoiset lähteet ja niiden lisenssit

| Lähde | Käyttö | Lisenssi |
|-------|--------|----------|
| SYKE Hydrologia | Vedenkorkeus | CC BY 4.0 |
| Väylävirasto OGC | Väylät, turvalaitteet | CC BY 4.0 |
| Traficom WMTS | Merikartat | CC BY 4.0 + disclaimer |
| Traficom NtM | Tiedonannot | Tarkista per kohde |
| FMI WFS | Sää, aallot, salamat | CC BY 4.0 |
| Digitraffic | AIS, satamat | CC BY 4.0 |

## Älä tee

- Älä lisää `any`-tyyppejä
- Älä commitoi `.env*`-tiedostoja
- Älä proxytä pyyntöjä ilman cachetusta
- Älä unohda `User-Agent`-headeria ulkoisissa pyynnöissä
