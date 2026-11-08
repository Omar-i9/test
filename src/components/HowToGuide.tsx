import { useEffect, useState } from 'react';
import {
  Archive, ArrowLeft, ArrowRight, Bell, BookOpen, ClipboardList, Home, Goal,
  LifeBuoy, Settings, Share2, UserRound, X, Bot, ChartLine, Swords, type LucideIcon,
} from 'lucide-react';
import type { Language } from '../i18n/translations';
import '../styles/usage-guide.css';

type Copy = { ar: string; en: string };

interface GuideSection {
  id: string;
  icon: LucideIcon;
  title: Copy;
  purpose: Copy;
  what: Copy;
  steps: { ar: string[]; en: string[] };
  example: Copy;
  tip?: Copy;
}

const sections: GuideSection[] = [
  {
    id: 'welcome',
    icon: BookOpen,
    title: { ar: 'ما هو TAAMEN؟', en: 'What is TAAMEN?' },
    purpose: { ar: 'مساحة عمل للمباراة على هذا الجهاز.', en: 'A match workspace on this device.' },
    what: {
      ar: 'TAAMEN ينظّم مباريات كرة القدم وكرة الصالات: الموعد، الملعب، النتيجة، والسجل. الملف والبيانات تبقى على جهازك ما لم تختر مشاركتها.',
      en: 'TAAMEN organizes football and futsal matches: kickoff, venue, result, and history. Your profile and data stay on this device unless you choose to share them.',
    },
    steps: {
      ar: ['فكّر في TAAMEN كمساحة رقمية لفريقك.', 'الرئيسية تلخّص ما هو قريب.', 'مركز المباريات والسجل والملاعب والملف والإعدادات والدعم هي الوجهات اليومية.'],
      en: ['Think of TAAMEN as your team’s digital match workspace.', 'Home summarizes what is nearby.', 'Match Center, Archive, Stadiums, Profile, Settings, and Support are the daily destinations.'],
    },
    example: {
      ar: 'مثال مباراة: الفريق أ × الفريق ب، الجمعة 19:00، مباراة عادية، ملعب. مثال سجل: ريال مدريد 3 × 2 برشلونة، نتيجة مسجّلة ومؤرشفة.',
      en: 'Team A × Team B, Friday 19:00, normal match, stadium. Real Madrid 3 × 2 Barcelona, recorded, archived.',
    },
  },
  {
    id: 'start',
    icon: UserRound,
    title: { ar: 'البداية', en: 'Getting started' },
    purpose: { ar: 'ملف محلي، بلا حساب سحابي.', en: 'A local profile, not a cloud account.' },
    what: {
      ar: 'الاسم الأول مطلوب. اسم العائلة والبريد والهاتف والصورة اختيارية. الموافقة على الخصوصية مطلوبة للمتابعة. بعدها تفتح الرئيسية.',
      en: 'First name is required. Family name, email, phone, and photo are optional. Privacy consent is required to continue. Home opens after that.',
    },
    steps: {
      ar: ['اكتب الاسم الأول.', 'أضف البريد فقط إذا أردت أن تُستخدم رسائل الدعم منه.', 'وافق على الخصوصية ثم تابع.', 'من الرئيسية راجع البطاقات وأحدث المباريات.'],
      en: ['Enter your first name.', 'Add email only if Support should use it.', 'Accept privacy, then continue.', 'On Home, review the cards and the latest matches.'],
    },
    example: {
      ar: 'يوسف ينشئ ملفًا باسمه فقط. لاحقًا يضيف صورة من الملف الشخصي عندما يريد مشاركة نسخة عامة.',
      en: 'Yousef creates a profile with only his first name. Later he adds a photo from Profile when he wants a public share.',
    },
    tip: { ar: 'البريد والهاتف لا يظهران في المشاركة العامة.', en: 'Email and phone never appear in a public share.' },
  },
  {
    id: 'home',
    icon: Home,
    title: { ar: 'الرئيسية', en: 'Home' },
    purpose: { ar: 'ملخص سريع، لا لوحة تحكم معقّدة.', en: 'A short summary, not a dense dashboard.' },
    what: {
      ar: 'تظهر بطاقة إحصائية واحدة تتبدّل عشوائيًا بين السجل والمواجهات الحاسمة والتعادلات عند دخول الرئيسية، وبجانبها اختصارات الملاعب والملعب التكتيكي والتحليلات، ثم أحدث المباريات.',
      en: 'One summary card randomly rotates between archive, decided matches, and draws when Home is entered. Stadiums, Tactical Board, and Analytics appear as separate shortcuts, followed by the latest matches.',
    },
    steps: {
      ar: ['راجع البطاقة المتبدّلة لمعرفة الإحصائية المعروضة في هذه الزيارة.', 'استخدم اختصار الملاعب أو الملعب التكتيكي أو التحليلات.', 'من «أحدث المواجهات» افتح مباراة أو اعرض الكل.'],
      en: ['Check the rotating card to see which metric is displayed in this visit.', 'Use the Stadiums, Tactical Board, or Analytics shortcut.', 'From Latest matches, open one match or view all.'],
    },
    example: {
      ar: 'قبل المباراة: الرئيسية ← تأكيد أن السجل محدّث ← الملاعب للتأكد من المكان ← مركز المباريات للتفاصيل.',
      en: 'Before kickoff: Home, confirm the archive looks current, check Stadiums for the place, then open Match Center for the details.',
    },
  },
  {
    id: 'matches',
    icon: ClipboardList,
    title: { ar: 'مركز المباريات', en: 'Match Center' },
    purpose: { ar: 'إنشاء المباراة ومتابعتها حتى تُسجَّل.', en: 'Create a match and follow it until the result is recorded.' },
    what: {
      ar: 'المباراة تحمل الفريقين والموعد والملعب والنوع. تمر بحالات: قادمة، نشطة، انتهت والنتيجة معلّقة، ثم النتيجة مسجّلة. المشاركة متاحة عندما تسمح إعدادات المباراة.',
      en: 'A match holds both teams, kickoff, stadium, and type. It moves through upcoming, active, finished with the result still pending, then result recorded. Sharing is available when the match allows it.',
    },
    steps: {
      ar: ['أنشئ مباراة بالفريقين والموعد والملعب.', 'قبل الانطلاق راجع الوقت والمكان.', 'عند الانتهاء أدخل النتيجة.', 'بعدها تظهر في السجل كنتيجة مسجّلة.'],
      en: ['Create a match with both teams, kickoff, and stadium.', 'Before kickoff, review the time and place.', 'When it ends, enter the result.', 'It then belongs in the archive as a recorded result.'],
    },
    example: {
      ar: 'الفريق أ × الفريق ب، الجمعة 19:00، مباراة عادية، ملعب. تنشئها من مركز المباريات، تتابعها وهي قادمة ثم نشطة، ثم تدخل النتيجة حتى لا تبقى معلّقة.',
      en: 'Team A × Team B, Friday 19:00, normal match, stadium. You create it in Match Center, follow it while it is upcoming and then live, and enter the score so it does not stay pending.',
    },
    tip: { ar: 'النتيجة المعلّقة ليست ضياعًا للمباراة. هي تذكير بإدخال الرقم النهائي.', en: 'A pending result is not a lost match. It is a reminder to enter the final score.' },
  },
  {
    id: 'archive',
    icon: Archive,
    title: { ar: 'السجل', en: 'Archive' },
    purpose: { ar: 'المباريات المكتملة في مكان واحد.', en: 'Completed matches in one place.' },
    what: {
      ar: 'السجل يعرض ما أنشأته أو استوردته على هذا الجهاز. البحث بالفريق أو الملعب، والتصفية بالنوع. قسم «انتهت — النتيجة معلّقة» يُغلق إذا لم يوجد شيء، ويفتح إذا بقيت نتيجة بلا إدخال.',
      en: 'Archive shows matches you created or imported on this device. Search by team or stadium, and filter by type. “Finished — result pending” stays closed when nothing is waiting, and opens when a score still needs to be entered.',
    },
    steps: {
      ar: ['ابحث عن الفريق أو الملعب.', 'إذا ظهر عدّاد في قسم النتيجة المعلّقة، افتحه.', 'اضغط «إدخال النتيجة» وسجّل الرقمين.', 'بعد الحفظ تنتقل المباراة إلى النتائج المسجّلة.'],
      en: ['Search for the team or stadium.', 'If the pending-result section shows a count, open it.', 'Choose Enter result and record both scores.', 'After saving, the match moves to recorded results.'],
    },
    example: {
      ar: 'ريال مدريد 3 × 2 برشلونة، نتيجة مسجّلة ومؤرشفة. البحث بالفريق يجدها. إذا انتهت مباراة بلا رقم تبقى تحت «النتيجة معلّقة» حتى تدخل النتيجة.',
      en: 'Real Madrid 3 × 2 Barcelona, recorded, archived. Search by team finds that completed result. A match that ended without a score stays under Finished — result pending until you enter one.',
    },
    tip: { ar: 'إذا أغلقت القسم بنفسك يبقى مغلقًا في هذه الزيارة.', en: 'If you close that section yourself, it stays closed for this visit.' },
  },
  {
    id: 'stadiums',
    icon: Goal,
    title: { ar: 'الملاعب', en: 'Stadiums' },
    purpose: { ar: 'أماكن اللعب المعروفة، بلا إعادة كتابة كل مرة.', en: 'Known places to play, without retyping them.' },
    what: {
      ar: 'قائمة ملاعب بأسماء ومدن. عند التوسيع ترى العنوان والوصف ورقم التواصل إن وُجد، ويمكن فتح واتساب لصاحب الملعب. إذا لم تجد ملعبك، صفحة الدعم هي طريق الإضافة.',
      en: 'A list of stadiums with names and cities. Expand one to see the address, description, and phone when they exist, and open WhatsApp for that venue. If your place is missing, Support is how you ask for it.',
    },
    steps: {
      ar: ['ابحث بالمدينة أو اسم الملعب.', 'وسّع البطاقة لقراءة المكان.', 'استخدم الاسم نفسه عند إنشاء المباراة.', 'إن غاب الملعب، اكتب للدعم باسمه وعنوانه.'],
      en: ['Search by city or stadium name.', 'Expand the card to read the place.', 'Use that same name when you create the match.', 'If the venue is missing, tell Support its name and address.'],
    },
    example: {
      ar: 'تلعب عادة في ملعبين في الخليل. قبل إنشاء مباراة الجمعة تبحث عن الملعب، تتأكد من العنوان، ثم تكتبه في مركز المباريات.',
      en: 'You usually play at two places in Hebron. Before creating Friday’s match you search the stadium, confirm the address, then enter it in Match Center.',
    },
  },
  {
    id: 'tactical',
    icon: Swords,
    title: { ar: 'الملعب التكتيكي', en: 'Tactical Board' },
    purpose: { ar: 'خطّط للتحرك والتمركز قبل المباراة.', en: 'Plan positioning and movement before kickoff.' },
    what: {
      ar: 'مساحة تكتيكية محلية لرسم التشكيلة وتحديد أماكن اللاعبين ومسارات الحركة والضغط والتمرير. اختر حجم الفريق والتشكيلة، ثم استخدم أدوات الرسم لشرح الفكرة. الخطط تبقى ضمن بيانات هذا الجهاز ما لم تصدّر صورة منها.',
      en: 'A local tactics workspace for arranging players and drawing movement, pressing, and passing routes. Choose the team size and formation, then use the drawing tools to explain the plan. Plans remain in this device’s data unless you export an image.',
    },
    steps: {
      ar: ['اختر عدد اللاعبين والتشكيلة المناسبة.', 'ضع اللاعبين في مواقعهم على أرضية الملعب.', 'ارسم مسارات الجري أو التمرير أو الضغط، ثم احفظ الخطة أو صدّرها كصورة.'],
      en: ['Choose the team size and a suitable formation.', 'Place players in their positions on the pitch.', 'Draw runs, passes, or pressing routes, then save the plan or export it as an image.'],
    },
    example: {
      ar: 'في خطة 5 ضد 5، ضع لاعب ارتكاز خلف لاعبي الوسط، ثم ارسم سهمًا لتحرك الجناح نحو المساحة قبل التمرير.',
      en: 'In a 5-a-side plan, place a pivot behind the midfielders, then draw a winger’s run into space before the pass.',
    },
    tip: { ar: 'السهم يوضح اتجاه الحركة؛ لا يعني أن اللاعب نفّذ الحركة فعليًا داخل المباراة.', en: 'An arrow describes an intended movement; it does not mean the player actually made that run in a match.' },
  },
  {
    id: 'analytics',
    icon: ChartLine,
    title: { ar: 'التحليلات', en: 'Analytics' },
    purpose: { ar: 'حوّل النتائج والإحصائيات التي تدخلها إلى مؤشرات مفهومة.', en: 'Turn the results and statistics you enter into readable indicators.' },
    what: {
      ar: 'تعرض الصفحة اتجاهات مبنية على المباريات المسجّلة والإحصائيات التي أدخلتها، مثل الأهداف والمساهمات والنتائج. دقتها تعتمد على اكتمال البيانات وصحتها؛ ليست قياسًا تلقائيًا للأداء ولا تجمع بيانات حسية من الهاتف.',
      en: 'The page presents trends based on recorded matches and the statistics you enter, such as goals, contributions, and results. Accuracy depends on complete and correct input; it is not automatic performance tracking and does not collect sensor data from your phone.',
    },
    steps: {
      ar: ['سجّل نتيجة المباراة بعد انتهائها.', 'أضف إحصائيات اللاعبين المتاحة مثل الأهداف والتمريرات الحاسمة.', 'افتح التحليلات وغيّر الفترة أو نوع المؤشر لمقارنة الاتجاهات.'],
      en: ['Record the match result after it ends.', 'Add available player statistics such as goals and assists.', 'Open Analytics and change the period or metric to compare trends.'],
    },
    example: {
      ar: 'بعد تسجيل عدة مباريات وإضافة أهدافك وتمريراتك الحاسمة، راجع تطوّر مساهماتك خلال آخر خمس مباريات بدل الحكم من مباراة واحدة.',
      en: 'After recording several matches and adding your goals and assists, review your contributions across the last five matches instead of judging from one game.',
    },
  },
  {
    id: 'assistant',
    icon: Bot,
    title: { ar: 'TAAMEN AI', en: 'TAAMEN AI' },
    purpose: { ar: 'مساعد اختياري بذاكرة محادثة محلية.', en: 'An optional assistant with local conversation memory.' },
    what: {
      ar: 'يمكنك تفعيل TAAMEN AI اختياريًا بعد إنشاء ملف محلي والموافقة على إرسال السؤال والسياق المحدد إلى Cloudflare Workers AI. يستخدم المساعد اسم العرض، وآخر ست رسائل، ومجاميع إحصائية، وتفاصيل ما يصل إلى ثماني مباريات مكتملة حديثة. لا يُرسل البريد أو الهاتف أو الصور أو قاعدة البيانات كاملة. تبقى المحادثة محفوظة في IndexedDB بحد أقصى 80 رسالة. يمكنك إيقاف الإرسال لاحقًا مع الاحتفاظ بسجل المحادثة.',
      en: 'You can optionally enable TAAMEN AI after creating a local profile and consenting to send your question and selected context to Cloudflare Workers AI. It receives your display name, up to six recent messages, aggregate statistics, and details from up to eight recent completed matches. Email, phone, photos, and the full database are not sent. The conversation remains in IndexedDB, capped at 80 messages. You can stop future AI requests while keeping the local conversation.',
    },
    steps: {
      ar: ['أنشئ ملف TAAMEN المحلي واقرأ إشعار الموافقة ثم فعّل المساعد إذا رغبت.', 'اسأل عن كرة القدم أو بياناتك المسجلة أو طريقة استخدام TAAMEN.', 'راجع الإجابة لأن المحتوى مولّد وقد يخطئ. يمكنك إيقاف AI دون حذف المحادثة المحلية.', 'الحد المعتاد 10 أسئلة يوميًا لكل تثبيت، مع سقف مشترك للموقع قدره 18 طلبًا يوميًا.'],
      en: ['Create your local TAAMEN profile, read the consent notice, and enable the assistant if you choose.', 'Ask about football, your recorded data, or how to use TAAMEN.', 'Review answers because generated content can be wrong. You can turn AI off without deleting local chat history.', 'The normal limit is 10 questions per installation per day, with a shared site cap of 18 requests per day.'],
    },
    example: {
      ar: 'اسأل عن ملخص مبارياتك، ثم انتقل إلى صفحة أخرى وارجع للمساعد؛ ستجد نفس المحادثة ما دمت لم تعِد تعيينها أو تمسح بيانات الموقع.',
      en: 'Ask for a match summary, visit another page, then return to the assistant; the same conversation remains unless you reset it or clear site data.',
    },
    tip: { ar: 'لا ترسل أسرارًا أو معلومات لا تحتاجها الإجابة. البيانات المختارة تُعالج عبر Cloudflare عند إرسال السؤال، بينما تبقى المحادثة محفوظة محليًا.', en: 'Do not send secrets or information that is not needed. Selected context is processed by Cloudflare when you send a question; conversation history remains local.' },
  },
  {
    id: 'profile',
    icon: UserRound,
    title: { ar: 'الملف الشخصي', en: 'Profile' },
    purpose: { ar: 'هويتك المحلية داخل TAAMEN.', en: 'Your local identity inside TAAMEN.' },
    what: {
      ar: 'الاسم والصورة والغلاف. الحفظ ينشط عند وجود تغيير. قص الصورة يُبقي الإطار ثابتًا وتحرك الصورة خلفه بالسحب والتكبير، ثم تؤكد أو تلغي.',
      en: 'Name, photo, and cover stay on this device. Save turns on when something changed. Cropping keeps the frame still and you move the photo behind it with drag and zoom, then confirm or cancel.',
    },
    steps: {
      ar: ['عدّل الحقول ثم احفظ.', 'لاختيار صورة: اختر الملف، حرّكها، كبّرها، ثم أكّد.', 'الإلغاء يُبقي الصورة السابقة.', 'المشاركة العامة تعرض الاسم والصور فقط.'],
      en: ['Edit the fields, then save.', 'For a photo: choose the file, pan, zoom, then confirm.', 'Cancel keeps the previous photo.', 'A public share shows the name and photos only.'],
    },
    example: {
      ar: 'تريد صورة أوضح للمشاركة. تختار الصورة، تقرّبها على الوجه، تؤكد، ثم تحفظ الملف. الزميل يرى الاسم والصورة بلا بريد أو هاتف.',
      en: 'You want a clearer photo for sharing. You pick the image, zoom toward your face, confirm, then save. A teammate sees the name and photo without email or phone.',
    },
  },
  {
    id: 'sharing',
    icon: Share2,
    title: { ar: 'المشاركة', en: 'Sharing' },
    purpose: { ar: 'إعطاء الزميل ما يحتاج، بلا فتح حسابك.', en: 'Give a teammate what they need, without opening your account.' },
    what: {
      ar: 'مشاركة المباراة رابط للمعاينة. المستلم يحفظ نسخة محلية فقط إذا سمح الرابط بذلك. مشاركة الملف لا تتضمن البريد أو الهاتف.',
      en: 'A match share is a preview link. The recipient saves a local copy only when the link allows it. A profile share does not include email or phone.',
    },
    steps: {
      ar: ['من المباراة اختر مشاركة.', 'انسخ الرابط أو أرسله.', 'المستلم يعاين ثم يقرر الحفظ.', 'بياناتك الأصلية لا تُستبدل وحدها.'],
      en: ['From the match, choose Share.', 'Copy the link or send it.', 'The recipient previews, then decides whether to save.', 'Your original data is not replaced on its own.'],
    },
    example: {
      ar: 'بعد تحديد مباراة الجمعة ترسل الرابط للمجموعة. كل زميل يفتح المعاينة على جهازه دون الدخول إلى ملفك.',
      en: 'After Friday’s match is set, you send the link to the group. Each teammate opens the preview on their own device without entering your profile.',
    },
  },
  {
    id: 'notifications',
    icon: Bell,
    title: { ar: 'الإشعارات', en: 'Notifications' },
    purpose: { ar: 'تذكير بالمباراة على هذا الجهاز.', en: 'A match reminder on this device.' },
    what: {
      ar: 'الجرس يعرض تنبيهات محلية عند إنشاء المباراة أو اقترابها أو انتهائها. من الإعدادات يمكن تفعيل تذكير الدفع بعد إذنك، فيصل حتى لو كان TAAMEN مغلقًا على الأجهزة التي تدعم Web Push. على iOS يلزم إضافة التطبيق إلى الشاشة الرئيسية. TAAMEN لا يبقى يعمل في الخلفية.',
      en: 'The bell shows local notices when a match is created, approaching, or finished. Settings can enable push reminders after you allow them, so a reminder can arrive even when TAAMEN is closed on browsers that support Web Push. On iOS the app needs to be on the Home Screen. TAAMEN does not keep running in the background.',
    },
    steps: {
      ar: ['افتح الجرس من الشريط العلوي.', 'اقرأ التنبيه.', 'علّمه مقروءًا أو احذفه.', 'الإشعارات لا تُرسل إلى حساب سحابي.'],
      en: ['Open the bell in the top bar.', 'Read the notice.', 'Mark it read or delete it.', 'Notices are not sent to a cloud account.'],
    },
    example: {
      ar: 'مباراة الجمعة تقترب. يظهر تنبيه بالموعد حتى لا تعتمد على الذاكرة فقط.',
      en: 'Friday’s match is approaching. A notice shows the kickoff so you are not relying on memory alone.',
    },
  },
  {
    id: 'settings',
    icon: Settings,
    title: { ar: 'الإعدادات', en: 'Settings' },
    purpose: { ar: 'لغة الجهاز ومظهره وبياناته.', en: 'Language, appearance, and data on this device.' },
    what: {
      ar: 'اللغة تعكس اتجاه الواجهة. المظهر يبدّل الداكن والفاتح. الحركة والإشعارات والتحليلات مفاتيح محلية. البريد هنا اختياري والتحقق منه غير مفعّل بعد. التصدير والاستيراد نسخة احتياطية. إعادة الضبط تحذف بيانات TAAMEN من هذا المتصفح بعد مهلة تأكيد.',
      en: 'Language flips the interface direction. Appearance switches dark and light. Motion, notifications, and analytics are local switches. Email here is optional and verification is not active yet. Export and import are a backup. Reset deletes TAAMEN data from this browser after a confirmation wait.',
    },
    steps: {
      ar: ['للغة: الإعدادات ← اللغة.', 'للمظهر: بدّل الداكن أو الفاتح.', 'للنسخة الاحتياطية: صدّر ملفًا واستورده على جهاز آخر.', 'إعادة الضبط لا تُلغى، لذا اقرأ التحذير.'],
      en: ['For language: Settings → Language.', 'For appearance: switch dark or light.', 'For a backup: export a file and import it on another device.', 'Reset cannot be undone, so read the warning.'],
    },
    example: {
      ar: 'تريد الواجهة بالإنجليزية. من الإعدادات تغيّر اللغة، فيصبح الاتجاه من اليسار ويتبدّل النص.',
      en: 'You want the interface in Arabic. From Settings you change the language, the direction becomes right-to-left, and the labels switch.',
    },
    tip: { ar: 'المعلومات الشخصية والمباريات تُحفظ محليًا على هذا الجهاز. استخدم التصدير لإنشاء نسخة احتياطية قبل نقل البيانات.', en: 'Your profile and matches are stored locally on this device. Export a backup before moving your data.' },
  },
  {
    id: 'support',
    icon: LifeBuoy,
    title: { ar: 'الدعم', en: 'Support' },
    purpose: { ar: 'رسالة للفريق، مع حالة إرسال واضحة.', en: 'A message to the team, with a clear send state.' },
    what: {
      ar: 'كيف تستخدم الدعم: أرسل للفريق المشكلة، وأين حدثت، وماذا كنت تفعل. كلما كان السياق أوضح كان التحقق أسهل. أثناء الإرسال يتوقف الزر. عند النجاح يبقى النص وتظهر حالة الإرسال. عند الفشل تبقى الرسالة لإعادة المحاولة.',
      en: 'How to use Support: send the team the problem, where it happened, and what you were doing. The more useful the context, the easier it is to investigate. While sending, the button waits. On success the text stays and the delivery state is shown. On failure the message stays so you can retry.',
    },
    steps: {
      ar: ['صف صفحة TAAMEN المعنية.', 'صف ما كنت تحاول فعله.', 'صف ما حدث فعلًا.', 'أرسل الرسالة وراقب حالة التسليم.'],
      en: ['Describe the relevant TAAMEN page.', 'Describe what you were trying to do.', 'Describe what actually happened.', 'Send the message and watch the delivery state.'],
    },
    example: {
      ar: 'مثال مفيد: «بعد أن أدخلت نتيجة مباراة الجمعة في السجل، لم تظهر المباراة ضمن النتائج المسجّلة.»',
      en: 'Example of a useful report: “After I entered Friday’s match result in Archive, the match did not appear under recorded results.”',
    },
  },
];

