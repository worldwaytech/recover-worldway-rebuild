import { useCallback, useEffect, useState } from "react";

// TODO(Lovable Cloud): sync with `wishlists` table + auth.uid RLS when Cloud
// is enabled. Until then, wishlist lives in localStorage on the current
// device and gracefully no-ops during SSR.

const KEY = "wwl.wishlist.v1";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent("wwl:wishlist-change"));
  } catch {
    /* quota / privacy mode */
  }
}

export function useWishlist() {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setIds(read());
    setHydrated(true);
    const onChange = () => setIds(read());
    window.addEventListener("wwl:wishlist-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("wwl:wishlist-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const next = read();
    const at = next.indexOf(id);
    if (at >= 0) next.splice(at, 1);
    else next.push(id);
    write(next);
    setIds(next);
  }, []);

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  const clear = useCallback(() => {
    write([]);
    setIds([]);
  }, []);

  return { ids, has, toggle, clear, hydrated };
}
