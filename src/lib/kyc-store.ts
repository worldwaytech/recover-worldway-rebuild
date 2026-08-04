// KYC / verification store — localStorage backed mock that mirrors real KYC aggregator flows
// (Signzy / Cashfree / Sandbox / Karza / Digitap style). Documents that have a government
// verification API are auto-verified; anything ambiguous drops into `compliance_reviews`.

export type KycDocType =
  // India — individual
  | "pan"
  | "aadhaar"
  | "voter_in"
  // India — business
  | "gst"
  | "cin"
  | "iec"
  // Global — individual
  | "passport"
  | "national_id"
  | "dl"
  | "residence_permit"
  | "selfie_liveness"
  | "face_match"
  | "address_proof"
  | "email_otp"
  | "mobile_otp"
  | "aml_screen"
  // Global — business
  | "company_reg"
  | "biz_reg_number"
  | "vat_tax"
  | "company_registry"
  | "ubo"
  | "director"
  | "biz_address"
  | "corp_docs";
export type KycStatus = "pending" | "verifying" | "verified" | "failed" | "review";

export type KycProvider =
  | "cashfree"
  | "signzy"
  | "sandbox"
  | "karza"
  | "digitap" // India
  | "sumsub"
  | "veriff"
  | "onfido"
  | "trulioo"
  | "persona"
  | "au10tix" // Global
  | "manual";

export type ApplicantKind =
  | "customer"
  | "agent"
  | "whitelabel"
  | "supplier"
  | "api_partner"
  | "corporate";

export type KycDocument = {
  id: string;
  applicantId: string;
  type: KycDocType;
  number: string;
  holderName: string;
  status: KycStatus;
  provider: KycProvider;
  providerRef?: string;
  verifiedName?: string;
  message?: string;
  expiresAt?: string;
  createdAt: string;
  verifiedAt?: string;
};

export type KycApplicant = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  country: string; // ISO-2, e.g. "IN", "US", "GB"
  entity: "individual" | "agency" | "corporate";
  role: "agent" | "b2b" | "b2c";
  kind: ApplicantKind;
  status: "draft" | "submitted" | "auto_approved" | "review" | "rejected" | "approved";
  reviewer?: string;
  createdAt: string;
  decidedAt?: string;
};

export type ComplianceReview = {
  id: string;
  applicantId: string;
  reason: string;
  severity: "low" | "medium" | "high";
  status: "open" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
  note?: string;
};

const K = {
  apps: "wwtg:kyc:apps",
  docs: "wwtg:kyc:docs",
  rev: "wwtg:kyc:reviews",
  audit: "wwtg:kyc:audit",
};

export type KycAudit = {
  id: string;
  applicantId: string;
  at: string;
  actor: string;
  event: string;
  meta?: Record<string, unknown>;
};

function r<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fb;
  } catch {
    return fb;
  }
}
function w(k: string, v: unknown) {
  if (typeof window !== "undefined") localStorage.setItem(k, JSON.stringify(v));
}
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const now = () => new Date().toISOString();

// Format validators — first line of defence before hitting the provider API.
// Only strict Indian formats are enforced; global docs go through the adapter's own checks.
const RX: Partial<Record<KycDocType, RegExp>> = {
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  aadhaar: /^[2-9]{1}[0-9]{11}$/,
  gst: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]$/,
  dl: /^[A-Z]{2}[0-9]{2}[- ]?[0-9]{4}[0-9A-Z]{7,10}$/,
  cin: /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/,
  iec: /^[0-9A-Z]{10}$/,
  passport: /^[A-Z0-9]{6,12}$/,
  voter_in: /^[A-Z]{3}[0-9]{7}$/,
};

// -----------------------------------------------------------------------------
// Document catalogue — grouped by scope so the UI can filter by country + kind.
// -----------------------------------------------------------------------------
export type DocSpec = {
  type: KycDocType;
  label: string;
  note: string;
  auto: boolean;
  scope: "in" | "global";
  target: "individual" | "business";
};

