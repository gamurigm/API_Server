import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import globals from "globals";

export default defineConfig([
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts}"],
    languageOptions: { globals: { ...globals.node, ...globals.es2022 } },
  },
  globalIgnores([
    ".next/**",
    "coverage/**",
    "supabase/.branches/**",
    "supabase/.temp/**",
  ]),
]);
