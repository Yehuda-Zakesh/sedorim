const HEBREW_EPOCH = -1373427;
const mod = (a, b) => (a % b + b) % b;
const quot = (a, b) => Math.floor(a / b);
function isHebrewLeap(y) {
  return mod(7 * y + 1, 19) < 7;
}
function hebrewMonthsInYear(y) {
  return isHebrewLeap(y) ? 13 : 12;
}
function elapsedDays(y) {
  const monthsElapsed = 235 * quot(y - 1, 19) + 12 * mod(y - 1, 19) + quot(7 * mod(y - 1, 19) + 1, 19);
  const partsElapsed = 204 + 793 * mod(monthsElapsed, 1080);
  const hoursElapsed = 5 + 12 * monthsElapsed + 793 * quot(monthsElapsed, 1080) + quot(partsElapsed, 1080);
  const day = 1 + 29 * monthsElapsed + quot(hoursElapsed, 24);
  const parts = 1080 * mod(hoursElapsed, 24) + mod(partsElapsed, 1080);
  let altDay;
  if (parts >= 19440 || mod(day, 7) === 2 && parts >= 9924 && !isHebrewLeap(y) || mod(day, 7) === 1 && parts >= 16789 && isHebrewLeap(y - 1)) altDay = day + 1;
  else altDay = day;
  if (mod(altDay, 7) === 0 || mod(altDay, 7) === 3 || mod(altDay, 7) === 5) return altDay + 1;
  return altDay;
}
function hebrewNewYear(y) {
  return HEBREW_EPOCH + elapsedDays(y);
}
function hebrewDaysInYear(y) {
  return hebrewNewYear(y + 1) - hebrewNewYear(y);
}
function longCheshvan(y) {
  return mod(hebrewDaysInYear(y), 10) === 5;
}
function shortKislev(y) {
  return mod(hebrewDaysInYear(y), 10) === 3;
}
function hebrewLastDayOfMonth(month, year) {
  if ([2, 4, 6, 10, 13].includes(month)) return 29;
  if (month === 12 && !isHebrewLeap(year)) return 29;
  if (month === 8 && !longCheshvan(year)) return 29;
  if (month === 9 && shortKislev(year)) return 29;
  return 30;
}
function fixedFromHebrew(y, m, d) {
  let result = hebrewNewYear(y) + d - 1;
  if (m < 7) {
    for (let i = 7; i <= hebrewMonthsInYear(y); i++) result += hebrewLastDayOfMonth(i, y);
    for (let i = 1; i < m; i++) result += hebrewLastDayOfMonth(i, y);
  } else {
    for (let i = 7; i < m; i++) result += hebrewLastDayOfMonth(i, y);
  }
  return result;
}
function hebrewFromFixed(date) {
  const approx = quot(date - HEBREW_EPOCH, 366) + 1;
  let year = approx;
  while (hebrewNewYear(year + 1) <= date) year++;
  const start = date < fixedFromHebrew(year, 1, 1) ? 7 : 1;
  let month = start;
  while (date > fixedFromHebrew(year, month, hebrewLastDayOfMonth(month, year))) month++;
  const day = date - fixedFromHebrew(year, month, 1) + 1;
  return { year, month, day };
}
const GREGORIAN_EPOCH = 1;
function isGregorianLeap(y) {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}
function fixedFromGregorian(y, m, d) {
  return GREGORIAN_EPOCH - 1 + 365 * (y - 1) + quot(y - 1, 4) - quot(y - 1, 100) + quot(y - 1, 400) + quot(367 * m - 362, 12) + (m <= 2 ? 0 : isGregorianLeap(y) ? -1 : -2) + d;
}
function hebrewFromGregorian(date) {
  return hebrewFromFixed(fixedFromGregorian(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}
const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];
function numToHebrewLetters(n) {
  if (n <= 0) return "";
  let out = "";
  if (n >= 100) {
    out += HUNDREDS[Math.floor(n / 100)];
    n %= 100;
  }
  if (n === 15) out += "טו";
  else if (n === 16) out += "טז";
  else {
    out += TENS[Math.floor(n / 10)];
    out += ONES[n % 10];
  }
  return out;
}
function withGershayim(s) {
  if (s.length === 0) return s;
  if (s.length === 1) return s + "׳";
  return s.slice(0, -1) + "״" + s.slice(-1);
}
function hebrewDayLetters(day) {
  return withGershayim(numToHebrewLetters(day));
}
function hebrewYearLetters(year) {
  const short = year % 1e3;
  return withGershayim(numToHebrewLetters(short));
}
const MONTH_NAMES = [
  "",
  "ניסן",
  "אייר",
  "סיון",
  "תמוז",
  "אב",
  "אלול",
  "תשרי",
  "חשון",
  "כסלו",
  "טבת",
  "שבט",
  "אדר",
  "אדר ב׳"
];
function hebrewMonthName(month, year) {
  if (month === 12 && isHebrewLeap(year)) return "אדר א׳";
  return MONTH_NAMES[month];
}
function formatHebrewDate(date) {
  const h = hebrewFromGregorian(date);
  return `${hebrewDayLetters(h.day)} ${hebrewMonthName(h.month, h.year)} ${hebrewYearLetters(h.year)}`;
}
function formatHebrewMonthYear(h) {
  return `${hebrewMonthName(h.month, h.year)} ${hebrewYearLetters(h.year)}`;
}
function isBeinHazmanim(date = /* @__PURE__ */ new Date()) {
  const h = hebrewFromGregorian(date);
  if (h.month === 5) return h.day >= 1 && h.day <= 29;
  if (h.month === 6) return h.day >= 9 && h.day <= 30;
  if (h.month === 7) return h.day >= 11 && h.day <= 30;
  if (h.month === 1) return h.day >= 1 && h.day <= 30;
  return false;
}
export {
  formatHebrewDate as a,
  hebrewDayLetters as b,
  formatHebrewMonthYear as f,
  hebrewFromGregorian as h,
  isBeinHazmanim as i
};
