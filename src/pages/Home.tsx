import { Archive, CalendarDays, ChevronRight, Goal, Swords, ChartNoAxesCombined, Sparkles } from 'lucide-react';
import type { Match } from '../data/footballData';
import type { RouteId } from '../config/routes';
import { useEffect, useRef, useState } from 'react';
import { listCurrentArchive } from '../services/archiveRepository';
import { hasRecordedResult } from '../services/matchLifecycle';
import { uiCopy } from '../i18n/translations';
import AdSlot from '../components/monetization/AdSlot';
import { dateKeyToISO } from '../shared/formatting/dateTime';

type HomeRandomMetric = 'archive'|'decided'|'draws';
let currentVisitMetric: HomeRandomMetric | null = null;

export default function Home({language,go,profile,canWrite=false}:{language:'ar'|'en';go:(p:RouteId)=>void;profile?:{firstName:string};canWrite?:boolean}) {
  const ar=language==='ar';
  const personalDataAvailable=canWrite;
  const [randomMetric] = useState<HomeRandomMetric>(()=>{
    const choices: HomeRandomMetric[] = ['archive','decided','draws'];
    if (currentVisitMetric) return currentVisitMetric;
    try {
      const visitChoice = sessionStorage.getItem('taamen-home-metric-visit-v1');
      if (choices.includes(visitChoice as HomeRandomMetric)) {
        currentVisitMetric = visitChoice as HomeRandomMetric;
        return currentVisitMetric;
      }
    } catch {}
    let previous='';
    try { previous=localStorage.getItem('taamen-home-random-metric-v1')||''; } catch {}
    const available=choices.filter(item=>item!==previous);
    const selected=available[Math.floor(Math.random()*available.length)] || choices[0];
    currentVisitMetric = selected;
    try { localStorage.setItem('taamen-home-random-metric-v1', selected); } catch {}
    try { sessionStorage.setItem('taamen-home-metric-visit-v1', selected); } catch {}
    return selected;
  });
  const [archive,setArchive]=useState<Match[]>([]);
  const [error,setError]=useState('');
  const root=useRef<HTMLElement>(null);
  const [homeChartMotion,setHomeChartMotion]=useState(false);

  useEffect(()=>{
    let active=true;
    setError('');
    if(!personalDataAvailable){
      setArchive([]);
      return()=>{active=false};
    }
    const refresh=()=>{
      listCurrentArchive().then(items=>{if(active)setArchive(items)}).catch(()=>{
        if(!active)return;
        setArchive([]);
        setError(ar?'تعذر تحميل السجل.':'The archive could not be loaded.');
      });
    };
    refresh();
    window.addEventListener('taamen-matches-changed',refresh);
    return()=>{active=false;window.removeEventListener('taamen-matches-changed',refresh)};
  },[ar,personalDataAvailable]);

  const recorded=archive.filter(m=>hasRecordedResult(m.status));
  const latest=recorded.slice(0,3);
  const personalMatches=recorded.filter(m=>typeof m.personalPerformance?.goals==='number'||typeof m.personalPerformance?.assists==='number');
  const knownGoals=personalMatches.filter(m=>typeof m.personalPerformance?.goals==='number');
  const knownAssists=personalMatches.filter(m=>typeof m.personalPerformance?.assists==='number');
  const personalGoals=knownGoals.reduce((sum,m)=>sum+(m.personalPerformance?.goals??0),0);
  const personalAssists=knownAssists.reduce((sum,m)=>sum+(m.personalPerformance?.assists??0),0);
  const homeTrend=personalMatches.slice(0,6).reverse();
  const chartPoints=(field:'goals'|'assists')=>homeTrend.flatMap((match,index)=>{
    const value=match.personalPerformance?.[field];
    if(typeof value!=='number')return[];
    const max=Math.max(1,...homeTrend.map(item=>item.personalPerformance?.[field]??0));
    const x=20+(index/Math.max(1,homeTrend.length-1))*260;
    const y=76-(value/max)*54;
    return[`${x},${y}`];
  }).join(' ');
  const total=archive.length;
  const decided=recorded.filter(m=>m.score1!==m.score2).length;
  const draws=recorded.filter(m=>m.score1===m.score2).length;
  const openArchive=()=>{
    try{localStorage.setItem('taamen-play-center-tab','archive');}catch{}
    go('play');
  };

  // Keep Home motion-free: route changes and sidebar resizing should not
  // compete with a page-wide GSAP timeline or animated card reveals.
  useEffect(() => {
    document.body.classList.add('taamen-home-active');
    return () => document.body.classList.remove('taamen-home-active');
  }, []);

  useEffect(() => {
    if (!personalDataAvailable || homeTrend.length === 0) return;
    const id = window.setTimeout(() => setHomeChartMotion(true), 90);
    return () => window.clearTimeout(id);
  }, [personalDataAvailable, homeTrend.length]);

  return <section className="page-content home-page" ref={root}>
    <div className="home-hero home-hero-single" data-tour="home">
      <div className="home-hero-copy">
        <p className="eyebrow" data-ta-motion="greeting">TAAMEN 2.0 / HOME</p>
        <h1 data-ta-motion="greeting">{ar?`أهلًا ${profile?.firstName||''}`:`Welcome ${profile?.firstName||''}`}</h1>
        <p data-ta-motion="greeting">{ar?'كرة القدم كما يجب أن تُعرض: هادئة، واضحة، ومحلية أولًا.':'Football presented as it should be: calm, clear, and local-first.'}</p>
        <div className="home-actions" data-ta-motion="cta" data-ta-icons><button className="primary-action" onClick={openArchive}><Archive size={16}/>{ar?'استكشف السجل':'Explore archive'}</button><button className="dark-action" onClick={()=>go('play')}><CalendarDays size={16}/>{ar?'مساحة اللعب':'Play Space'}</button></div>
      </div>
    </div>
    {error&&<div className="error-banner" role="alert">{error}</div>}
    <button
      type="button"
      className="home-ai-card"
      data-ta-motion="card"
      onClick={() => go('assistant')}
      aria-label={ar ? 'افتح TAAMEN AI — النسخة التجريبية' : 'Open TAAMEN AI beta'}
    >
      <span className="home-ai-mark" aria-hidden="true"><Sparkles size={21} strokeWidth={1.8}/></span>
      <span className="home-ai-copy">
        <span className="home-ai-kicker"><strong>TAAMEN AI</strong><small>BETA</small></span>
        <span className="home-ai-headline">{ar ? 'مساعدك الكروي الجديد صار جاهز للتجربة' : 'Your new football assistant is ready to try'}</span>
        <span className="home-ai-description">{ar ? 'اسأله عن مبارياتك وإحصائياتك وخطط فريقك، وخذ إجابات تستند إلى بياناتك المسجّلة.' : 'Ask about your matches, stats, and team tactics — with answers grounded in your recorded data.'}</span>
        <span className="home-ai-cta">{ar ? 'جرّب TAAMEN AI' : 'Explore TAAMEN AI'} <ChevronRight size={15}/></span>
      </span>
    </button>
    <div className="stats-grid home-stats home-shortcuts-grid">
      <button type="button" className={`stat-card ${randomMetric==='archive'?'stat-dark':randomMetric==='decided'?'stat-lime':'stat-pale'} home-random-metric`} data-ta-motion="card" onClick={openArchive}>
        <span>{randomMetric==='archive'?(ar?'السجل':'Archive'):randomMetric==='decided'?(ar?'المواجهات الحاسمة':'Decided matches'):(ar?'التعادلات':'Draws')}</span>
        <strong>{personalDataAvailable?(randomMetric==='archive'?total:randomMetric==='decided'?decided:draws):'—'}</strong>
        <small>{randomMetric==='archive'?(personalDataAvailable?(ar?'مباريات محفوظة محليًا':'Locally saved matches'):(ar?'أنشئ ملفًا محليًا لبدء سجلك':'Create a local profile to start your archive')):randomMetric==='decided'?(ar?'نتائج انتهت بفائز':'Results with a winner'):(ar?'نتائج متعادلة':'Level scores')}</small>
      </button>
      <button type="button" className="stat-card stat-glass home-venues-card" data-ta-motion="card" onClick={()=>go('stadiums')} aria-label={uiCopy[language].openVenues}>
        <span className="home-venues-icon" data-ta-icons aria-hidden="true"><Goal size={18}/></span>
        <strong>{uiCopy[language].venuesTitle}</strong>
        <small>{uiCopy[language].venuesDesc}</small>
      </button>
      <button type="button" className="stat-card stat-glass home-tool-card" data-ta-motion="card" onClick={()=>go('tactical')}>
        <span className="home-venues-icon" data-ta-icons aria-hidden="true"><Swords size={18}/></span>
        <strong>{ar?'الملعب التكتيكي':'Tactical board'}</strong>
        <small>{ar?'خطط التشكيل والحركة داخل الملعب':'Build formations and movement patterns'}</small>
      </button>
      <button type="button" className="stat-card stat-glass home-tool-card" data-ta-motion="card" onClick={()=>go('analytics')}>
        <span className="home-venues-icon" data-ta-icons aria-hidden="true"><ChartNoAxesCombined size={18}/></span>
        <strong>{ar?'تحليلاتي':'My analytics'}</strong>
        <small>{ar?'تابع الأهداف والصناعة وأداءك':'Track goals, assists, and performance'}</small>
      </button>
    </div>
    <AdSlot placement="home" />
    <section className="home-insights-layout" data-ta-motion="panel">
      <section className="panel home-recent-panel">
        <div className="panel-heading"><div><p className="eyebrow">{ar?'من السجل':'FROM THE ARCHIVE'}</p><h2>{ar?'أحدث المواجهات':'Latest matches'}</h2>{!personalDataAvailable&&<small className="muted">{ar?'بيانات المباريات الشخصية لا تُعرض قبل إنشاء ملف محلي.':'Personal match data stays hidden until you create a local profile.'}</small>}</div><button className="text-button" data-ta-icons onClick={openArchive}>{ar?'عرض الكل':'View all'}<ChevronRight size={15}/></button></div>
        <div className="home-compact-match-list">{latest.map(match=><article key={match.id} className="home-compact-match">
          <div className="home-compact-match-meta"><span>{match.dateLabel||(()=>{try{return dateKeyToISO(match.dateKey)}catch{return '—'}})()}</span><span>{match.matchFormat||'5v5'}</span></div>
          <div className="home-compact-match-score"><strong title={match.team1}>{match.team1}</strong><b>{match.score1}<i>:</i>{match.score2}</b><strong title={match.team2}>{match.team2}</strong></div>
          {match.stadium&&<small className="home-compact-match-venue">{match.stadium}{match.city?` · ${match.city}`:''}</small>}
        </article>)}</div>
        {latest.length===0&&<div className="home-compact-empty">{ar?'لا توجد مباريات مكتملة لعرضها بعد.':'No completed matches to show yet.'}</div>}
      </section>
      <section className="panel home-performance-panel">
        <div className="panel-heading"><div><p className="eyebrow">{ar?'الأداء الشخصي':'PERSONAL PERFORMANCE'}</p><h2>{ar?'ملخص مساهماتك':'Your contribution snapshot'}</h2></div><button className="text-button" data-ta-icons onClick={()=>go('analytics')}>{ar?'تحليلاتي':'Analytics'}<ChevronRight size={15}/></button></div>
        <div className="home-performance-metrics">
          <div className="home-performance-metric is-goals"><span>{ar?'الأهداف':'Goals'}</span><strong>{personalDataAvailable&&knownGoals.length?personalGoals:'—'}</strong><small>{personalDataAvailable?`${knownGoals.length} ${ar?'مباريات ببيانات أهداف':'matches with goal data'}`:(ar?'بعد إنشاء ملفك':'After creating a profile')}</small></div>
          <div className="home-performance-metric is-assists"><span>{ar?'الصناعات':'Assists'}</span><strong>{personalDataAvailable&&knownAssists.length?personalAssists:'—'}</strong><small>{personalDataAvailable?`${knownAssists.length} ${ar?'مباريات ببيانات صناعة':'matches with assist data'}`:(ar?'بعد إنشاء ملفك':'After creating a profile')}</small></div>
        </div>
        {personalDataAvailable&&homeTrend.length>0?<div className={`home-contribution-chart${homeChartMotion ? ' is-entering' : ''}`} aria-label={ar?'اتجاه الأهداف والصناعة في آخر المباريات المسجلة':'Goals and assists in recent matches'}>
          <div className="home-chart-legend"><span><i className="is-goals"/>{ar?'الأهداف':'Goals'}</span><span><i className="is-assists"/>{ar?'الصناعات':'Assists'}</span></div>
          <svg viewBox="0 0 300 94" role="img" aria-hidden="true">
            <line x1="12" y1="76" x2="288" y2="76" className="home-chart-axis"/>
            {chartPoints('goals').split(' ').length>1&&<polyline points={chartPoints('goals')} className="home-chart-line is-goals"/>}
            {chartPoints('assists').split(' ').length>1&&<polyline points={chartPoints('assists')} className="home-chart-line is-assists"/>}
            {homeTrend.map((match,index)=>{const x=20+(index/Math.max(1,homeTrend.length-1))*260;const goals=match.personalPerformance?.goals;const assists=match.personalPerformance?.assists;const gMax=Math.max(1,...homeTrend.map(item=>item.personalPerformance?.goals??0));const aMax=Math.max(1,...homeTrend.map(item=>item.personalPerformance?.assists??0));return <g key={match.id}>{typeof goals==='number'&&<circle cx={x} cy={76-(goals/gMax)*54} r="3.5" className="home-chart-dot is-goals"/>}{typeof assists==='number'&&<circle cx={x} cy={76-(assists/aMax)*54} r="3.5" className="home-chart-dot is-assists"/>}</g>})}
          </svg>
          <small>{ar?'آخر المباريات التي تحتوي على بيانات شخصية مسجلة؛ القيم غير المدخلة لا تُحسب صفرًا.':'Recent matches with personal data; missing values are not treated as zero.'}</small>
        </div>:<div className="home-chart-empty">{ar?'أضف أهدافك وصناعاتك عند تسجيل نتيجة المباراة ليظهر اتجاه مساهماتك هنا.':'Add your goals and assists when recording a result to see your contribution trend here.'}</div>}
      </section>
    </section>
    {latest.length > 0 && <AdSlot placement="home-follow" />}
    <footer className="home-developer-credit"><span>{ar?'من الفكرة إلى الكود — عمر، وراء TAAMEN.':'From the idea to the code — Omar, behind TAAMEN.'}</span><a href="https://omar-i9.github.io/omar-i9/" target="_blank" rel="noreferrer noopener">{ar?'اكتشف أعمالي':'Explore my work'} <span aria-hidden="true">↗</span></a></footer>
  </section>;
}
