import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bell, Settings2, LogIn } from 'lucide-react';
import { AuthEntry } from './components/AuthEntry';
import { cloudAuthClient, type CloudUser } from './services/cloudAuthClient';
import { NotificationCenter } from './components/NotificationCenter';
import { getProfile, removeProfile, saveProfile, type LocalProfile } from './services/profileRepository';
import { unreadCount } from './services/notificationService';
import { reconcileMatchLifecycle } from './services/matchRepository';
import PublicSharePreview from './components/PublicSharePreview';
import { routeRegistry, routesForScope, routesForMobileNav, routesForDesktopNav, routesBySection, type RouteId } from './config/routes';
import { TAAMEN_LOGO_ALT, TAAMEN_LOGO_SRC } from './config/branding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InstallBanner } from './shared/ui/InstallBanner';
import { installService } from './infrastructure/pwa/installService';
import TaamenAmbientBackground from './components/ui/taamen-ambient-background';
import PageStage from './motion/PageStage';
import NavActiveIndicator from './motion/NavActiveIndicator';
import { applyMotionPreference, prefersReducedMotion } from './motion/prefersReduced';
import { playAuthChime } from './motion/authChime';
import { getItem } from './services/localDb';
import { createCloudTacticalPlanLibraryRepository } from './services/cloudTacticalPlanLibraryRepository';
import { analyticsEnabled, syncAhrefsAnalytics } from './services/analytics';
import { legalDocumentForPath } from './config/publicRoutes';
import LegalDocument from './pages/LegalDocument';
import PrivacyPolicyModal, { hasAcceptedConsent, recordConsent } from './components/PrivacyPolicyModal';
import { POLICY_VERSION } from './config/consent';
import { NotificationToast } from './components/NotificationToast';
import { installCopy } from './i18n/translations';
import { contentLanguageForLocale, localeDirection, parseLocale, type LocaleCode } from './i18n/languages';
import { getLocalizedRouteLabel, getLocalizedSectionLabel } from './i18n/localeCopy';
import { FirstVisitExperience } from './components/FirstVisitExperience';
import { useDisplayMode } from './mobile/useDisplayMode';
import { RouteSkeleton } from './components/RouteSkeleton';
import { applyTheme, nextTheme, readTheme, type TaamenTheme } from './theme/theme';
import LocalAccessPrompt from './components/LocalAccessPrompt';
import './styles/global.css';
import './styles/taamen-ambient-background.css';

const cloudTacticalPlanLibraryRepository = createCloudTacticalPlanLibraryRepository();
const Home=lazy(()=>import('./pages/Home')); const PlayCenter=lazy(()=>import('./pages/PlayCenter')); const Analytics=lazy(()=>import('./pages/Analytics')); const Assistant=lazy(()=>import('./pages/Assistant')); const AccountHub=lazy(()=>import('./pages/AccountHub')); const Archive=lazy(()=>import('./pages/Archive')); const Matches=lazy(()=>import('./pages/Matches')); const TacticalBoard=lazy(()=>import('./pages/TacticalBoard')); const Stadiums=lazy(()=>import('./pages/Stadiums')); const Profile=lazy(()=>import('./components/Profile')); const Settings=lazy(()=>import('./pages/Settings')); const Support=lazy(()=>import('./pages/Support'));
type Language='ar'|'en';

type ShellProps={
 language:Language;
 profile:LocalProfile;
 isLocalSignedIn:boolean;
 cloudUser:CloudUser|null;
 onCloudUser:(user:CloudUser|null)=>void;
 onOpenAccess:(initialStage?:'choices'|'cloud'|'email')=>void;
 onProfile:(p:LocalProfile)=>void;
 onReset:()=>void;
 onLanguage:()=>void;
 selectedLocale:LocaleCode;
 onLocaleChange:(locale:LocaleCode)=>void;
 showFirstVisitPrompt:boolean;
 onDismissFirstVisitPrompt:()=>void;
 theme:TaamenTheme;
 onTheme:()=>void;
 onRequireLocalLogin:(action?:string)=>void;
 onPage:(p:RouteId)=>void;
};

