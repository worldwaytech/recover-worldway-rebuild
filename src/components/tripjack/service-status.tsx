type Capability = { key: string; label: string; mutating: boolean; mapped: boolean };

export type TripjackStatus = {
  suite: "cabs" | "tripsafe";
  label: string;
  environment: "uat";
  baseUrl: string;
  credentialConfigured: boolean;
  capabilities: Capability[];
  mappedCount: number;
  live: boolean;
};

export function TripjackServiceStatus({
  status,
  intro,
}: {
  status: TripjackStatus;
  intro: string;
}) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-14">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{intro}</p>

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Environment" value="Worldway UAT" />
        <Stat
          label="Supplier credential"
          value={status.credentialConfigured ? "Configured (server-side)" : "Not configured"}
        />
        <Stat
          label="Operations live"
          value={`${status.mappedCount} of ${status.capabilities.length}`}
        />
      </dl>

      <h2 className="mt-12 font-serif text-xl text-primary">Service operations</h2>
      <ul className="mt-4 divide-y divide-border/60 rounded-lg border border-border/60">
        {status.capabilities.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-sm text-foreground">
              {c.label}
              {c.mutating ? (
                <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  write
                </span>
              ) : null}
            </span>
            <span
              className={
                "text-[10px] uppercase tracking-[0.2em] " +
                (c.mapped ? "text-primary" : "text-muted-foreground")
              }
            >
              {c.mapped ? "Live" : "Awaiting supplier spec"}
            </span>
          </li>
        ))}
      </ul>

      {!status.live ? (
        <p className="mt-8 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          The secure Worldway UAT backend client, correlation-ID logging and redaction are in place.
          Each operation above is switched on as soon as its documented supplier endpoint contract is
          confirmed — we never call an unverified supplier URL or display simulated availability,
          pricing or bookings.
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 px-4 py-3">
      <dt className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}
