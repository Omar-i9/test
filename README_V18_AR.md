# TAAMEN V18 — محرك المزامنة السحابية

## 1. قرار التصميم

اعتماد تخزين نصي منظم هو القرار الأنسب لبيانات TAAMEN الحالية. الملعب التكتيكي والمباريات والنتائج والأرشيف يمكن تمثيلها بوثائق JSON محدودة، ثم يعيد التطبيق تفسيرها وعرضها. لا نحتاج R2 لتخزين هذه السجلات، ولا ننشئ ملفات HTML مولدة أو صورًا للخطط في السحابة.

نطاق V18 هو تأسيس محرك المزامنة والبيانات، وليس فتح الحسابات أو تفعيل المزامنة للمستخدمين.

## 2. التسلسل المرجعي

تم بناء هذه النسخة على التسلسل التالي داخل أرشيف مشروع واحد:

1. `TAAMEN_2_0_V17_Cloud_Storage_Foundation.zip`
2. `TAAMEN_2_0_V17_HOTFIX_01.zip`
3. `TAAMEN_2_0_V17_HOTFIX_02_D1_PREVIEW_PATCH.zip`
4. تنفيذ V18 فوق الحالة الناتجة.

لا يحتاج المطور إلى تطبيق ملفات Hotfix منفصلة؛ نسخة V18 تحتوي النتيجة المدمجة. بقي `package.json` على `2.0.0`، وV18 اسم مرحلة مصدر فقط.

## 3. ما الذي تتم مزامنته؟

| البيانات | طريقة التخزين |
|---|---|
| الاسم الأول واسم العائلة | `sync_records` بنوع `profile` |
| المباريات والنتائج والأرشيف | `sync_records` بنوع `match` |
| إحصائيات المباراة ومساهمات اللاعبين والأداء الشخصي | ضمن مستند المباراة المنظم |
| الخطط التكتيكية المحفوظة | جدول V17 `tactical_plans` وواجهة `/api/plans` |
| التحليلات | تُشتق من المباريات والأرشيف؛ لا تُخزن نسخة مستقلة |
| إعدادات الجهاز والواجهة | تبقى محلية في V18 |
| محادثات المساعد | تبقى محلية؛ لا يوجد جدول أو مسار Transcript في D1 |
| الصور والملفات | خارج النطاق؛ لا R2 ولا Bucket |

الأرشيف ليس مخزنًا منفصلًا في النسخة الحالية: `matchRepository` يرحّل سجلات الأرشيف القديمة إلى `matches` ويضع `status: ARCHIVED`. لذلك مزامنة نوع `match` تشمل المباراة المؤرشفة.

### قيود الخصوصية

- سجلات `PRIVATE` تظل محلية، ويرفضها العميل وWorker.
- سجلات `legacy` لا تزامَن.
- Payload الملف الشخصي لا يقبل البريد أو الهاتف أو بيانات التحقق أو الصور.
- لا ترسل المحادثات أو سجل رسائل TAAMEN AI إلى D1. استخدام AI الحالي منفصل: قد يُرسل الطلب والسياق المحدد إلى خدمة الاستدلال كما تشرح سياسة AI الحالية، لكن V18 لا تنشئ حفظًا سحابيًا للمحادثة.
- عمليات المشاركة لا ترسل `sharedFingerprint` أو `createdBy` ضمن Payload المزامنة.
- الاسم والمباراة وبيانات اللاعبين تُعد بيانات شخصية محتملة؛ يجب أن تكون هناك موافقة سحابية منفصلة وصريحة في V19 قبل تشغيل Outbox على بيانات المستخدم.

## 4. طبقة D1 الجديدة

تضيف Migration `0002_cloud_sync_engine.sql` خمس جداول:

| الجدول | الغرض |
|---|---|
| `sync_records` | الحالة السحابية الحالية لكل سجل مملوك للحساب مع revision |
| `sync_cursor_state` | عدّاد cursor مستقل لكل حساب، حتى لا تكشف فجوات المؤشر نشاط حساب آخر |
| `sync_changes` | فهرس تغييرات مختصر ومؤشر cursor لكل سجل |
| `sync_operations` | بيانات idempotency hash ونتيجة العملية، من دون نسخ Payload |
| `sync_rate_limits` | حد طلبات المزامنة لكل حساب |

كل الجداول مرتبطة بـ`users.id` عبر Foreign Key. لا توجد ملكية يحددها المتصفح؛ Worker يجب أن يستخرج الحساب من الجلسة الموثقة مستقبلًا.

### تقليل مساحة التخزين

