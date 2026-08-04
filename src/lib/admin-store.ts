// Admin/CRM/API management store — localStorage backed (mock).
export type Lead = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  source: "web" | "concierge" | "referral" | "partner" | "event";
  interest: "flights" | "hotels" | "jets" | "cruise" | "trip" | "other";
  value: number;
  stage: "new" | "qualified" | "proposal" | "won" | "lost";
  owner?: string;
  notes?: string;
  createdAt: string;
};
export type Contact = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  tier: "traveler" | "travel_plus" | "elite" | "vip" | "hni" | "uhni";
  ltv: number;
  lastBooking?: string;
  tags: string[];
  createdAt: string;
};
export type Deal = {
  id: string;
  title: string;
  contact: string;
  amount: number;
  stage: "discovery" | "quote" | "negotiation" | "won" | "lost";
  closeDate: string;
  owner: string;
};
export type ApiKey = {
  id: string;
  name: string;
  key: string;
  scopes: string[];
  environment: "production" | "staging" | "sandbox";
  createdAt: string;
  lastUsed?: string;
  status: "active" | "revoked";
  rateLimit: number;
  requests: number;
};
export type Endpoint = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  category: string;
  auth: boolean;
};
export type Webhook = {
  id: string;
  url: string;
  events: string[];
  secret: string;
  status: "active" | "paused";
  createdAt: string;
};
export type Booking = {
  id: string;
  ref: string;
  client: string;
  type: string;
  route: string;
  total: number;
  currency: string;
  status: "confirmed" | "hold" | "cancelled" | "pending";
  agent?: string;
  createdAt: string;
};
export type Payment = {
  id: string;
  ref: string;
  client: string;
  amount: number;
  currency: string;
  gateway: "razorpay" | "paypal" | "stripe" | "wallet";
  status: "captured" | "refunded" | "failed" | "pending";
  createdAt: string;
};
export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
  severity: "info" | "warn" | "critical";
};
export type FeatureFlag = { key: string; label: string; enabled: boolean; note?: string };
export type SystemSetting = {
  brandName: string;
  supportEmail: string;
  currency: string;
  maintenance: boolean;
};

const K = {
  leads: "wwtg:leads",
  contacts: "wwtg:contacts",
  deals: "wwtg:deals",
  apiKeys: "wwtg:apiKeys",
  webhooks: "wwtg:webhooks",
  bookings: "wwtg:bookings",
  payments: "wwtg:payments",
  audit: "wwtg:audit",
  flags: "wwtg:flags",
  settings: "wwtg:settings",
};

function r<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fb;
  } catch {
    return fb;
  }
}
function w(k: string, v: unknown) {
  if (typeof window !== "undefined") localStorage.setItem(k, JSON.stringify(v));
}
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const now = () => new Date().toISOString();

function seed<T>(k: string, factory: () => T[]): T[] {
  const cur = r<T[] | null>(k, null);
  if (cur && cur.length) return cur;
  const next = factory();
  w(k, next);
  return next;
}

