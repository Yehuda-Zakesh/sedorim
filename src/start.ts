import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
// Resolved to src/integrations/supabase/auth-attacher.ts (real) in the normal
// web/Lovable build, and to src/lib/electron-stubs/auth-attacher.stub.ts
// (no-op) in the Electron/packaged build — see the `@sedorim/auth-middleware`
// alias in vite.config.ts / vite.electron.config.ts.
import { attachSupabaseAuth } from "@sedorim/auth-middleware";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
