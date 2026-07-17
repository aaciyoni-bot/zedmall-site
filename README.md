# ZedMall 🇿🇲 — Shop Global, Pay with Mobile Money

**www.zedmall.co.zm**

אתר מראה ל-AliExpress עבור צרכנים בזמביה: אותם מוצרים, מחירים בקוואצ'ה (ZMW), ותשלום ב-Mobile Money — MTN MoMo, Airtel Money, Zamtel Kwacha — בלי צורך בכרטיס אשראי.

---

## מבנה הפרויקט

```
zedmall-site/
├── index.html        ← האתר כולו (חנות, עגלה, קופת Mobile Money) — GitHub Pages
├── CNAME             ← הדומיין www.zedmall.co.zm
├── backend/          ← שרת ה-API (חיפוש מוצרים ב-AliExpress) — נפרס ב-Vercel
│   ├── server.js
│   ├── package.json
│   └── vercel.json
└── README.md
```

## חלק 1 — האתר (GitHub Pages)

האתר הוא קובץ HTML אחד, בלי build ובלי התקנות.

**הפעלה:** Settings ← Pages ← Source: **Deploy from a branch** ← Branch: `main`, תיקייה `/ (root)` ← Save.

הדומיין `www.zedmall.co.zm` כבר מוגדר דרך קובץ ה-CNAME. אצל רשם הדומיין צריך רשומת CNAME שמפנה את `www` אל `aaciyoni-bot.github.io`.

### הגדרות האתר

בראש ה-`<script>` בתוך `index.html` יש בלוק `CONFIG`:

| הגדרה | ערך נוכחי | משמעות |
|---|---|---|
| `API_BASE_URL` | `https://zedmall-site.vercel.app` | כתובת ה-backend. ריק = מצב דמו |
| `USD_TO_ZMW` | 27.5 | שער דולר ← קוואצ'ה |
| `MARKUP_PERCENT` | 18 | המרווח שלכם על מחיר הספק |
| `SERVICE_FEE_PERCENT` | 5 | עמלת שירות בקופה (מכסה עמלות MoMo) |
| `BUDGET_MAX_ZMW` | 100 | תקרת המחיר של אזור התקציב "Under K100" |
| `WHATSAPP_ORDERS` | — | מספר וואטסאפ שמקבל כל הזמנה |

אם ה-backend לא זמין, האתר עובר אוטומטית למוצרי דמו — הלקוח לעולם לא רואה עמוד שבור.

## חלק 2 — ה-Backend (Vercel)

השרת מתווך בין האתר ל-API של AliExpress (דרך RapidAPI) ושומר את המפתח בצד השרת.

**פריסה:**
1. ב-Vercel: **Add New Project** ← ייבוא הרפו הזה ← **Root Directory: `backend`**
2. ב-**Environment Variables** מוסיפים: `RAPIDAPI_KEY` = המפתח שלכם מ-RapidAPI
3. Deploy. בדיקה: `https://<project>.vercel.app/api/health` צריך להחזיר `{"ok":true,"keyConfigured":true}`
4. מעדכנים את `API_BASE_URL` ב-`index.html` לכתובת שקיבלתם

> ⚠️ **המפתח הישן של RapidAPI נחשף בקוד בעבר — חובה לג'נרט מפתח חדש** (RapidAPI ← My Apps ← Regenerate Key) ולהגדיר אותו רק כ-Environment Variable. לעולם לא בקוד.

## שרשרת ההזמנה (המודל)

1. הלקוח מוסיף לעגלה ומשלם ב-Mobile Money (מאשר עם PIN בטלפון)
2. ההזמנה המלאה מגיעה אליכם לוואטסאפ (שם, טלפון, כתובת, מוצרים, סכום)
3. אתם מזמינים את המוצר ב-AliExpress עם אמצעי התשלום שלכם, לכתובת הלקוח
4. הספק שולח ישירות לזמביה (12–25 יום); הלקוח מקבל עדכון SMS
5. הרווח = מרווח 18% + עמלת שירות 5%, פחות עמלות MoMo

## השלב הבא — תשלום Mobile Money אמיתי

כרגע אישור התשלום בקופה הוא סימולציה + שליחת ההזמנה לוואטסאפ. לגבייה אמיתית מחברים ספק סליקה (Flutterwave / Lenco / MTN MoMo API) **בצד השרת**. בפונקציה `submitPayment()` ב-`index.html` מסומן בדיוק איפה מחליפים את הסימולציה בקריאה ל-backend.