- تخزن المباراة/الملف كـJSON منظم محدود، وليس صورة أو HTML أو نسخة شاشة.
- الحد الداخلي لكل مستند مزامن هو 64 KiB.
- `sync_changes` يحتفظ بصف واحد فقط لكل (حساب، نوع سجل، معرف سجل)، ويُحدّث `cursor` عند التعديل. لا يحتفظ بتاريخ كل تعديل.
- `sync_operations` يحتفظ فقط بمعرّف العملية وبصمة SHA-256 والنتيجة، ويُنظف ما يتجاوز 30 يومًا عند وصول Push لاحق.
- `sync_records` يحتفظ بالحالة الحالية فقط.
- عند الحذف، يُستبدل Payload بمُعرّف السجل فقط ويُحتفظ بـTombstone لتوصيل الحذف إلى الأجهزة الأخرى. لا يُحتفظ بنص المباراة المحذوفة في هذا الجدول.
- سجلات الخطط التكتيكية موجودة في جدول مستقل من V17؛ لا نكررها داخل `sync_records`.

**ملاحظة هندسية:** Tombstones لا يمكن تنظيفها بأمان قبل وجود سجل أجهزة ومؤشرات مزامنة لكل جهاز. لذلك تبقى حتى نضيف سياسة احتفاظ/تأكيد مزامنة الأجهزة في مرحلة لاحقة.

## 5. واجهة Worker

### Push

`POST /api/sync/push`

Body:

```json
{
  "operations": [
    {
      "operationId": "stable-client-generated-id",
      "entityType": "match",
      "entityId": "LOCAL-...",
      "operation": "upsert",
      "expectedRevision": null,
      "payload": { "id": "LOCAL-..." }
    }
  ]
}
```

- الإنشاء الأول يستخدم `expectedRevision: null`.
- التعديل يشترط `expectedRevision` يساوي revision الحالي.
- الحذف يرسل `operation: delete` وrevision حاليًا، دون Payload.
- كل عملية لها `operationId` ثابت لإعادة المحاولة الآمنة.
- التعارض يرجع نتيجة `conflict` و`revision_conflict` بدل سياسة آخر كتابة تفوز بصمت.

### Pull

`GET /api/sync/pull?cursor=0&limit=100`

يرجع أحدث حالة لكل سجل تغيّر بعد المؤشر، مع `nextCursor` و`hasMore`. إذا أرسل العميل Cursor أكبر من آخر Cursor للحساب، يعيد Worker `409 cursor_ahead` لتصفير المؤشر وإعادة جلب الحالة.

### حدود الطلبات

| الحد | القيمة |
|---|---:|
| حجم HTTP body | 512 KiB |
| العمليات في Push واحد | 25 |
| حجم المستند الواحد | 64 KiB |
| حجم صفحة Pull | 100 |
| طلبات كل حساب | 60 طلبًا في نافذة دقيقة ثابتة |
| مدة الاحتفاظ ببيانات idempotency | 30 يومًا |

هذه حدود تطبيقية أولية؛ ليست ضمان تكلفة Cloudflare ولا حصة استخدام نهائية. يجب مراجعتها عند إضافة الحسابات وتشغيل اختبارات حمل واقعية.

## 6. الأمان

- `resolveAuthenticatedCloudUser` هو نقطة الهوية الوحيدة؛ لا يقبل Worker `userId` من body أو query أو header.
- resolver الحالي fail-closed ويرجع `null`، لذلك API لا يسمح بالوصول قبل V19.
- Worker يتحقق من وجود سجل حساب نشط في `users`.
- عمليات الكتابة تتطلب `Origin` مطابقًا لمصدر الطلب و`X-TAAMEN-Requested: 1`.
- لا يقبل JSON غير محدود أو Content-Type آخر؛ يوجد حد حجم حقيقي أثناء قراءة stream وليس Content-Length فقط.
- رفض المفاتيح الخطرة وحقول غير معروفة، وقوائم وأنواع وقيم غير صالحة.
- SQL يستعمل Bind Parameters، والملكية دائمًا account-scoped.
- revision Compare-and-Swap يمنع التعديل المتزامن فوق نسخة أحدث.
- Idempotency يستخدم SHA-256 على Payload canonical، ويرفض إعادة استعمال نفس المفتاح لطلب مختلف.
- حد الطلبات محفوظ في D1 لكل حساب.
- استجابات API لا تُخزن في Cache، وعميل الواجهة يرفض Redirect ويفرض `credentials: include` و`cache: no-store` و`referrerPolicy: no-referrer`.
- لا يوجد Dev Bypass. لا تستخدم LocalProfile أو البريد المحلي أو Installation ID كهوية.

## 7. حالة المصادقة والتفعيل

V18 لا تنشئ حسابات ولا جلسات ولا ترسل بريد OTP/Magic Link. لا توجد عملية Auto-Provision لحساب عند أول طلب. يجب أن تنفذ V19:

1. إثبات ملكية البريد.
2. تحديات OTP/Magic Link أحادية الاستخدام وتخزين hash فقط.
3. جلسات خادمية قصيرة/قابلة للإبطال مع Cookie آمن `HttpOnly`, `Secure`, `SameSite` وCSRF.
4. إنشاء/تحديث صف `users` الموثق.
5. موافقة منفصلة على Cloud Sync وتسجيلها على الخادم.
6. ربط الحساب بـOutbox بعد التحقق من الجلسة والموافقة.
7. ترقية بيانات Local إلى Cloud دون حذف المحلي قبل مقارنة العدد والتحقق من الاستعادة.