const visualFlows: Record<string, Copy[]> = {
  welcome: [{ ar: 'ملفك المحلي', en: 'Your local profile' }, { ar: 'إدارة المباريات', en: 'Manage matches' }, { ar: 'مراجعة الأداء', en: 'Review performance' }],
  start: [{ ar: 'أنشئ الملف', en: 'Create profile' }, { ar: 'خصّص التجربة', en: 'Set preferences' }, { ar: 'ابدأ الاستخدام', en: 'Start using TAAMEN' }],
  home: [{ ar: 'ملخص متغيّر', en: 'Rotating summary' }, { ar: 'اختصارات سريعة', en: 'Quick shortcuts' }, { ar: 'أحدث المواجهات', en: 'Latest matches' }],
  matches: [{ ar: 'أنشئ المواجهة', en: 'Create match' }, { ar: 'تابع الحالة', en: 'Follow status' }, { ar: 'سجّل النتيجة', en: 'Record result' }],
  archive: [{ ar: 'ابحث وصفِّ', en: 'Search and filter' }, { ar: 'أكمل البيانات', en: 'Complete details' }, { ar: 'راجع السجل', en: 'Review archive' }],
  stadiums: [{ ar: 'ابحث عن الموقع', en: 'Find a venue' }, { ar: 'راجع التفاصيل', en: 'Inspect details' }, { ar: 'استخدمه بالمباراة', en: 'Use in a match' }],
  tactical: [{ ar: 'اختر التشكيلة', en: 'Choose formation' }, { ar: 'ارسم الحركة', en: 'Draw movement' }, { ar: 'احفظ الخطة', en: 'Save the plan' }],
  analytics: [{ ar: 'أدخل النتائج', en: 'Enter results' }, { ar: 'أضف الإحصائيات', en: 'Add statistics' }, { ar: 'قارن الاتجاهات', en: 'Compare trends' }],
  assistant: [{ ar: 'اسأل المساعد', en: 'Ask the assistant' }, { ar: 'تابع نفس الدردشة', en: 'Continue one chat' }, { ar: 'أعد التعيين عند الحاجة', en: 'Reset when needed' }],
  profile: [{ ar: 'عدّل بياناتك', en: 'Edit details' }, { ar: 'راجع المعاينة', en: 'Review preview' }, { ar: 'احفظ التغييرات', en: 'Save changes' }],
  sharing: [{ ar: 'جهّز المشاركة', en: 'Prepare share' }, { ar: 'أرسل الرابط', en: 'Send the link' }, { ar: 'المستلم يعاين', en: 'Recipient previews' }],
  notifications: [{ ar: 'اسمح بالإشعارات', en: 'Allow notifications' }, { ar: 'فعّل التذكير', en: 'Enable reminders' }, { ar: 'اختبر الوصول', en: 'Test delivery' }],
  settings: [{ ar: 'اختر التفضيلات', en: 'Set preferences' }, { ar: 'احمِ الخصوصية', en: 'Protect privacy' }, { ar: 'صدّر نسخة', en: 'Export a backup' }],
  support: [{ ar: 'صف المشكلة', en: 'Describe issue' }, { ar: 'أرسل التفاصيل', en: 'Send details' }, { ar: 'تابع حالة الإرسال', en: 'Check delivery' }],
};

