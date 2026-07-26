// Fallback build-info for the normal dev / Lovable-hosted build. When
// packaging the Windows EXEs, scripts/package-win.mjs overwrites this file
// with the actual git commit SHA + build timestamp *before* running the
// build, so About screen always reflects exactly what was packaged —
// letting you check whether a given install has fixed code without
// guessing. This file is regenerated on every `npm run package:win`; don't
// rely on its contents being meaningful outside a packaged build.
//
// Typed as `string` (not inferred literal) so comparisons like
// `BUILD_COMMIT !== "dev"` still typecheck correctly after this file is
// regenerated with a real commit hash.
export const BUILD_COMMIT: string = "dev";
export const BUILD_TIME: string = "";