export const KYC_DOCS: DocSpec[] = [
  // ---------- India · individual ----------
  {
    type: "pan",
    label: "PAN Card",
    note: "NSDL / Income-Tax verification API — instant name match.",
    auto: true,
    scope: "in",
    target: "individual",
  },
  {
    type: "aadhaar",
    label: "Aadhaar (OTP eKYC)",
    note: "UIDAI-authorised eKYC via aggregator — OTP to linked mobile.",
    auto: true,
    scope: "in",
    target: "individual",
  },
  {
    type: "voter_in",
    label: "Voter ID (EPIC)",
    note: "Election Commission EPIC verification.",
    auto: true,
    scope: "in",
    target: "individual",
  },
  // ---------- India · business ----------
  {
    type: "gst",
    label: "GSTIN",
    note: "GSTIN lookup — legal name, status, registered address.",
    auto: true,
    scope: "in",
    target: "business",
  },
  {
    type: "cin",
    label: "Company Registration (CIN)",
    note: "MCA21 lookup — legal entity + directors.",
    auto: true,
    scope: "in",
    target: "business",
  },
  {
    type: "iec",
    label: "Import-Export Code (IEC)",
    note: "DGFT IEC verification API.",
    auto: true,
    scope: "in",
    target: "business",
  },
  // ---------- Global · individual ----------
  {
    type: "passport",
    label: "Passport (MRZ + NFC)",
    note: "OCR + MRZ parse, optional chip read via global provider.",
    auto: true,
    scope: "global",
    target: "individual",
  },
  {
    type: "national_id",
    label: "National ID / Identity Card",
    note: "Global provider matches document template + issuer registry.",
    auto: true,
    scope: "global",
    target: "individual",
  },
  {
    type: "dl",
    label: "Driving Licence",
    note: "Parivahan for IN, global provider elsewhere.",
    auto: true,
    scope: "global",
    target: "individual",
  },
  {
    type: "residence_permit",
    label: "Residence Permit / Visa",
    note: "Document authenticity check via global provider.",
    auto: true,
    scope: "global",
    target: "individual",
  },
  {
    type: "selfie_liveness",
    label: "Selfie + Liveness",
    note: "Active/passive liveness (blink, turn, depth).",
    auto: true,
    scope: "global",
    target: "individual",
  },
  {
    type: "face_match",
    label: "Face Match (Selfie ↔ ID)",
    note: "Biometric similarity score against submitted ID photo.",
    auto: true,
    scope: "global",
    target: "individual",
  },
  {
    type: "address_proof",
    label: "Proof of Address",
    note: "Utility bill / bank statement OCR + issuer heuristics.",
    auto: false,
    scope: "global",
    target: "individual",
  },
  {
    type: "email_otp",
    label: "Email OTP",
    note: "One-time code to the applicant's inbox.",
    auto: true,
    scope: "global",
    target: "individual",
  },
  {
    type: "mobile_otp",
    label: "Mobile OTP",
    note: "SMS OTP with carrier lookup for number validity.",
    auto: true,
    scope: "global",
    target: "individual",
  },
  {
    type: "aml_screen",
    label: "AML / Sanctions / PEP",
    note: "Continuous screening against OFAC, UN, EU, HMT, PEP lists.",
    auto: true,
    scope: "global",
    target: "individual",
  },
  // ---------- Global · business ----------
  {
    type: "company_reg",
    label: "Certificate of Incorporation",
    note: "Corporate document authenticity + registry match.",
    auto: false,
    scope: "global",
    target: "business",
  },
  {
    type: "biz_reg_number",
    label: "Business Registration Number",
    note: "Registry lookup (Companies House, EDGAR, RCS, etc.).",
    auto: true,
    scope: "global",
    target: "business",
  },
  {
    type: "vat_tax",
    label: "VAT / Tax Registration",
    note: "VIES / country tax authority validation.",
    auto: true,
    scope: "global",
    target: "business",
  },
  {
    type: "company_registry",
    label: "Company Registry Record",
    note: "Full registry snapshot: status, address, directors.",
    auto: true,
    scope: "global",
    target: "business",
  },
  {
    type: "ubo",
    label: "Ultimate Beneficial Owner",
    note: "UBO chain resolution + individual KYC per beneficial owner.",
    auto: false,
    scope: "global",
    target: "business",
  },
  {
    type: "director",
    label: "Director Verification",
    note: "Individual KYC applied to each listed director.",
    auto: true,
    scope: "global",
    target: "business",
  },
  {
    type: "biz_address",
    label: "Business Address",
    note: "Address proof cross-checked against registry filing.",
    auto: false,
    scope: "global",
    target: "business",
  },
  {
    type: "corp_docs",
    label: "Corporate Documents",
    note: "Bylaws, shareholder register, board resolutions — manual sign-off.",
    auto: false,
    scope: "global",
    target: "business",
  },
];

