//! Local civil time, without pulling `chrono` in.
//!
//! Two callers need it: the problem log stamps every line with it, and the
//! background agent compares "what time is it" against the plan. Both want
//! the machine's own clock, not UTC — a reminder due at 09:20 means 09:20
//! where the user is.
//!
//! This lived inside logfile.rs until the agent needed it too.

/// The local date and time, reduced to what the callers actually ask for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Civil {
    pub year: i64,
    /// 1-12.
    pub month: u32,
    /// 1-31.
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub second: u32,
}

impl Civil {
    /// YYYY-MM-DD — the form every date in the data file is written in.
    pub fn iso_date(&self) -> String {
        format!("{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }

    /// YYYY-MM.
    pub fn month_key(&self) -> String {
        format!("{:04}-{:02}", self.year, self.month)
    }

    /// Minutes past midnight.
    pub fn minute_of_day(&self) -> i64 {
        self.hour as i64 * 60 + self.minute as i64
    }
}

/// The local clock right now.
pub fn local_now() -> Civil {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
        + local_offset_secs();
    from_unix_local_secs(secs)
}

/// Splits seconds-since-the-epoch, already shifted to local time, into a date
/// and a time. Separate from `local_now` so it can be tested.
pub fn from_unix_local_secs(secs: i64) -> Civil {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    Civil {
        year,
        month,
        day,
        hour: (rem / 3600) as u32,
        minute: ((rem % 3600) / 60) as u32,
        second: (rem % 60) as u32,
    }
}

/// Seconds to add to UTC for the machine's own clock. Comparing a known
/// instant's local and UTC renderings is not available in std, so this reads
/// the offset the OS reports for "now".
#[cfg(windows)]
pub fn local_offset_secs() -> i64 {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetTimeZoneInformation(info: *mut TimeZoneInformation) -> u32;
    }
    #[repr(C)]
    struct SystemTime {
        year: u16,
        month: u16,
        day_of_week: u16,
        day: u16,
        hour: u16,
        minute: u16,
        second: u16,
        milliseconds: u16,
    }
    #[repr(C)]
    struct TimeZoneInformation {
        bias: i32,
        standard_name: [u16; 32],
        standard_date: SystemTime,
        standard_bias: i32,
        daylight_name: [u16; 32],
        daylight_date: SystemTime,
        daylight_bias: i32,
    }
    const TIME_ZONE_ID_INVALID: u32 = u32::MAX;
    const TIME_ZONE_ID_DAYLIGHT: u32 = 2;

    // Safety: the struct layout is the documented TIME_ZONE_INFORMATION and
    // the call only writes into it.
    unsafe {
        let mut info: TimeZoneInformation = std::mem::zeroed();
        let id = GetTimeZoneInformation(&mut info);
        if id == TIME_ZONE_ID_INVALID {
            return 0;
        }
        // `bias` is UTC = local + bias, in minutes — hence the negation.
        let bias = info.bias
            + if id == TIME_ZONE_ID_DAYLIGHT {
                info.daylight_bias
            } else {
                info.standard_bias
            };
        -(bias as i64) * 60
    }
}

#[cfg(not(windows))]
pub fn local_offset_secs() -> i64 {
    0
}

/// Howard Hinnant's `civil_from_days`: day number since the Unix epoch to a
/// (year, month, day) in the proleptic Gregorian calendar.
pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_epoch_itself() {
        let c = from_unix_local_secs(0);
        assert_eq!((c.year, c.month, c.day), (1970, 1, 1));
        assert_eq!(c.iso_date(), "1970-01-01");
        assert_eq!(c.minute_of_day(), 0);
    }

    #[test]
    fn a_known_instant_splits_the_way_it_should() {
        // 2026-09-07 09:20:30, once the local offset has been added in.
        let c = from_unix_local_secs(1_788_772_830);
        assert_eq!(c.iso_date(), "2026-09-07");
        assert_eq!((c.hour, c.minute, c.second), (9, 20, 30));
        assert_eq!(c.minute_of_day(), 560);
        assert_eq!(c.month_key(), "2026-09");
    }

    #[test]
    fn leap_days_are_days() {
        // 2024-02-29 00:00 UTC.
        let c = from_unix_local_secs(1_709_164_800);
        assert_eq!(c.iso_date(), "2024-02-29");
    }
}
