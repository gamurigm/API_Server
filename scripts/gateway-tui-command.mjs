export function buildWslTuiCommand(checkoutPath) {
  return [
    "--distribution",
    "Ubuntu",
    "--cd",
    checkoutPath,
    "--exec",
    "bash",
    "-lc",
    "npm run tui",
  ];
}
