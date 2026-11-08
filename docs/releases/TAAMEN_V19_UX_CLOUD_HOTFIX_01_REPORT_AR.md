# TAAMEN V19 — UX & Cloud Authentication Hotfix 01

**التاريخ:** 6 نوفمبر 2026  
**خط الأساس:** `TAAMEN_V19_MERGED_FULL_PRODUCT_EXPERIENCE_CANDIDATE.zip`  
**حالة الحزمة:** Preview Candidate — ليست معتمدة للإنتاج  
**نسخة المنتج:** `2.0.0` دون تغيير  
**النشر:** لم يتم  
**Cloudflare / Production:** لم تتغير Workers أو Secrets أو Routes أو D1 أو KV أو إعدادات الموقع المنشور.

## A. ملخص التنفيذ الفعلي

| المجال | التنفيذ |
|---|---|
| المساعدة | توحيد الجولة ودليل الاستخدام في AccountHub؛ الجولة هي الإجراء الأساسي والدليل ثانوي. |
| الجولة | إعادة استخدام نظام V19 الحالي؛ لا توجد نسخة ثانية. يدعم إعادة التشغيل، ويعيد قياس العنصر عند تغير visual viewport والتمرير. |
| صفحة Acquisition | حذف الصفحة ومكوناتها وأصولها وإعداداتها ومفاتيح ترجمتها واختباراتها المخصصة. المسار القديم يعيد المستخدم إلى Home ولا يعرض صفحة. |
| تأكيد البريد في Settings | إزالة بطاقة التأكيد وعناصرها من Settings، مع الإبقاء على مسارات OTP والتحقق في Worker. |
| قائمة اللغة | نقل القائمة إلى Portal في `document.body` مع `position: fixed` وحساب موضعها من زر الفتح، وإغلاقها بالنقر الخارجي وEscape. |
| جولة الهاتف | تحسين Bottom Sheet وSafe Areas والارتفاع والتموضع فوق شريط التنقل، مع مراعاة landscape و`prefers-reduced-motion`. |
| ربط البريد | تدفق OTP جديد لربط بريد إضافي بالجلسة الحالية؛ التحدي مرتبط بالحساب في D1 ولا تُضاف الهوية قبل إثبات الرمز. |
| ربط Google | OAuth Authorization Code + PKCE S256 وState أحادي الاستخدام وCookie ربط المتصفح؛ callback يربط الهوية بالحساب الذي بدأ العملية ولا يبدّل الجلسة. |
| إلغاء ربط المزود | السماح فقط ببقاء وسيلة دخول موثقة أخرى؛ منع حذف البريد الأساسي أو آخر مزود دخول، بما في ذلك التحقق الذري عند الطلبات المتزامنة. |
| حالة الخدمات | فصل Reachability الخاصة بـWorker عن إعداد/ربط Google والبريد وعن حالة مزامنة المباريات. توضح الواجهة أن مزامنة المباريات غير مفعّلة قبل V20. |

## B. تدقيق إزالة Acquisition

حُذفت 36 مادة من خط الأساس، تشمل:

- `src/pages/Acquisition.tsx`
- `src/components/SideProjectorsBadge.tsx`
- `src/config/acquisition.ts` واختباره
- `src/config/sideprojectors.ts` واختباره
- `src/i18n/acquisition.ts` واختباره
- `tests/acquisition-dossier.spec.ts`
- `tests/sideprojectors-badge.spec.ts`
- `docs/acquisition/flippa-listing.md`
- كامل `public/acquisition-assets/` (صور PNG وWebP الخاصة بالصفحة)

كما أزيلت مراجع الصفحة من App route registry وSidebar وMobile Navigation وHomepage/Settings placements وpublic sitemap وService Worker وdeep links ومفاتيح الترجمة وCSS المخصص.

**المراجع المتبقية مقصودة وليست صفحة حيّة:** مسار حارس واحد في `src/App.tsx` يتعرف على `/acquisition` القديم ويحوّله إلى `/#home`، واختبارات Regression تفتح الرابط القديم للتأكد أنه لا يعرض صفحة. لا يوجد Acquisition component أو route مسجل أو رابط واجهة أو أصل بصري تابع له.

لم تُحذف واجهات التواصل العامة أو Worker APIs أو بيانات المشروع المشتركة؛ لم تُعامل كلمة Acquisition وحدها سببًا لحذف خدمة مشتركة.

## C. نتائج المصادقة والخدمات السحابية

