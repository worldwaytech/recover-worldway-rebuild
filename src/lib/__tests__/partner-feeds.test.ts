import { describe, it, expect } from "vitest";
import { parseXml, parseCsv, extractRecords, mapFeedRecord } from "@/lib/partners/feeds.server";
import { getConnector } from "@/lib/partners/registry";
import { normaliseJourney } from "@/lib/partners/runtime.server";

const XML = `<?xml version="1.0"?>
<catalogue>
  <journey>
    <journeyCode>AK-TEST-01</journeyCode>
    <journeyName><![CDATA[Test Journey & Nile]]></journeyName>
    <shortDescription>A licensed feed record</shortDescription>
    <regionName>Africa</regionName>
    <countryName>Egypt</countryName>
    <days>9</days>
    <leadInPrice>12500</leadInPrice>
    <currencyCode>USD</currencyCode>
    <lastModified>2026-06-01</lastModified>
  </journey>
  <journey>
    <journeyCode>AK-TEST-02</journeyCode>
    <journeyName>Second Journey</journeyName>
    <days>7</days>
    <leadInPrice>9800</leadInPrice>
  </journey>
</catalogue>`;

describe("partner feed ingestion", () => {
  it("parses XML feeds into records", () => {
    const records = extractRecords(parseXml(XML), "journey");
    expect(records).toHaveLength(2);
    expect(records[0].journeyName).toBe("Test Journey & Nile");
  });

  it("maps feed fields onto the journey model and normalises", () => {
    const cfg = getConnector("abercrombie-kent");
    expect(cfg?.feed).toBeTruthy();
    const records = extractRecords(parseXml(XML), "journey").map((r) =>
      mapFeedRecord(r, cfg!.feed!.fieldMap),
    );
    const journey = normaliseJourney(cfg!, records[0]);
    expect(journey.code).toBe("AK-TEST-01");
    expect(journey.title).toBe("Test Journey & Nile");
    expect(journey.country).toBe("Egypt");
    expect(journey.durationDays).toBe(9);
    expect(journey.priceFrom).toBe(12500);
    expect(journey.currency).toBe("USD");
    expect(journey.dataSource).toBe("partner-api");
    expect(journey.templateId).toBe("luxury-tours");
  });

  it("parses CSV feeds with quoted values", () => {
    const rows = parseCsv('code,title\nA1,"Journey, with comma"\nB2,Plain\n');
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe("Journey, with comma");
  });
});