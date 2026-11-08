import { useEffect, useState } from 'react';
import { Archive, CalendarDays, ClipboardList, Goal, PanelsTopLeft, Swords } from 'lucide-react';
import Matches from './Matches';
import ArchivePage from './Archive';
import TacticalBoard from './TacticalBoard';
import type { Language } from '../i18n/translations';
import type { RouteId } from '../config/routes';
import type { TacticalPlanLibraryRepository } from '../services/tacticalPlanLibraryRepository';
import { consumeMatchFromStadium, requestMatchFromStadium } from '../services/stadiumHandoff';
import '../styles/play-center.css';

type PlayTab = 'matches' | 'archive' | 'tactical';
const STORAGE_KEY = 'taamen-play-center-tab';

export default function PlayCenter({ language, canWrite = true, cloudAccountReady = false, onRequireLocalLogin, libraryRepository, go }: { language: Language; canWrite?: boolean; cloudAccountReady?: boolean; onRequireLocalLogin?: (action?: string) => void; libraryRepository?: TacticalPlanLibraryRepository; go: (page: RouteId) => void }) {
  const ar = language === 'ar';
  const [tab, setTab] = useState<PlayTab>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'archive' || saved === 'tactical' ? saved : 'matches';
    } catch { return 'matches'; }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, tab); } catch { /* storage may be unavailable */ }
  }, [tab]);

  // A stadium can hand off match details while the Play Space was last left on
  // the archive or tactical tab. Re-queue the one-shot handoff and activate
  // Matches; its mount effect will consume the details and open the editor.
  useEffect(() => {
    if (!canWrite) return;
    const pending = consumeMatchFromStadium();
    if (pending) {
      setTab('matches');
      requestMatchFromStadium(pending);
    }
  }, [canWrite]);

  const tabs: { id: PlayTab; label: string; description: string; Icon: typeof CalendarDays }[] = [
    { id: 'matches', label: ar ? 'مبارياتي' : 'My matches', description: ar ? 'أنشئ وجدول مواجهاتك' : 'Create and schedule matches', Icon: CalendarDays },
    { id: 'archive', label: ar ? 'السجل والأرشيف' : 'History & archive', description: ar ? 'وثّق النتائج السابقة' : 'Record completed results', Icon: Archive },
    { id: 'tactical', label: ar ? 'الملعب التكتيكي' : 'Tactical board', description: ar ? 'خطّط للحركة والتشكيلة' : 'Plan formations and movement', Icon: Swords },
  ];

  return <section className="play-center-page">
    <div className="play-center-intro">
      <div className="play-center-intro-mark"><PanelsTopLeft size={24}/></div>
      <div>
        <p className="eyebrow">TAAMEN / PLAY SPACE</p>
        <h1>{ar ? 'مساحة اللعب' : 'Play Space'}</h1>
        <p>{ar ? 'كل ما تحتاجه قبل المباراة وبعدها: أنشئ المواجهة، وثّق النتيجة في السجل نفسه، أو انتقل إلى الملعب التكتيكي لبناء خطتك.' : 'Everything around your match in one place: create a fixture, record its result in the same history, or open the tactical board to build your plan.'}</p>
      </div>
    </div>
    <div className="play-center-tabs" role="tablist" aria-label={ar ? 'أقسام مساحة اللعب' : 'Play space sections'}>
      {tabs.map(({ id, label, description, Icon }) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={`play-center-tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
        <span className="play-center-tab-icon"><Icon size={18}/></span>
        <span className="play-center-tab-copy"><strong>{label}</strong><small>{description}</small></span>
        <span className="play-center-tab-chevron" aria-hidden="true">{ar ? '‹' : '›'}</span>
      </button>)}
    </div>
    <div className={`play-center-view play-center-view-${tab}`} role="tabpanel">
      {tab === 'matches' && <Matches language={language} canWrite={canWrite} onRequireLocalLogin={onRequireLocalLogin}/>}
      {tab === 'archive' && <ArchivePage language={language} canWrite={canWrite} onRequireLocalLogin={onRequireLocalLogin}/>}
      {tab === 'tactical' && <TacticalBoard language={language} canWrite={canWrite} cloudAccountReady={cloudAccountReady} onRequireLocalLogin={onRequireLocalLogin} libraryRepository={libraryRepository} go={go}/>}
    </div>
    <p className="play-center-footnote"><Goal size={14}/>{ar ? 'بعد تسجيل النتيجة، افتح السجل والأرشيف لإضافة تحليلاتك الشخصية، ثم راجع تطورك من صفحة تحليلاتي.' : 'After recording the result, add your personal analytics in History & Archive, then review your progress in My Analytics.'}</p>
  </section>;
}
