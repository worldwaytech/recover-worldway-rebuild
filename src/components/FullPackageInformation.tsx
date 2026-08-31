import {
  BedDouble,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileText,
  Info,
  MapPin,
  Plane,
  ShieldCheck,
  Sparkles,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";

type DetailDay = {
  day?: string | number;
  title?: string;
  text?: string;
  detail?: string;
  description?: string;
  accommodation?: string;
  meals?: readonly string[] | string;
  transport?: string;
  location?: string;
};

type DetailItem = { label: string; value?: string | number | null };

type FullPackageInformationProps = {
  title: string;
  subtitle?: string;
  overview?: string | null;
  itinerary?: readonly DetailDay[];
  highlights?: readonly string[];
  inclusions?: readonly string[];
  exclusions?: readonly string[];
  accommodations?: readonly string[];
  optionalActivities?: readonly string[];
  policies?: readonly { title: string; body: string }[];
  faqs?: readonly { q?: string; a?: string; question?: string; answer?: string }[];
  quickFacts?: readonly DetailItem[];
  destination?: string | null;
  durationLabel?: string | null;
  priceLabel?: string | null;
  departures?: readonly string[];
  supplier?: string | null;
  mode?: "light" | "dark";
  className?: string;
};

const compact = <T,>(items: readonly (T | null | undefined | false | "")[] = []) =>
  items.filter(Boolean) as T[];

const unique = (items: readonly string[] = []) =>
  Array.from(new Set(items.map((x) => x.trim()).filter(Boolean)));

const joinMeals = (meals?: readonly string[] | string) =>
  Array.isArray(meals) ? meals.filter(Boolean).join(", ") : meals;

const asText = (day: DetailDay) => day.description || day.detail || day.text || "";

function inferExpandedDays(itinerary: readonly DetailDay[] = [], durationLabel?: string | null) {
  if (itinerary.length >= 4) return itinerary;
  const explicitDays = Number(durationLabel?.match(/\d+/)?.[0] ?? 0);
  const target = Math.max(explicitDays || 0, itinerary.length || 0);
  if (target <= itinerary.length || target > 21) return itinerary;

  const base = itinerary[0];
  const title = base?.title || "Tailored touring day";
  const text =
    asText(base) ||
    "Private touring, transfers and hosted experiences are arranged around the confirmed route and guest pace.";
  return Array.from({ length: target }, (_, i) => ({
    day: i + 1,
    title: itinerary[i]?.title || (i === 0 ? title : `Curated experience day ${i + 1}`),
    description:
      asText(itinerary[i] ?? {}) ||
      `${text} Your Worldway specialist confirms the exact sightseeing sequence, dining times, transfers and local host arrangements before ticketing.`,
    accommodation: itinerary[i]?.accommodation || base?.accommodation,
    meals: itinerary[i]?.meals || base?.meals,
    transport: itinerary[i]?.transport || base?.transport,
    location: itinerary[i]?.location || base?.location,
  }));
}

function defaultPolicies(title: string, supplier?: string | null) {
  return [
    {
      title: "Booking process",
      body: `Submit an enquiry for ${title}; a Worldway specialist verifies live availability, supplier terms, routing, rooming and guest requirements before confirmation.`,
    },
    {
      title: "Payments",
      body: "Deposit, balance deadline, currency conversion and any gateway fees are confirmed in writing before payment. No automatic charge is made from this information page.",
    },
    {
      title: "Changes & cancellation",
      body: `${supplier || "Supplier"} rules can vary by departure, cabin, aircraft, hotel and season. Final cancellation penalties are shared on the quote and invoice before booking.`,
    },
    {
      title: "Travel documents",
      body: "Passport validity, visas, insurance, medical requirements and local taxes remain traveller responsibilities unless specifically included in the confirmed proposal.",
    },
  ];
}

function defaultFaqs(title: string) {
  return [
    {
      q: "Is this package instantly confirmed?",
      a: "Availability is checked live or with the supplier after your request. Confirmation is issued only after seats, rooms, services and payment terms are validated.",
    },
    {
      q: "Can Worldway customise the itinerary?",
      a: "Yes. Hotels, room categories, private guides, extensions, flights, transfers, dietary needs and celebrations can be adjusted before confirmation.",
    },
    {
      q: "Will I receive full documents?",
      a: `Yes. After confirmation, Worldway issues a detailed proposal, day-by-day itinerary, vouchers or e-documents, payment receipt and support contacts for ${title}.`,
    },
  ];
}

export function FullPackageInformation({
  title,
  subtitle = "Complete package information",
  overview,
  itinerary = [],
  highlights = [],
  inclusions = [],
  exclusions = [],
  accommodations = [],
  optionalActivities = [],
  policies = [],
  faqs = [],
  quickFacts = [],
  destination,
  durationLabel,
  priceLabel,
  departures = [],
  supplier,
  mode = "light",
  className = "",
}: FullPackageInformationProps) {
  const dark = mode === "dark";
  const expandedItinerary = inferExpandedDays(itinerary, durationLabel);
  const facts = compact<DetailItem>([
    destination ? { label: "Destination", value: destination } : null,
    durationLabel ? { label: "Duration", value: durationLabel } : null,
    priceLabel ? { label: "Indicative price", value: priceLabel } : null,
    supplier ? { label: "Operator", value: supplier } : null,
    ...quickFacts,
  ]).filter((x) => x.value != null && `${x.value}`.trim());
  const policyItems = policies.length ? policies : defaultPolicies(title, supplier);
  const faqItems = faqs.length ? faqs : defaultFaqs(title);
  const surface = dark
    ? "border-[#C9A84C]/20 bg-[#0B1A30] text-[#F5F0E8]"
    : "border-border bg-card text-card-foreground";
  const muted = dark ? "text-[#D6D6D6]/75" : "text-muted-foreground";
  const accent = dark ? "text-[#C9A84C]" : "text-primary";
  const soft = dark ? "bg-white/[0.04]" : "bg-muted/35";

  return (
    <section className={`space-y-8 ${className}`} aria-labelledby="full-package-information">
      <div className={`rounded-[6px] border p-6 ${surface}`}>
        <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${accent}`}>{subtitle}</p>
        <h2 id="full-package-information" className="mt-2 font-serif text-3xl">
          Full package information
        </h2>
        {overview && <p className={`mt-3 leading-7 ${muted}`}>{overview}</p>}
        {facts.length > 0 && (
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className={`rounded-[4px] p-4 ${soft}`}>
                <dt className={`text-[10px] uppercase tracking-[0.14em] ${muted}`}>{fact.label}</dt>
                <dd className="mt-1 text-sm font-semibold">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {expandedItinerary.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays className={`h-5 w-5 ${accent}`} />
            <h3 className="font-serif text-2xl">Complete day-by-day itinerary</h3>
          </div>
          <div className="space-y-4">
            {expandedItinerary.map((day, index) => {
              const text = asText(day);
              return (
                <article
                  key={`${day.day ?? index}-${day.title ?? index}`}
                  className={`rounded-[6px] border p-5 ${surface}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${accent}`}>
                        {day.day ? `Day ${day.day}` : `Day ${index + 1}`}
                      </p>
                      {day.title && <h4 className="mt-1 font-serif text-xl">{day.title}</h4>}
                    </div>
                    {day.location && (
                      <span className={`inline-flex items-center gap-1 text-xs ${muted}`}>
                        <MapPin className="h-3.5 w-3.5" /> {day.location}
                      </span>
                    )}
                  </div>
                  {text && (
                    <p className={`mt-3 whitespace-pre-line text-sm leading-7 ${muted}`}>{text}</p>
                  )}
                  <div className={`mt-4 grid gap-2 text-xs ${muted} sm:grid-cols-3`}>
                    {day.accommodation && (
                      <span className="inline-flex items-center gap-1.5">
                        <BedDouble className="h-3.5 w-3.5" /> {day.accommodation}
                      </span>
                    )}
                    {joinMeals(day.meals) && (
                      <span className="inline-flex items-center gap-1.5">
                        <Utensils className="h-3.5 w-3.5" /> {joinMeals(day.meals)}
                      </span>
                    )}
                    {day.transport && (
                      <span className="inline-flex items-center gap-1.5">
                        <Plane className="h-3.5 w-3.5" /> {day.transport}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailList
          title="Experience highlights"
          icon={Sparkles}
          items={unique(highlights)}
          mode={mode}
          positive
        />
        <DetailList
          title="What is included"
          icon={Check}
          items={unique(inclusions)}
          mode={mode}
          positive
        />
        <DetailList
          title="Not included / payable separately"
          icon={X}
          items={unique(exclusions)}
          mode={mode}
        />
        <DetailList
          title="Accommodation & cabin notes"
          icon={BedDouble}
          items={unique(accommodations)}
          mode={mode}
          fallback="Accommodation, suite or cabin category is confirmed against live availability before booking."
        />
      </div>

      {(optionalActivities.length > 0 || departures.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <DetailList
            title="Optional upgrades & experiences"
            icon={CreditCard}
            items={unique(optionalActivities)}
            mode={mode}
          />
          <DetailList
            title="Departures / operating windows"
            icon={Clock}
            items={unique(departures)}
            mode={mode}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <InfoPanel
          title="Booking, payment & policy notes"
          icon={ShieldCheck}
          items={policyItems.map((p) => `${p.title}: ${p.body}`)}
          mode={mode}
        />
        <InfoPanel
          title="Traveller questions"
          icon={FileText}
          items={faqItems.map((f) => {
            const item = f as { q?: string; a?: string; question?: string; answer?: string };
            return `${item.q || item.question}: ${item.a || item.answer}`;
          })}
          mode={mode}
        />
      </div>

      <div className={`rounded-[6px] border p-5 text-sm ${surface}`}>
        <div className="flex gap-3">
          <ClipboardCheck className={`mt-0.5 h-5 w-5 shrink-0 ${accent}`} />
          <p className={muted}>
            This page is designed as a complete pre-booking dossier. Final supplier availability,
            taxes, route permits, aircraft positioning, visas, insurance, rooming and cancellation
            rules are reconfirmed by Worldway before payment or ticketing.
          </p>
        </div>
      </div>
    </section>
  );
}

function DetailList({
  title,
  icon: Icon,
  items,
  mode,
  positive = false,
  fallback,
}: {
  title: string;
  icon: LucideIcon;
  items: readonly string[];
  mode: "light" | "dark";
  positive?: boolean;
  fallback?: string;
}) {
  const dark = mode === "dark";
  const surface = dark ? "border-[#C9A84C]/20 bg-[#0B1A30]" : "border-border bg-card";
  const muted = dark ? "text-[#D6D6D6]/75" : "text-muted-foreground";
  const accent = positive
    ? dark
      ? "text-emerald-300"
      : "text-emerald-600"
    : dark
      ? "text-[#C9A84C]"
      : "text-primary";
  const rows = items.length ? items : fallback ? [fallback] : [];
  if (!rows.length) return null;
  return (
    <div className={`rounded-[6px] border p-5 ${surface}`}>
      <h3 className="flex items-center gap-2 font-serif text-xl">
        <Icon className={`h-5 w-5 ${accent}`} /> {title}
      </h3>
      <ul className="mt-4 space-y-2">
        {rows.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className={`flex items-start gap-2 text-sm leading-6 ${muted}`}
          >
            <span
              className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${positive ? "bg-emerald-500" : dark ? "bg-[#C9A84C]" : "bg-primary"}`}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InfoPanel({
  title,
  icon: Icon,
  items,
  mode,
}: {
  title: string;
  icon: LucideIcon;
  items: readonly string[];
  mode: "light" | "dark";
}) {
  const dark = mode === "dark";
  return (
    <div
      className={`rounded-[6px] border p-5 ${dark ? "border-[#C9A84C]/20 bg-[#0B1A30]" : "border-border bg-card"}`}
    >
      <h3 className="flex items-center gap-2 font-serif text-xl">
        <Icon className={`h-5 w-5 ${dark ? "text-[#C9A84C]" : "text-primary"}`} /> {title}
      </h3>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <p
            key={index}
            className={`text-sm leading-6 ${dark ? "text-[#D6D6D6]/75" : "text-muted-foreground"}`}
          >
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}
