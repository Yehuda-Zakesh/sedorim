
## מה נבנה

אפליקציית Electron שנייה — `KollelQuick.exe` — קטנה ומהירה, שמציגה רק את מסך `/quick`, ועובדת על אותו מאגר localStorage של ה-EXE הראשי.

## איך זה עובד טכנית

Electron שומר localStorage בתוך תיקיית `userData` של האפליקציה. כברירת מחדל לכל אפליקציה יש תיקייה משלה לפי שם — לכן שתי EXE שונות לא יראו אחת את הנתונים של השנייה.

הפתרון: **שתי האפליקציות יקבעו במפורש את אותה תיקיית userData** (`%APPDATA%/KollelTracker`). אז Chromium טוען בשתיהן את אותו פרופיל, ואותו `localStorage` — שינוי באחת נראה מיד בשנייה (אחרי refresh של החלון).

מגבלה אחת חשובה: **דפדפן רגיל** לא יכול להשתתף בשיתוף הזה — localStorage של דפדפן חי בתוך הפרופיל של הדפדפן, לא בקובץ נגיש. השיתוף תקף בין שתי ה-EXE בלבד. אם תפתח את האפליקציה גם ב-Chrome, הנתונים שם נפרדים.

## שינויים בקוד

### 1. `electron/main.cjs` (קיים) — לקבע userData משותף
בתחילת הקובץ, לפני `app.whenReady()`:
```js
const path = require('path');
const sharedData = path.join(app.getPath('appData'), 'KollelTracker');
app.setPath('userData', sharedData);
```

### 2. `electron/quick.cjs` (חדש) — main process של ה-EXE השני
- אותו `setPath('userData', sharedData)` (קריטי — חייב להיות אותו נתיב מילה במילה).
- `BrowserWindow` קטן (למשל 480×640), `alwaysOnTop` אופציונלי, בלי תפריט.
- טוען `dist/index.html#/quick` (hash routing דרך `loadFile` עם `hash: 'quick'`), כך שהאפליקציה עולה ישר על מסך הכניסה המהירה.
- סוגר את עצמו אחרי שמירה מוצלחת (event שנשלח מה-renderer).

### 3. `package.json` — נקודת כניסה שנייה
לא ניתן להגדיר שני `main` באותו package. נארוז שני builds נפרדים:
- Build A: `main = electron/main.cjs` → `KollelTracker.exe`
- Build B: `main = electron/quick.cjs` → `KollelQuick.exe`

נעשה את זה ע"י החלפת `main` רגע לפני כל קריאה ל-`@electron/packager`, או ע"י שני קבצי package שמועתקים לפני packaging. הסקריפט יריץ:
```
vite build
# pack main exe
# swap main → quick.cjs, pack quick exe
# zip שניהם יחד
```

### 4. אות "נשמר → רענן" בין החלונות (אופציונלי, מומלץ)
כדי שה-EXE הראשי יראה מיידית רישום שנעשה ב-Quick (במקום רק אחרי refresh ידני):
- ב-`src/lib/kollel-store.ts` נוסיף האזנה ל-`window.addEventListener('storage', ...)`. אירוע `storage` נורה אוטומטית כשתהליך Chromium אחר שמשתמש באותו פרופיל כותב ל-localStorage — אז המאזין יקרא מחדש ויעדכן את המנויים של ה-store.
- זה השינוי היחיד בקוד היישומי. כל שאר הקוד (attendance, calendar, store API) לא משתנה.

### 5. אריזה
סקריפט bash שמייצר שני `.exe` ואורז את שניהם יחד ל-`KollelTracker-Suite-win32-x64.7z`, עם README קצר שמסביר:
- מריצים בפעם הראשונה את `KollelTracker.exe` כדי שתיווצר תיקיית הנתונים.
- אחר כך אפשר ליצור קיצור דרך נפרד ל-`KollelQuick.exe` (מומלץ על שולחן העבודה / Start).

## מה לא משתנה
- כל ה-UI הקיים, העיצוב, ה-routes, ה-stores, וה-PDF/Excel.
- מסך `/quick` עצמו לא משתנה — פשוט נטען אוטומטית בחלון השני.
- ה-build הדפדפני / הפריוויו ב-Lovable ממשיכים לעבוד כרגיל.

## תוצר
`KollelTracker-Suite-win32-x64.7z` המכיל:
- `KollelTracker/KollelTracker.exe` — האפליקציה המלאה.
- `KollelQuick/KollelQuick.exe` — חלון כניסה מהירה עצמאי, מהיר לפתיחה, שמסונכרן מלא עם הראשי.
