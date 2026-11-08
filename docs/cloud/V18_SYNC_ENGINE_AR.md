# TAAMEN V18 — مواصفات محرك المزامنة السحابية

هذا المستند هو المرجع التقني التفصيلي لـV18. عند التعارض مع مستندات V17 التاريخية، تُقرأ V17 باعتبارها سجلًا لمرحلتها فقط، وتُعتمد حالة V18 الموضحة هنا للملفات الحالية.

## الهدف

إضافة بنية قابلة للاختبار لمزامنة سجلات TAAMEN النصية المنظمة بين IndexedDB وCloudflare D1 بعد أن تنفذ V19 الحسابات الموثقة. لا تفتح V18 المزامنة أمام المستخدم ولا تغير تجربة Local Profile الحالية.

## نموذج البيانات والنطاق

### مزامن الآن

- `profile`: الاسم الأول واسم العائلة فقط. معرف السجل الثابت `current`.
- `match`: كيان المباراة الموحد، ويشمل `UPCOMING`, `ACTIVE`, `COMPLETED_PENDING_RESULT`, `COMPLETED_WITH_RESULT`, و`ARCHIVED` مع تفاصيل النتائج والإحصائيات والأداء الشخصي المسموح به.

تُخزن المباريات المؤرشفة في IndexedDB ضمن `matches` بعد ترحيل سجلات `archive` القديمة بواسطة `matchRepository`. لذلك لا توجد مزامنة مستقلة لمخزن archive؛ الحالة `ARCHIVED` هي جزء من نفس كيان المباراة.

### موجود مسبقًا ولا يتكرر

- `tactical_plans`: مكتبة الخطط التي تأسست في V17، مع 5 خانات لكل من 5v5 و7v7، وواجهات `/api/plans`، ومراجعات مستقلة.
- التحليلات تُشتق من السجلات المؤرشفة/النتائج؛ لا نخزن مؤشرات تحليلية قابلة لإعادة الحساب.

### يبقى محليًا أو خارج النطاق

- مباريات `PRIVATE` محلية فقط؛ يرفضها `buildCloudMatchPayload` وWorker.
- سجلات `legacy` أو الحالات القديمة غير المطَبّعة لا تُزامن.
- محادثات AI لا ترفع إلى D1، ولا توجد جداول Transcript أو Cloud Conversation.
- إعدادات كل جهاز، تفضيلات الواجهة، الإشعارات، المسودات المؤقتة، وصور الملف الشخصي تبقى محلية في هذه المرحلة.
- البريد والهاتف والتحقق لا يدخلون Payload الملف الشخصي.
- لا R2 ولا ملفات/صور/لقطات شاشة في D1.

## Migration 0002

الملف: `migrations/0002_cloud_sync_engine.sql`.

### `sync_records`

المفتاح الأساسي `(user_id, entity_type, entity_id)`. يحمل وثيقة JSON الحالية، revision، وقت الإنشاء/التحديث، ومعلومات آخر عملية. كل صف يتبع `users.id` عبر Foreign Key.

- entity types المسموح بها: `profile`, `match` فقط.
- حجم Payload لا يتجاوز 65,536 بايت UTF-8.
- JSON يجب أن يكون صالحًا وجذر الوثيقة Object.
- profile ID الوحيد `current`.
- ID المباراة داخل JSON يجب أن يساوي `entity_id`.

### `sync_changes`

كل حساب لديه تسلسل Cursor مستقل؛ لا تكشف الفجوات نشاط حساب آخر. هذا **فهرس حالة تغيّر مختصر** وليس Event Log تاريخيًا. يوجد صف واحد لكل `(user_id, entity_type, entity_id)`. عند كل تحديث ناجح يُمنح الصف Cursor جديدًا ويُحدّث رقم المراجعة ونوع العملية. بهذه الطريقة لا ينمو جدول التغييرات بعدد مرات تعديل المستخدم لنفس السجل.

هذا التصميم يسمح للعميل القديم بقراءة آخر نسخة من السجل طالما مؤشره السابق أقل من Cursor الجديد. لا ينظف Tombstones تلقائيًا؛ يلزم تتبع آخر Cursor لكل جهاز قبل حذفها بأمان.

### `sync_operations`

بيانات idempotency فقط: hash الطلب ونتيجة موجزة، لا نسخة من Payload المباراة. تنظف السجلات التي مرّ عليها 30 يومًا عند أول Push لاحق من المستخدم. ويحتفظ سجل `sync_records` ببصمة آخر عملية لتمكين replay آمن إذا انتهت نافذة metadata وما زالت العملية هي آخر تعديل للسجل.

### `sync_rate_limits`

سجل واحد لكل حساب لتطبيق نافذة دقيقة ثابتة لا تتجاوز 60 طلب مزامنة/دقيقة. هذا حد تطبيقي أولي وليس سقف فوترة أو ضمانًا من Cloudflare.

## API Contracts

### `POST /api/sync/push`

يتطلب JSON body بالشكل `{ "operations": [...] }`. العدد 1–25.

كل عملية تحتوي:

