import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  bookMerchantExperience,
  getMerchantAvailability,
  getMerchantProduct,
  holdMerchantExperience,
} from "@/lib/viator-merchant/merchant.functions";
import { isValidInternationalPhone } from "@/lib/viator/checkout-contract";

export const Route = createFileRoute("/merchant/$code")({
  head: () => ({
    meta: [
      { title: "Experience — Worldway Travels" },
      { name: "description", content: "Live availability, instant confirmation and mobile tickets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MerchantDetailPage,
});

type Slot = {
  productOptionCode: string;
  startTime: string | null;
  available: boolean;
  retailTotal: number | null;
  currency: string;
};

function MerchantDetailPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { data: productData } = useQuery({
    queryKey: ["merchant-product", code],
    queryFn: () => getMerchantProduct({ data: { code } }),
  });
  const product = productData?.product;

  const [travelDate, setTravelDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [checking, setChecking] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function paxMix() {
    return [
      { ageBand: "ADULT" as const, count: adults },
      { ageBand: "CHILD" as const, count: children },
      { ageBand: "INFANT" as const, count: infants },
    ].filter((p) => p.count > 0);
  }

  async function checkAvailability() {
    setChecking(true);
    setError(null);
    setSelected(null);
    setSlots(null);
    try {
      const res = await getMerchantAvailability({
        data: { productCode: code, travelDate, paxMix: paxMix() },
      });
      if (!res.ok) {
        setError(res.error ?? "Availability could not be checked.");
      } else {
        setSlots(res.slots);
        if (res.slots.length === 0) setError("No availability on this date.");
      }
    } catch {
      setError("Availability could not be checked.");
    } finally {
      setChecking(false);
    }
  }

  async function confirmBooking() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (!isValidInternationalPhone(phone)) {
        setError("Phone number must start with + and the country code (e.g. +971501234567).");
        return;
      }
      const guide =
        language && product?.languageGuides.length
          ? { type: product.languageGuides.find((g) => g.language === language)?.type ?? "GUIDE", language }
          : undefined;
      const hold = await holdMerchantExperience({
        data: {
          productCode: code,
          ...(product?.title ? { productTitle: product.title } : {}),
          productOptionCode: selected.productOptionCode,
          ...(selected.startTime ? { startTime: selected.startTime } : {}),
          travelDate,
          paxMix: paxMix(),
          ...(guide ? { languageGuide: guide } : {}),
          booker: { firstName, lastName, email, phone },
        },
      });
      if (!hold.ok) {
        setError(
          hold.error?.includes("Unauthorized")
            ? "Please sign in to complete this booking."
            : (hold.error ?? "Could not reserve this experience."),
        );
        return;
      }
      const book = await bookMerchantExperience({
        data: {
          partnerBookingRef: hold.partnerBookingRef,
          ...(guide ? { languageGuide: guide } : {}),
        },
      });
      if (!book.ok && book.state !== "pending") {
        setError(book.error ?? "The supplier could not confirm this booking.");
        return;
      }
      await navigate({
        to: "/merchant/booking/$ref",
        params: { ref: hold.partnerBookingRef },
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm text-muted-foreground">
        <Link to="/merchant" className="underline">Merchant Experiences</Link> / {code}
      </p>
      {product && (
        <>
          <h1 className="mt-2 text-3xl font-semibold text-foreground">{product.title}</h1>
          {product.images[0] && (
            <img
              src={product.images[0]}
              alt={product.title}
              className="mt-4 h-72 w-full rounded-xl object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <p className="mt-4 whitespace-pre-line text-muted-foreground">{product.description}</p>
          {product.cancellationDescription && (
            <p className="mt-3 text-sm text-muted-foreground">
              Cancellation: {product.cancellationDescription}
            </p>
          )}

          <section className="mt-8 rounded-xl border border-border bg-card p-5">
            <h2 className="font-medium text-foreground">Check live availability</h2>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm text-foreground">
                Date
                <input
                  type="date"
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                  className="block rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
              {(
                [
                  ["Adults", adults, setAdults],
                  ["Children", children, setChildren],
                  ["Infants", infants, setInfants],
                ] as const
              ).map(([label, value, setter]) => (
                <label key={label} className="text-sm text-foreground">
                  {label}
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={value}
                    onChange={(e) => setter(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                    className="block w-20 rounded-md border border-border bg-background px-3 py-2"
                  />
                </label>
              ))}
              <button
                type="button"
                disabled={!travelDate || checking}
                onClick={checkAvailability}
                className="rounded-md bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50"
              >
                {checking ? "Checking…" : "Check availability"}
              </button>
            </div>

            {slots && slots.length > 0 && (
              <div className="mt-4 space-y-2">
                {slots.map((slot) => (
                  <label
                    key={`${slot.productOptionCode}-${slot.startTime ?? "any"}`}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 ${
                      selected === slot ? "border-primary" : "border-border"
                    } ${slot.available ? "" : "opacity-50"}`}
                  >
                    <span className="flex items-center gap-3 text-foreground">
                      <input
                        type="radio"
                        name="slot"
                        disabled={!slot.available}
                        checked={selected === slot}
                        onChange={() => setSelected(slot)}
                      />
                      Option {slot.productOptionCode}
                      {slot.startTime ? ` · ${slot.startTime}` : ""}
                    </span>
                    <span className="font-semibold text-foreground">
                      {slot.retailTotal !== null
                        ? `${slot.currency} ${slot.retailTotal.toFixed(2)}`
                        : "Price on request"}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          {selected && (
            <section className="mt-6 rounded-xl border border-border bg-card p-5">
              <h2 className="font-medium text-foreground">Your details</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className="rounded-md border border-border bg-background px-3 py-2" />
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className="rounded-md border border-border bg-background px-3 py-2" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="rounded-md border border-border bg-background px-3 py-2" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (+ country code)" className="rounded-md border border-border bg-background px-3 py-2" />
                {product.languageGuides.length > 0 && (
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  >
                    <option value="">Guide language</option>
                    {[...new Set(product.languageGuides.map((g) => g.language))].map((lang) => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                )}
              </div>
              <button
                type="button"
                disabled={busy || !firstName || !lastName || !email || !phone}
                onClick={confirmBooking}
                className="mt-4 rounded-md bg-primary px-6 py-2 text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Confirming…" : "Confirm booking"}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                Sandbox preview — no payment is collected while this section is in testing.
              </p>
            </section>
          )}
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </>
      )}
      {productData && !productData.ok && (
        <p className="mt-10 text-muted-foreground">This experience could not be loaded.</p>
      )}
    </main>
  );
}
