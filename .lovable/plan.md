
## How I understand the project

The uploaded spec (`פרומפט.docx`) describes a **personal Kollel (כולל) attendance tracker** — much more specific than the generic "present/late/absent" model currently in the app. The core idea: the user logs **arrival and departure times for two daily sedarim**, the system calculates **missing minutes per Gregorian month**, applies **bonus minutes** for early arrival, separates **excused vs non-excused** minutes, and produces reports + statistics for the monthly scholarship (מלגה).

The spec was written for a Windows desktop app (Python + SQLite). We will deliver the same product as a **web app**, reusing the existing Hebrew-RTL enterprise UI you already approved. Nothing in the current visual language changes — the data model, screens, and logic underneath are what get rebuilt to match the spec.

### Mapping spec → existing app

| Spec area | Existing app | Action |
|---|---|---|
| Dashboard (Hebrew date, KPIs, reminders) | `/` Dashboard | Keep layout, change KPIs to Kollel metrics |
| Attendance (present/late/absent) | `/attendance` | Replace with seder times entry (2 sedarim, arrival/departure, excused, Ohevei Hashem, absence) |
| Calendar | `/calendar` | Keep grid, color days by missing/bonus minutes, support both Hebrew & Gregorian display |
| History | `/history` | Keep table, change columns to seder data + filters by month/type/excused |
| Learning | `/learning` | Replace with 3 frameworks (Kollel Erev, Torato Beyado, Bein Hazmanim) + live timer |
| Statistics | `/statistics` | Keep BI shell, add Attendance Score 0–100, monthly/yearly trends, YoY, heatmap |
| Reports | `/reports` | Wire to real PDF generator (already have jspdf) with section pickers |
| Search | `/search` | Extend to tags & seder records |
| Audit | `/audit` | Already functional — extend events to seder edits |
| Settings | `/settings` | Add seder times, bonus threshold, excused defaults, alert thresholds |
| Backup | `/backup` | Already functional — add "Delete database" + "Reset settings" destructive actions |
| Quick entry app (App #2) | — | New `/quick` route: minimal arrival form, auto-detect seder, big buttons |
| Insights | `/insights` | Keep, add Kollel-specific insights |

### What changes (preserving the design)
- All existing visual tokens, layout, sidebar, header, cards, typography → **untouched**.
- Routes/files structure → **kept**; internals rewritten.
- New small Hebrew-calendar utility (no network) for `יט סיון תשפ"ו` display and Bein Hazmanim window detection.

---

## Plan

### 1. Domain & data model (`src/lib/`)
- **`hebrew-calendar.ts`** — pure converter Gregorian ↔ Hebrew (year/month/day → Hebrew letters with geresh/gershayim), Bein Hazmanim window check (Av 1–29, Elul 9–30, Tishrei 11–30, Nissan 1–30).
- **`kollel-store.ts`** (replaces `tracker-store.ts` API surface, same pub-sub pattern):
  - `SederConfig`: `{ s1Start, s1End, s2Start, s2End, bonusThresholdMin }` (from settings)
  - `SederEntry`: `{ id, date, seder: 1|2, arrival?: "HH:MM", departure?: "HH:MM", absent: boolean, ohevei: boolean, excusedAll: boolean, excusedMinutes: number, excusedReason?: string, manualAdjustMin: number, tags: string[], note?: string }`
  - `LearningEntry`: `{ id, framework: "kollel-erev"|"torato-beyado"|"bein-hazmanim", date, minutes, source: "manual"|"range"|"timer", note? }`
  - `TimerSession`: persisted `{ framework, startedAt }` — survives reload, finalizes on stop.
  - Selectors: `missingMinutes(entry, cfg)`, `bonusMinutes(entry, cfg)`, `monthlySummary(year, month)`, `attendanceScore(year, month)` (0–100 from missing/bonus/consistency), `oheveiCount`, etc.
- **`validators.ts`** — extend with seder time sanity (departure ≥ arrival, within day, etc.).
- Migration: on load, if old `attendance.v1` exists, archive it under `tracker.legacy.attendance` and start fresh (one-time, silent toast).

### 2. Settings (`/settings`)
Add expandable cards:
- **שעות סדרים**: s1 start/end, s2 start/end (HH:MM inputs).
- **דקות בונוס**: threshold (default 15 min).
- **התראות**: thresholds for monthly missing-min warnings.
- **תצוגה / תאריך**: existing.
Persist via existing `settings-store` (extend `Settings` type).

### 3. Attendance screen (`/attendance`)
Replace current form with the spec's flow:
- Top: Hebrew + Gregorian date pickers side-by-side.
- For each seder card (1 and 2):
  - Arrival time (defaults to seder start), Departure time (defaults to seder end).
  - Buttons: **מוצדק** (opens dialog: "כל האיחור מוצדק?" → yes / no → minutes + reason), **אוהבי ה׳** (only enabled when arrival ≤ start AND departure ≥ end; otherwise show warning toast), **היעדרות** (marks whole seder absent → excused dialog).
  - Live computed: missing min / bonus min / excused min.
- Manual minute adjustment input.
- Saves create/update a `SederEntry`, writes to audit, triggers `maybeAutoBackup`.

### 4. Quick entry (`/quick`)
Standalone minimal page (same shell, hides sidebar via a query flag or a slimmer layout): single "שעת הגעה" field, auto-detects which seder by current time vs config, large buttons מוצדק / אוהבי ה׳ / היעדרות / פתח אפליקציה ראשית. Writes to the same store.

### 5. Calendar (`/calendar`)
Keep month grid. Color each day:
- green if both sedarim full + Ohevei, blue if full attendance, amber if missing < threshold, red if missing ≥ threshold, gray if no data.
- Day cell shows Hebrew date (small) + missing/bonus chip.
- Click → side panel listing both sedarim with edit/delete.

### 6. History (`/history`)
- Filters: month, seder (1/2/both), type (late/absent/early-leave/bonus), excused (all/excused/non-excused), tag search.
- Row columns: תאריך גרגוריאני · תאריך עברי · סדר · הגעה · יציאה · חסר · בונוס · מוצדק · תגיות.
- Bottom monthly summary panel (matches spec: total/excused/non-excused missing, late count, absences, bonus, Ohevei count).

### 7. Learning (`/learning`)
Three framework tabs. Each tab:
- Manual minutes form, time range form (start–end), **Live timer** with persistent warning banner ("אל תסגור את האפליקציה — סגירה תעצור את הטיימר") and recovery on reload via `TimerSession`.
- Bein Hazmanim tab only enabled when current Hebrew date falls in the spec's windows (otherwise shown disabled with explanation).

### 8. Statistics (`/statistics`)
Extend with: monthly attendance score (0–100, gauge), 12-month trend (missing/bonus), YoY comparison for the current month, weekday late-arrival heatmap, Ohevei count, forecast (already have `forecastMonthRate` — refit to minutes).

### 9. Reports (`/reports`)
Section pickers (checkbox list): סיכום חודשי, פירוט סדרים, סיכום מוצדקים, גרף מגמות, רשימת אוהבי ה׳, לימוד נוסף. Generate real Hebrew-RTL PDF via existing `exporters.ts` (`jspdf` + `html2canvas` from a hidden DOM template). XLSX export retained.

### 10. Backup (`/backup`)
Add destructive actions with confirm dialogs: **מחיקת בסיס נתונים** (clears all stores, keeps settings), **איפוס הגדרות** (settings only). Existing snapshot/restore stays.

### 11. Sidebar
Add **כניסה מהירה** entry pointing to `/quick`. Everything else stays.

### 12. Audit
Wire new actions: `seder.create/update/delete`, `learning.timer_start/stop`, `settings.seder_times_update`, `backup.delete_db`.

---

## Technical notes

- **Hebrew calendar**: implement Gregorian↔Hebrew via the standard Rambam/Gauss-style algorithm (no external lib needed; ~150 LOC, deterministic). Format with אותיות עם גרשיים — e.g. `יט סיון תשפ״ו`.
- **Timer persistence**: `localStorage` key `tracker.timer.v1` with `{ framework, startedAt }`. On mount, if present, resume; on `beforeunload` while running, show native confirm.
- **No backend**: everything stays client-side localStorage, matching the current architecture (Lovable Cloud not enabled). If you later want cross-device sync, we can switch to Cloud — say the word.
- **No new heavy deps**: PDF/XLSX already installed; Hebrew calendar implemented inline.
- **Design**: all new UI uses existing semantic tokens (`bg-card`, `text-foreground`, status colors). Zero changes to `styles.css` palette.
- **RTL & Hebrew strings**: every label in Hebrew, numbers LTR-isolated where needed.

---

## Out of scope (will not do)
- Native Windows packaging / installer (the spec asked for a Python desktop app — we're delivering the equivalent as a web app, per project setup).
- Multi-user / auth (spec says personal use).
- Cloud sync (unless you ask).

---

## Open questions before I build

1. **Default seder times** to ship pre-filled (you can edit anytime in Settings)? Suggestion: סדר א׳ 09:30–13:30, סדר ב׳ 16:00–19:00.
2. **Legacy data**: the current app has demo present/late/absent records in your browser. OK to archive them silently on first load of the new version?
3. **"Quick entry" route** — full page at `/quick`, or a compact dialog you open from anywhere with a keyboard shortcut?
