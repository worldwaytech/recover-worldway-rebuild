import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchFlightsTool from "./tools/search-flights";
import searchHotelsTool from "./tools/search-hotels";
import walletBalanceTool from "./tools/wallet-balance";
import walletTransactionsTool from "./tools/wallet-transactions";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "worldway-travels-group",
  title: "Worldway Travels Group",
  version: "0.1.0",
  instructions:
    "Tools to search live flights and hotels via the Worldway partner network, and read the signed-in user's wallet balance and transactions. Wallet tools act as the authenticated user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchFlightsTool, searchHotelsTool, walletBalanceTool, walletTransactionsTool],
});
