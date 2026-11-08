import { useState, type Dispatch, type SetStateAction } from 'react';
import { Minus, Plus, Trophy, X } from 'lucide-react';
import type { Match, MatchFormat, PlayerContribution, PersonalPerformance } from '../data/footballData';
import { contributionCapacity, contributionsForSave, effectiveMatchFormat } from '../domain/matches/matchFormat';
import { matchUiCopy, type Language } from '../i18n/translations';
import { useOverlayPresence } from '../motion/useOverlayPresence';
import { recordMatchResult } from '../services/matchRepository';
import '../styles/personal-performance.css';

function emptyContribution(): PlayerContribution { return { playerName: '', goals: 0, assists: 0 }; }
const ratingFields = [
  { key: 'defense', ar: 'الدفاع والتمركز', en: 'Defending & positioning' },
  { key: 'awareness', ar: 'قراءة اللعب', en: 'Game awareness' },
  { key: 'movement', ar: 'التحرك دون كرة', en: 'Off-ball movement' },
  { key: 'passing', ar: 'التمرير', en: 'Passing' },
  { key: 'teamwork', ar: 'اللعب الجماعي', en: 'Teamwork' },
  { key: 'effort', ar: 'الجهد واللياقة', en: 'Effort & fitness' },
] as const;
type RatingKey = typeof ratingFields[number]['key'];

