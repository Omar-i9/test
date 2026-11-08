import { LogIn, X } from 'lucide-react';

type Language = 'ar' | 'en';

/** Explains that TAAMEN's personal workspace is saved locally on this device. */
export default function LocalAccessPrompt({
  language,
  action,
  onClose,
  onSignIn,
}: {
  language: Language;
  action?: string;
  onClose: () => void;
  onSignIn: () => void;
}) {
  const ar = language === 'ar';
  return (
    <div className="overlay local-access-overlay" role="dialog" aria-modal="true" aria-labelledby="local-access-title">
      <button type="button" className="overlay-backdrop" onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'} />
      <section className="modal-card local-access-card">
        <header className="panel-heading">
          <div>
            <p className="eyebrow">TAAMEN / ACCOUNT ACCESS</p>
            <h2 id="local-access-title">{ar ? 'اختار طريقة الدخول' : 'Choose how to access TAAMEN'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'}><X size={18} /></button>
        </header>
        <p className="local-access-message">
          {ar
            ? `تقدر تتصفح تأمين كزائر. لحفظ ${action ? action : 'المباريات والخطط والإحصائيات'} اختار ملفًا محليًا أو حسابًا سحابيًا. المحلي لا يحتاج بريدًا وتبقى بياناته على الجهاز؛ والسحابي يحتاج إثبات ملكية البريد أو Google.`
            : `You can browse TAAMEN as a guest. To save ${action || 'matches, plans and statistics'}, choose a local profile or a cloud account. Local setup needs no email and stays on this device; cloud access requires verified email or Google.`}
        </p>
        <div className="local-access-assurance">
          {ar ? 'المحلي: تخزين على الجهاز. السحابي: هوية موثقة ومكتبة خطط سحابية؛ مزامنة المباريات تأتي بعد موافقة مستقلة.' : 'Local: device-only storage. Cloud: verified identity and cloud plan library; match sync follows a separate consent step.'}
        </div>
        <div className="modal-actions">
          <button type="button" className="dark-action" onClick={onClose}>{ar ? 'المتابعة كزائر' : 'Continue as guest'}</button>
          <button type="button" className="primary-action" onClick={onSignIn}><LogIn size={16} />{ar ? 'اختيار طريقة التسجيل' : 'Choose sign-in method'}</button>
        </div>
      </section>
    </div>
  );
}