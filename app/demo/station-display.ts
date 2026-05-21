/**
 * SYKE-asemien koordinaatit osoittavat fyysiseen sensoriin — usein padossa,
 * sillassa tai rantarakenteessa — joka kartalla osuu maa-alueelle. Tämä
 * ei vaikuta datan oikeellisuuteen mutta antaa demossa rikkinäisen visuaalisen
 * vaikutelman ("punainen pallo maalla").
 *
 * Tämä taulukko ylittää markerin näyttösijainnin lähistöllä olevalle avovedelle.
 * API-kutsut käyttävät aina aitoja SYKE-koordinaatteja — vain markerin
 * lat/lon kartalla muuttuu.
 *
 * Avain = Paikka_Id (SYKE). Arvo = halutut display-koordinaatit.
 * Jos asema ei ole tässä, käytetään SYKE:n omia koordinaatteja.
 *
 * Tarkista jokainen visuaalisesti /demo:ssa: jos pisteen sijainti ei näytä
 * uskottavalta sen järven kohdalla mitä se edustaa, säädä lat/lon hieman.
 */
export const STATION_DISPLAY_OVERRIDES: Record<
  number,
  { lat: number; lon: number; note?: string }
> = {
  // Lauritsala (1900) — sensori kanavan suulla, siirretty Suuri-Saimaan avovedelle
  1900: { lat: 61.22, lon: 28.20, note: 'Suuri-Saimaa' },

  // Oravi (1889) — sensori Oravin kanavan luukulla, siirretty Haukivedelle
  1889: { lat: 62.22, lon: 28.57, note: 'Haukivesi' },
};