function RouteView({page,language,profile,isLocalSignedIn,cloudUser,onCloudUser,onOpenAccess,go,onProfile,onReset,onLanguage,selectedLocale,onLocaleChange,theme,onTheme,onRequireLocalLogin,registerLeaveGuard}:ShellProps&{page:RouteId;go:(p:RouteId)=>void;registerLeaveGuard:(guard:(()=>boolean)|null)=>void}){
 const common={language};
 return <ErrorBoundary language={language} label={page}><Suspense fallback={<RouteSkeleton page={page}/> }>
  {page==='home'&&<Home {...common} profile={profile} go={go} canWrite={isLocalSignedIn}/>}
  {page==='play'&&<PlayCenter {...common} canWrite={isLocalSignedIn} cloudAccountReady={Boolean(cloudUser)} onRequireLocalLogin={onRequireLocalLogin} libraryRepository={cloudTacticalPlanLibraryRepository} go={go}/>}
  {page==='analytics'&&<Analytics {...common} go={go} canWrite={isLocalSignedIn} onRequireLocalLogin={onRequireLocalLogin}/>}
  {page==='assistant'&&<Assistant {...common} selectedLocale={selectedLocale} go={go} canWrite={isLocalSignedIn}/>}
  {page==='account-hub'&&<AccountHub {...common} cloudUser={cloudUser} go={go}/>}
  {page==='archive'&&<Archive {...common} canWrite={isLocalSignedIn} onRequireLocalLogin={onRequireLocalLogin}/>}
  {page==='match-center'&&<Matches {...common} canWrite={isLocalSignedIn} onRequireLocalLogin={onRequireLocalLogin}/>}
  {page==='tactical'&&<TacticalBoard {...common} canWrite={isLocalSignedIn} cloudAccountReady={Boolean(cloudUser)} onRequireLocalLogin={onRequireLocalLogin} libraryRepository={cloudTacticalPlanLibraryRepository} go={go}/>}
  {page==='stadiums'&&<Stadiums {...common} canWrite={isLocalSignedIn} onRequireLocalLogin={onRequireLocalLogin}/>}
  {page==='profile'&&isLocalSignedIn&&<Profile language={language} profile={profile} cloudUser={cloudUser} onCloudUser={onCloudUser} onOpenAccess={onOpenAccess} onSignOut={async()=>{await cloudAuthClient.logout();onCloudUser(null);const local=await saveProfile({...profile,email:'',emailVerified:false,firstName:profile.firstName,lastName:profile.lastName});onProfile(local);}} onSignOutAll={async()=>{await cloudAuthClient.logoutAll();onCloudUser(null);const local=await saveProfile({...profile,email:'',emailVerified:false,firstName:profile.firstName,lastName:profile.lastName});onProfile(local);}} onProfile={onProfile} registerLeaveGuard={registerLeaveGuard}/>}
  {page==='support'&&<Support language={language} profile={{...profile,email:cloudUser?.email||profile.email}}/>}
  {page==='settings'&&<Settings language={language} profile={profile} cloudUser={cloudUser} selectedLocale={selectedLocale} onLocaleChange={onLocaleChange} theme={theme} onTheme={onTheme} onReset={onReset}/>}
 </Suspense></ErrorBoundary>;
}

