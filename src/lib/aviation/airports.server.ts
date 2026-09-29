import { AIRPORT_MASTER } from "./airports.data.server";

export type Airport = {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  size: "L" | "M" | "S";
};

let parsed: Airport[] | null = null;

export function allAirports(): Airport[] {
  if (parsed) return parsed;
  parsed = AIRPORT_MASTER.split("\n")
    .filter(Boolean)
    .map((l) => {
      const [iata = "", icao = "", name = "", city = "", country = "", size = "S"] = l.split("|");
      return { iata, icao, name, city, country, size: size as Airport["size"] };
    });
  return parsed;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const SIZE_BONUS = { L: 30, M: 15, S: 0 } as const;

/** Ranked airport search by IATA, ICAO, airport name or city. */
export function searchAirports(query: string, limit = 12): Airport[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const scored: { a: Airport; s: number }[] = [];
  for (const a of allAirports()) {
    const iata = a.iata.toLowerCase();
    const icao = a.icao.toLowerCase();
    const city = norm(a.city);
    const name = norm(a.name);
    let s = 0;
    if (iata && iata === q) s = 1000;
    else if (icao && icao === q) s = 900;
    else if (city === q) s = 500;
    else if (city.startsWith(q)) s = 300;
    else if (name.startsWith(q)) s = 250;
    else if (name.includes(q) || city.includes(q)) s = 100;
    else if (norm(a.country) === q) s = 50;
    if (s) scored.push({ a, s: s + SIZE_BONUS[a.size] + (a.iata ? 5 : 0) });
  }
  return scored
    .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
    .slice(0, limit)
    .map((x) => x.a);
}

export function findAirportByCode(code: string): Airport | null {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  return allAirports().find((a) => a.iata === c) ?? allAirports().find((a) => a.icao === c) ?? null;
}