const SEED_LEADS = (): Lead[] => [
  {
    id: uid("ld"),
    name: "Isabella Rossi",
    email: "isabella@rossi.co",
    phone: "+39 02 5555 1210",
    source: "web",
    interest: "jets",
    value: 84000,
    stage: "proposal",
    owner: "u_agent",
    notes: "MXP → LTN, Sept 18",
    createdAt: now(),
  },
  {
    id: uid("ld"),
    name: "Hiro Tanaka",
    email: "hiro@tanaka.jp",
    phone: "+81 3 5555 8811",
    source: "concierge",
    interest: "hotels",
    value: 26500,
    stage: "qualified",
    owner: "u_agent",
    notes: "Aman Tokyo 5 nts",
    createdAt: now(),
  },
  {
    id: uid("ld"),
    name: "Layla Al-Farsi",
    email: "layla@alfarsi.ae",
    phone: "+971 4 555 0044",
    source: "partner",
    interest: "trip",
    value: 142000,
    stage: "new",
    owner: "u_agent",
    notes: "Maldives + Seychelles",
    createdAt: now(),
  },
  {
    id: uid("ld"),
    name: "Emma Beaulieu",
    email: "emma@beaulieu.fr",
    phone: "+33 1 5555 2211",
    source: "referral",
    interest: "flights",
    value: 12800,
    stage: "won",
    owner: "u_agent",
    notes: "F class CDG→NRT",
    createdAt: now(),
  },
];
const SEED_CONTACTS = (): Contact[] => [
  {
    id: uid("ct"),
    name: "Isabella Rossi",
    email: "isabella@rossi.co",
    tier: "uhni",
    ltv: 620000,
    lastBooking: now(),
    tags: ["Milan", "Jets"],
    createdAt: now(),
  },
  {
    id: uid("ct"),
    name: "Hiro Tanaka",
    email: "hiro@tanaka.jp",
    tier: "elite",
    ltv: 148000,
    lastBooking: now(),
    tags: ["Tokyo", "Wellness"],
    createdAt: now(),
  },
  {
    id: uid("ct"),
    name: "Layla Al-Farsi",
    email: "layla@alfarsi.ae",
    tier: "hni",
    ltv: 312000,
    lastBooking: now(),
    tags: ["Dubai", "Yachts"],
    createdAt: now(),
  },
  {
    id: uid("ct"),
    name: "Robert Whitaker",
    email: "rw@whitaker.com",
    tier: "travel_plus",
    ltv: 42000,
    lastBooking: now(),
    tags: ["Aspen", "Ski"],
    createdAt: now(),
  },
];
const SEED_DEALS = (): Deal[] => [
  {
    id: uid("dl"),
    title: "Rossi — MXP→LTN Global 6000",
    contact: "Isabella Rossi",
    amount: 84000,
    stage: "negotiation",
    closeDate: now(),
    owner: "Amelia Agent",
  },
  {
    id: uid("dl"),
    title: "Tanaka — Aman Tokyo Signature",
    contact: "Hiro Tanaka",
    amount: 26500,
    stage: "quote",
    closeDate: now(),
    owner: "Amelia Agent",
  },
  {
    id: uid("dl"),
    title: "Al-Farsi — Indian Ocean 12nts",
    contact: "Layla Al-Farsi",
    amount: 142000,
    stage: "discovery",
    closeDate: now(),
    owner: "Amelia Agent",
  },
  {
    id: uid("dl"),
    title: "Whitaker — Aspen ski chalet",
    contact: "Robert Whitaker",
    amount: 38000,
    stage: "won",
    closeDate: now(),
    owner: "Amelia Agent",
  },
];
const SEED_KEYS = (): ApiKey[] => [
  {
    id: uid("ak"),
    name: "Production — Storefront",
    key: "wwl_live_" + Math.random().toString(36).slice(2, 30),
    scopes: ["read:catalog", "write:booking", "read:wallet"],
    environment: "production",
    createdAt: now(),
    lastUsed: now(),
    status: "active",
    rateLimit: 600,
    requests: 128432,
  },
  {
    id: uid("ak"),
    name: "Staging — Partner Sandbox",
    key: "wwl_test_" + Math.random().toString(36).slice(2, 30),
    scopes: ["read:catalog"],
    environment: "staging",
    createdAt: now(),
    status: "active",
    rateLimit: 200,
    requests: 3420,
  },
  {
    id: uid("ak"),
    name: "Legacy — B2B Portal",
    key: "wwl_live_" + Math.random().toString(36).slice(2, 30),
    scopes: ["read:catalog", "write:booking"],
    environment: "production",
    createdAt: now(),
    status: "revoked",
    rateLimit: 300,
    requests: 88221,
  },
];
const SEED_WEBHOOKS = (): Webhook[] => [
  {
    id: uid("wh"),
    url: "https://worldwaytravelsgroup.com/api/public/webhooks/booking",
    events: ["booking.confirmed", "booking.cancelled"],
    secret: "whsec_" + Math.random().toString(36).slice(2, 20),
    status: "active",
    createdAt: now(),
  },
  {
    id: uid("wh"),
    url: "https://worldwaytravelsgroup.com/api/public/webhooks/payment",
    events: ["payment.captured", "payment.refunded"],
    secret: "whsec_" + Math.random().toString(36).slice(2, 20),
    status: "active",
    createdAt: now(),
  },
];
const SEED_BOOKINGS = (): Booking[] => [
  {
    id: uid("bk"),
    ref: "WWL-10241",
    client: "L. Moreau",
    type: "Private Jet",
    route: "LON → NCE",
    total: 42800,
    currency: "USD",
    status: "confirmed",
    agent: "Amelia Agent",
    createdAt: now(),
  },
  {
    id: uid("bk"),
    ref: "WWL-10240",
    client: "A. Chen",
    type: "Hotel",
    route: "Aman Tokyo · 4 nts",
    total: 18200,
    currency: "USD",
    status: "hold",
    agent: "Amelia Agent",
    createdAt: now(),
  },
  {
    id: uid("bk"),
    ref: "WWL-10239",
    client: "R. Khoury",
    type: "Trip Builder",
    route: "Marrakech · 7 nts",
    total: 26500,
    currency: "USD",
    status: "confirmed",
    agent: "Amelia Agent",
    createdAt: now(),
  },
  {
    id: uid("bk"),
    ref: "WWL-10238",
    client: "I. Rossi",
    type: "Flight",
    route: "MXP → HND F",
    total: 12800,
    currency: "USD",
    status: "pending",
    agent: "Amelia Agent",
    createdAt: now(),
  },
];
const SEED_PAYMENTS = (): Payment[] => [
  {
    id: uid("pm"),
    ref: "PMT-88431",
    client: "L. Moreau",
    amount: 42800,
    currency: "USD",
    gateway: "stripe",
    status: "captured",
    createdAt: now(),
  },
  {
    id: uid("pm"),
    ref: "PMT-88430",
    client: "R. Khoury",
    amount: 26500,
    currency: "USD",
    gateway: "razorpay",
    status: "captured",
    createdAt: now(),
  },
  {
    id: uid("pm"),
    ref: "PMT-88429",
    client: "A. Chen",
    amount: 9100,
    currency: "USD",
    gateway: "paypal",
    status: "refunded",
    createdAt: now(),
  },
];
const SEED_AUDIT = (): AuditEntry[] => [
  {
    id: uid("au"),
    actor: "super@worldwaytravelsgroup.com",
    action: "role.grant",
    target: "u_agent → admin",
    at: now(),
    severity: "warn",
  },
  {
    id: uid("au"),
    actor: "admin@worldwaytravelsgroup.com",
    action: "apikey.rotate",
    target: "Production — Storefront",
    at: now(),
    severity: "info",
  },
  {
    id: uid("au"),
    actor: "system",
    action: "webhook.delivery",
    target: "booking.confirmed → 200",
    at: now(),
    severity: "info",
  },
];
const SEED_FLAGS = (): FeatureFlag[] => [
  { key: "ai_concierge", label: "AI Concierge", enabled: true, note: "Elite tier" },
  { key: "ai_trip_builder", label: "AI Trip Builder", enabled: true, note: "Elite tier" },
  { key: "razorpay", label: "Razorpay gateway", enabled: true },
  { key: "paypal", label: "PayPal gateway", enabled: true },
  { key: "cruise", label: "Cruise search", enabled: false, note: "Coming soon" },
  { key: "rail", label: "Rail search", enabled: false, note: "Coming soon" },
];
const SEED_SETTINGS = (): SystemSetting[] => [
  {
    brandName: "Worldway Travels Group",
    supportEmail: "concierge@worldwaytravelsgroup.com",
    currency: "USD",
    maintenance: false,
  },
];

