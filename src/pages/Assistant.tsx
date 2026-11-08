import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUp, Bot, CalendarDays, ChartNoAxesCombined, CircleHelp, Goal, LockKeyhole, MessageCircleQuestion, RotateCcw, ShieldCheck, Sparkles, Swords, UserRound } from 'lucide-react';
import type { Match } from '../data/footballData';
import type { RouteId } from '../config/routes';
import type { Language } from '../i18n/translations';
import type { LocaleCode } from '../i18n/languages';
import { dateKeyToISO } from '../shared/formatting/dateTime';
import { listCurrentArchive } from '../services/archiveRepository';
import { hasRecordedResult } from '../services/matchLifecycle';
import { getProfile } from '../services/profileRepository';
import { askAssistantAI, AssistantAIError, buildAssistantAIContext, getAssistantAIQuota, getAssistantInstallationId, hasAssistantAIConsent, setAssistantAIConsent, type AssistantAIQuota } from '../services/assistantAI';
import { createAssistantConversation, loadAssistantConversation, limitAssistantMessages, resetAssistantConversation, saveAssistantConversation, titleForAssistantQuestion, type AssistantConversation, type AssistantMessage } from '../services/assistantConversations';
import '../styles/assistant.css';
import { clearTacticalPlanAIHandoff, readTacticalPlanAIHandoff, readTacticalPlanAIHandoffDetails, type TacticalAIPlanContext } from '../services/tacticalPlanAIContext';

type Context = 'analytics'|'play'|'tactical';
type Message = AssistantMessage;
type Reply = Omit<Message,'id'|'role'>;
type Suggestion = { id: string; text: string; icon: typeof ChartNoAxesCombined; context?: Context };

function classifyAIError(error: unknown): 'error'|'unavailable'|'timeout' {
  if (error instanceof AssistantAIError) {
    if (error.status === 408) return 'timeout';
    if (error.status === 0) return 'error';
    if (error.status === 404 || error.status === 503 || error.status === 502) return 'unavailable';
  }
  return 'error';
}

function renderInlineAssistantText(text:string){
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part,index)=>{
    if(part.startsWith('**')&&part.endsWith('**'))return <strong key={index}>{part.slice(2,-2)}</strong>;
    if(part.startsWith('`')&&part.endsWith('`'))return <code key={index}>{part.slice(1,-1)}</code>;
    return <span key={index}>{part}</span>;
  });
}