function MainShell(props:ShellProps){
 const {language,profile,isLocalSignedIn,cloudUser,onOpenAccess,onPage,onRequireLocalLogin,showFirstVisitPrompt,onDismissFirstVisitPrompt,selectedLocale,onLocaleChange}=props;
 const displayMode=useDisplayMode();
 const ar=language==='ar';
 const routes=useMemo(()=>routesForScope('normal'),[]);const mobileRoutes=useMemo(()=>routesForMobileNav('normal'),[]);const desktopSections=useMemo(()=>routesBySection('normal'),[]);const desktopRoutes=useMemo(()=>routesForDesktopNav('normal'),[]);const labels=routeRegistry.reduce((a,r)=>(a[r.id]=getLocalizedRouteLabel(r.id,selectedLocale,r.label[language]),a),{} as Record<string,string>); const[unread,setUnread]=useState(0);const[page,setPage]=useState<RouteId>(()=>(location.hash.slice(1) as RouteId)||'home');const[notifications,setNotifications]=useState(false);
 const pageRef=useRef(page); pageRef.current=page;
 const secondaryPages:RouteId[]=['account-hub','settings','support','profile'];
 const secondaryPage=secondaryPages.includes(page);
 const previousMainPageRef=useRef<RouteId>(secondaryPages.includes(page)?'home':page);
 const secondaryBackTargetsRef=useRef<Partial<Record<RouteId,RouteId>>>({});
 const sideNavRef=useRef<HTMLElement>(null);
 const bottomNavRef=useRef<HTMLElement>(null);
 const[bellPulse,setBellPulse]=useState(false);
 // Captured on the first render, before Home consumes the reveal flag.
 const navIntroDelay=useRef(0);
 const bellSkips=useRef(2);
 const previousUnread=useRef(0);
 const leaveGuardRef=useRef<(()=>boolean)|null>(null);
 const registerLeaveGuard=useCallback((guard:(()=>boolean)|null)=>{leaveGuardRef.current=guard},[]);
 const requestRoute=(next:RouteId)=>{
  if(next===pageRef.current) return true;
  return leaveGuardRef.current?.() ?? true;
 };
 const[sidebar,setSidebar]=useState<boolean>(()=>{
   const saved=localStorage.getItem('taamen-sidebar-collapsed');
   return saved!==null?saved!=='true':false;
 });
 const[desktopNav,setDesktopNav]=useState<boolean|null>(null);
 useEffect(()=>{
  const mq=window.matchMedia('(min-width: 901px)');
  const sync=()=>setDesktopNav(mq.matches);
  sync();
  mq.addEventListener('change',sync);
  return()=>mq.removeEventListener('change',sync);
 },[]);
 const toggleSidebar=()=>{
   setSidebar(x=>{
     const next=!x;
     localStorage.setItem('taamen-sidebar-collapsed',String(!next));
     return next;
   });
 };
 useEffect(()=>{
  if(!isLocalSignedIn){setUnread(0);return;}
  let boundary=0;
  let wake=0;
  let stopped=false;
  const armBoundary=(delay:number|null)=>{
   window.clearTimeout(boundary);
   boundary=0;
   if(stopped||document.hidden||delay==null)return;
   boundary=window.setTimeout(()=>{void refresh()},delay);
  };
  const refresh=async()=>{
   if(stopped||document.hidden)return;
   const result=await reconcileMatchLifecycle();
   if(stopped)return;
   setUnread(await unreadCount());
   armBoundary(result.nextDelayMs);
  };
  const onWake=()=>{
   window.clearTimeout(wake);
   if(document.hidden){window.clearTimeout(boundary);boundary=0;return}
   wake=window.setTimeout(()=>{void refresh()},200);
  };
  void refresh();
  document.addEventListener('visibilitychange',onWake);
  window.addEventListener('focus',onWake);
  window.addEventListener('online',onWake);
  window.addEventListener('taamen-matches-changed',onWake);
  const onNotification=()=>{void unreadCount().then(count=>{if(!stopped)setUnread(count)})};
  window.addEventListener('taamen-notification',onNotification);
  return()=>{
   stopped=true;
   window.clearTimeout(boundary);
   window.clearTimeout(wake);
   document.removeEventListener('visibilitychange',onWake);
   window.removeEventListener('focus',onWake);
   window.removeEventListener('online',onWake);
   window.removeEventListener('taamen-matches-changed',onWake);
   window.removeEventListener('taamen-notification',onNotification);
  };
 },[isLocalSignedIn]);
 const skipPageRefresh=useRef(true);
 useEffect(()=>{
  if(skipPageRefresh.current){skipPageRefresh.current=false;return}
  if(!isLocalSignedIn){setUnread(0);return;}
  if(document.hidden)return;
  let active=true;
  unreadCount().then(count=>{if(active)setUnread(count)});
  return()=>{active=false};
 },[page,isLocalSignedIn]);
 useEffect(()=>{onPage(page)},[onPage,page]);
 // A single emphasis when new notifications arrive, never on the boot count.
 useEffect(()=>{
  const grew=unread>previousUnread.current;
  previousUnread.current=unread;
  if(bellSkips.current>0){bellSkips.current-=1;return}
  if(!grew||prefersReducedMotion())return;
  setBellPulse(true);
  const id=window.setTimeout(()=>setBellPulse(false),220);
  return()=>window.clearTimeout(id);
 },[unread]);
 useEffect(()=>{if(!routes.some(r=>r.id===page)){const fallback='home';setPage(fallback);history.replaceState(null,'',`${location.pathname}#${fallback}`)}},[routes,page]);
 useEffect(()=>{const onHash=()=>{const next=location.hash.slice(1) as RouteId;if(!routes.some(r=>r.id===next)){history.replaceState(null,'',`${location.pathname}#${pageRef.current}`);return}if(!requestRoute(next)){history.replaceState(null,'',`${location.pathname}#${pageRef.current}`);return;}setPage(next)};window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash)},[routes]);
 const go=(p:RouteId,options?:{source?:'topbar-avatar'})=>{
  if(!routes.some(r=>r.id===p)||p===pageRef.current)return;
  if(p==='profile'&&!isLocalSignedIn){onRequireLocalLogin('الملف الشخصي');return;}
  if(!requestRoute(p))return;
  const current=pageRef.current;
  if(p==='account-hub'){
   const origin=secondaryPages.includes(current)?previousMainPageRef.current:current;
   secondaryBackTargetsRef.current[p]=routes.some(route=>route.id===origin&&!secondaryPages.includes(route.id))?origin:'home';
  }else if(p==='settings'||p==='support'){
   secondaryBackTargetsRef.current[p]='account-hub';
  }else if(p==='profile'){
   secondaryBackTargetsRef.current[p]=options?.source==='topbar-avatar'?current:'account-hub';
  }
  if(secondaryPages.includes(p)){
   if(!secondaryPage)previousMainPageRef.current=current;
  }else{
   previousMainPageRef.current=p;
  }
  setPage(p);
  history.replaceState(null,'',`${location.pathname}#${p}`);
  const compact=window.matchMedia('(max-width: 900px)').matches;
  window.scrollTo({top:0,behavior:compact||prefersReducedMotion()?'auto':'smooth'});
 };
 const goBackToPreviousMain=()=>{
  const configured=secondaryBackTargetsRef.current[page];
  const fallback=page==='settings'||page==='support'?'account-hub':page==='profile'?'account-hub':previousMainPageRef.current;
  const destination=configured||fallback;
  if(!routes.some(route=>route.id===destination)||!requestRoute(destination))return;
  setPage(destination);
  if(!secondaryPages.includes(destination))previousMainPageRef.current=destination;
  history.replaceState(null,'',`${location.pathname}#${destination}`);
  window.scrollTo({top:0,behavior:prefersReducedMotion()?'auto':'smooth'});
 };
 const identityCaption=cloudUser?(ar?'حساب سحابي موثّق':'VERIFIED CLOUD ACCOUNT'):(ar?'ملف محلي · هذا الجهاز':'LOCAL · THIS DEVICE');
 const navClass=desktopNav===null?'':desktopNav?'is-desktop-nav':'is-mobile-nav';
 return <div className={`app-shell ${navClass} is-${displayMode}${secondaryPage?' is-account-section':''}`}>
  <aside className={`sidebar ${sidebar?'':'is-collapsed'}`} hidden={desktopNav===false} aria-hidden={desktopNav===false} inert={desktopNav===false||undefined}>
   <div className={`brand-row ${sidebar?'':'is-collapsed'}`}>
     {sidebar && (
       <button type="button" className="brand-identity" onClick={()=>go('home')} title={labels.home} aria-label={labels.home}>
         <span className="brand-name">TAAMEN 2.0</span>
       </button>
     )}
     <button
       type="button"
       className={`hamburger-toggle ${sidebar?'is-expanded':'is-collapsed'}`}
       onClick={toggleSidebar}
       aria-expanded={sidebar}
       aria-label={sidebar?(ar?'طي الشريط الجانبي':'Collapse navigation'):(ar?'توسيع القائمة':'Expand navigation')}
       title={sidebar?(ar?'طي الشريط الجانبي':'Collapse navigation'):(ar?'توسيع القائمة':'Expand navigation')}
     >
       <span className="hamburger-box">
         <span className="hamburger-line line-1"/>
         <span className="hamburger-line line-2"/>
         <span className="hamburger-line line-3"/>
       </span>
     </button>
   </div>
   <nav className="side-nav" ref={sideNavRef} aria-label={ar?'التنقل الرئيسي':'Primary navigation'}><NavActiveIndicator navRef={sideNavRef} activeKey={page} watch={[sidebar,language,desktopNav]} introDelay={navIntroDelay.current}/>{sidebar?Object.entries(desktopSections).map(([sectionKey,sectionRoutes])=>sectionRoutes.length>0?<div key={sectionKey} className="nav-section"><span className="nav-section-label">{getLocalizedSectionLabel(sectionKey as 'core'|'football'|'personal'|'system',selectedLocale)}</span>{sectionRoutes.map(r=>{const Icon=r.icon;return <button key={r.id} className={`nav-item ${page===r.id?'is-active':''}`} data-route={r.id} onClick={()=>go(r.id)} aria-current={page===r.id?'page':undefined}><span className="nav-icon-motion"><Icon size={18}/></span><span>{labels[r.id]}</span></button>})}</div>:null):desktopRoutes.map(r=>{const Icon=r.icon;return <button key={r.id} className={`nav-item ${page===r.id?'is-active':''}`} data-route={r.id} onClick={()=>go(r.id)} aria-current={page===r.id?'page':undefined}><span className="nav-icon-motion"><Icon size={18}/></span><span className="tooltip">{labels[r.id]}</span></button>})}</nav>
  <div className="sidebar-footer">{isLocalSignedIn?<><button className="avatar avatar-button" title={labels.profile} onClick={()=>go('profile')}>{profile.avatarData?<img src={profile.avatarData} alt=""/>:profile.firstName.slice(0,1)}</button>{sidebar&&<div className="user-caption"><strong>{profile.firstName} {profile.lastName}</strong><span>{identityCaption}</span></div>}</>:<button type="button" className="sidebar-local-login" onClick={()=>onOpenAccess('choices')}><LogIn size={16}/>{sidebar&&(ar?'تسجيل الدخول':'Sign in')}</button>}</div>
  </aside>
  <main className="main-content"><InstallBanner language={language}/><header className="topbar"><button type="button" className="topbar-brand" onClick={()=>go('home')} aria-label={ar?'العودة إلى الرئيسية':'Go to home'} title={ar?'الرئيسية':'Home'}><img className="brand-image" src="/assets/taamen-topbar-mark.png" alt="" width={40} height={40} decoding="async"/></button><div className="topbar-actions">{secondaryPage&&<button className="topbar-icon-button topbar-back" onClick={goBackToPreviousMain} aria-label={ar?'العودة إلى الصفحة السابقة':'Return to previous page'} title={ar?'رجوع':'Back'}><ArrowLeft size={18}/></button>}{isLocalSignedIn?<button className="avatar topbar-profile" onClick={()=>go('profile',{source:'topbar-avatar'})} aria-label={labels.profile} title={labels.profile}>{profile.avatarData?<img src={profile.avatarData} alt=""/>:profile.firstName.slice(0,1)}</button>:<button type="button" className="topbar-local-login" onClick={()=>onOpenAccess('choices')}><LogIn size={16}/><span>{ar?'تسجيل الدخول':'Sign in'}</span></button>}{!secondaryPage&&<button type="button" className="topbar-icon-button topbar-settings" onClick={()=>go('account-hub')} aria-label={ar?'الإعدادات والحساب':'Account and settings'} title={ar?'الإعدادات والحساب':'Account and settings'}><Settings2 size={18}/></button>}{isLocalSignedIn&&<button className={`notification-button icon-button${bellPulse?' is-pulse':''}`} onClick={()=>setNotifications(true)} aria-label={ar?'الإشعارات':'Notifications'}><Bell size={18}/>{unread>0&&<i>{unread>99?'99+':unread}</i>}</button>}</div></header>
   <PageStage page={page}><RouteView {...props} selectedLocale={selectedLocale} onLocaleChange={onLocaleChange} page={page} go={go} registerLeaveGuard={registerLeaveGuard}/></PageStage>
   <NotificationToast language={language} onOpen={()=>setNotifications(true)}/>
   <FirstVisitExperience language={language} selectedLocale={selectedLocale} open={showFirstVisitPrompt} onDismiss={onDismissFirstVisitPrompt} onNavigate={go}/>
   <nav className="bottom-nav" ref={bottomNavRef} aria-label={ar?'تنقل الهاتف':'Mobile navigation'} hidden={desktopNav===true} aria-hidden={desktopNav===true} inert={desktopNav===true||undefined}><NavActiveIndicator navRef={bottomNavRef} activeKey={page} watch={[language,desktopNav,secondaryPage]} introDelay={navIntroDelay.current} className="is-bottom"/>{mobileRoutes.map(r=>{const Icon=r.icon;return <button type="button" className={`bottom-nav-item ${page===r.id?'is-active':''}`} data-route={r.id} key={r.id} aria-label={labels[r.id]} aria-current={page===r.id?'page':undefined} onClick={()=>go(r.id)}><span className="nav-icon-motion"><Icon size={18}/></span><span>{labels[r.id]}</span></button>})}</nav>
   {/* Mounted only while open so overlay hooks and scroll-lock match other sheets. */}
   {notifications&&<NotificationCenter open={notifications} onClose={()=>setNotifications(false)} language={language} onChanged={()=>unreadCount().then(setUnread)}/>}
  </main>
 </div>;
}

