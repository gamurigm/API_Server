import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const initialMigration = readFileSync(new URL("./001_gateway.sql", import.meta.url), "utf8");
const correctionMigration = readFileSync(new URL("./005_timezone_safe_timestamps.sql", import.meta.url), "utf8");

describe("PostgreSQL timestamptz expressions", () => {
  it("stores absolute instants without converting through the session timezone", () => {
    expect(initialMigration).not.toMatch(/timezone\(\s*'utc'\s*,\s*now\(\)\s*\)/iu);
  });

  it("repairs existing defaults and time-based functions in a forward migration", () => {
    expect(correctionMigration).toMatch(/alter table public\.consumer_applications[\s\S]*alter column created_at set default now\(\)/iu);
    expect(correctionMigration).toMatch(/new\.updated_at = now\(\)/iu);
    expect(correctionMigration).toMatch(/date_trunc\('minute', now\(\)\)/iu);
    expect(correctionMigration).toMatch(/expires_at <= now\(\)/iu);
    expect(correctionMigration).toMatch(/now\(\) \+ make_interval\(secs => p_ttl_seconds\)/iu);
    expect(correctionMigration).not.toMatch(/timezone\(\s*'utc'\s*,\s*now\(\)\s*\)/iu);
  });
});