// -----------------------------------------------------------------------------
// Provider-agnostic KYC adapter registry.
//
// Each adapter implements the same `verify(doc, applicant)` contract; the
// router picks the right one based on the applicant's country + document type.
// This lets us plug/swap providers (Sumsub → Veriff → Onfido, Cashfree →
// Signzy) without touching business logic.
// -----------------------------------------------------------------------------
export type KycAdapterResult = {
  ok: boolean;
  name?: string;
  msg?: string;
  expiresAt?: string;
  ref?: string;
};
export type KycAdapter = {
  id: KycProvider;
  label: string;
  supports: (doc: KycDocType, country: string) => boolean;
  verify: (
    doc: KycDocument,
    applicant: KycApplicant,
  ) => Promise<KycAdapterResult> | KycAdapterResult;
};

const IN_DOCS: KycDocType[] = ["pan", "aadhaar", "voter_in", "gst", "cin", "iec"];

function baseCheck(doc: KycDocument): KycAdapterResult {
  const rx = RX[doc.type];
  const raw = doc.number.replace(/\s+/g, "").toUpperCase();
  if (rx && !rx.test(raw)) {
    return { ok: false, msg: `Invalid ${doc.type.toUpperCase()} format.` };
  }
  // Offline checksum validators — reject bad entries before they hit the provider.
  if (doc.type === "aadhaar" && !verhoeffValid(raw)) {
    return { ok: false, msg: "Aadhaar failed Verhoeff checksum — number is invalid." };
  }
  if (doc.type === "gst" && !gstinChecksumValid(raw)) {
    return { ok: false, msg: "GSTIN checksum digit is invalid." };
  }
  if (doc.type === "pan" && !panStructureValid(raw)) {
    return {
      ok: false,
      msg: "PAN 4th character must be a valid holder-type code (P/C/H/F/A/T/B/L/J/G).",
    };
  }
  if (doc.number.trim().endsWith("0"))
    return { ok: false, msg: "Name on record does not match applicant." };
  return {
    ok: true,
    name: doc.holderName.toUpperCase(),
    ref: `ok_${Math.random().toString(36).slice(2, 8)}`,
  };
}

// -----------------------------------------------------------------------------
// Offline validators
// -----------------------------------------------------------------------------

// Verhoeff checksum used by UIDAI for Aadhaar.
const V_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const V_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function verhoeffValid(num: string): boolean {
  if (!/^\d+$/.test(num)) return false;
  let c = 0;
  const digits = num
    .split("")
    .reverse()
    .map((d) => parseInt(d, 10));
  for (let i = 0; i < digits.length; i++) c = V_D[c][V_P[i % 8][digits[i]]];
  return c === 0;
}

// GSTIN checksum: last char is mod-36 checksum over the first 14 chars.
export function gstinChecksumValid(gstin: string): boolean {
  if (gstin.length !== 15) return false;
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = chars.indexOf(gstin[i]);
    if (v < 0) return false;
    const factor = i % 2 === 0 ? 1 : 2;
    const p = v * factor;
    sum += Math.floor(p / 36) + (p % 36);
  }
  const check = (36 - (sum % 36)) % 36;
  return chars[check] === gstin[14];
}

// PAN structural rule: 4th char is holder-type; 5th is first letter of surname/entity name.
export function panStructureValid(pan: string): boolean {
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return false;
  return "PCHFATBLJG".includes(pan[3]);
}

export const KYC_ADAPTERS: KycAdapter[] = [
  {
    id: "cashfree",
    label: "Cashfree Verification Suite (India)",
    supports: (t, c) => c === "IN" && IN_DOCS.includes(t),
    verify: baseCheck,
  },
  {
    id: "sumsub",
    label: "Sumsub (Global — 220+ countries)",
    supports: (t) =>
      [
        "passport",
        "national_id",
        "dl",
        "residence_permit",
        "selfie_liveness",
        "face_match",
        "aml_screen",
        "email_otp",
        "mobile_otp",
      ].includes(t),
    verify: baseCheck,
  },
  {
    id: "veriff",
    label: "Veriff (Global identity)",
    supports: (t) => ["passport", "national_id", "dl", "selfie_liveness", "face_match"].includes(t),
    verify: baseCheck,
  },
  {
    id: "onfido",
    label: "Onfido / Entrust (Global)",
    supports: (t) => ["passport", "national_id", "dl", "address_proof", "face_match"].includes(t),
    verify: baseCheck,
  },
  {
    id: "trulioo",
    label: "Trulioo GlobalGateway (Business + individual, 195+ countries)",
    supports: (t) =>
      ["biz_reg_number", "vat_tax", "company_registry", "director", "national_id"].includes(t),
    verify: baseCheck,
  },
  {
    id: "persona",
    label: "Persona (Configurable KYC/AML)",
    supports: (t) => ["passport", "national_id", "dl", "selfie_liveness", "aml_screen"].includes(t),
    verify: baseCheck,
  },
  {
    id: "au10tix",
    label: "AU10TIX (Enterprise identity + UBO)",
    supports: (t) => ["passport", "ubo", "director", "company_reg"].includes(t),
    verify: baseCheck,
  },
  {
    id: "manual",
    label: "Manual compliance review",
    supports: () => true,
    verify: () => ({ ok: false, msg: "Queued for compliance review." }),
  },
];

