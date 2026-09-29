// FX provider hook. No approved FX source is connected yet, so only the
// identity rate is returned; mixed currencies fail safely in pricing.
import type { FxTable } from "../pricing";

export type FxProvider = (target: string) => Promise<{ table: FxTable; source: string | null }>;

export const approvedFx: FxProvider = async (target) => ({ table: { [target]: 1 }, source: null });