حتى ذلك الحين، `syncQueue` helper وعميل API غير موصولين تلقائيًا بعمليات الحفظ، وواجهات `/api/sync/*` و`/api/plans` تبقى مغلقة.

## 8. وضع Cloudflare الذي تأكد من المشغّل

- قاعدة Preview: `taamen-plans-preview`.
- `TAAMEN_DB` binding موجود في البيئة الافتراضية/Preview مع `remote: true`.
- Migration V17 `0001_create_tactical_plan_library.sql` مطبقة بالفعل، وأظهر Wrangler `No migrations to apply` بالنسبة إليها.
- الجداول المؤكدة بعد 0001: `users`, `tactical_plans`, `d1_migrations` مع الفهارس المعنية.
- V18 تضيف Migration `0002_cloud_sync_engine.sql`.
- `env.production` لا يحتوي `TAAMEN_DB` عن قصد. لا تنسخ معرّف Preview إلى Production.
- لا R2 binding، لا D1 Production، ولا نشر في هذا التسليم.

## 9. خطوات المشغّل بعد استخراج V18

أولًا شغّل التحقق المحلي على Windows وفق أوامر README. لا تنتقل للـPreview قبل نجاح `npm run typecheck` و`npm run build:production`.

بعد ذلك طبّق Migration الجديدة على Preview فقط. من جذر المشروع:

```powershell
npx wrangler d1 migrations list taamen-plans-preview --remote
npx wrangler d1 migrations apply taamen-plans-preview --remote
npx wrangler d1 migrations list taamen-plans-preview --remote
```

قبل الموافقة على التطبيق، تحقق أن Wrangler يذكر فقط `0002_cloud_sync_engine.sql` كترحيل جديد. لا تعِد تطبيق `0001` ولا تنشئ قاعدة Preview ثانية.

ثم تحقق من الجداول:

```powershell
npx wrangler d1 execute taamen-plans-preview --remote --command "SELECT name, type FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name;"
```

يُتوقع ظهور `sync_records`, `sync_cursor_state`, `sync_changes`, `sync_operations`, `sync_rate_limits` مع جداول V17. لا تنفذ `wrangler deploy`.

## 10. اختبارات V18

الاختبارات المضافة تشمل:

- D1 migration حقيقي على SQLite.
- Fail-closed للمصادقة قبل V19.
- منع Cross-Origin وغياب Origin وCSRF header.
- منع البريد والهاتف والصورة من ملف Cloud Profile.
- منع PRIVATE والـlegacy matches.
- التحقق من حد الحجم وحقول المباراة والتاريخ الحقيقي.
- revision conflicts، same-millisecond writes، idempotency وإعادة المحاولة.
- soft-delete tombstone لا يحتفظ بمحتوى المباراة.
- فصل الحسابات، Pull cursor pagination، cursor-ahead recovery.
- تنظيف metadata الأقدم من 30 يومًا وحد 60 طلبًا/دقيقة.
- Client API no-store / same-origin / no redirects.

راجع `TAAMEN_V18_QA_REPORT.md` للأرقام والاختبارات المنفذة والقيود.

## 11. ما بعد V18

- **V19:** حسابات موثقة، جلسات، موافقة مزامنة، تهيئة المستخدمين، وربط Outbox مع حفظ المباريات والملف الشخصي والخطط.
- **V20:** ترحيل محلي بموافقة صريحة، مزامنة حقيقية على جهازين، استعادة، حل التعارضات، وإطلاق تدريجي.
- قاعدة Production وبياناتها تُنشأ فقط بعد اعتماد Preview واختبارات الاستعادة والأمان. لا ينشر هذا التسليم إعداد Production.

## 12. تحديث V18 Hotfix 01 — إصلاح TypeScript

بعد أول تشغيل على Windows، نجحت اختبارات الواجهة (254/254) وBackend (27/27) وWorker (60/60) ونجح `qa:final`، لكن `typecheck` كشف تسعة أخطاء في ملفَي اختبار جديدين فقط.

Hotfix 01 يصلحها دون تغيير منطق التطبيق:

- اختبار عميل المزامنة يستخدم قائمة طلبات ملتقطة بدل متغير nullable يجري تعديله داخل callback.
- اختبارات البروتوكول تستخدم UUIDs صحيحة بدل أسماء تجريبية لا تطابق نوع UUID المستنتج من `crypto.randomUUID()`.
- لم يتم إضعاف نوع UUID في كود الإنتاج.

### ترتيب التشغيل الصحيح

نفّذ `npm run build:production` بعد نجاح `npm run typecheck`، ولا تشغّل `npm run preview` قبل اكتمال البناء. خطأ `ENOENT` السابق الخاص بـ`.wrangler/deploy/config.json` حدث بعد فشل TypeScript، لذلك لا نعدّه مشكلة مستقلة مثبتة.

راجع `V18_HOTFIX_01_REPORT.md` للتفاصيل ونتائج التحقق. لا تطبّق Migration `0002` ولا تنشر Worker قبل نجاح فحوصات Windows.
