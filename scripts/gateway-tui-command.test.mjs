import { describe, expect, it } from "vitest";

import { buildWslTuiCommand } from "./gateway-tui-command.mjs";

describe("Windows WSL TUI command", () => {
  it("uses the login shell so WSL selects the project's Node runtime", () => {
    expect(buildWslTuiCommand("C:\\Users\\gamur\\Documents\\API Server")).toEqual([
      "--distribution",
      "Ubuntu",
      "--cd",
      "C:\\Users\\gamur\\Documents\\API Server",
      "--exec",
      "bash",
      "-lc",
      "npm run tui",
    ]);
  });
});
