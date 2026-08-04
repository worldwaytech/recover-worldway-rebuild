import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, ShieldCheck, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import {
  kyc,
  KYC_DOCS,
  requiredDocsFor,
  type KycApplicant,
  type KycDocType,
  type KycDocument,
  type ApplicantKind,
} from "@/lib/kyc-store";

export const Route = createFileRoute("/kyc")({
  head: () => ({
    meta: [
      { title: "KYC Onboarding — Worldway Travels Group" },
      {
        name: "description",
        content:
          "Verify agent, corporate and partner identity in minutes with government-backed KYC APIs.",
      },
    ],
  }),
  component: KycPage,
});

function StatusPill({ s }: { s: KycDocument["status"] | KycApplicant["status"] }) {
  const map: Record<string, { c: string; i: ReactNode; l: string }> = {
    verified: {
      c: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      i: <CheckCircle2 className="h-3 w-3" />,
      l: "Verified",
    },
    auto_approved: {
      c: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      i: <ShieldCheck className="h-3 w-3" />,
      l: "Auto-approved",
    },
    approved: {
      c: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      i: <CheckCircle2 className="h-3 w-3" />,
      l: "Approved",
    },
    failed: {
      c: "bg-rose-500/15 text-rose-400 border-rose-500/30",
      i: <XCircle className="h-3 w-3" />,
      l: "Failed",
    },
    rejected: {
      c: "bg-rose-500/15 text-rose-400 border-rose-500/30",
      i: <XCircle className="h-3 w-3" />,
      l: "Rejected",
    },
    review: {
      c: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      i: <AlertTriangle className="h-3 w-3" />,
      l: "Review",
    },
    verifying: {
      c: "bg-sky-500/15 text-sky-400 border-sky-500/30",
      i: <Clock className="h-3 w-3" />,
      l: "Verifying",
    },
    pending: {
      c: "bg-muted text-muted-foreground border-border",
      i: <Clock className="h-3 w-3" />,
      l: "Pending",
    },
    submitted: {
      c: "bg-sky-500/15 text-sky-400 border-sky-500/30",
      i: <Clock className="h-3 w-3" />,
      l: "Submitted",
    },
    draft: {
      c: "bg-muted text-muted-foreground border-border",
      i: <Clock className="h-3 w-3" />,
      l: "Draft",
    },
  };
  const it = map[s] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${it.c}`}
    >
      {it.i}
      {it.l}
    </span>
  );
}

function KycPage() {
  const [applicant, setApplicant] = useState<KycApplicant | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    country: "IN",
    entity: "agency" as KycApplicant["entity"],
    role: "agent" as KycApplicant["role"],
    kind: "agent" as ApplicantKind,
  });
  const [doc, setDoc] = useState<{ type: KycDocType; number: string; holderName: string }>({
    type: "pan",
    number: "",
    holderName: "",
  });
  const [decision, setDecision] = useState<{ status: string; message: string } | null>(null);

  const docs = useMemo(() => (applicant ? kyc.docsFor(applicant.id) : []), [applicant, decision]);
  const required = useMemo(() => (applicant ? requiredDocsFor(applicant) : []), [applicant]);
  const availableDocs = useMemo(() => {
    if (!applicant) return KYC_DOCS;
    return KYC_DOCS.filter(
      (d) =>
        (applicant.country === "IN"
          ? d.scope === "in" || d.scope === "global"
          : d.scope === "global") &&
        (applicant.entity === "individual" ? d.target === "individual" : true),
    );
  }, [applicant]);
  const spec = KYC_DOCS.find((d) => d.type === doc.type)!;

  function startApplication(e: React.FormEvent) {
    e.preventDefault();
    const a = kyc.createApplicant({ ...form, status: "draft" });
    setApplicant(a);
    setDoc((d) => ({ ...d, holderName: form.name }));
  }
  function addDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!applicant) return;
    kyc.submitDoc(applicant.id, doc.type, doc.number, doc.holderName || applicant.name);
    setDoc((d) => ({ ...d, number: "" }));
    setDecision(null);
  }
  function submit() {
    if (!applicant) return;
    const r = kyc.submitApplication(applicant.id);
    setDecision(r);
    setApplicant({ ...applicant, status: r.status });
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8">
          <h1 className="font-serif text-4xl text-primary">KYC & Verification</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Government-backed instant verification for PAN, Aadhaar (OTP eKYC), GST, Driving
            Licence, CIN and IEC. Documents that fail name-match or require additional review are
            routed to compliance automatically.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">1 · Applicant details</CardTitle>
            </CardHeader>
            <CardContent>
              {!applicant ? (
                <form onSubmit={startApplication} className="space-y-3">
                  <div>
                    <Label>Full / legal name</Label>
                    <Input
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      required
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Country</Label>
                      <select
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.country}
                        onChange={(e) => setForm({ ...form, country: e.target.value })}
                      >
                        <option value="IN">India</option>
                        <option value="US">United States</option>
                        <option value="GB">United Kingdom</option>
                        <option value="AE">United Arab Emirates</option>
                        <option value="SG">Singapore</option>
                        <option value="AU">Australia</option>
                        <option value="DE">Germany</option>
                        <option value="FR">France</option>
                        <option value="CA">Canada</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div>
                      <Label>Applicant kind</Label>
                      <select
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.kind}
                        onChange={(e) =>
                          setForm({ ...form, kind: e.target.value as ApplicantKind })
                        }
                      >
                        <option value="customer">Customer (B2C)</option>
                        <option value="agent">Travel agent</option>
                        <option value="whitelabel">White-label partner</option>
                        <option value="supplier">Supplier</option>
                        <option value="api_partner">API partner</option>
                        <option value="corporate">Corporate client</option>
                      </select>
                    </div>
                    <div>
                      <Label>Entity</Label>
                      <select
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.entity}
                        onChange={(e) =>
                          setForm({ ...form, entity: e.target.value as KycApplicant["entity"] })
                        }
                      >
                        <option value="individual">Individual</option>
                        <option value="agency">Travel agency</option>
                        <option value="corporate">Corporate</option>
                      </select>
                    </div>
                    <div>
                      <Label>Applying as</Label>
                      <select
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.role}
                        onChange={(e) =>
                          setForm({ ...form, role: e.target.value as KycApplicant["role"] })
                        }
                      >
                        <option value="agent">Agent / advisor</option>
                        <option value="b2b">B2B corporate</option>
                        <option value="b2c">B2C member</option>
                      </select>
                    </div>
                  </div>
                  <Button type="submit" className="w-full">
                    Start verification
                  </Button>
                </form>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Applicant</span>
                    <span className="font-medium">{applicant.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Reference</span>
                    <span className="font-mono text-xs">{applicant.id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Country</span>
                    <span>{applicant.country}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Kind</span>
                    <span>{applicant.kind}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Entity</span>
                    <span>{applicant.entity}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Role</span>
                    <span>{applicant.role}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <StatusPill s={applicant.status} />
                  </div>
                  {required.length > 0 && (
                    <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Required documents
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {required.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {KYC_DOCS.find((d) => d.type === t)?.label ?? t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => {
                      setApplicant(null);
                      setDecision(null);
                    }}
                  >
                    Start a new application
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">2 · Verify documents</CardTitle>
            </CardHeader>
            <CardContent>
              {!applicant ? (
                <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  Complete step 1 to unlock document verification.
                </div>
              ) : (
                <>
                  <form onSubmit={addDoc} className="space-y-3">
                    <div>
                      <Label>Document type</Label>
                      <select
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={doc.type}
                        onChange={(e) => setDoc({ ...doc, type: e.target.value as KycDocType })}
                      >
                        {availableDocs.map((d) => (
                          <option key={d.type} value={d.type}>
                            {d.label}
                            {d.auto ? "" : " (manual)"}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-muted-foreground">{spec.note}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Document number</Label>
                        <Input
                          required
                          value={doc.number}
                          onChange={(e) => setDoc({ ...doc, number: e.target.value.toUpperCase() })}
                          placeholder={placeholderFor(doc.type)}
                        />
                      </div>
                      <div>
                        <Label>Name on document</Label>
                        <Input
                          value={doc.holderName}
                          onChange={(e) => setDoc({ ...doc, holderName: e.target.value })}
                          placeholder={applicant.name}
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full">
                      Verify {spec.label}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      Tip: try a number ending in <code>0</code> to simulate a name-mismatch review.
                    </p>
                  </form>

                  <div className="mt-6 space-y-2">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">
                      Attached documents
                    </div>
                    {docs.length === 0 && (
                      <div className="text-sm text-muted-foreground">No documents yet.</div>
                    )}
                    {docs.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between rounded-md border border-border/60 p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            {KYC_DOCS.find((x) => x.type === d.type)?.label}
                            <Badge variant="outline" className="text-[10px]">
                              {d.provider}
                            </Badge>
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {d.number} · {d.message ?? "—"}
                          </div>
                        </div>
                        <StatusPill s={d.status} />
                      </div>
                    ))}
                  </div>

                  {docs.length > 0 && (
                    <div className="mt-6 border-t border-border/60 pt-4">
                      <Button className="w-full" onClick={submit}>
                        Submit application for decision
                      </Button>
                      {decision && (
                        <div
                          className={`mt-3 rounded-md border p-3 text-sm ${decision.status === "auto_approved" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : decision.status === "review" ? "border-amber-500/30 bg-amber-500/5 text-amber-300" : "border-sky-500/30 bg-sky-500/5 text-sky-300"}`}
                        >
                          <div className="font-medium capitalize">
                            {decision.status.replace("_", " ")}
                          </div>
                          <div className="text-xs opacity-90">{decision.message}</div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {KYC_DOCS.slice(0, 6).map((d) => (
            <div key={d.type} className="rounded-lg border border-border/60 bg-card/50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{d.label}</div>
                <Badge
                  className={
                    d.auto ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                  }
                  variant="outline"
                >
                  {d.auto ? "Auto" : "Manual"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{d.note}</p>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function placeholderFor(t: KycDocType) {
  switch (t) {
    case "pan":
      return "ABCDE1234F";
    case "aadhaar":
      return "2345 6789 0123";
    case "gst":
      return "27ABCDE1234F1Z5";
    case "dl":
      return "MH12 20220001234";
    case "cin":
      return "L12345MH2010PLC123456";
    case "iec":
      return "AAAAA1234A";
    case "passport":
      return "A1234567";
    case "voter_in":
      return "ABC1234567";
    case "national_id":
      return "ID / SSN / NIN";
    case "residence_permit":
      return "Permit / Visa number";
    case "selfie_liveness":
      return "SELFIE-SESSION-ID";
    case "face_match":
      return "MATCH-SESSION-ID";
    case "address_proof":
      return "Utility bill ref";
    case "email_otp":
      return "you@example.com";
    case "mobile_otp":
      return "+1 555 010 0000";
    case "aml_screen":
      return "Auto — screens the applicant";
    case "company_reg":
      return "Certificate number";
    case "biz_reg_number":
      return "Company / EIN / CRN";
    case "vat_tax":
      return "VAT / Tax ID";
    case "company_registry":
      return "Registry ref";
    case "ubo":
      return "UBO name / share %";
    case "director":
      return "Director full name";
    case "biz_address":
      return "Registered address";
    case "corp_docs":
      return "Doc reference";
    default:
      return "";
  }
}
