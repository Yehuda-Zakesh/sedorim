import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { hydrateFromCloud, isHydrated } from "@/lib/cloud-sync";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: HydratedOutlet,
});

function HydratedOutlet() {
  const { user } = Route.useRouteContext();
  const [ready, setReady] = useState(isHydrated());
  useEffect(() => {
    let alive = true;
    hydrateFromCloud(user.id).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [user.id]);
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">טוען נתונים…</div>
      </div>
    );
  }
  return <Outlet />;
}