| العملية | نتيجة الاختبار | نوع الإثبات والحدود |
|---|---|---|
| Google OAuth sign-in | PASS محليًا | Worker tests تغطي PKCE وState وbrowser-binding. لم يُنفّذ تدفق حي مع Google. |
| Google account linking | PASS محليًا | اختبار callback بمحاكاة استجابة المزوّد يثبت ربط الهوية بالحساب الحالي، وعدم إصدار/استبدال جلسة، ورفض ملكية حساب آخر. الاختبار الحي محجوب بإعدادات OAuth Preview. |
| رفض/إلغاء موافقة Google | PASS محليًا | callback يعيد إلى Profile بحالة خطأ مفهومة ويحافظ على الجلسة القائمة. |
| Email OTP sign-in / verification | PASS محليًا | اختبار Worker مع مزود إرسال محاكى؛ لا يعني وصول رسالة حقيقية. |
| Email provider linking | PASS محليًا | اختبار OTP أحادي الاستخدام، مرتبط بالحساب الحالي وCSRF؛ لا يُنشئ حسابًا جديدًا ولا ينقل بريدًا مملوكًا لحساب آخر. |
| Provider unlink | PASS محليًا | يمنع حذف البريد الأساسي وآخر وسيلة دخول؛ يرفض الخادم آخر مزود برمز `last_auth_provider_required`. |
| Session / CSRF | PASS محليًا | اختبارات Worker تغطي الجلسات والكوكيز وCSRF والخروج. |
| Worker API | PASS محليًا | 74/74 اختبار Worker؛ ليس اختبارًا إلى Worker Preview منشور منفصل. |
| D1 Migration 0004 | PASS في SQLite معزولة | تطبيق 0001–0004 داخل SQLite للاختبارات؛ لم تُطبق 0003 أو 0004 على D1 Preview البعيدة. |
| Cloudflare KV | BLOCKED | لم تنفذ قراءة/كتابة عن بُعد؛ إعداد KV الحالي ليس معزولًا بشكل مثبت عن Production. |
| Cloudflare AI | BLOCKED للاختبار الحي | اختبارات Worker تستخدم binding اختباريًا؛ لم يرسل طلب inference إلى Cloudflare عن بُعد. |
| Production | NOT TESTED / NOT MODIFIED | لا نشر ولا أسرار ولا Migration ولا كتابة KV أو D1. |

### حدود ربط البريد وGoogle

أضيفت Migration `0004_account_provider_linking.sql` بشكل إضافي. توسّع جدول تحديات البريد وحالات OAuth بحقل `purpose` افتراضيه `signin` وحقل `user_id` اختياري، حتى يظل مسار تسجيل الدخول القديم صالحًا ويصبح مسار الربط مربوطًا بحساب الجلسة. لم يتم تعديل Migration 0003 بأثر رجعي.

## D. Mobile Tour QA

نُفذت تحسينات CSS وقياس viewport، وأضيفت مستمعات `visualViewport.resize` و`visualViewport.scroll` مع تنظيفها عند unmount. بطاقة الجولة تصبح Bottom Sheet على الهاتف، وتستخدم safe-area insets، وتترك مساحة لشريط التنقل السفلي، وتتغير في landscape وتُقلل الحركة عند طلب النظام.

**الاختبار البصري الحقيقي على جهاز/متصفح غير منفذ**؛ لأن تثبيت الاعتماديات تعطل ولم يتوفر Build قابل للتشغيل أو Playwright مكتمل. توجد سيناريوهات Responsive في ملفات E2E لأحجام مثل 360×800 و390×844 و430×932 و375/430/768/1024/1440 عرضًا، لكنها لم تُشغّل في هذا التسليم؛ لا نضع لها PASS.

## E. نتائج الاختبارات

| الفحص | النتيجة | ملاحظات |
|---|---:|---|
| Worker | **74/74 PASS** | يشمل Cloud Auth وProvider Linking وV18 Sync وTAAMEN AI وD1 SQLite. |
| Backend | **27/27 PASS** | Backend tests. |
| UX / Account / Help / Tour / SPA targeted | **24/24 PASS** | اختبارات القسم الموحد، غياب الكارد، Route guard، اللغة، حالة Sync والـProvider controls. |
| Cloud Auth focused | **12/12 PASS** | `worker/cloudAuth.test.mjs`. |
| Full Frontend | **265 PASS / 2 could not load** | 267 ملف اختبار مكتشف؛ الملفان المتعذران لا يصلان إلى assertions بسبب عدم وجود `lucide-react` و`react` في `node_modules`. |
| Privacy QA | **PASS** | 174 ملف مصدر، 9 ملفات public، و0 build files (لا يوجد `dist`). |
| TypeScript parser | **PASS — syntax only** | 174 ملف TS/TSX، TypeScript 5.8.3، صفر parse diagnostics. هذا ليس typecheck. |
| `npm run typecheck` | **BLOCKED** | `TS2688`: تعريفات `node` و`react` و`react-dom` غير موجودة. |
| `npm run build:production` | **BLOCKED** | يتوقف عند `tsc -b` لنفس النقص؛ مرحلة Vite لم تبدأ. |
| Browser / Playwright E2E | **NOT RUN** | لا توجد حزمة اعتماديات كاملة أو Build. |
| `npm ci` | **BLOCKED** | محاولة التثبيت فشلت بسبب `EAI_AGAIN` عند الوصول إلى npm registry، وخرج npm برسالة `Exit handler never called!`. |

