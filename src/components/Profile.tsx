import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Cloud, Laptop, LogOut, Mail, Save, ShieldCheck, Smartphone, Trash2, X } from 'lucide-react';
import type { LocalProfile } from '../services/profileRepository';
import { saveProfile } from '../services/profileRepository';
import { isProfileDraftDirty } from '../services/profileDraft';
import { canTryImageFile } from '../services/imageProcessing';
import { ImageCropOverlay } from './ImageCropOverlay';
import { uiCopy } from '../i18n/translations';
import { ImageActionSheet, ImageViewer } from './ImageActionOverlay';
import { cloudAuthClient, CloudAuthError, type CloudAuthConfig, type CloudSessionDevice, type CloudUser } from '../services/cloudAuthClient';

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" width="17" height="17">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 4)"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.88c-.58 2.96-2.26 5.48-4.75 7.18l7.72 5.99c4.51-4.16 7.13-10.3 7.13-17.64Z"/>
    <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.72-5.99c-2.14 1.44-4.88 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" transform="translate(0 -3)"/>
  </svg>;
}

export default function Profile({
  language,
  profile,
  cloudUser = null,
  onCloudUser,
  onOpenAccess,
  onSignOut,
  onSignOutAll,
  onProfile,
  registerLeaveGuard,
}: {
  language: 'ar' | 'en';
  profile: LocalProfile;
  cloudUser?: CloudUser | null;
  onCloudUser?: (user: CloudUser | null) => void;
  onOpenAccess?: (initialStage?: 'choices' | 'cloud' | 'email') => void;
  onSignOut?: () => Promise<void> | void;
  onSignOutAll?: () => Promise<void> | void;
  onProfile: (p: LocalProfile) => void;
  registerLeaveGuard?: (guard: (() => boolean) | null) => void;
}) {
  const copy = uiCopy[language];
  const ar = language === 'ar';
  const [draft, setDraft] = useState(profile);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [nudge, setNudge] = useState(0);
  const avatarRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const [imageSheet, setImageSheet] = useState<'avatar' | null>(null);
  const [imageViewer, setImageViewer] = useState<'avatar' | null>(null);
  const [crop, setCrop] = useState<{ file: File; kind: 'avatar' } | null>(null);
  const reminderRef = useRef<HTMLButtonElement>(null);
  const dirtyRef = useRef(false);
  const statusTimer = useRef<number | null>(null);
  const [sessions, setSessions] = useState<CloudSessionDevice[]>([]);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [syncConsentBusy, setSyncConsentBusy] = useState(false);
  const [syncConsent, setSyncConsent] = useState(Boolean(cloudUser?.cloudSync.consented));
  const [confirmSignOutAll, setConfirmSignOutAll] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [authConfig, setAuthConfig] = useState<CloudAuthConfig>({ email: false, google: false, cloudSync: false });
  const [authApiStatus, setAuthApiStatus] = useState<'checking' | 'reachable' | 'unreachable'>('checking');
  const [providerBusy, setProviderBusy] = useState<'google' | 'email' | 'unlink' | null>(null);
  const [emailLinkOpen, setEmailLinkOpen] = useState(false);
  const [emailLinkEmail, setEmailLinkEmail] = useState('');
  const [emailLinkCode, setEmailLinkCode] = useState('');
  const [emailLinkChallengeId, setEmailLinkChallengeId] = useState('');
  const [emailLinkSeconds, setEmailLinkSeconds] = useState(0);
  const [emailLinkNotice, setEmailLinkNotice] = useState('');

  const dirty = useMemo(() => isProfileDraftDirty(profile, draft), [profile, draft]);
  dirtyRef.current = dirty;
  const photoPending = (draft.avatarData || '') !== (profile.avatarData || '');
  const cloudMode = Boolean(cloudUser);

  useEffect(() => {
    setDraft(profile);
    setAttempts(0);
    setSyncConsent(Boolean(cloudUser?.cloudSync.consented));
  }, [profile, cloudUser]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('auth_link');
    const error = url.searchParams.get('auth_link_error');
    if (!result && !error) return;
    if (result === 'google_success') flashStatus(ar ? 'تم ربط حساب Google بالحساب الحالي.' : 'Google is now linked to your current account.');
    if (error) {
      const messages: Record<string, string> = {
        google_link_session_mismatch: ar ? 'انتهت جلسة الحساب أو تغيرت أثناء الربط. سجّل الدخول للحساب المقصود ثم أعد المحاولة.' : 'Your account session changed during linking. Sign in to the intended account and try again.',
        google_identity_in_use: ar ? 'حساب Google هذا مرتبط بحساب TAAMEN آخر. لم يتم دمج الحسابات.' : 'This Google identity belongs to another TAAMEN account. No accounts were merged.',
        provider_already_linked: ar ? 'يوجد مزوّد Google مختلف مربوط بهذا الحساب بالفعل.' : 'A different Google identity is already linked to this account.',
        google_link_failed: ar ? 'تعذر إكمال ربط Google.' : 'Google linking could not be completed.',
        google_access_denied: ar ? 'ألغيت موافقة Google. لم يتم تغيير ربط حسابك.' : 'Google authorization was cancelled. Your account links were not changed.',
        google_authorization_failed: ar ? 'لم تكتمل موافقة Google. يمكنك المحاولة مجددًا.' : 'Google authorization did not complete. You can try again.',
        google_provider_unavailable: ar ? 'تعذر الوصول إلى خدمة Google مؤقتًا.' : 'Google is temporarily unavailable.',
        google_token_exchange_failed: ar ? 'تعذر التحقق من استجابة Google.' : 'Google could not verify the authorization response.',
        google_identity_unverified: ar ? 'لم يقدّم Google بريدًا موثّقًا.' : 'Google did not provide a verified email address.',
      };
      setAccountError(messages[error] || (ar ? 'تعذر إكمال ربط Google. حاول مجددًا.' : 'Google linking could not be completed. Try again.'));
    }
    url.searchParams.delete('auth_link');
    url.searchParams.delete('auth_link_error');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [ar]);


  useEffect(() => {
    let active = true;
    cloudAuthClient.getConfig().then((config) => { if (active) { setAuthConfig(config); setAuthApiStatus('reachable'); } }).catch(() => { if (active) setAuthApiStatus('unreachable'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!emailLinkChallengeId || emailLinkSeconds <= 0) return;
    const timer = window.setInterval(() => setEmailLinkSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [emailLinkChallengeId, emailLinkSeconds]);

  useEffect(() => {
    if (!cloudUser) { setEmailLinkOpen(false); setEmailLinkChallengeId(''); setEmailLinkCode(''); }
  }, [cloudUser]);

  useEffect(() => {
    if (!cloudUser) { setSessions([]); return; }
    let active = true;
    setSessionsBusy(true);
    cloudAuthClient.listSessions().then((result) => { if (active) setSessions(result.sessions); })
      .catch(() => { if (active) setAccountError(ar ? 'تعذر تحميل الجلسات.' : 'Could not load account sessions.'); })
      .finally(() => { if (active) setSessionsBusy(false); });
    return () => { active = false; };
  }, [cloudUser, ar]);

  useEffect(() => () => { if (statusTimer.current !== null) window.clearTimeout(statusTimer.current); }, []);
  useEffect(() => {
    if (!dirty) setAttempts(0);
  }, [dirty]);
  useEffect(() => {
    if (!registerLeaveGuard) return;
    registerLeaveGuard(() => {
      if (!dirtyRef.current) return true;
      setAttempts((count) => count + 1);
      setNudge((count) => count + 1);
      return false;
    });
    return () => registerLeaveGuard(null);
  }, [registerLeaveGuard]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const update = (key: keyof LocalProfile, value: string | boolean | number | undefined) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const flashStatus = (message: string, isError = false) => {
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    setFailed(isError);
    setStatus(message);
    statusTimer.current = window.setTimeout(() => setStatus(''), isError ? 5000 : 3000);
  };

  const save = async () => {
    if (!draft.firstName.trim()) {
      flashStatus(copy.profileFirstNameRequired, true);
      saveRef.current?.focus();
      return;
    }
    setBusy(true);
    setFailed(false);
    setAccountError('');
    try {
      const cloudNameChanged = Boolean(cloudUser && (
        draft.firstName.trim() !== cloudUser.firstName || draft.lastName.trim() !== cloudUser.lastName
      ));

      // Save device-owned fields first. An offline account must never block local photo/phone edits.
      const deviceProfile = await saveProfile({
        ...draft,
        firstName: cloudUser?.firstName ?? draft.firstName.trim(),
        lastName: cloudUser?.lastName ?? draft.lastName.trim(),
        // The verified email is fetched from CloudUser at runtime; do not duplicate it in IndexedDB.
        email: cloudUser ? '' : draft.email.trim(),
        emailVerified: false,
      });
      setDraft(deviceProfile);
      onProfile(deviceProfile);
      setAttempts(0);

      if (cloudUser && cloudNameChanged) {
        let updatedCloudUser: CloudUser;
        try {
          const result = await cloudAuthClient.updateProfile({
            firstName: draft.firstName.trim(),
            lastName: draft.lastName.trim(),
          });
          updatedCloudUser = result.user;
          onCloudUser?.(updatedCloudUser);
        } catch (caught) {
          const authError = caught instanceof CloudAuthError ? caught : null;
          flashStatus(
            ar
              ? `حُفظت الصورة والهاتف على هذا الجهاز، لكن تعذّر تحديث اسم الحساب السحابي. ${authError?.message || 'تحقق من الاتصال وحاول مجددًا.'}`
              : `Your photo and phone were saved on this device, but the cloud account name was not updated. ${authError?.message || 'Check your connection and try again.'}`,
            true,
          );
          return;
        }
        // D1 is now canonical. Update the in-memory display projection even if IndexedDB is temporarily full.
        const displayProjection = {
          ...deviceProfile,
          firstName: updatedCloudUser.firstName,
          lastName: updatedCloudUser.lastName,
          email: '',
          emailVerified: false,
        };
        setDraft(displayProjection);
        onProfile(displayProjection);
        try {
          const persistedProjection = await saveProfile(displayProjection);
          setDraft(persistedProjection);
          onProfile(persistedProjection);
        } catch {
          // The cloud name remains canonical; App boot will refresh the local display projection from D1.
        }
      }

      flashStatus(ar ? 'تم حفظ التغييرات بنجاح.' : 'Your changes have been saved.');
    } catch (caught) {
      const authError = caught instanceof CloudAuthError ? caught : null;
      flashStatus(authError?.message || copy.profileSaveFailed, true);
    } finally { setBusy(false); }
  };

  const queueCrop = (file: File | undefined, kind: 'avatar') => {
    if (!file) return;
    if (!canTryImageFile(file)) { flashStatus(copy.imageProcessFailed, true); return; }
    setCrop({ file, kind });
  };

  const toggleFutureSyncConsent = async () => {
    if (!cloudUser || syncConsentBusy) return;
    setSyncConsentBusy(true); setAccountError('');
    try {
      const next = !syncConsent;
      await cloudAuthClient.saveSyncConsent(next);
      setSyncConsent(next);
      onCloudUser?.({ ...cloudUser, cloudSync: { ...cloudUser.cloudSync, consented: next, consentVersion: next ? 'cloud-sync-1' : null, enabled: false, available: false } });
    } catch (caught) {
      setAccountError(caught instanceof Error ? caught.message : (ar ? 'تعذر حفظ تفضيل المزامنة.' : 'Could not save sync preference.'));
    } finally { setSyncConsentBusy(false); }
  };

  const revokeOtherSession = async (sessionId: string) => {
    setAccountError('');
    try {
      await cloudAuthClient.revokeSession(sessionId);
      setSessions((current) => current.filter((item) => item.id !== sessionId));
    } catch (caught) {
      setAccountError(caught instanceof Error ? caught.message : (ar ? 'تعذر إنهاء الجلسة.' : 'Could not revoke the session.'));
    }
  };

  const startGoogleProviderLink = async () => {
    if (!cloudUser || providerBusy) return;
    setProviderBusy('google'); setAccountError('');
    try { await cloudAuthClient.startGoogleLink(); }
    catch (caught) {
      setAccountError(caught instanceof Error ? caught.message : (ar ? 'تعذر بدء ربط Google.' : 'Could not start Google linking.'));
      setProviderBusy(null);
    }
  };

  const unlinkAccountProvider = async (provider: 'email' | 'google') => {
    if (!cloudUser || providerBusy) return;
    const prompt = provider === 'google'
      ? (ar ? 'هل تريد إلغاء ربط Google؟ سيبقى حساب TAAMEN متاحًا عبر البريد الموثّق.' : 'Unlink Google? You will still be able to sign in with your verified email.')
      : (ar ? 'هل تريد إلغاء ربط هذا البريد الإضافي؟' : 'Unlink this additional email address?');
    if (!window.confirm(prompt)) return;
    setProviderBusy('unlink'); setAccountError('');
    try {
      const result = await cloudAuthClient.unlinkProvider(provider);
      onCloudUser?.(result.user);
      flashStatus(ar ? 'تم تحديث طرق تسجيل الدخول المرتبطة بالحساب.' : 'The account sign-in methods were updated.');
    } catch (caught) {
      setAccountError(caught instanceof Error ? caught.message : (ar ? 'تعذر إلغاء ربط المزوّد.' : 'Could not unlink this provider.'));
    } finally { setProviderBusy(null); }
  };

  const requestEmailProviderLink = async () => {
    if (!cloudUser || providerBusy || !emailLinkEmail.trim()) return;
    setProviderBusy('email'); setAccountError(''); setEmailLinkNotice('');
    try {
      const result = await cloudAuthClient.requestEmailLinkCode({ email: emailLinkEmail.trim() });
      setEmailLinkChallengeId(result.challengeId);
      setEmailLinkSeconds(result.expiresInSeconds);
      setEmailLinkCode('');
      setEmailLinkNotice(ar ? 'تم إرسال رمز التحقق إلى البريد الذي أدخلته.' : 'A verification code was sent to the address you entered.');
    } catch (caught) {
      setAccountError(caught instanceof Error ? caught.message : (ar ? 'تعذر إرسال رمز التحقق.' : 'Could not send the verification code.'));
    } finally { setProviderBusy(null); }
  };

  const verifyEmailProviderLink = async () => {
    if (!cloudUser || providerBusy || !emailLinkChallengeId || !/^\d{6}$/.test(emailLinkCode.trim())) return;
    setProviderBusy('email'); setAccountError('');
    try {
      const result = await cloudAuthClient.verifyEmailLinkCode({ email: emailLinkEmail.trim(), challengeId: emailLinkChallengeId, code: emailLinkCode.trim() });
      onCloudUser?.(result.user);
      setEmailLinkChallengeId(''); setEmailLinkCode(''); setEmailLinkSeconds(0); setEmailLinkOpen(false);
      flashStatus(ar ? 'تم ربط البريد والتحقق من ملكيته.' : 'Email linked and ownership verified.');
    } catch (caught) {
      setAccountError(caught instanceof Error ? caught.message : (ar ? 'تعذر تأكيد البريد.' : 'Could not verify this email.'));
    } finally { setProviderBusy(null); }
  };

  const reminderLevel = Math.min(Math.max(attempts, 1), 3);
  const reminderText = attempts >= 3 ? copy.forgotSaveProfileStrong : attempts === 2 ? copy.forgotSaveProfileAgain : copy.forgotSaveProfile;

  return (
    <section className="page-content profile-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TAAMEN 2.0 / PROFILE</p>
          <h1>{ar ? 'الملف الشخصي' : 'Profile'}</h1>
          <p className="subtitle">{cloudMode ? (ar ? 'إدارة هويتك السحابية وبيانات هذا الجهاز كلٌّ في مكانه.' : 'Manage your cloud identity and this device’s local data separately.') : (ar ? 'ملفك المحلي محفوظ على هذا الجهاز فقط.' : 'Your local profile is stored on this device only.')}</p>
        </div>
      </div>

      {status && <div className={failed ? 'error-banner' : 'success-banner'} role={failed ? 'alert' : 'status'}>{status}</div>}
      {dirty && <p className="profile-dirty-hint">{copy.unsavedChanges}</p>}

      <section className="panel profile-hero-card profile-avatar-only-card">
        <div className="profile-hero-body is-avatar-only">
          <div className={`profile-avatar-wrap${photoPending ? ' is-pending' : ''}`}>
            <button type="button" className="profile-avatar-button" onClick={() => setImageSheet('avatar')} aria-label={copy.changePhoto}>
              {draft.avatarData ? <img src={draft.avatarData} alt={ar ? 'الصورة الشخصية' : 'Profile avatar'} /> : <span>{draft.firstName.slice(0, 1).toUpperCase() || '?'}</span>}
            </button>
            <button type="button" className="profile-avatar-edit" onClick={() => setImageSheet('avatar')} aria-label={copy.changePhoto}><Camera size={14} /></button>
            <input ref={avatarRef} hidden type="file" accept="image/*" onChange={(event) => { queueCrop(event.target.files?.[0], 'avatar'); event.target.value = ''; }}/>
          </div>
          <div className="profile-hero-copy">
            <span className="status-chip">{cloudMode ? (ar ? 'حساب سحابي موثّق' : 'Verified cloud account') : (ar ? 'ملف محلي' : 'Local profile')}</span>
            {photoPending && <span className="status-chip pending-chip">{copy.photoPending}</span>}
            <h2>{draft.firstName} {draft.lastName}</h2>
            <p>{cloudMode ? (ar ? 'الاسم والبريد تابعان لحسابك. الصورة والهاتف يظلان محليين.' : 'Name and email belong to your account. Photo and phone stay local.') : (ar ? 'الاسم والصورة والبيانات الشخصية تبقى على هذا الجهاز.' : 'Your name, photo and personal details stay on this device.')}</p>
          </div>
        </div>
      </section>

      {cloudUser ? <section className="panel cloud-account-panel">
        <div className="cloud-account-heading"><span className="cloud-account-icon"><ShieldCheck size={20}/></span><div><p className="eyebrow">TAAMEN CLOUD / VERIFIED IDENTITY</p><h2>{ar ? 'الحساب المرتبط' : 'Connected account'}</h2><p>{ar ? 'اربط مزوّدات إضافية بهذا الحساب دون إنشاء حساب آخر أو دمج هويات مختلفة تلقائيًا.' : 'Link additional providers to this account without creating another account or silently merging identities.'}</p></div></div>
        <div className="cloud-account-email"><span><Mail size={15}/>{ar ? 'البريد الأساسي للحساب' : 'Primary account email'}</span><strong dir="ltr">{cloudUser.email}</strong><small>{ar ? 'البريد الأساسي موثّق ولا يتغير من محرر الملف الشخصي.' : 'The primary email is verified and is not edited from the profile form.'}</small></div>
        <div className="cloud-provider-list">{cloudUser.providers.map((provider) => <span key={provider} className="cloud-provider-chip">{provider === 'google' ? <GoogleMark/> : <Mail size={14}/>} {provider === 'google' ? 'Google' : (ar ? 'بريد موثّق' : 'Verified email')}</span>)}</div>
        <div className="cloud-provider-link-actions">
          {!cloudUser.providers.includes('google') && <button type="button" className="profile-google-link" disabled={!authConfig.google || providerBusy !== null} onClick={() => void startGoogleProviderLink()}><GoogleMark/>{providerBusy === 'google' ? (ar ? 'جارٍ بدء الربط…' : 'Starting…') : (ar ? 'ربط Google بهذا الحساب' : 'Link Google to this account')}</button>}
          {!cloudUser.providers.includes('email') && <button type="button" className="profile-email-link" disabled={!authConfig.email || providerBusy !== null} onClick={() => { setEmailLinkOpen((open) => !open); setAccountError(''); setEmailLinkNotice(''); }}><Mail size={15}/>{ar ? 'ربط بريد إلكتروني' : 'Link an email address'}</button>}
          {cloudUser.providers.includes('google') && <div className="cloud-provider-connected"><span className="cloud-provider-chip"><GoogleMark/> {ar ? 'Google مربوط' : 'Google linked'}</span>{cloudUser.providers.includes('email') && <button type="button" className="cloud-provider-unlink" disabled={providerBusy !== null} onClick={() => void unlinkAccountProvider('google')}>{providerBusy === 'unlink' ? (ar ? 'جارٍ التحديث…' : 'Updating…') : (ar ? 'إلغاء الربط' : 'Unlink')}</button>}</div>}
          {cloudUser.providers.includes('email') && <div className="cloud-provider-connected"><span className="cloud-provider-chip"><Mail size={14}/> {ar ? 'البريد مربوط' : 'Email linked'}</span>{cloudUser.providers.includes('google') && cloudUser.identities?.some((identity) => identity.provider === 'email' && identity.email.toLowerCase() !== cloudUser.email.toLowerCase()) && <button type="button" className="cloud-provider-unlink" disabled={providerBusy !== null} onClick={() => void unlinkAccountProvider('email')}>{providerBusy === 'unlink' ? (ar ? 'جارٍ التحديث…' : 'Updating…') : (ar ? 'إلغاء الربط' : 'Unlink')}</button>}</div>}
        </div>
        {emailLinkOpen && !cloudUser.providers.includes('email') && <div className="email-provider-link-form">
          <h3>{ar ? 'إثبات ملكية بريد إضافي' : 'Verify an additional email'}</h3>
          <p>{ar ? 'سيُرسل رمز لمرة واحدة. لا يصبح البريد مربوطًا إلا بعد التحقق منه على الخادم.' : 'A one-time code will be sent. The address is not linked until the server verifies the code.'}</p>
          {!emailLinkChallengeId ? <div className="email-provider-link-row"><input type="email" autoComplete="email" inputMode="email" value={emailLinkEmail} onChange={(event) => setEmailLinkEmail(event.target.value)} placeholder={ar ? 'name@example.com' : 'name@example.com'} aria-label={ar ? 'البريد المراد ربطه' : 'Email to link'}/><button type="button" disabled={!authConfig.email || providerBusy !== null || !emailLinkEmail.trim()} onClick={() => void requestEmailProviderLink()}>{providerBusy === 'email' ? (ar ? 'جارٍ الإرسال…' : 'Sending…') : (ar ? 'إرسال الرمز' : 'Send code')}</button></div> : <div className="email-provider-link-row"><input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailLinkCode} onChange={(event) => setEmailLinkCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" aria-label={ar ? 'رمز التحقق' : 'Verification code'}/><button type="button" disabled={providerBusy !== null || emailLinkCode.trim().length !== 6 || emailLinkSeconds <= 0} onClick={() => void verifyEmailProviderLink()}>{providerBusy === 'email' ? (ar ? 'جارٍ التحقق…' : 'Verifying…') : (ar ? 'تأكيد وربط البريد' : 'Verify and link')}</button></div>}
          {emailLinkChallengeId && <div className="email-provider-link-meta"><span>{ar ? 'تنتهي صلاحية الرمز خلال' : 'Code expires in'} {Math.floor(emailLinkSeconds / 60)}:{String(emailLinkSeconds % 60).padStart(2, '0')}</span><button type="button" disabled={providerBusy !== null || emailLinkSeconds > 0} onClick={() => { setEmailLinkChallengeId(''); setEmailLinkCode(''); void requestEmailProviderLink(); }}>{ar ? 'إعادة إرسال' : 'Resend code'}</button></div>}
          {emailLinkNotice && <p className="settings-note" role="status">{emailLinkNotice}</p>}
          <button type="button" className="text-button" onClick={() => { setEmailLinkOpen(false); setEmailLinkChallengeId(''); setEmailLinkCode(''); }}>{ar ? 'إلغاء' : 'Cancel'}</button>
        </div>}
        <div className="cloud-service-status" aria-label={ar ? 'حالة خدمات الحساب' : 'Account service status'}>
          <span><strong>{ar ? 'واجهة Worker' : 'Worker API'}</strong><small>{authApiStatus === 'reachable' ? (ar ? 'تستجيب' : 'Reachable') : authApiStatus === 'checking' ? (ar ? 'جارٍ الفحص' : 'Checking') : (ar ? 'غير متاحة' : 'Unavailable')}</small></span>
          <span><strong>Google OAuth</strong><small>{cloudUser.providers.includes('google') ? (ar ? 'هوية مربوطة' : 'Identity linked') : authConfig.google ? (ar ? 'مُهيأ' : 'Configured') : (ar ? 'يتطلب إعدادًا' : 'Configuration required')}</small></span>
          <span><strong>{ar ? 'البريد والتحقق' : 'Email verification'}</strong><small>{cloudUser.providers.includes('email') ? (ar ? 'هوية مربوطة' : 'Identity linked') : authConfig.email ? (ar ? 'مُهيأ' : 'Configured') : (ar ? 'يتطلب إعدادًا' : 'Configuration required')}</small></span>
          <span><strong>{ar ? 'مزامنة بيانات المباريات' : 'Match data sync'}</strong><small>{cloudUser.cloudSync.enabled ? (ar ? 'مفعّلة' : 'Enabled') : (ar ? 'غير مفعّلة في V19 — ضمن V20' : 'Not enabled in V19 — planned for V20')}</small></span>
        </div>
      </section> : <section className="panel local-upgrade-panel">
        <div className="local-upgrade-copy"><span className="local-upgrade-icon"><Cloud size={19}/></span><div><p className="eyebrow">OPTIONAL / CLOUD ACCESS</p><h2>{ar ? 'اربط ملفك بحساب سحابي' : 'Connect a cloud account'}</h2><p>{ar ? 'احتفظ بملفك المحلي كما هو، وأضف هوية سحابية موثقة لمكتبة الخطط والوصول عبر الحساب.' : 'Keep your local profile as it is and add a verified cloud identity for account access and the cloud plan library.'}</p></div></div>
        <div className="local-upgrade-actions">
          <button type="button" className="profile-google-link" disabled={!authConfig.google} onClick={() => onOpenAccess?.('cloud')}><GoogleMark/>{ar ? 'ربط Google' : 'Connect Google'}</button>
          <button type="button" className="profile-email-link" disabled={!authConfig.email} onClick={() => onOpenAccess?.('email')}><Mail size={15}/>{ar ? 'الدخول بالبريد' : 'Sign in with email'}</button>
        </div>
        {(!authConfig.email || !authConfig.google) && <p className="local-upgrade-note">{ar ? 'خيارات الربط ستُفعّل بعد إعداد مزوّد التحقق. لا نستخدم بيانات حسابك المحلي لإثبات ملكية بريد أو Google.' : 'Sign-in providers become available after their server credentials are configured. Your local profile is never used to prove ownership of an email or Google account.'}</p>}
        <p className="local-upgrade-note">{ar ? 'الربط لا يرفع مبارياتك المحلية تلقائيًا. نقل البيانات يحتاج موافقة مستقلة ومعاينة لاحقًا.' : 'Linking does not upload local matches. Data transfer requires separate consent and a later preview.'}</p>
      </section>}

      <section className="panel profile-edit-panel">
        <div className="panel-heading"><div><p className="eyebrow">{ar ? 'معلومات الملف' : 'PROFILE INFORMATION'}</p><h2>{ar ? 'تحرير الملف' : 'Edit profile'}</h2></div></div>
        <div className="form-grid">
          <label>{ar ? 'الاسم الأول' : 'First name'} *<input value={draft.firstName} onChange={(event) => update('firstName', event.target.value)} maxLength={60}/></label>
          <label>{ar ? 'اسم العائلة' : 'Family / last name'} <span className="optional">{ar ? 'اختياري' : 'Optional'}</span><input value={draft.lastName} onChange={(event) => update('lastName', event.target.value)} maxLength={60}/></label>
          {!cloudMode && <label>{ar ? 'البريد الإلكتروني' : 'Email'} <span className="optional">{ar ? 'اختياري ومحلي' : 'Optional · local only'}</span><input value={draft.email} type="email" onChange={(event) => update('email', event.target.value)} placeholder={ar ? 'غير مضاف' : 'Not added'}/></label>}
          <label>{ar ? 'الهاتف' : 'Phone'} <span className="optional">{ar ? 'اختياري ومحلي' : 'Optional · local only'}</span><input value={draft.phone} type="tel" onChange={(event) => update('phone', event.target.value)} placeholder={ar ? 'غير مضاف' : 'Not added'}/></label>
        </div>
        <div className="profile-tools profile-tools-v19">
          <button className="text-button" type="button" onClick={() => update('avatarData', '')} disabled={!draft.avatarData}><Trash2 size={14}/>{copy.removePhoto}</button>
          {photoPending && <button className="text-button" type="button" onClick={() => update('avatarData', profile.avatarData || '')}>{copy.revertPhoto}</button>}
          <span className="profile-storage-note"><Smartphone size={13}/>{ar ? 'الصورة والهاتف محليان دائمًا' : 'Photo and phone are always local'}</span>
          <button ref={saveRef} id="profile-save-button" type="button" className={`primary-action profile-inline-save${dirty ? ' is-dirty-save' : ''}`} onClick={save} disabled={!dirty || busy} aria-disabled={!dirty || busy} title={dirty ? copy.saveProfile : copy.noUnsavedChanges}>
            {busy ? <span className="profile-save-spinner"/> : <Save size={15}/>} {busy ? copy.savingProfile : copy.saveProfile}
          </button>
        </div>
      </section>

      {cloudUser && <>
        <section className="panel cloud-sync-settings">
          <div className="cloud-section-heading"><span className="cloud-section-icon"><Cloud size={19}/></span><div><p className="eyebrow">CLOUD SYNC / V20</p><h2>{ar ? 'إعدادات المزامنة' : 'Synchronization settings'}</h2></div><span className="status-chip pending-chip">{ar ? 'قريبًا' : 'Coming in V20'}</span></div>
          <p>{ar ? 'طريقة العمل: يحفظ الجهاز بياناتك محليًا أولًا. عند تفعيل المزامنة مستقبلًا، يرسل السجلات المسموح بها إلى حسابك، ثم يسحب التغييرات الجديدة من أجهزتك الأخرى باستخدام مؤشرات تغيّر ومراجعات تمنع الكتابة فوق تحديث أحدث.' : 'How it will work: your device saves data locally first. Once sync is activated, eligible records are pushed to your account and new changes are pulled from your other devices using change cursors and revisions that prevent newer edits from being overwritten.'}</p>
          <div className="cloud-sync-boundaries"><span><Check size={13}/>{ar ? 'المباريات غير الخاصة والأرشيف' : 'Non-private matches and archive'}</span><span><Check size={13}/>{ar ? 'الاسم الأول واسم العائلة' : 'First and last name'}</span><span><X size={13}/>{ar ? 'الصور والمحادثات والإعدادات' : 'Photos, AI chats and settings'}</span><span><X size={13}/>{ar ? 'المباريات PRIVATE' : 'PRIVATE matches'}</span></div>
          <label className="cloud-consent-row"><input type="checkbox" checked={syncConsent} onChange={() => void toggleFutureSyncConsent()} disabled={syncConsentBusy}/><span>{ar ? 'أوافق على سياسة مزامنة البيانات عندما تتوفر في V20، بعد عرض البيانات التي ستُنقل.' : 'I agree to the cloud-sync policy when V20 becomes available, after reviewing the data to be transferred.'}</span></label>
          <small className="cloud-sync-disclaimer">{ar ? 'هذه موافقة محفوظة فقط؛ لا يوجد رفع أو تنزيل للمباريات حاليًا. لن تبدأ المزامنة قبل إصدار V20 وموافقة نهائية على النقل.' : 'This only records your preference. Matches are not uploaded or downloaded now. Sync will not start before V20 and a final transfer confirmation.'}</small>
          {syncConsentBusy && <small className="settings-note">{ar ? 'جارٍ حفظ التفضيل…' : 'Saving preference…'}</small>}
        </section>

        <section className="panel cloud-sessions-panel">
          <div className="cloud-section-heading"><span className="cloud-section-icon"><Laptop size={19}/></span><div><p className="eyebrow">ACCOUNT SECURITY</p><h2>{ar ? 'الجلسات والأجهزة' : 'Sessions and devices'}</h2></div></div>
          <p>{ar ? 'تقدر تراجع الجلسات النشطة وتنهي جلسة معينة. تسجيل الخروج من الحساب لا يحذف بيانات هذا الجهاز المحلية.' : 'Review active sessions and revoke a specific device. Signing out does not delete this device’s local data.'}</p>
          {sessionsBusy ? <small className="settings-note">{ar ? 'جارٍ تحميل الجلسات…' : 'Loading sessions…'}</small> : <div className="cloud-session-list">{sessions.map((session) => <div className="cloud-session-row" key={session.id}><span className="cloud-session-device"><Laptop size={16}/><span><strong>{session.current ? (ar ? 'هذا الجهاز' : 'This device') : (ar ? 'جلسة أخرى' : 'Another session')}</strong><small>{session.device || (ar ? 'متصفح غير معروف' : 'Unknown browser')} · {new Date(session.lastSeenAt).toLocaleDateString(ar ? 'ar' : 'en')}</small></span></span>{!session.current && <button type="button" className="text-button" onClick={() => void revokeOtherSession(session.id)}>{ar ? 'إنهاء' : 'Revoke'}</button>}</div>)}</div>}
          {accountError && <p className="auth-error" role="alert">{accountError}</p>}
          <div className="cloud-session-actions"><button type="button" className="profile-signout-button" onClick={() => void onSignOut?.()}><LogOut size={15}/>{ar ? 'تسجيل الخروج من هذا الجهاز' : 'Sign out on this device'}</button>{!confirmSignOutAll ? <button type="button" className="profile-signout-all" onClick={() => setConfirmSignOutAll(true)}>{ar ? 'إنهاء كل الجلسات' : 'Sign out all sessions'}</button> : <div className="profile-signout-confirm"><span>{ar ? 'هل تنهي جميع الجلسات؟' : 'Revoke every active session?'}</span><button type="button" onClick={() => { setConfirmSignOutAll(false); void onSignOutAll?.(); }}>{ar ? 'تأكيد' : 'Confirm'}</button><button type="button" onClick={() => setConfirmSignOutAll(false)}>{ar ? 'إلغاء' : 'Cancel'}</button></div>}</div>
        </section>
      </>}

      <section className="panel profile-privacy-note">
        <div><ShieldCheck size={17}/><strong>{ar ? 'الخصوصية والتخزين' : 'Privacy and storage'}</strong></div>
        <p>{cloudMode ? (ar ? 'جلسة الحساب تستخدم ملفات تعريف ارتباط أساسية HttpOnly وآمنة للمصادقة والحماية من الطلبات المزيفة. لا نستخدمها لتتبعك. إعدادات التحليلات الاختيارية تبقى تحت تحكمك في الإعدادات.' : 'Account sessions use essential secure HttpOnly cookies for authentication and CSRF protection. They are not tracking cookies. Optional analytics remain controlled from Settings.') : (ar ? 'الملف المحلي لا ينشئ جلسة دخول أو ملف تعريف ارتباط للحساب. إعدادات التحليلات الاختيارية يمكن مراجعتها من صفحة الإعدادات.' : 'A local profile does not create an account session cookie. Optional analytics preferences can be reviewed in Settings.')}</p>
      </section>

      {crop && <ImageCropOverlay key={crop.file.name + crop.file.size} file={crop.file} kind={crop.kind} language={language} onCancel={() => setCrop(null)} onConfirm={(dataUrl) => { update('avatarData', dataUrl); setCrop(null); }}/>} 
      {imageSheet && <ImageActionSheet language={language} canView={Boolean(draft.avatarData)} onView={() => { setImageSheet(null); setImageViewer('avatar'); }} onEdit={() => avatarRef.current?.click()} onClose={() => setImageSheet(null)}/>} 
      {imageViewer === 'avatar' && draft.avatarData && <ImageViewer src={draft.avatarData} alt={ar ? 'الصورة الشخصية' : 'Profile photo'} language={language} onClose={() => setImageViewer(null)}/>} 
      {dirty && <button ref={reminderRef} type="button" key={nudge} className={`profile-save-reminder is-level-${reminderLevel} is-nudging`} onClick={() => saveRef.current?.click()} aria-label={reminderText}><Save size={14} aria-hidden="true"/><span>{reminderText}</span></button>}
    </section>
  );
}