const wants: { ar: string; en: string; go: Copy }[] = [
  { ar: 'أرى مباراتي القادمة', en: 'See my upcoming match', go: { ar: 'الرئيسية أو مركز المباريات', en: 'Home or Match Center' } },
  { ar: 'أجد مباراة قديمة', en: 'Find an old match', go: { ar: 'السجل', en: 'Archive' } },
  { ar: 'أتأكد من ملعب', en: 'Check a venue', go: { ar: 'الملاعب', en: 'Stadiums' } },
  { ar: 'أحدّث اسمي أو صورتي', en: 'Update my name or photo', go: { ar: 'الملف الشخصي', en: 'Profile' } },
  { ar: 'أغيّر اللغة أو المظهر', en: 'Change language or theme', go: { ar: 'الإعدادات', en: 'Settings' } },
  { ar: 'أراسِل TAAMEN', en: 'Contact TAAMEN', go: { ar: 'الدعم', en: 'Support' } },
  { ar: 'أرسل تفاصيل مباراة', en: 'Send match details', go: { ar: 'مشاركة من المباراة', en: 'Share on the match' } },
];

export default function HowToGuide({ language, open, onClose }: { language: Language; open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const ar = language === 'ar';
  const section = sections[index];
  const Icon = section.icon;
  const steps = section.steps[language];
  const visualSteps = (visualFlows[section.id] ?? []).map((item) => item[language]);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={ar ? 'دليل الاستخدام' : 'How-to Guide'}>
      <button className="overlay-backdrop" aria-label={ar ? 'إغلاق' : 'Close'} onClick={onClose} />
      <aside className="guide-modal">
        <header>
          <div>
            <span className="eyebrow">TAAMEN / GUIDE</span>
            <h2 id="guide-title">{ar ? 'كيف يعمل TAAMEN' : 'How TAAMEN works'}</h2>
            <p className="guide-lead">{ar ? 'اقرأ مرة لتعرف أين تذهب، ولماذا، وماذا يحدث بعد ذلك.' : 'Read once to see where to go, why, and what happens next.'}</p>
          </div>
          <button className="icon-button large" onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'}><X /></button>
        </header>
        <nav className="guide-nav" aria-label={ar ? 'أقسام الدليل' : 'Guide sections'}>
          {sections.map((item, itemIndex) => (
            <button key={item.id} type="button" className={itemIndex === index ? 'is-active' : ''} aria-current={itemIndex === index ? 'true' : undefined} onClick={() => setIndex(itemIndex)}>
              {item.title[language]}
            </button>
          ))}
        </nav>
        <div className="guide-content">
          <section className="guide-section" key={section.id}>
            <div className={`guide-visual guide-visual-${section.id}`} role="img" aria-label={ar ? 'مخطط مرئي يوضح تسلسل استخدام هذا القسم' : 'Visual sequence for using this section'}>{visualSteps.map((step, stepIndex) => <div className="guide-visual-step" key={`${section.id}-${stepIndex}`}><i>{stepIndex + 1}</i><span>{step}</span></div>)}</div>
            <div className="guide-section-header">
              <div className="guide-section-icon" aria-hidden="true"><Icon size={18} /></div>
              <div>
                <h3>{section.title[language]}</h3>
                <p className="guide-purpose">{section.purpose[language]}</p>
              </div>
            </div>
            <h4>{ar ? 'ما هذا؟' : 'What it is'}</h4>
            <p className="guide-section-content">{section.what[language]}</p>
            <h4>{ar ? 'كيف تستخدمه' : 'How to use it'}</h4>
            <ol className="guide-steps">{steps.map((step) => <li key={step}>{step}</li>)}</ol>
            <div className="guide-example">
              <strong>{ar ? 'مثال' : 'Example'}</strong>
              <p>{section.example[language]}</p>
            </div>
            {section.tip && <p className="guide-next">{section.tip[language]}</p>}
            {section.id === 'support' && (
              <ul className="guide-wants">
                {wants.map((item) => (
                  <li key={item.en}><span>{item[language]}</span><b>{item.go[language]}</b></li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <footer className="guide-footer">
          <button type="button" className="dark-action" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>
            {ar ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
            {ar ? 'السابق' : 'Previous'}
          </button>
          <span dir="ltr">{index + 1} / {sections.length}</span>
          {index < sections.length - 1
            ? <button type="button" className="primary-action" onClick={() => setIndex((value) => Math.min(sections.length - 1, value + 1))}>
              {ar ? 'التالي' : 'Next'}
              {ar ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
            </button>
            : <button type="button" className="primary-action" onClick={onClose}>{ar ? 'تم' : 'Done'}</button>}
        </footer>
      </aside>
    </div>
  );
}