أسباب فشل تحميل الاختبارين:

- `src/config/routes.test.ts`: تعذر تحميل `lucide-react`.
- `src/domain/matches/mobileProduct.test.ts`: تعذر تحميل `react`.

هذه مشكلات اعتماديات البيئة وليست assertions فاشلة، لكنها تمنع اعتبار مجموعة Frontend كاملة ناجحة.

## F. المتطلبات الخارجية المتبقية

### 1. Lockfile والاعتماديات

ملف Lockfile المتاح في أرشيف V19 لا يتضمن تغييرات `npm audit fix` التي اختبرها صاحب المشروع على Windows. قبل `npm ci` في مجلد Hotfix الجديد، انسخ النسخة التي اختُبرت على جهازك:

```powershell
Copy-Item "C:\Users\omarg\Desktop\taameen\IMPO+\v18\v18 fix\TAAMEN_2_0_V18_CLOUD_SYNC_ENGINE_HOTFIX_01\package-lock.json" ".\package-lock.json" -Force
npm ci
npm audit
```

لا تشغّل `npm audit fix` عشوائيًا مرة أخرى.

### 2. Worker Preview معزول

`wrangler.jsonc` الحالي يعرّف `taamenn` في الجذر وفي `env.production`، كما أن KV binding الحالي غير مثبت أنه Namespace منفصل. لذلك لا تستخدم `wrangler secret put` أو `wrangler deploy` أو اختبار KV/AI الحي مع الإعداد الحالي. جهّز Worker Preview مستقلًا باسم ونطاق وKV منفصلين، مع D1 Preview المقصودة فقط، ولا تربط `taamenn.com` به.

### 3. متطلبات EmailJS Preview

- `AUTH_PEPPER` — Secret عشوائي قوي، 32 بايت على الأقل.
- `EMAILJS_SERVICE_ID` — خدمة EmailJS.
- `EMAILJS_AUTH_TEMPLATE_ID` — قالب OTP مخصص للمصادقة، لا قالب Contact أو AutoReply.
- `EMAILJS_PUBLIC_KEY` — المفتاح العام المطلوب من EmailJS.
- `EMAILJS_ORIGIN` — أصل HTTPS لمضيف Preview.
- `EMAILJS_PRIVATE_KEY` — Secret اختياري فقط عند تفعيل خيار Private Key في EmailJS.

قالب OTP يتلقى `to_email`, `to_name`, `otp_code`, `app_name`, و`expires_minutes`.

### 4. متطلبات Google OAuth Preview

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` (Secret)
- `GOOGLE_REDIRECT_URI` مسجل حرفيًا في Google Console وينتهي بـ`/api/auth/google/callback` على مضيف Preview المعزول.

### 5. D1

Migration 0003 و0004 موجودتان في المشروع ولم تُطبّقا عن بُعد. بعد نجاح فحوصات Windows وعزل Preview فقط، يجب أن تظهر 0003 و0004 كترحيلات معلقة، مع بقاء 0001 و0002 مطبقتين. طبّقهما بالترتيب مرة واحدة على `taamen-plans-preview` بعد التأكد من Worker/DB الهدف. لا تنفّذ هذا الآن من هذه الحزمة.

## G. الملفات والتسليم

مقارنةً بحزمة V19 Full Product Experience:

- **38 ملفًا معدّلًا**.
- **ملف جديد واحد:** `migrations/0004_account_provider_linking.sql`.
- **36 ملفًا/أصلًا محذوفًا** خاصًا بصفحة Acquisition ومكوّناتها وملحقاتها.

أبرز المسارات المعدّلة:

- `src/App.tsx`
- `src/pages/AccountHub.tsx`, `src/pages/Settings.tsx`
- `src/components/Profile.tsx`, `src/components/ShellControls.tsx`, `src/components/FirstVisitExperience.tsx`
- `src/services/cloudAuthClient.ts`
- `worker/cloudAuth.js`, `worker/cloudAuth.test.mjs`
- `src/accountExperienceV19.test.ts`, اختبارات SPA/navigation والـE2E المتبقية
- `public/sitemap.xml`, `public/sw.js`
- `scripts/qa-final.mjs`
- `README_V19_AR.md`, `docs/authentication/*`, `docs/setup/V19_PREVIEW_AUTH_CONFIGURATION_AR.md`

لم تُحذف أي بيانات مستخدم، ولم تُحذف API/Worker لخدمة مشتركة، ولم يُعدل حساب Cloudflare أو Production.
