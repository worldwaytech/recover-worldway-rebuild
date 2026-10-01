// OpenAPI 3.1 document for the Worldway Travel Commerce API. Browser-safe: no secrets,
// supplier names or internal endpoints. Kept in step with CommerceSchemas (commerce.server.ts).
const date = { type: "string", format: "date", example: "2026-12-15" };
const place = { type: "string", minLength: 2, maxLength: 60, example: "DEL" };
const err = (d: string) => ({ description: d, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });

const op = (id: string, summary: string, scope: string, schema: object, example: object) => ({
  post: {
    operationId: id,
    summary,
    description: `Requires scope \`${scope}\`. Read-only — no booking or payment is made through the API.`,
    security: [{ ApiKey: [] }, { BearerToken: [] }],
    requestBody: { required: true, content: { "application/json": { schema, example } } },
    responses: {
      "200": { description: "Success", content: { "application/json": { schema: { $ref: "#/components/schemas/Success" } } } },
      "400": err("Invalid input or missing JSON body"),
      "401": err("Missing, invalid, expired or revoked credentials"),
      "403": err("Missing scope, tenant suspended, or account not a partner member"),
      "404": err("Unknown operation"),
      "422": err("Request valid but could not be fulfilled (e.g. no live availability)"),
      "429": { ...err("Rate limit exceeded for this partner"), headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds to wait" } } },
      "500": err("Internal error"),
    },
  },
});

export const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Worldway Travel Commerce API",
    version: "1.0.0",
    description:
      "Search flights and tours, check live tour availability, quote tours and plan trips. All prices are live and Worldway-branded. " +
      "Authenticate with an API key issued by Worldway (header `X-Api-Key: wwk_live_…`) or a partner user's access token (`Authorization: Bearer …`, plus `X-Worldway-Tenant` if the user belongs to several partners). " +
      "Each partner has a per-minute rate limit; every call is logged against the partner.",
    contact: { name: "Worldway Travels Group", url: "https://worldwaytravelsgroup.com" },
  },
  servers: [{ url: "https://worldwaytravelsgroup.com/api/v1", description: "Production" }],
  tags: [{ name: "Commerce" }],
  paths: {
    "/commerce/search-flights": op("searchFlights", "Search flights", "flights.search", {
      type: "object", required: ["origin", "destination", "depart_date"],
      properties: { origin: place, destination: { ...place, example: "BOM" }, depart_date: date, return_date: date, passengers: { type: "integer", minimum: 1, maximum: 9, default: 1 }, cabin: { type: "string", enum: ["economy", "premium_economy", "business", "first"], default: "economy" } },
    }, { origin: "DEL", destination: "BOM", depart_date: "2026-12-15", passengers: 1, cabin: "economy" }),
    "/commerce/search-tours": op("searchTours", "Search tours", "tours.read", {
      type: "object",
      properties: { query: { type: "string", maxLength: 80 }, city: { type: "string", maxLength: 60 }, country: { type: "string", maxLength: 60 }, duration: { type: "string", enum: ["day", "2-4", "5-8", "9+"] }, page: { type: "integer", minimum: 1, maximum: 50, default: 1 } },
    }, { country: "Italy", duration: "day", page: 1 }),
    "/commerce/tour-availability": op("tourAvailability", "Live tour availability", "tours.read", {
      type: "object", required: ["tour_id", "from_date", "travellers"],
      properties: { tour_id: { type: "string", pattern: "^[\\w-]{2,200}$" }, from_date: date, travellers: { type: "integer", minimum: 1, maximum: 40 } },
    }, { tour_id: "rome-colosseum-tour", from_date: "2026-12-15", travellers: 2 }),
    "/commerce/quote-tour": op("quoteTour", "Quote a tour", "tours.quote", {
      type: "object", required: ["tour_id", "date", "service", "adults"],
      properties: { tour_id: { type: "string" }, date, service: { type: "string", enum: ["regular", "private"] }, adults: { type: "integer", minimum: 1, maximum: 40 }, children: { type: "integer", minimum: 0, maximum: 20, default: 0 }, infants: { type: "integer", minimum: 0, maximum: 10, default: 0 } },
    }, { tour_id: "rome-colosseum-tour", date: "2026-12-15", service: "regular", adults: 2 }),
    "/commerce/plan-trip": op("planTrip", "Plan a trip (flights + tour)", "trips.plan", {
      type: "object", required: ["origin", "destination", "depart_date", "return_date", "adults"],
      properties: { origin: place, destination: { ...place, example: "FCO" }, depart_date: date, return_date: { ...date, example: "2026-12-20" }, adults: { type: "integer", minimum: 1, maximum: 9 }, children: { type: "integer", minimum: 0, maximum: 8, default: 0 }, tour_ref: { type: "string" }, tour_query: { type: "string", maxLength: 80 } },
    }, { origin: "DEL", destination: "FCO", depart_date: "2026-12-15", return_date: "2026-12-20", adults: 2 }),
  },
  webhooks: {},
  "x-webhooks-status":
    "Outbound partner webhooks are not offered yet. All operations are synchronous request/response; no events are pushed to partners.",
  components: {
    securitySchemes: {
      ApiKey: { type: "apiKey", in: "header", name: "X-Api-Key", description: "Partner API key (wwk_live_…). Shown once at creation; store it securely." },
      BearerToken: { type: "http", scheme: "bearer", description: "Partner API key or partner user access token." },
    },
    schemas: {
      Success: { type: "object", properties: { ok: { type: "boolean", const: true }, data: { type: "object" } } },
      Error: { type: "object", properties: { ok: { type: "boolean", const: false }, error: { type: "string" } }, example: { error: "Missing scope tours.quote" } },
    },
  },
} as const;

export const API_SCOPES = [
  { scope: "flights.search", product: "Flights", ops: ["search-flights"] },
  { scope: "tours.read", product: "Tours", ops: ["search-tours", "tour-availability"] },
  { scope: "tours.quote", product: "Tours", ops: ["quote-tour"] },
  { scope: "trips.plan", product: "Trip planner", ops: ["plan-trip"] },
] as const;
