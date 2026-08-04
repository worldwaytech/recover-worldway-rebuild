// Client-side persistence for the Activities discovery experience:
// recent searches, saved searches, wishlist and compare tray.
export type SavedSearch = {
  id: string;
  label: string;
  q: string;
  destination: string;
  filters: Record<string, unknown>;
  at: number;
};

export type SavedActivity = {
  code: string;
  title: string;
  image: string | null;
  price: number | null;
  currency: string;
};

const RECENT = "wwtg:activities:recent";
const SAVED_SEARCHES = "wwtg:activities:saved-searches";
const SAVED_ITEMS = "wwtg:activities:saved";
const COMPARE = "wwtg:activities:compare";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export const activityHistory = {
  recent: () => read<string[]>(RECENT, []),
  pushRecent(term: string) {
    const t = term.trim();
    if (!t) return read<string[]>(RECENT, []);
    const next = [t, ...read<string[]>(RECENT, []).filter((s) => s.toLowerCase() !== t.toLowerCase())].slice(0, 10);
    write(RECENT, next);
    return next;
  },
  clearRecent() {
    write(RECENT, []);
    return [] as string[];
  },

  savedSearches: () => read<SavedSearch[]>(SAVED_SEARCHES, []),
  saveSearch(entry: Omit<SavedSearch, "id" | "at">) {
    const next = [
      { ...entry, id: `${Date.now()}`, at: Date.now() },
      ...read<SavedSearch[]>(SAVED_SEARCHES, []),
    ].slice(0, 12);
    write(SAVED_SEARCHES, next);
    return next;
  },
  removeSearch(id: string) {
    const next = read<SavedSearch[]>(SAVED_SEARCHES, []).filter((s) => s.id !== id);
    write(SAVED_SEARCHES, next);
    return next;
  },

  saved: () => read<SavedActivity[]>(SAVED_ITEMS, []),
  toggleSaved(item: SavedActivity) {
    const rows = read<SavedActivity[]>(SAVED_ITEMS, []);
    const next = rows.some((r) => r.code === item.code)
      ? rows.filter((r) => r.code !== item.code)
      : [item, ...rows].slice(0, 60);
    write(SAVED_ITEMS, next);
    return next;
  },

  compare: () => read<SavedActivity[]>(COMPARE, []),
  toggleCompare(item: SavedActivity) {
    const rows = read<SavedActivity[]>(COMPARE, []);
    const next = rows.some((r) => r.code === item.code)
      ? rows.filter((r) => r.code !== item.code)
      : [...rows, item].slice(0, 4);
    write(COMPARE, next);
    return next;
  },
  clearCompare() {
    write(COMPARE, []);
    return [] as SavedActivity[];
  },
};

export const TRENDING_DESTINATIONS = [
  "Paris",
  "Rome",
  "Dubai",
  "Tokyo",
  "New York City",
  "Barcelona",
  "London",
  "Bali",
  "Reykjavik",
  "Marrakech",
];

export const POPULAR_ACTIVITY_SEARCHES = [
  "Skip-the-line museum",
  "Private city tour",
  "Food and wine tasting",
  "Desert safari",
  "Helicopter flight",
  "Sunset cruise",
  "Day trip",
  "Cooking class",
];

export const ACTIVITY_THEMES = [
  "Cultural",
  "Adventure",
  "Food",
  "Nature",
  "Water activities",
  "Wellness",
  "Safari",
  "Cruise",
  "Rail",
  "Walking",
  "Family",
  "Couples",
  "Luxury",
];