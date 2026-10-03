import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { consumeRateLimit, currentRequest, rateLimitKey, requestFingerprint } from "@/lib/security/rate-limit.server";

// Public server function: accepts empty-leg inquiries from the website
// (including anonymous visitors) and persists them so the Worldway Private
// Aviation Concierge actually receives them, instead of only writing to the
// visitor's localStorage.
//
// Uses supabaseAdmin (service role) because RLS restricts reads to super
// admins; the endpoint validates input strictly with Zod and never returns
// stored data, so it is safe to expose without auth.

const inquirySchema = z
  .object({
    intent: z.enum(["book", "quote", "callback"]),
    legId: z.string().trim().max(120).optional(),
    fullName: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().min(3).max(60),
    passengers: z.number().int().min(1).max(50).optional(),
    notes: z.string().trim().max(4000).optional(),
    source: z.string().trim().max(60).optional(),
  })
  .strict();

export type AviationInquiryInput = z.infer<typeof inquirySchema>;

export const submitAviationInquiry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inquirySchema.parse(d))
  .handler(async ({ data }) => {
    await consumeRateLimit(
      rateLimitKey("aviation-inquiry", requestFingerprint(currentRequest())),
      5,
      60,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      intent: data.intent,
      leg_id: data.legId ?? null,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      passengers: data.passengers ?? null,
      notes: data.notes ?? null,
      source: data.source ?? "empty-legs",
    };
    // Types are regenerated after migration approval; cast until then.
    const client = supabaseAdmin as unknown as {
      from: (t: string) => {
        insert: (v: unknown) => {
          select: (c: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    const { data: inserted, error } = await client
      .from("aviation_inquiries")
      .insert(row)
      .select("id")
      .single();
    if (error) {
      console.error("[aviation-inquiries] insert failed", error.message);
      return {
        ok: false as const,
        error: "Could not save inquiry. Please email aviation@worldwaytravelsgroup.com.",
      };
    }
    return { ok: true as const };
  });
