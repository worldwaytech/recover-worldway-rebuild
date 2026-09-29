// Worldway-branded customer emails for private aviation.
// Emails are rendered and logged on the request; actual delivery activates once
// the Worldway sender domain is configured (until then entries are "queued_no_domain").
import { renderAviationEmail, type EmailInput } from "./quote";

const SITE = "https://worldwaytravelsgroup.com";

export async function sendAviationEmail(requestId: string, to: string | null, input: Omit<EmailInput, "link">) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const msg = renderAviationEmail({ ...input, link: `${SITE}/private-aviation/quote/${input.reference}` });
  // Delivery is switched on once the Worldway sender domain is verified.
  const status = to ? "queued_no_domain" : "no_recipient";
  const { data } = await db.from("private_aviation_requests").select("email_log").eq("id", requestId).maybeSingle();
  const log = Array.isArray(data?.email_log) ? data.email_log : [];
  log.push({ kind: input.kind, subject: msg.subject, status, at: new Date().toISOString() });
  await db.from("private_aviation_requests").update({ email_log: log.slice(-30) }).eq("id", requestId);
  return status;
}
