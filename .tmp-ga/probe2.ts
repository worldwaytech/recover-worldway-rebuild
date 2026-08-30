const key = process.env.TOURS_API_KEY!;
const h = { "X-Application-Key": key, Accept: "application/json", "Content-Type": "application/json" };
const r0 = await fetch("https://rest.gadventures.com/", { headers: h });
const j0 = await r0.json() as Record<string, unknown>;
console.log("ROOT KEYS", Object.keys(j0));
console.log("DESC", String(j0["description"] ?? "").slice(0,1200));
for (const k of ["permissions","scopes","features","links","resources","agency","agent_code","name","id","status","key_type"]) {
  if (k in j0) console.log(k, JSON.stringify(j0[k]).slice(0,600));
}
const r = await fetch("https://rest.gadventures.com/bookings", { method:"POST", headers:h, body: JSON.stringify({}) });
console.log("POST /bookings", r.status, (await r.text()).slice(0,600));
const r2 = await fetch("https://rest.gadventures.com/customers", { method:"POST", headers:h, body: JSON.stringify({}) });
console.log("POST /customers", r2.status, (await r2.text()).slice(0,400));
