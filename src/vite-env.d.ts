/// <reference types="vite/client" />
// Standard Vite ambient types. Added so `import.meta.env.DEV` (used to compile the LSD
// coverage tracking out of production builds) typechecks — the project had no such file.

interface ImportMetaEnv {
  /**
   * "true" mounts the internal review tooling (Remarks + Coverage) in ANY build, including
   * the deployed one. Anything else, including unset, and none of it exists in the bundle.
   * Read through `src/reviewTools.ts` — never inline this name at a call site.
   */
  readonly VITE_REVIEW_TOOLS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
