import { useEffect, useRef, useState } from 'react';
import { Accessibility, Bell, Database, Globe2, Moon, Sun, RotateCcw, Smartphone, Trash2, Download, Upload, HardDrive, Wifi, X, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { clearNotifications } from '../services/notificationService';
import { getItem, putItem, exportTaamenBackup, importTaamenBackup, BackupError, isBackupFileTooLarge, readBackupFile } from '../services/localDb';
import { installService } from '../infrastructure/pwa/installService';
import { PushSettings } from '../components/PushSettings';
import { exportFilename, profileExportName } from '../services/exportFilename';
import { resetTaamenComplete, type ResetResult } from '../services/resetService';
import { shellCopy, uiCopy } from '../i18n/translations';
import { LanguagePicker, ThemeToggle } from '../components/ShellControls';
import type { LocaleCode } from '../i18n/languages';
import type { TaamenTheme } from '../theme/theme';
import type { CloudUser } from '../services/cloudAuthClient';
import type { LocalProfile } from '../services/profileRepository';
import { applyMotionPreference } from '../motion/prefersReduced';
import { syncAhrefsAnalytics } from '../services/analytics';
import { useOverlayPresence } from '../motion/useOverlayPresence';

type PrivacyPrefs={notifications?:boolean;analytics?:boolean;motion?:boolean};

export default function Settings({language,profile,cloudUser=null,selectedLocale,onLocaleChange,theme,onTheme,onReset}:{language:'ar'|'en';profile:LocalProfile;cloudUser?:CloudUser|null;selectedLocale:LocaleCode;onLocaleChange:(locale:LocaleCode)=>void;theme:TaamenTheme;onTheme:()=>void;onReset:()=>void}){
 const ar=language==='ar';
 const copy=uiCopy[language];
 const [notify,setNotify]=useState(true); const [analytics,setAnalytics]=useState(false); const [motion,setMotion]=useState(true);
 const [status,setStatus]=useState(''); const restoreRef=useRef<HTMLInputElement>(null);
 const [showResetModal,setShowResetModal]=useState(false); const [resetting,setResetting]=useState(false);
 const [resetResult,setResetResult]=useState<ResetResult | null>(null);
 useEffect(()=>{getItem<PrivacyPrefs&{id:string}>('settings','privacy').then(v=>{if(v){setNotify(v.notifications!==false);setAnalytics(v.analytics===true);setMotion(v.motion!==false)}})},[]);
 // The switch now drives real motion through html[data-taamen-motion].
 useEffect(()=>{applyMotionPreference(motion)},[motion]);
 useEffect(()=>{
  if(!showResetModal)return;
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')closeResetModal()};
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[showResetModal,resetting]);
 const persistPrefs=(next:PrivacyPrefs)=>putItem('settings',{id:'privacy',notifications:notify,analytics,motion,...next});
 const backup=async()=>{try{const data=await exportTaamenBackup();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=exportFilename(profileExportName(profile));a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);setStatus(uiCopy[language].backupExported)}catch{setStatus(uiCopy[language].backupExportFailed)}};
 const restore=async(file?:File)=>{if(!file)return;try{if(isBackupFileTooLarge(file.size))throw new BackupError('invalid');await importTaamenBackup(await readBackupFile(file));setStatus(uiCopy[language].backupImported);setTimeout(()=>location.reload(),500)}catch(caught){setStatus(caught instanceof BackupError&&caught.code==='unsupported-version'?uiCopy[language].backupUnsupported:uiCopy[language].backupInvalid)}};
 const startReset=()=>{setShowResetModal(true);setResetting(false);setResetResult(null)};
 const resetOverlay=useOverlayPresence<HTMLDivElement,HTMLDivElement>('modal',()=>setShowResetModal(false),showResetModal);
 const closeResetModal=()=>{if(!resetting)resetOverlay.requestClose()};
 const handleBackdropClick=(e:React.MouseEvent)=>{if(e.target===e.currentTarget)closeResetModal()};
 const executeReset=async()=>{
  setResetting(true);
  try{
    const result=await resetTaamenComplete();
    setResetResult(result);
    if(result.success){
      await onReset();
      setShowResetModal(false);
      setTimeout(()=>location.reload(),100);
    }else{
      setResetting(false);
    }
  }catch{
    setResetResult({success:false,clearedStores:[],errors:[copy.resetModalUnexpected]});
    setResetting(false);
  }
};
 return <section className="page-content settings-page">
   <div className="page-heading"><div><p className="eyebrow">TAAMEN 2.0 / SETTINGS</p><h1>{ar?'الإعدادات':'Settings'}</h1><p className="subtitle">{cloudUser ? (ar?'تحكم بتفضيلات هذا الجهاز وخصوصية جلسة حسابك السحابي.':'Manage this device’s preferences and your cloud-account privacy.') : (ar?'تحكم بالتجربة والبيانات المحلية والخصوصية على هذا الجهاز.':'Control your local TAAMEN experience, data and privacy on this device.')}</p></div></div>
   {status&&<div className="success-banner">{status}</div>}
   {showResetModal&&<div className="overlay" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title"><div ref={resetOverlay.backdropRef} className="overlay-backdrop" onClick={handleBackdropClick}/><div ref={resetOverlay.panelRef} className="modal-card danger-modal"><div className="panel-heading"><div><p className="eyebrow">SECURITY & DATA</p><h2 id="reset-modal-title">{copy.resetModalTitle}</h2></div><button className="icon-button" onClick={closeResetModal} disabled={resetting} aria-label={copy.resetModalCancel}><X/></button></div><div className="danger-modal-content">{!resetResult?<>
    <AlertTriangle size={28} className="danger-icon"/>
    <p>{copy.resetModalBody}</p>
    <div className="reset-scope">
      <strong>{copy.resetModalRemovedLabel}</strong>
      <p>{copy.resetModalRemoved}</p>
    </div>
    <div className="reset-not-removed">
      <strong>{copy.resetModalKeptLabel}</strong>
      <p>{copy.resetModalKept}</p>
    </div>
    <p className="danger-warning">{copy.resetModalWarning}</p>
    <div className="modal-actions">
      <button type="button" className="text-button" onClick={closeResetModal} disabled={resetting}>{copy.resetModalCancel}</button>
      <button type="button" className="primary-action danger" onClick={executeReset} disabled={resetting}>{copy.resetModalConfirm}</button>
    </div>
  </>:<>
    {resetResult.success?<><CheckCircle2 size={28} className="success-icon"/><p>{copy.resetModalSuccess}</p><p className="danger-warning">{copy.resetModalReloading}</p></>:<>
      <XCircle size={28} className="danger-icon"/><p>{copy.resetModalFailed}</p>
      {resetResult.errors.length>0&&<div className="error-list"><strong>{copy.resetModalErrors}</strong><ul>{resetResult.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></div>}
      <button type="button" className="primary-action" onClick={()=>setShowResetModal(false)}>{copy.closeViewer}</button>
    </>}
  </>}</div></div></div>}
   <div className="settings-grid" data-tour="settings">
    <section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">PREFERENCES</p><h2>{ar?'المظهر واللغة':'Appearance & language'}</h2></div></div><div className="setting-row"><span><Globe2 size={16}/>{ar?'اللغة':'Language'}</span><LanguagePicker language={language} selectedLocale={selectedLocale} onChange={onLocaleChange}/></div><div className="setting-row"><span>{theme==='dark'?<Moon size={16}/>:<Sun size={16}/>}{shellCopy[language].themeLabel}</span><span className="status-chip muted">{theme==='dark'?shellCopy[language].themeDark:shellCopy[language].themeLight}</span><ThemeToggle theme={theme} onTheme={onTheme} language={language}/></div><div className="setting-row"><span><Moon size={16}/>{ar?'الحركة':'Motion'}</span><input type="checkbox" checked={motion} onChange={e=>{setMotion(e.target.checked);persistPrefs({motion:e.target.checked})}}/></div><div className="setting-row"><span><Accessibility size={16}/>{ar?'إتاحة الوصول':'Accessibility'}</span><span className="status-chip muted">{ar?'مراعية للنظام':'System aware'}</span></div></section>
    <section className="panel settings-panel notifications-privacy-panel"><div className="panel-heading"><div><p className="eyebrow">NOTIFICATIONS & PRIVACY</p><h2>{ar?'الإشعارات والخصوصية':'Notifications & privacy'}</h2></div></div><div className="setting-row"><span><Bell size={16}/>{ar?'تنبيهات داخل التطبيق':'In-app notifications'}</span><input type="checkbox" checked={notify} onChange={e=>{setNotify(e.target.checked);persistPrefs({notifications:e.target.checked})}}/></div><p className="settings-note">{ar?'يتحكم هذا المفتاح بالتنبيهات المحلية التي تظهر داخل TAAMEN. إعدادات الدفع أدناه منفصلة للتذكير خارج التطبيق.':'This switch controls local notices inside TAAMEN. The push controls below separately manage reminders outside the app.'}</p><div className="setting-row"><span>{ar?'مشاركة بيانات الاستخدام التحليلية':'Usage analytics'}</span><input type="checkbox" checked={analytics} aria-label={ar?'التحليلات':'Analytics'} onChange={e=>{const next=e.target.checked;setAnalytics(next);persistPrefs({analytics:next});syncAhrefsAnalytics(next)}}/></div><p className="settings-note">{ar?'عند الإيقاف، يُزال سكربت التحليلات من الصفحة.':'When disabled, the analytics script is removed from the page.'}</p><p className="settings-note">{cloudUser ? (ar?'ملفات جلسة الحساب ضرورية لتسجيل الدخول وحماية الطلبات. لا تُستخدم للتتبع، ويمكن إنهاءها بتسجيل الخروج.':'Account session cookies are essential for sign-in and request protection. They are not used for tracking and are cleared when you sign out.') : (ar?'الملف المحلي لا يحتاج ملفات ارتباط لحساب سحابي. التحليلات الاختيارية فقط تخضع لتفضيلك أعلاه.':'A local profile does not use cloud-account session cookies. Only optional analytics follow the preference above.')}</p><p className="settings-note"><a className="policy-link" href="/privacy">{copy.privacyPolicyTitle}</a> · <a className="policy-link" href="/terms">{copy.termsTitle}</a></p><button className="text-button danger" onClick={()=>clearNotifications()}><Trash2 size={14}/>{ar?'حذف الإشعارات المحلية':'Clear local notifications'}</button><PushSettings language={language} embedded /></section>
    <section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">STORAGE</p><h2>{ar?'البيانات والتثبيت':'Data & installation'}</h2></div><Database size={17}/></div><div className="setting-row"><span><HardDrive size={16}/>{ar?'التخزين المحلي':'Local storage'}</span><span className="status-chip">IndexedDB</span></div><div className="setting-row"><span><Wifi size={16}/>{ar?'الشبكة':'Network'}</span><span className="status-chip">{navigator.onLine?(ar?'متصل':'Online'):(ar?'دون اتصال':'Offline')}</span></div><div className="backup-actions"><button className="dark-action" onClick={backup}><Download size={14}/>{ar?'تصدير البيانات':'Export data'}</button><button className="dark-action" onClick={()=>restoreRef.current?.click()}><Upload size={14}/>{ar?'استيراد البيانات':'Import data'}</button><input ref={restoreRef} hidden type="file" accept="application/json,.json" onChange={e=>restore(e.target.files?.[0])}/></div><div className="setting-row"><span><Smartphone size={16}/>{ar?'تثبيت TAAMEN':'Install TAAMEN'}</span><span className="status-chip">{installService.getInstallationState()}</span></div>{installService.canPromptInstall()&&<button className="primary-action" onClick={()=>installService.promptInstall()}>{ar?'تثبيت الآن':'Install now'}</button>}<p className="settings-note">{ar?'يمكن تثبيت TAAMEN كتطبيق. إشعارات الخلفية تعمل بعد تفعيلها إذا كان الجهاز يدعم Web Push. TAAMEN لا يبقى يعمل في الخلفية.':'TAAMEN can be installed as an app. Background reminders work after you enable them when the device supports Web Push. TAAMEN does not keep running in the background.'}</p></section>
    <section className="panel settings-panel danger-zone"><div className="panel-heading"><div><p className="eyebrow">SECURITY & DATA</p><h2>{ar?'إعادة ضبط بيانات TAAMEN':'Reset TAAMEN Data'}</h2></div><RotateCcw size={18}/></div><p>{ar?'يحذف جميع بيانات TAAMEN المحلية من هذا المتصفح ويعيد التطبيق إلى حالته الأولية.':'Removes all TAAMEN local data from this browser and returns the application to its initial setup state.'}</p><p className="danger-zone-note">{ar?'لا يحذف بيانات المواقع الأخرى أو سجل المتصفح.':'Does not delete other websites\' data or browser history.'}</p><button className="danger-action" onClick={startReset}><RotateCcw size={15}/>{ar?'إعادة ضبط البيانات المحلية':'Reset local data'}</button></section>
   </div>
 </section>;
}
