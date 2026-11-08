# إعداد المصادقة على Preview — دون Production

هذه الخطوات توثيقية فقط. لا تنفذ أوامر إعداد الأسرار حتى تنجح اختبارات Windows والبناء، ويُراجع إعداد Wrangler وحساب Cloudflare المستهدف.

## عزل Preview إلزامي قبل إعداد الأسرار

إعداد `wrangler.jsonc` الحالي يعرّف `name: "taamenn"` على مستوى الجذر، ويعرّف `env.production.name: "taamenn"` أيضًا. لذلك **لا تستخدم `wrangler secret put` مع الإعداد الحالي ولا تضف أسرار V19 إليه**. هذا قد يضع الأسرار على Worker الموقع المنشور. قبل اختبار OAuth/OTP عن بُعد، أنشئ إعدادًا مستقلًا وWorker Preview باسم مختلف ونطاقًا منفصلًا، ثم راجع ارتباط D1 Preview وKV/AI bindings قبل أي أمر Wrangler يغيّر Cloudflare. لا تُرفق `taamenn.com` بهذا الـWorker.

## إعداد الخادم

المتغيرات التالية لا تُضاف إلى واجهة Vite ولا إلى `wrangler.jsonc`:

| الاسم | النوع | الاستخدام |
|---|---|---|
| `AUTH_PEPPER` | Secret | Pepper عشوائي لا يقل عن 32 بايت لتجزئة OTP والجلسات وOAuth state |
| `EMAILJS_SERVICE_ID` | Variable | خدمة EmailJS المسموح لها بإرسال رسائل المصادقة من Preview |
| `EMAILJS_AUTH_TEMPLATE_ID` | Variable | قالب بريد تحقق جديد مخصص لـOTP؛ منفصل عن Contact وAutoReply |
| `EMAILJS_PUBLIC_KEY` | Variable | المفتاح العام المطلوب لواجهة إرسال EmailJS من Worker |
| `GOOGLE_CLIENT_ID` | Variable | OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Secret | OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | Variable | Callback مسجل حرفيًا في Google Cloud Console |
| `EMAILJS_PRIVATE_KEY` | Secret اختياري | عند تفعيل خيار Private Key في حساب EmailJS |
| `EMAILJS_ORIGIN` | Variable | أصل HTTPS الخاص بمضيف Preview، ويجب السماح به في إعدادات EmailJS |

لا تغيّر `EMAILJS_CONTACT_TEMPLATE_ID` أو `EMAILJS_AUTOREPLY_TEMPLATE_ID`؛ تظل قوالب الدعم منفصلة.

## قالب EmailJS

أنشئ قالبًا جديدًا لا يُستخدم لرسائل الدعم. أضف متغيرات:

- `to_email`
- `to_name`
- `otp_code` (ويمكن أيضًا استخدام `verification_code`)
- `app_name`
- `expires_minutes`

يجب أن يوضح القالب أن الرمز صالح لعشر دقائق ولمرة واحدة. لا تضع OTP في رابط قابل للتسجيل أو في عنوان البريد.

## Google OAuth

أنشئ OAuth Client من نوع Web Application. سجّل Redirect URI نفسها التي ستضعها في `GOOGLE_REDIRECT_URI`، مثل:

```text
https://<preview-host>/api/auth/google/callback
```

لا تستخدم هذا المثال حرفيًا؛ استبدل `<preview-host>` بنطاق Preview الذي تملكه وتتحكم به. تسجيل دخول Google يتطلب `openid email profile` فقط. لا تُضف صلاحيات Google إضافية.

## خطوات مشغل Preview

1. جهّز أولًا Worker Preview مستقلًا باسم مختلف عن `taamenn`، ولا تضف أسرار V19 إلى إعداد Wrangler الحالي.
2. راجع `npx wrangler whoami` وتأكد من Account ID الصحيح.
3. تأكد أن إعداد Preview المستقل يربط `TAAMEN_DB` بقاعدة `taamen-plans-preview` في البيئة الافتراضية فقط.
4. بعد نجاح فحوصات Windows، اعرض قائمة migrations وتأكد أن `0003_verified_cloud_accounts.sql` و`0004_account_provider_linking.sql` هما المعلقتان فقط؛ يجب ألا تظهر 0001 أو 0002.
5. طبّق الترحيليْن 0003 ثم 0004 مرة واحدة على Preview، وتحقق بعد ذلك من عدم وجود ترحيلات معلقة. 0004 يضيف أعمدة purpose/user_id لربط تحديات البريد وOAuth بحساب الجلسة؛ لا تعدّل 0003 بأثر رجعي.
6. بعد ذلك فقط، أضف متغيرات EmailJS (`EMAILJS_SERVICE_ID`, `EMAILJS_AUTH_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_ORIGIN`) وأسرار المصادقة (`AUTH_PEPPER`, و`EMAILJS_PRIVATE_KEY` عند الحاجة) إلى Worker Preview المعزول. أضف متغيرات Google (`GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`) وSecret (`GOOGLE_CLIENT_SECRET`) عند تجهيز OAuth. استخدم لوحة Cloudflare أو `wrangler secret put` فقط بعد مراجعة الـenvironment والـWorker المقصودين.
7. أعد `GET /api/auth/config` وتأكد أنه يعرض `email: true` و/أو `google: true` فقط عند اكتمال إعداد كل المتطلبات.
8. اختبر تسجيل الدخول بالبريد وGoogle، ثم ربط بريد إضافي وGoogle بحساب قائم، ورفض OAuth، وإلغاء ربط مزوّد مع الاحتفاظ بوسيلة دخول أخرى، ثم اختبر logout/session revoke وأعد فحص الجلسة والكوكيز.

## قيود لا تتجاوزها

- لا تضف D1 Preview إلى `env.production`.
- لا تنشئ Production D1.
- لا تنفذ `wrangler deploy`.
- لا تضع أي سر في `VITE_*` أو `.env` عام أو داخل ملفات المصدر. استخدم إعداد أسرار Worker Preview المعزول فقط.
- لا تستخدم قالب الدعم أو الرد التلقائي للـOTP.
- لا ترفع بيانات محلية ولا تفعل `cloud_sync_enabled` يدويًا.
