# TAAMEN V19 — تنفيذ متطلبات تجربة المنتج والبنية السحابية

**التصنيف:** Merged Preview Candidate — غير معتمد للإنتاج  
**التاريخ:** 6 نوفمبر 2026  
**نسخة التطبيق:** `2.0.0` كما هي  
**التنفيذ:** داخل شجرة V19 المدمجة نفسها  
**GitHub / المستودعات:** لم تُستخدم  
**Cloudflare / D1 / KV / Production:** لم تُعدّل موارد بعيدة أو أسرار أو بيانات إنتاج

## 1. الخلاصة التنفيذية

تم تطبيق إصلاحات على شجرة V19 المدمجة مع الحفاظ على React + TypeScript + Vite، وIndexedDB، وWorker الحالي، وترحيلي V17/V18. النسخة الناتجة تتضمن Guest-first منفصلًا عن المصادقة، جولة حقيقية عبر صفحات المنتج، محدد اللغات السبع، اتجاه RTL/LTR، حالات اتصال TAAMEN AI، وتخطيط إعدادات عموديًا. كما تم تصحيح اختبار الخصوصية الذي كان يطلب خطأً وجود «المتابعة كزائر» داخل شاشة الحساب.

**هذه ليست نسخة إنتاج معتمدة.** الترجمة الكاملة لكل صفحات المنتج لم تكتمل للغات BETA، وTypeScript الكامل والبناء الإنتاجي وBrowser E2E لم يمكن تشغيلها بسبب عدم اكتمال تثبيت الحزم. الخدمات السحابية الحقيقية لم تُختبر عن بُعد، لأن إعداد Wrangler الحالي ليس معزولًا عن Production ولا تتوفر بيانات OTP/Google.

## 2. ما تم تطبيقه

### 2.1 نظام اللغات

- القائمة تحتوي: العربية، English، Español، Français، Deutsch، Português، Türkçe.
- أسماء اللغات مكتوبة بلغاتها الأصلية، ومن دون أعلام أو رموز دول.
- شارة `BETA` تظهر بجانب اللغات الخمس الإضافية فقط، بلون كهرماني هادئ. تم تصحيح اسم CSS من `language-beat-badge` إلى `language-beta-badge`.
- اللغة المختارة تُحفظ في `localStorage` تحت `taamen-language`، وتُحدّث `html.lang` و`html.dir` و`data-locale` دون إعادة تحميل التطبيق.
- العربية RTL، واللغات الست الأخرى LTR.
- الترحيب والجولة ذات الخطوات الثماني وتسميات التنقل والأقسام وحالات اتصال TAAMEN AI مترجمة للغات السبع.
- **غير مكتمل:** صفحات المنتج القديمة وبعض شاشات الحساب والنماذج والنصوص الداخلية ما زالت تعتمد العربية/الإنجليزية. لذلك لا تُقدَّم اللغات الخمس كترجمات كاملة؛ هذا موضح داخل محدد اللغة.

### 2.2 تجربة الزائر والمصادقة

- الزائر يدخل إلى التطبيق أولًا؛ لا يتم إنشاء حساب D1 أو ملف محلي محفوظ تلقائيًا.
- نافذة الترحيب تنتظر ظهور عنصر Home الفعلي، ولا تظهر فوق Boot/Skeleton، مع حد أقصى للمحاولات.
- الترحيب يعرض خيارين: التعرف على TAAMEN أو المتابعة كزائر.
- شاشة `AuthEntry` تعرض خيارين فقط: ملف محلي أو حساب سحابي. لا يوجد زر متابعة كزائر داخل شاشة الحساب.
- تم تصحيح نص «ثلاث طرق» إلى «خياران» وإزالة الإيحاء بأن التصفح كزائر أحد خيارات المصادقة.
- شاشة إنشاء الملف المحلي تعرض «الرجوع لاختيارات الحساب» بدل «المتابعة كزائر».
- حالة الترحيب وحالة اكتمال الجولة وموضع الجولة محفوظة بصورة مستقلة.

### 2.3 الجولة التفاعلية

تنتقل الجولة عبر ثماني صفحات/مسارات حقيقية: Home، Tactical Board، Match Center، Archive، Stadiums، Analytics، Settings، ثم TAAMEN AI. تستخدم معرّفات `data-tour` ثابتة، وتقيس العنصر الحقيقي، وتنتظر التحميل بمهلة محدودة، وتتيح السابق والتالي والتخطي والإغلاق. عند غياب الهدف لا تعلق الواجهة؛ تتجاوزه وتوضح ذلك. بطاقة الجولة تتكيف مع الهاتف وتحترم `prefers-reduced-motion`. يمكن إعادة تشغيلها من الإعدادات.

### 2.4 TAAMEN AI

