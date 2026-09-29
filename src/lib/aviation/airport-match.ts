export type AirportRef = { iata: string; icao: string; name: string };

/** True when a live empty-leg airport (code may be IATA or ICAO) is the selected airport. */
export function matchesAirport(a: AirportRef, code: string, name: string): boolean {
  const c = code.trim().toUpperCase();
  if (c && (c === a.iata || c === a.icao)) return true;
  return !!name && name.trim().toLowerCase() === a.name.trim().toLowerCase();
}
