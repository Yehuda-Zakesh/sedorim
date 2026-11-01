import { Outlet, Link, HeadContent, createRootRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { Home, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { onWriteFailure, writeFailureMessage } from "@/lib/store-gate";

// 404 and error share one frame: the product name, a serif heading that says
// what happened, a sentence about what to do, one primary action and the way
// home. No card and no icon — the heading carries it. The home link is always
// present so there is never a dead end, and focus moves to the heading so a
// keyboard or screen-reader user starts reading from the message.
function StatusFrame({
  title,
  alert,
  children,
}: {
  title: string;
  alert?: boolean;
  children: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div dir="rtl" role={alert ? "alert" : undefined} className="w-full max-w-md">
        <div className="eyebrow">סדר פלוס</div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="title-serif mt-2 text-3xl text-foreground focus:outline-none"
        >
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}

const PRIMARY_BTN =
  "pressable inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
const SECONDARY_BTN =
  "pressable inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent";

function NotFoundComponent() {
  return (
    <StatusFrame title="הדף לא נמצא">
      <p className="mt-3 text-base text-muted-foreground">
        הדף שחיפשת אינו קיים או שהועבר. אפשר לחזור למסך היום.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/" className={PRIMARY_BTN}>
          <Home className="size-4" aria-hidden="true" />
          חזרה למסך היום
        </Link>
      </div>
      <p className="mt-6 text-xs text-muted-foreground" dir="ltr">
        404
      </p>
    </StatusFrame>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <StatusFrame title="הדף הזה לא נטען" alert>
      <p className="mt-3 text-base text-muted-foreground">
        משהו השתבש. אפשר לנסות שוב או לחזור למסך היום.
      </p>
      {/* The actual message, not just "something failed" — this is a local
          single-user app, and without it a fault here is undiagnosable
          without attaching a debugger to the packaged EXE. */}
      {error?.message && (
        <p
          dir="ltr"
          className="mt-4 max-h-32 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-start font-mono text-xs text-muted-foreground"
        >
          {error.message}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className={PRIMARY_BTN}
        >
          <RotateCw className="size-4" aria-hidden="true" />
          נסה שוב
        </button>
        <Link to="/" className={SECONDARY_BTN}>
          <Home className="size-4" aria-hidden="true" />
          חזרה למסך היום
        </Link>
      </div>
    </StatusFrame>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "סדר פלוס" }],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  // A save nobody awaited (the fire-and-forget writes) that failed or was
  // refused is shown as a real error, in every window.
  useEffect(
    () =>
      onWriteFailure((err) => {
        toast.error(writeFailureMessage(err), { id: "write-failure" });
      }),
    [],
  );
  return (
    <>
      {/* Applies each route's `head` (the window title) to document.head. */}
      <HeadContent />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" dir="rtl" />
    </>
  );
}