- واجهة المساعد تستعمل `/api/ai/quota` و`/api/ai/chat` عبر Worker الحالي، مع CSRF وحدود الرسائل والسياق والحصة اليومية.
- حالات الواجهة تشمل الفحص، انتظار الموافقة، الحاجة لملف محلي، الجاهزية، نجاح الاتصال الفعلي، الخطأ، عدم التوفر وانتهاء المهلة.
- `Connected` لا يظهر بسبب فحص الحصة فقط؛ يظهر بعد نجاح استجابة النموذج.
- أُضيفت مهلة 15 ثانية للطلب، وتمرير locale المختار إلى Worker ضمن اللغات السبع.
- الاختبارات تستخدم Worker binding اختباريًا؛ **لم يتم إرسال سؤال إلى Cloudflare AI الحقيقي في هذه الجلسة**.

### 2.5 الإعدادات والحسابات

- مجموعة Settings عمود واحد، والكروت بعرض كامل وارتفاع طبيعي حسب المحتوى، دون مساواة الارتفاعات.
- أضيف إجراء لإعادة تشغيل الجولة من قسم المساعدة.
- صورة الملف والهاتف والتفضيلات تبقى محلية؛ اسم الحساب السحابي هو المصدر المعتمد من D1، والبريد الموثق للعرض فقط.
- الموافقة على الحساب/المزامنة لا تشغّل مزامنة المباريات. تبقى `cloud_sync_enabled` مغلقة في V19، ونقل المباريات والأرشيف بين الأجهزة عمل V20.
- Migration `0003_verified_cloud_accounts.sql` موجودة في الحزمة ولم تُطبّق على D1 عن بُعد.

## 3. حالة اللغات

| اللغة | الاسم | الاتجاه | الشارة | نطاق الترجمة المثبت |
|---|---|---|---|---|
| العربية | العربية | RTL | — | الترحيب والجولة والتنقل وحالات AI؛ بقية التطبيق العربية الأصلية |
| الإنجليزية | English | LTR | — | الترحيب والجولة والتنقل وحالات AI؛ بقية التطبيق الإنجليزية الأصلية |
| الإسبانية | Español | LTR | BETA | الترحيب والجولة والتنقل وحالات AI؛ بقية الصفحات ترجع للإنجليزية |
| الفرنسية | Français | LTR | BETA | الترحيب والجولة والتنقل وحالات AI؛ بقية الصفحات ترجع للإنجليزية |
| الألمانية | Deutsch | LTR | BETA | الترحيب والجولة والتنقل وحالات AI؛ بقية الصفحات ترجع للإنجليزية |
| البرتغالية | Português | LTR | BETA | الترحيب والجولة والتنقل وحالات AI؛ بقية الصفحات ترجع للإنجليزية |
| التركية | Türkçe | LTR | BETA | الترحيب والجولة والتنقل وحالات AI؛ بقية الصفحات ترجع للإنجليزية |

هذا يحقق القائمة والاتجاه والشارات، لكنه لا يحقق بعد شرط ترجمة كل زر ورسالة ونموذج في جميع الصفحات الإضافية. لم أضع علامة اكتمال على هذا الشرط.

## 4. تكامل الخدمات السحابية

| الخدمة | ما ثبت بالكود والاختبارات | ما لم يثبت حيًا |
|---|---|---|
| Worker | توجيه `/api/auth/*` و`/api/sync/*` و`/api/plans` و`/api/ai/*` واختبارات Worker | لم يُختبر Worker Preview منفصل على Cloudflare عن بُعد |
| KV | Worker bootstrap يتحقق من واجهة `get/put` عند تهيئة KV adapter | لم تُنفذ قراءة/كتابة فعلية؛ الـnamespace في Wrangler الحالية مشترك مع Production، والاختبار الكتابي غير آمن قبل عزله |
| AI | ربط UI/Client/Worker/AI binding والحصص واختبارات الاستجابة | لم يُنفذ inference حي؛ يتطلب Preview مستقلًا ويستهلك حصة يومية حقيقية |
| Authentication | OTP/Google/session/CSRF/PKCE واختبارات SQLite/Worker | البريد وGoogle ما زالا معطلين حتى إعداد الأسرار والقوالب على Preview مستقل |
| D1 | Migration 0003 موجودة واختبارها محليًا | لم تُطبّق عن بُعد؛ لم يُنشأ حساب حي خلال هذه الجلسة |
| Production | لا نشر ولا تغيير أسرار أو بيانات | غير مختبر ولم يتم لمسه |

### سبب إيقاف الاختبارات الحية

إعداد `wrangler.jsonc` الحالي يعرّف اسم Worker `taamenn` في الجذر وبيئة `production`، كما أن ربط KV الحالي مشترك. لذلك لم أنفذ KV writes، أو `wrangler secret put`، أو `wrangler deploy`، أو طلب inference حقيقي. يجب أولًا إعداد Worker Preview باسم مختلف، ونطاق مستقل، وKV namespace مستقل، مع إبقاء D1 Preview منفصلة عن Production.

