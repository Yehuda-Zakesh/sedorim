//! The rules the background agent runs, and the plan it runs them against.
//!
//! # Why there is a plan at all
//!
//! Deciding whether a reminder is due needs the Hebrew calendar (is the
//! kollel sitting today?), the seder schedule with its permanent changes and
//! temporary overrides (when does seder א׳ begin *today*?) and the arrival
//! habit the app has measured (how long should it wait before saying he is
//! late to record?). All three already exist, in TypeScript, tested — and
//! none of it is worth a second implementation in Rust that could drift from
//! the first.
//!
//! So the app writes the answers down. Whenever a window is open it computes,
//! for every day in the next year or so, the minute of the day at which each
//! seder's reminder falls due, and stores that under `backgroundPlan`. The
//! agent compares a clock against those numbers and nothing more. If the app
//! has not been opened in over a year the plan runs out, and the agent then
//! says nothing at all — silence is the only honest answer when it cannot
//! know whether today is a learning day.
//!
//! # What it is allowed to say
//!
//! Two things, and only two:
//!
//!   * that a seder has begun and has not been recorded — named, so it is
//!     clear which one;
//!   * at the start of a month, that last month has not yet been reported to
//!     the phone system, until the 5th or until the user says he has reported
//!     it, whichever comes first.
//!
//! Everything else the app has to say — the lateness quota, the weekly
//! digest, the forecast warning — is about figures the user is looking at
//! anyway, and stays inside the app where he can act on it.

use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

/// The plan format. Bumped only if the shape changes in a way the agent
/// cannot read; an agent that meets a version it does not know says nothing
/// rather than guessing.
pub const PLAN_VERSION: u64 = 1;

/// The last day of the month on which the phone-system reminder is still
/// worth raising. See `src/lib/phone-report.ts`, which shows the same window
/// on the dashboard.
pub const PHONE_REPORT_LAST_DAY: u32 = 5;

/// One day of the plan. A day the kollel does not sit carries neither time.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct PlanDay {
    /// Minute of the day at which the seder א׳ reminder falls due.
    #[serde(default)]
    pub r1: Option<i64>,
    /// The same for seder ב׳. Absent on a fast day, when there is none.
    #[serde(default)]
    pub r2: Option<i64>,
    /// Shabbat or Yom Tov: nothing at all is said, not even about the report.
    #[serde(default)]
    pub q: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Plan {
    #[serde(default)]
    pub v: u64,
    /// Minute of the day the phone-system reminder is raised at.
    #[serde(default, rename = "phoneAt")]
    pub phone_at: i64,
    #[serde(default)]
    pub days: HashMap<String, PlanDay>,
}

impl Plan {
    /// Reads the plan out of the data file, or None if there is not a usable one.
    pub fn from_store(store: &serde_json::Map<String, Value>) -> Option<Plan> {
        let plan: Plan = serde_json::from_value(store.get("backgroundPlan")?.clone()).ok()?;
        if plan.v != PLAN_VERSION {
            return None;
        }
        Some(plan)
    }

    pub fn day(&self, date: &str) -> Option<&PlanDay> {
        self.days.get(date)
    }
}

/// What a reminder is, from the agent's point of view.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Kind {
    /// A seder that has begun and has not been recorded. 1 or 2.
    Seder(u8),
    /// Last month has not been reported to the phone system. Carries the
    /// month (YYYY-MM), which is what the toast's button marks as reported.
    PhoneReport(String),
}

impl Kind {
    /// The key this kind occupies in `notificationsSent`, so a reminder goes
    /// out once and once only — and so the app can see that the agent has
    /// already said it. The `bg-` prefix keeps these clear of the kinds the
    /// app raises itself (see src/lib/notifications.ts).
    pub fn sent_key(&self) -> &'static str {
        match self {
            Kind::Seder(1) => "bg-seder-1",
            Kind::Seder(_) => "bg-seder-2",
            Kind::PhoneReport(_) => "phone-report",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Due {
    pub kind: Kind,
    pub title: String,
    pub body: String,
}

/// Everything the decision depends on, so it can be tested without a clock,
/// a data file or a desktop.
#[derive(Debug, Clone)]
pub struct Facts<'a> {
    /// Today, as YYYY-MM-DD.
    pub today: &'a str,
    /// Minutes past midnight, now.
    pub now_min: i64,
    /// Today's day of the month, 1-31.
    pub day_of_month: u32,
    /// Last month, as YYYY-MM — the month the phone report is about.
    pub prev_month: String,
    /// Today's row of the plan, if the plan reaches this far.
    pub plan_day: Option<PlanDay>,
    pub phone_at: i64,
    /// Windows notifications are switched on at all.
    pub desktop_on: bool,
    pub daily_reminder_on: bool,
    pub phone_reminder_on: bool,
    /// Whether seder א׳ / seder ב׳ already have an entry for today.
    pub recorded: [bool; 2],
    /// Whether `prev_month` has already been marked as reported.
    pub phone_reported: bool,
    /// `notificationsSent`, as the file holds it.
    pub sent: HashMap<String, String>,
}

impl Facts<'_> {
    fn already_sent(&self, key: &str) -> bool {
        self.sent.get(key).map(|t| t == self.today).unwrap_or(false)
    }
}

