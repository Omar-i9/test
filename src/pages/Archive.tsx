import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Plus, Search, Share2, Trophy } from 'lucide-react';
import type { Match, MatchType } from '../data/footballData';
import { listCurrentArchive } from '../services/archiveRepository';
import { canonicalStatus } from '../services/matchLifecycle';
import { deleteMatch } from '../services/matchRepository';
import { archiveCopy, matchUiCopy } from '../i18n/translations';
import MatchCard from '../components/MatchCard';
import ArchiveDetailModal from '../components/ArchiveDetailModal';
import AddArchiveModal from '../components/AddArchiveModal';
import ResultEntryModal from '../components/ResultEntryModal';
import MatchShareModal from '../components/MatchShareModal';
import AdSlot from '../components/monetization/AdSlot';
import { RouteSkeleton } from '../components/RouteSkeleton';
import PersonalPerformanceModal from '../components/PersonalPerformanceModal';

export default function Archive({language,canWrite=true,onRequireLocalLogin}:{language:'ar'|'en';canWrite?:boolean;onRequireLocalLogin?:(action?:string)=>void}) {
  const copy=matchUiCopy[language];
  const types=archiveCopy[language];
  const[items,setItems]=useState<Match[]>([]);
  const[query,setQuery]=useState('');
  const[type,setType]=useState<'all'|MatchType>('all');
  const[selected,setSelected]=useState<Match|null>(null);
  const[resultMatch,setResultMatch]=useState<Match|null>(null);
  const[shareMatch,setShareMatch]=useState<Match|null>(null);
  const[showAdd,setShowAdd]=useState(false);
  const[performanceMatch,setPerformanceMatch]=useState<Match|null>(null);
  const[ready,setReady]=useState(false);
  const load=useCallback(()=>{if(!canWrite){setItems([]);setReady(true);return Promise.resolve();}return listCurrentArchive().then(next=>{setItems(next);setReady(true)}).catch(()=>{setItems([]);setReady(true)})},[canWrite]);
  useEffect(()=>{
    void load();
    const refresh=()=>void load();
    window.addEventListener('taamen-matches-changed',refresh);
    return()=>window.removeEventListener('taamen-matches-changed',refresh);
  },[load]);
  const filtered=useMemo(()=>items.filter(match=>{
    const haystack=`${match.team1} ${match.team2} ${match.stadium||''} ${match.city||''}`.toLowerCase();
    return(!query||haystack.includes(query.toLowerCase()))&&(type==='all'||match.type===type);
  }),[items,query,type]);
  const pending=filtered.filter(match=>canonicalStatus(match.status)==='COMPLETED_PENDING_RESULT');
  const recorded=filtered.filter(match=>canonicalStatus(match.status)!=='COMPLETED_PENDING_RESULT');
  const [pendingOpen,setPendingOpen]=useState(false);
  useEffect(()=>{if(pending.length===0)setPendingOpen(false);},[pending.length]);
  const typeLabel=(value:MatchType)=>({friendly:types.friendly,normal:types.normal,competitive:types.competitive,tournament:types.tournament,strong:types.strong})[value];
  if(!ready)return <RouteSkeleton page="archive"/>;
  const removeLocalMatch=async(match:Match)=>{
    if(match.source!=='local' && match.visibility!=='LOCAL')return;
    const p=match.personalPerformance;
    const keyLine = typeof p?.goals==='number' && p.goals>0 ? (language==='ar'?`تم تسجيل ${p.goals} هدف شخصي في هذه المباراة.`:`You recorded ${p.goals} personal goals in this match.`) : typeof p?.assists==='number' && p.assists>0 ? (language==='ar'?`تم تسجيل ${p.assists} صناعة أهداف في هذه المباراة.`:`You recorded ${p.assists} assists in this match.`) : match.score1+match.score2>=6 ? (language==='ar'?'شهدت هذه المباراة أهدافًا كثيرة.':'This was a high-scoring match.') : (language==='ar'?'هذه المباراة جزء من سجلك الشخصي.':'This match is part of your personal history.');
    const analyticsLine = p ? (language==='ar'?'إذا كانت المباراة ضمن تحليلاتك، فستختفي بياناتها منها أيضًا.':'Its personal analytics will also be removed.') : (language==='ar'?'ستُحذف المباراة من الأرشيف.':'The match will be removed from your archive.');
    const prompt = language==='ar' ? `هل أنت متأكد من حذف مباراة «${match.title||`${match.team1} × ${match.team2}`}»؟\n${keyLine}\n${analyticsLine}\nلا يمكن التراجع عن هذا الإجراء.` : `Delete “${match.title||`${match.team1} × ${match.team2}`}”?\n${keyLine}\n${analyticsLine}\nThis action cannot be undone.`;
    if(!window.confirm(prompt))return;
    try{await deleteMatch(match.id);setItems(current=>current.filter(item=>item.id!==match.id));setSelected(null);}catch{window.alert(language==='ar'?'تعذر حذف المباراة. حاول مرة أخرى.':'Could not delete the match. Please try again.');}
  };
  const grid=(matches:Match[],empty:string,pendingResult=false)=>matches.length?<div className="archive-grid">{matches.map(match=><MatchCard key={match.id} match={match} language={language} onClick={()=>setSelected(match)} actions={<>
    {pendingResult&&<button className="primary-action compact" onClick={()=>setResultMatch(match)}><Trophy size={14}/>{copy.enterResult}</button>}
    {!pendingResult&&match.visibility!=='PRIVATE'&&<button className="dark-action compact" onClick={()=>setShareMatch(match)}><Share2 size={14}/>{copy.share}</button>}
  </>}/>)}</div>:<div className="empty-state archive-empty"><span>{empty}</span></div>;

  return <section className="page-content archive-page">
    <div className="page-heading" data-tour="archive">
      <div><span className="eyebrow">TAAMEN / ARCHIVE</span><h1>{copy.archive}</h1><p>{copy.archiveDesc}</p></div>
      <button className="primary-action" onClick={()=>{if(!canWrite){onRequireLocalLogin?.(language==='ar'?'إضافة مباراة إلى الأرشيف':'add a match to the archive');return;}setShowAdd(true)}}><Plus size={15}/>{copy.addArchived}</button>
    </div>
    <div className="archive-source-note"><span>{copy.sourceLocal}</span><b>{items.length} {copy.records}</b></div>
    <div className="archive-toolbar">
      <label className="archive-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={copy.searchArchive}/></label>
      <select className="archive-type-select" value={type} onChange={event=>setType(event.target.value as 'all'|MatchType)} aria-label={copy.type}>
        <option value="all">{copy.allTypes}</option>
        {(['friendly','normal','competitive','tournament','strong'] as MatchType[]).map(value=><option key={value} value={value}>{typeLabel(value)}</option>)}
      </select>
    </div>
    {pending.length > 0 && <section className={`archive-lifecycle-section is-pending${pendingOpen?' is-open':''}`}>
      <header>
        <button type="button" className="archive-disclosure" aria-expanded={pendingOpen} onClick={()=>setPendingOpen(open=>!open)}>
          <div><Clock3 size={19}/><span><h2>{copy.pendingSection}</h2><p>{pending.length===1?(language==='ar'?'هناك مباراة تنتظر إدخال النتيجة.':'One match is waiting for its result.'):language==='ar'?`هناك ${pending.length} مباريات تنتظر إدخال النتيجة.`:`${pending.length} matches are waiting for results.`}</p></span></div>
          <b>{pending.length}</b>
        </button>
      </header>
      {pendingOpen&&grid(pending,copy.noPending,true)}
    </section>}
    {grid(recorded,query?copy.trySearch:canWrite?copy.noRecorded:(language==='ar'?'سجّل محليًا لعرض أرشيفك الشخصي.':'Set up a local profile to view your personal archive.'))}
    <AdSlot placement="archive" />
    {recorded.length >= 3 && <AdSlot placement="archive-follow" />}
    {selected&&<ArchiveDetailModal match={selected} language={language} onClose={()=>setSelected(null)} onShare={()=>{setShareMatch(selected);setSelected(null)}} onEditResult={canonicalStatus(selected.status)==='COMPLETED_PENDING_RESULT'?()=>{setResultMatch(selected);setSelected(null)}:undefined} onEditPerformance={canonicalStatus(selected.status)!=='COMPLETED_PENDING_RESULT'&&canWrite?()=>{setPerformanceMatch(selected);setSelected(null)}:undefined} onDelete={(selected.source==='local'||selected.visibility==='LOCAL')&&canWrite?()=>void removeLocalMatch(selected):undefined}/>}
    {resultMatch&&<ResultEntryModal match={resultMatch} language={language} onClose={()=>setResultMatch(null)} onSaved={load}/>}
    {shareMatch&&<MatchShareModal match={shareMatch} language={language} onClose={()=>setShareMatch(null)}/>}
    {showAdd&&canWrite&&<AddArchiveModal language={language} onClose={()=>{setShowAdd(false);void load()}}/>}
    {performanceMatch&&canWrite&&<PersonalPerformanceModal match={performanceMatch} language={language} onClose={()=>setPerformanceMatch(null)} onSaved={()=>{void load();setPerformanceMatch(null)}}/>}
  </section>;
}
