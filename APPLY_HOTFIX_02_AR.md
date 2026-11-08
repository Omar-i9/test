# تطبيق TAAMEN V19 Hotfix 02

هذه الحزمة **Patch فقط** وليست نسخة مشروع كاملة.

## طريقة التطبيق على Windows

1. خذ نسخة احتياطية من مجلد V19 الحالي أو تأكد أنك تقدر ترجع له.
2. انسخ ملف ZIP إلى جذر مجلد `TAAMEN_2_0_V19_VERIFIED_CLOUD_ACCOUNTS_CANDIDATE`.
3. افتح PowerShell داخل جذر المشروع ونفّذ:

```powershell
Expand-Archive -LiteralPath ".\TAAMEN_V19_HOTFIX_02_GUEST_FIRST_EXPERIENCE.zip" -DestinationPath "." -Force
```

4. **لا تستبدل `package-lock.json`** ولا تعِد `npm ci` لمجرد هذا التعديل؛ الحزمة لا تحتوي lockfile أو `node_modules` أو `dist` أو `.wrangler`.
5. نفّذ الفحوصات:

```powershell
npm run typecheck
npm run test:frontend
npm run test:backend
npm run test:worker
npm run qa:final
npm run build:production
npm run qa:final
```

6. شغّل المعاينة:

```powershell
npm run preview
```

7. من نافذة PowerShell ثانية داخل مجلد المشروع:

```powershell
npm run cloud:check
```

## ما الذي يتغير؟

- الدخول الأول يصبح كزائر بدل فرض شاشة التسجيل.
- تظهر نافذة تعريف مرة واحدة، مع جولة تمر بصفحات الموقع وتنتهي عند TAAMEN AI.
- تختفي أعلام الدول من محددات اللغة، ويظهر الاسم الأصلي للغة. اللغات الخمس التجريبية تحمل شارة BEAT.
- بطاقات الإعدادات تصطف عموديًا ويكون لكل بطاقة ارتفاعها الطبيعي.
- يضاف `npm run cloud:check` لفحص حالة EmailJS وGoogle OAuth وجلسة الحساب على Preview.

## تنبيهات مهمة

- العربية والإنجليزية هما اللغتان المكتملتان حاليًا. `Deutsch`, `Español`, `Français`, `中文`, `日本語` واجهات BEAT تجريبية، ونصوصها تستخدم الإنجليزية مؤقتًا؛ هذا مو ترجمة مكتملة.
- نجاح `/api/auth/config` بحالة HTTP 200 لا يعني أن مزوّدي الدخول مفعّلون. راجع قيم ENABLED التي يطبعها `npm run cloud:check`.
- تفعيل البريد وGoogle يحتاج إعدادات وأسرار Preview الصحيحة وترحيل D1 رقم `0003` على قاعدة Preview المخصصة. لا تضف أسرار Preview أو معرّف Preview إلى إعداد الإنتاج.
- مزامنة المباريات والأرشيف بين الأجهزة غير مفعّلة في V19؛ تبقى ضمن V20.
- لا يوجد نشر أو تعديل على Cloudflare Production ضمن هذه الحزمة.
