// Fallback build-info for a plain `npm run dev` / `npm run build`. When
// building the EXEs, scripts/build-exes.mjs overwrites this file with the
// actual git commit SHA + build timestamp *before* the build, so the About
// screen always reflects exactly what was shipped — letting you check
// whether a given install has a given fix without guessing. It is
// regenerated on every `npm run exe`; don't rely on these values outside a
// packaged build.
//
// Typed as `string` (not an inferred literal) so comparisons like
// `BUILD_COMMIT !== "dev"` still typecheck after regeneration.
export const BUILD_COMMIT: string = "dev";
export const BUILD_TIME: string = "";
