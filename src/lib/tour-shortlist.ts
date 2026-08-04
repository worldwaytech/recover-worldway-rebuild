// Client-side shortlist + recently-viewed store for the tours marketplace.
// Browser-only: every read happens inside an effect so SSR stays stable.
import { useCallback, useEffect, useState } from "react";

export type TourStub = {
  id: string;
  name: string;
  image: string | null;
  region: string | null;
  fromPrice: number | null;
  currency: string;
};

const SAVED_KEY = "wwtg:tours:saved";
const VIEWED_KEY = "wwtg:tours:viewed";
const SEARCH_KEY = "wwtg:tours:searches";
const EVENT = "wwtg:tours:store";

function read(key: string): TourStub[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as TourStub[]) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => t && t.id) : [];
  } catch {
    return [];
  }
}

function write(key: string, value: TourStub[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value.slice(0, 24)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* storage may be unavailable — shortlist is progressive enhancement */
  }
}

function useStore(key: string) {
  const [items, setItems] = useState<TourStub[]>([]);
  useEffect(() => {
    const sync = () => setItems(read(key));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key]);
  return items;
}

export function useSavedTours() {
  const saved = useStore(SAVED_KEY);
  const toggle = useCallback((tour: TourStub) => {
    const current = read(SAVED_KEY);
    const exists = current.some((t) => t.id === tour.id);
    write(SAVED_KEY, exists ? current.filter((t) => t.id !== tour.id) : [tour, ...current]);
  }, []);
  const isSaved = useCallback((id: string) => saved.some((t) => t.id === id), [saved]);
  return { saved, toggle, isSaved };
}

export function useRecentlyViewed() {
  return useStore(VIEWED_KEY);
}

export function recordTourView(tour: TourStub) {
  const current = read(VIEWED_KEY).filter((t) => t.id !== tour.id);
  write(VIEWED_KEY, [tour, ...current].slice(0, 12));
}

// ------------------------------------------------------------ saved searches

export type SavedSearch = { id: string; label: string; path: string; at: number };

function readSearches(): SavedSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEARCH_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedSearch[]) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => s && s.path) : [];
  } catch {
    return [];
  }
}

function writeSearches(value: SavedSearch[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEARCH_KEY, JSON.stringify(value.slice(0, 12)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* progressive enhancement */
  }
}

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  useEffect(() => {
    const sync = () => setSearches(readSearches());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const save = useCallback((label: string, path: string) => {
    const current = readSearches().filter((s) => s.path !== path);
    writeSearches([{ id: path, label, path, at: Date.now() }, ...current]);
  }, []);

  const remove = useCallback((path: string) => {
    writeSearches(readSearches().filter((s) => s.path !== path));
  }, []);

  return { searches, save, remove };
}