const SEDER_NAMES: [&str; 2] = ["סדר א׳", "סדר ב׳"];

/// Which reminders are worth raising right now.
pub fn decide(f: &Facts) -> Vec<Due> {
    // With Windows notifications off the agent has nowhere to say anything.
    // It keeps running — the switch is the user's and can come back on
    // without a restart — but it raises nothing meanwhile.
    if !f.desktop_on {
        return Vec::new();
    }
    // No row for today means the plan has run out (the app has not been
    // opened in a year) or has not been written yet. Either way the agent
    // does not know whether the kollel sits today, and must not guess.
    let Some(day) = f.plan_day.as_ref() else {
        return Vec::new();
    };
    // Shabbat and Yom Tov. Nothing is owed, so nothing is chased.
    if day.q {
        return Vec::new();
    }

    let mut due = Vec::new();

    if f.daily_reminder_on {
        for (idx, at) in [day.r1, day.r2].into_iter().enumerate() {
            let Some(at) = at else { continue };
            if f.now_min < at || f.recorded[idx] {
                continue;
            }
            let kind = Kind::Seder(idx as u8 + 1);
            if f.already_sent(kind.sent_key()) {
                continue;
            }
            // The app raises its own "nothing recorded today" reminder while a
            // window is open, and that is the same sentence about the same
            // morning. Whichever spoke first is enough; the matching check on
            // the app's side is in notifications.ts.
            if idx == 0 && f.already_sent("daily-reminder") {
                continue;
            }
            due.push(Due {
                kind,
                title: format!("סדר פלוס — {} לא נרשם", SEDER_NAMES[idx]),
                body: format!(
                    "{} כבר התחיל ועדיין לא נרשם. לחיצה כאן פותחת את התוכנה.",
                    SEDER_NAMES[idx]
                ),
            });
        }
    }

    if f.phone_reminder_on
        && f.day_of_month <= PHONE_REPORT_LAST_DAY
        && !f.phone_reported
        && f.now_min >= f.phone_at
        && !f.already_sent("phone-report")
    {
        let left = PHONE_REPORT_LAST_DAY - f.day_of_month;
        due.push(Due {
            kind: Kind::PhoneReport(f.prev_month.clone()),
            title: "סדר פלוס — דיווח למערכת הטלפונית".to_string(),
            body: if left == 0 {
                format!(
                    "היום היום האחרון לדווח על חודש {} במערכת הטלפונית.",
                    numeric_month(&f.prev_month)
                )
            } else {
                format!(
                    "עדיין לא דיווחת על חודש {} במערכת הטלפונית. נשארו {} ימים.",
                    numeric_month(&f.prev_month),
                    left + 1
                )
            },
        });
    }

    due
}

/// "2026-07" -> "07/2026". The agent has no Hebrew calendar and no month
/// names; the numeric form is unambiguous and needs neither.
fn numeric_month(month_key: &str) -> String {
    match month_key.split_once('-') {
        Some((year, month)) => format!("{month}/{year}"),
        None => month_key.to_string(),
    }
}