export default function ResultEntryModal({ match, language, onClose, onSaved }: { match: Match; language: Language; onClose: () => void; onSaved: () => void }) {
  const copy = matchUiCopy[language];
  const [score1, setScore1] = useState(String(match.score1 ?? ''));
  const [score2, setScore2] = useState(String(match.score2 ?? ''));
  const [story, setStory] = useState(match.story || '');
  const [format, setFormat] = useState<MatchFormat>(effectiveMatchFormat(match.matchFormat));
  const [team1, setTeam1] = useState<PlayerContribution[]>(() => [...(match.playerContributions?.team1 || [])]);
  const [team2, setTeam2] = useState<PlayerContribution[]>(() => [...(match.playerContributions?.team2 || [])]);
  const [whyOpen, setWhyOpen] = useState(false);
  const [personalTeam, setPersonalTeam] = useState<'team1'|'team2'>(match.personalPerformance?.teamSide || 'team1');
  const [personalGoals, setPersonalGoals] = useState(match.personalPerformance?.goals == null ? '' : String(match.personalPerformance.goals));
  const [personalAssists, setPersonalAssists] = useState(match.personalPerformance?.assists == null ? '' : String(match.personalPerformance.assists));
  const [minutesPlayed, setMinutesPlayed] = useState(match.personalPerformance?.minutesPlayed == null ? '' : String(match.personalPerformance.minutesPlayed));
  const [ratings, setRatings] = useState<Record<RatingKey, string>>({
    defense: match.personalPerformance?.selfAssessment?.defense == null ? '' : String(match.personalPerformance.selfAssessment.defense),
    awareness: match.personalPerformance?.selfAssessment?.awareness == null ? '' : String(match.personalPerformance.selfAssessment.awareness),
    movement: match.personalPerformance?.selfAssessment?.movement == null ? '' : String(match.personalPerformance.selfAssessment.movement),
    passing: match.personalPerformance?.selfAssessment?.passing == null ? '' : String(match.personalPerformance.selfAssessment.passing),
    teamwork: match.personalPerformance?.selfAssessment?.teamwork == null ? '' : String(match.personalPerformance.selfAssessment.teamwork),
    effort: match.personalPerformance?.selfAssessment?.effort == null ? '' : String(match.personalPerformance.selfAssessment.effort),
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { backdropRef, panelRef, requestClose } = useOverlayPresence<HTMLButtonElement, HTMLElement>('modal', onClose);
  const why = useOverlayPresence<HTMLButtonElement, HTMLElement>('modal', () => setWhyOpen(false), whyOpen);
  const capacity = contributionCapacity(format);
  const currentOwnScore = personalTeam === 'team1' ? (Number(score1) || 0) : (Number(score2) || 0);
  const update = (team: 'team1' | 'team2', index: number, field: keyof PlayerContribution, value: string) => {
    const rows = [...(team === 'team1' ? team1 : team2)];
    rows[index] = { ...rows[index], [field]: field === 'playerName' ? value : Math.max(0, Number(value) || 0) };
    (team === 'team1' ? setTeam1 : setTeam2)(rows);
  };
  const remove = (team: 'team1' | 'team2', index: number) => (team === 'team1' ? setTeam1 : setTeam2)(rows => rows.filter((_, row) => row !== index));
  const save = async () => {
    const left = Number(score1), right = Number(score2);
    if (score1.trim() === '' || score2.trim() === '' || !Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < 0 || left > 99 || right > 99) { setError(copy.invalidScore); return; }
    const ownScore = personalTeam === 'team1' ? left : right;
    const goals = personalGoals.trim() === '' ? null : Number(personalGoals);
    const assists = personalAssists.trim() === '' ? null : Number(personalAssists);
    const minutes = minutesPlayed.trim() === '' ? null : Number(minutesPlayed);
    if (goals !== null && (!Number.isInteger(goals) || goals < 0 || goals > ownScore)) { setError(language === 'ar' ? 'أهدافك الشخصية يجب أن تكون عددًا صحيحًا لا يتجاوز أهداف فريقك.' : 'Your goals must be a whole number no greater than your team score.'); return; }
    if (assists !== null && (!Number.isInteger(assists) || assists < 0 || assists > ownScore || (goals !== null && assists > ownScore - goals))) { setError(language === 'ar' ? 'الصناعات يجب أن تكون عددًا صحيحًا، وألا تتجاوز الأهداف المتاحة بعد احتساب أهدافك.' : 'Assists must be a whole number and cannot exceed the remaining team goals after your goals.'); return; }
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 150)) { setError(language === 'ar' ? 'أدخل دقائق مشاركة صحيحة بين 1 و150 أو اترك الحقل فارغًا.' : 'Enter 1–150 minutes played, or leave the field blank.'); return; }
    const selfAssessment = Object.fromEntries(ratingFields.map(({key}) => [key, ratings[key] === '' ? null : Number(ratings[key])])) as NonNullable<PersonalPerformance['selfAssessment']>;
    // Store the selected team perspective even when the player leaves all personal metrics unknown.
    const performance: PersonalPerformance = { teamSide: personalTeam, goals, assists, minutesPlayed: minutes, selfAssessment, source: 'user_reported' };
    setSaving(true); setError('');
    try {
      const clean = (rows: PlayerContribution[]) => contributionsForSave(rows, format).filter(row => row.playerName.trim()).map(row => ({ ...row, playerName: row.playerName.trim(), goals: Math.max(0, Math.trunc(Number(row.goals) || 0)), assists: Math.max(0, Math.trunc(Number(row.assists) || 0)) }));
      const contributions = { team1: clean(team1), team2: clean(team2) };
      await recordMatchResult(match.id, left, right, story.trim(), contributions.team1.length || contributions.team2.length ? contributions : undefined, format, performance);
      onSaved();
      onClose();
    } catch { setError(copy.resultFailed); } finally { setSaving(false); }
  };
  const contributions = (name: string, team: 'team1' | 'team2', rows: PlayerContribution[], setRows: Dispatch<SetStateAction<PlayerContribution[]>>) => {
    const visible = rows.slice(0, capacity);
    return <div className="result-contributions-team">
      <div className="contributions-team-header">
        <strong>{name}</strong>
        <span className="contribution-capacity" dir="ltr">{Math.min(visible.length, capacity)} / {capacity}</span>
        {rows.length < capacity && <button type="button" className="icon-button small" onClick={() => setRows(value => [...value, emptyContribution()])} aria-label={copy.player}><Plus size={14} /></button>}
      </div>
      {visible.map((row, index) => <div className="contribution-row" key={`${team}-${index}`}>
        <input value={row.playerName} onChange={event => update(team, index, 'playerName', event.target.value)} placeholder={copy.player} />
        <input type="number" min="0" value={row.goals || ''} onChange={event => update(team, index, 'goals', event.target.value)} placeholder={copy.goals} />
        <input type="number" min="0" value={row.assists || ''} onChange={event => update(team, index, 'assists', event.target.value)} placeholder={copy.assists} />
        <button type="button" className="icon-button small danger" onClick={() => remove(team, index)} aria-label={copy.delete}><Minus size={14} /></button>
      </div>)}
    </div>;
  };
  return <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="result-modal-title">
    <button ref={backdropRef} className="overlay-backdrop" onClick={requestClose} aria-label={copy.cancel} />
    <aside ref={panelRef} className="modal-card result-entry-modal">
      <header className="panel-heading"><div><p className="eyebrow">TAAMEN / RESULT</p><h2 id="result-modal-title">{copy.resultTitle}</h2></div><button className="icon-button" onClick={requestClose} aria-label={copy.cancel}><X /></button></header>
      <div className="result-match-preview"><strong>{match.team1}</strong><Trophy /><strong>{match.team2}</strong></div>
      <div className="result-score-grid">
        <label>{copy.team1Score}<input type="number" inputMode="numeric" min="0" max="99" value={score1} onChange={event => setScore1(event.target.value)} /></label>
        <label>{copy.team2Score}<input type="number" inputMode="numeric" min="0" max="99" value={score2} onChange={event => setScore2(event.target.value)} /></label>
      </div>
      <fieldset className="match-format-field">
        <legend>{copy.matchFormat}</legend>
        <div className="match-format-row">
          <div className="match-format-choice" role="radiogroup" aria-label={copy.matchFormat}>
            {(['5v5', '7v7'] as MatchFormat[]).map(option => (
              <button key={option} type="button" role="radio" aria-checked={format === option} className={format === option ? 'is-selected' : ''} onClick={() => setFormat(option)}>{option}</button>
            ))}
          </div>
          <button type="button" className="text-button" onClick={() => setWhyOpen(true)}>{copy.formatWhy}</button>
        </div>
      </fieldset>
      <label>{copy.note}<textarea rows={3} value={story} onChange={event => setStory(event.target.value)} /></label>
      <section className="result-contributions"><div><strong>{copy.contributions}</strong><small>{copy.contributionsHelp}</small></div>{contributions(match.team1, 'team1', team1, setTeam1)}{contributions(match.team2, 'team2', team2, setTeam2)}</section>
      <section className="personal-performance-entry">
        <div className="personal-performance-heading"><strong>{language === 'ar' ? 'إحصائياتك الشخصية' : 'Your personal stats'}</strong><small>{language === 'ar' ? 'اختيارية، وتُستخدم في صفحة تحليلاتي. اترك الحقل فارغًا إذا كانت المعلومة غير معروفة؛ الصفر يعني أنك سجلت صفرًا.' : 'Optional, used by My Analytics. Leave a field blank if unknown; zero means a known zero.'}</small></div>
        <div className="result-score-grid personal-score-grid">
          <label>{language === 'ar' ? 'لعبت مع' : 'My team'}<select value={personalTeam} onChange={event => setPersonalTeam(event.target.value as 'team1'|'team2')}><option value="team1">{match.team1}</option><option value="team2">{match.team2}</option></select></label>
          <label>{language === 'ar' ? 'أهدافك' : 'Your goals'}<input type="number" min="0" max={currentOwnScore} value={personalGoals} onChange={event => setPersonalGoals(event.target.value)} placeholder={language === 'ar' ? 'غير مسجل' : 'Not recorded'} /></label>
          <label>{language === 'ar' ? 'الصناعات' : 'Assists'}<input type="number" min="0" max={currentOwnScore} value={personalAssists} onChange={event => setPersonalAssists(event.target.value)} placeholder={language === 'ar' ? 'غير معروف' : 'Unknown'} /></label>
          <label>{language === 'ar' ? 'دقائق المشاركة' : 'Minutes played'}<input type="number" min="1" max="150" value={minutesPlayed} onChange={event => setMinutesPlayed(event.target.value)} placeholder={language === 'ar' ? 'اختياري' : 'Optional'} /></label>
        </div>
        <div className="self-assessment-fields"><span className="self-assessment-title">{language === 'ar' ? 'تقييم ذاتي من 1 إلى 5 (اختياري)' : 'Self-rating from 1 to 5 (optional)'}</span><div className="self-assessment-grid">{ratingFields.map(({key,ar,en})=><label key={key}>{language === 'ar' ? ar : en}<select value={ratings[key]} onChange={event => setRatings(current => ({...current,[key]:event.target.value}))}><option value="">{language === 'ar' ? 'غير مسجل' : 'Not rated'}</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value} / 5</option>)}</select></label>)}</div></div>
      </section>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="modal-actions"><button className="dark-action" onClick={requestClose}>{copy.cancel}</button><button className="primary-action" onClick={save} disabled={saving}>{saving ? copy.saving : copy.saveResult}</button></div>
    </aside>
    {whyOpen && <div className="overlay format-why-overlay" role="dialog" aria-modal="true" aria-labelledby="format-why-title">
      <button ref={why.backdropRef} className="overlay-backdrop" aria-label={copy.cancel} onClick={why.requestClose} />
      <aside ref={why.panelRef} className="modal-card format-why-modal">
        <header className="panel-heading"><h2 id="format-why-title">{copy.formatWhyTitle}</h2><button className="icon-button" onClick={why.requestClose} aria-label={copy.cancel}><X /></button></header>
        <p>{copy.formatWhyBody}</p>
        <button type="button" className="primary-action" onClick={why.requestClose}>{copy.formatOk}</button>
      </aside>
    </div>}
  </div>;
}
