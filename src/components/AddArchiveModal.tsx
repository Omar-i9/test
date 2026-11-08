import { useState } from 'react';
import { X, Clock, AlertCircle, ChevronDown, ChartNoAxesCombined } from 'lucide-react';
import type { MatchType } from '../data/footballData';
import { createArchivedMatch } from '../services/matchRepository';
import { archiveCopy, matchUiCopy } from '../i18n/translations';
import { todayInTimeZone, zonedDateTimeToEpoch } from '../shared/formatting/dateTime';
import TaamenDatePicker from './TaamenDatePicker';
import { useOverlayPresence } from '../motion/useOverlayPresence';
import MatchTimingFields from './MatchTimingFields';
import { blankTimingDraft, timingFromDraft, type TimingDraft } from '../domain/matches/matchTiming';
import { scheduleCopy } from '../i18n/translations';
import type { PersonalPerformance } from '../data/footballData';
import '../styles/personal-performance.css';

type Language = 'ar' | 'en';

interface AddArchiveModalProps {
  language: Language;
  onClose: () => void;
}

function ownScoreForFields(score1: string, score2: string, side: 'team1'|'team2') { const value = Number(side === 'team1' ? score1 : score2); return Number.isFinite(value) && value >= 0 ? value : 0; }

export default function AddArchiveModal({ language, onClose }: AddArchiveModalProps) {
  const ar = language === 'ar';
  const copy=matchUiCopy[language];
  const { backdropRef, panelRef, requestClose } = useOverlayPresence<HTMLButtonElement, HTMLElement>('modal', onClose);
  
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [stadium, setStadium] = useState('');
  const [city, setCity] = useState('');
  const [type, setType] = useState<MatchType>('friendly');
  const [timing, setTiming] = useState<TimingDraft>(blankTimingDraft);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [personalTeam, setPersonalTeam] = useState<'team1'|'team2'>('team1');
  const [personalGoals, setPersonalGoals] = useState('');
  const [personalAssists, setPersonalAssists] = useState('');
  const [minutesPlayed, setMinutesPlayed] = useState('');
  const [ratings, setRatings] = useState<Record<'defense'|'awareness'|'movement'|'passing'|'teamwork'|'effort', string>>({ defense:'', awareness:'', movement:'', passing:'', teamwork:'', effort:'' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const types=archiveCopy[language];
  const typeLabel = (v: string) => ({
    friendly: types.friendly,
    normal: types.normal,
    competitive: types.competitive,
    tournament: types.tournament,
    strong: types.strong
  } as Record<string, string>)[v] || v;

  const validateTimestamp = (): boolean => {
    if (!date || !time) {
      setError(copy.addArchiveRequired);
      return false;
    }

    const matchDateTime = zonedDateTimeToEpoch(date,time);
    if (!Number.isFinite(matchDateTime)||matchDateTime > Date.now()) {
      setError(copy.futureArchive);
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!team1.trim() || !team2.trim()) {
      setError(copy.addArchiveRequired);
      return;
    }

    if (!validateTimestamp()) {
      return;
    }

    const parsedTiming = timingFromDraft(timing);
    if (!parsedTiming) {
      setError(scheduleCopy[language].invalidTiming);
      return;
    }

    if (score1.trim() === '' || score2.trim() === '') {
      setError(ar ? 'أدخل نتيجة الفريقين. اكتب 0 فقط إذا كانت النتيجة فعلًا صفرًا.' : 'Enter both team scores. Enter 0 only when the score was actually zero.');
      return;
    }
    const leftScore = Number(score1);
    const rightScore = Number(score2);
    if (![leftScore,rightScore].every(value => Number.isInteger(value) && value >= 0 && value <= 99)) {
      setError(ar ? 'أدخل نتيجتين صحيحتين من 0 إلى 99.' : 'Enter valid scores from 0 to 99.');
      return;
    }
    const ownScore = personalTeam === 'team1' ? leftScore : rightScore;
    const goals = personalGoals.trim() === '' ? null : Number(personalGoals);
    const assists = personalAssists.trim() === '' ? null : Number(personalAssists);
    const minutes = minutesPlayed.trim() === '' ? null : Number(minutesPlayed);
    if (goals !== null && (!Number.isInteger(goals) || goals < 0 || goals > ownScore)) { setError(ar ? 'أهدافك الشخصية يجب ألا تتجاوز أهداف الفريق الذي لعبت معه.' : 'Your goals cannot exceed the score of your team.'); return; }
    if (assists !== null && (!Number.isInteger(assists) || assists < 0 || assists > ownScore || (goals !== null && assists > ownScore - goals))) { setError(ar ? 'تحقق من عدد الصناعات مقارنة بنتيجة فريقك وأهدافك.' : 'Check assists against your team score and personal goals.'); return; }
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 150)) { setError(ar ? 'أدخل دقائق من 1 إلى 150 أو اتركها فارغة.' : 'Enter 1–150 minutes or leave blank.'); return; }
    const selfAssessment = Object.fromEntries(Object.entries(ratings).map(([key,value]) => [key, value === '' ? null : Number(value)])) as NonNullable<PersonalPerformance['selfAssessment']>;
    const hasPersonalData = goals !== null || assists !== null || minutes !== null || Object.values(ratings).some(value => value !== '');
    const personalPerformance: PersonalPerformance | undefined = hasPersonalData ? { teamSide: personalTeam, goals, assists, minutesPlayed: minutes, selfAssessment, source: 'user_reported' } : undefined;

    setIsSubmitting(true);

    try {
      await createArchivedMatch({
        team1: team1.trim(),
        team2: team2.trim(),
        score1: leftScore,
        score2: rightScore,
        date,
        time,
        stadium: stadium.trim() || undefined,
        city: city.trim() || undefined,
        type,
        timing: parsedTiming.timing,
        personalPerformance,
      });
      onClose();
    } catch (err) {
      setError(copy.archiveFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <button ref={backdropRef} className="overlay-backdrop" onClick={requestClose} />
      <aside ref={panelRef} className="modal-card archive-modal">
        <header>
          <div>
            <span className="eyebrow">TAAMEN / ARCHIVE</span>
            <h2>{ar ? 'إضافة مباراة مؤرشفة' : 'Add Archived Match'}</h2>
          </div>
          <button className="icon-button" onClick={requestClose}>
            <X />
          </button>
        </header>

        <form className="archive-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              {ar ? 'الفريق الأول' : 'Team 1'} <span className="required">*</span>
              <input
                required
                value={team1}
                onChange={(e) => setTeam1(e.target.value)}
                placeholder={ar ? 'اسم الفريق' : 'Team name'}
              />
            </label>
            <label>
              {ar ? 'الفريق الثاني' : 'Team 2'} <span className="required">*</span>
              <input
                required
                value={team2}
                onChange={(e) => setTeam2(e.target.value)}
                placeholder={ar ? 'اسم الفريق' : 'Team name'}
              />
            </label>
            <label>
              {ar ? 'نتيجة الفريق الأول' : 'Team 1 Score'}
              <input
                type="number"
                min="0" max="99" required
                value={score1}
                onChange={(e) => setScore1(e.target.value)}
                placeholder="0"
              />
            </label>
            <label>
              {ar ? 'نتيجة الفريق الثاني' : 'Team 2 Score'}
              <input
                type="number"
                min="0" max="99" required
                value={score2}
                onChange={(e) => setScore2(e.target.value)}
                placeholder="0"
              />
            </label>
          </div>

          <div className="form-grid">
            <label>
              {ar ? 'التاريخ' : 'Date'} <span className="required">*</span>
              <TaamenDatePicker value={date} onChange={setDate} language={language} max={todayInTimeZone()} required/>
            </label>
            <label>
              {ar ? 'الوقت' : 'Time'} <span className="required">*</span>
              <div className="date-time-input">
                <Clock size={16} />
                <input
                  required
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </label>
          </div>

          <MatchTimingFields language={language} date={date} time={time || '19:00'} draft={timing} onChange={setTiming} />

          <div className="form-grid">
            <label>
              {ar ? 'الملعب' : 'Stadium'}
              <input
                value={stadium}
                onChange={(e) => setStadium(e.target.value)}
                placeholder={ar ? 'اسم الملعب' : 'Stadium name'}
              />
            </label>
            <label>
              {ar ? 'المدينة' : 'City'}
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={ar ? 'اسم المدينة' : 'City name'}
              />
            </label>
          </div>

          <label>
            {ar ? 'نوع المباراة' : 'Match Type'}
            <select value={type} onChange={(e) => setType(e.target.value as MatchType)}>
              <option value="friendly">{typeLabel('friendly')}</option>
              <option value="normal">{typeLabel('normal')}</option>
              <option value="competitive">{typeLabel('competitive')}</option>
              <option value="tournament">{typeLabel('tournament')}</option>
              <option value="strong">{typeLabel('strong')}</option>
            </select>
          </label>

          <section className={`archive-analytics-disclosure${analyticsOpen ? ' is-open' : ''}`}>
            <button type="button" className="archive-analytics-trigger" aria-expanded={analyticsOpen} onClick={() => setAnalyticsOpen(value => !value)}>
              <span className="archive-analytics-icon"><ChartNoAxesCombined size={17}/></span>
              <span className="archive-analytics-copy"><strong>{ar ? 'أضف تحليلاتك الشخصية' : 'Add your personal analytics'}</strong><small>{ar ? 'ميزة تأمين التجريبية الجديدة — يمكنك تسجيل أدائك لهذه المباراة من هنا.' : 'New TAAMEN preview feature — record your performance for this match here.'}</small></span>
              <ChevronDown size={17} className={analyticsOpen ? 'is-open' : ''}/>
            </button>
            {analyticsOpen && <div className="archive-analytics-fields">
              <p>{ar ? 'اختياري: اترك أي معلومة غير معروفة فارغة. ستظهر البيانات المسجلة في صفحة تحليلاتي، ولن نحول الفراغ إلى صفر.' : 'Optional: leave unknown values blank. Recorded details appear in My Analytics; blanks are not treated as zero.'}</p>
              <div className="result-score-grid personal-score-grid">
                <label>{ar ? 'الفريق الذي لعبت معه' : 'Team you played for'}<select value={personalTeam} onChange={event => setPersonalTeam(event.target.value as 'team1'|'team2')}><option value="team1">{team1.trim() || (ar ? 'الفريق الأول' : 'Team 1')}</option><option value="team2">{team2.trim() || (ar ? 'الفريق الثاني' : 'Team 2')}</option></select></label>
                <label>{ar ? 'أهدافك الشخصية' : 'Your goals'}<input type="number" min="0" max={ownScoreForFields(score1,score2,personalTeam)} value={personalGoals} onChange={event=>setPersonalGoals(event.target.value)} placeholder={ar ? 'غير مسجل' : 'Not recorded'}/></label>
                <label>{ar ? 'الصناعات' : 'Assists'}<input type="number" min="0" max={ownScoreForFields(score1,score2,personalTeam)} value={personalAssists} onChange={event=>setPersonalAssists(event.target.value)} placeholder={ar ? 'غير مسجل' : 'Not recorded'}/></label>
                <label>{ar ? 'دقائق المشاركة' : 'Minutes played'}<input type="number" min="1" max="150" value={minutesPlayed} onChange={event=>setMinutesPlayed(event.target.value)} placeholder={ar ? 'اختياري' : 'Optional'}/></label>
              </div>
              <div className="self-assessment-fields"><span className="self-assessment-title">{ar ? 'التقييم الذاتي (من 1 إلى 5)' : 'Self-assessment (1 to 5)'}</span><div className="self-assessment-grid">{([
                ['defense',ar?'الدفاع والتمركز':'Defending & positioning'],['awareness',ar?'قراءة اللعب':'Game awareness'],['movement',ar?'التحرك دون كرة':'Off-ball movement'],['passing',ar?'التمرير':'Passing'],['teamwork',ar?'اللعب الجماعي':'Teamwork'],['effort',ar?'الجهد واللياقة':'Effort & fitness']
              ] as const).map(([key,label])=><label key={key}>{label}<select value={ratings[key]} onChange={event=>setRatings(current=>({...current,[key]:event.target.value}))}><option value="">{ar?'غير مسجل':'Not rated'}</option>{[1,2,3,4,5].map(value=><option value={value} key={value}>{value} / 5</option>)}</select></label>)}</div></div>
            </div>}
          </section>

          {error && (
            <div className="error-message">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="dark-action" onClick={requestClose}>
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="submit" className="primary-action" disabled={isSubmitting}>
              {isSubmitting ? (ar ? 'جاري الحفظ...' : 'Saving...') : (ar ? 'حفظ المباراة' : 'Save Match')}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