/// The month before the given one. (2026, 1) -> "2025-12".
pub fn previous_month(year: i32, month_1_based: u32) -> String {
    if month_1_based <= 1 {
        format!("{:04}-12", year - 1)
    } else {
        format!("{:04}-{:02}", year, month_1_based - 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts() -> Facts<'static> {
        Facts {
            today: "2026-09-08",
            now_min: 10 * 60,
            day_of_month: 8,
            prev_month: "2026-08".to_string(),
            plan_day: Some(PlanDay { r1: Some(9 * 60 + 20), r2: Some(16 * 60), q: false }),
            phone_at: 10 * 60,
            desktop_on: true,
            daily_reminder_on: true,
            phone_reminder_on: true,
            recorded: [false, false],
            phone_reported: false,
            sent: HashMap::new(),
        }
    }

    fn kinds(f: &Facts) -> Vec<Kind> {
        decide(f).into_iter().map(|d| d.kind).collect()
    }

    #[test]
    fn a_seder_that_has_begun_and_was_not_recorded_is_raised_by_name() {
        let due = decide(&facts());
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].kind, Kind::Seder(1));
        assert!(due[0].title.contains("סדר א׳"), "{}", due[0].title);
    }

    #[test]
    fn nothing_is_said_before_the_reminder_falls_due() {
        let mut f = facts();
        f.now_min = 9 * 60 + 19;
        assert_eq!(kinds(&f), vec![]);
    }

    #[test]
    fn each_seder_is_chased_on_its_own() {
        let mut f = facts();
        f.now_min = 16 * 60 + 5;
        // Seder א׳ was recorded, ב׳ was not: only ב׳ is worth saying.
        f.recorded = [true, false];
        assert_eq!(kinds(&f), vec![Kind::Seder(2)]);
    }

    #[test]
    fn a_reminder_goes_out_once_a_day() {
        let mut f = facts();
        f.sent.insert("bg-seder-1".into(), "2026-09-08".into());
        assert_eq!(kinds(&f), vec![]);
        // ...and yesterday's token does not silence today.
        f.sent.insert("bg-seder-1".into(), "2026-09-07".into());
        assert_eq!(kinds(&f), vec![Kind::Seder(1)]);
    }

    #[test]
    fn the_app_having_already_said_it_silences_the_agent() {
        let mut f = facts();
        f.sent.insert("daily-reminder".into(), "2026-09-08".into());
        assert_eq!(kinds(&f), vec![]);
        // But only for seder א׳ — the app's reminder is about the morning.
        f.now_min = 16 * 60;
        assert_eq!(kinds(&f), vec![Kind::Seder(2)]);
    }

    #[test]
    fn a_day_with_no_seder_b_is_not_chased_for_one() {
        let mut f = facts();
        f.now_min = 20 * 60;
        f.plan_day = Some(PlanDay { r1: Some(9 * 60 + 20), r2: None, q: false });
        assert_eq!(kinds(&f), vec![Kind::Seder(1)]);
    }

    #[test]
    fn shabbat_and_yom_tov_are_silent_even_for_the_report() {
        let mut f = facts();
        f.day_of_month = 3;
        f.plan_day = Some(PlanDay { r1: None, r2: None, q: true });
        assert_eq!(kinds(&f), vec![]);
    }

    #[test]
    fn a_day_the_plan_does_not_reach_is_silent() {
        let mut f = facts();
        f.plan_day = None;
        assert_eq!(kinds(&f), vec![]);
    }

    #[test]
    fn windows_notifications_off_means_nothing_at_all() {
        let mut f = facts();
        f.desktop_on = false;
        assert_eq!(kinds(&f), vec![]);
    }

    #[test]
    fn the_report_reminder_runs_from_the_first_to_the_fifth() {
        let mut f = facts();
        f.plan_day = Some(PlanDay { r1: None, r2: None, q: false });
        for day in 1..=5u32 {
            f.day_of_month = day;
            assert_eq!(kinds(&f), vec![Kind::PhoneReport("2026-08".into())], "day {day}");
        }
        f.day_of_month = 6;
        assert_eq!(kinds(&f), vec![]);
    }

    #[test]
    fn marking_the_month_as_reported_stops_it() {
        let mut f = facts();
        f.day_of_month = 2;
        f.plan_day = Some(PlanDay { r1: None, r2: None, q: false });
        f.phone_reported = true;
        assert_eq!(kinds(&f), vec![]);
    }

    #[test]
    fn the_report_reminder_waits_for_its_hour_and_repeats_daily() {
        let mut f = facts();
        f.day_of_month = 2;
        f.plan_day = Some(PlanDay { r1: None, r2: None, q: false });
        f.now_min = 9 * 60 + 59;
        assert_eq!(kinds(&f), vec![]);

        f.now_min = 10 * 60;
        assert_eq!(kinds(&f), vec![Kind::PhoneReport("2026-08".into())]);

        // Once a day: today's token silences it, yesterday's does not.
        f.sent.insert("phone-report".into(), f.today.to_string());
        assert_eq!(kinds(&f), vec![]);
        f.sent.insert("phone-report".into(), "2026-09-01".into());
        assert_eq!(kinds(&f), vec![Kind::PhoneReport("2026-08".into())]);
    }

    #[test]
    fn the_last_day_says_so() {
        let mut f = facts();
        f.day_of_month = 5;
        f.plan_day = Some(PlanDay { r1: None, r2: None, q: false });
        let due = decide(&f);
        assert!(due[0].body.contains("היום האחרון"), "{}", due[0].body);
        assert!(due[0].body.contains("08/2026"), "{}", due[0].body);
    }

    #[test]
    fn each_switch_silences_only_its_own_reminder() {
        let mut f = facts();
        f.day_of_month = 2;
        f.daily_reminder_on = false;
        assert_eq!(kinds(&f), vec![Kind::PhoneReport("2026-08".into())]);

        let mut f = facts();
        f.day_of_month = 2;
        f.phone_reminder_on = false;
        assert_eq!(kinds(&f), vec![Kind::Seder(1)]);
    }

    #[test]
    fn january_reports_on_december_of_the_year_before() {
        assert_eq!(previous_month(2026, 1), "2025-12");
        assert_eq!(previous_month(2026, 9), "2026-08");
    }

    #[test]
    fn a_plan_written_by_a_version_the_agent_does_not_know_is_refused() {
        let mut store = serde_json::Map::new();
        store.insert("backgroundPlan".into(), serde_json::json!({ "v": 99, "days": {} }));
        assert!(Plan::from_store(&store).is_none());

        store.insert(
            "backgroundPlan".into(),
            serde_json::json!({ "v": 1, "phoneAt": 600, "days": { "2026-09-08": { "r1": 560 } } }),
        );
        let plan = Plan::from_store(&store).expect("a current plan parses");
        assert_eq!(plan.phone_at, 600);
        assert_eq!(plan.day("2026-09-08").and_then(|d| d.r1), Some(560));
        assert!(plan.day("2026-09-09").is_none());
    }
}
