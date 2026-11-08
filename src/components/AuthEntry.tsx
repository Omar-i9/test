import { useEffect, useState } from 'react';
import { POLICY_VERSION } from '../config/consent';
import { ArrowLeft, ArrowRight, CheckCircle2, Cloud, HelpCircle, LockKeyhole, Mail, Smartphone, ShieldCheck } from 'lucide-react';
import { TAAMEN_LOGO_ALT, TAAMEN_LOGO_SRC } from '../config/branding';
import { cloudAuthClient, CloudAuthError, type CloudAuthConfig, type CloudUser } from '../services/cloudAuthClient';
import type { LocalProfile } from '../services/profileRepository';
import { ProfileSetup } from './ProfileSetup';
import { LanguagePicker } from './ShellControls';
import type { LocaleCode } from '../i18n/languages';
import '../styles/auth-entry.css';

type Language = 'ar' | 'en';
type Props = {
  language: Language;
  onLanguage: () => void;
  selectedLocale: LocaleCode;
  onLocaleChange: (locale: LocaleCode) => void;
  onLocalSave: (profile: Omit<LocalProfile, 'id' | 'updatedAt'>) => Promise<void> | void;
  onCloudAuthenticated: (user: CloudUser) => Promise<void> | void;
  onClose?: () => void;
  action?: string;
  initialStage?: 'choices' | 'cloud' | 'email';
  initialFirstName?: string;
  initialLastName?: string;
};
type Stage = 'choices' | 'local' | 'cloud' | 'email' | 'verify';

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 4)"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.88c-.58 2.96-2.26 5.48-4.75 7.18l7.72 5.99c4.51-4.16 7.13-10.3 7.13-17.64Z" transform="translate(0 0)"/>
    <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z" transform="translate(0 0)"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.72-5.99c-2.14 1.44-4.88 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" transform="translate(0 -3)"/>
  </svg>;
}