function renderAssistantText(text:string){
  const lines=text.replace(/\r/g,'').split('\n');
  const blocks:ReactNode[]=[];
  let paragraph:string[]=[];
  let list:{ordered:boolean;items:string[]} | null=null;
  let table:string[][]=[];
  const flushParagraph=()=>{if(paragraph.length){blocks.push(<p key={`p-${blocks.length}`}>{renderInlineAssistantText(paragraph.join(' ').trim())}</p>);paragraph=[];}};
  const flushList=()=>{if(list){const Tag=list.ordered?'ol':'ul';blocks.push(<Tag key={`l-${blocks.length}`}>{list.items.map((item,index)=><li key={index}>{renderInlineAssistantText(item)}</li>)}</Tag>);list=null;}};
  const flushTable=()=>{if(table.length){const rows=table.filter(row=>!row.every(cell=>/^:?-{2,}:?$/.test(cell.trim())));if(rows.length){blocks.push(<div className="assistant-table-wrap" key={`t-${blocks.length}`}><table><tbody>{rows.map((row,index)=><tr key={index}>{row.map((cell,cellIndex)=>index===0?<th key={cellIndex}>{renderInlineAssistantText(cell.trim())}</th>:<td key={cellIndex}>{renderInlineAssistantText(cell.trim())}</td>)}</tr>)}</tbody></table></div>);}table=[];}};
  for(const raw of lines){
    const line=raw.trim();
    if(!line){flushParagraph();flushList();flushTable();continue;}
    if(/^\|.*\|$/.test(line)){flushParagraph();flushList();table.push(line.slice(1,-1).split('|'));continue;}
    if(table.length)flushTable();
    const heading=line.match(/^(#{1,3})\s+(.+)$/);
    if(heading){flushParagraph();flushList();const Tag=heading[1].length===1?'h3':'h4';blocks.push(<Tag key={`h-${blocks.length}`}>{renderInlineAssistantText(heading[2])}</Tag>);continue;}
    const bullet=line.match(/^(?:[-•]\s+)(.+)$/);
    const numbered=line.match(/^\d+[.)]\s+(.+)$/);
    if(bullet||numbered){flushParagraph();if(!list)list={ordered:Boolean(numbered),items:[]};if(list.ordered!==Boolean(numbered)){flushList();list={ordered:Boolean(numbered),items:[]};}list.items.push((bullet||numbered)![1]);continue;}
    flushList();paragraph.push(line);
  }
  flushParagraph();flushList();flushTable();
  return blocks;
}
const starters: Suggestion[] = [
  { id:'review', text:'راجع أدائي في المباريات', icon:ChartNoAxesCombined, context:'analytics' },
  { id:'defending', text:'كيف أطور تمركزي الدفاعي؟', icon:ShieldCheck, context:'tactical' },
  { id:'tactics', text:'اقترح خطة عملية لـ 5 ضد 5', icon:Swords, context:'tactical' },
  { id:'record', text:'كم مباراة سجلت وما آخر مباراة؟', icon:CalendarDays, context:'play' },
];
const monthNames: Record<string,number> = {
  'يناير':1,'كانون الثاني':1,'فبراير':2,'شباط':2,'مارس':3,'آذار':3,'أبريل':4,'ابريل':4,'نيسان':4,'مايو':5,'أيار':5,'يونيو':6,'حزيران':6,'يوليو':7,'تموز':7,'أغسطس':8,'اغسطس':8,'آب':8,'سبتمبر':9,'أيلول':9,'اكتوبر':10,'أكتوبر':10,'تشرين الأول':10,'نوفمبر':11,'تشرين الثاني':11,'ديسمبر':12,'كانون الأول':12,'january':1,'jan':1,'february':2,'feb':2,'march':3,'mar':3,'april':4,'apr':4,'may':5,'june':6,'jun':6,'july':7,'jul':7,'august':8,'aug':8,'september':9,'sep':9,'sept':9,'october':10,'oct':10,'november':11,'nov':11,'december':12,'dec':12,
};
function normaliseDigits(value:string) {
  return value.replace(/[٠-٩۰-۹]/g,char=>String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(char)%10));
}
function matchISO(match:Match):string|null {
  if(match.dateISO && /^\d{4}-\d{2}-\d{2}/.test(match.dateISO)) return match.dateISO.slice(0,10);
  if(Number.isFinite(match.dateKey)&&match.dateKey>0){try{return dateKeyToISO(match.dateKey)}catch{return null}}
  return null;
}
function matchTime(match:Match) { const iso=matchISO(match); return iso ? new Date(`${iso}T12:00:00`).getTime() : Number.NaN; }
function formatDate(iso:string,ar:boolean) {
  const date=new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime())?iso:new Intl.DateTimeFormat(ar?'ar-PS':'en-GB',{day:'numeric',month:'long',year:'numeric'}).format(date);
}
function parseRequestedDate(query:string):string|null {
  const q=normaliseDigits(query);
  let m=q.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if(m){const [,year,month,day]=m;return validISO(Number(year),Number(month),Number(day));}
  m=q.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if(m){const [,day,month,year]=m;return validISO(Number(year),Number(month),Number(day));}
  const monthPattern=Object.keys(monthNames).sort((a,b)=>b.length-a.length).join('|');
  m=q.match(new RegExp(`(?:يوم\\s*)?(\\d{1,2})\\s+(?:من\\s+)?(${monthPattern})(?:\\s+(20\\d{2}))?`,'i'));
  if(m){const day=Number(m[1]);const month=monthNames[m[2].toLocaleLowerCase()]??monthNames[m[2]];const year=Number(m[3]||new Date().getFullYear());return validISO(year,month,day);}
  m=q.match(new RegExp(`(${monthPattern})\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?`,'i'));
  if(m){const month=monthNames[m[1].toLocaleLowerCase()]??monthNames[m[1]];const day=Number(m[2]);const year=Number(m[3]||new Date().getFullYear());return validISO(year,month,day);}
  return null;
}
function validISO(year:number,month:number,day:number):string|null {
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function resultLabel(match:Match,ar:boolean):string|null {
  const side=match.personalPerformance?.teamSide;
  if(!side)return null;
  const own=side==='team1'?match.score1:match.score2;
  const rival=side==='team1'?match.score2:match.score1;
  return own>rival?(ar?'فوز':'Win'):own===rival?(ar?'تعادل':'Draw'):(ar?'خسارة':'Loss');
}
function matchName(match:Match) { return match.title?.trim()||`${match.team1} × ${match.team2}`; }
function dateReply(query:string,matches:Match[],ar:boolean):Reply|null {
  if(!/(?:تاريخ|بتاريخ|يوم|مباراة.*(?:صار|صارت|كانت)|صار.*مباراة|المباراة.*(?:بـ|في|بتاريخ)|on\s+\d|date|which match.*(?:day|date)|match.*on\s+)/i.test(query))return null;
  const requested=parseRequestedDate(query);
  if(!requested)return null;
  const dated=matches.filter(match=>matchISO(match)).map(match=>({match,iso:matchISO(match)!}));
  if(!dated.length)return {text:ar?'ما عندي مباريات مؤرشفة بتاريخ واضح أقدر أقارنها بالتاريخ المطلوب. أضف تاريخ المباراة في الأرشيف، وبعدها أقدر أطلعها لك.':'I do not have a dated archived match to compare with that date. Add a match date to the archive and I can look it up.',context:'play'};
  const target=new Date(`${requested}T12:00:00`).getTime();
  const ranked=dated.map(item=>({...item,diff:Math.abs(new Date(`${item.iso}T12:00:00`).getTime()-target)})).sort((a,b)=>a.diff-b.diff);
  const chosen=ranked[0];
  const exact=chosen.iso===requested;
  const dayDiff=Math.round(chosen.diff/86400000);
  const match=chosen.match;
  const personal=match.personalPerformance;
  const personalOutcome=resultLabel(match,ar);
  const note=match.story?.trim();
  const personalLine=personal&&(typeof personal.goals==='number'||typeof personal.assists==='number')
    ? (ar?` ومن بياناتك الشخصية المسجلة: ${personal.goals===null?'الأهداف غير مسجلة':`${personal.goals} أهداف`}، و${personal.assists===null?'الصناعات غير مسجلة':`${personal.assists} صناعات`}.`:` Personal record: ${personal.goals===null?'goals not recorded':`${personal.goals} goals`}, ${personal.assists===null?'assists not recorded':`${personal.assists} assists`}.`)
    : '';
  const openLine=exact?'':(ar?` ما لقيت مباراة في اليوم نفسه؛ أقرب سجل بتاريخ ${formatDate(chosen.iso,true)} (فرق ${dayDiff} يوم).`:` No match was recorded on that exact date; the closest entry is ${formatDate(chosen.iso,false)} (${dayDiff} days away).`);
  const template=(normaliseDigits(query).length+matches.length+Number(requested.slice(-2)))%3;
  const scoreSummary=`${match.team1} ${match.score1}–${match.score2} ${match.team2}`;
  const summary=ar?`${matchName(match)}: ${scoreSummary}.${personalOutcome?` نتيجتك المسجلة: ${personalOutcome}.`:' لم تحدد أي فريق لعبت معه، لذلك لا أستنتج الفوز أو الخسارة من منظورك.'}`:`${matchName(match)}: ${scoreSummary}.${personalOutcome?` Your recorded outcome: ${personalOutcome}.`:' Your team was not recorded, so I cannot infer your personal win/loss result.'}`;
  const variants=ar?[
    `${summary}${openLine} التاريخ: ${formatDate(chosen.iso,true)}.${personalLine}${note?` ملاحظة المباراة: ${note}`:''}`,
    `لقيت السجل الأقرب للتاريخ الذي ذكرته: ${summary}${openLine}${personalLine}${note?` أبرز ما دوّنته عنها: ${note}`:''}`,
    `${exact?'هاي المباراة المسجلة في التاريخ المطلوب':'هاي أقرب مباراة متوفرة في الأرشيف للتاريخ المطلوب'}: ${summary}${openLine} ${formatDate(chosen.iso,true)}.${personalLine}${note?` تفاصيل إضافية: ${note}`:''}`
  ]:[
    `${summary}${openLine} Date: ${formatDate(chosen.iso,false)}.${personalLine}${note?` Match note: ${note}`:''}`,
    `Here is the closest record for that date: ${summary}${openLine}${personalLine}${note?` Recorded note: ${note}`:''}`,
    `${exact?'This is the match recorded on the requested date':'This is the closest available match to the requested date'}: ${summary}${openLine} ${formatDate(chosen.iso,false)}.${personalLine}${note?` Additional details: ${note}`:''}`
  ];
  return {text:variants[template],context:'play'};
}
function ratingRowsForMatch(match:Match) {
  const ratings=match.personalPerformance?.selfAssessment;
  if(!ratings)return [];
  return Object.entries(ratings).filter((entry):entry is [string,number]=>typeof entry[1]==='number'&&entry[1]>=1&&entry[1]<=5).map(([key,value])=>({key,value}));
}
function ratingRowsForMatchAggregate(matches:Match[]) {
  const labels:Record<string,{ar:string;en:string}>={defense:{ar:'الدفاع والتمركز',en:'Defending & positioning'},awareness:{ar:'قراءة اللعب',en:'Game awareness'},movement:{ar:'التحرك دون كرة',en:'Off-ball movement'},passing:{ar:'التمرير',en:'Passing'},teamwork:{ar:'اللعب الجماعي',en:'Teamwork'},effort:{ar:'الجهد واللياقة',en:'Effort & fitness'}};
  return Object.entries(labels).map(([key,label])=>{const ratingKey=key as 'defense'|'awareness'|'movement'|'passing'|'teamwork'|'effort';const values=matches.map(match=>match.personalPerformance?.selfAssessment?.[ratingKey]).filter((value):value is number=>typeof value==='number'&&value>=1&&value<=5);return {key,...label,count:values.length,avg:values.length?values.reduce((sum,value)=>sum+value,0)/values.length:Infinity};}).filter(row=>Number.isFinite(row.avg));
}

function computeReply(query:string,matches:Match[],language:Language):Reply {
  const ar=language==='ar';
  const q=normaliseDigits(query).toLocaleLowerCase();
  const dated=dateReply(query,matches,ar);if(dated)return dated;
  const latest=matches.slice().filter(matchISO).sort((a,b)=>matchTime(b)-matchTime(a))[0];
  const withStats=matches.filter(match=>typeof match.personalPerformance?.goals==='number'||typeof match.personalPerformance?.assists==='number');
  const goals=matches.reduce((sum,match)=>sum+(typeof match.personalPerformance?.goals==='number'?match.personalPerformance.goals:0),0);
  const goalsCount=matches.filter(match=>typeof match.personalPerformance?.goals==='number').length;
  const assists=matches.reduce((sum,match)=>sum+(typeof match.personalPerformance?.assists==='number'?match.personalPerformance.assists:0),0);
  const assistsCount=matches.filter(match=>typeof match.personalPerformance?.assists==='number').length;
  const variant=(q.length+matches.length+(q.charCodeAt(0)||0))%3;
  if(/(?:كم|عدد).{0,15}(?:مباراة|مباريات)|how many matches|عدد المباريات/.test(q)) return {text:ar?`في سجلك ${matches.length} مباريات مكتملة بنتيجة مسجلة. ${withStats.length} منها فيها أهدافك أو صناعاتك الشخصية. السجل ما يشمل بيانات لم تُسجّل بعد، وممكن تضيف مباراة قديمة مباشرة من الأرشيف.`:`Your match record contains ${matches.length} completed matches with recorded results. ${withStats.length} include personal goals or assists. The archive cannot infer missing records; you can add a past match directly from the archive.`,context:'play'};
  if(/(?:آخر|اخر|أحدث|احدث).{0,12}(?:مباراة|نتيجة)|last match|most recent match|latest match/.test(q)){
    if(!latest)return {text:ar?'ما في مباراة بتاريخ مسجل أقدر أحددها كآخر مباراة. أضف سجلًا بتاريخ واضح، وبعدها بعرض لك آخر نتيجة.':'I cannot identify the latest match because no archived match has a usable date. Add a dated record and I can show the latest result.',context:'play'};
    const personalOutcome=resultLabel(latest,ar);
    const scoreSummary=`${latest.team1} ${latest.score1}–${latest.score2} ${latest.team2}`;
    const summary=ar?`${matchName(latest)} بتاريخ ${formatDate(matchISO(latest)!,true)}. النتيجة المسجلة: ${scoreSummary}.${personalOutcome?` نتيجتك المسجلة: ${personalOutcome}.`:' لم يتم تحديد الفريق الذي لعبت معه، لذلك لا أستنتج نتيجة شخصية.'}`:`${matchName(latest)} on ${formatDate(matchISO(latest)!,false)}. Recorded score: ${scoreSummary}.${personalOutcome?` Your recorded outcome: ${personalOutcome}.`:' Your team was not specified, so I cannot infer your personal outcome.'}`;
    return {text:variant===0?summary:variant===1?`${summary}${ar?' إذا كنت تقصد مباراة ثانية، اكتب تاريخها أو اسم أحد الفريقين حتى أراجع السجل الأقرب.':' If you meant another match, share its date or one team name and I will check the closest record.'}`:`${ar?'أحدث سجل عندي هو: ':'The latest dated record is: '}${summary}`,context:'play'};
  }
  if(/تقييم|ratings?|ضعف|weak|drill|training|تدريب/.test(q)){
    const observed=matches.flatMap(match=>ratingRowsForMatch(match));
    if(!observed.length) return {text:ar?'ما في تقييمات ذاتية مسجلة حتى الآن، لذلك ما بدي أخمّن نقطة ضعفك. بعد كل مباراة افتح قسم «أضف تحليلاتك الشخصية» واختر تقييمًا من 1 إلى 5 للمحاور التي تستطيع الحكم عليها. إلى ذلك الحين، جرّب تمرينًا عامًا: 4 جولات من 60 ثانية تمرير وتحرك ثم راحة 30 ثانية، وركّز على مسح الملعب قبل استلام الكرة.':'There are no self-ratings recorded yet, so I will not guess your weak area. After a match, open “Add your personal analytics” and rate the areas you can judge from 1–5. Meanwhile, try four 60-second rounds of pass-and-move with 30 seconds of rest, focusing on scanning before receiving.',context:'tactical'};
    const avgByKey=ratingRowsForMatchAggregate(matches);
    const lowest=avgByKey.slice().sort((a,b)=>a.avg-b.avg)[0];
    const drills:Record<string,{ar:string;en:string}>={
      defense:{ar:'نفّذ 4 جولات من موقف 2 ضد 2: لاعب يضغط، والثاني يغطي خط التمرير. بدّل الأدوار كل 60 ثانية وراجع المسافة بينك وبين زميلك.',en:'Run four 2v2 rounds: one player presses while the other blocks the passing lane. Switch roles every 60 seconds and review the distance between you and your teammate.'},
      awareness:{ar:'قبل كل استلام، انظر فوق كتفك مرتين وحدد زميلًا وخصمًا. نفّذ 20 استلامًا بلمستين، وقل اسم الخيار المتاح قبل وصول الكرة.',en:'Scan over your shoulder twice before each reception and identify one teammate and one opponent. Complete 20 two-touch receptions, naming the available option before the ball arrives.'},
      movement:{ar:'كرر 8 مرات: ابتعد خطوتين عن المدافع، غيّر الاتجاه، ثم تحرك إلى زاوية تمرير جديدة. لا تبدأ الجري قبل أن تراقب حامل الكرة.',en:'Repeat eight times: move two steps away from the defender, change direction, then enter a new passing lane. Do not start the run before checking the ball carrier.'},
      passing:{ar:'تمرّن على تمرير سريع في مربع صغير: 3 لاعبين ضد مدافع، لمستين كحد أقصى، وتغيير زاوية بعد كل تمريرة لمدة 4 جولات.',en:'Practise fast passing in a small square: three players against one defender, maximum two touches, and change angle after every pass for four rounds.'},
      teamwork:{ar:'قبل بداية اللعب اتفقوا على كلمات قصيرة للضغط والتغطية والعودة. نفّذوا 5 هجمات ثم قيّموا هل كان القرار واضحًا لكل لاعب.',en:'Agree on short calls for pressing, covering and recovery before play. Run five attacks, then review whether every player understood the decision.'},
      effort:{ar:'جرّب 6 فترات من 20 ثانية حركة عالية الشدة و40 ثانية تعافٍ، وتوقف إذا شعرت بألم أو دوخة. عدّل الحمل حسب لياقتك.',en:'Try six intervals of 20 seconds of high-intensity movement and 40 seconds of recovery. Stop if you feel pain or dizziness and adapt the workload to your fitness.'},
    };
    const drill=drills[lowest.key]||drills.awareness;
    return {text:ar?`أقل محور في تقييماتك الحالية هو «${lowest.ar}» بمتوسط ${lowest.avg.toFixed(1)} من 5 عبر ${lowest.count} تقييمات. هذا مؤشر ذاتي وليس حكمًا موضوعيًا. ${drill.ar} أعد تقييم المحور بعد 3 مباريات بدل الحكم من مباراة واحدة.`:`Your lowest current self-rated area is “${lowest.en}”, averaging ${lowest.avg.toFixed(1)}/5 across ${lowest.count} ratings. This is self-reported, not an objective verdict. ${drill.en} Reassess after three matches rather than judging from a single game.`,context:'tactical'};
  }
  if(/أداء|إحص|تحليل|مستوا|هدف|أهداف|صناعة|اسيست|goal|assist|performance|stat|analytics|score/.test(q)){
    if(!withStats.length)return {text:ar?'لسه ما عندي بيانات أداء شخصية مسجلة كفاية للتحليل. افتح مساحة اللعب ← السجل والأرشيف، وأضف أهدافك وصناعاتك أو تقييمك الذاتي بعد المباراة. اترك المعلومة المجهولة فارغة؛ لا تدخل صفرًا إلا إذا كانت فعلًا صفرًا.':'There is not enough personal performance data yet. Open Play Space → History & Archive and add your goals, assists, or self-ratings. Leave unknown values blank; enter zero only when the value is truly zero.',context:'play'};
    const variants=ar?[
      `من ${withStats.length} مباريات فيها بيانات شخصية: ${goals} أهداف مسجلة عبر ${goalsCount} مباريات، و${assists} صناعات عبر ${assistsCount} مباريات. البيانات من إدخالك اليدوي وليست تتبعًا آليًا. افتح تحليلاتي للمقارنة بين آخر 7 أو 15 أو 30 يومًا.`,
      `الرقم المسجل حاليًا هو ${goals} أهداف و${assists} صناعات؛ لا يعني هذا أن الباقي صفر، لأن ${matches.length-withStats.length} مباريات لا تتضمن بيانات شخصية كافية. للحصول على قراءة أعدل، قارن المباريات التي سجلت فيها بيانات فعلية من صفحة تحليلاتي.`,
      `تحليلك الحالي يعتمد على ${withStats.length} مباريات ذات مساهمات شخصية مسجلة: ${goals} أهداف و${assists} صناعات. هذه أرقام وصفية، ولا تكفي وحدها للحكم على المستوى. أضف تقييمات الدفاع والتمرير والتحرك بعد عدة مباريات حتى تظهر نقاط مراجعة أكثر فائدة.`
    ]:[
      `Across ${withStats.length} matches with personal data, you recorded ${goals} goals in ${goalsCount} matches and ${assists} assists in ${assistsCount} matches. These are manual entries, not automatic tracking. Open My Analytics to compare the last 7, 15, or 30 days.`,
      `The current record shows ${goals} goals and ${assists} assists. That does not mean all other matches had zero; ${matches.length-withStats.length} matches do not include enough personal data. Compare only the matches with recorded values in My Analytics.`,
      `Your current summary uses ${withStats.length} matches with personal contributions: ${goals} goals and ${assists} assists. Those totals describe the record, not your overall skill. Add self-ratings for defending, passing, and movement over several games to get more useful review areas.`
    ];
    return {text:variants[variant],context:'analytics'};
  }
  if(/دفاع|تمركز|غط|ضغط|defen|position|marking|press/.test(q))return {text:ar?'جرّب روتينًا من ثلاث مراحل: قبل استلام الكرة افحص كتفك وحدد أقرب خصم؛ عند فقدانها اضغط فقط إذا كان زميلك يغطي المساحة خلفك؛ وإذا تم تجاوزك ارجع إلى خط التمرير بين الخصم والمرمى بدل مطاردة الكرة من الخلف. في التدريب، كرر موقف 2 ضد 2 ثم قيّم قرارك بعد المباراة. هذه إرشادات عامة؛ سجل تقييم الدفاع والتمركز لتربط النصيحة بتجربتك.':'Try a three-part routine: scan before receiving, press after losing the ball only when a teammate covers behind you, and recover into the passing lane between the opponent and goal if you are bypassed. Practise a 2v2 scenario, then rate your decision after the match. This is general guidance; record your defending rating to link future advice to your experience.',context:'tactical'};
  if(/تكتيك|خط[ةه]|تشكيل|5 ضد 5|خطة|tactic|formation|5.?a.?side|5v5|2-2|1-2-1/.test(q))return {text:ar?'كبداية لـ5 ضد 5 جرّب 1-2-1: لاعب خلفي لتغطية العمق، لاعبان بالوسط يصنعان زوايا تمرير، ومهاجم يثبت آخر خط. عند الضغط، أقرب لاعب يضغط والثاني يسكر تمريرة الوسط، والخلفي لا يترك العمق. إذا كان الخصم أقوى بالوسط، جرّب 2-2 بدلًا منها. ارسم المسار بالملعب التكتيكي واحفظ النسخة التي تناسب فريقك؛ لا توجد تشكيلة مثالية لكل الفرق.':'For 5-a-side, start with 1-2-1: a deeper player covers the middle, two midfielders create passing angles, and a forward stretches the last line. When pressing, the nearest player pressures, the second blocks the central pass, and the deeper player protects space. If the opponent dominates midfield, test a 2-2 instead. Sketch and save the plan on the tactical board; no formation is best for every team.',context:'tactical'};
  if(/مباراة|نتيجة|أرش|سجل|create|match|result|archive/.test(q))return {text:ar?'لإنشاء مباراة جديدة افتح مساحة اللعب ← مبارياتي. لتسجيل مباراة انتهت أو حدثت سابقًا، ادخل إلى السجل والأرشيف وأضف الفريقين والنتيجة والتاريخ؛ ستجد قسم «أضف تحليلاتك الشخصية» مطويًا في نهاية النموذج. اكتب ما تعرفه فقط، وبعدها راجع تحليلاتي.':'To create a fixture, open Play Space → My Matches. To record a completed or historical match, go to History & Archive and enter both teams, score, and date. The collapsed “Add your personal analytics” section is at the end of the form. Record only what you know, then review My Analytics.',context:'play'};
  if(/مرحب|مرحبا|اهل|أهل|hello|hi\b|help|مساعدة/.test(q))return {text:ar?'أهلًا فيك. بقدر أساعدك في مراجعة بيانات الأرشيف، إيجاد مباراة بتاريخ محدد، اقتراح تكتيك، أو توضيح طريقة تسجيل أهدافك وصناعاتك. اسأل عن شيء محدد أو استخدم أحد الاقتراحات الجانبية.':'Welcome. I can review archive data, find a match by date, suggest a tactic, or explain how to record your goals and assists. Ask a specific question or choose one of the contextual suggestions.',context:'play'};
  return {text:ar?'ما قدرت أحدد المطلوب بدقة من صياغة السؤال. جرّب توضيح المباراة أو الإحصائية أو الميزة التي تقصدها. أمثلة: «ما آخر مباراة؟»، «كم هدفًا سجلت؟»، «حلل مباراة بتاريخ 12/10/2026»، أو «كيف أطور تمركزي الدفاعي؟».':'I could not identify the request clearly. Please specify the match, statistic, or app feature you mean. For example, “What was my latest match?”, “How many goals have I recorded?”, “Analyze my match on 12/10/2026”, or “How can I improve my defensive positioning?”.',context:'play'};
}
function suggestionsFor(lastUserText:string, lastContext:Context|undefined, ar:boolean):Suggestion[] {
  const q=normaliseDigits(lastUserText).toLocaleLowerCase();
  if(/تاريخ|بتاريخ|مباراة.*يوم|date|last match|آخر مباراة/.test(q))return [
    {id:'latest',text:ar?'اعرض آخر مباراة مسجلة':'Show my latest recorded match',icon:CalendarDays,context:'play'},
    {id:'stats',text:ar?'لخص أهدافي وصناعاتي':'Summarize my goals and assists',icon:Goal,context:'analytics'},
    {id:'archive',text:ar?'كيف أضيف مباراة للأرشيف؟':'How do I add a match to the archive?',icon:MessageCircleQuestion,context:'play'},
  ];
  if(lastContext==='analytics'||/أداء|أهداف|صناعة|تحليل|goal|assist|performance/.test(q))return [
    {id:'stats7',text:ar?'قارن آخر 7 أيام':'Compare the last 7 days',icon:ChartNoAxesCombined,context:'analytics'},
    {id:'ratings',text:ar?'ما أضعف تقييماتي؟':'Which self-ratings are lowest?',icon:ShieldCheck,context:'analytics'},
    {id:'training',text:ar?'اقترح تدريبًا لنقطة ضعف':'Suggest a drill for a weak area',icon:Swords,context:'tactical'},
  ];
  if(lastContext==='tactical'||/تمركز|دفاع|خطة|تشكيل|تكتيك|defen|tactic/.test(q))return [
    {id:'formation',text:ar?'متى أستخدم 2-2 بدل 1-2-1؟':'When should I use 2-2 instead of 1-2-1?',icon:Swords,context:'tactical'},
    {id:'press',text:ar?'كيف أنظم الضغط الجماعي؟':'How should we coordinate a press?',icon:ShieldCheck,context:'tactical'},
    {id:'board',text:ar?'افتح الملعب التكتيكي':'Open the tactical board',icon:ChartNoAxesCombined,context:'tactical'},
  ];
  return [
    {id:'latest',text:ar?'ما آخر مباراة في سجلي؟':'What is my latest match?',icon:CalendarDays,context:'play'},
    {id:'stats',text:ar?'لخص إحصاءاتي الشخصية':'Summarize my personal stats',icon:Goal,context:'analytics'},
    {id:'tactics',text:ar?'اقترح خطة لـ5 ضد 5':'Suggest a 5-a-side plan',icon:Swords,context:'tactical'},
  ];
}
export default function Assistant({ language, selectedLocale, go, canWrite = false }: { language: Language; selectedLocale: LocaleCode; go: (page: RouteId) => void; canWrite?: boolean }) {
  const ar=language==='ar';
  const [aiConnectionState,setAiConnectionState]=useState<'checking'|'consent-required'|'local-profile-required'|'ready'|'connected'|'error'|'unavailable'|'timeout'>('checking');
  const [matches,setMatches]=useState<Match[]>([]);
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [thinking,setThinking]=useState(false);
  const [profileName,setProfileName]=useState('');
  const [aiConsent,setAiConsent]=useState(false);
  const [aiConsentReady,setAiConsentReady]=useState(false);
  const [consentSaving,setConsentSaving]=useState(false);
  const [quota,setQuota]=useState<AssistantAIQuota|null>(null);
  const [aiError,setAiError]=useState('');
  const [pendingTacticalPlan,setPendingTacticalPlan]=useState<TacticalAIPlanContext|null>(null);
  const tacticalExpiryTimerRef=useRef<number|null>(null);
  const [conversation,setConversation]=useState<AssistantConversation>(()=>createAssistantConversation(language));
  const [historyReady,setHistoryReady]=useState(false);
  const requestEpochRef=useRef(0);
  const installationIdRef=useRef<string|null>(null);
  const messages=conversation.messages;
  const currentConversationRef=useRef(conversation);
  currentConversationRef.current=conversation;
  const messagesEndRef=useRef<HTMLDivElement>(null);
  const listRef=useRef<HTMLDivElement>(null);
  const load=useCallback(async()=>{
    if(!canWrite){setMatches([]);return;}
    try{setMatches((await listCurrentArchive()).filter(hasRecordedResult).filter(match=>match.visibility!=='PRIVATE'&&match.source!=='legacy'));}catch{setMatches([]);}
  },[canWrite]);
  useEffect(()=>{void load();if(!canWrite)return;window.addEventListener('taamen-matches-changed',load);return()=>window.removeEventListener('taamen-matches-changed',load)},[load,canWrite]);
  const clearTacticalAttachment=useCallback((expired=false)=>{
    if(tacticalExpiryTimerRef.current!==null){window.clearTimeout(tacticalExpiryTimerRef.current);tacticalExpiryTimerRef.current=null;}
    clearTacticalPlanAIHandoff();
    setPendingTacticalPlan(null);
    if(expired)setAiError(ar?'انتهت صلاحية مرفق الخطة بعد 30 دقيقة. أرفق الخطة من الملعب مرة أخرى إذا أردت تحليلها.':'The tactical plan attachment expired after 30 minutes. Attach it again from the board to analyze it.');
  },[ar]);
  useEffect(()=>{
    if(!canWrite){clearTacticalAttachment();return;}
    const handoff=readTacticalPlanAIHandoffDetails();
    if(!handoff)return;
    setPendingTacticalPlan(handoff.plan);
    setAiError('');
    setInput(current=>current.trim()?current:(ar?'حلّل الخطة التكتيكية المرفقة. اشرح شكل الفريق، مسارات اللعب، مناطق الضغط، والمساحات التي تحتاج تغطية.':'Analyze the attached tactical plan: explain the shape, routes, pressing zones, and spaces that need cover.'));
    const delay=Math.max(0,handoff.expiresAt-Date.now());
    tacticalExpiryTimerRef.current=window.setTimeout(()=>clearTacticalAttachment(true),delay);
    return()=>{
      if(tacticalExpiryTimerRef.current!==null){window.clearTimeout(tacticalExpiryTimerRef.current);tacticalExpiryTimerRef.current=null;}
    };
  },[ar,canWrite,clearTacticalAttachment]);
  useEffect(()=>{
    let active=true;
    const restore=async()=>{
      try{
        const loaded=await loadAssistantConversation(language);
        if(active)setConversation(loaded);
      }catch{
        if(active)setConversation(createAssistantConversation(language));
      }finally{if(active)setHistoryReady(true)}
    };
    void restore();
    return()=>{active=false};
  },[]);
  useEffect(()=>{
    let active=true;
    const initializeAI=async()=>{
      setAiConsentReady(false);
      setAiConnectionState('checking');
      if(!canWrite){setProfileName('');setAiConsent(false);setQuota(null);setAiConnectionState('local-profile-required');setAiConsentReady(true);return;}
      try{
        const [profile,consent,installationId]=await Promise.all([getProfile(),hasAssistantAIConsent(),Promise.resolve(getAssistantInstallationId())]);
        if(!active)return;
        setProfileName([profile?.firstName,profile?.lastName].filter(Boolean).join(' ').trim());
        setAiConsent(consent);
        installationIdRef.current=installationId;
        if(consent){
          try{setQuota(await getAssistantAIQuota(installationId));setAiConnectionState('ready');}
          catch(error){setQuota(null);setAiConnectionState(classifyAIError(error));}
        }else{setAiConnectionState('consent-required');}
      }catch(error){if(active){setAiError(error instanceof Error?error.message:'تعذّر تجهيز المساعد.');setAiConnectionState(classifyAIError(error));}}
      finally{if(active)setAiConsentReady(true);}
    };
    void initializeAI();
    return()=>{active=false};
  },[canWrite]);
  useEffect(()=>{if(listRef.current)listRef.current.scrollTop=listRef.current.scrollHeight;},[messages,thinking,aiConsent]);
  useEffect(()=>{
    if(!historyReady)return;
    const timer=window.setTimeout(()=>{
      const current=currentConversationRef.current;
      void saveAssistantConversation({ ...current, messages: limitAssistantMessages(current.messages) }).then(saved=>{
        if(saved)currentConversationRef.current=saved;
      }).catch(()=>{});
    },420);
    return()=>window.clearTimeout(timer);
  },[conversation,historyReady]);
  useEffect(()=>()=>{
    const current=currentConversationRef.current;
    void saveAssistantConversation({ ...current, messages: limitAssistantMessages(current.messages) }).catch(()=>{});
  },[]);
  const stats=useMemo(()=>({complete:matches.length,personal:matches.filter(match=>typeof match.personalPerformance?.goals==='number'||typeof match.personalPerformance?.assists==='number').length}),[matches]);
  const isKickoff=messages.filter(message=>message.role==='user').length===0;
  const resetConversation=async()=>{
    const confirmed=window.confirm(ar?'رح تنحذف الدردشة الحالية بالكامل وتبدأ دردشة جديدة. متأكد؟':'This will clear the current conversation and start a new one. Continue?');
    if(!confirmed)return;
    requestEpochRef.current+=1;
    setBusy(false);setThinking(false);setInput('');setAiError('');
    clearTacticalAttachment();
    try{setConversation(await resetAssistantConversation(language));}
    catch{setConversation(createAssistantConversation(language));}
  };
  const enableAI=async()=>{
    if(!profileName||consentSaving)return;
    setConsentSaving(true);setAiError('');
    try{
      await setAssistantAIConsent(true);
      setAiConsent(true);
      const installationId=installationIdRef.current||getAssistantInstallationId();
      installationIdRef.current=installationId;
      try{setQuota(await getAssistantAIQuota(installationId));setAiConnectionState('ready');}
      catch(error){setQuota(null);setAiConnectionState(classifyAIError(error));}
    }catch{setAiError(ar?'تعذّر حفظ الموافقة على هذا الجهاز.':'Could not save AI consent on this device.');setAiConnectionState('error');}
    finally{setConsentSaving(false);}
  };
  const disableAI=async()=>{
    const confirmed=window.confirm(ar?'سيتم إيقاف إرسال الأسئلة والسياق المحلي إلى خدمة الذكاء الاصطناعي. ستبقى المحادثة المحفوظة على جهازك. متابعة؟':'This stops sending questions and local context to the AI service. Your saved chat remains on this device. Continue?');
    if(!confirmed)return;
    requestEpochRef.current+=1;
    await setAssistantAIConsent(false).catch(()=>{});
    clearTacticalAttachment();
    setAiConsent(false);setBusy(false);setThinking(false);setQuota(null);setAiError('');setAiConnectionState('consent-required');
  };
  const latestUser=messages.slice().reverse().find(message=>message.role==='user');
  const lastAssistant=messages.slice().reverse().find(message=>message.role==='assistant');
  const suggestions=useMemo(()=>isKickoff?starters.map(item=>({...item,text:ar?item.text:({review:'Review my match performance',defending:'How can I improve my defensive positioning?',tactics:'Suggest a practical 5-a-side plan',record:'How many matches have I recorded and what was the latest?'}[item.id]||item.text)})):suggestionsFor(latestUser?.text||'',lastAssistant?.context,ar),[isKickoff,latestUser?.text,lastAssistant?.context,ar]);
  const ask=async(question:string)=>{
    const cleaned=question.trim();
    if(!cleaned||busy)return;
    if(!canWrite||!aiConsent||!profileName){setAiError(ar?'أنشئ ملف TAAMEN محليًا ووافق على استخدام المساعد أولًا.':'Create a local TAAMEN profile and accept AI use first.');return;}
    const installationId=installationIdRef.current;
    if(!installationId){setAiError(ar?'تعذّر تحديد هذا التثبيت. أعد تحميل الصفحة.':'Could not identify this installation. Reload the page.');return;}
    const attachedTacticalPlan = pendingTacticalPlan ? readTacticalPlanAIHandoff() : null;
    if(pendingTacticalPlan&&!attachedTacticalPlan){
      clearTacticalAttachment(true);
      setAiError(ar?'انتهت صلاحية مرفق الخطة أو لم يعد متاحًا. أرفق الخطة من الملعب مرة أخرى.':'The tactical attachment expired or is no longer available. Attach the plan again from the board.');
      return;
    }
    const epoch=requestEpochRef.current;
    const userMessage:Message={id:`u-${Date.now()}`,role:'user',text:cleaned};
    const previous=currentConversationRef.current;
    const nextConversation={...previous,title:previous.messages.some(message=>message.role==='user')?previous.title:titleForAssistantQuestion(cleaned,language),messages:limitAssistantMessages([...previous.messages,userMessage]),updatedAt:Date.now()};
    currentConversationRef.current=nextConversation;setConversation(nextConversation);
    setInput('');setBusy(true);setThinking(true);setAiError('');setAiConnectionState('checking');
    const context=computeReply(cleaned,matches,language).context;
    try{
      const response=await askAssistantAI({
        installationId,
        profileName,
        language:selectedLocale,
        messages:nextConversation.messages.filter(message=>message.id!=='welcome').slice(-6).map(message=>({role:message.role,content:message.text.slice(-600)})),
        context:{...buildAssistantAIContext(matches),...(attachedTacticalPlan?{tacticalPlan:attachedTacticalPlan}:{})},
      });
      if(epoch!==requestEpochRef.current)return;
      const assistantMessage:Message={id:`a-${Date.now()}`,role:'assistant',text:response.answer,context};
      setConversation(current=>({...current,messages:limitAssistantMessages([...current.messages,assistantMessage]),updatedAt:Date.now()}));
      setQuota(response.quota);
      setAiConnectionState('connected');
    }catch(error){
      if(epoch!==requestEpochRef.current)return;
      const message=error instanceof AssistantAIError?error.message:(ar?'حدث خطأ غير متوقع أثناء إنشاء الإجابة.':'An unexpected error occurred while generating the answer.');
      setAiError(message);
      setAiConnectionState(classifyAIError(error));
      if(error instanceof AssistantAIError&&error.quota)setQuota(error.quota);
    }finally{
      if(epoch===requestEpochRef.current){setThinking(false);setBusy(false);}
    }
  };
  const removeTacticalAttachment=()=>clearTacticalAttachment();
  const aiStatusLabel = ({checking:{ar:'جارٍ فحص الاتصال…',en:'Checking connection…',es:'Comprobando conexión…',fr:'Vérification de la connexion…',de:'Verbindung wird geprüft…',pt:'A verificar a ligação…',tr:'Bağlantı denetleniyor…'},'consent-required':{ar:'بانتظار موافقتك',en:'Consent required',es:'Se requiere consentimiento',fr:'Consentement requis',de:'Zustimmung erforderlich',pt:'Consentimento necessário',tr:'Onay gerekiyor'},'local-profile-required':{ar:'يتطلب ملفًا محليًا',en:'Local profile required',es:'Se requiere un perfil local',fr:'Profil local requis',de:'Lokales Profil erforderlich',pt:'Perfil local necessário',tr:'Yerel profil gerekli'},ready:{ar:'الخدمة جاهزة للاختبار',en:'Service ready to test',es:'Servicio listo para probar',fr:'Service prêt à tester',de:'Dienst zum Testen bereit',pt:'Serviço pronto para testar',tr:'Hizmet test edilmeye hazır'},connected:{ar:'تم الاتصال فعليًا',en:'Connected',es:'Conectado',fr:'Connecté',de:'Verbunden',pt:'Ligado',tr:'Bağlandı'},error:{ar:'خطأ في الاتصال',en:'Connection error',es:'Error de conexión',fr:'Erreur de connexion',de:'Verbindungsfehler',pt:'Erro de ligação',tr:'Bağlantı hatası'},unavailable:{ar:'الخدمة غير متاحة',en:'Service unavailable',es:'Servicio no disponible',fr:'Service indisponible',de:'Dienst nicht verfügbar',pt:'Serviço indisponível',tr:'Hizmet kullanılamıyor'},timeout:{ar:'انتهت مهلة الاتصال',en:'Connection timed out',es:'Tiempo de conexión agotado',fr:'Délai de connexion dépassé',de:'Zeitüberschreitung',pt:'Tempo de ligação esgotado',tr:'Bağlantı zaman aşımına uğradı'}} as const)[aiConnectionState][selectedLocale];
  const submit=(event:FormEvent)=>{event.preventDefault();ask(input)};
  const goContext=(context:Context|undefined)=>{
    if(context==='analytics'){go('analytics');return;}
    try{localStorage.setItem('taamen-play-center-tab',context==='tactical'?'tactical':'matches')}catch{}
    go('play');
  };
  const renderSuggestion=(suggestion:Suggestion, className='assistant-starter')=>{
    const Icon=suggestion.icon;
    return <button type="button" key={suggestion.id} className={className} onClick={()=>suggestion.id==='board'?goContext('tactical'):ask(suggestion.text)} disabled={busy}><Icon size={16}/><span>{suggestion.text}</span></button>;
  };
  return <section className="page-content assistant-page" lang={selectedLocale} dir={selectedLocale==='ar'?'rtl':'ltr'}>
    <div className="assistant-workspace">
      <aside className="assistant-side-panel"><div className="assistant-brandmark"><span><Bot size={25}/></span><div><strong>TAAMEN AI <small className="assistant-beta-badge">BETA</small></strong><small>{ar?'مساعدك الكروي الذكي':'Your football companion'}</small></div></div>
        <div className="assistant-thread-control"><div><strong>{ar?'الدردشة الحالية':'Current conversation'}</strong><small>{ar?`باقي ${quota?.remaining??'—'} من ${quota?.limit??10} أسئلة اليوم`:`${quota?.remaining??'—'} of ${quota?.limit??10} questions left today`}</small></div><button type="button" className="assistant-reset-chat" onClick={()=>void resetConversation()} title={ar?'إعادة تعيين الدردشة':'Reset conversation'} aria-label={ar?'حذف الدردشة والبدء من جديد':'Clear chat and start over'}><RotateCcw size={14}/></button></div>
        <div className="assistant-local-stats"><div><span>{ar?'المباريات المكتملة':'Completed matches'}</span><b>{stats.complete}</b></div><div><span>{ar?'مباريات ببيانات شخصية':'With personal stats'}</span><b>{stats.personal}</b></div></div><p className="assistant-side-caption">{isKickoff?(ar?'كيف تحب تبدأ؟':'How would you like to start?'):(ar?'اقتراحات مرتبطة بمحادثتك':'Suggestions based on this conversation')}</p>{suggestions.map(item=>renderSuggestion(item))}<button type="button" className="assistant-see-analytics" onClick={()=>go('analytics')}><ChartNoAxesCombined size={15}/>{ar?'عرض تحليلاتي':'Open My Analytics'}</button><p className="assistant-side-privacy"><ShieldCheck size={14}/>{ar?'تبقى المحادثة على جهازك. عند إرسال سؤال، يُرسل نصه وملخص محدود من مبارياتك. لا تُرسل الخطة التكتيكية إلا بعد اختيار تحليلها من الملعب وتأكيدك، وتبقى مرفقة حتى تزيلها أو تنتهي صلاحيتها. لا نرسل البريد أو الهاتف أو الصور.':'Chat history stays on this device. A question sends its text and a limited match summary. A tactical plan is attached only after you choose Analyze with TAAMEN AI and confirm; it remains attached until you remove it or it expires. Email, phone, and photos are not sent.'}</p>{aiConsent&&<button type="button" className="assistant-ai-revoke" onClick={()=>void disableAI()}>{ar?'إيقاف TAAMEN AI':'Turn off TAAMEN AI'}</button>}</aside>
      <section className={`assistant-chat-panel${isKickoff?' is-kickoff':''}`} data-tour="assistant" aria-label={ar?'محادثة المساعد':'Assistant conversation'}><header className="assistant-chat-header"><span className="assistant-chat-avatar"><Sparkles size={18}/></span><div><strong>TAAMEN AI <small className="assistant-beta-badge">BETA</small></strong><small>{conversation.title} · {ar?`GPT-OSS-120B · ${quota?`باقي ${quota.remaining} أسئلة اليوم`:'رصيد الاستخدام غير متاح'}`:`GPT-OSS-120B · ${quota?`${quota.remaining} questions remaining today`:'Usage balance unavailable'}`}</small><span className={`assistant-connection-state is-${aiConnectionState}`} role="status" aria-live="polite">{aiStatusLabel}</span></div><button type="button" className="assistant-reset-chat assistant-reset-chat-mobile" onClick={()=>void resetConversation()} aria-label={ar?'إعادة تعيين الدردشة':'Reset conversation'}><RotateCcw size={14}/></button></header>
        {pendingTacticalPlan&&<div className="assistant-tactical-attachment" role="status"><Sparkles size={17}/><div className="assistant-tactical-attachment-copy"><strong>{ar?'خطة تكتيكية مرفقة':'Tactical plan attached'} · {pendingTacticalPlan.title}</strong><span>{pendingTacticalPlan.gameFormat} · {ar?'تشكيلة':'Formation'} {pendingTacticalPlan.formation} · {pendingTacticalPlan.players.length} {ar?'لاعباً':'players'} · {pendingTacticalPlan.drawingSummary.total} {ar?'رسماً':'drawings'}. {ar?`أُرسل ${pendingTacticalPlan.drawingSummary.included} من ${pendingTacticalPlan.drawingSummary.total} رسماً؛ اختُصر ${pendingTacticalPlan.drawingSummary.sampled} مسارات واستُبعد ${pendingTacticalPlan.drawingSummary.omitted}. يمكنك إزالة المرفق بأي وقت.`:`${pendingTacticalPlan.drawingSummary.included} of ${pendingTacticalPlan.drawingSummary.total} drawings attached; ${pendingTacticalPlan.drawingSummary.sampled} routes sampled and ${pendingTacticalPlan.drawingSummary.omitted} drawings omitted. Remove it at any time.`}</span></div><button type="button" onClick={removeTacticalAttachment} disabled={busy}>{ar?'إزالة':'Remove'}</button></div>}
        <div className="assistant-messages" ref={listRef} aria-live="polite">
          {canWrite&&!aiConsentReady&&<div className="assistant-ai-loading">{ar?'جارٍ تجهيز ملفك وحصة الاستخدام…':'Preparing your profile and usage quota…'}</div>}{canWrite&&aiConsentReady&&!aiConsent&&<div className="assistant-ai-consent"><span><Sparkles size={24}/></span><h2>{ar?'تفعيل TAAMEN AI':'Enable TAAMEN AI'}</h2><p>{ar?`أهلًا ${profileName||'بك'}. سيعالج المساعد أسئلتك عبر Cloudflare Workers AI. عند الإرسال، نرسل الاسم المسجل، ونص السؤال، وآخر رسائل المحادثة، ومجاميع إحصائية وتفاصيل ما يصل إلى ثماني مباريات مكتملة حديثة، بما فيها النتائج والمساهمات والتقييمات الذاتية المتوفرة.${pendingTacticalPlan?' كما ستُرسل بيانات الخطة التكتيكية التي اخترت إرفاقها مع أسئلتك ما دام المرفق موجودًا في المحادثة: اسم الخطة وملاحظاتها وصيغة الملعب والتشكيلة واللاعبون ومواقعهم والرسومات والمسارات والمناطق. نرسل حتى 18 رسماً، وقد نختصر المسارات الطويلة إلى 8 نقاط ممثلة أو نستبعد رسومات إضافية للحفاظ على حد حجم السياق. لا تُرسل صورة الملعب أو ملف JSON الخام. يمكنك إزالة المرفق في أي وقت.':''} لا نرسل البريد الإلكتروني أو الهاتف أو الصور. تبقى المحادثة محفوظة محليًا، ويمكنك إيقاف الخدمة لاحقًا.`:`Hi ${profileName||'there'}. TAAMEN AI uses Cloudflare Workers AI. When you send a question, it receives your profile name, the question, recent chat messages, aggregate totals and details from up to eight recent completed matches, including recorded contributions and available self-ratings.${pendingTacticalPlan?' The tactical plan you chose to attach will accompany your questions while it remains attached: plan title and notes, pitch format, formation, players and positions, drawings, routes, and zones. Up to 18 drawings are included; long routes may be sampled to eight representative points and additional drawings may be omitted to stay within the context limit. No pitch screenshot or raw JSON file is sent. You can remove it at any time.':''} Email, phone, and photos are not sent. The chat stays saved locally, and you can turn AI off later.`}</p><p className="assistant-ai-consent-note">{ar?'المعرّف محلي لهذا المتصفح وليس حسابًا موثّقًا؛ يمكن إعادة إنشاء الحصة عند مسح بيانات الموقع. الحد 10 أسئلة يوميًا لكل متصفح، مع سقف مشترك 18 طلبًا يوميًا للموقع كله.':'The installation ID is local to this browser, not a verified account. Clearing site data can create a new quota identity. The limit is 10 questions per installation per day, plus a shared cap of 18 requests per day for the whole site.'}</p><button type="button" onClick={()=>void enableAI()} disabled={consentSaving||!profileName}>{consentSaving?(ar?'جارٍ الحفظ…':'Saving…'):(ar?'أوافق وأفعّل المساعد':'Agree and enable assistant')}</button></div>}{!canWrite&&<div className="assistant-ai-consent"><span><LockKeyhole size={24}/></span><h2>{ar?'أنشئ ملفك المحلي أولًا':'Create your local profile first'}</h2><p>{ar?'استخدام TAAMEN AI متاح بعد إنشاء ملف محلي في الموقع. لا تحتاج إلى حساب سحابي.':'TAAMEN AI is available after you create a local profile. No cloud account is required.'}</p></div>}{isKickoff&&canWrite&&aiConsent&&<div className="assistant-mobile-kickoff"><span className="assistant-kickoff-mark"><Sparkles size={24}/></span><h1>{ar?'كيف تحب تبدأ؟':'How would you like to start?'}</h1><p>{ar?'اختر سؤالًا من الاقتراحات أو اكتب سؤالك عن مبارياتك وأدائك وتكتيك فريقك.':'Choose a prompt or ask about your matches, performance, or team tactics.'}</p><div className="assistant-kickoff-suggestions">{suggestions.map(item=>renderSuggestion(item,'assistant-kickoff-option'))}</div><small>{ar?'لإجابة أدق، اذكر اسم المباراة أو تاريخها أو الإحصائية التي تقصدها.':'For a more precise answer, include the match name, date, or statistic you mean.'}</small></div>}
          {!isKickoff&&messages.filter(message=>message.role==='user'||message.id!=='welcome').map(message=><article key={message.id} className={`assistant-message ${message.role==='user'?'is-user':'is-assistant'}`}><span className="assistant-message-avatar">{message.role==='user'?<UserRound size={15}/>:<Bot size={16}/>}</span><div className="assistant-message-body">{message.role==='assistant'?<div className="assistant-rich-text">{renderAssistantText(message.text)}</div>:<p>{message.text}</p>}{message.context&&message.role==='assistant'&&message.text.length>0&&<button type="button" className="assistant-context-link" onClick={()=>goContext(message.context)}>{message.context==='analytics'?(ar?'افتح تحليلاتي':'Open analytics'):message.context==='tactical'?(ar?'افتح الملعب التكتيكي':'Open tactical board'):(ar?'انتقل إلى المباريات والسجل':'Open matches and history')}<ArrowUp size={13}/></button>}</div></article>)}
          {thinking&&<div className="assistant-typing"><span/><span/><span/>{ar?'يحلل سؤالك وبياناتك…':'Analyzing your question and selected data…'}</div>}{aiError&&<div className="assistant-ai-error" role="alert">{aiError}</div>}
          {!isKickoff&&!busy&&<div className="assistant-mobile-suggestions"><small>{ar?'قد يفيدك أيضًا':'You might also ask'}</small><div>{suggestions.slice(0,3).map(item=>renderSuggestion(item,'assistant-mobile-suggestion'))}</div></div>}
          <div ref={messagesEndRef}/>
        </div>
        <div className="assistant-bottom"><div className="assistant-bottom-hint"><CircleHelp size={14}/>{!canWrite?(ar?'أنشئ ملفًا محليًا ليقرأ المساعد بيانات مبارياتك الشخصية.':'Create a local profile before the assistant can use your personal match data.'):(ar?`يا ${profileName}، يعتمد التحليل على المباريات والإحصائيات التي سجلتها، وقد لا تتوفر كل المؤشرات في كل مباراة.`:`${profileName}, analysis uses the matches and statistics you recorded; some metrics may be missing for individual matches.`)}</div><form className="assistant-composer" onSubmit={submit}><textarea value={input} onChange={event=>setInput(event.target.value)} rows={2} maxLength={1200} disabled={!canWrite||!aiConsent||busy} placeholder={pendingTacticalPlan?(ar?'اكتب سؤالك عن الخطة المرفقة…':'Ask a question about the attached plan…'):(ar?'اسأل عن مباراة، تاريخ، إحصائية أو خطة…':'Ask about a match, date, stat, or tactic…')} aria-label={ar?'اكتب سؤالًا':'Write a question'} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();ask(input)}}}/><button type="submit" disabled={!input.trim()||busy||!canWrite||!aiConsent} aria-label={ar?'إرسال السؤال':'Send question'}><ArrowUp size={18}/></button></form><small>{ar?'Enter للإرسال · Shift + Enter لسطر جديد':'Enter to send · Shift + Enter for a new line'}</small></div>
      </section>
    </div>
  </section>;
}