تم تحديث `scripts/check-cloud-preview.mjs` ليمنع `taamenn.com` ويرفض أي نطاق بعيد ما لم يُعيّن المشغّل `TAAMEN_PREVIEW_CONFIRMED=ISOLATED_PREVIEW_ONLY` بعد التحقق من عزل Worker وD1 وKV. فحص `/api/health` يثبت تهيئة Worker وواجهة KV adapter لكنه لا ينفذ قراءة أو كتابة بيانات. فحص حصة AI الاختياري يحدّث سجل عداد اليوم في Durable Object، لكنه لا يحجز طلب inference. اختبار النموذج الاختياري يستهلك طلبًا يوميًا فعليًا ولا يجب تشغيله إلا بعد عزل Preview وموافقة المشغّل.

## 5. الاختبارات المنفذة

| الأمر | النتيجة |
|---|---:|
| اختبارات Guest/Auth/Onboarding/Locales/AI/Settings المركزة | **45/45 PASS** |
| `node --test worker/*.test.mjs` | **71/71 PASS** |
| `npm --prefix backend test` | **27/27 PASS** |
| مجموعة Frontend كاملة | **268/270**؛ اثنان لم يحمّلا بسبب غياب حزم React/Lucide |
| `node scripts/qa-final.mjs` | **PASS**؛ 182 مصدرًا و34 ملفًا عامًا، ولا يوجد `dist` |
| TypeScript parser عبر TypeScript 5.8.3 | **PASS**؛ 181 ملف TS/TSX دون أخطاء صياغة |
| `node --check scripts/check-cloud-preview.mjs` | **PASS** |
| `npm run typecheck` | **BLOCKED**؛ `TS2688` للحزم النوعية `node/react/react-dom` |
| `npm run build:production` | **BLOCKED** قبل Vite بسبب نفس أخطاء الأنواع |
| Browser / Playwright E2E | **NOT RUN**؛ لا يوجد Build واعتماديات متكاملة |

اختبارا Frontend غير المحمّلين:

- `src/config/routes.test.ts`: تعذّر استيراد `lucide-react`.
- `src/domain/matches/mobileProduct.test.ts`: تعذّر استيراد `react`.

محاولة `npm ci` انتهت بمهلة تنفيذ وبقي `node_modules` ناقصًا. لم أُجرِ `npm audit fix` ولم أُنشئ Lockfile يدويًا.

## 6. ملف الاعتماديات قبل Windows QA

الحزمة المتاحة تحتوي على Lockfile V18 القديم. نسخة `package-lock.json` التي حدّثتها سابقًا على Windows بعد `npm audit fix` ولم تُظهر ثغرات غير موجودة ضمن الملفات المستلمة. لذلك يجب نسخ النسخة المعروفة عندك إلى مجلد V19 المستخرج قبل `npm ci`:

```powershell
Copy-Item "C:\Users\omarg\Desktop\taameen\IMPO+\v18\v18 fix\TAAMEN_2_0_V18_CLOUD_SYNC_ENGINE_HOTFIX_01\package-lock.json" ".\package-lock.json" -Force
```

بعد النسخ:

```powershell
npm ci
npm audit
npm run typecheck
npm run test:frontend
npm run test:backend
npm run test:worker
npm run qa:final
npm run build:production
npm run qa:final
npm run preview
```

لا تستخدم `npm audit fix` عشوائيًا مرة ثانية.

## 7. الملفات الرئيسية المعدلة أو المضافة

- `src/i18n/languages.ts`, `src/i18n/localeCopy.ts`, `src/i18n/languages.test.ts`
- `src/components/ShellControls.tsx`, `src/components/FirstVisitExperience.tsx`, `src/components/FirstVisitExperience.test.ts`
- `src/components/AuthEntry.tsx`, `src/components/ProfileSetup.tsx`, `src/accountExperienceV19.test.ts`
- `src/App.tsx`, `src/App.first-visit.test.ts`
- `src/pages/Assistant.tsx`, `src/services/assistantAI.ts`, `src/services/assistantAI.test.ts`
- `worker/ai.js`, `worker/ai.test.mjs`
- `src/pages/Settings.tsx`, `src/settings.layout.test.ts`, `src/styles/global.css`, `src/styles/first-visit-experience.css`
- `scripts/qa-final.mjs`, `scripts/check-cloud-preview.mjs`
- `README_V19_AR.md`, `TAAMEN_V19_QA_REPORT.md`

## 8. تعليمات التشغيل الآمنة

هذه حزمة **V19 Merged Full-Experience Preview Candidate** لمرحلة التحقق على Windows. لا تعتبر معتمدة للإنتاج. لا تستخدم `wrangler deploy` ولا تضبط الأسرار على إعداد Wrangler الحالي ولا تطبق Migration 0003 قبل إكمال TypeScript والبناء ثم إعداد Worker Preview مستقل. لا تعِد تطبيق 0001 أو 0002، ولا تنشئ Production D1، ولا تفعّل مزامنة المباريات قبل V20.
