import { describe, expect, it } from "vitest";
import { UP17_CERTIFICATION_REQUIREMENTS, assertUp17ProductionCertification, buildUp17CertificationReport, type Up17StepEvidence } from "../certification";

const evidenceFor = (environment:"test"|"production", overrides:Partial<Record<(typeof UP17_CERTIFICATION_REQUIREMENTS)[number],boolean>>={ }):Up17StepEvidence[] =>
  UP17_CERTIFICATION_REQUIREMENTS.map(step=>({step,passed:overrides[step]??true,environment,reference:`UP17-${environment}-${step}`,observedAt:"2026-10-03T00:00:00.000Z",detail:`Verified ${step}`}));

describe("UP17 production certification gate",()=>{
  it("certifies only a complete production lifecycle",()=>{
    const report=buildUp17CertificationReport(evidenceFor("production"),"production");
    expect(report.certified).toBe(true); expect(report.missing).toEqual([]);
    expect(()=>assertUp17ProductionCertification(report)).not.toThrow();
  });
  it("fails closed when production booking evidence is missing",()=>{
    const report=buildUp17CertificationReport(evidenceFor("production",{production_booking:false}),"production");
    expect(report.certified).toBe(false); expect(report.missing).toContain("production_booking");
    expect(()=>assertUp17ProductionCertification(report)).toThrow();
  });
  it("requires cancellation, modification, failure resolution and idempotency",()=>{
    const report=buildUp17CertificationReport(evidenceFor("production",{cancellation:false,modification:false,failure_resolution:false,idempotency:false}),"production");
    expect(report.missing).toEqual(expect.arrayContaining(["cancellation","modification","failure_resolution","idempotency"]));
    expect(report.certified).toBe(false);
  });
  it("never promotes test evidence to production",()=>{
    const report=buildUp17CertificationReport(evidenceFor("test"),"production");
    expect(report.certified).toBe(false); expect(report.missing).toEqual([...UP17_CERTIFICATION_REQUIREMENTS]);
    expect(()=>assertUp17ProductionCertification(report)).toThrow();
  });
  it("isolates evidence by environment",()=>{
    const report=buildUp17CertificationReport([...evidenceFor("test"),...evidenceFor("production",{price:false})],"production");
    expect(report.missing).toEqual(["price"]);
  });
});
