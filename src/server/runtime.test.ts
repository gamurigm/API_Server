import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};

describe("local HTTP runtime", () => {
  it("uses Hono directly and has no Next.js or React runtime dependency", () => {
    expect(packageJson.dependencies).not.toHaveProperty("next");
    expect(packageJson.dependencies).not.toHaveProperty("react");
    expect(packageJson.dependencies).not.toHaveProperty("react-dom");
    expect(packageJson.dependencies).toHaveProperty("hono");
    expect(packageJson.dependencies).toHaveProperty("@hono/node-server");
    expect(packageJson.scripts["dev:local"]).toContain("src/server/main.ts");
  });
});