// Catalog of endpoints (documentation, not persisted)
export const ENDPOINTS: Endpoint[] = [
  {
    method: "POST",
    path: "/api/public/partner/flights/search",
    description: "Search flights",
    category: "Catalog",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/public/partner/hotels/search",
    description: "Search hotels",
    category: "Catalog",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/public/partner/activities/search",
    description: "Search activities",
    category: "Catalog",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/public/partner/transfers/search",
    description: "Search transfers",
    category: "Catalog",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/public/partner/buses/search",
    description: "Search buses",
    category: "Catalog",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/public/partner/jets/quote",
    description: "Private jet quote",
    category: "Catalog",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/public/partner/trip/build",
    description: "AI trip builder",
    category: "AI",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/public/partner/concierge/chat",
    description: "AI concierge",
    category: "AI",
    auth: true,
  },
  {
    method: "GET",
    path: "/api/public/partner/wallet/balance",
    description: "Wallet balance",
    category: "Wallet",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/public/partner/wallet/topup",
    description: "Wallet top-up",
    category: "Wallet",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/public/webhooks/booking",
    description: "Booking webhooks",
    category: "Webhook",
    auth: false,
  },
  {
    method: "POST",
    path: "/api/public/webhooks/payment",
    description: "Payment webhooks",
    category: "Webhook",
    auth: false,
  },
];

