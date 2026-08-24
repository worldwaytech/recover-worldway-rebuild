// Crystal (AKTG) PROD activation readiness check — server only, admin-gated.
//
// Read-only by construction: it inspects presence-only configuration state and,
// when explicitly asked, performs a single documented parameter-free GET probe.
// It never places a booking, never calls a mutating operation and never reveals
// a credential, URL or channel value. It is also the authority on whether
// CRYSTAL_BOOKING_ENABLED may be flipped: every gate must be green.
import type {
  CrystalProdReadiness,
  CrystalReadinessGate,
  CrystalGateState,
} from "./booking-contract";
import { CRYSTAL_REQUIRED_OPERATIONS } from "./booking-contract";
import {
  bookingCapability,
  bookingCredentialConfigured,
  bookingEnabledFlag,
  certified,
  channelContextState,
  configuredOperations,
  egressConfirmed,
  probeBookingConnectivity,
} from "./aktg-booking.server";

function gate(
  id: CrystalReadinessGate["id"],
  label: string,
  state: CrystalGateState,
  detail: string,
  blocker?: string,
): CrystalReadinessGate {
  return blocker ? { id, label, state, detail, blocker } : { id, label, state, detail };
}

/**
 * Build the full readiness report.
 * @param probe when true, run ONE documented parameter-free GET against PROD.
 */
export async function crystalProdReadiness(probe: boolean): Promise<CrystalProdReadiness> {
  const capability = bookingCapability();
  const channel = channelContextState();
  const ops = configuredOperations();
  const keyPresent = bookingCredentialConfigured();
  const missingOps = CRYSTAL_REQUIRED_OPERATIONS.filter((op) => !ops.includes(op));

  const result = probe ? await probeBookingConnectivity() : null;
  const gates: CrystalReadinessGate[] = [];

  // 1. Booking API connectivity
  gates.push(
    !result
      ? gate(
          "connectivity",
          "Booking API connectivity",
          "unknown",
          "Not probed in this report. Use “Run read-only PROD check”.",
          "Connectivity has not been verified in this report.",
        )
      : result.reachable
        ? gate("connectivity", "Booking API connectivity", "green", "AKTG Booking API host reachable from our server.")
        : gate(
            "connectivity",
            "Booking API connectivity",
            "red",
            result.detail,
            "The AKTG Booking API host is not reachable from our server.",
          ),
  );

  // 2. Entitlement / authentication
  gates.push(
    !keyPresent
      ? gate(
          "entitlement",
          "API entitlement & authentication",
          "red",
          "No authorised AKTG subscription key is configured.",
          "CRYSTAL_AKTG_API_KEY (Booking API entitled) is not configured.",
        )
      : !result
        ? gate(
            "entitlement",
            "API entitlement & authentication",
            "unknown",
            "Key configured; entitlement not verified in this report.",
            "Booking API entitlement has not been verified against PROD.",
          )
        : result.ok
          ? gate("entitlement", "API entitlement & authentication", "green", "Authenticated read against PROD succeeded.")
          : gate(
              "entitlement",
              "API entitlement & authentication",
              result.authenticated ? "amber" : "red",
              result.detail,
              result.authenticated
                ? `Supplier rejected the documented read (${result.status ?? "no status"}).`
                : "AKTG has not entitled this key for the Booking API (401/403).",
            ),
  );

  // 3 & 4. Channel context
  gates.push(
    channel.salesChannelConfigured
      ? gate("sales_channel", "X-SalesChannel configured", "green", "Server-side sales channel present.")
      : gate(
          "sales_channel",
          "X-SalesChannel configured",
          "red",
          "Not configured.",
          "CRYSTAL_BOOKING_SALES_CHANNEL must be set to the real AKTG sales channel.",
        ),
  );
  gates.push(
    channel.officeIdConfigured
      ? gate("office_id", "X-OfficeID configured", "green", "Server-side office ID present.")
      : gate(
          "office_id",
          "X-OfficeID configured",
          "red",
          "Not configured.",
          "CRYSTAL_BOOKING_OFFICE_ID must be set to the real AKTG office ID.",
        ),
  );

  // 5. Egress / IP allowlisting
  gates.push(
    egressConfirmed()
      ? gate("egress", "Server egress / IP allowlisting", "green", "AKTG has confirmed our outbound IP is allowlisted.")
      : gate(
          "egress",
          "Server egress / IP allowlisting",
          "red",
          "Not confirmed.",
          "AKTG must confirm our server egress IP is allowlisted, then set CRYSTAL_BOOKING_EGRESS_CONFIRMED=true.",
        ),
  );

  // 6. Operation mapping
  gates.push(
    missingOps.length === 0
      ? gate(
          "operations_mapped",
          "Required Booking operations mapped",
          "green",
          `All ${ops.length} documented PROD operations mapped, including ${CRYSTAL_REQUIRED_OPERATIONS.join(", ")}.`,
        )
      : gate(
          "operations_mapped",
          "Required Booking operations mapped",
          "red",
          `Missing: ${missingOps.join(", ")}.`,
          `Documented operations still unmapped: ${missingOps.join(", ")}.`,
        ),
  );

  // 7. Read-only PROD verification
  gates.push(
    !result
      ? gate(
          "read_only_verification",
          "Read-only PROD verification",
          "unknown",
          "No read-only verification recorded in this report.",
          "Run the read-only PROD check once AKTG credentials land.",
        )
      : result.ok
        ? gate("read_only_verification", "Read-only PROD verification", "green", "Documented read-only PROD call succeeded.")
        : gate(
            "read_only_verification",
            "Read-only PROD verification",
            "red",
            result.detail,
            "The documented read-only PROD verification call did not succeed.",
          ),
  );

  // 8. Certification
  gates.push(
    certified()
      ? gate("certification", "AKTG certification sign-off", "green", "Certification recorded for this account.")
      : gate(
          "certification",
          "AKTG certification sign-off",
          "red",
          "Not recorded.",
          "AKTG must certify this account, then set CRYSTAL_BOOKING_CERTIFIED=true.",
        ),
  );

  const blockers = gates
    .filter((g) => g.state !== "green")
    .map((g) => g.blocker ?? `${g.label}: ${g.detail}`);
  const readyForLive = blockers.length === 0;

  // 9. Final activation gate
  gates.push(
    readyForLive
      ? bookingEnabledFlag()
        ? gate("activation", "LIVE activation", "green", "All gates green and CRYSTAL_BOOKING_ENABLED=true — rail is LIVE.")
        : gate(
            "activation",
            "LIVE activation",
            "amber",
            "All gates green. CRYSTAL_BOOKING_ENABLED=false, so booking stays disabled until it is flipped.",
          )
      : gate(
          "activation",
          "LIVE activation",
          "red",
          `Blocked by ${blockers.length} gate(s); booking remains fail-closed.`,
          blockers[0],
        ),
  );

  return {
    generatedAt: new Date().toISOString(),
    readyForLive,
    bookingEnabledFlag: bookingEnabledFlag(),
    railArmed: capability.live,
    gates,
    blockers,
    probed: Boolean(result),
  };
}
