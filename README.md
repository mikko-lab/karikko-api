# karikko-api

Backend API [Karikko](https://github.com/mikko-lab/karikko)-sovellukselle.

## Endpointit

### `GET /api/water-level?lat=&lon=`
Palauttaa lähimmät SYKE:n vedenkorkeusasemat ja reaaliaikaiset lukemat.

```json
{
  "stations": [
    {
      "stationId": 1862,
      "name": "Unnukka, Taipale, ylä",
      "distKm": 3.0,
      "levelCm": 113,
      "measuredAt": "2026-05-19T00:00:00"
    }
  ]
}
```

### `GET /api/fairways?lat=&lon=&radius=0.05`
Palauttaa Väyläviraston viralliset väylät ja turvalaitteet annetun alueen sisältä.

```json
{
  "lines": [...],
  "fairways": [...],
  "marks": [...]
}
```

### `GET /api/hazards?lat=&lon=`
Palauttaa käyttäjien merkitsemat matalikot lähistöltä.

### `POST /api/hazards`
Tallentaa uuden matalikkomerkinnän.

```json
{
  "latitude": 61.5,
  "longitude": 28.0,
  "depth_cm": 40,
  "note": "Kivi pinnan alla"
}
```

## Stack

- Next.js 15 App Router
- TypeScript
- Neon PostgreSQL (serverless)
- Vercel

## Ympäristömuuttujat

```
DATABASE_URL=postgresql://...
```

## Tietolähteet

- [SYKE Hydrologiarajapinta](https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.2/odata/)
- [Väylävirasto OGC Features API](https://avoinapi.vaylapilvi.fi/vaylatiedot/ogc/features/v1/)
