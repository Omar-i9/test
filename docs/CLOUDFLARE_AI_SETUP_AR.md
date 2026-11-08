# إعداد TAAMEN AI على Cloudflare (V12)

هذا الدليل خاص بحزمة V12. لا تنشئ Worker جديدًا ولا تغيّر اسم Worker الحالي `taamenn`.

## ما هو موجود في المصدر

- Workers AI binding: `AI`.
- Durable Object binding: `AI_QUOTA`.
- Durable Object class: `AiDailyQuota`.
- SQLite migration: `v11-ai-quota-v1`.
- Model: `@cf/openai/gpt-oss-120b`.
- AI routes: `GET /api/ai/quota` و`POST /api/ai/chat`.
- الـAI binding مضبوط بـ`remote: true` حتى يستطيع Cloudflare Vite Preview الاتصال بخدمة Workers AI الحقيقية أثناء التطوير المحلي.

لا يوجد API key للموديل داخل الواجهة أو Worker. الربط يتم عبر `env.AI`.

## 1. تحقق من حساب Cloudflare

1. افتح حساب Cloudflare الذي يملك Worker `taamenn` والنطاق `taamenn.com`.
2. افتح **Workers & Pages** وتأكد أن Worker الحالي اسمه `taamenn`.
3. افتح **Workers AI** وتحقق أن الحساب يستطيع تنفيذ inference وأنك تراقب استهلاك Neurons.
4. لا تنشئ AI binding إضافيًا من Dashboard إذا كنت ستنشر عبر Wrangler؛ ملف `wrangler.jsonc` هو مصدر الإعداد.

## 2. تجهيز البيئة محليًا

من مجلد المشروع:

```bash
npm install vite@8.2.4 --save-exact
npm ci
npx wrangler login
npx wrangler whoami
```

تم اختيار `8.2.4` كحد أدنى مصحح ضمن سلسلة Vite 8.2؛ النسخة الحالية في ملف القفل `8.2.2` تقع ضمن نطاق الإصدارات المتأثرة بتحذيرات أكتوبر 2026. اترك npm يحدّث `package.json` و`package-lock.json` معًا، ولا تعدّل قيم integrity يدويًا.

يجب أن يظهر حساب Cloudflare الصحيح في `whoami`.

## 3. فحوصات قبل المعاينة

```bash
npm run qa:final
npm run test:worker
npm run test:backend
npm run test:frontend
npm run typecheck
```

لا تكمل للنشر إذا فشل `typecheck` أو `build:production` أو بقيت اختبارات لا تعمل بسبب اعتماديات مفقودة.

## 4. معاينة Cloudflare الحقيقية دون نشر الإنتاج

```bash
npm run build:production
npm run preview
```

`build:production` يختار بيئة `production` وقت البناء عبر `CLOUDFLARE_ENV=production`. يستخدم `npm run preview` إعداد Cloudflare الذي ولّده البناء.

مهم:
- لا تستخدم `npm run dev` للتحقق من AI؛ هذا الأمر يشغّل Vite العادي ويوجه `/api` إلى Node backend المحلي.
- `remote: true` يسمح لكود Worker المحلي في Cloudflare Vite Preview باستعمال Workers AI الحقيقي في حساب Cloudflare.
- Durable Object في المعاينة المحلية يظل محاكى محليًا؛ لا تعتبر عدادات المعاينة دليلًا على عدادات الإنتاج الدائمة.
- طلبات المعاينة تستهلك من Workers AI account usage لأنها inference حقيقية.

افتح عنوان المعاينة الذي يطبعه Vite، أنشئ ملف TAAMEN محليًا، وافتح مساعد TAAMEN ووافق صراحة على AI، ثم أرسل سؤالًا بسيطًا. افحص أيضًا `GET /api/ai/quota` وتأكد من ظهور رصيد الاستخدام.

## 5. النشر الإنتاجي — بعد اعتماد الاختبارات والمعاينة فقط

بعد مراجعة أن إعداد الإنتاج هو المقصود وأن Worker الموجود هو `taamenn`:

```bash
npm run build:production
npx wrangler deploy
```

مع Cloudflare Vite plugin، يتم اختيار البيئة وقت البناء؛ لا تضف `--env production` بعد بناء Vite المستهدف للإنتاج. راجع ملف Wrangler الناتج في مجلد build قبل النشر، وتحقق أن الاسم `taamenn` وأن AI وAI_QUOTA وKV وCron موجودة.

نشر `AiDailyQuota` يطبق Durable Object migration الموجودة `v11-ai-quota-v1` إذا لم تكن قد طُبّقت على Worker المستهدف. لا تغيّر tag ولا تعِد إنشاء فئة أخرى. راجع سجل النشر ورسالة نجاح الـmigration.

## 6. التحقق بعد النشر

1. افتح `https://taamenn.com` ثم صفحة مساعد TAAMEN.
2. وافق على تفعيل AI وأرسل سؤال اختبار.
3. تأكد من وصول الإجابة وظهور quota.
4. في Cloudflare افتح Worker `taamenn` ثم Logs/Observability وابحث عن أخطاء `/api/ai/chat`.
5. افتح Workers AI usage وراقب Neurons.

لا تختبر عن طريق كشف API key في المتصفح؛ هذا المشروع لا يحتاج مفتاح مزود من المتصفح.

## التكلفة والحصص

حدود التطبيق الحالية هي 10 طلبات ناجحة لكل تثبيت يوميًا و18 طلبًا ناجحًا للموقع يوميًا. هذه حدود داخل كود TAAMEN وليست سقف فوترة مضمونًا؛ الاستهلاك الحقيقي يعتمد على عدد الرموز. وفق تسعير Cloudflare المنشور في أكتوبر 2026، يوجد تخصيص مجاني مشترك للحساب قدره 10,000 Neurons يوميًا، وبعده تتوقف الطلبات على Workers Free، بينما خطة Workers Paid تحاسب الاستخدام فوق التخصيص بمعدل 0.011 دولار لكل 1,000 Neurons. سعر نموذج GPT-OSS 120B المعروض هو 0.35 دولار لكل مليون رمز إدخال و0.75 دولار لكل مليون رمز إخراج. راقب صفحة Workers AI Usage/Pricing قبل فتح الخدمة للمستخدمين.

المراجع الرسمية: https://developers.cloudflare.com/workers-ai/platform/pricing/ وhttps://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/

## حالة النسخة عند التسليم

إعداد AI وDurable Object موجودان في V12، لكن لم يتم تسجيل الدخول إلى حساب Cloudflare أو تشغيل inference حقيقي أو نشر Worker الإنتاج من جلسة بناء الحزمة. لا تصف AI بأنه يعمل على `taamenn.com` قبل إكمال المعاينة والاختبار والنشر الفعلي.
