// Portal store — now Lovable Cloud backed.
// Session, users, roles and tier are hydrated from Supabase via `useAuthHydration`.
// A synchronous in-memory cache preserves the previous portal.* API so existing
// pages (17+ callers) keep working without becoming async.
export type Role = "b2c" | "b2b" | "agent" | "admin" | "super_admin";
export type MemberTier = "traveler" | "travel_plus" | "elite" | "elite_plus";
export type PortalUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  provider: "email" | "google" | "apple" | "facebook";
  createdAt: string;
  tier?: MemberTier;
};

const SEARCH_KEY = "wwtg:anonSearches";

function readNum(k: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(localStorage.getItem(k) || "") as number;
  } catch {
    return fallback;
  }
}
function writeNum(k: string, v: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(k, JSON.stringify(v));
}

// In-memory cache mirrored from Supabase.
let _session: PortalUser | null = null;
let _users: PortalUser[] = [];
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => fn());
}

export const portal = {
  users(): PortalUser[] {
    return _users;
  },
  session(): PortalUser | null {
    return _session;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  // Legacy sync stubs kept so existing callers don't crash. Real auth happens
  // on the /auth page through Supabase; these are no-ops if called elsewhere.
  signIn(_email: string): PortalUser | null {
    return _session;
  },
  signUp(_input: {
    email: string;
    name: string;
    role: Role;
    provider?: PortalUser["provider"];
  }): PortalUser {
    return (
      _session ?? {
        id: "",
        email: _input.email,
        name: _input.name,
        role: _input.role,
        provider: _input.provider ?? "email",
        createdAt: new Date().toISOString(),
      }
    );
  },
  async signOut() {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.signOut();
    _session = null;
    emit();
  },
  // Role grants and account deactivation are privileged operations. They run
  // only through the server-verified Super Admin functions used by /admin/users
  // (setManagedUserRole / setManagedUserActive), never from the browser.
  // Cache updaters used by the auth hydration hook.
  _setSession(u: PortalUser | null) {
    _session = u;
    emit();
  },
  _setUsers(u: PortalUser[]) {
    _users = u;
    emit();
  },
  // ---- Search gate (anonymous users get 1 free search) ----
  anonSearchCount(): number {
    return readNum(SEARCH_KEY, 0);
  },
  canSearch(): boolean {
    if (this.session()) return true;
    return this.anonSearchCount() < 1;
  },
  recordSearch(): void {
    if (this.session()) return;
    writeNum(SEARCH_KEY, this.anonSearchCount() + 1);
  },
  resetAnonSearches(): void {
    writeNum(SEARCH_KEY, 0);
  },
  // ---- Membership tier ----
  tier(): MemberTier | null {
    const s = this.session();
    if (!s) return null;
    return s.tier ?? "traveler";
  },
  // Membership tier changes must originate from a verified payment webhook or
  // admin action on the server. The client cannot self-upgrade — the profiles
  // table has a BEFORE UPDATE trigger that rejects tier writes from non
  // service-role sessions. This stub is kept only so legacy callers compile.
  async setTier(_id: string, _tier: MemberTier) {
    throw new Error(
      "Membership upgrades must be completed via checkout — please contact the concierge.",
    );
  },
  hasAiAccess(): boolean {
    const s = this.session();
    if (!s) return false;
    // Business roles keep existing access.
    if (s.role === "agent" || s.role === "admin" || s.role === "super_admin" || s.role === "b2b")
      return true;
    const t = s.tier ?? "traveler";
    return t === "elite" || t === "elite_plus";
  },
  hasUnlimitedAi(): boolean {
    const s = this.session();
    if (!s) return false;
    if (s.role === "admin" || s.role === "super_admin") return true;
    return (s.tier ?? "traveler") === "elite_plus";
  },
};