export const admin = {
  leads: () => seed<Lead>(K.leads, SEED_LEADS),
  contacts: () => seed<Contact>(K.contacts, SEED_CONTACTS),
  deals: () => seed<Deal>(K.deals, SEED_DEALS),
  apiKeys: () => seed<ApiKey>(K.apiKeys, SEED_KEYS),
  webhooks: () => seed<Webhook>(K.webhooks, SEED_WEBHOOKS),
  bookings: () => seed<Booking>(K.bookings, SEED_BOOKINGS),
  payments: () => seed<Payment>(K.payments, SEED_PAYMENTS),
  audit: () => seed<AuditEntry>(K.audit, SEED_AUDIT),
  flags: () => seed<FeatureFlag>(K.flags, SEED_FLAGS),
  settings: () => seed<SystemSetting>(K.settings, SEED_SETTINGS)[0],

  addLead(l: Omit<Lead, "id" | "createdAt">) {
    const arr = admin.leads();
    const n = { ...l, id: uid("ld"), createdAt: now() };
    w(K.leads, [n, ...arr]);
    return n;
  },
  updateLead(id: string, patch: Partial<Lead>) {
    w(
      K.leads,
      admin.leads().map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );
  },
  removeLead(id: string) {
    w(
      K.leads,
      admin.leads().filter((x) => x.id !== id),
    );
  },

  addContact(c: Omit<Contact, "id" | "createdAt">) {
    const n = { ...c, id: uid("ct"), createdAt: now() };
    w(K.contacts, [n, ...admin.contacts()]);
    return n;
  },
  removeContact(id: string) {
    w(
      K.contacts,
      admin.contacts().filter((x) => x.id !== id),
    );
  },

  addDeal(d: Omit<Deal, "id">) {
    const n = { ...d, id: uid("dl") };
    w(K.deals, [n, ...admin.deals()]);
    return n;
  },
  updateDeal(id: string, patch: Partial<Deal>) {
    w(
      K.deals,
      admin.deals().map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );
  },
  removeDeal(id: string) {
    w(
      K.deals,
      admin.deals().filter((x) => x.id !== id),
    );
  },

  createApiKey(name: string, environment: ApiKey["environment"], scopes: string[]) {
    const n: ApiKey = {
      id: uid("ak"),
      name,
      key: `wwl_${environment === "production" ? "live" : "test"}_${Math.random().toString(36).slice(2, 30)}`,
      scopes,
      environment,
      createdAt: now(),
      status: "active",
      rateLimit: 300,
      requests: 0,
    };
    w(K.apiKeys, [n, ...admin.apiKeys()]);
    admin.log("apikey.create", `${environment}/${name}`, "warn");
    return n;
  },
  revokeApiKey(id: string) {
    w(
      K.apiKeys,
      admin.apiKeys().map((k) => (k.id === id ? { ...k, status: "revoked" as const } : k)),
    );
    admin.log("apikey.revoke", id, "critical");
  },
  rotateApiKey(id: string) {
    w(
      K.apiKeys,
      admin.apiKeys().map((k) =>
        k.id === id
          ? {
              ...k,
              key: `wwl_${k.environment === "production" ? "live" : "test"}_${Math.random().toString(36).slice(2, 30)}`,
            }
          : k,
      ),
    );
    admin.log("apikey.rotate", id, "warn");
  },
  removeApiKey(id: string) {
    w(
      K.apiKeys,
      admin.apiKeys().filter((k) => k.id !== id),
    );
  },

  createWebhook(url: string, events: string[]) {
    const n: Webhook = {
      id: uid("wh"),
      url,
      events,
      secret: `whsec_${Math.random().toString(36).slice(2, 20)}`,
      status: "active",
      createdAt: now(),
    };
    w(K.webhooks, [n, ...admin.webhooks()]);
    return n;
  },
  toggleWebhook(id: string) {
    w(
      K.webhooks,
      admin
        .webhooks()
        .map((x) =>
          x.id === id
            ? { ...x, status: x.status === "active" ? ("paused" as const) : ("active" as const) }
            : x,
        ),
    );
  },
  removeWebhook(id: string) {
    w(
      K.webhooks,
      admin.webhooks().filter((x) => x.id !== id),
    );
  },

  updateBookingStatus(id: string, status: Booking["status"]) {
    w(
      K.bookings,
      admin.bookings().map((b) => (b.id === id ? { ...b, status } : b)),
    );
    admin.log("booking.status", `${id} → ${status}`, "info");
  },
  removeBooking(id: string) {
    w(
      K.bookings,
      admin.bookings().filter((b) => b.id !== id),
    );
  },

  refundPayment(id: string) {
    w(
      K.payments,
      admin.payments().map((p) => (p.id === id ? { ...p, status: "refunded" as const } : p)),
    );
    admin.log("payment.refund", id, "critical");
  },

  toggleFlag(key: string) {
    w(
      K.flags,
      admin.flags().map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)),
    );
    admin.log("flag.toggle", key, "warn");
  },
  updateSettings(patch: Partial<SystemSetting>) {
    const cur = admin.settings();
    w(K.settings, [{ ...cur, ...patch }]);
    admin.log("settings.update", Object.keys(patch).join(","), "info");
  },

  log(action: string, target: string, severity: AuditEntry["severity"] = "info", actor = "system") {
    const n: AuditEntry = { id: uid("au"), actor, action, target, at: now(), severity };
    w(K.audit, [n, ...admin.audit()].slice(0, 500));
  },
};
