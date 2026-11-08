> **أرشيف تاريخي:** هذا المستند يصف V17 قبل دمج Hotfix 01 وHotfix 02. حالة قاعدة Preview الحالية موثقة في [دليل V18](docs/cloud/V18_SYNC_ENGINE_AR.md). لا تستخدم تعليمات V17 لتطبيق Migration 0001 مرة أخرى؛ المشغّل أكد أن 0001 مطبقة بالفعل.

# TAAMEN 2.0 — V17 Cloud Storage Foundation

**الأساس:** V16 Hotfix 03 الذي اختبره صاحب المشروع عملياً  
**رقم المنتج:** `2.0.0` — لم يتغير  
**وسم مرحلة التطوير:** V17  
**النشر:** لم يتم  
**إنشاء D1 أو ربطها:** لم يتم  
**الحسابات والجلسات:** مؤجلة إلى V19 حسب خارطة الطريق

## ما الذي أضافته V17؟

1. Migration جديدة باسم `migrations/0001_create_tactical_plan_library.sql` لإنشاء أساس ملكية المستخدمين ومكتبة الخطط.
2. جدول `tactical_plans` يحتفظ بوثيقة Tactical Plan Schema v1 كاملة، وليس بصورة أو ملخص أسماء.
3. خمس خانات مستقلة لكل صيغة لعب ولكل حساب: 5 خطط 5v5 + 5 خطط 7v7.
4. Worker API تحت `/api/plans` للقراءة والإنشاء والاسترجاع والتعديل وإعادة التسمية والحذف المنطقي. يمكن اختيار خانة فارغة بعينها عند الحفظ؛ وإذا امتلأت بين تحميل المكتبة وطلب الحفظ يرفض الخادم العملية بأمان.
5. واجهة المكتبة تتيح استبدال خطة محفوظة بالخطة الحالية بعد تأكيد صريح، مع الحفاظ على معرّف الخطة والخانة وزيادة revision. هذا الإجراء منفصل عن «استبدال المسودة» الذي يحمّل خطة محفوظة إلى الملعب المحلي.
6. فرض الملكية والحدود والتحقق من الخطة داخل Worker، مع `revision` لمنع الكتابة فوق تحديث أحدث.
7. مستودع واجهة `CloudTacticalPlanLibraryRepository` لا يستعمل IndexedDB كبديل صامت للمكتبة السحابية.
8. ترحيل Service Worker cache إلى V17 حتى لا تستمر نسخة قديمة من ملفات التطبيق.

## الحالة التي يجب فهمها قبل التشغيل

V17 هي أساس تخزين سحابي على مستوى المصدر والاختبارات؛ ليست مكتبة سحابية مفعّلة للمستخدمين بعد.

- لا يوجد `TAAMEN_DB` binding في `wrangler.jsonc` لأن معرّفات قواعد Preview وProduction الحقيقية لم تُنشأ ولم تُراجع.
- لم ننشئ أي قاعدة D1 ولم نطبق Migration على Cloudflare.
- `worker/planIdentity.js` يرجع `null` عمداً؛ لذلك مسارات الإنتاج ترجع `401 not_authenticated` إلى أن تنفذ V19 جلسات موثقة وآمنة.
- واجهة المكتبة تبقى مقفلة للضيف والملف المحلي. لا نستخدم LocalProfile أو البريد المحلي أو Installation ID لإثبات هوية سحابية.
- لا يوجد نشر ولا تغيير في الموقع الحي أو Worker الإنتاجي.

## التحقق على Windows

افتح PowerShell داخل مجلد المشروع:

```powershell
node -v
npm -v
npm ci
npm run typecheck
npm run test:frontend
npm run test:backend
npm run test:worker
npm run qa:final
npm run build:production
npm run preview
```

البيئة التي اجتازت اختبارات المصدر هنا هي Node 22.16.0. اختبارات SQLite تستخدم `node:sqlite`؛ قد يعرض Node تحذير Experimental، لكنه ليس فشل اختبار.

## إعداد D1 لاحقاً

اقرأ `docs/cloud/V17_D1_SETUP_AR.md` قبل إنشاء أي قاعدة. يتطلب الإعداد قاعدتين منفصلتين ومعرّفين حقيقيين: Preview وProduction. لا تضع معرّفاً وهمياً ولا تستخدم إعداد Preview في Production.

**لا تنفّذ حالياً:**

```powershell
npx wrangler d1 migrations apply taamen-plans-production --remote
npx wrangler deploy
```

تجهيز قاعدة Preview البعيدة، تطبيق migration عليها، أو أي نشر إنتاجي يحتاج مراجعة مستقلة وموافقة منفصلة بعد نجاح البناء المحلي.

## الملفات الأساسية

- `migrations/0001_create_tactical_plan_library.sql` — بنية D1 وقيودها.
- `worker/tacticalPlans.js` — API والتحقق والملكية والإصدارات.
- `worker/planIdentity.js` — نقطة ربط المصادقة المستقبلية، وتفشل مغلقاً حالياً.
- `src/services/cloudTacticalPlanLibraryRepository.ts` — مستودع الواجهة السحابية.
- `src/services/tacticalPlanLibraryRepository.ts` — عقد المستودع.
- `worker/tacticalPlans.test.mjs` — اختبارات Worker API.
- `worker/tacticalPlans.migration.test.mjs` — اختبار migration وSQL فعلياً على SQLite.
- `worker/tacticalPlans.sqlite.integration.test.mjs` — دورة حياة Worker كاملة فوق SQLite للتحقق من الملكية والخانات والمراجعات.
- `docs/releases/TAAMEN_V17_CLOUD_STORAGE_FOUNDATION.md` — نطاق الإصدار وقراراته.
- `TAAMEN_V17_QA_REPORT.md` — تقرير الجودة وحدود التحقق.
