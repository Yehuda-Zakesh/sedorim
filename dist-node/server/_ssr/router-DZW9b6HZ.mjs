import { Q as QueryClient } from "../_libs/tanstack__query-core.mjs";
import { Q as QueryClientProvider } from "../_libs/tanstack__react-query.mjs";
import { c as createRouter, a as createRootRouteWithContext, u as useRouter, L as Link, O as Outlet, H as HeadContent, S as Scripts, b as createFileRoute, l as lazyRouteComponent } from "../_libs/tanstack__react-router.mjs";
import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { T as Toaster$1 } from "../_libs/sonner.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
const Toaster = ({ ...props }) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Toaster$1,
    {
      className: "toaster group",
      toastOptions: {
        classNames: {
          toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
        }
      },
      ...props
    }
  );
};
const appCss = "/assets/styles-DhYN8j7B.css";
function reportLovableError(error, context = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error"
    }
  );
}
function NotFoundComponent() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-7xl font-bold text-foreground", children: "404" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mt-4 text-xl font-semibold text-foreground", children: "Page not found" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "The page you're looking for doesn't exist or has been moved." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      Link,
      {
        to: "/",
        className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
        children: "Go home"
      }
    ) })
  ] }) });
}
function ErrorComponent({ error, reset }) {
  console.error(error);
  const router = useRouter();
  reactExports.useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-semibold tracking-tight text-foreground", children: "This page didn't load" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "Something went wrong on our end. You can try refreshing or head back home." }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 flex flex-wrap justify-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => {
            router.invalidate();
            reset();
          },
          className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          children: "Try again"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "a",
        {
          href: "/",
          className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent",
          children: "Go home"
        }
      )
    ] })
  ] }) });
}
const Route$d = createRootRouteWithContext()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "מערכת ניהול נוכחות" },
      { name: "description", content: "מערכת ניהול נוכחות תלמידים — לוח בקרה, סטטיסטיקות ודוחות" },
      { property: "og:title", content: "מערכת ניהול נוכחות" },
      { property: "og:description", content: "מערכת ניהול נוכחות תלמידים" },
      { property: "og:type", content: "website" }
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap"
      }
    ]
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent
});
function RootShell({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("head", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(HeadContent, {}) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("body", { children: [
      children,
      /* @__PURE__ */ jsxRuntimeExports.jsx(Scripts, {})
    ] })
  ] });
}
function RootComponent() {
  const { queryClient } = Route$d.useRouteContext();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(QueryClientProvider, { client: queryClient, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Outlet, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Toaster, { position: "top-center", dir: "rtl" })
  ] });
}
const $$splitComponentImporter$c = () => import("./statistics-_7JrrepU.mjs");
const Route$c = createFileRoute("/statistics")({
  head: () => ({
    meta: [{
      title: "סטטיסטיקות — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$c, "component")
});
const $$splitComponentImporter$b = () => import("./settings-B5wr7fDu.mjs");
const Route$b = createFileRoute("/settings")({
  head: () => ({
    meta: [{
      title: "הגדרות — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$b, "component")
});
const $$splitComponentImporter$a = () => import("./search-CJhpAH2G.mjs");
const Route$a = createFileRoute("/search")({
  head: () => ({
    meta: [{
      title: "חיפוש — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$a, "component")
});
const $$splitComponentImporter$9 = () => import("./reports-kGq2xPFn.mjs");
const Route$9 = createFileRoute("/reports")({
  head: () => ({
    meta: [{
      title: "דוחות — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$9, "component")
});
const $$splitComponentImporter$8 = () => import("./quick-DJiPCcjd.mjs");
const Route$8 = createFileRoute("/quick")({
  head: () => ({
    meta: [{
      title: "כניסה מהירה — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$8, "component")
});
const $$splitComponentImporter$7 = () => import("./learning-Cf_d0FOC.mjs");
const Route$7 = createFileRoute("/learning")({
  head: () => ({
    meta: [{
      title: "לימוד נוסף — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
const $$splitComponentImporter$6 = () => import("./insights-BjAsK3Qz.mjs");
const Route$6 = createFileRoute("/insights")({
  head: () => ({
    meta: [{
      title: "תובנות חכמות — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
const $$splitComponentImporter$5 = () => import("./history-D9YBU4cZ.mjs");
const Route$5 = createFileRoute("/history")({
  head: () => ({
    meta: [{
      title: "היסטוריה — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const $$splitComponentImporter$4 = () => import("./calendar-CE0kuiSz.mjs");
const Route$4 = createFileRoute("/calendar")({
  head: () => ({
    meta: [{
      title: "לוח שנה — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
const $$splitComponentImporter$3 = () => import("./backup-CloW90LY.mjs");
const Route$3 = createFileRoute("/backup")({
  head: () => ({
    meta: [{
      title: "גיבוי ושחזור — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
const $$splitComponentImporter$2 = () => import("./audit-lRIcY-5K.mjs");
const Route$2 = createFileRoute("/audit")({
  head: () => ({
    meta: [{
      title: "יומן ביקורת — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
const $$splitComponentImporter$1 = () => import("./attendance-DESnWsO-.mjs");
const Route$1 = createFileRoute("/attendance")({
  head: () => ({
    meta: [{
      title: "נוכחות סדרים — המעקב שלי"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const $$splitComponentImporter = () => import("./index-_cRPGaQC.mjs");
const Route = createFileRoute("/")({
  head: () => ({
    meta: [{
      title: "לוח בקרה — המעקב שלי"
    }, {
      name: "description",
      content: "מעקב אישי על נוכחות בסדרי הכולל"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
const StatisticsRoute = Route$c.update({
  id: "/statistics",
  path: "/statistics",
  getParentRoute: () => Route$d
});
const SettingsRoute = Route$b.update({
  id: "/settings",
  path: "/settings",
  getParentRoute: () => Route$d
});
const SearchRoute = Route$a.update({
  id: "/search",
  path: "/search",
  getParentRoute: () => Route$d
});
const ReportsRoute = Route$9.update({
  id: "/reports",
  path: "/reports",
  getParentRoute: () => Route$d
});
const QuickRoute = Route$8.update({
  id: "/quick",
  path: "/quick",
  getParentRoute: () => Route$d
});
const LearningRoute = Route$7.update({
  id: "/learning",
  path: "/learning",
  getParentRoute: () => Route$d
});
const InsightsRoute = Route$6.update({
  id: "/insights",
  path: "/insights",
  getParentRoute: () => Route$d
});
const HistoryRoute = Route$5.update({
  id: "/history",
  path: "/history",
  getParentRoute: () => Route$d
});
const CalendarRoute = Route$4.update({
  id: "/calendar",
  path: "/calendar",
  getParentRoute: () => Route$d
});
const BackupRoute = Route$3.update({
  id: "/backup",
  path: "/backup",
  getParentRoute: () => Route$d
});
const AuditRoute = Route$2.update({
  id: "/audit",
  path: "/audit",
  getParentRoute: () => Route$d
});
const AttendanceRoute = Route$1.update({
  id: "/attendance",
  path: "/attendance",
  getParentRoute: () => Route$d
});
const IndexRoute = Route.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$d
});
const rootRouteChildren = {
  IndexRoute,
  AttendanceRoute,
  AuditRoute,
  BackupRoute,
  CalendarRoute,
  HistoryRoute,
  InsightsRoute,
  LearningRoute,
  QuickRoute,
  ReportsRoute,
  SearchRoute,
  SettingsRoute,
  StatisticsRoute
};
const routeTree = Route$d._addFileChildren(rootRouteChildren)._addFileTypes();
const getRouter = () => {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0
  });
  return router;
};
export {
  getRouter
};
