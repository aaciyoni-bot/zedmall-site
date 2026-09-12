# byoutoyou — מדריך מעבר מדמו להשקה 🚀

האפליקציה בנויה כך שכל הנתונים והפעולות עוברים דרך **שכבת api אחת** (`const api = {...}` ב-`index.html`).
בדמו השכבה ממומשת מקומית; בהשקה מחליפים אותה בשרת אמיתי — **בלי לגעת בקוד ה-UI**.

## מתג ההשקה

בראש ה-`<script>` ב-`index.html`:

```js
const CONFIG = {
  DEMO_MODE: true,          // ← false בהשקה
  API_BASE_URL: '',         // ← כתובת השרת, למשל 'https://api.byoutoyou.com/v1'
  PAYMENT: { provider: 'demo', publicKey: '' },
};
```

## חוזה ה-API שהשרת צריך לממש

| Method | Path | תיאור | תשובה |
|---|---|---|---|
| GET | `/providers` | רשימת מטפלות (אותו מבנה כמו `PROVIDERS` בקוד) | `Provider[]` |
| GET | `/bookings` | הזמנות של המשתמשת המחוברת | `Booking[]` |
| POST | `/bookings` | יצירת הזמנה | `Booking` |
| PATCH | `/bookings/:id` | עדכון (סטטוס, דירוג) | `Booking` |
| POST | `/payments` | חיוב: `{amount, cardToken, provider}` | `{ok, txId}` |

מבנה `Booking` — בדיוק כפי שנוצר היום ב-`submitBooking()`: `id, txId, providerId, providerName, services[], total, when, address, customerName, phone, notes, etaMin, createdAt, status('active'|'done'), rating?`.

**מעקב חי:** בדמו המעקב הוא סימולציה מבוססת-זמן (`orderPhase`/`driveFrac`). בהשקה מחליפים אותה בסטטוס אמיתי מהשרת — האפליקציה של המטפלת מדווחת מיקום, והלקוחה מקבלת עדכונים ב-polling על `GET /bookings/:id` או ב-WebSocket/Firestore listener. נקודת ההחלפה היחידה: הפונקציות `orderPhase`, `driveFrac`, `etaLabel`.

## Firebase — צריך או לא?

**לדמו — לא.** האתר סטטי לגמרי ורץ מ-CDN.

**להשקה — צריך backend כלשהו, ו-Firebase הוא הדרך המהירה ביותר:**

| צורך | פתרון Firebase | ממומש מול |
|---|---|---|
| הרשמה/כניסה (טלפון + SMS) | Firebase Auth | כל קריאות ה-api |
| מסד נתונים (מטפלות, הזמנות, ביקורות) | Firestore | `/providers`, `/bookings` |
| לוגיקת שרת + סליקה | Cloud Functions | `/payments` |
| עדכוני מיקום חיים | Firestore realtime listeners | המעקב החי |
| התראות push | Firebase Cloud Messaging | "המטפלת בדרך" |

חלופה שקולה: להישאר ב-Vercel (שכבר מארח את האתר) עם Vercel Functions + מסד כמו Neon/Supabase. שתי הדרכים טובות; Firebase נוח יותר ל-realtime ול-SMS auth, Vercel נוח כי הכול כבר שם. **ההמלצה: Firebase ל-Auth ול-DB, והאתר נשאר ב-Vercel.**

## סליקה בישראל

בדמו אין חיוב אמיתי ופרטי כרטיס לא נשמרים ולא נשלחים לשום מקום.

להשקה, העיקרון: **מספר כרטיס לעולם לא מגיע לשרת שלכם** (דרישת PCI-DSS). ה-SDK של ספק הסליקה רץ בדפדפן, ממיר את הכרטיס לטוקן, והשרת מחייב עם הטוקן — בדיוק המבנה שכבר קיים ב-`api.processPayment({amount, cardToken})`.

ספקים ישראליים מקובלים (כולם עם טוקניזציה + חשבונית אוטומטית):

| ספק | יתרון | חסרון |
|---|---|---|
| **Grow (משולם)** | הקמה מהירה, פופולרי אצל עסקים קטנים | עמלות מעט גבוהות |
| **PayPlus** | API מודרני ונוח למפתחים | — |
| **Tranzila** | ותיק ויציב, נפוץ מאוד | API מיושן |
| **Cardcom** | סליקה + חשבוניות במקום אחד | — |
| Stripe | ה-API הטוב בעולם | דורש ישות בחו"ל — לא רלוונטי לעוסק ישראלי |

**המלצה: Grow או PayPlus** — פותחים חשבון עסקי, מקבלים מפתח, מציבים אותו ב-`CONFIG.PAYMENT` וממשים את `/payments` ב-Cloud Function שקוראת ל-API שלהם.

## צ'ק-ליסט השקה

- [ ] backend מוכן (Firebase/Vercel Functions) שמממש את 5 נקודות הקצה
- [ ] חשבון סליקה (Grow/PayPlus) + מפתח ציבורי ב-`CONFIG.PAYMENT`
- [ ] החלפת נתוני הדמו במטפלות אמיתיות (אותו מבנה JSON — רק להזין ל-DB)
- [ ] תמונות אמיתיות של המטפלות והעבודות (היום: תמונות מאגר עם fallback אוטומטי)
- [ ] `DEMO_MODE: false` + `API_BASE_URL`
- [ ] הסרת השורה "גרסת דמו" מה-footer והערת הדמו מעמוד התשלום
- [ ] תקנון, מדיניות פרטיות וביטולים (יש תבניות בריפו הראשי)
- [ ] חיבור `byoutoyou.com` ב-Vercel (Settings → Domains)
