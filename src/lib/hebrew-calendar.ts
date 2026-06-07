// Hebrew calendar — Reingold/Dershowitz "Calendrical Calculations" (compact JS port).
// Public-domain algorithm. Works from year ~1 to ~6000 AM.
// Month numbering: 1=Nisan, 2=Iyar, 3=Sivan, 4=Tammuz, 5=Av, 6=Elul,
// 7=Tishrei, 8=Cheshvan, 9=Kislev, 10=Tevet, 11=Shvat, 12=Adar (or Adar I in leap), 13=Adar II.

const HEBREW_EPOCH = -1373427; // R.D. of 1 Tishri 1 A.M.

const mod = (a: number, b: number) => ((a % b) + b) % b;
const quot = (a: number, b: number) => Math.floor(a / b);

export function isHebrewLeap(y: number): boolean {
  return mod(7 * y + 1, 19) < 7;
}
export function hebrewMonthsInYear(y: number): number {
  return isHebrewLeap(y) ? 13 : 12;
}

function elapsedDays(y: number): number {
  const monthsElapsed = 235 * quot(y - 1, 19) + 12 * mod(y - 1, 19) + quot(7 * mod(y - 1, 19) + 1, 19);
  const partsElapsed = 204 + 793 * mod(monthsElapsed, 1080);
  const hoursElapsed = 5 + 12 * monthsElapsed + 793 * quot(monthsElapsed, 1080) + quot(partsElapsed, 1080);
  const day = 1 + 29 * monthsElapsed + quot(hoursElapsed, 24);
  const parts = 1080 * mod(hoursElapsed, 24) + mod(partsElapsed, 1080);
  let altDay: number;
  if (
    parts >= 19440 ||
    (mod(day, 7) === 2 && parts >= 9924 && !isHebrewLeap(y)) ||
    (mod(day, 7) === 1 && parts >= 16789 && isHebrewLeap(y - 1))
  ) altDay = day + 1; else altDay = day;
  if (mod(altDay, 7) === 0 || mod(altDay, 7) === 3 || mod(altDay, 7) === 5) return altDay + 1;
  return altDay;
}

function hebrewNewYear(y: number): number { return HEBREW_EPOCH + elapsedDays(y); }
function hebrewDaysInYear(y: number): number { return hebrewNewYear(y + 1) - hebrewNewYear(y); }
function longCheshvan(y: number): boolean { return mod(hebrewDaysInYear(y), 10) === 5; }
function shortKislev(y: number): boolean { return mod(hebrewDaysInYear(y), 10) === 3; }

export function hebrewLastDayOfMonth(month: number, year: number): number {
  if ([2, 4, 6, 10, 13].includes(month)) return 29;
  if (month === 12 && !isHebrewLeap(year)) return 29;
  if (month === 8 && !longCheshvan(year)) return 29;
  if (month === 9 && shortKislev(year)) return 29;
  return 30;
}

function fixedFromHebrew(y: number, m: number, d: number): number {
  let result = hebrewNewYear(y) + d - 1;
  if (m < 7) {
    for (let i = 7; i <= hebrewMonthsInYear(y); i++) result += hebrewLastDayOfMonth(i, y);
    for (let i = 1; i < m; i++) result += hebrewLastDayOfMonth(i, y);
  } else {
    for (let i = 7; i < m; i++) result += hebrewLastDayOfMonth(i, y);
  }
  return result;
}

function hebrewFromFixed(date: number): { year: number; month: number; day: number } {
  const approx = quot(date - HEBREW_EPOCH, 366) + 1;
  let year = approx;
  while (hebrewNewYear(year + 1) <= date) year++;
  const start = date < fixedFromHebrew(year, 1, 1) ? 7 : 1;
  let month = start;
  while (date > fixedFromHebrew(year, month, hebrewLastDayOfMonth(month, year))) month++;
  const day = date - fixedFromHebrew(year, month, 1) + 1;
  return { year, month, day };
}

// Gregorian R.D.
const GREGORIAN_EPOCH = 1;
function isGregorianLeap(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}
function fixedFromGregorian(y: number, m: number, d: number): number {
  return GREGORIAN_EPOCH - 1
    + 365 * (y - 1)
    + quot(y - 1, 4) - quot(y - 1, 100) + quot(y - 1, 400)
    + quot(367 * m - 362, 12)
    + (m <= 2 ? 0 : isGregorianLeap(y) ? -1 : -2)
    + d;
}

export type HebrewDate = { year: number; month: number; day: number };

export function hebrewFromGregorian(date: Date): HebrewDate {
  return hebrewFromFixed(fixedFromGregorian(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}

// Hebrew letter formatting (gematria) with geresh/gershayim.
const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];

function numToHebrewLetters(n: number): string {
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

function withGershayim(s: string): string {
  if (s.length === 0) return s;
  if (s.length === 1) return s + "׳";
  return s.slice(0, -1) + "״" + s.slice(-1);
}

export function hebrewDayLetters(day: number): string {
  return withGershayim(numToHebrewLetters(day));
}

export function hebrewYearLetters(year: number): string {
  // Drop the thousands (e.g. 5786 → 786 → תשפ״ו)
  const short = year % 1000;
  return withGershayim(numToHebrewLetters(short));
}

const MONTH_NAMES = [
  "", "ניסן", "אייר", "סיון", "תמוז", "אב", "אלול",
  "תשרי", "חשון", "כסלו", "טבת", "שבט", "אדר", "אדר ב׳",
];

export function hebrewMonthName(month: number, year: number): string {
  if (month === 12 && isHebrewLeap(year)) return "אדר א׳";
  return MONTH_NAMES[month];
}

export function formatHebrewDate(date: Date): string {
  const h = hebrewFromGregorian(date);
  return `${hebrewDayLetters(h.day)} ${hebrewMonthName(h.month, h.year)} ${hebrewYearLetters(h.year)}`;
}

export function formatHebrewMonthYear(h: HebrewDate): string {
  return `${hebrewMonthName(h.month, h.year)} ${hebrewYearLetters(h.year)}`;
}

// Bein Hazmanim windows per spec: Av 1–29, Elul 9–30, Tishrei 11–30, Nisan 1–30.
export function isBeinHazmanim(date: Date = new Date()): boolean {
  const h = hebrewFromGregorian(date);
  if (h.month === 5) return h.day >= 1 && h.day <= 29;                      // Av
  if (h.month === 6) return h.day >= 9 && h.day <= 30;                      // Elul
  if (h.month === 7) return h.day >= 11 && h.day <= 30;                     // Tishrei
  if (h.month === 1) return h.day >= 1 && h.day <= 30;                      // Nisan
  return false;
}
