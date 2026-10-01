import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Languages, MapPin, Star } from "lucide-react";
import { PageShell } from "@/components/search-shell";
import { money } from "@/components/activities/activity-explorer";
import {
  getViatorConnectorStatus,
  getViatorProduct,
  getViatorReviews,
  getViatorSchedule,
  priceViatorActivity,
  searchViatorProducts,
} from "@/lib/viator.functions";
import {
  ageBandLabel,
  sortAgeBands,
  validatePaxMixAgainstBands,
  type AgeBandRule,
  type ViatorAgeBand,
} from "@/lib/viator/age-bands";
import { VIATOR_PRIVACY_URL, VIATOR_TERMS_URL } from "@/lib/viator/voucher";
import { supabase } from "@/integrations/supabase/client";
import {
  ViatorActivityCheckout,
  type ActivityCheckoutMode,
} from "@/components/activities/viator-activity-checkout";
import { trackCatalogueEvent } from "@/lib/catalogue-client";
import { mediaUrl } from "@/lib/media";

export const Route = createFileRoute("/activities/$code")({
  head: ({ params }) => {
    const title = `Experience ${params.code} — Worldway Travels Group`;
    const description =
      "Full itinerary, inclusions, live availability, live pricing and instant booking for this curated Worldway experience.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ActivityDetailPage,
});

type Detail = {
  productCode: string;
  title: string;
  description: string;
  image: string | null;
  images: string[];
  rating: number | null;
  reviewCount: number;
  price: number | null;
  currency: string;
  durationLabel: string | null;
  flags: string[];
  productUrl: string | null;
  destinationNames: string[];
  itinerary: {
    type: string | null;
    days: { title: string; description: string; stops: string[] }[];
    stops: { title: string; description: string; duration: string | null }[];
  };
  inclusions: string[];
  exclusions: string[];
  additionalInfo: string[];
  cancellationPolicy: { type: string | null; description: string | null };
  languages: string[];
  meetingPoint: string | null;
  pickup: string | null;
  ticketInfo: string | null;
  ageBands: AgeBandRule[];
  bookingLimits: {
    minTravelersPerBooking: number | null;
    maxTravelersPerBooking: number | null;
  };
  productOptions: {
    code: string;
    title: string;
    description: string | null;
    languageGuides: { type: string; language: string }[];
  }[];
  bookingQuestionIds: string[];
  travelerPickup: {
    pickupOptionType: string | null;
    allowCustomTravelerPickup: boolean;
    additionalInfo: string | null;
    minutesBeforeDepartureTimeForPickup: number | null;
    locationRefs: string[];
  } | null;
  languageGuides: { type: string; language: string }[];
  bookingConfirmationSettings: {
    confirmationType: string | null;
    bookingCutoffType: string | null;
    bookingCutoffInMinutes: number | null;
    allowBookingRequestsWithinCutoff: boolean | null;
  };
};

/** Bands offered when a product publishes none (Viator always sells adults). */
const FALLBACK_BANDS: AgeBandRule[] = [
  {
    ageBand: "ADULT",
    startAge: null,
    endAge: null,
    minTravelersPerBooking: null,
    maxTravelersPerBooking: null,
  },
];

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-t border-border/60 pt-8">
      <h2 className="font-serif text-2xl text-foreground">{title}</h2>
      <div className="mt-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((i, idx) => (
        <li key={idx} className="flex gap-2">
          <span className="text-primary">•</span>
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}

