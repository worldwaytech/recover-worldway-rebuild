// Client-side personalisation for the cruise module: wishlist, compare tray,
// recently viewed and saved searches. Local-first, no PII leaves the browser.
const KEYS = {
  wishlist: "wwtg:crystal:wishlist",
  compare: "wwtg:crystal:compare",
  recent: "wwtg:crystal:recent",
  searches: "wwtg:crystal:searches",
} as const;

type Key = keyof typeof KEYS;

export interface SavedSearch {
  id: string;
  label: string;
  query: string;
  savedAt: string;
}

const listeners = new Set<() => void>();

function read<T>(key: Key, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(KEYS[key]);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: Key, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEYS[key], JSON.stringify(value));
  } catch {
    /* quota or private mode — personalisation is best-effort */
  }
  listeners.forEach((l) => l());
}

export const crystalPrefs = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  wishlist: () => read<string[]>("wishlist", []),
  toggleWishlist(code: string) {
    const cur = read<string[]>("wishlist", []);
    write("wishlist", cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]);
  },
  compare: () => read<string[]>("compare", []),
  toggleCompare(code: string) {
    const cur = read<string[]>("compare", []);
    if (cur.includes(code))
      write(
        "compare",
        cur.filter((c) => c !== code),
      );
    else write("compare", [...cur, code].slice(-4));
  },
  recent: () => read<string[]>("recent", []),
  pushRecent(code: string) {
    const cur = read<string[]>("recent", []).filter((c) => c !== code);
    write("recent", [code, ...cur].slice(0, 8));
  },
  searches: () => read<SavedSearch[]>("searches", []),
  saveSearch(label: string, query: string) {
    const cur = read<SavedSearch[]>("searches", []).filter((s) => s.query !== query);
    write(
      "searches",
      [
        {
          id: `${Date.now()}`,
          label: label || "Saved search",
          query,
          savedAt: new Date().toISOString(),
        },
        ...cur,
      ].slice(0, 12),
    );
  },
  removeSearch(id: string) {
    write(
      "searches",
      read<SavedSearch[]>("searches", []).filter((s) => s.id !== id),
    );
  },
};