export default function App(){
 const [pathName,setPathName]=useState(()=>{const path=window.location.pathname.replace(/\/+$/, '')||'/';if(path==='/acquisition'){history.replaceState({taamen:'removed-acquisition'},'','/#home');return '/';}return path;});
 useEffect(()=>{
  const sync=()=>{
   const next=window.location.pathname.replace(/\/+$/, '')||'/';
   if(next==='/acquisition'){
    history.replaceState({taamen:'removed-acquisition'},'','/#home');
    setPathName('/');
    return;
   }
   if(next==='/trophy'){
    history.replaceState({taamen:'retired-challenge'},'','/#home');
    setPathName('/');
    return;
   }
   setPathName(next);
  };
  if(window.location.pathname.replace(/\/+$/, '')==='/trophy'){
   history.replaceState({taamen:'retired-challenge'},'','/#home');
   setPathName('/');
  }
  window.addEventListener('popstate',sync);
  return()=>window.removeEventListener('popstate',sync);
 },[]);
 const returnHome=useCallback(()=>{
  history.pushState({taamen:'home'},'','/#home');
  setPathName('/');
 },[]);
 const sharePath=pathName.match(/^\/share\/(match|profile)\/(.+)$/);
 const legalDocument=legalDocumentForPath(pathName);
 const[selectedLocale,setSelectedLocale]=useState<LocaleCode>(()=>parseLocale(localStorage.getItem('taamen-language')));
 const language:Language=contentLanguageForLocale(selectedLocale);
 const[theme,setTheme]=useState<TaamenTheme>(()=>readTheme());
 const[profile,setProfile]=useState<LocalProfile>();
 const[boot,setBoot]=useState(true);
 const[updateAvailable,setUpdateAvailable]=useState(false);
 const[updateDismissed,setUpdateDismissed]=useState(false);
 const[shellPage,setShellPage]=useState<RouteId>('home');
 const[needsConsent,setNeedsConsent]=useState(false);
 const[showAuthEntry,setShowAuthEntry]=useState(false);
 const[showFirstVisitPrompt,setShowFirstVisitPrompt]=useState(false);
 const[authEntryStart,setAuthEntryStart]=useState<'choices'|'cloud'|'email'>('choices');
 const[cloudUser,setCloudUser]=useState<CloudUser|null>(null);
 const[entrySuccessNotice,setEntrySuccessNotice]=useState<'local'|'cloud'|null>(null);
 const[localAccessPrompt,setLocalAccessPrompt]=useState<{open:boolean;action?:string}>({open:false});

 useEffect(()=>{try{localStorage.removeItem('taamen-challenge-queue')}catch{}installService.init();const onUpdate=()=>{setUpdateDismissed(false);setUpdateAvailable(true)};window.addEventListener('taamen-sw-update',onUpdate);return()=>window.removeEventListener('taamen-sw-update',onUpdate)},[]);
 useEffect(()=>{document.documentElement.lang=selectedLocale;document.documentElement.dir=localeDirection(selectedLocale);document.documentElement.dataset.locale=selectedLocale;try{localStorage.setItem('taamen-language',selectedLocale)}catch{}},[language,selectedLocale]);
 useEffect(()=>{if(!entrySuccessNotice)return;const id=window.setTimeout(()=>setEntrySuccessNotice(null),6500);return()=>window.clearTimeout(id)},[entrySuccessNotice]);
 useEffect(()=>{applyTheme(theme)},[theme]);
 const toggleTheme=()=>setTheme(value=>nextTheme(value));
 // The Settings motion switch has to apply from boot, not only while Settings is open.
 useEffect(()=>{getItem<{motion?:boolean;analytics?:boolean}>('settings','privacy').then(v=>{applyMotionPreference(v?.motion!==false);syncAhrefsAnalytics(analyticsEnabled(v))}).catch(()=>{})},[]);
 useEffect(()=>{
  if(!profile)return;
  const run=()=>{void import('./pages/Archive');void import('./pages/Matches')};
  const idle=window.requestIdleCallback?.(run,{timeout:2000});
  if(typeof idle==='number')return()=>window.cancelIdleCallback(idle);
  const id=window.setTimeout(run,1500);
  return()=>window.clearTimeout(id);
 },[profile]);

 // Local profile and verified cloud session are separate identities. A cloud session never
 // proves ownership of pre-existing local records and never uploads them automatically.
 useEffect(()=>{
  let active=true;
  Promise.all([
   getProfile(),
   cloudAuthClient.getSession().catch(()=>({authenticated:false} as const)),
  ]).then(async([storedProfile,session])=>{
   if(!active)return;
   let current=storedProfile;
   if(session.authenticated){
    setCloudUser(session.user);
    if(session.user.accountPolicy?.version===POLICY_VERSION)recordConsent();
    const merged=await saveProfile({
     ...(current??{firstName:session.user.firstName,lastName:session.user.lastName,email:'',phone:'',avatarData:'',emailVerified:false}),
     firstName:session.user.firstName||current?.firstName||'',
     lastName:session.user.lastName||current?.lastName||'',
     email:'',
     emailVerified:false,
    });
    current=merged;
    try{localStorage.setItem('taamen-entry-mode','cloud')}catch{}
   }
   setProfile(current);
   setNeedsConsent(Boolean(current)&&!hasAcceptedConsent());
   // First contact is always guest-first. Account creation is offered only when a
   // user explicitly requests a feature that needs a local profile or cloud identity.
   if(!current&&!session.authenticated){
    try{
     if(!localStorage.getItem('taamen-entry-mode'))localStorage.setItem('taamen-entry-mode','guest');
     setShowFirstVisitPrompt(!sharePath&&localStorage.getItem('taamen-onboarding-v1')!=='done');
    }catch{setShowFirstVisitPrompt(!sharePath)}
   }
   setShowAuthEntry(false);
   setBoot(false);
  }).catch(()=>{if(active){
   setProfile(undefined);
   setShowAuthEntry(false);
   try{
    if(!localStorage.getItem('taamen-entry-mode'))localStorage.setItem('taamen-entry-mode','guest');
    setShowFirstVisitPrompt(!sharePath&&localStorage.getItem('taamen-onboarding-v1')!=='done');
   }catch{setShowFirstVisitPrompt(!sharePath)}
   setBoot(false);
  }});
  return()=>{active=false};
 },[]);

 const toggle=()=>setSelectedLocale(x=>x==='ar'?'en':'ar');
 const changeLocale=useCallback((locale:LocaleCode)=>setSelectedLocale(locale),[]);
 const dismissFirstVisitPrompt=useCallback(()=>{setShowFirstVisitPrompt(false);try{localStorage.setItem('taamen-onboarding-v1','done')}catch{}},[]);

 const openAccess=useCallback((initialStage:'choices'|'cloud'|'email'='choices')=>{setAuthEntryStart(initialStage);setLocalAccessPrompt({open:false});playAuthChime();setShowAuthEntry(true)},[]);
 const beginLocalSignIn=useCallback(()=>openAccess(),[openAccess]);
 const requireLocalLogin=useCallback((action?:string)=>{if(!action){openAccess();return;}setLocalAccessPrompt({open:true,action})},[openAccess]);
 const closeAccess=useCallback(()=>{setShowAuthEntry(false);setLocalAccessPrompt({open:false})},[]);
 const saveLocalProfile=useCallback(async(p:Omit<LocalProfile,'id'|'updatedAt'>)=>{
  const saved=await saveProfile(p);setProfile(saved);setCloudUser(null);setShowAuthEntry(false);setLocalAccessPrompt({open:false});setEntrySuccessNotice('local');
  try{localStorage.setItem('taamen-entry-mode','local')}catch{}
 },[]);
 const acceptCloudUser=useCallback(async(user:CloudUser)=>{
  const current=profile;
  const saved=await saveProfile({
   ...(current??{firstName:user.firstName,lastName:user.lastName,email:'',phone:'',avatarData:'',emailVerified:false}),
   firstName:user.firstName||current?.firstName||'',
   lastName:user.lastName||current?.lastName||'',
   email:'',
   emailVerified:false,
  });
  if(user.accountPolicy?.version===POLICY_VERSION)recordConsent();
  setProfile(saved);setCloudUser(user);setShowAuthEntry(false);setLocalAccessPrompt({open:false});setNeedsConsent(!hasAcceptedConsent());setEntrySuccessNotice('cloud');
  try{localStorage.setItem('taamen-entry-mode','cloud')}catch{}
 },[profile]);

 /** Reset clears local TAAMEN data. */
 const resetProfile=useCallback(async()=>{
  await removeProfile();
  if(cloudUser){
   const restored=await saveProfile({firstName:cloudUser.firstName,lastName:cloudUser.lastName,email:'',phone:'',avatarData:'',emailVerified:false});
   setProfile(restored);
  }else{setProfile(undefined);try{localStorage.removeItem('taamen-entry-mode')}catch{}}
  setSelectedLocale('ar');
 },[cloudUser]);

 if(legalDocument)return <ErrorBoundary language={language} label={legalDocument}><LegalDocument language={language} onLanguage={toggle} documentId={legalDocument} selectedLocale={selectedLocale} onLocaleChange={changeLocale}/></ErrorBoundary>;
 if(boot)return <div className="boot-screen" role="status"><img src={TAAMEN_LOGO_SRC} alt={TAAMEN_LOGO_ALT} width={70} height={70}/></div>;
 if(sharePath){
  if(showAuthEntry)return <AuthEntry language={language} onLanguage={toggle} selectedLocale={selectedLocale} onLocaleChange={changeLocale} onClose={closeAccess} onLocalSave={saveLocalProfile} onCloudAuthenticated={acceptCloudUser} action={localAccessPrompt.action} initialStage={authEntryStart} initialFirstName={profile?.firstName || ''} initialLastName={profile?.lastName || ''}/>;
  return <><PublicSharePreview language={language} kind={sharePath[1] as 'match'|'profile'} token={decodeURIComponent(sharePath[2])} onHome={returnHome} onLanguage={toggle} selectedLocale={selectedLocale} onLocaleChange={changeLocale} canWrite={Boolean(profile)} onRequireLocalLogin={requireLocalLogin}/>{entrySuccessNotice&&<div className={`account-entry-success is-${entrySuccessNotice}`} role="status"><span>{entrySuccessNotice==='cloud'?(language==='ar'?'تم التحقق وربط حساب TAAMEN Cloud بنجاح. لم تُنقل بيانات جهازك.':'Your TAAMEN Cloud account is verified and connected. No device data was transferred.'):(language==='ar'?'تم إنشاء ملفك المحلي. بياناتك محفوظة على هذا الجهاز فقط.':'Your local profile is ready. Your data stays on this device.')}</span><button type="button" onClick={()=>setEntrySuccessNotice(null)} aria-label={language==='ar'?'إغلاق':'Dismiss'}>×</button></div>}{localAccessPrompt.open&&!profile&&<LocalAccessPrompt language={language} action={localAccessPrompt.action} onClose={()=>setLocalAccessPrompt({open:false})} onSignIn={beginLocalSignIn}/>}{needsConsent&&profile&&<PrivacyPolicyModal language={language} requireAccept onClose={()=>setNeedsConsent(false)}/>}</>;
 }
 /* One persistent atmosphere host. Keeping it first in both branches means the
    profile setup screen hands over to Home without the background cutting. */
 const atmosphere=<TaamenAmbientBackground key="atmosphere" variant={profile?'home':'auth'} active={!profile||shellPage==='home'}/>;
 const shellProfile:LocalProfile=profile??{id:'current',firstName:language==='ar'?'زائر':'Guest',lastName:'',email:'',phone:'',avatarData:'',emailVerified:false,updatedAt:0};
 if(showAuthEntry)return <>{atmosphere}<AuthEntry language={language} onLanguage={toggle} selectedLocale={selectedLocale} onLocaleChange={changeLocale} onClose={closeAccess} onLocalSave={saveLocalProfile} onCloudAuthenticated={acceptCloudUser} action={localAccessPrompt.action} initialStage={authEntryStart} initialFirstName={profile?.firstName || ''} initialLastName={profile?.lastName || ''}/></>;
 return <>{atmosphere}<div className="update-banner" hidden={!updateAvailable||updateDismissed} role="status"><span>{installCopy[language].update}</span><button className="primary-action" onClick={()=>navigator.serviceWorker?.getRegistration().then(r=>r?.waiting?.postMessage({type:'SKIP_WAITING'})).then(()=>location.reload())}>{installCopy[language].updateAction}</button><button type="button" className="icon-button" onClick={()=>setUpdateDismissed(true)} aria-label={installCopy[language].dismissUpdate}>×</button></div>{entrySuccessNotice&&<div className={`account-entry-success is-${entrySuccessNotice}`} role="status"><span>{entrySuccessNotice==='cloud'?(language==='ar'?'تم التحقق وربط حساب TAAMEN Cloud بنجاح. لم تُنقل بيانات جهازك.':'Your TAAMEN Cloud account is verified and connected. No device data was transferred.'):(language==='ar'?'تم إنشاء ملفك المحلي. بياناتك محفوظة على هذا الجهاز فقط.':'Your local profile is ready. Your data stays on this device.')}</span><button type="button" onClick={()=>setEntrySuccessNotice(null)} aria-label={language==='ar'?'إغلاق':'Dismiss'}>×</button></div>}<MainShell language={language} selectedLocale={selectedLocale} onLocaleChange={changeLocale} showFirstVisitPrompt={showFirstVisitPrompt} onDismissFirstVisitPrompt={dismissFirstVisitPrompt} profile={shellProfile} isLocalSignedIn={Boolean(profile)} cloudUser={cloudUser} onCloudUser={setCloudUser} onOpenAccess={openAccess} onProfile={setProfile} onReset={resetProfile} onLanguage={toggle} theme={theme} onTheme={toggleTheme} onRequireLocalLogin={requireLocalLogin} onPage={setShellPage}/>{needsConsent&&profile&&<PrivacyPolicyModal language={language} requireAccept onClose={()=>setNeedsConsent(false)}/>} {localAccessPrompt.open&&!profile&&<LocalAccessPrompt language={language} action={localAccessPrompt.action} onClose={()=>setLocalAccessPrompt({open:false})} onSignIn={beginLocalSignIn}/>}</>;
}
