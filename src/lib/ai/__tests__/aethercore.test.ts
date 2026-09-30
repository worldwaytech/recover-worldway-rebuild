import { describe, it, expect, vi } from "vitest";
import { askAetherCore, configStatus, extractText, readConfig, AetherCoreError } from "../aethercore.server";

const cfg = { ...readConfig({}), tenantId: "t", clientId: "c", clientSecret: "s" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe("AetherCore integration", () => {
  it("config status never exposes secret values", () => {
    const s = configStatus(cfg);
    expect(s.configured).toBe(true);
    expect(s.agentName).toBe("Worldway-AetherCore");
    expect(s.agentVersion).toBe("3");
    expect(JSON.stringify(s)).not.toContain('"s"');
    expect(configStatus(readConfig({})).configured).toBe(false);
  });

  it("sends message with agent reference + session and returns reply", async () => {
    const fetchImpl = vi.fn(async (url: any, init: any) => {
      if (String(url).includes("login.microsoftonline.com")) return json({ access_token: "tok", expires_in: 3600 });
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({ input: "Hi", agent_session_id: "wtg-abc12345", agent: { name: "Worldway-AetherCore", version: "3" } });
      expect(init.headers.authorization).toBe("Bearer tok");
      return json({ output: [{ type: "message", content: [{ type: "output_text", text: "Hello" }] }] });
    });
    const r = await askAetherCore("Hi", "wtg-abc12345", { cfg, fetchImpl: fetchImpl as any });
    expect(r).toEqual({ reply: "Hello", sessionId: "wtg-abc12345" });
  });

  it("maps failures to safe user messages", async () => {
    await expect(askAetherCore("Hi", undefined, { cfg: readConfig({}) })).rejects.toBeInstanceOf(AetherCoreError);
    const busy = vi.fn(async (url: any) => (String(url).includes("login") ? json({ access_token: "x", expires_in: 3600 }) : json({}, 503)));
    await expect(askAetherCore("Hi", undefined, { cfg: { ...cfg, clientId: "c2" }, fetchImpl: busy as any })).rejects.toMatchObject({ code: "upstream" });
    const hang = vi.fn((_u: any, init: any) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error(), { name: "AbortError" })))));
    await expect(askAetherCore("Hi", undefined, { cfg: { ...cfg, clientId: "c3" }, fetchImpl: hang as any, timeoutMs: 20 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("extracts output_text shortcut", () => expect(extractText({ output_text: " ok " })).toBe("ok"));
});
