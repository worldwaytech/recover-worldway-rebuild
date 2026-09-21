import { runRatehawkSandboxValidation } from "../src/lib/ratehawk/hotels.server";
import { ratehawkProbe } from "../src/lib/ratehawk/client.server";
const probe = await ratehawkProbe();
console.log("PROBE", JSON.stringify(probe));
const report = await runRatehawkSandboxValidation({ regionId: 2011, checkin: "2026-12-10", checkout: "2026-12-12", residency: "gb", book: true });
console.log("ENV", report.environment, "PASSED", report.passed, "ORDER", report.orderId, "PARTNER", report.partnerOrderId);
for (const s of report.steps) console.log(`${s.passed ? "PASS" : "FAIL"} | ${s.step} | HTTP ${s.httpStatus ?? "-"} | ${s.detail}`);
console.log("MSG", report.message);
