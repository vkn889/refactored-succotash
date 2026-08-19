import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored third-party file (see lib/vendor/README.md) — copied
    // verbatim from three.js plus one small patch, not our code style.
    "lib/vendor/FBXLoader.js",
  ]),
  {
    // react-hooks' new React-Compiler-oriented rules (purity/immutability)
    // assume plain React rendering. react-three-fiber's useFrame callbacks
    // run on the render loop *outside* React's render phase and are meant
    // to mutate Object3D/camera refs imperatively every frame — that's the
    // documented, correct, and only performant way to animate a scene in
    // R3F, so these two rules produce structural false positives here.
    files: ["components/game/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
    },
  },
]);

export default eslintConfig;