- `operationId`: معرف ثابت عشوائي آمن، 8–120 محرفًا.
- `entityType`: `profile` أو `match`.
- `entityId`: معرف السجل.
- `operation`: `upsert` أو `delete`.
- `expectedRevision`: `null` عند الإنشاء، أو رقم صحيح موجب عند تعديل/حذف سجل موجود.
- `payload`: مطلوب للـupsert فقط.

الإنشاء الأول Revision 1. التعديل يقارن revision قبل الكتابة. التعارض يرجع `status: conflict` مع `code: revision_conflict` ولا يستخدم Last-Write-Wins.

### `GET /api/sync/pull?cursor=N&limit=N`

`cursor` عدد صحيح آمن غير سالب، والحد الافتراضي 100، والحد الأقصى 100. النتائج account-scoped. كل تغيير يرسل آخر حالة سجل. الحذف يرسل Tombstone دون Payload. إذا cursor أعلى من أحدث مؤشر للحساب، يرجع `409 cursor_ahead`.

## حدود الموارد

- Request body: 512 KiB.
- كل Record: 64 KiB.
- عمليات Push: 25.
- Pull page: 100.
- Sync requests: 60 لكل حساب في نافذة دقيقة ثابتة.
- Idempotency metadata: 30 يومًا.

تظل هذه القيم حدود تطبيق V18، ويجب إجراء قياس حمل وتكلفة حقيقي قبل فتح التسجيل أو توسيع الحصص.

## هوية الحساب والأمان

`worker/planIdentity.js` يظل مصدر الهوية. في V18 يرجع `null` عمدًا. `worker/syncEngine.js` لا يقرأ هوية من العميل مطلقًا؛ يتطلب كائنًا من `resolveAuthenticatedCloudUser` ثم يتحقق من صف `users` وحالته.

ضوابط الطلب:

1. المسارات المسموحة فقط `/api/sync/push` و`/api/sync/pull`.
2. Origin مطلوب لعمليات الكتابة ويجب مطابقته مع أصل عنوان الطلب.
3. `X-TAAMEN-Requested: 1` مطلوب للكتابة.
4. رفض cross-site `Sec-Fetch-Site` إذا كان خارج `same-origin`, `same-site`, `none`.
5. JSON UTF-8 bounded stream مع حد حقيقي أثناء القراءة.
6. رفض الخصائص الخطرة (`__proto__`, `prototype`, `constructor`) وتحديد عمق وعدد عناصر الشجرة.
7. رفض الحقول غير المعروفة، والقيم/الأنواع/التواريخ غير الصحيحة.
8. SQL parameter binding، وForeign Keys، وaccount scoping لكل قراءة وكتابة.
9. SHA-256 canonical request hash، وIdempotency Key لا يمكن إعادة استخدامه لطلب مختلف.
10. Revision CAS، وsoft delete، وتفريغ محتوى Payload عند الحذف.
11. `Cache-Control: no-store` على استجابات API. لا تخزن Service Worker طلبات `/api/`.

لا يكفي إخفاء زر في الواجهة. لا تفتح `cloudAccountReady` ولا تضف dev identity ولا تسمح بقيمة `userId` من المتصفح.

## العميل المحلي

- `cloudSyncProtocol.ts`: يبني Payload محدودًا للملف الشخصي والمباريات، ويرفض Private وLegacy.
- `cloudSyncClient.ts`: واجهة Push/Pull، cookies same-origin، no-store، no redirects، CSRF header، والتحقق من شكل الرد.
- `cloudSyncOutbox.ts`: يستخدم `syncQueue` المحلي ويقسم العناصر بحسب `accountScope`. هذه القيمة ليست إثبات هوية ولا يثق بها Worker.

لم يتم ربط هذه الخدمات تلقائيًا بعمليات الحفظ في `matchRepository` أو واجهة الملف الشخصي. الربط ينتظر V19: جلسة موثقة + موافقة صريحة على نقل البيانات + آلية حساب/مراجعة صحيحة.

## اختبار D1 Preview

قاعدة Preview التي أكدها المشغّل:

- الاسم `taamen-plans-preview`.
- Binding `TAAMEN_DB` في الإعداد الافتراضي/Preview.
- Migration `0001` مطبقة بالفعل.

بعد نجاح الاختبارات المحلية، يُطبّق `0002` فقط:

```powershell
npx wrangler d1 migrations list taamen-plans-preview --remote
npx wrangler d1 migrations apply taamen-plans-preview --remote
npx wrangler d1 migrations list taamen-plans-preview --remote
```

قبل الموافقة على الأمر، تأكد أن Migration الوحيدة الجديدة المعروضة هي `0002_cloud_sync_engine.sql`. ثم تحقق:

```powershell
npx wrangler d1 execute taamen-plans-preview --remote --command "SELECT name, type FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name;"
```

الجداول الجديدة المتوقعة: `sync_records`, `sync_cursor_state`, `sync_changes`, `sync_operations`, `sync_rate_limits`.

لا تنشئ قاعدة Production ولا تضف D1 إلى `env.production` ولا تنفذ Deploy في هذا الإصدار.
