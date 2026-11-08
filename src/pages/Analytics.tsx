import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, BarChart3, CalendarDays, ChartNoAxesCombined, ChevronDown, CircleHelp, Goal, Shield, Target, TrendingUp, Trophy, Waves, X } from 'lucide-react';
import type { Match, PersonalPerformance } from '../data/footballData';
import type { RouteId } from '../config/routes';
import type { Language } from '../i18n/translations';
import { dateKeyToISO } from '../shared/formatting/dateTime';
import { listCurrentArchive } from '../services/archiveRepository';
import { hasRecordedResult } from '../services/matchLifecycle';
import '../styles/analytics.css';

type Period = '7'|'15'|'30';
type Format = 'all'|'5v5'|'7v7';
type ChartMode = 'bars'|'waves';
type ExpandedCard = 'outcomes'|'ratings'|'insights'|'records'|null;
type RatingKey = keyof NonNullable<PersonalPerformance['selfAssessment']>;
let analyticsChartIntroSeen = false;
const ratingRows: { key: RatingKey; ar: string; en: string }[] = [
  { key: 'defense', ar: 'الدفاع والتمركز', en: 'Defending & positioning' },
  { key: 'awareness', ar: 'قراءة اللعب', en: 'Game awareness' },
  { key: 'movement', ar: 'التحرك دون كرة', en: 'Off-ball movement' },
  { key: 'passing', ar: 'التمرير', en: 'Passing' },
  { key: 'teamwork', ar: 'اللعب الجماعي', en: 'Teamwork' },
  { key: 'effort', ar: 'الجهد واللياقة', en: 'Effort & fitness' },
];
function dateFor(match: Match): Date|null {
  let raw = match.dateISO?.slice(0,10);
  if (!raw && Number.isFinite(match.dateKey) && match.dateKey > 0) {
    try { raw = dateKeyToISO(match.dateKey); } catch { raw = undefined; }
  }
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function dateLabel(match: Match, language: Language) {
  const date = dateFor(match);
  return date ? new Intl.DateTimeFormat(language==='ar'?'ar-PS':'en-GB',{day:'numeric',month:'short'}).format(date) : '—';
}
function scoreFor(match: Match, side: 'team1'|'team2') { return side === 'team1' ? `${match.score1} – ${match.score2}` : `${match.score2} – ${match.score1}`; }
function outcome(match: Match) {
  const side = match.personalPerformance?.teamSide || 'team1';
  const own = side === 'team1' ? match.score1 : match.score2;
  const other = side === 'team1' ? match.score2 : match.score1;
  return own > other ? 'win' : own === other ? 'draw' : 'loss';
}
function formatLabel(format: Match['matchFormat'], language: Language) {
  const value = format === '7v7' ? '7v7' : '5v5';
  return language === 'ar' ? (value === '7v7' ? '7 ضد 7' : '5 ضد 5') : value;
}
function buildRecommendations(matches: Match[], wins: number, draws: number, losses: number, language: Language) {
  const ar = language === 'ar';
  const reports = matches.map(match=>match.personalPerformance).filter((value):value is PersonalPerformance=>Boolean(value));
  const lowRatings = ratingRows.map(row=>({ ...row, values:reports.map(value=>value.selfAssessment?.[row.key]).filter((value):value is number=>typeof value==='number'&&value>=1&&value<=5) }))
    .map(row=>({...row,avg:row.values.length?row.values.reduce((sum,value)=>sum+value,0)/row.values.length:null}))
    .filter(row=>row.avg!==null).sort((a,b)=>(a.avg??0)-(b.avg??0));
  const goalValues=reports.map(value=>value.goals).filter((value):value is number=>typeof value==='number');
  const assistValues=reports.map(value=>value.assists).filter((value):value is number=>typeof value==='number');
  const tips:Array<{title:string;body:string;kind:string}> = [];
  if(matches.length<3){
    tips.push({title:ar?'ابنِ خط أساس قبل المقارنة':'Build a baseline before comparing form',body:ar?`ضمن الفترة الحالية لديك ${matches.length} مباريات مكتملة. سجّل بيانات 3–5 مباريات على الأقل قبل تفسير التغيّر كاتجاه؛ حجم العينة الحالي محدود.`:`There are ${matches.length} completed matches in this period. Record at least 3–5 matches before treating changes as a trend; the current sample is limited.`,kind:'baseline'});
  }
  if(lowRatings[0]?.avg!==null&&lowRatings[0]?.avg!==undefined){
    const lowest=lowRatings[0];
    tips.push({title:ar?`محور للمراجعة: ${lowest.ar}`:`Review area: ${lowest.en}`,body:ar?`متوسط التقييم الذاتي ${lowest.avg!.toFixed(1)} من 5 عبر ${lowest.values.length} تقييمات. جرّب تدريبًا قصيرًا موجّهًا لهذا المحور، ثم أعد تقييمه بعد عدة مباريات. هذا تقييمك أنت وليس قياسًا خارجيًا.`:`Your self-rating averages ${lowest.avg!.toFixed(1)}/5 across ${lowest.values.length} entries. Try a short focused drill and reassess after several matches. This is your own rating, not an external measurement.`,kind:'rating'});
  }
  if(lowRatings.length>1&&lowRatings[1].avg!==null&&lowRatings[1].avg!==undefined&&lowRatings[1].avg!<=3){
    const second=lowRatings[1];
    tips.push({title:ar?`محور ثانٍ: ${second.ar}`:`Second focus: ${second.en}`,body:ar?`متوسطك ${second.avg!.toFixed(1)} من 5 في ${second.values.length} تقييمات. لا تحاول تحسين كل شيء مرة واحدة؛ اجعل هذا المحور هدفًا ثانيًا بعد بناء عادة للمحور الأول.`:`Your average is ${second.avg!.toFixed(1)}/5 across ${second.values.length} ratings. Avoid changing everything at once; work on this after establishing a routine for your first focus area.`,kind:'rating-secondary'});
  }
  if(goalValues.length){const total=goalValues.reduce((sum,value)=>sum+value,0);tips.push({title:ar?'حوّل الأهداف إلى فرص قابلة للتكرار':'Make goal chances repeatable',body:ar?`سجّلت ${total} هدفًا شخصيًا عبر ${goalValues.length} مباريات لديها بيانات أهداف. راقب في المباريات القادمة أين استلمت الكرة قبل التسديد، وهل كان تحركك أو توقيتك وراء الفرصة؛ الأرقام وحدها لا تشرح السبب.`:`You recorded ${total} personal goals across ${goalValues.length} matches with goal data. In upcoming games, note where you received the ball before shooting and whether movement or timing created the chance; totals alone do not explain why.`,kind:'goals'});}
  if(assistValues.length){const total=assistValues.reduce((sum,value)=>sum+value,0);tips.push({title:ar?'راقب صناعة الفرص قبل التمريرة الأخيرة':'Track chance creation before the final pass',body:ar?`سجّلت ${total} صناعة عبر ${assistValues.length} مباريات لديها بيانات صناعة. قيّم قبل استلام الكرة: هل مسحت الملعب؟ وهل فتحت زاوية تمرير؟ دوّن ملاحظة واحدة بعد المباراة بدل الاعتماد على عدد الصناعات فقط.`:`You recorded ${total} assists across ${assistValues.length} matches with assist data. Before receiving, check whether you scanned the field and created a passing angle. Add one brief note after each match instead of relying on assists alone.`,kind:'assists'});}
  if(matches.length>=5&&wins/matches.length<.4){tips.push({title:ar?'راجع توازن الفريق بعد فقدان الكرة':'Review team balance after losing possession',body:ar?`النتائج في هذه الفترة: ${wins} فوز، ${draws} تعادل، ${losses} خسارة من ${matches.length} مباريات. النتيجة لا تحدد السبب وحدها؛ راجع العودة الدفاعية والتغطية والتواصل، ولا تنسب الخسائر لمهارة فردية دون بيانات داعمة.`:`This period contains ${wins} wins, ${draws} draws and ${losses} losses across ${matches.length} matches. Results alone do not identify the cause; review defensive recovery, cover and communication instead of attributing losses to an individual skill without supporting data.`,kind:'team'});}
  if(!tips.length)tips.push({title:ar?'ثبّت عادة ناجحة':'Reinforce a useful habit',body:ar?'اختر مباراة شعرت فيها أنك لعبت جيدًا، واكتب عاملًا واحدًا ساعدك: التحرك قبل وصول الكرة، التواصل أو فتح زاوية تمرير. اختبر العامل نفسه خلال المباريات التالية.':'Choose a match where you felt effective and record one factor that helped: movement before receiving, communication or creating a passing angle. Test that factor again in upcoming matches.',kind:'habit'});
  return tips.slice(0,5);
}
function wavePath(matches: Match[], key: 'goals'|'assists', max: number) {
  const points = matches.map((match, index) => ({ x: 48 + (640 / 7) * index, value: match.personalPerformance?.[key] }));
  const runs: Array<Array<{ x: number; y: number }>> = [];
  let active: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    if (typeof point.value !== 'number') {
      if (active.length) runs.push(active);
      active = [];
      continue;
    }
    active.push({ x: point.x, y: 212 - (point.value / max) * 185 });
  }
  if (active.length) runs.push(active);
  return runs.map(run => {
    if (run.length === 1) return `M ${run[0].x} ${run[0].y}`;
    let path = `M ${run[0].x} ${run[0].y}`;
    for (let index = 0; index < run.length - 1; index += 1) {
      const previous = run[Math.max(0, index - 1)];
      const current = run[index];
      const next = run[index + 1];
      const following = run[Math.min(run.length - 1, index + 2)];
      const dx = next.x - current.x;
      const cp1x = current.x + dx / 3;
      const cp2x = next.x - dx / 3;
      const cp1y = current.y + (next.y - previous.y) / 6;
      const cp2y = next.y - (following.y - current.y) / 6;
      path += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`;
    }
    return path;
  }).join(' ');
}

export default function Analytics({ language, go, canWrite = true, onRequireLocalLogin }: { language: Language; go: (page: RouteId) => void; canWrite?: boolean; onRequireLocalLogin?: (action?: string) => void }) {
  const ar = language === 'ar';
  const [allMatches,setAllMatches] = useState<Match[]>([]);
  const [ready,setReady] = useState(false);
  const [period,setPeriod] = useState<Period>('30');
  const [format,setFormat] = useState<Format>('all');
  const [chartMode,setChartMode] = useState<ChartMode>('waves');
  const [playFirstEntryChartMotion,setPlayFirstEntryChartMotion] = useState(false);
  const [expandedCard,setExpandedCard] = useState<ExpandedCard>(null);
  const [detailCount,setDetailCount] = useState(7);
  const [chartModalOpen,setChartModalOpen] = useState(false);
  const [detailStart,setDetailStart] = useState(0);
  const [selected,setSelected] = useState<Match|null>(null);
  const load = useCallback(async()=>{
    if (!canWrite) { setAllMatches([]); setReady(true); return; }
    try { setAllMatches((await listCurrentArchive()).filter(hasRecordedResult).filter(match=>match.visibility!=='PRIVATE')); }
    catch { setAllMatches([]); }
    finally { setReady(true); }
  },[canWrite]);
  useEffect(()=>{void load();window.addEventListener('taamen-matches-changed',load);return()=>window.removeEventListener('taamen-matches-changed',load)},[load]);
  const matches = useMemo(()=>{
    const cutoff = Date.now() - Number(period)*24*60*60*1000;
    return allMatches.filter(match=>{
      if(format!=='all' && (match.matchFormat==='7v7'?'7v7':'5v5')!==format) return false;
      const date=dateFor(match); if(!date||date.getTime()<cutoff||date.getTime()>Date.now()+60_000)return false;
      return true;
    }).sort((a,b)=>(a.dateKey-b.dateKey));
  },[allMatches,period,format]);
  const wins=matches.filter(match=>outcome(match)==='win').length;
  const draws=matches.filter(match=>outcome(match)==='draw').length;
  const losses=matches.filter(match=>outcome(match)==='loss').length;
  const goalValues=matches.map(match=>match.personalPerformance?.goals).filter((value):value is number=>typeof value==='number');
  const assistValues=matches.map(match=>match.personalPerformance?.assists).filter((value):value is number=>typeof value==='number');
  const totalGoals=goalValues.reduce((sum,value)=>sum+value,0);
  const totalAssists=assistValues.reduce((sum,value)=>sum+value,0);
  const statsKnown=matches.filter(match=>typeof match.personalPerformance?.goals==='number'||typeof match.personalPerformance?.assists==='number').length;
  const contributionMatches=matches.filter(match=>typeof match.personalPerformance?.goals==='number'||typeof match.personalPerformance?.assists==='number');
  const trendMatches=contributionMatches.slice(-7);
  const maxTrend=Math.max(1,...trendMatches.flatMap(match=>[match.personalPerformance?.goals??0,match.personalPerformance?.assists??0]));
  const detailWindowCount=Math.min(Math.max(1,detailCount),Math.max(1,contributionMatches.length));
  const detailMaxStart=Math.max(0,contributionMatches.length-detailWindowCount);
  const detailStartIndex=Math.min(detailStart,detailMaxStart);
  const detailMatches=contributionMatches.slice(detailStartIndex,detailStartIndex+detailWindowCount);
  const detailMax=Math.max(1,...detailMatches.flatMap(match=>[match.personalPerformance?.goals??0,match.personalPerformance?.assists??0]));
  useEffect(()=>{
    if(!ready||contributionMatches.length===0||playFirstEntryChartMotion||analyticsChartIntroSeen)return;
    const key='taamen-analytics-chart-intro-v1';
    try{
      if(localStorage.getItem(key)==='done'){analyticsChartIntroSeen=true;return;}
      localStorage.setItem(key,'done');
    }catch{/* the in-memory guard still prevents replay during this tab session */}
    analyticsChartIntroSeen=true;
    setPlayFirstEntryChartMotion(true);
  },[ready,contributionMatches.length,playFirstEntryChartMotion]);
  useEffect(()=>{if(!playFirstEntryChartMotion)return;const timer=window.setTimeout(()=>setPlayFirstEntryChartMotion(false),2200);return()=>window.clearTimeout(timer)},[playFirstEntryChartMotion]);
  const ratings=ratingRows.map(row=>{
    const values=matches.map(match=>match.personalPerformance?.selfAssessment?.[row.key]).filter((value):value is number=>typeof value==='number'&&value>=1&&value<=5);
    return {...row,avg:values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null,count:values.length};
  });
  const overallRatingValues=matches.flatMap(match=>ratingRows.map(row=>match.personalPerformance?.selfAssessment?.[row.key]).filter((value):value is number=>typeof value==='number'&&value>=1&&value<=5));
  const overallRatingAverage=overallRatingValues.length?(overallRatingValues.reduce((sum,value)=>sum+value,0)/overallRatingValues.length).toFixed(1):'—';
  const tips=buildRecommendations(matches,wins,draws,losses,language);
  const toggleCard=(card:ExpandedCard)=>setExpandedCard(current=>current===card?null:card);
  const startMatchCreation=()=>{if(!canWrite){onRequireLocalLogin?.(ar?'إنشاء مباراة':'create a match');return;}try{localStorage.setItem('taamen-play-center-tab','matches');}catch{}go('play');};
  const openArchive=()=>{if(!canWrite){onRequireLocalLogin?.(ar?'تحديث سجل مباراة':'update a match record');return;}try{localStorage.setItem('taamen-play-center-tab','archive');}catch{}go('play');};
  const renderBars=(data:Match[],max:number,height=260)=>data.map((match,index)=>{
    const slot=578/Math.max(1,data.length);const cx=48+slot*index+slot/2;const goals=match.personalPerformance?.goals;const assists=match.personalPerformance?.assists;
    const gh=(goals??0)/max*185;const ah=(assists??0)/max*185;
    return <g key={match.id} className={`analytics-chart-hit${selected?.id===match.id?' is-selected':''}`} role="button" tabIndex={0} aria-label={`${match.title||match.team1+' vs '+match.team2}: ${goals??'—'} goals, ${assists??'—'} assists`} onClick={()=>setSelected(match)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(match)}}}>
      <title>{`${match.title||`${match.team1} × ${match.team2}`} · ${goals??'—'} / ${assists??'—'}`}</title><rect x={cx-slot*.43} y="14" width={slot*.86} height="224" fill="transparent"/>
      {goals==null?<line x1={cx-15} y1="212" x2={cx-3} y2="212" className="analytics-missing-mark"/>:<rect x={cx-15} y={212-gh} width="12" height={Math.max(0,gh)} rx="4" className="analytics-goal-bar"/>}
      {assists==null?<line x1={cx+2} y1="212" x2={cx+14} y2="212" className="analytics-missing-mark"/>:<rect x={cx+2} y={212-ah} width="12" height={Math.max(0,ah)} rx="4" className="analytics-assist-bar"/>}
      <text x={cx} y="241" textAnchor="middle" className="analytics-axis-label">{dateLabel(match,language)}</text><text x={cx} y="254" textAnchor="middle" className="analytics-axis-sub-label">{index+1}</text>
    </g>;
  });
  const renderContributionChart=(data:Match[],max:number)=>{
    if (chartMode === 'bars') return <svg className="analytics-trend-chart" viewBox="0 0 640 260" role="img" aria-label={ar?'رسم أعمدة للأهداف والصناعة':'Goals and assists bar chart'}>
      {[0,1,2,3,4].map(i=><g key={i}><line x1="42" y1={20+i*47} x2="620" y2={20+i*47} className="analytics-grid-line"/><text x="10" y={24+i*47} className="analytics-axis-label">{Math.max(0,Math.ceil(max-(max/4)*i))}</text></g>)}{renderBars(data,max)}</svg>;
    const graphWidth = Math.max(96, Math.min(7, data.length) * (640 / 7));
    const widthPercent = `${Math.min(7, Math.max(1, data.length)) / 7 * 100}%`;
    return <svg className="analytics-trend-chart analytics-trend-chart-compact" style={{ width: widthPercent }} viewBox={`0 0 ${graphWidth} 260`} role="img" aria-label={ar?'اتجاه الأهداف والصناعة لكل مباراة':'Goals and assists trend per match'}>
      {[0,1,2,3,4].map(i=><g key={i}><line x1="42" y1={20+i*47} x2={Math.max(48,graphWidth-12)} y2={20+i*47} className="analytics-grid-line"/><text x="10" y={24+i*47} className="analytics-axis-label">{Math.max(0,Math.ceil(max-(max/4)*i))}</text></g>)}
      <path d={wavePath(data,'goals',max)} pathLength="1" className="analytics-wave-goals"/><path d={wavePath(data,'assists',max)} pathLength="1" className="analytics-wave-assists"/>
      {data.map((match,index)=>{const cx=48+(640/7)*index;const goal=match.personalPerformance?.goals;const assist=match.personalPerformance?.assists;return <g key={match.id} className={`analytics-chart-hit${selected?.id===match.id?' is-selected':''}`} role="button" tabIndex={0} aria-label={`${match.title||match.team1+' vs '+match.team2}: ${goal??'—'} goals, ${assist??'—'} assists`} onClick={()=>setSelected(match)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(match)}}}><rect x={cx-12} y="14" width="24" height="224" fill="transparent"/><title>{`${match.title||`${match.team1} × ${match.team2}`} · ${goal??'—'} / ${assist??'—'}`}</title>{typeof goal==='number'&&<circle cx={cx} cy={212-(goal/max)*185} r="4.5" className="analytics-wave-goal-point"/>}{typeof assist==='number'&&<circle cx={cx} cy={212-(assist/max)*185} r="4.5" className="analytics-wave-assist-point"/>}<text x={cx} y="241" textAnchor="middle" className="analytics-axis-label">{dateLabel(match,language)}</text><text x={cx} y="254" textAnchor="middle" className="analytics-axis-sub-label">{index+1}</text></g>})}
    </svg>;
  };

  return <section className="page-content analytics-page">
    <div className="page-heading analytics-heading" data-tour="analytics"><div><p className="eyebrow">TAAMEN / PERFORMANCE</p><h1>{ar?'تحليلاتي':'My analytics'}</h1><p className="subtitle">{ar?'راقب نتائجك ومساهماتك عبر المباريات. تعتمد الفترة على تاريخ المباراة، والبيانات الفارغة لا تُعامل كصفر. التقييمات الذاتية تبقى ذاتية وليست قياسًا آليًا لمهارتك.' : 'Track results and personal contributions across matches. The selected period uses match dates; missing data is never treated as zero. Self-ratings remain subjective, not automated skill measurements.'}</p></div><button className="primary-action" onClick={openArchive}><CalendarDays size={16}/>{ar?'تحديث سجل مباراة':'Update a match'}</button></div>
    <div className="analytics-filter-row"><div className="analytics-filter-heading"><ChartNoAxesCombined size={17}/><strong>{ar?'نطاق التحليل':'Analysis scope'}</strong></div><label>{ar?'الفترة':'Period'}<select value={period} onChange={event=>{setPeriod(event.target.value as Period);setDetailStart(0)}}><option value="7">{ar?'آخر 7 أيام':'Last 7 days'}</option><option value="15">{ar?'آخر 15 يومًا':'Last 15 days'}</option><option value="30">{ar?'آخر 30 يومًا':'Last 30 days'}</option></select></label><label>{ar?'صيغة اللعب':'Format'}<select value={format} onChange={event=>setFormat(event.target.value as Format)}><option value="all">{ar?'كل الصيغ':'All formats'}</option><option value="5v5">5v5</option><option value="7v7">7v7</option></select></label><span className="analytics-sample-note">{ar?`${matches.length} مباراة مكتملة ضمن آخر ${period} أيام`:`${matches.length} completed matches in the last ${period} days`}</span></div>
    <div className="analytics-stat-grid">
      <article className="analytics-stat-card"><span className="analytics-stat-icon"><CalendarDays size={17}/></span><small>{ar?'المباريات المكتملة':'Completed matches'}</small><strong>{matches.length}</strong><em>{ar?'ضمن الفترة المحددة':'Within the selected period'}</em></article>
      <article className="analytics-stat-card"><span className="analytics-stat-icon"><Trophy size={17}/></span><small>{ar?'نسبة الفوز':'Win rate'}</small><strong>{matches.length?`${Math.round(wins/matches.length*100)}%`:'—'}</strong><em>{ar?`${wins} فوز · ${draws} تعادل · ${losses} خسارة`:`${wins} W · ${draws} D · ${losses} L`}</em></article>
      <article className="analytics-stat-card"><span className="analytics-stat-icon"><Goal size={17}/></span><small>{ar?'أهدافك الشخصية':'Personal goals'}</small><strong>{goalValues.length?totalGoals:'—'}</strong><em>{ar?`${goalValues.length} مباراة فيها بيانات أهداف`:`Goals recorded in ${goalValues.length} matches`}</em></article>
      <article className="analytics-stat-card"><span className="analytics-stat-icon"><Target size={17}/></span><small>{ar?'الصناعات':'Assists'}</small><strong>{assistValues.length?totalAssists:'—'}</strong><em>{ar?`${assistValues.length} مباراة فيها بيانات صناعة`:`Assists recorded in ${assistValues.length} matches`}</em></article>
    </div>
    {!ready ? <div className="analytics-empty-state"><Activity size={25}/><strong>{ar?'جارٍ قراءة سجل المباريات…':'Loading match history…'}</strong></div> : matches.length===0 ? <div className="analytics-empty-state"><BarChart3 size={29}/><strong>{canWrite?(ar?'ما في مباريات مكتملة ضمن الفترة الحالية':'No completed matches in this period'):(ar?'التحليلات الشخصية متاحة بعد التسجيل المحلي':'Personal analytics are available after local setup')}</strong><p>{canWrite?(ar?'بعد تسجيل نتيجة مباراة وتاريخها ستظهر البيانات هنا. لا توجد أرقام تجريبية أو نتائج مفترضة.':'Once a match result and date are recorded, its data will appear here. No sample or assumed data is inserted.'):(ar?'تصفّح الموقع كزائر؛ أنشئ ملفًا محليًا لحفظ مبارياتك وإظهار بياناتك الشخصية. لا تحتاج بريدًا إلكترونيًا.':'Browse as a guest; set up a local profile to save matches and see personal data. No email is required.')}</p><button className="primary-action" onClick={startMatchCreation}>{ar?'إنشاء مباراة':'Create a match'}</button></div> : <>
      <div className="analytics-chart-grid">
        <section className="panel analytics-panel analytics-contributions-panel">
          <header className="analytics-panel-heading"><div><span className="eyebrow">PERSONAL CONTRIBUTIONS</span><h2>{ar?'الأهداف والصناعة عبر المباريات':'Goals & assists by match'}</h2><p>{ar?'الرسم النبضي يوضح تغير أهدافك وصناعتك عبر آخر سبع مباريات تحتوي بيانات؛ اختر أي نقطة لعرض تفاصيل المباراة.':'The trend lines show your goals and assists across up to seven matches with recorded data; select any point to inspect that match.'}</p></div><div className="analytics-heading-actions"><div className="analytics-chart-mode" role="group" aria-label={ar?'نمط الرسم':'Chart mode'}><button type="button" className={chartMode==='waves'?'is-active':''} aria-pressed={chartMode==='waves'} onClick={()=>setChartMode('waves')} title={ar?'الرسم النبضي':'Trend lines'}><Waves size={14}/></button><button type="button" className={chartMode==='bars'?'is-active':''} aria-pressed={chartMode==='bars'} onClick={()=>setChartMode('bars')} title={ar?'الأعمدة':'Bars'}><BarChart3 size={14}/></button></div><button type="button" className="analytics-expand-button" onClick={()=>setChartModalOpen(true)}><ChartNoAxesCombined size={15}/><span>{ar?'تفاصيل الرسم':'Chart details'}</span></button></div></header>
          {contributionMatches.length? <div className={`analytics-chart-wrap${playFirstEntryChartMotion?' is-first-entry':''}`}>{renderContributionChart(trendMatches,maxTrend)}<div className="analytics-chart-legend"><span><i className="analytics-legend-dot goals"/>{ar?'أهداف':'Goals'}</span><span><i className="analytics-legend-dot assists"/>{ar?'صناعة':'Assists'}</span><small>{ar?'اضغط على نقطة أو عمود لعرض المباراة':'Select a point or bar to inspect the match'}</small></div></div> : <div className="analytics-chart-no-data"><Goal size={22}/><p>{ar?'لا توجد بيانات شخصية للأهداف أو الصناعة بعد. أدخلها عند تسجيل النتيجة أو إضافتها للأرشيف.':'No personal goal or assist data is recorded yet. Add it when entering a result or archiving a match.'}</p></div>}
        </section>
        <section className={`panel analytics-panel${expandedCard==='outcomes'?' is-expanded':''}`}>
          <header className="analytics-panel-heading"><div><span className="eyebrow">MATCH OUTCOMES</span><h2>{ar?'توزيع النتائج':'Result breakdown'}</h2><p>{ar?'النسب من عدد المباريات المكتملة ضمن الفترة؛ الفوز أخضر والتعادل أصفر والخسارة أحمر.':'Percentages use completed matches in the selected period: wins green, draws yellow, losses red.'}</p></div><button type="button" className="analytics-expand-button" aria-expanded={expandedCard==='outcomes'} onClick={()=>toggleCard('outcomes')}><ChevronDown size={16}/><span>{ar?(expandedCard==='outcomes'?'طي التفاصيل':'تفاصيل النتائج'):(expandedCard==='outcomes'?'Hide details':'Result details')}</span></button></header>
          <div className="analytics-outcomes">{([{key:'win',label:ar?'فوز':'Wins',count:wins},{key:'draw',label:ar?'تعادل':'Draws',count:draws},{key:'loss',label:ar?'خسارة':'Losses',count:losses}] as const).map(row=><div className="analytics-outcome-row" key={row.key}><div><span className={`analytics-outcome-symbol ${row.key}`}/><strong>{row.label}</strong></div><div className="analytics-outcome-meter"><span className={`analytics-outcome-fill ${row.key}`} style={{width:matches.length?`${row.count/matches.length*100}%`:'0%'}}/></div><b>{row.count}</b><small>{matches.length?`${(row.count/matches.length*100).toFixed(1)}%`:'—'}</small></div>)}</div>
          <div className="analytics-match-count-note"><CircleHelp size={15}/><span>{ar?`حُسبت النسب من ${matches.length} مباريات مكتملة. النتائج وصف للسجل وليست تفسيرًا لسبب الفوز أو الخسارة.`:`Percentages use ${matches.length} completed matches. Results describe the record; they do not explain the cause of a win or loss.`}</span></div>
          {expandedCard==='outcomes'&&<div className="analytics-outcome-details"><strong>{ar?'تسلسل نتائج المباريات':'Match outcome timeline'}</strong>{matches.slice().reverse().map(match=><button type="button" key={match.id} onClick={()=>setSelected(match)}><span>{dateLabel(match,language)}</span><span>{match.team1} × {match.team2}</span><b className={`analytics-result-pill ${outcome(match)}`}>{outcome(match)==='win'?(ar?'فوز':'Win'):outcome(match)==='draw'?(ar?'تعادل':'Draw'):(ar?'خسارة':'Loss')}</b><strong>{scoreFor(match,match.personalPerformance?.teamSide||'team1')}</strong></button>)}</div>}
        </section>
      </div>
      <section className={`panel analytics-records-panel analytics-accordion-panel${expandedCard==='records'?' is-expanded':''}`}><button type="button" className="analytics-accordion-trigger" aria-expanded={expandedCard==='records'} onClick={()=>toggleCard('records')}><span className="analytics-panel-mark"><CalendarDays size={19}/></span><span className="analytics-accordion-copy"><small>MATCH LOG</small><strong>{ar?'المباريات التي بُني عليها التحليل':'Matches behind the analysis'}</strong><em>{ar?`${statsKnown} من ${matches.length} مباريات فيها بيانات شخصية للأهداف أو الصناعة.`:`${statsKnown} of ${matches.length} matches include personal goals or assists.`}</em></span><span className="analytics-accordion-summary">{matches.length} {ar?'مباريات':'matches'}</span><ChevronDown size={17} className={expandedCard==='records'?'is-open':''}/></button>
        {expandedCard==='records'&&<div className="analytics-record-list">{matches.slice().reverse().map(match=><button type="button" className={`analytics-record-row${selected?.id===match.id?' is-selected':''}`} key={match.id} onClick={()=>setSelected(match)}><span className="analytics-record-date">{dateLabel(match,language)}</span><span className="analytics-record-teams"><strong>{match.team1}</strong><small>{match.team2}</small></span><span className={`analytics-result-pill ${outcome(match)}`}>{outcome(match)==='win'?(ar?'فوز':'Win'):outcome(match)==='draw'?(ar?'تعادل':'Draw'):(ar?'خسارة':'Loss')}</span><b className="analytics-record-score">{scoreFor(match,match.personalPerformance?.teamSide||'team1')}</b><small className="analytics-record-format">{formatLabel(match.matchFormat,language)}</small></button>)}</div>}
      </section>
      <div className="analytics-lower-grid">
        <section className={`panel analytics-panel analytics-accordion-panel${expandedCard==='ratings'?' is-expanded':''}`}><button type="button" className="analytics-accordion-trigger" aria-expanded={expandedCard==='ratings'} onClick={()=>toggleCard('ratings')}><span className="analytics-panel-mark"><Shield size={19}/></span><span className="analytics-accordion-copy"><small>SELF-REPORTED</small><strong>{ar?'التقييم الذاتي':'Self-assessment'}</strong><em>{ar?'متوسطات دقيقة من تقييماتك المدخلة، من 5.':'Averages based only on ratings you entered, out of 5.'}</em></span><span className="analytics-accordion-summary">{ratings.some(row=>row.avg!==null)?`${ratings.filter(row=>row.avg!==null).length} ${ar?'محاور':'areas'}`:(ar?'لا توجد تقييمات':'No ratings')}</span><ChevronDown size={17} className={expandedCard==='ratings'?'is-open':''}/></button>
          {expandedCard==='ratings'&&<div className="analytics-ratings">{ratings.map(row=><div className="analytics-rating-row" key={row.key}><div className="analytics-rating-label"><span>{ar?row.ar:row.en}</span><small>{row.count} {ar?'تقييم':'ratings'}</small></div><div className="analytics-rating-track"><span style={{width:row.avg===null?'0%':`${row.avg/5*100}%`}}/></div><strong>{row.avg===null?'—':row.avg.toFixed(1)}</strong></div>)}<div className="analytics-overall-rating"><span>{ar?'المعدل المجمل لجميع التقييمات':'Overall average across all ratings'}</span><strong>{overallRatingAverage} <small>/ 5</small></strong><em>{ar?`مجموع التقييمات المسجلة مقسومًا على عددها. عدد التقييمات: ${overallRatingValues.length}. الحقول الفارغة مستبعدة.`:`Sum of recorded ratings divided by their count. Recorded ratings: ${overallRatingValues.length}. Blank fields are excluded.`}</em></div><p className="analytics-caveat">{ar?'يُحسب المتوسط إلى منزلة عشرية واحدة ويستبعد الحقول غير المسجلة. كلما زاد عدد التقييمات أصبح الاتجاه أوضح، لكنه يبقى تقييمًا ذاتيًا.':'Averages are shown to one decimal and exclude unrecorded fields. More ratings make a trend easier to interpret, but the measure remains subjective.'}</p></div>}
        </section>
        <section className={`panel analytics-panel analytics-insights-panel analytics-accordion-panel${expandedCard==='insights'?' is-expanded':''}`}><button type="button" className="analytics-accordion-trigger" aria-expanded={expandedCard==='insights'} onClick={()=>toggleCard('insights')}><span className="analytics-panel-mark"><Activity size={19}/></span><span className="analytics-accordion-copy"><small>NEXT STEPS</small><strong>{ar?'اقتراحات عملية':'Actionable suggestions'}</strong><em>{ar?'توصيات مرتبطة بنقاط القوة والضعف في بياناتك.':'Recommendations linked to the strengths and weaknesses in your records.'}</em></span><span className="analytics-accordion-summary">{tips.length} {ar?'اقتراحات':'tips'}</span><ChevronDown size={17} className={expandedCard==='insights'?'is-open':''}/></button>
          {expandedCard==='insights'&&<><div className="analytics-recommendations">{tips.map((tip,index)=><article className="analytics-recommendation" key={`${tip.kind}-${index}`}><span className="analytics-recommendation-index">{String(index+1).padStart(2,'0')}</span><div><strong>{tip.title}</strong><p>{tip.body}</p></div></article>)}</div><p className="analytics-caveat">{ar?'التوصيات مبنية على حقول أدخلتها أنت؛ لا يستنتج النظام تمركزًا أو لياقة أو جودة ضغط لم تُسجل. إذا لم تتوفر عينة كافية فسيعطيك خطوة لبناء خط أساس بدل حكم مضلل.':'Recommendations use fields you entered. The system does not infer positioning, fitness or pressing quality that was never recorded. With too little data, it recommends building a baseline rather than making a misleading judgment.'}</p></>}
        </section>
      </div>

      {chartModalOpen&&<div className="overlay analytics-chart-overlay" role="dialog" aria-modal="true" aria-labelledby="analytics-chart-modal-title"><button type="button" className="overlay-backdrop" onClick={()=>setChartModalOpen(false)} aria-label={ar?'إغلاق':'Close'}/><section className="modal-card analytics-chart-modal"><header className="panel-heading"><div><p className="eyebrow">TAAMEN / MATCH ANALYSIS</p><h2 id="analytics-chart-modal-title">{ar?'تفاصيل الأهداف والصناعة':'Goals & assists details'}</h2><p>{ar?'الخط الأخضر للأهداف، والبنفسجي للصناعة. كل نقطة مرتبطة بمباراة مسجلة.':'Green is goals; violet is assists. Each point comes from a recorded match.'}</p></div><button type="button" className="icon-button" onClick={()=>setChartModalOpen(false)} aria-label={ar?'إغلاق':'Close'}><X size={18}/></button></header>{contributionMatches.length===0?<div className="analytics-chart-no-data"><p>{ar?'لا توجد بيانات شخصية للأهداف أو الصناعة.':'No personal goal or assist data has been recorded.'}</p></div>:<><div className="analytics-detail-heading"><strong>{ar?'تفاصيل حسب المباراة':'Match-by-match detail'}</strong><span>{ar?`${detailMatches.length} من ${contributionMatches.length} مباريات ذات بيانات شخصية`:`${detailMatches.length} of ${contributionMatches.length} matches with personal data`}</span></div><label className="analytics-range-control"><span>{ar?'عدد المباريات':'Number of matches'}</span><input aria-label={ar?'عدد المباريات المعروضة':'Number of matches shown'} type="range" min="1" max={Math.max(1,contributionMatches.length)} value={Math.min(detailWindowCount,Math.max(1,contributionMatches.length))} onChange={event=>{setDetailCount(Number(event.target.value));setDetailStart(0)}}/><b>{detailMatches.length}</b></label><label className="analytics-range-control"><span>{ar?'تحريك الفترة':'Move period'}</span><input aria-label={ar?'تحريك الفترة المعروضة':'Move displayed range'} type="range" min="0" max={detailMaxStart} value={detailStartIndex} onChange={event=>setDetailStart(Number(event.target.value))}/><b>{detailMatches.length?`${detailStartIndex+1}–${detailStartIndex+detailMatches.length}`:'—'}</b></label><div className="analytics-detail-chart analytics-chart-wrap">{renderContributionChart(detailMatches,detailMax)}</div><div className="analytics-detail-match-list">{detailMatches.map(match=><button type="button" key={match.id} onClick={()=>setSelected(match)} className={selected?.id===match.id?'is-selected':''}><span>{dateLabel(match,language)}</span><strong>{match.title||`${match.team1} × ${match.team2}`}</strong><b>{ar?'أهداف':'Goals'}: {match.personalPerformance?.goals??'—'} · {ar?'صناعة':'Assists'}: {match.personalPerformance?.assists??'—'}</b></button>)}</div></>}</section></div>}
      {selected&&<div className="analytics-selected-detail" role="status"><div><small>{ar?'المباراة المحددة':'Selected match'}</small><strong>{selected.title||`${selected.team1} × ${selected.team2}`}</strong><span>{dateLabel(selected,language)} · {scoreFor(selected,selected.personalPerformance?.teamSide||'team1')}</span></div><p>{ar?`أهدافك: ${selected.personalPerformance?.goals??'غير مسجل'} · الصناعات: ${selected.personalPerformance?.assists??'غير مسجل'} · التقييمات المسجلة: ${ratingRows.filter(row=>typeof selected.personalPerformance?.selfAssessment?.[row.key]==='number').length}`:`Your goals: ${selected.personalPerformance?.goals??'not recorded'} · Assists: ${selected.personalPerformance?.assists??'not recorded'} · Recorded ratings: ${ratingRows.filter(row=>typeof selected.personalPerformance?.selfAssessment?.[row.key]==='number').length}`}</p><button className="text-button" onClick={()=>setSelected(null)}>{ar?'إغلاق':'Close'}</button></div>}
    </>}
  </section>;
}
