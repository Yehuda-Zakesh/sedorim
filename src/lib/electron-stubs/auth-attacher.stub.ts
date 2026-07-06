// Stub for the Electron/desktop build ONLY — see the `@sedorim/auth-middleware`
// alias in vite.electron.config.ts. The normal Lovable-hosted web build
// aliases that same specifier to the real file
// (src/integrations/supabase/auth-attacher.ts) and is completely unaffected
// by this file's existence.
//
// Why this exists: the packaged desktop app (SederPlus.exe /
// SederPlusQuick.exe) is fully offline and single-user — it never uses
// Supabase/Lovable sign-in (nothing in the app calls it). The real
// middleware still pulls in the full @supabase/supabase-js client on every
// server-function call anyway, which costs real bundle size (~600KB+ across
// auth-js/postgrest-js/realtime-js/storage-js) and a per-call
// `supabase.auth.getSession()` for a feature that's never exercised in this
// build. This stub swaps in a true no-op with the same shape, so none of
// that ever gets pulled into the Electron bundle.
import { createMiddleware } from "@tanstack/react-start";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => next({}),
);