/** Route a document to the best adapter for the applicant's country. */
export function routeAdapter(docType: KycDocType, country: string): KycAdapter {
  const spec = KYC_DOCS.find((d) => d.type === docType);
  if (!spec?.auto) return KYC_ADAPTERS.find((a) => a.id === "manual")!;
  return (
    KYC_ADAPTERS.find((a) => a.id !== "manual" && a.supports(docType, country)) ??
    KYC_ADAPTERS.find((a) => a.id === "manual")!
  );
}

/**
 * Per-role KYC requirement matrix. The onboarding UI uses this to prompt for
 * the right set of documents and the reviewer dashboard uses it to decide
 * whether an applicant has met the minimum bar.
 */
export const KYC_REQUIREMENTS: Record<
  ApplicantKind,
  { individual: KycDocType[]; business: KycDocType[] }
> = {
  customer: { individual: ["email_otp", "mobile_otp"], business: [] },
  agent: {
    individual: ["passport", "selfie_liveness", "face_match", "address_proof", "aml_screen"],
    business: ["biz_reg_number", "vat_tax"],
  },
  whitelabel: {
    individual: ["passport", "selfie_liveness", "face_match", "aml_screen"],
    business: ["company_reg", "biz_reg_number", "vat_tax", "ubo", "director"],
  },
  supplier: {
    individual: ["passport", "aml_screen"],
    business: ["company_reg", "biz_reg_number", "vat_tax", "biz_address"],
  },
  api_partner: {
    individual: ["passport", "email_otp", "aml_screen"],
    business: ["company_reg", "biz_reg_number", "director"],
  },
  corporate: {
    individual: ["passport", "selfie_liveness", "aml_screen"],
    business: [
      "company_reg",
      "biz_reg_number",
      "vat_tax",
      "ubo",
      "director",
      "biz_address",
      "corp_docs",
    ],
  },
};

/** Compute required docs for an applicant given their country + kind. */
export function requiredDocsFor(
  a: Pick<KycApplicant, "kind" | "country" | "entity">,
): KycDocType[] {
  const req = KYC_REQUIREMENTS[a.kind];
  const set = new Set<KycDocType>([
    ...req.individual,
    ...(a.entity !== "individual" ? req.business : []),
  ]);
  // Indian applicants: prefer PAN + (Aadhaar or GST) over passport for local flows
  if (a.country === "IN") {
    set.delete("passport");
    set.add("pan");
    if (a.entity === "individual") set.add("aadhaar");
    if (a.entity !== "individual") set.add("gst");
  }
  return [...set];
}

function expiresIn(days: number) {
  return new Date(Date.now() + days * 864e5).toISOString();
}

