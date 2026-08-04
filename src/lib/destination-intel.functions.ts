import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getCountryIntel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ country: z.string().min(1).max(80), currency: z.string().max(3).optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getDestinationIntel } = await import("./destination-intel.server");
    return getDestinationIntel(data.country, data.currency ?? "USD");
  });