export function AuthEntry({ language, selectedLocale, onLocaleChange, onLocalSave, onCloudAuthenticated, onClose, action, initialStage = 'choices', initialFirstName = '', initialLastName = '' }: Props) {
  const ar = language === 'ar';
  const BackIcon = ar ? ArrowRight : ArrowLeft;
  const [stage, setStage] = useState<Stage>(initialStage);
  const [info, setInfo] = useState<'local' | 'cloud' | null>(null);
  const [cloudPolicyAccepted, setCloudPolicyAccepted] = useState(false);
  const [config, setConfig] = useState<CloudAuthConfig>({ email: false, google: false, cloudSync: false });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    cloudAuthClient.getConfig().then((value) => { if (active) setConfig(value); })
      .catch(() => { if (active) setConfig({ email: false, google: false, cloudSync: false }); })
      .finally(() => { if (active) setConfigLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (stage !== 'verify' || !expiresAt) return;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [stage, expiresAt]);

  const secondsRemaining = Math.max(0, Math.ceil((expiresAt - clockNow) / 1000));
  const expiryLabel = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setNotice('');
    if (!cloudPolicyAccepted) {
      setError(ar ? 'راجع سياسة الحساب ووافق عليها قبل المتابعة.' : 'Review and accept the account privacy terms before continuing.');
      return;
    }
    if (!firstName.trim() || !email.trim()) {
      setError(ar ? 'أدخل الاسم الأول والبريد الإلكتروني.' : 'Enter your first name and email address.');
      return;
    }
    setBusy(true);
    try {
      const result = await cloudAuthClient.requestEmailCode({ email, firstName, lastName });
      setChallengeId(result.challengeId);
      setExpiresAt(Date.now() + result.expiresInSeconds * 1000);
      setStage('verify');
      setNotice(ar ? 'أرسلنا رمز تحقق إلى بريدك. أدخله لإكمال تسجيل الدخول.' : 'A verification code was sent to your email. Enter it to continue.');
    } catch (caught) {
      const authError = caught instanceof CloudAuthError ? caught : null;
      setError(authError?.code === 'email_delivery_unavailable'
        ? (ar ? 'إرسال رموز التحقق غير مهيأ بعد. جرّب تسجيل Google أو ارجع لاحقًا.' : 'Email verification is not configured yet. Try Google sign-in or come back later.')
        : authError?.message || (ar ? 'تعذر إرسال رمز التحقق.' : 'The verification code could not be sent.'));
    } finally { setBusy(false); }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      const result = await cloudAuthClient.verifyEmailCode({ email, challengeId, code });
      await onCloudAuthenticated(result.user);
    } catch (caught) {
      const authError = caught instanceof CloudAuthError ? caught : null;
      setError(authError?.code === 'invalid_code'
        ? (ar ? 'الرمز غير صحيح. راجعه وحاول مرة ثانية.' : 'That code is not correct. Check it and try again.')
        : authError?.message || (ar ? 'تعذر تأكيد الحساب.' : 'The account could not be verified.'));
    } finally { setBusy(false); }
  };

  const resendCode = async () => {
    setError(''); setNotice(''); setBusy(true);
    try {
      const result = await cloudAuthClient.requestEmailCode({ email, firstName, lastName });
      setChallengeId(result.challengeId);
      setExpiresAt(Date.now() + result.expiresInSeconds * 1000);
      setCode('');
      setNotice(ar ? 'أرسلنا رمزًا جديدًا. الرمز السابق لم يعد صالحًا.' : 'A new code was sent. The previous code is no longer valid.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (ar ? 'تعذر إرسال الرمز.' : 'Could not send the code.'));
    } finally { setBusy(false); }
  };

  const startGoogle = async () => {
    if (!cloudPolicyAccepted || busy) return;
    setError(''); setBusy(true);
    try {
      await cloudAuthClient.startGoogleSignIn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (ar ? 'تعذر بدء تسجيل Google.' : 'Google sign-in could not be started.'));
      setBusy(false);
    }
  };

  if (stage === 'local') {
    return <ProfileSetup language={language} onCancel={() => setStage('choices')} onSave={onLocalSave} />;
  }

  const cloudPolicyControl = <label className="auth-cloud-policy">
    <input type="checkbox" checked={cloudPolicyAccepted} onChange={(event) => setCloudPolicyAccepted(event.target.checked)} />
    <span>{ar ? <>قرأت ووافقت على <a href="/privacy" target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a> و<a href="/terms" target="_blank" rel="noopener noreferrer">شروط الاستخدام</a> للحساب السحابي (الإصدار {POLICY_VERSION}).</> : <>I have reviewed and accept the cloud-account <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> (version {POLICY_VERSION}).</>}</span>
  </label>;

  return <main className="auth-entry-page">
    <div className="auth-entry-topline">
      {onClose ? <button type="button" className="auth-entry-back" onClick={onClose}><BackIcon size={16}/>{ar ? 'إغلاق' : 'Close'}</button> : <span className="auth-entry-version">TAAMEN 2.0</span>}
      <LanguagePicker language={language} selectedLocale={selectedLocale} onChange={onLocaleChange} className="auth-entry-language-picker"/>
    </div>
    <div className="auth-entry-layout">
      <section className="auth-entry-brand">
        <div className="auth-entry-logo"><img src={TAAMEN_LOGO_SRC} alt={TAAMEN_LOGO_ALT}/></div>
        <p className="auth-entry-kicker">TAAMEN / YOUR FOOTBALL SPACE</p>
        <h1>{ar ? 'طريقتك في استخدام تأمين' : 'Your way into TAAMEN'}</h1>
        <p>{ar ? 'اختار طريقة حفظ بياناتك: ملف محلي يبقى على هذا الجهاز، أو حساب سحابي بهوية موثقة.' : 'Choose how your data is stored: a local profile on this device or a verified cloud account.'}</p>
        <div className="auth-entry-trust"><ShieldCheck size={17}/>{ar ? 'خصوصيتك وملكية بياناتك قبل كل شيء' : 'Privacy and data ownership come first'}</div>
      </section>

      <section className="auth-entry-card">
        {stage === 'choices' && <>
          <div className="auth-entry-card-heading">
            <span className="auth-entry-step">01 / ACCESS</span>
            <h2>{ar ? 'كيف بدك تكمل؟' : 'How would you like to continue?'}</h2>
            <p>{action ? (ar ? `لـ${action}، اختار طريقة الدخول المناسبة.` : `To ${action}, choose how you want to access TAAMEN.`) : (ar ? 'خياران واضحان، ولكل واحد طريقة مختلفة لحفظ البيانات.' : 'Two clear options, each with a different data-storage model.')}</p>
          </div>
          <div className="auth-entry-options">
            <article className={`auth-access-option local${info === 'local' ? ' is-info-open' : ''}`}>
              <button className="auth-option-main" type="button" onClick={() => { setStage('local'); setInfo(null); }}>
                <span className="auth-option-icon"><Smartphone size={21}/></span>
                <span className="auth-option-copy"><strong>{ar ? 'ملف محلي' : 'Local profile'}</strong><small>{ar ? 'اسمك وبياناتك على هذا الجهاز فقط' : 'Your name and data stay on this device'}</small></span>
                <span className="auth-option-arrow">{ar ? 'اختيار' : 'Choose'}</span>
              </button>
              <button type="button" className="auth-info-button" aria-label={ar ? 'معلومات الملف المحلي' : 'About a local profile'} aria-expanded={info === 'local'} onClick={() => setInfo(info === 'local' ? null : 'local')}><HelpCircle size={16}/></button>
              {info === 'local' && <div className="auth-info-panel">{ar
                ? 'التسجيل المحلي لا ينشئ حسابًا على الإنترنت ولا يحتاج بريدًا أو كلمة مرور. تُحفظ المباريات والإحصائيات والخطط المحلية على هذا المتصفح فقط. لن تظهر تلقائيًا على جهاز آخر، وقد تفقدها عند مسح بيانات المتصفح ما لم تحتفظ بنسخة احتياطية.'
                : 'Local setup does not create an online account and needs no email or password. Matches, statistics and working plans stay in this browser. They do not appear on another device and may be lost if browser data is cleared unless you keep a backup.'}</div>}
            </article>

            <article className={`auth-access-option cloud${info === 'cloud' ? ' is-info-open' : ''}`}>
              <button className="auth-option-main" type="button" onClick={() => { setStage('cloud'); setInfo(null); }}>
                <span className="auth-option-icon"><Cloud size={21}/></span>
                <span className="auth-option-copy"><strong>{ar ? 'حساب سحابي' : 'Cloud account'}</strong><small>{ar ? 'بريد موثق أو حساب Google' : 'Verified email or Google account'}</small></span>
                <span className="auth-option-arrow">{ar ? 'اختيار' : 'Choose'}</span>
              </button>
              <button type="button" className="auth-info-button" aria-label={ar ? 'معلومات الحساب السحابي' : 'About a cloud account'} aria-expanded={info === 'cloud'} onClick={() => setInfo(info === 'cloud' ? null : 'cloud')}><HelpCircle size={16}/></button>
              {info === 'cloud' && <div className="auth-info-panel">{ar
                ? 'الحساب السحابي يثبت هويتك بالبريد أو Google، ويحفظ اسمك وبريدك في TAAMEN Cloud، ويفتح مكتبة الخطط التكتيكية السحابية. صورتك والهاتف وتفضيلات جهازك تبقى محلية. مزامنة المباريات والأرشيف بين الأجهزة لن تبدأ تلقائيًا؛ ستُطرح في V20 بعد موافقة منفصلة ومعاينة البيانات.'
                : 'A cloud account verifies your identity by email or Google, stores your name and email in TAAMEN Cloud, and unlocks the cloud tactical-plan library. Your photo, phone and device preferences stay local. Match and archive sync across devices will not start automatically; it is planned for V20 after separate consent and a data preview.'}</div>}
            </article>

          </div>
          <p className="auth-entry-footnote"><LockKeyhole size={13}/>{ar ? 'لن تُرفع بياناتك المحلية إلى السحابة بمجرد إنشاء حساب.' : 'Creating a cloud account does not upload your local data.'}</p>
        </>}

        {stage === 'cloud' && <>
          <button type="button" className="auth-inline-back" onClick={() => setStage('choices')}><BackIcon size={16}/>{ar ? 'طرق الدخول' : 'Access options'}</button>
          <div className="auth-entry-card-heading compact"><span className="auth-entry-step">02 / CLOUD ACCOUNT</span><h2>{ar ? 'حسابك السحابي' : 'Your cloud account'}</h2><p>{ar ? 'اختار Google أو كمل بالبريد الإلكتروني. ما في كلمة مرور محلية نحتفظ فيها.' : 'Continue with Google or use an email verification code. TAAMEN does not keep a local password.'}</p></div>
          {cloudPolicyControl}
          <button type="button" className="auth-google-button" disabled={busy || !cloudPolicyAccepted || !configLoaded || !config.google} onClick={() => void startGoogle()}><GoogleMark/><span>{ar ? 'المتابعة باستخدام Google' : 'Continue with Google'}</span></button>
          {!config.google && <p className="auth-provider-note">{ar ? 'تسجيل Google يحتاج إعداد OAuth الخاص بالموقع، وسيظهر عند اكتمال ربطه.' : 'Google sign-in will appear when the site OAuth credentials are configured.'}</p>}
          <div className="auth-divider"><span>{ar ? 'أو' : 'OR'}</span></div>
          <button type="button" className="auth-email-choice" disabled={!cloudPolicyAccepted || !configLoaded || !config.email} onClick={() => setStage('email')}><Mail size={18}/>{ar ? 'المتابعة بالبريد الإلكتروني' : 'Continue with email'}</button>
          {!config.email && <p className="auth-provider-note">{ar ? 'إرسال رمز البريد يحتاج قالب تحقق منفصل في خدمة البريد. لم نستخدم قالب الدعم لهذا الغرض.' : 'Email verification needs a dedicated authentication email template. The support template is not reused.'}</p>}
          <div className="auth-cloud-assurance"><ShieldCheck size={16}/>{ar ? 'بعد التحقق، يُنشأ حساب واحد ويمكن ربط Google والبريد به عند إثبات ملكية الاثنين.' : 'After verification, TAAMEN creates one account. Google and email can be linked after both are verified.'}</div>
        </>}

        {stage === 'email' && <>
          <button type="button" className="auth-inline-back" onClick={() => setStage('cloud')}><BackIcon size={16}/>{ar ? 'رجوع' : 'Back'}</button>
          <div className="auth-entry-card-heading compact"><span className="auth-entry-step">03 / EMAIL VERIFICATION</span><h2>{ar ? 'الدخول بالبريد' : 'Continue with email'}</h2><p>{ar ? 'رح نبعث رمزًا لمرة واحدة. الاسم يُستخدم فقط عند إنشاء حساب جديد.' : 'We will send a one-time code. Your name is used only when creating a new account.'}</p></div>
          {!cloudPolicyAccepted && cloudPolicyControl}
          {cloudPolicyAccepted && <p className="auth-policy-accepted"><ShieldCheck size={14}/>{ar ? `تمت الموافقة على سياسة الحساب ${POLICY_VERSION}.` : `Account privacy policy ${POLICY_VERSION} accepted.`}</p>}
          <form className="auth-email-form" onSubmit={requestCode}>
            <label>{ar ? 'الاسم الأول' : 'First name'}<input autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} required placeholder={ar ? 'اسمك' : 'Your first name'}/></label>
            <label>{ar ? 'اسم العائلة' : 'Last name'} <span>{ar ? 'اختياري' : 'Optional'}</span><input autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60}/></label>
            <label>{ar ? 'البريد الإلكتروني' : 'Email address'}<input autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required placeholder="name@example.com" dir="ltr"/></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" className="auth-primary-action" disabled={busy || !cloudPolicyAccepted || !config.email}>{busy ? (ar ? 'جارٍ الإرسال…' : 'Sending…') : (ar ? 'إرسال رمز التحقق' : 'Send verification code')}</button>
          </form>
        </>}

        {stage === 'verify' && <>
          <button type="button" className="auth-inline-back" onClick={() => setStage('email')}><BackIcon size={16}/>{ar ? 'تعديل البريد' : 'Change email'}</button>
          <div className="auth-entry-card-heading compact"><span className="auth-entry-step">04 / CHECK YOUR INBOX</span><h2>{ar ? 'أدخل رمز التحقق' : 'Enter your verification code'}</h2><p>{ar ? 'أرسلنا الرمز إلى' : 'We sent a code to'} <b dir="ltr">{email}</b></p></div>
          <form className="auth-email-form" onSubmit={verifyCode}>
            <label>{ar ? 'رمز التحقق' : 'Verification code'}<input autoComplete="one-time-code" inputMode="numeric" type="text" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required placeholder="000000" dir="ltr" className="auth-code-input"/></label>
            <p className="auth-code-expiry">{secondsRemaining > 0 ? (ar ? `الوقت المتبقي لصلاحية الرمز: ${expiryLabel}` : `Code expires in ${expiryLabel}`) : (ar ? 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.' : 'The code has expired. Request a new one.')}</p>
            {error && <p className="auth-error" role="alert">{error}</p>}
            {notice && <p className="auth-success" role="status">{notice}</p>}
            <button type="submit" className="auth-primary-action" disabled={busy || code.length !== 6}>{busy ? (ar ? 'جارٍ التحقق…' : 'Verifying…') : (ar ? 'تأكيد وتسجيل الدخول' : 'Verify and sign in')}</button>
            <button type="button" className="auth-resend-button" disabled={busy} onClick={() => void resendCode()}>{ar ? 'إرسال رمز جديد' : 'Send a new code'}</button>
          </form>
        </>}

        {error && stage === 'cloud' && <p className="auth-error" role="alert">{error}</p>}
      </section>
    </div>
    <footer className="auth-entry-footer"><span>{ar ? 'محلي عندما تريد الخصوصية. سحابي عندما تحتاج الوصول عبر الأجهزة.' : 'Local when you want device-only storage. Cloud when you need account access across devices.'}</span><span>TAAMEN 2.0</span></footer>
  </main>;
}