export const kyc = {
  applicants: () => r<KycApplicant[]>(K.apps, []),
  documents: () => r<KycDocument[]>(K.docs, []),
  reviews: () => r<ComplianceReview[]>(K.rev, []),
  audits: () => r<KycAudit[]>(K.audit, []),

  log(applicantId: string, event: string, meta?: Record<string, unknown>, actor = "system") {
    const n: KycAudit = { id: uid("aud"), applicantId, at: now(), actor, event, meta };
    w(K.audit, [n, ...kyc.audits()].slice(0, 500));
  },

  createApplicant(
    input: Omit<KycApplicant, "id" | "createdAt" | "status"> & { status?: KycApplicant["status"] },
  ) {
    const n: KycApplicant = {
      ...input,
      id: uid("kyc"),
      createdAt: now(),
      status: input.status ?? "draft",
    };
    w(K.apps, [n, ...kyc.applicants()]);
    kyc.log(n.id, "applicant.created", { country: n.country, kind: n.kind });
    return n;
  },
  updateApplicant(id: string, patch: Partial<KycApplicant>) {
    w(
      K.apps,
      kyc.applicants().map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  },

  submitDoc(applicantId: string, type: KycDocType, number: string, holderName: string) {
    const spec = KYC_DOCS.find((d) => d.type === type)!;
    const applicant = kyc.applicants().find((a) => a.id === applicantId)!;
    const adapter = routeAdapter(type, applicant?.country ?? "IN");
    const base: KycDocument = {
      id: uid("doc"),
      applicantId,
      type,
      number: number.trim(),
      holderName: holderName.trim(),
      status: "verifying",
      provider: adapter.id,
      providerRef: `ref_${Math.random().toString(36).slice(2, 10)}`,
      createdAt: now(),
    };
    const list = [base, ...kyc.documents()];
    w(K.docs, list);
    kyc.log(applicantId, "doc.submitted", { type, provider: adapter.id });

    if (!spec.auto || adapter.id === "manual") {
      const patched: KycDocument = {
        ...base,
        status: "review",
        message: "Queued for compliance review.",
      };
      w(
        K.docs,
        list.map((d) => (d.id === base.id ? patched : d)),
      );
      kyc.openReview(applicantId, `${spec.label} requires manual review`, "medium");
      return patched;
    }

    const raw = adapter.verify(base, applicant);
    const res =
      raw instanceof Promise ? { ok: false, msg: "Async provider — poll for result" } : raw;
    const patched: KycDocument = res.ok
      ? {
          ...base,
          status: "verified",
          verifiedName: res.name,
          verifiedAt: now(),
          message: `Verified via ${adapter.label}.`,
          expiresAt: res.expiresAt ?? expiresIn(365),
        }
      : { ...base, status: "failed", message: res.msg };
    w(
      K.docs,
      kyc.documents().map((d) => (d.id === base.id ? patched : d)),
    );
    kyc.log(applicantId, res.ok ? "doc.verified" : "doc.failed", {
      type,
      provider: adapter.id,
      msg: res.msg,
    });
    if (!res.ok)
      kyc.openReview(applicantId, `${spec.label} verification failed: ${res.msg}`, "high");
    return patched;
  },

  openReview(applicantId: string, reason: string, severity: ComplianceReview["severity"]) {
    const n: ComplianceReview = {
      id: uid("rev"),
      applicantId,
      reason,
      severity,
      status: "open",
      createdAt: now(),
    };
    w(K.rev, [n, ...kyc.reviews()]);
    kyc.updateApplicant(applicantId, { status: "review" });
    kyc.log(applicantId, "review.opened", { reason, severity });
    return n;
  },
  decideReview(id: string, decision: "approved" | "rejected", note?: string) {
    const list = kyc.reviews();
    const target = list.find((x) => x.id === id);
    w(
      K.rev,
      list.map((x) => (x.id === id ? { ...x, status: decision, decidedAt: now(), note } : x)),
    );
    if (target)
      kyc.updateApplicant(target.applicantId, {
        status: decision === "approved" ? "approved" : "rejected",
        decidedAt: now(),
      });
    if (target) kyc.log(target.applicantId, `review.${decision}`, { note });
  },

  submitApplication(applicantId: string) {
    const applicant = kyc.applicants().find((a) => a.id === applicantId);
    const docs = kyc.documents().filter((d) => d.applicantId === applicantId);
    if (!docs.length) return { status: "review" as const, message: "No documents attached." };
    const required = applicant ? requiredDocsFor(applicant) : [];
    const missing = required.filter(
      (t) => !docs.some((d) => d.type === t && d.status === "verified"),
    );
    const anyFailed = docs.some((d) => d.status === "failed" || d.status === "review");
    const allVerified = docs.every((d) => d.status === "verified") && missing.length === 0;
    if (allVerified) {
      kyc.updateApplicant(applicantId, { status: "auto_approved", decidedAt: now() });
      kyc.log(applicantId, "application.auto_approved");
      return {
        status: "auto_approved" as const,
        message: "All documents verified. Role auto-provisioned.",
      };
    }
    if (anyFailed) {
      kyc.updateApplicant(applicantId, { status: "review" });
      kyc.log(applicantId, "application.review", { missing });
      return { status: "review" as const, message: "One or more documents need admin review." };
    }
    kyc.updateApplicant(applicantId, { status: "submitted" });
    return {
      status: "submitted" as const,
      message: missing.length ? `Missing: ${missing.join(", ")}` : "Application submitted.",
    };
  },

  docsFor(applicantId: string) {
    return kyc.documents().filter((d) => d.applicantId === applicantId);
  },
  reviewsFor(applicantId: string) {
    return kyc.reviews().filter((r) => r.applicantId === applicantId);
  },
  auditsFor(applicantId: string) {
    return kyc.audits().filter((a) => a.applicantId === applicantId);
  },
};