function ActivityDetailPage() {
  const { code } = Route.useParams();
  const loadProduct = useServerFn(getViatorProduct);
  const loadReviews = useServerFn(getViatorReviews);
  const loadSchedule = useServerFn(getViatorSchedule);
  const loadRelated = useServerFn(searchViatorProducts);
  const loadConnector = useServerFn(getViatorConnectorStatus);
  // null = unknown, false = supplier has not enabled booking access on our key
  const [bookingAccess, setBookingAccess] = useState<boolean | null>(null);

  const [product, setProduct] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<
    {
      rating: number | null;
      title: string;
      text: string;
      author: string;
      date: string | null;
      provider?: string | null;
    }[]
  >([]);
  const [schedule, setSchedule] = useState<{ dates: string[]; fromPrice: number | null }>({
    dates: [],
    fromPrice: null,
  });
  const [related, setRelated] = useState<
    {
      productCode: string;
      title: string;
      image: string | null;
      price: number | null;
      currency: string;
    }[]
  >([]);
  const [gallery, setGallery] = useState(0);

  // booking state
  const [date, setDate] = useState("");
  const [pax, setPax] = useState<Record<string, number>>({ ADULT: 2 });
  const [optionCode, setOptionCode] = useState("");
  const [startTime, setStartTime] = useState("");
  const [languageGuide, setLanguageGuide] = useState("");
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [checkoutMode, setCheckoutMode] = useState<ActivityCheckoutMode | null>(null);
  const quote = useServerFn(priceViatorActivity);
  const [live, setLive] = useState<{
    checking: boolean;
    available: boolean | null;
    total: number | null;
    currency: string | null;
    message: string | null;
  }>({
    checking: false,
    available: null,
    total: null,
    currency: null,
    message: null,
  });

  const bands = sortAgeBands(product?.ageBands?.length ? product.ageBands : FALLBACK_BANDS);
  const paxMix = bands
    .map((b) => ({ ageBand: b.ageBand, count: pax[b.ageBand] ?? 0 }))
    .filter((p) => p.count > 0);
  const travellers = paxMix.reduce((sum, p) => sum + p.count, 0);
  const paxCheck = validatePaxMixAgainstBands(paxMix, bands, product?.bookingLimits ?? {});
  const selectedOption = product?.productOptions?.find((o) => o.code === optionCode) ?? null;
  const guideChoices = selectedOption?.languageGuides?.length
    ? selectedOption.languageGuides
    : (product?.languageGuides ?? []);

  /** Real availability + real total from Viator for the chosen date and pax mix. */
  const refreshQuote = useCallback(async () => {
    if (!product || !date || !paxMix.length || !paxCheck.ok) {
      setLive((s) => ({ ...s, available: null, total: null, message: null }));
      return;
    }
    setLive((s) => ({ ...s, checking: true, message: null }));
    try {
      const res = (await quote({
        data: {
          productCode: product.productCode,
          travelDate: date,
          currency: product.currency,
          paxMix,
          ...(optionCode ? { productOptionCode: optionCode } : {}),
          ...(startTime ? { startTime } : {}),
        },
      })) as {
        ok: boolean;
        available: boolean;
        total: number | null;
        currency: string;
        error?: string;
      };
      setLive({
        checking: false,
        available: res.ok ? res.available : null,
        total: res.total,
        currency: res.currency,
        message: res.ok
          ? res.available
            ? null
            : "These places are not available for that date and party. Try another date."
          : (res.error ?? "Live pricing is unavailable right now."),
      });
    } catch (err) {
      setLive({
        checking: false,
        available: null,
        total: null,
        currency: null,
        message: err instanceof Error ? err.message : "Live pricing is unavailable right now.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.productCode, date, JSON.stringify(paxMix), optionCode, startTime, paxCheck.ok]);

  useEffect(() => {
    void refreshQuote();
  }, [refreshQuote]);

  const startInstantCheckout = (mode: ActivityCheckoutMode) => {
    setBookingError(null);
    const [firstName, ...rest] = form.full_name.trim().split(/\s+/);
    if (!date || !firstName || !rest.length || !form.email.trim()) {
      setBookingError("Add your travel date, full name and email to continue.");
      return;
    }
    if (!/^\+[1-9]\d{7,14}$/.test(form.phone.replace(/[^\d+]/g, ""))) {
      setBookingError(
        "The operator needs a contact number in international format, for example +971501234567.",
      );
      return;
    }
    if (!paxCheck.ok) {
      setBookingError(paxCheck.reason);
      return;
    }
    if (product?.productOptions?.length && !optionCode) {
      setBookingError("Choose which option of this experience you want.");
      return;
    }
    if (guideChoices.length && !languageGuide) {
      setBookingError("Choose a guide language for this experience.");
      return;
    }
    if (live.available === false) {
      setBookingError("Those places are not available. Pick another date or party size.");
      return;
    }
    setCheckoutMode(mode);
  };

  const boot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await loadProduct({ data: { code, currency: "USD" } })) as {
        ok: boolean;
        error?: string;
        product: Detail | null;
      };
      if (!res.ok || !res.product) {
        setError(res.error ?? "This experience could not be loaded.");
        setProduct(null);
      } else {
        setProduct(res.product);
        trackCatalogueEvent("product_view", { kind: "activity", slug: code });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [code, loadProduct]);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    void (async () => {
      try {
        const st = (await loadConnector({})) as {
          bookingAccess: { granted: boolean | null } | null;
        };
        setBookingAccess(st.bookingAccess?.granted ?? null);
      } catch {
        setBookingAccess(null);
      }
    })();
  }, [loadConnector]);

  useEffect(() => {
    void (async () => {
      try {
        const r = (await loadReviews({ data: { code, limit: 6 } })) as {
          reviews: typeof reviews;
        };
        setReviews(r.reviews ?? []);
      } catch {
        setReviews([]);
      }
      try {
        const s = (await loadSchedule({ data: { code, currency: "USD" } })) as {
          dates: string[];
          fromPrice: number | null;
        };
        setSchedule({ dates: s.dates ?? [], fromPrice: s.fromPrice ?? null });
        if (s.dates?.length) setDate((d) => d || s.dates[0]);
      } catch {
        /* availability optional */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (!product?.destinationNames?.length) return;
    void (async () => {
      try {
        const res = (await loadRelated({
          data: { destination: product.destinationNames[0], pageSize: 6, page: 1, currency: "USD" },
        })) as { products: typeof related };
        setRelated((res.products ?? []).filter((p) => p.productCode !== code).slice(0, 4));
      } catch {
        setRelated([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.destinationNames?.[0]]);

  const unit = schedule.fromPrice ?? product?.price ?? null;

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    setSubmitting(true);
    setBookingError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from("quote_requests").insert({
        user_id: auth.user?.id ?? null,
        product_kind: "activity",
        product_slug: product.productCode,
        product_title: product.title,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        party_size: travellers,
        travel_month: date ? date.slice(0, 7) : null,
        budget: live.total != null ? `${live.currency ?? product.currency} ${Math.round(live.total)}` : null,
        message: form.message,
      });
      if (insertError) throw new Error(insertError.message);
      trackCatalogueEvent("booking_conversion", { kind: "activity", slug: product.productCode });
      setConfirmed(
        `Reservation request received. Your Worldway travel director will confirm availability for ${date || "your dates"} within 4 hours.`,
      );
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Could not submit the reservation.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-6xl animate-pulse px-6 py-20">
          <div className="h-80 w-full rounded-2xl bg-muted/40" />
          <div className="mt-6 h-6 w-1/2 rounded bg-muted/40" />
          <div className="mt-3 h-4 w-1/3 rounded bg-muted/30" />
        </div>
      </PageShell>
    );
  }

  if (error || !product) {
    return (
      <PageShell>
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="font-serif text-3xl text-foreground">Experience unavailable</h1>
          <p className="mt-3 text-sm text-muted-foreground">{error}</p>
          <Link
            to="/activities"
            className="mt-6 inline-block rounded-full border border-primary/60 px-6 py-2.5 text-xs uppercase tracking-[0.25em] text-primary"
          >
            Back to activities
          </Link>
        </div>
      </PageShell>
    );
  }

  const images = product.images.length ? product.images : product.image ? [product.image] : [];

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>{" "}
          /{" "}
          <Link to="/activities" className="hover:text-primary">
            Activities
          </Link>{" "}
          / <span className="text-foreground">{product.title.slice(0, 60)}</span>
        </nav>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            {/* gallery */}
            {images.length ? (
              <div>
                <img
                  src={mediaUrl(images[gallery])}
                  alt={product.title}
                  className="aspect-[16/9] w-full rounded-2xl object-cover"
                />
                {images.length > 1 ? (
                  <div className="mt-3 flex gap-2 overflow-auto pb-1">
                    {images.map((src, i) => (
                      <button
                        key={src}
                        type="button"
                        aria-label={`Show image ${i + 1}`}
                        onClick={() => setGallery(i)}
                        className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border ${
                          i === gallery ? "border-primary" : "border-border/60"
                        }`}
                      >
                        <img
                          src={mediaUrl(src)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <h1 className="mt-6 font-serif text-3xl leading-tight text-foreground md:text-4xl">
              {product.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {product.destinationNames.length ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden />
                  {product.destinationNames.join(" · ")}
                </span>
              ) : null}
              {product.durationLabel ? (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" aria-hidden /> {product.durationLabel}
                </span>
              ) : null}
              {product.rating ? (
                <span className="flex items-center gap-1.5 text-primary">
                  <Star className="h-4 w-4 fill-current" aria-hidden />
                  {product.rating.toFixed(1)} ({product.reviewCount.toLocaleString()} reviews)
                </span>
              ) : null}
              {product.languages.length ? (
                <span className="flex items-center gap-1.5">
                  <Languages className="h-4 w-4" aria-hidden />
                  {product.languages.slice(0, 4).join(", ")}
                </span>
              ) : null}
            </div>

            <div className="mt-8 space-y-8">
              <Section title="Overview">
                <p className="whitespace-pre-line">{product.description}</p>
              </Section>

              {product.itinerary.days.length ? (
                <Section title="Day-by-day itinerary">
                  <ol className="space-y-5">
                    {product.itinerary.days.map((d, i) => (
                      <li key={i} className="rounded-xl border border-border/60 bg-card/50 p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-primary">
                          Day {i + 1}
                        </p>
                        <p className="mt-1 font-serif text-lg text-foreground">{d.title}</p>
                        {d.description ? <p className="mt-2">{d.description}</p> : null}
                        {d.stops.length ? (
                          <ul className="mt-2 list-disc space-y-1 pl-5">
                            {d.stops.map((s, j) => (
                              <li key={j}>{s}</li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </Section>
              ) : product.itinerary.stops.length ? (
                <Section title="What you'll see">
                  <ol className="space-y-4">
                    {product.itinerary.stops.map((s, i) => (
                      <li key={i} className="rounded-xl border border-border/60 bg-card/50 p-4">
                        <p className="font-medium text-foreground">
                          {i + 1}. {s.title || "Stop"}
                        </p>
                        <p className="mt-1">{s.description}</p>
                        {s.duration ? (
                          <p className="mt-1 text-xs text-primary">{s.duration}</p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </Section>
              ) : null}

              {product.inclusions.length ? (
                <Section title="What's included">
                  <List items={product.inclusions} />
                </Section>
              ) : null}
              {product.exclusions.length ? (
                <Section title="What's not included">
                  <List items={product.exclusions} />
                </Section>
              ) : null}

              {product.meetingPoint || product.pickup ? (
                <Section title="Meeting point & pickup">
                  {product.meetingPoint ? <p>{product.meetingPoint}</p> : null}
                  {product.pickup ? (
                    <p className="mt-2 capitalize">Pickup: {product.pickup}</p>
                  ) : null}
                  {product.meetingPoint ? (
                    <a
                      href={`https://www.google.com/maps/search/${encodeURIComponent(product.meetingPoint)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block text-xs uppercase tracking-[0.25em] text-primary"
                    >
                      Open map →
                    </a>
                  ) : null}
                </Section>
              ) : null}

              {product.additionalInfo.length ? (
                <Section title="Important information">
                  <List items={product.additionalInfo} />
                </Section>
              ) : null}

              <Section title="Cancellation policy">
                <p>
                  {product.cancellationPolicy.description ??
                    (product.flags.includes("FREE_CANCELLATION")
                      ? "Free cancellation up to 24 hours before the experience starts."
                      : "Cancellation terms are confirmed with your reservation.")}
                </p>
              </Section>

              <Section title="Frequently asked questions">
                <dl className="space-y-4">
                  <div>
                    <dt className="font-medium text-foreground">Is this experience accessible?</dt>
                    <dd>
                      {product.additionalInfo.find((i) => /wheelchair|accessib/i.test(i)) ??
                        "Contact your travel director for accessibility arrangements — we confirm directly with the operator."}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">How quickly is it confirmed?</dt>
                    <dd>
                      {product.flags.includes("INSTANT_CONFIRMATION")
                        ? "Instantly confirmed at the time of booking."
                        : "Confirmed by your travel director within four hours of the request."}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">Which languages are offered?</dt>
                    <dd>
                      {product.languages.length
                        ? product.languages.join(", ")
                        : "English, with further languages on request."}
                    </dd>
                  </div>
                </dl>
              </Section>

              {reviews.length ? (
                <Section title="Traveller reviews">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {reviews.map((r, i) => (
                      <blockquote
                        key={i}
                        className="rounded-xl border border-border/60 bg-card/50 p-4"
                      >
                        <p className="text-primary">
                          {"★".repeat(Math.round(r.rating ?? 0))}
                          <span className="ml-2 text-xs text-muted-foreground">{r.author}</span>
                        </p>
                        {/* Review source attribution is contractually required next to each review. */}
                        {r.provider ? (
                          <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {/* confidentiality-exempt: contractual Tripadvisor review attribution; supplier attribution stays internal (r.provider) */}{r.provider === "TRIPADVISOR" ? "Review via Tripadvisor" : "Verified traveller review"}
                          </p>
                        ) : null}
                        {r.title ? (
                          <p className="mt-1 font-medium text-foreground">{r.title}</p>
                        ) : null}
                        <p className="mt-1 line-clamp-5">{r.text}</p>
                      </blockquote>
                    ))}
                  </div>
                </Section>
              ) : null}

              {related.length ? (
                <Section title="Similar experiences nearby">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {related.map((r) => (
                      <Link
                        key={r.productCode}
                        to="/activities/$code"
                        params={{ code: r.productCode }}
                        className="overflow-hidden rounded-xl border border-border/60 bg-card/60 hover:border-primary/50"
                      >
                        {r.image ? (
                          <img
                            src={mediaUrl(r.image)}
                            alt={r.title}
                            loading="lazy"
                            className="aspect-[4/3] w-full object-cover"
                          />
                        ) : null}
                        <div className="p-3">
                          <p className="line-clamp-2 text-sm text-foreground">{r.title}</p>
                          <p className="mt-1 text-xs text-primary">
                            From {money(r.price, r.currency)}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </Section>
              ) : null}
            </div>
          </div>

          {/* ---------- booking panel ---------- */}
          <aside id="book" className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-xl">
              <p className="text-xs uppercase tracking-[0.3em] text-primary">Reserve</p>
              <p className="mt-2 text-2xl text-foreground">
                From {money(unit, product.currency)}{" "}
                <span className="text-xs text-muted-foreground">per adult</span>
              </p>

              <form onSubmit={submitBooking} className="mt-5 space-y-4" id="quote">
                <label className="block text-sm">
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    Date
                  </span>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                  />
                </label>
                {schedule.dates.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {schedule.dates.slice(0, 6).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDate(d)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${
                          date === d
                            ? "border-primary text-primary"
                            : "border-border/70 text-muted-foreground"
                        }`}
                      >
                        {d.slice(5)}
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* travellers — exactly the age groups this experience sells */}
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    Travellers
                  </legend>
                  {bands.map((band) => (
                    <label
                      key={band.ageBand}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">{ageBandLabel(band)}</span>
                      <input
                        type="number"
                        min={band.ageBand === "ADULT" ? 1 : 0}
                        max={band.maxTravelersPerBooking ?? 20}
                        value={pax[band.ageBand] ?? 0}
                        onChange={(e) =>
                          setPax((prev) => ({
                            ...prev,
                            [band.ageBand]: Math.max(0, Number(e.target.value)),
                          }))
                        }
                        className="w-20 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
                      />
                    </label>
                  ))}
                  {!paxCheck.ok ? (
                    <p role="alert" className="text-[11px] text-destructive">
                      {paxCheck.reason}
                    </p>
                  ) : null}
                </fieldset>

                {product.productOptions.length ? (
                  <label className="block text-sm">
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                      Option
                    </span>
                    <select
                      value={optionCode}
                      onChange={(e) => {
                        setOptionCode(e.target.value);
                        setLanguageGuide("");
                      }}
                      className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                    >
                      <option value="">Select an option</option>
                      {product.productOptions.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.title}
                        </option>
                      ))}
                    </select>
                    {selectedOption?.description ? (
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {selectedOption.description}
                      </span>
                    ) : null}
                  </label>
                ) : null}

                {guideChoices.length ? (
                  <label className="block text-sm">
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                      Guide language
                    </span>
                    <select
                      value={languageGuide}
                      onChange={(e) => setLanguageGuide(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                    >
                      <option value="">Select a guide language</option>
                      {guideChoices.map((g) => (
                        <option
                          key={`${g.type}-${g.language}`}
                          value={`${g.type}|${g.language}`}
                        >
                          {g.language.toUpperCase()} — {g.type.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {/* live supplier pricing — never an invented estimate */}
                <div
                  data-testid="activity-live-price"
                  className="space-y-1 rounded-lg border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground"
                >
                  <div className="flex justify-between">
                    <span>
                      {travellers} traveller{travellers === 1 ? "" : "s"}
                    </span>
                    <span>{date || "select a date"}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/60 pt-1 text-sm text-foreground">
                    <span>Total</span>
                    <span>
                      {live.checking
                        ? "Checking…"
                        : live.total != null
                          ? money(live.total, live.currency ?? product.currency)
                          : "—"}
                    </span>
                  </div>
                  {live.message ? <p className="text-[11px]">{live.message}</p> : null}
                  {live.total != null && live.available ? (
                    <p className="text-[11px]">
                      Confirmed live with the operator for this date and party. Taxes and fees
                      included.
                    </p>
                  ) : null}
                </div>

                <input
                  required
                  placeholder="Full name"
                  aria-label="Full name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                />
                <input
                  required
                  type="email"
                  placeholder="Email"
                  aria-label="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                />
                <input
                  required
                  placeholder="Phone with country code, e.g. +971501234567"
                  aria-label="Phone"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                />
                <textarea
                  placeholder="Special requests"
                  aria-label="Special requests"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="h-20 w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm"
                />

                {bookingError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {bookingError}
                  </p>
                ) : null}
                {confirmed ? (
                  <p className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs text-primary">
                    {confirmed}
                  </p>
                ) : null}

                {bookingAccess === false ? (
                  <p
                    data-testid="ww-booking-access-note"
                    className="rounded-lg border border-border/70 bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground"
                  >
                    Book &amp; Pay Now / Pay Later activate automatically once the supplier
                    enables booking access on our production account (currently returning
                    “Endpoint access denied”). Until then, request a held reservation and our
                    travel desk will confirm it with the operator.
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={bookingAccess === false}
                    onClick={() => startInstantCheckout("pay_now")}
                    className="rounded-full bg-primary px-4 py-3 text-[11px] uppercase tracking-[0.25em] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Book &amp; Pay Now
                  </button>
                  <button
                    type="button"
                    disabled={bookingAccess === false}
                    onClick={() => startInstantCheckout("pay_later")}
                    className="rounded-full border border-primary px-4 py-3 text-[11px] uppercase tracking-[0.25em] text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Book &amp; Pay Later
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-full border border-border px-6 py-3 text-xs uppercase tracking-[0.3em] text-foreground hover:border-primary disabled:opacity-60"
                >
                  {submitting ? "Submitting…" : "Request a held reservation"}
                </button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Booking this experience is subject to the operator’s{" "}
                  <a href={VIATOR_TERMS_URL} target="_blank" rel="noreferrer" className="underline">
                    terms &amp; conditions
                  </a>{" "}
                  and{" "}
                  <a href={VIATOR_PRIVACY_URL} target="_blank" rel="noreferrer" className="underline">
                    privacy policy
                  </a>
                  .
                </p>
                <Link
                  to="/concierge"
                  search={{ prompt: `Help me plan around the experience “${product.title}”.` }}
                  className="block rounded-full border border-border px-6 py-3 text-center text-xs uppercase tracking-[0.25em] text-muted-foreground hover:border-primary hover:text-primary"
                >
                  Ask the AI Concierge
                </Link>
              </form>
            </div>
            {checkoutMode ? (
              <ViatorActivityCheckout
                mode={checkoutMode}
                productCode={product.productCode}
                productTitle={product.title}
                travelDate={date}
                currency={product.currency}
                paxMix={paxMix}
                ageBands={bands}
                {...(optionCode ? { productOptionCode: optionCode } : {})}
                {...(languageGuide
                  ? {
                      languageGuide: {
                        type: languageGuide.split("|")[0] ?? "",
                        language: languageGuide.split("|")[1] ?? "",
                      },
                    }
                  : {})}
                {...(live.total != null ? { quotedTotal: live.total } : {})}
                booker={{
                  firstName: form.full_name.trim().split(/\s+/)[0] ?? "",
                  lastName: form.full_name.trim().split(/\s+/).slice(1).join(" "),
                  email: form.email.trim(),
                  ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
                }}
                onClose={() => setCheckoutMode(null)}
              />
            ) : null}
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
