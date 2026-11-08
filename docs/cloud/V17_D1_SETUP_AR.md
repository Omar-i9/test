> **مستند تاريخي لـV17:** تم تأكيد إنشاء `taamen-plans-preview` وتطبيق `0001_create_tactical_plan_library.sql` بالفعل. لا تُعد تطبيق 0001. تعليمات V18 المحدثة لتطبيق 0002 فقط موجودة في [V18 Sync Engine](V18_SYNC_ENGINE_AR.md).

# TAAMEN V17 — ربط D1 للـPreview

## نتيجة إنشاء قاعدة Preview

تم إنشاء قاعدة D1 من حساب Cloudflare:

- الاسم: `taamen-plans-preview`
- المعرّف: `6ba51e17-9844-4161-acf2-faa8122bf7c5`
- المنطقة التي أعادها Wrangler: `EEUR`
- الـbinding المطلوب في Worker: `TAAMEN_DB`

هذا التعديل يضيف القاعدة إلى المستوى الأعلى من `wrangler.jsonc` كـ **Remote Binding** للـPreview المحلي. Worker نفسه يظل يعمل محليًا عبر Cloudflare Vite Plugin، لكن استعلامات `env.TAAMEN_DB` تصل إلى قاعدة Preview البعيدة. هذا لا ينشر Worker ولا يربط النطاق بالموقع.

## ماذا تغير في الإعداد؟

أضيف في `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "TAAMEN_DB",
    "database_name": "taamen-plans-preview",
    "database_id": "6ba51e17-9844-4161-acf2-faa8122bf7c5",
    "migrations_dir": "migrations",
    "remote": true
  }
]
```

لم يتغير ربط AI أو Durable Object الخاص بحصة AI أو KV أو الأسرار أو إعدادات الإنتاج. بيئة `env.production` لا تحتوي على `TAAMEN_DB`؛ لذلك لا يتم استخدام قاعدة Preview في إعداد الإنتاج. لا تضف معرّف Preview إلى `env.production`.

## الخطوة التالية — تطبيق migration على قاعدة Preview البعيدة

من جذر مجلد المشروع في PowerShell، شغّل الأمر الأول لمراجعة حالة migrations:

```powershell
npx wrangler d1 migrations list taamen-plans-preview --remote
```

إذا ظهر أن `0001_create_tactical_plan_library.sql` غير مطبّق، طبّقه على قاعدة Preview فقط:

```powershell
npx wrangler d1 migrations apply taamen-plans-preview --remote
```

راجع النتيجة بعد التطبيق:

```powershell
npx wrangler d1 migrations list taamen-plans-preview --remote
npx wrangler d1 execute taamen-plans-preview --remote --command "SELECT name, type FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name;"
```

المتوقع وجود الجداول `users` و`tactical_plans` و`d1_migrations`، بالإضافة إلى الفهارس الخاصة بملكية الخطط والخانات النشطة. أمر `migrations apply` يطلب تأكيدًا قبل التنفيذ في الطرفية التفاعلية، وتوثيق Cloudflare يذكر أنه يلتقط نسخة احتياطية بعد التطبيق الناجح.

**مهم:** استخدم `--remote` هنا عمدًا؛ لا تستخدم `--local`، ولا تستخدم `--env production`، ولا تنفّذ `wrangler deploy` كجزء من خطوة V17 هذه.

## اختبار ربط Vite المحلي

بعد نجاح migration:

```powershell
npm run build
npm run preview
```

هذا يشغّل Worker محليًا مع Remote D1 binding. لا يعني نجاح `npm run preview` أن تسجيل الحسابات أو مكتبة الخطط أصبحت متاحة للمستخدمين.

## حدود V17 التي تبقى كما هي

- `worker/planIdentity.js` ما زال fail-closed ويعيد `null`؛ لذلك مسارات `/api/plans` ترجع `401 not_authenticated` إلى أن تنفذ جلسات الحساب الموثقة في V19.
- لا توجد شاشة دخول أو إنشاء حساب سحابي بالبريد في هذه المرحلة؛ الموجود في الواجهة هو إعداد ملف محلي فقط.
- لا تستخدم البريد الاختياري للملف، أو `LocalProfile`، أو installation ID، أو أي قيمة من جسم الطلب كهوية حساب.
- لا تضف `X-User-Id` أو dev bypass لفتح API.
- قاعدة Production لم تُنشأ ولم تُربط ولم تُطبّق عليها migrations.

## بنية migration

`migrations/0001_create_tactical_plan_library.sql` تنشئ مرساة `users` وجدول `tactical_plans` مع:

- فصل الخطط حسب `5v5` و`7v7`.
- خمس خانات نشطة لكل تنسيق ولكل مستخدم.
- فحص Schema v1 وصحة JSON وتطابق هوية الخطة وتنسيقها وعنوانها.
- حد حجم payload يساوي 256 KiB.
- FK من `tactical_plans.user_id` إلى `users.id`.
- revision لمنع الكتابة فوق نسخة أحدث دون اكتشاف التعارض.
- soft delete مع الاحتفاظ بسجل الحذف وتحرير الخانة النشطة.

عند V19، وسّع جدول `users` نفسه عبر migration جديدة؛ لا تنشئ جدول users ثانيًا ولا تحذف هذا الجدول.
