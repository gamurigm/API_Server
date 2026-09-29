import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const initialMigration = readFileSync(new URL("./001_gateway.sql", import.meta.url), "utf8");

describe("PostgreSQL timestamptz expressions", () => {
  it("stores absolute instants without converting through the session timezone", () => {
    expect(initialMigration).not.toMatch(/timezone\(\s*'utc'\s*,\s*now\(\)\s*\)/iu);
  });
});
