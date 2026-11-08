import { useState } from 'react';
import { Save, X } from 'lucide-react';
import type { Match, PersonalPerformance } from '../data/footballData';
import { recordPersonalPerformance } from '../services/matchRepository';
import { useOverlayPresence } from '../motion/useOverlayPresence';
import '../styles/personal-performance.css';

type Language = 'ar' | 'en';
const fields = [
  { key: 'defense', ar: 'الدفاع والتمركز', en: 'Defending & positioning' },
  { key: 'awareness', ar: 'قراءة اللعب', en: 'Game awareness' },
  { key: 'movement', ar: 'التحرك دون كرة', en: 'Off-ball movement' },
  { key: 'passing', ar: 'التمرير', en: 'Passing' },
  { key: 'teamwork', ar: 'اللعب الجماعي', en: 'Teamwork' },
  { key: 'effort', ar: 'الجهد واللياقة', en: 'Effort & fitness' },
] as const;

type RatingKey = typeof fields[number]['key'];
type DraftRatings = Record<RatingKey, string>;
const blankRatings: DraftRatings = { defense: '', awareness: '', movement: '', passing: '', teamwork: '', effort: '' };

export default function PersonalPerformanceModal({ match, language, onClose, onSaved }: { match: Match; language: Language; onClose: () => void; onSaved: () => void }) {
  const ar = language === 'ar';
  const current = match.personalPerformance;
  const [teamSide, setTeamSide] = useState<'team1' | 'team2'>(current?.teamSide || 'team1');
  const [goals, setGoals] = useState(current?.goals == null ? '' : String(current.goals));
  const [assists, setAssists] = useState(current?.assists == null ? '' : String(current.assists));
  const [minutes, setMinutes] = useState(current?.minutesPlayed == null ? '' : String(current.minutesPlayed));
  const [ratings, setRatings] = useState<DraftRatings>(() => Object.fromEntries(fields.map(({ key }) => [key, current?.selfAssessment?.[key] == null ? '' : String(current.selfAssessment[key])])) as DraftRatings);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { backdropRef, panelRef, requestClose } = useOverlayPresence<HTMLButtonElement, HTMLElement>('modal', onClose);
  const ownScore = teamSide === 'team1' ? match.score1 : match.score2;

  const save = async () => {
    const goalValue = goals.trim() === '' ? null : Number(goals);
    const assistValue = assists.trim() === '' ? null : Number(assists);
    const minuteValue = minutes.trim() === '' ? null : Number(minutes);
    if (goalValue !== null && (!Number.isInteger(goalValue) || goalValue < 0 || goalValue > ownScore)) {
      setError(ar ? 'أهدافك يجب أن تكون عددًا صحيحًا لا يتجاوز أهداف فريقك.' : 'Your goals must be a whole number no greater than your team score.'); return;
    }
    if (assistValue !== null && (!Number.isInteger(assistValue) || assistValue < 0 || assistValue > ownScore || (goalValue !== null && assistValue > ownScore - goalValue))) {
      setError(ar ? 'الصناعات يجب أن تكون عددًا صحيحًا وألا تتجاوز الأهداف المتاحة بعد أهدافك.' : 'Assists must be a whole number and cannot exceed the remaining team goals after your goals.'); return;
    }
    if (minuteValue !== null && (!Number.isInteger(minuteValue) || minuteValue < 1 || minuteValue > 150)) {
      setError(ar ? 'أدخل دقائق مشاركة بين 1 و150 أو اترك الحقل فارغًا.' : 'Enter 1–150 minutes played, or leave this field blank.'); return;
    }
    const selfAssessment = Object.fromEntries(fields.map(({ key }) => [key, ratings[key] === '' ? null : Number(ratings[key])])) as NonNullable<PersonalPerformance['selfAssessment']>;
    const performance: PersonalPerformance = { teamSide, goals: goalValue, assists: assistValue, minutesPlayed: minuteValue, selfAssessment, source: 'user_reported' };
    setSaving(true); setError('');
    try { await recordPersonalPerformance(match.id, performance); onSaved(); onClose(); }
    catch { setError(ar ? 'تعذّر حفظ إحصائياتك. حاول مرة أخرى.' : 'Could not save your personal stats. Please try again.'); }
    finally { setSaving(false); }
  };

  return <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="personal-performance-title">
    <button ref={backdropRef} className="overlay-backdrop" onClick={requestClose} aria-label={ar ? 'إغلاق' : 'Close'} />
    <aside ref={panelRef} className="modal-card personal-performance-modal">
      <header className="panel-heading"><div><p className="eyebrow">TAAMEN / PERSONAL PERFORMANCE</p><h2 id="personal-performance-title">{ar ? 'إحصائياتك الشخصية' : 'Your personal stats'}</h2></div><button className="icon-button" onClick={requestClose} aria-label={ar ? 'إغلاق' : 'Close'}><X /></button></header>
      <div className="result-match-preview"><strong>{match.team1}</strong><span>{match.score1} – {match.score2}</span><strong>{match.team2}</strong></div>
      <p className="settings-note">{ar ? 'هذا النموذج يحدّث بياناتك الشخصية فقط. نتيجة المباراة وإحصائيات الفريق لن تتغير.' : 'This form updates only your personal data. The match result and team statistics will not change.'}</p>
      <div className="result-score-grid personal-score-grid">
        <label>{ar ? 'لعبت مع' : 'My team'}<select value={teamSide} onChange={event => setTeamSide(event.target.value as 'team1' | 'team2')}><option value="team1">{match.team1}</option><option value="team2">{match.team2}</option></select></label>
        <label>{ar ? 'أهدافك' : 'Your goals'}<input type="number" min="0" max={ownScore} value={goals} onChange={event => setGoals(event.target.value)} placeholder={ar ? 'غير مسجل' : 'Not recorded'} /></label>
        <label>{ar ? 'الصناعات' : 'Assists'}<input type="number" min="0" max={ownScore} value={assists} onChange={event => setAssists(event.target.value)} placeholder={ar ? 'غير مسجل' : 'Not recorded'} /></label>
        <label>{ar ? 'دقائق المشاركة' : 'Minutes played'}<input type="number" min="1" max="150" value={minutes} onChange={event => setMinutes(event.target.value)} placeholder={ar ? 'اختياري' : 'Optional'} /></label>
      </div>
      <div className="self-assessment-fields"><span className="self-assessment-title">{ar ? 'تقييم ذاتي من 1 إلى 5' : 'Self-rating from 1 to 5'}</span><div className="self-assessment-grid">{fields.map(({ key, ar: arLabel, en }) => <label key={key}>{ar ? arLabel : en}<select value={ratings[key]} onChange={event => setRatings(previous => ({ ...previous, [key]: event.target.value }))}><option value="">{ar ? 'غير مسجل' : 'Not rated'}</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label>)}</div></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="dark-action" onClick={requestClose}>{ar ? 'إلغاء' : 'Cancel'}</button><button type="button" className="primary-action" onClick={() => void save()} disabled={saving}><Save size={15} />{saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ إحصائياتي' : 'Save my stats')}</button></div>
    </aside>
  </div>;
}
