import { LifeBuoy, Settings2, UserRound, ShieldCheck, ChevronLeft, ChevronRight, BookOpen, Cloud, Smartphone, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import HowToGuide from '../components/HowToGuide';
import type { RouteId } from '../config/routes';
import type { Language } from '../i18n/translations';
import type { CloudUser } from '../services/cloudAuthClient';
import '../styles/account-hub.css';

export default function AccountHub({ language, cloudUser = null, go }: { language: Language; cloudUser?: CloudUser | null; go: (page: RouteId) => void }) {
  const ar = language === 'ar';
  const [guideOpen, setGuideOpen] = useState(false);
  const items: { id: RouteId; title: string; description: string; Icon: typeof Settings2; detail: string }[] = [
    { id: 'settings', title: ar ? 'الإعدادات' : 'Settings', description: ar ? 'اللغة والمظهر والتنبيهات والبيانات والخصوصية.' : 'Language, appearance, notifications, data, and privacy.', Icon: Settings2, detail: ar ? 'تخصيص التطبيق' : 'Personalize the app' },
    { id: 'support', title: ar ? 'الدعم والتواصل' : 'Support & contact', description: ar ? 'إرسال مشكلة أو اقتراح أو ملاحظة حول الملاعب.' : 'Report an issue or send a suggestion about the stadium directory.', Icon: LifeBuoy, detail: ar ? 'نساعدك على حل المشكلة' : 'Get help with an issue' },
    { id: 'profile', title: ar ? 'الملف الشخصي' : 'Profile', description: ar ? 'إدارة اسم الحساب والبريد والصورة المحلية والجلسات.' : 'Manage account name, email, local photo, and sessions.', Icon: UserRound, detail: ar ? 'هويتك داخل تأمين' : 'Your TAAMEN identity' },
  ];
  return <section className="page-content account-hub-page">
    <header className="account-hub-heading"><div><p className="eyebrow">TAAMEN / YOUR SPACE</p><h1>{ar ? 'الحساب والتحكم' : 'Account & control'}</h1><p className="subtitle">{ar ? 'كل ما يخص حسابك وتجربتك بمكان واحد، بعيدًا عن مساحة اللعب الرئيسية.' : 'Your account and app preferences in one place, separate from the main play space.'}</p></div><span className="account-hub-shield"><ShieldCheck size={23}/></span></header>
    <section className={`account-hub-identity${cloudUser ? ' is-cloud' : ' is-local'}`}><span className="account-hub-identity-icon">{cloudUser ? <Cloud size={19}/> : <Smartphone size={19}/>}</span><div><strong>{cloudUser ? (ar ? 'حساب سحابي موثّق' : 'Verified cloud account') : (ar ? 'ملف محلي على هذا الجهاز' : 'Local profile on this device')}</strong><small>{cloudUser ? cloudUser.email : (ar ? 'بياناتك الشخصية لا تغادر هذا الجهاز.' : 'Your personal profile stays on this device.')}</small></div><button type="button" onClick={() => go('profile')}>{ar ? 'إدارة' : 'Manage'} <ChevronRight size={14}/></button></section>
    <section className="panel account-help-panel" aria-labelledby="account-help-title">
      <div className="panel-heading"><div><p className="eyebrow">TAAMEN / HELP</p><h2 id="account-help-title">{ar ? 'المساعدة ودليل الاستخدام' : 'Help & user guide'}</h2><p className="subtitle">{ar ? 'اختر الطريقة الأنسب للتعرّف على أدوات TAAMEN.' : 'Choose how you would like to learn the TAAMEN workspace.'}</p></div></div>
      <div className="account-help-actions">
        <button type="button" className="account-tour-primary" onClick={() => window.dispatchEvent(new CustomEvent('taamen:start-tour'))}>
          <PlayCircle size={19}/><span><strong>{ar ? 'ابدأ الجولة التفاعلية' : 'Start interactive tour'}</strong><small>{ar ? 'تنقّل بين الصفحات الفعلية مع شرح العناصر خطوة بخطوة.' : 'Explore real product pages with step-by-step highlights.'}</small></span>
        </button>
        <button type="button" className="account-guide-secondary" onClick={() => setGuideOpen(true)}>
          <BookOpen size={18}/><span>{ar ? 'عرض دليل الاستخدام' : 'View user guide'}</span><ChevronRight size={16}/>
        </button>
      </div>
    </section>
    <div className="account-hub-grid">{items.map(({ id, title, description, Icon, detail }) => {
      const Chevron = ar ? ChevronLeft : ChevronRight;
      return <button type="button" className="account-hub-card" key={id} onClick={() => go(id)}>
        <span className="account-hub-card-icon"><Icon size={21}/></span>
        <span className="account-hub-card-copy"><strong>{title}</strong><small>{description}</small><em>{detail}</em></span>
        <Chevron className="account-hub-chevron" size={18}/>
      </button>;
    })}</div>
    <HowToGuide language={language} open={guideOpen} onClose={() => setGuideOpen(false)}/>
  </section>;
}
