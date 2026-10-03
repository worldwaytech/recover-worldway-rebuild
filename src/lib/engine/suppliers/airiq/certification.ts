export type AirIqCertificationStep = "credentials"|"search"|"availability"|"price"|"production_booking"|"ticket_status"|"failure_resolution"|"idempotency";
export type AirIqStepEvidence={step:AirIqCertificationStep;passed:boolean;environment:"test"|"production";reference?:string;observedAt:string;detail:string};
export type AirIqCertificationReport={supplierKey:"airiq";environment:"test"|"production";certified:boolean;completed:AirIqCertificationStep[];missing:AirIqCertificationStep[];evidence:AirIqStepEvidence[];generatedAt:string};
export const AIRIQ_CERTIFICATION_REQUIREMENTS:readonly AirIqCertificationStep[]=["credentials","search","availability","price","production_booking","ticket_status","failure_resolution","idempotency"];
export function buildAirIqCertificationReport(evidence:readonly AirIqStepEvidence[],environment:"test"|"production",generatedAt=new Date().toISOString()):AirIqCertificationReport{
 const scoped=evidence.filter(x=>x.environment===environment);
 const completed=AIRIQ_CERTIFICATION_REQUIREMENTS.filter(step=>scoped.some(x=>x.step===step&&x.passed));
 const missing=AIRIQ_CERTIFICATION_REQUIREMENTS.filter(step=>!completed.includes(step));
 return {supplierKey:"airiq",environment,certified:environment==="production"&&missing.length===0,completed,missing,evidence:scoped,generatedAt};
}
export function assertAirIqProductionCertification(report:AirIqCertificationReport):asserts report is AirIqCertificationReport&{environment:"production";certified:true}{
 if(report.environment!=="production")throw new Error("AIR iQ production certification requires production evidence.");
 if(!report.certified||report.missing.length>0)throw new Error(`AIR iQ production certification incomplete: ${report.missing.join(", ")}`);
}
