import { Link } from "@tanstack/react-router";
import { useSavedTours, type TourStub } from "@/lib/tour-shortlist";
import { mediaUrl } from "@/lib/media";

export function money(price: number | null, currency: string) {
  if (price == null) return "On request";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}

export type TourCardData = TourStub & {
  description?: string;
  countries?: string[];
  categories?: string[];
  departuresStart?: string | null;
  durationDays?: number | null;
};

function badges(t: TourCardData) {
  const out: string[] = [];
  if (t.durationDays) out.push(`${t.durationDays} days`);
  const style = (t.categories ?? []).find((c) =>
    /classic|comfort|active|wellness|family|18to|marine|private|national geographic/i.test(c),
  );
  if (style) out.push(style);
  if (t.departuresStart) {
    const days = Math.round((Date.parse(t.departuresStart) - Date.now()) / 86400000);
    if (days >= 0 && days <= 45) out.push("Departing soon");
  }
  return out.slice(0, 3);
}

export function TourCard({ tour }: { tour: TourCardData }) {
  const { toggle, isSaved } = useSavedTours();
  const saved = isSaved(tour.id);
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 transition-colors hover:border-primary/50">
      <button
        type="button"
        aria-label={saved ? `Remove ${tour.name} from shortlist` : `Save ${tour.name}`}
        onClick={() =>
          toggle({
            id: tour.id,
            name: tour.name,
            image: tour.image,
            region: tour.region,
            fromPrice: tour.fromPrice,
            currency: tour.currency,
          })
        }
        className={`absolute right-3 top-3 z-10 rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] backdrop-blur ${
          saved
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border/60 bg-background/70 text-muted-foreground hover:text-primary"
        }`}
      >
        {saved ? "Saved" : "Save"}
      </button>
      <Link to="/tours/journey/$id" params={{ id: tour.id }} className="block">
        <div className="aspect-[4/3] w-full overflow-hidden bg-muted/30">
          {tour.image ? (
            <img
              src={mediaUrl(tour.image)}
              alt={tour.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : null}
        </div>
        <div className="space-y-3 p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-primary">
            {tour.region ?? tour.countries?.[0] ?? "Guided journey"}
          </div>
          <h3 className="font-serif text-lg leading-snug text-foreground">{tour.name}</h3>
          {tour.description ? (
            <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {tour.description}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {badges(tour).map((b) => (
              <span
                key={b}
                className="rounded-full border border-border/60 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                {b}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border/50 pt-3 text-[11px] uppercase tracking-[0.18em]">
            <span className="text-muted-foreground">
              {tour.departuresStart
                ? `Next ${new Date(tour.departuresStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`
                : "Guided"}
            </span>
            <span className="text-primary">{money(tour.fromPrice, tour.currency)}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export function TourStubRow({ title, items }: { title: string; items: TourStub[] }) {
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <h2 className="mb-5 font-serif text-2xl text-foreground">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.slice(0, 4).map((t) => (
          <Link
            key={t.id}
            to="/tours/journey/$id"
            params={{ id: t.id }}
            className="flex gap-3 rounded-xl border border-border/60 bg-card/60 p-3 transition-colors hover:border-primary/50"
          >
            <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-muted/30">
              {t.image ? (
                <img
                  src={mediaUrl(t.image)}
                  alt={t.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="line-clamp-2 text-xs leading-snug text-foreground">{t.name}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-primary">
                {money(t.fromPrice, t.currency)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
