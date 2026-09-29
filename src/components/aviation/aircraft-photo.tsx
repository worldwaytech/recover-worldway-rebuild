import { mediaUrl } from "@/lib/media";
import type { CatalogueAircraft } from "@/lib/aviation/aircraft-catalogue.data";

/** Licensed model photo with required attribution, or a clean Worldway placeholder. */
export function AircraftPhoto({ aircraft, credit = true, className = "" }: { aircraft: CatalogueAircraft; credit?: boolean; className?: string }) {
  const p = aircraft.photo;
  return (
    <figure className={`relative overflow-hidden bg-muted ${className}`}>
      {p ? (
        <img src={mediaUrl(p.url)} alt={`${aircraft.name} — ${p.file}`} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-card text-center">
          <span className="font-serif text-lg text-foreground/80">{aircraft.name}</span>
          <span className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">Worldway Private Aviation · photo coming soon</span>
        </div>
      )}
      {p && credit ? (
        <figcaption className="absolute inset-x-0 bottom-0 bg-background/75 px-2 py-1 text-[9px] leading-tight text-muted-foreground backdrop-blur">
          Photo:{" "}
          <a href={p.page} target="_blank" rel="noopener noreferrer" className="underline">
            {p.artist || "Wikimedia Commons"}
          </a>{" "}
          ·{" "}
          {p.licenseUrl ? (
            <a href={p.licenseUrl} target="_blank" rel="noopener noreferrer license" className="underline">
              {p.license}
            </a>
          ) : (
            p.license
          )}{" "}
          · via Wikimedia Commons
        </figcaption>
      ) : null}
    </figure>
  );
}
