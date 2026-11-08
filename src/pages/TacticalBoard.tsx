import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ChangeEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, CircleHelp, ImageDown, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Redo2, RotateCcw, Save, Sparkles, Undo2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { getItem, putItem } from '../services/localDb';
import TacticalPlanLibraryPanel from '../components/tactical/TacticalPlanLibraryPanel';
import type { TacticalPlanLibraryRepository } from '../services/tacticalPlanLibraryRepository';
import { writeTacticalPlanAIHandoff } from '../services/tacticalPlanAIContext';
import { createTacticalCurveControlPoint } from '../domain/tactics/geometry';
import type { RouteId } from '../config/routes';
import type { Language } from '../i18n/translations';
import '../styles/tactical-v3.css';
import { prefersReducedMotion } from '../motion/prefersReduced';
import {
  isTacticalPlanDocument, MAX_TACTICAL_PLAN_JSON_BYTES, parseTacticalPlan, parseTacticalPlanJson, restoreTacticalPlan, serializeTacticalPlan,
  TacticalPlanValidationError, type TacticalBoardDrawingState, type TacticalBoardPlayerState, type TacticalPlanDocument,
} from '../domain/tactics/tacticalPlanSchema';

type BoardTool = 'select' | 'pass' | 'run' | 'press' | 'curve' | 'multiCurve' | 'zone';
type BoardFormat = '5v5' | '7v7';
type BoardPlayer = TacticalBoardPlayerState;
type BoardPoint = { x: number; y: number };
type BoardObject = TacticalBoardDrawingState;
type Snapshot = { players: BoardPlayer[]; objects: BoardObject[] };
type PlanOverrides = { format?: BoardFormat; formation?: string; title?: string; notes?: string; createdAt?: string };
type LegacyStoredPlan = { formationId?: string; players?: Array<{ id?: unknown; team?: unknown; x?: unknown; y?: unknown; name?: unknown }>; landscape?: boolean };
const LEGACY_STORE_ID = 'plan-v3';
const planStoreId = (format: BoardFormat) => `plan-v3-${format}`;
const recoveryStoreId = (sourceId: string) => `tactical-plan-recovery-v1:${sourceId}`;
const isRecoveryBlocked = (error: unknown) => error instanceof Error && error.message === 'tactical-plan-recovery-required';

async function preserveInvalidStoredPlan(sourceId: string, format: BoardFormat, payload: unknown) {
  const id = recoveryStoreId(sourceId);
  const existing = await getItem<unknown>('metadata', id);
  if (existing) return;
  await putItem('metadata', {
    id,
    type: 'tactical-plan-recovery',
    sourceStore: 'tactical',
    sourceId,
    gameFormat: format,
    preservedAt: new Date().toISOString(),
    payload,
  });
}
const defaultFormation = (format: BoardFormat) => format === '7v7' ? '2-3-1' : '1-2-1';
const tools: { id: BoardTool; ar: string; en: string; symbol: string }[] = [
  { id: 'select', ar: 'تحديد وسحب', en: 'Select & move', symbol: '↖' },
  { id: 'pass', ar: 'تمريرة', en: 'Pass', symbol: '→' },
  { id: 'run', ar: 'تحرك لاعب', en: 'Player run', symbol: '⇢' },
  { id: 'press', ar: 'ضغط', en: 'Press', symbol: '···' },
  { id: 'curve', ar: 'مسار منحني', en: 'Curved path', symbol: '⌁' },
  { id: 'multiCurve', ar: 'مسار متعدد الانحناءات', en: 'Multi-curve route', symbol: '〰' },
  { id: 'zone', ar: 'منطقة', en: 'Zone', symbol: '▱' },
];
const fieldWidth = 900;
const fieldHeight = 540;

function layoutFor(format: BoardFormat, formation: string): Array<[number,number]> {
  if (format === '7v7') {
    const layouts: Record<string, Array<[number,number]>> = {
      '2-3-1': [[65,270],[230,155],[230,385],[390,100],[390,270],[390,440],[555,270]],
      '3-2-1': [[65,270],[225,120],[225,270],[225,420],[440,190],[440,350],[575,270]],
      '2-2-2': [[65,270],[230,170],[230,370],[400,170],[400,370],[570,200],[570,340]],
      '3-1-2': [[65,270],[225,120],[225,270],[225,420],[405,270],[570,205],[570,335]],
      '4-1-1': [[65,270],[215,95],[215,210],[215,330],[215,445],[410,270],[575,270]],
      '2-1-3': [[65,270],[230,165],[230,375],[395,270],[565,120],[565,270],[565,420]],
    };
    return layouts[formation] || layouts['2-3-1'];
  }
  const layouts: Record<string, Array<[number,number]>> = {
    '1-2-1': [[65,270],[230,270],[390,175],[390,365],[540,270]],
    '1-1-2': [[65,270],[230,270],[390,270],[540,190],[540,350]],
    '2-1-1': [[65,270],[230,180],[230,360],[400,270],[550,270]],
    '3-1': [[65,270],[220,115],[220,270],[220,425],[550,270]],
    '2-2': [[65,270],[235,180],[235,360],[470,180],[470,360]],
  };
  return layouts[formation] || layouts['1-2-1'];
}
function makePlayers(format: BoardFormat, formation: string): BoardPlayer[] {
  const layout = layoutFor(format, formation);
  return (['home','away'] as const).flatMap(team => layout.map(([x,y], index) => ({
    id: `${team}-${index+1}`, team, number: index+1, name: team === 'home' ? `لاعب ${index+1}` : `خصم ${index+1}`,
    // Player positions are persisted as percentages; drawing objects use SVG units.
    x: (team === 'home' ? x : fieldWidth - x) * 100 / fieldWidth,
    y: y * 100 / fieldHeight,
  })));
}
function smoothPath(points: BoardPoint[]) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i=0;i<points.length-1;i++) {
    const p0=points[Math.max(0,i-1)], p1=points[i], p2=points[i+1], p3=points[Math.min(points.length-1,i+2)];
    const c1x=p1.x+(p2.x-p0.x)/6, c1y=p1.y+(p2.y-p0.y)/6;
    const c2x=p2.x-(p3.x-p1.x)/6, c2y=p2.y-(p3.y-p1.y)/6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
function curveControl(start: BoardPoint, end: BoardPoint): BoardPoint {
  return createTacticalCurveControlPoint(start, end, fieldWidth, fieldHeight);
}
function oneWayCurve(start: BoardPoint, end: BoardPoint) {
  const control = curveControl(start, end);
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}
function smoothSamples(points: BoardPoint[]): BoardPoint[] {
  const reduced = points.filter((point, index) => index === 0 || index === points.length - 1 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) >= 7);
  if (reduced.length <= 2) return reduced;
  const softened = reduced.map((point, index) => {
    if (index === 0 || index === reduced.length - 1) return point;
    const before = reduced[index - 1], after = reduced[index + 1];
    return { x: before.x * 0.2 + point.x * 0.6 + after.x * 0.2, y: before.y * 0.2 + point.y * 0.6 + after.y * 0.2 };
  });
  return [reduced[0], ...softened.slice(1, -1), reduced[reduced.length - 1]];
}



export default function TacticalBoard({ language, canWrite = true, onRequireLocalLogin, cloudAccountReady = false, libraryRepository, go }: { language: Language; canWrite?: boolean; onRequireLocalLogin?: (action?: string) => void; cloudAccountReady?: boolean; libraryRepository?: TacticalPlanLibraryRepository; go: (page: RouteId) => void }) {
  const ar = language === 'ar';
  const [format, setFormat] = useState<BoardFormat>('5v5');
  const [formation, setFormation] = useState('1-2-1');
  const [players, setPlayers] = useState<BoardPlayer[]>(() => makePlayers('5v5','1-2-1'));
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [tool, setTool] = useState<BoardTool>('select');
  const [selectedPlayer, setSelectedPlayer] = useState<string|null>(null);
  const [playerEditField, setPlayerEditField] = useState<'name'|'number'|null>(null);
  const [playerNameDraft, setPlayerNameDraft] = useState('');
  const [playerNumberDraft, setPlayerNumberDraft] = useState('');
  const [title, setTitle] = useState(ar ? 'ضغط عالٍ — بداية اللعب' : 'High press — kick-off');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [showAIHandoffConfirmation, setShowAIHandoffConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [formationOpen, setFormationOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [focusSidebarOpen, setFocusSidebarOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 900px)').matches);
  const rootRef = useRef<HTMLElement>(null);
  const nativeFullscreenRef = useRef(false);
  const [draftPoints, setDraftPoints] = useState<BoardPoint[]>([]);
  const [ready, setReady] = useState(false);
  const [animatedObjectId, setAnimatedObjectId] = useState<string | null>(null);
  const revealTimer = useRef<number | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const formationPanelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number; before: Snapshot; moved: boolean }|null>(null);
  const drawRef = useRef<{ pointerId: number; kind: Exclude<BoardTool,'select'>; start: BoardPoint; points: BoardPoint[] }|null>(null);
  const playersRef = useRef(players);
  const objectsRef = useRef(objects);
  const createdAtRef = useRef<Record<BoardFormat, string>>({ '5v5': new Date().toISOString(), '7v7': new Date().toISOString() });
  const protectedFormatsRef = useRef<Set<BoardFormat>>(new Set());
  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  playersRef.current = players;
  objectsRef.current = objects;

  useEffect(() => {
    let active = true;
    setReady(false);
    if (!canWrite) { setReady(true); return () => { active = false; }; }
    const applyPlan = (rawPlan: unknown) => {
      try {
        const plan = restoreTacticalPlan(rawPlan);
        const nextFormat = plan.gameFormat;
        setFormat(nextFormat);
        setFormation(plan.formation);
        setPlayers(plan.players);
        setObjects(plan.drawings);
        setTitle(plan.title || (ar ? 'خطتي التكتيكية' : 'My tactical plan'));
        setNotes(plan.notes);
        createdAtRef.current[nextFormat] = plan.createdAt;
        playersRef.current = plan.players;
        objectsRef.current = plan.drawings;
        return true;
      } catch {
        return false;
      }
    };
    const loadStoredPlan = async (id: string, expectedFormat: BoardFormat): Promise<TacticalPlanDocument | null> => {
      const raw = await getItem<unknown>('tactical', id);
      if (!raw) return null;
      try {
        const parsed = parseTacticalPlan(raw);
        if (parsed.metadata.gameFormat !== expectedFormat) {
          await preserveInvalidStoredPlan(id, parsed.metadata.gameFormat, raw);
          return null;
        }
        const canonical: TacticalPlanDocument = { ...parsed, id };
        createdAtRef.current[expectedFormat] = parsed.metadata.createdAt;
        if (!isTacticalPlanDocument(raw) || parsed.id !== id) await putItem('tactical', canonical);
        return canonical;
      } catch {
        // Preserve an unreadable record outside the active plan key before a fresh draft can autosave.
        try {
          await preserveInvalidStoredPlan(id, expectedFormat, raw);
          protectedFormatsRef.current.delete(expectedFormat);
          setStatus(ar ? 'تم الاحتفاظ بنسخة استرداد من خطة قديمة غير قابلة للقراءة.' : 'A recovery copy of an unreadable older plan was preserved.');
        } catch {
          // If recovery cannot be written (for example, storage is full), block writes to this format.
          protectedFormatsRef.current.add(expectedFormat);
          setStatus(ar ? 'تعذرت قراءة الخطة القديمة والاحتفاظ بنسخة استرداد. لن نكتب فوق بياناتها.' : 'The older plan could not be read or backed up. Its format is protected from overwrites.');
        }
        return null;
      }
    };
    const loadPlan = async () => {
      let currentFive = await loadStoredPlan(planStoreId('5v5'), '5v5');
      let currentSeven = await loadStoredPlan(planStoreId('7v7'), '7v7');
      if (!active) return;

      // Migrate the former shared V13 record into the matching format key.
      // Existing per-format data always wins, and the original key is retained.
      const legacyV3 = await getItem<unknown>('tactical', LEGACY_STORE_ID);
      if (!active) return;
      if (legacyV3) {
        try {
          const parsed = parseTacticalPlan(legacyV3);
          const formatToMigrate = parsed.metadata.gameFormat;
          const targetExists = formatToMigrate === '7v7' ? Boolean(currentSeven) : Boolean(currentFive);
          if (!targetExists && !protectedFormatsRef.current.has(formatToMigrate)) {
            const migrated: TacticalPlanDocument = { ...parsed, id: planStoreId(formatToMigrate) };
            await putItem('tactical', migrated);
            if (formatToMigrate === '7v7') currentSeven = migrated;
            else currentFive = migrated;
          }
        } catch {
          // Legacy record is retained untouched if it cannot be safely converted.
        }
      }
      const preferred = currentFive || currentSeven;
      if (preferred && applyPlan(preferred)) return;

      // One-time migration from the earliest local board. It was a 5v5 board.
      const legacy = await getItem<LegacyStoredPlan>('tactical', 'plan');
      if (!active) return;
      if (legacy && Array.isArray(legacy.players) && !protectedFormatsRef.current.has('5v5')) {
        const isLegacyPlayer = (player: NonNullable<LegacyStoredPlan['players']>[number]) =>
          (player.team === 'home' || player.team === 'away') &&
          typeof player.x === 'number' && Number.isFinite(player.x) && player.x >= 0 && player.x <= 100 &&
          typeof player.y === 'number' && Number.isFinite(player.y) && player.y >= 0 && player.y <= 100;
        const home = legacy.players.filter(isLegacyPlayer).filter(player => player.team === 'home').slice(0, 5);
        const away = legacy.players.filter(isLegacyPlayer).filter(player => player.team === 'away').slice(0, 5);
        if (home.length === 5 && away.length === 5) {
          const migratedPlayers: BoardPlayer[] = [
            ...home.map((player, index) => ({ id: `home-${index + 1}`, team: 'home' as const, number: index + 1, name: typeof player.name === 'string' && player.name.trim() ? player.name.trim().slice(0,28) : (ar ? `لاعب ${index+1}` : `Player ${index+1}`), x: player.x as number, y: player.y as number })),
            ...away.map((player, index) => ({ id: `away-${index + 1}`, team: 'away' as const, number: index + 1, name: typeof player.name === 'string' && player.name.trim() ? player.name.trim().slice(0,28) : (ar ? `خصم ${index+1}` : `Opponent ${index+1}`), x: player.x as number, y: player.y as number })),
          ];
          const nextFormation = legacy.formationId === 'square' ? '2-2' : (legacy.formationId === 'pyramid' || legacy.formationId === 'counter') ? '2-1-1' : '1-2-1';
          const now = new Date().toISOString();
          const migrated = serializeTacticalPlan({
            id: planStoreId('5v5'), gameFormat: '5v5', formation: nextFormation,
            title: ar ? 'خطة مستوردة من الملعب السابق' : 'Plan migrated from the previous board',
            notes: ar ? 'تم الحفاظ على مواضع اللاعبين من الخطة المحلية السابقة.' : 'Player positions were carried over from the previous local plan.',
            players: migratedPlayers, drawings: [], createdAt: now, updatedAt: now,
          });
          setFormat('5v5'); setFormation(nextFormation); setPlayers(migratedPlayers); setObjects([]); setTitle(migrated.metadata.title); setNotes(migrated.metadata.notes);
          createdAtRef.current['5v5'] = migrated.metadata.createdAt;
          playersRef.current = migratedPlayers; objectsRef.current = [];
          await putItem('tactical', migrated);
          return;
        }
      }

      const initialFormat: BoardFormat = currentSeven && !currentFive ? '7v7' : '5v5';
      const initialFormation = defaultFormation(initialFormat);
      const initialPlayers = makePlayers(initialFormat, initialFormation);
      setFormat(initialFormat);
      setFormation(initialFormation);
      setPlayers(initialPlayers);
      setObjects([]);
      setTitle(ar ? 'خطة تكتيكية جديدة' : 'New tactical plan');
      setNotes('');
      playersRef.current = initialPlayers;
      objectsRef.current = [];
    };
    loadPlan().catch(() => undefined).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [canWrite]); // Read private saved plans only after local setup.

  const requireWrite = (action = ar ? 'الملعب التكتيكي' : 'the tactical board') => { if (canWrite) return true; onRequireLocalLogin?.(action); return false; };
  const snapshot = useCallback(() => ({ players: structuredClone(playersRef.current), objects: structuredClone(objectsRef.current) }), []);
  const remember = useCallback(() => {
    undoRef.current = [...undoRef.current.slice(-39), snapshot()];
    redoRef.current = [];
    setHistoryVersion(value => value + 1);
  }, [snapshot]);
  const persist = useCallback(async (nextPlayers = playersRef.current, nextObjects = objectsRef.current, extra?: PlanOverrides) => {
    if (!canWrite) throw new Error('local-profile-required');
    const targetFormat = extra?.format || format;
    if (protectedFormatsRef.current.has(targetFormat)) throw new Error('tactical-plan-recovery-required');
    const now = new Date();
    const record = serializeTacticalPlan({
      id: planStoreId(targetFormat),
      gameFormat: targetFormat,
      formation: extra?.formation || formation,
      title: (extra?.title ?? title).trim() || (ar ? 'خطة بدون اسم' : 'Untitled plan'),
      notes: extra?.notes ?? notes,
      createdAt: extra?.createdAt || createdAtRef.current[targetFormat] || now.toISOString(),
      updatedAt: now.toISOString(),
      players: nextPlayers,
      drawings: nextObjects,
    }, now);
    createdAtRef.current[targetFormat] = record.metadata.createdAt;
    await putItem('tactical', record);
  }, [title, format, formation, notes, ar, canWrite]);

  // Debounced local autosave covers title, notes and any state updates that do
  // not originate from a pointer-up handler. Each format has its own key.
  useEffect(() => {
    if (!canWrite || !ready) return;
    const timer = window.setTimeout(() => {
      void persist(players, objects).catch(error => setStatus(isRecoveryBlocked(error)
        ? (ar ? 'لم نكتب فوق المخطط القديم لأن نسخة الاسترداد لم تُحفظ. حرّر مساحة التخزين ثم أعد فتح الملعب.' : 'The older plan was protected because its recovery copy could not be saved. Free storage, then reopen the board.')
        : (ar ? 'تعذر حفظ التغييرات تلقائيًا' : 'Automatic save failed')));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [canWrite, ready, format, formation, title, notes, players, objects, persist, ar]);

  const openFormationGuide = () => {
    setFormationOpen(true);
    window.requestAnimationFrame(() => formationPanelRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
    }));
  };

  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: Math.max(0,Math.min(fieldWidth,((event.clientX-rect.left)/rect.width)*fieldWidth)),
      y: Math.max(0,Math.min(fieldHeight,((event.clientY-rect.top)/rect.height)*fieldHeight)),
    };
  };
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!requireWrite(ar ? 'رسم أو تعديل الخطة التكتيكية' : 'draw or edit a tactical plan')) return;
    const target = event.target as Element;
    const token = target.closest('[data-board-player]') as SVGGElement|null;
    const point = pointFromEvent(event);
    if (tool === 'select' && token) {
      const id = token.dataset.boardPlayer;
      if (!id) return;
      remember();
      setSelectedPlayer(id);
      dragRef.current = { id, pointerId: event.pointerId, before: snapshot(), moved: false };
      dragRef.current.before = { players: structuredClone(playersRef.current), objects: structuredClone(objectsRef.current) };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (tool === 'select') {
      // Preserve blur commits in the selected-player editor before it collapses.
      window.setTimeout(() => setSelectedPlayer(null), 0);
      return;
    }
    const points = tool === 'multiCurve' ? [point] : [];
    drawRef.current = { pointerId: event.pointerId, kind: tool as Exclude<BoardTool,'select'>, start: point, points };
    setDraftPoints(tool === 'curve' ? [point] : points);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      const point = pointFromEvent(event);
      drag.moved = true;
      const nextPlayers = playersRef.current.map(player => player.id === drag.id
        ? { ...player, x: Math.max(1,Math.min(99,(point.x/fieldWidth)*100)), y: Math.max(2,Math.min(98,(point.y/fieldHeight)*100)) }
        : player);
      playersRef.current = nextPlayers;
      setPlayers(nextPlayers);
      return;
    }
    const draw = drawRef.current;
    if (!draw || draw.pointerId !== event.pointerId || !['curve','multiCurve'].includes(draw.kind)) return;
    const point = pointFromEvent(event);
    if (draw.kind === 'curve') { setDraftPoints([draw.start, point]); return; }
    const previous = draw.points[draw.points.length-1] || draw.start;
    if (Math.hypot(point.x-previous.x,point.y-previous.y) >= 8) {
      draw.points.push(point);
      if (draw.points.length > 160) draw.points = draw.points.filter((_, index) => index % 2 === 0 || index === draw.points.length - 1);
      setDraftPoints([...draw.points]);
    }
  };
  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      dragRef.current = null;
      if (drag.moved) void persist(playersRef.current, objectsRef.current).then(() => setStatus(ar ? 'تم تحديث موضع اللاعب' : 'Player position updated')).catch(() => setStatus(ar ? 'تعذر حفظ الخطة' : 'Could not save the plan'));
      return;
    }
    const draw = drawRef.current;
    if (!draw || draw.pointerId !== event.pointerId) return;
    drawRef.current = null;
    const end = pointFromEvent(event);
    const points = draw.kind === 'curve' ? [draw.start, curveControl(draw.start, end), end] : draw.kind === 'multiCurve' ? smoothSamples([...draw.points, end]) : undefined;
    setDraftPoints([]);
    if (Math.hypot(end.x-draw.start.x,end.y-draw.start.y) < 14) return;
    remember();
    const next: BoardObject = { id: `obj-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, kind: draw.kind, x1: draw.start.x, y1: draw.start.y, x2: end.x, y2: end.y, ...(points && points.length>1 ? {points} : {}) };
    const nextObjects = [...objectsRef.current, next];
    objectsRef.current = nextObjects;
    setObjects(nextObjects);
    // Draw-on reveal runs only for the newly created route, not on every render/load.
    setAnimatedObjectId(next.id);
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => setAnimatedObjectId(null), 900);
    void persist(playersRef.current,nextObjects).then(() => setStatus(ar ? 'تمت إضافة المسار وحفظه' : 'Route added and saved')).catch(() => setStatus(ar ? 'أضيف المسار، لكن تعذر الحفظ' : 'Route added, but save failed'));
  };

  const changeFormation = (nextFormation: string) => {
    if (!requireWrite(ar ? 'تغيير التشكيلة' : 'change formation')) return;
    remember();
    setFormation(nextFormation);
    const next = makePlayers(format,nextFormation);
    playersRef.current = next;
    setPlayers(next);
    setSelectedPlayer(null);
    void persist(next,objectsRef.current,{formation:nextFormation}).then(() => setStatus(ar ? 'تم تطبيق التشكيلة وحفظها' : 'Formation applied and saved')).catch(() => setStatus(ar ? 'تعذر حفظ التشكيلة' : 'Could not save formation'));
  };
  const changeFormat = async (nextFormat: BoardFormat) => {
    if (nextFormat === format) return;
    if (!requireWrite(ar ? 'تغيير صيغة اللعب' : 'change match format')) return;
    remember();
    try {
      if (protectedFormatsRef.current.has(nextFormat)) {
        setStatus(ar ? 'هذا النمط محمي لأن نسخة استرداد الخطة القديمة لم تُحفظ.' : 'This format is protected because its older plan recovery copy could not be saved.');
        return;
      }
      if (!protectedFormatsRef.current.has(format)) {
        await persist(playersRef.current, objectsRef.current, { format, formation, title, notes });
      }
      const stored = await getItem<unknown>('tactical', planStoreId(nextFormat));
      let restored: ReturnType<typeof restoreTacticalPlan> | null = null;
      if (stored) {
        try {
          const parsed = parseTacticalPlan(stored);
          if (parsed.metadata.gameFormat === nextFormat) {
            const canonical: TacticalPlanDocument = { ...parsed, id: planStoreId(nextFormat) };
            if (!isTacticalPlanDocument(stored) || parsed.id !== canonical.id) await putItem('tactical', canonical);
            restored = restoreTacticalPlan(canonical);
          } else {
            await preserveInvalidStoredPlan(planStoreId(nextFormat), parsed.metadata.gameFormat, stored);
            protectedFormatsRef.current.delete(nextFormat);
          }
        } catch {
          try {
            await preserveInvalidStoredPlan(planStoreId(nextFormat), nextFormat, stored);
            protectedFormatsRef.current.delete(nextFormat);
          } catch {
            protectedFormatsRef.current.add(nextFormat);
            setStatus(ar ? 'تعذر الاحتفاظ بنسخة استرداد من المخطط القديم. لم يتم استبداله.' : 'Could not preserve a recovery copy of the older plan. It was not replaced.');
            return;
          }
        }
      }
      if (restored) {
        setFormat(restored.gameFormat); setFormation(restored.formation);
        setPlayers(restored.players); setObjects(restored.drawings);
        setTitle(restored.title); setNotes(restored.notes);
        createdAtRef.current[nextFormat] = restored.createdAt;
        playersRef.current = restored.players; objectsRef.current = restored.drawings;
      } else {
        const nextFormation = defaultFormation(nextFormat);
        const nextPlayers = makePlayers(nextFormat,nextFormation);
        const now = new Date().toISOString();
        setFormat(nextFormat); setFormation(nextFormation); setPlayers(nextPlayers); setObjects([]);
        setTitle(ar ? 'خطة تكتيكية جديدة' : 'New tactical plan'); setNotes('');
        createdAtRef.current[nextFormat] = now;
        playersRef.current = nextPlayers; objectsRef.current = [];
        await persist(nextPlayers,[],{format:nextFormat,formation:nextFormation,title:ar?'خطة تكتيكية جديدة':'New tactical plan',notes:'',createdAt:now});
      }
      setSelectedPlayer(null);
      setStatus(ar ? `تم فتح مخطط ${nextFormat} المحفوظ` : `Loaded the saved ${nextFormat} board`);
    } catch (error) {
      setStatus(isRecoveryBlocked(error)
        ? (ar ? 'المخطط الحالي محمي؛ لم نتمكن من حفظ نسخة استرداد آمنة.' : 'The current plan is protected because a safe recovery copy could not be saved.')
        : (ar ? 'تعذر حفظ المخطط قبل التبديل' : 'Could not save the current board before switching'));
    }
  };
  const undo = () => {
    if (!requireWrite(ar ? 'التراجع عن تعديل' : 'undo a change')) return;
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current = [...redoRef.current,snapshot()];
    playersRef.current = previous.players; objectsRef.current = previous.objects;
    setPlayers(previous.players); setObjects(previous.objects); setHistoryVersion(v=>v+1);
    void persist(previous.players,previous.objects).catch(() => undefined);
  };
  const redo = () => {
    if (!requireWrite(ar ? 'إعادة تعديل' : 'redo a change')) return;
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current = [...undoRef.current,snapshot()];
    playersRef.current = next.players; objectsRef.current = next.objects;
    setPlayers(next.players); setObjects(next.objects); setHistoryVersion(v=>v+1);
    void persist(next.players,next.objects).catch(() => undefined);
  };
  const resetBoard = () => {
    if (!requireWrite(ar ? 'إعادة ضبط الملعب' : 'reset the board')) return;
    if (!window.confirm(ar ? 'إعادة الملعب لمسودة جديدة؟ سيتم حذف الرسومات الحالية من هذه الخطة.' : 'Reset the board? This will remove the current drawings from this plan.')) return;
    remember();
    const next = makePlayers(format,format === '7v7' ? '2-3-1' : '1-2-1');
    playersRef.current = next; objectsRef.current = [];
    setPlayers(next); setObjects([]); setSelectedPlayer(null); setFormation(defaultFormation(format));
    void persist(next,[],{formation:defaultFormation(format)}).then(() => setStatus(ar ? 'تمت إعادة الملعب وحفظ الحالة' : 'Board reset and saved')).catch(() => setStatus(ar ? 'تعذر حفظ الملعب' : 'Could not save the board'));
  };
  const savePlan = async () => {
    if (!requireWrite(ar ? 'حفظ المسودة' : 'save draft')) return;
    setBusy(true); setStatus('');
    try { await persist(); setStatus(ar ? 'تم حفظ المسودة الحالية على هذا الجهاز.' : 'Current draft saved on this device.'); }
    catch (error) { setStatus(isRecoveryBlocked(error)
      ? (ar ? 'لم نكتب فوق المخطط القديم لأن نسخة الاسترداد غير متاحة. حرّر مساحة التخزين ثم أعد فتح الملعب.' : 'The older plan is protected because its recovery copy is unavailable. Free storage, then reopen the board.')
      : (ar ? 'تعذر حفظ الخطة. حرّر مساحة على الجهاز ثم أعد المحاولة.' : 'Could not save the plan. Free up some device space and try again.')); }
    finally { setBusy(false); }
  };
  const exportPlan = () => {
    if (!requireWrite(ar ? 'تصدير الخطة' : 'export the plan')) return;
    try {
      const record = serializeTacticalPlan({
        id: planStoreId(format), gameFormat: format, formation, title: title.trim() || 'TAAMEN plan', notes,
        createdAt: createdAtRef.current[format], updatedAt: new Date().toISOString(), players, drawings: objects,
      });
      const url = URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'taamen-tactical-plan-v1.json'; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url),500);
      setStatus(ar ? 'تم تصدير الخطة بصيغة TAAMEN v1' : 'Plan exported as TAAMEN schema v1');
    } catch {
      setStatus(ar ? 'تعذر تصدير الخطة: راجع بيانات الملعب أولاً.' : 'Could not export the plan: check the board data first.');
    }
  };
  const importPlan = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!requireWrite(ar ? 'استيراد خطة' : 'import a plan')) { event.target.value = ''; return; }
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_TACTICAL_PLAN_JSON_BYTES) throw new TacticalPlanValidationError('too-large');
      const document = parseTacticalPlanJson(await file.text());
      const restored = restoreTacticalPlan(document);
      const targetFormat = restored.gameFormat;
      const targetId = planStoreId(targetFormat);
      if (protectedFormatsRef.current.has(targetFormat)) throw new Error('tactical-plan-recovery-required');
      const existing = await getItem<unknown>('tactical', targetId);
      if (existing && !window.confirm(ar
        ? `توجد خطة ${targetFormat} محفوظة. استبدالها بالخطة المستوردة؟ لن يمكن التراجع عن الاستبدال.`
        : `A ${targetFormat} plan already exists. Replace it with the imported plan? This replacement cannot be undone.`,
      )) return;
      const canonical: TacticalPlanDocument = { ...document, id: targetId, metadata: { ...document.metadata, updatedAt: new Date().toISOString() } };
      // Persist first; the visible board changes only after IndexedDB confirms the write.
      await putItem('tactical', canonical);
      remember();
      setFormat(targetFormat); setTitle(restored.title); setNotes(restored.notes);
      setPlayers(restored.players); setObjects(restored.drawings);
      setFormation(restored.formation);
      createdAtRef.current[targetFormat] = restored.createdAt;
      playersRef.current = restored.players; objectsRef.current = restored.drawings;
      setSelectedPlayer(null);
      setStatus(ar ? 'تم استيراد الخطة واستعادتها بنجاح' : 'Plan imported and restored successfully');
    } catch (error) {
      const tooLarge = error instanceof TacticalPlanValidationError && error.code === 'too-large';
      setStatus(isRecoveryBlocked(error)
        ? (ar ? 'هذا النمط محمي بسبب تعذّر حفظ نسخة استرداد للمخطط السابق.' : 'This format is protected because its previous plan could not be backed up.')
        : tooLarge
          ? (ar ? 'ملف الخطة أكبر من الحد المسموح (2 ميغابايت).' : 'Plan file exceeds the 2 MB limit.')
          : (ar ? 'الملف غير صالح أو يستخدم إصداراً غير مدعوم من الخطة.' : 'Invalid file or unsupported tactical plan schema.'));
    } finally { event.target.value = ''; }
  };

  const openLibraryPlan = async (document: TacticalPlanDocument): Promise<boolean> => {
    if (!requireWrite(ar ? 'فتح خطة من المكتبة' : 'open a library plan')) return false;
    try {
      const restored = restoreTacticalPlan(document);
      if (protectedFormatsRef.current.has(restored.gameFormat)) {
        setStatus(ar ? 'هذا النمط محمي بسبب تعذّر حفظ نسخة استرداد آمنة.' : 'This format is protected because a safe recovery copy could not be saved.');
        return false;
      }
      const targetDraft = await getItem<unknown>('tactical', planStoreId(restored.gameFormat));
      const replacesExistingWork = Boolean(targetDraft) || restored.gameFormat === format;
      if (replacesExistingWork) {
        const confirmed = window.confirm(ar
          ? `فتح «${restored.title}» سيستبدل مسودة ${restored.gameFormat} الحالية على هذا الجهاز. الخطة الأصلية ستبقى محفوظة في المكتبة السحابية. هل تريد المتابعة؟`
          : `Opening “${restored.title}” will replace the current ${restored.gameFormat} draft on this device. The original cloud library plan will remain unchanged. Continue?`);
        if (!confirmed) return false;
      }

      // Persist the replacement first. If IndexedDB rejects the write, keep the visible board untouched.
      await persist(restored.players, restored.drawings, {
        format: restored.gameFormat,
        formation: restored.formation,
        title: restored.title,
        notes: restored.notes,
        createdAt: restored.createdAt,
      });
      // A library load can also change 5v5/7v7; the editor history only stores players/drawings,
      // so clear it rather than allowing an undo snapshot to cross incompatible board formats.
      undoRef.current = [];
      redoRef.current = [];
      setHistoryVersion((value) => value + 1);
      setFormat(restored.gameFormat);
      setFormation(restored.formation);
      setTitle(restored.title);
      setNotes(restored.notes);
      setPlayers(restored.players);
      setObjects(restored.drawings);
      setSelectedPlayer(null);
      createdAtRef.current[restored.gameFormat] = restored.createdAt;
      playersRef.current = restored.players;
      objectsRef.current = restored.drawings;
      setStatus(ar ? 'تم فتح الخطة في المسودة الحالية.' : 'Plan opened in the current draft.');
      return true;
    } catch {
      setStatus(ar ? 'تعذر فتح الخطة أو حفظها كمسودة. لم يتم تغيير الملعب الحالي.' : 'Could not open the plan or save it as a draft. The current board was not changed.');
      return false;
    }
  };

  const positionCode = (player: BoardPlayer) => {
    const progress = player.team === 'home' ? player.x : 100-player.x;
    const lane = player.y < 31 ? 'top' : player.y > 69 ? 'bottom' : 'middle';
    if (progress < 17) return 'GK';
    if (progress < 35) return lane === 'top' ? 'RB' : lane === 'bottom' ? 'LB' : 'CB';
    if (progress < 51) return lane === 'top' ? 'RCB' : lane === 'bottom' ? 'LCB' : 'CDM';
    if (progress < 68) return lane === 'top' ? 'RM' : lane === 'bottom' ? 'LM' : 'CM';
    if (progress < 82) return lane === 'top' ? 'RW' : lane === 'bottom' ? 'LW' : 'AM';
    return lane === 'top' ? 'RF' : lane === 'bottom' ? 'LF' : 'ST';
  };
  const updateSelectedPlayer = async (patch: Partial<Pick<BoardPlayer,'name'|'number'>>): Promise<boolean> => {
    if (!requireWrite(ar ? 'تعديل بيانات اللاعب' : 'edit player details')) return false;
    const current = playersRef.current.find(player => player.id === selectedPlayer);
    if (!current) return false;
    if (typeof patch.number === 'number') {
      if (!Number.isInteger(patch.number) || patch.number < 1 || patch.number > 99) { setStatus(ar ? 'رقم اللاعب يجب أن يكون من 1 إلى 99.' : 'Player number must be between 1 and 99.'); return false; }
      if (playersRef.current.some(player => player.team === current.team && player.id !== current.id && player.number === patch.number)) { setStatus(ar ? 'هذا الرقم مستخدم بالفعل من لاعب آخر في الفريق نفسه.' : 'That number is already used by another player on this team.'); return false; }
    }
    remember();
    const next = playersRef.current.map(player => player.id === current.id ? { ...player, ...patch, ...(typeof patch.name==='string'?{name:patch.name.slice(0,28)}:{}) } : player);
    playersRef.current = next; setPlayers(next);
    try { await persist(next,objectsRef.current); setStatus(ar ? 'تم تحديث بيانات اللاعب وحفظها' : 'Player details updated and saved'); return true; }
    catch { setStatus(ar ? 'تم التعديل، لكن تعذر حفظه' : 'Player updated, but saving failed'); return false; }
  };
  const downloadBoardImage = async () => {
    if (!requireWrite(ar ? 'تنزيل صورة الخطة' : 'export a plan image')) return;
    const target = svgRef.current?.parentElement;
    if (!target) return;
    setBusy(true); setStatus('');
    try {
      const canvas = await html2canvas(target, { backgroundColor: '#102A21', scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)), useCORS: true, logging: false });
      const blob = await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('png-export-failed')),'image/png'));
      const safeTitle = (title.trim() || 'TAAMEN tactical plan').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').slice(0,70);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${safeTitle}.png`; anchor.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1200);
      setStatus(ar ? 'تم تجهيز صورة الملعب وتنزيلها' : 'Pitch image exported successfully');
    } catch { setStatus(ar ? 'تعذر إنشاء الصورة في هذا المتصفح. جرّب مرة أخرى.' : 'Could not export the image in this browser. Try again.'); }
    finally { setBusy(false); }
  };
  useEffect(()=>{
    const closeSelection = (event: PointerEvent) => {
      const target = event.target as Element|null;
      if (!target?.closest('.tactical-selected-player') && !target?.closest('[data-board-player]')) {
        // Let a focused name/number input finish its blur commit before the editor unmounts.
        window.setTimeout(() => setSelectedPlayer(null), 0);
      }
    };
    document.addEventListener('pointerdown',closeSelection);
    return ()=>document.removeEventListener('pointerdown',closeSelection);
  },[]);
  const enterFocusMode = async () => {
    setFocusSidebarOpen(!window.matchMedia('(max-width: 900px)').matches);
    setFocusMode(true);
    const element = rootRef.current;
    if (element?.requestFullscreen) {
      try { await element.requestFullscreen(); nativeFullscreenRef.current = true; }
      catch { nativeFullscreenRef.current = false; }
    }
    const orientation = screen.orientation as ScreenOrientation & { lock?: (value: 'landscape') => Promise<void> };
    try { await orientation.lock?.('landscape'); } catch { /* Browser support varies. */ }
  };
  const exitFocusMode = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* CSS focus mode remains available. */ }
    try { (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.(); } catch { /* no-op */ }
    nativeFullscreenRef.current = false;
    setFocusMode(false);
  };
  useEffect(() => {
    if (!focusMode) return;
    document.body.classList.add('taamen-tactical-focus');
    return () => document.body.classList.remove('taamen-tactical-focus');
  }, [focusMode]);
  useEffect(() => {
    const onFullscreenChange = () => {
      if (nativeFullscreenRef.current && document.fullscreenElement !== rootRef.current) {
        nativeFullscreenRef.current = false;
        try { (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.(); } catch { /* no-op */ }
        setFocusMode(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const isSeven = format === '7v7';
  const formationOptions = isSeven ? ['2-3-1','3-2-1','2-2-2','3-1-2','4-1-1','2-1-3'] : ['1-2-1','1-1-2','2-1-1','3-1','2-2'];
  const selectedPlayerData = players.find(player => player.id === selectedPlayer);
  useEffect(() => { setPlayerEditField(null); setPlayerNameDraft(selectedPlayerData?.name || ''); setPlayerNumberDraft(selectedPlayerData ? String(selectedPlayerData.number) : ''); }, [selectedPlayerData?.id]);
  const x = (value: number) => value * fieldWidth / 100;
  const y = (value: number) => value * fieldHeight / 100;
  let currentLibraryPlan: TacticalPlanDocument | null = null;
  let currentLibraryPlanError: unknown = null;
  if (canWrite) {
    try {
      currentLibraryPlan = serializeTacticalPlan({
        id: planStoreId(format),
        gameFormat: format,
        formation,
        title: title.trim() || (ar ? 'خطة بدون اسم' : 'Untitled plan'),
        notes,
        createdAt: createdAtRef.current[format],
        updatedAt: new Date().toISOString(),
        players,
        drawings: objects,
      });
    } catch (error) {
      currentLibraryPlan = null;
      currentLibraryPlanError = error;
    }
  }
  const analyzeCurrentPlanWithAI = () => {
    setStatus('');
    if (!requireWrite(ar ? 'تحليل الخطة بواسطة TAAMEN AI' : 'analyze this plan with TAAMEN AI')) {
      setStatus(ar ? 'إنشاء ملف محلي مطلوب قبل استخدام TAAMEN AI. لم يتم إرسال أي بيانات.' : 'A local profile is required before using TAAMEN AI. No data was sent.');
      return;
    }
    if (!ready) {
      setStatus(ar ? 'ما زال الملعب يحمّل خطتك المحفوظة. جرّب مرة أخرى بعد انتهاء التحميل.' : 'The board is still loading your saved plan. Try again when loading finishes.');
      return;
    }
    if (!go) {
      setStatus(ar ? 'تعذر فتح المساعد من هذه الصفحة. أعد تحميل الموقع وحاول مرة أخرى.' : 'The assistant route is unavailable from this page. Reload the app and try again.');
      return;
    }
    if (!currentLibraryPlan) {
      const validationMessage = currentLibraryPlanError instanceof TacticalPlanValidationError && currentLibraryPlanError.code === 'too-large'
        ? (ar ? 'الخطة أكبر من الحد المسموح. قلّل عدد الرسومات أو نقاط المسارات ثم حاول مرة أخرى.' : 'The plan exceeds the supported size. Reduce the number of drawings or route points and try again.')
        : (ar ? 'تعذر التحقق من بيانات الخطة. راجع مواقع اللاعبين والرسومات، ثم حاول مرة أخرى. لم يتم إرسال أي بيانات.' : 'The plan data could not be validated. Check player positions and drawings, then try again. No data was sent.');
      setStatus(validationMessage);
      return;
    }
    // Use an in-app dialog instead of window.confirm so the consent step is
    // visible and actionable in regular tabs, installed PWAs, and preview builds.
    setShowAIHandoffConfirmation(true);
  };

  const confirmAnalyzeCurrentPlanWithAI = () => {
    if (!currentLibraryPlan) {
      setShowAIHandoffConfirmation(false);
      setStatus(ar ? 'تعذر التحقق من بيانات الخطة الحالية. لم يتم إرسال أي بيانات.' : 'The current plan could not be validated. No data was sent.');
      return;
    }
    if (!go) {
      setShowAIHandoffConfirmation(false);
      setStatus(ar ? 'تعذر فتح المساعد من هذه الصفحة. أعد تحميل الموقع وحاول مرة أخرى.' : 'The assistant route is unavailable from this page. Reload the app and try again.');
      return;
    }
    if (!writeTacticalPlanAIHandoff(currentLibraryPlan)) {
      setShowAIHandoffConfirmation(false);
      setStatus(ar ? 'تعذر تجهيز مرفق الخطة في تخزين الجلسة. تحقق من إعدادات المتصفح ثم حاول مرة أخرى. لم يتم إرسال أي بيانات.' : 'Could not prepare the plan attachment in this tab. Check browser storage settings and try again. No data was sent.');
      return;
    }
    setShowAIHandoffConfirmation(false);
    go('assistant');
  };
  return <section ref={rootRef} className={`page-content tactical-v3-page${isSeven?' is-seven-format':''}${focusMode?' is-focus-mode':''}`}>
    <div className="page-heading tactical-v3-heading"><div><p className="eyebrow">TAAMEN / TACTICAL WORKSPACE</p><h1>{ar ? 'الملعب التكتيكي' : 'Tactical board'}</h1><p className="subtitle">{ar ? 'حرّك اللاعبين وارسم التمريرات والتحركات ومناطق الضغط، ثم صدّر صورة واضحة لخُطتك.' : 'Move players, draw passes and press zones, then export a clear image of your plan.'}</p></div></div>
    <div className={`tactical-v3-toolbar${focusMode ? ' is-focus-toolbar' : ''}`}>
      <div className="tactical-tool-list" role="toolbar" aria-label={ar ? 'أدوات الملعب' : 'Pitch tools'}>{tools.map(item=><button type="button" key={item.id} className={`tactical-tool${tool===item.id?' is-active':''}`} onClick={()=>setTool(item.id)} aria-pressed={tool===item.id}><span>{item.symbol}</span>{ar?item.ar:item.en}</button>)}</div>
      <div className="tactical-history-actions"><button type="button" className="tactical-tool small-tool" onClick={undo} disabled={!undoRef.current.length} title={ar?'تراجع':'Undo'}><Undo2 size={15}/></button><button type="button" className="tactical-tool small-tool" onClick={redo} disabled={!redoRef.current.length} title={ar?'إعادة':'Redo'}><Redo2 size={15}/></button><button type="button" className="tactical-tool small-tool" onClick={resetBoard}><RotateCcw size={15}/>{ar?'إعادة':'Reset'}</button><button type="button" className="tactical-tool small-tool tactical-export-image" onClick={()=>void downloadBoardImage()} disabled={busy} title={ar?'تنزيل صورة الملعب':'Download pitch image'}><ImageDown size={15}/>{ar?'صورة الملعب':'Pitch PNG'}</button></div>
      <span className="tactical-history-version" aria-hidden="true">{historyVersion}</span>
      <div className="tactical-focus-actions">
        {focusMode && <button type="button" className="tactical-tool small-tool" onClick={() => setFocusSidebarOpen(value => !value)} title={focusSidebarOpen ? (ar ? 'إخفاء الإعدادات' : 'Hide settings') : (ar ? 'إظهار الإعدادات' : 'Show settings')} aria-pressed={focusSidebarOpen}>{focusSidebarOpen ? <PanelRightClose size={16}/> : <PanelRightOpen size={16}/>}</button>}
        <button type="button" className="tactical-tool small-tool tactical-focus-toggle" onClick={() => void (focusMode ? exitFocusMode() : enterFocusMode())} title={focusMode ? (ar ? 'إنهاء وضع التركيز' : 'Exit focus mode') : (ar ? 'فتح الملعب بكامل الشاشة' : 'Open full-screen board')}>{focusMode ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}<span>{focusMode ? (ar ? 'إنهاء' : 'Exit') : (ar ? 'ملء الشاشة' : 'Focus')}</span></button>
      </div>{!canWrite&&<span className="tactical-guest-note">{ar?'المعاينة متاحة؛ سجّل محليًا لحفظ خطتك أو تعديلها.':'Preview is available; set up a local profile to edit or save your plan.'}</span>}
    </div>
    <div className={`tactical-v3-layout${focusMode ? ' is-focus-layout' : ''}`} data-tour="tactical">
      <div className="tactical-pitch-column">
        <div className="tactical-v3-pitch-wrap">
          <div className="tactical-portrait-gate">
            <div className="tactical-portrait-gate-card">
              <Maximize2 size={24}/>
              <strong>{ar ? 'الملعب يحتاج مساحة أفقية' : 'The pitch needs a landscape view'}</strong>
              <p>{ar ? 'عرض الملعب التفاعلي على شاشة الهاتف العمودية محدود. افتح وضع ملء الشاشة للحصول على مساحة أوسع.' : 'The interactive pitch is difficult to use on a narrow portrait screen. Open focus mode for a wider workspace.'}</p>
              <button type="button" className="tactical-primary-action" onClick={() => void enterFocusMode()}><Maximize2 size={15}/>{ar ? 'ادخل وضع ملء الشاشة' : 'Enter full-screen mode'}</button>
              <small>{ar ? 'لأفضل تجربة، أدر الهاتف أفقيًا.' : 'For the best view, rotate your phone to landscape.'}</small>
            </div>
          </div>
          <svg ref={svgRef} className="tactical-v3-pitch" viewBox="0 0 900 540" role="img" aria-label={ar ? 'ملعب كرة قدم تكتيكي تفاعلي' : 'Interactive football tactics pitch'} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{cursor:tool==='select'?'grab':'crosshair'}}>
            <defs>
              <linearGradient id="taamen-v3-grass" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#23664B"/><stop offset="1" stopColor="#164D3A"/></linearGradient>
              {/* Marker tip and refX intentionally match: the arrow tip lands exactly on the route endpoint. */}
              <marker id="taamen-arrow-pass" viewBox="0 0 20 20" markerWidth="20" markerHeight="20" refX="18" refY="10" orient="auto" markerUnits="userSpaceOnUse"><path d="M2 2 L18 10 L2 18 Z" fill="#F5F7FF"/></marker>
              <marker id="taamen-arrow-run" viewBox="0 0 20 20" markerWidth="20" markerHeight="20" refX="18" refY="10" orient="auto" markerUnits="userSpaceOnUse"><path d="M2 3 L18 10 L2 17" fill="none" stroke="#FFD166" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></marker>
              <marker id="taamen-arrow-press" viewBox="0 0 20 20" markerWidth="20" markerHeight="20" refX="18" refY="10" orient="auto" markerUnits="userSpaceOnUse"><path d="M2 2 L10 10 L2 18 M9 2 L18 10 L9 18" fill="none" stroke="#FF5CAD" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></marker>
              <marker id="taamen-arrow-curve" viewBox="0 0 20 20" markerWidth="20" markerHeight="20" refX="18" refY="10" orient="auto" markerUnits="userSpaceOnUse"><path d="M2 2 L18 10 L2 18 Z" fill="#C6A5FF"/></marker>
              <marker id="taamen-arrow-multi" viewBox="0 0 20 20" markerWidth="20" markerHeight="20" refX="18" refY="10" orient="auto" markerUnits="userSpaceOnUse"><path d="M2 2 L18 10 L2 18 L7 10 Z" fill="#56E6FF"/></marker>
              <pattern id="taamen-grass-stripes" width="180" height="540" patternUnits="userSpaceOnUse"><rect width="90" height="540" fill="#FFFFFF" opacity=".045"/></pattern>
            </defs>
            <rect width="900" height="540" fill="url(#taamen-v3-grass)"/><rect width="900" height="540" fill="url(#taamen-grass-stripes)"/>
            <g fill="none" stroke="#E4F1E8" strokeWidth="2.3" opacity=".92"><rect x="22" y="22" width="856" height="496"/><line x1="450" y1="22" x2="450" y2="518"/><circle cx="450" cy="270" r="70"/><circle cx="450" cy="270" r="3" fill="#E4F1E8"/><rect x="22" y="150" width="125" height="240"/><rect x="22" y="205" width="54" height="130"/><path d="M147 215 A65 65 0 0 1 147 325"/><rect x="753" y="150" width="125" height="240"/><rect x="824" y="205" width="54" height="130"/><path d="M753 215 A65 65 0 0 0 753 325"/><rect x="3" y="218" width="19" height="104"/><rect x="878" y="218" width="19" height="104"/></g>
            <g className="tactical-v3-drawings">{objects.map(object=>{
              const sx=object.x1, sy=object.y1, ex=object.x2, ey=object.y2;
              const isNew = object.id === animatedObjectId;
              if(object.kind==='zone')return <rect key={object.id} className={isNew?'tactical-zone-reveal':''} x={Math.min(sx,ex)} y={Math.min(sy,ey)} width={Math.max(8,Math.abs(ex-sx))} height={Math.max(8,Math.abs(ey-sy))} fill="#FFB86B" fillOpacity=".16" stroke="#FFB86B" strokeWidth="2"/>;
              const stroke=object.kind==='pass'?'#F5F7FF':object.kind==='run'?'#FFD166':object.kind==='press'?'#FF5CAD':object.kind==='multiCurve'?'#56E6FF':'#C6A5FF';
              const marker=object.kind==='pass'?'url(#taamen-arrow-pass)':object.kind==='run'?'url(#taamen-arrow-run)':object.kind==='press'?'url(#taamen-arrow-press)':object.kind==='curve'?'url(#taamen-arrow-curve)':'url(#taamen-arrow-multi)';
              const dash=object.kind==='run'?'4 7 15 7':object.kind==='press'?'1.5 7':object.kind==='multiCurve'?'6 5':undefined;
              const className=`tactical-route tactical-route-${object.kind}${isNew?' is-revealing':''}${dash?' is-dashed':''}${tool===object.kind?' is-tool-selected':''}`;
              if(object.kind==='curve') {const points=object.points?.length?object.points:[{x:sx,y:sy},curveControl({x:sx,y:sy},{x:ex,y:ey}),{x:ex,y:ey}];return <path key={object.id} className={className} pathLength="1" d={`M ${points[0].x} ${points[0].y} Q ${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y}`} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" markerEnd={marker}/>;}
              if(object.kind==='multiCurve') {
                const points=object.points?.length?smoothSamples(object.points):[{x:sx,y:sy},{x:(sx+ex)/2,y:(sy+ey)/2},{x:ex,y:ey}];
                const route=smoothPath(points);
                return <g key={object.id}>
                  <path className={`${className} tactical-multicurve-base`} d={route} fill="none" stroke={stroke} strokeWidth="2.7" strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" markerEnd={marker}/>
                  {isNew&&<path className="tactical-route-reveal tactical-route-reveal-multicurve" pathLength="1" d={route} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"/>}
                </g>;
              }
              return <path key={object.id} className={className} pathLength={object.kind==='pass'?'1':undefined} d={`M ${sx} ${sy} L ${ex} ${ey}`} fill="none" stroke={stroke} strokeWidth={object.kind==='press'?2.7:3} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" markerEnd={marker}/>;
            })}</g>
            <g className="tactical-v3-players">{players.map(player=><g key={player.id} data-board-player={player.id} className={`tactical-v3-player${selectedPlayer===player.id?' is-selected':''}${player.team==='away'?' is-away':''}`} transform={`translate(${x(player.x)} ${y(player.y)}) scale(${isSeven ? 0.84 : 1})`}>
              <circle r="23" className="tactical-player-halo"/><circle r="19" className="tactical-player-token"/><text y="5" textAnchor="middle" className="tactical-player-number">{player.number}</text>
              <rect x="-42" y="25" width="84" height="28" rx="6" className="tactical-player-label-bg"/><text y="36" textAnchor="middle" className="tactical-player-position">{positionCode(player)}</text><text y="47" textAnchor="middle" className="tactical-player-name">{(player.name||`${ar?'لاعب':'Player'} ${player.number}`).slice(0,14)}</text>
            </g>)}</g>
            {(draftPoints.length>1)&&<path pathLength={tool==='pass'||tool==='curve'?'1':undefined} d={tool==='curve'?oneWayCurve(draftPoints[0],draftPoints[draftPoints.length-1]):smoothPath(smoothSamples(draftPoints))} className={`tactical-draft-route tactical-draft-route-${tool}${tool==='run'||tool==='press'||tool==='multiCurve'?' is-dashed':''}`} fill="none" stroke={tool==='multiCurve'?'#56E6FF':tool==='run'?'#FFD166':tool==='press'?'#FF5CAD':tool==='curve'?'#C6A5FF':'#F5F7FF'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={tool==='run'?'4 7 15 7':tool==='press'?'1.5 7':tool==='multiCurve'?'6 5':undefined} markerEnd={tool==='multiCurve'?'url(#taamen-arrow-multi)':tool==='run'?'url(#taamen-arrow-run)':tool==='press'?'url(#taamen-arrow-press)':tool==='curve'?'url(#taamen-arrow-curve)':'url(#taamen-arrow-pass)'}/>}
          </svg>
          {!focusMode && <div className="tactical-pitch-overlay-label"><span className="tactical-status-dot"/>{isSeven ? (ar?'7 ضد 7':'7 vs 7') : (ar?'5 ضد 5':'5 vs 5')} <span>·</span> {ar?'محرر محلي':'Local editor'}</div>}
          <button type="button" className="tactical-pitch-feature-nudge" onClick={openFormationGuide}><Sparkles size={13}/><span>{ar?'جرّب التشكيلات':'Explore formations'}</span></button>
          <div className="tactical-pitch-legend-strip"><span><i className="tactical-legend-line pass"/>{ar?'تمريرة':'Pass'}</span><span><i className="tactical-legend-line run"/>{ar?'تحرك':'Run'}</span><span><i className="tactical-legend-line press"/>{ar?'ضغط':'Press'}</span><span><i className="tactical-legend-line curve"/>{ar?'منحني':'Curve'}</span><span><i className="tactical-legend-line multi"/>{ar?'متعدد':'Multi'}</span><span><i className="tactical-legend-zone"/>{ar?'منطقة':'Zone'}</span></div>
        </div>
        <div className="tactical-pitch-footer"><span>{ar?'اسحب لاعبًا لتحريكه، أو اختر أداة ثم اسحب على الملعب للرسم.':'Drag a player to move it, or choose a tool and drag across the pitch to draw.'}</span><button type="button" className="tactical-text-button" onClick={()=>setShowLegend(value=>!value)}><CircleHelp size={15}/>{ar?'دليل الأدوات':'Tool guide'}<ChevronDown size={14} className={showLegend?'is-open':''}/></button></div>
        {showLegend&&<div className="tactical-tool-guide"><p><b>{ar?'التمريرة المتصلة:':'Solid pass:'}</b> {ar?'مسار تمرير أو اتجاه الكرة.':'ball/pass direction.'}</p><p><b>{ar?'التحرك المتقطع:':'Dashed run:'}</b> {ar?'حركة اللاعب دون كرة.':'player movement without the ball.'}</p><p><b>{ar?'الضغط المنقط:':'Dotted press:'}</b> {ar?'اتجاه الضغط أو إغلاق المساحة.':'pressing direction or closing a space.'}</p><p><b>{ar?'المسار المنحني:':'Curved path:'}</b> {ar?'اسحب من نقطة البداية إلى النهاية؛ ينشئ النظام انحناءً واحدًا ناعمًا حسب اتجاه السحب.':'Drag from start to end; the board creates one smooth bend based on the drag direction.'}</p><p><b>{ar?'المسار متعدد الانحناءات:':'Multi-curve route:'}</b> {ar?'ارسم مسارًا حرًا متعدد الانحناءات؛ يخفف النظام اهتزاز حركة اليد ويصقله قبل الحفظ.':'Draw a free multi-bend route; pointer jitter is smoothed before the route is saved.'}</p><p><b>{ar?'المنطقة:':'Zone:'}</b> {ar?'اسحب لرسم مساحة تغطية أو ضغط.':'drag to mark a coverage or pressing zone.'}</p></div>}
      </div>
      <aside className={`tactical-v3-sidebar${focusMode && !focusSidebarOpen ? ' is-collapsed' : ''}`}>
        <section ref={formationPanelRef} id="tactical-formation-panel" className="tactical-v3-panel tactical-formation-panel"><header><span className="tactical-panel-number">01</span><div><h2>{ar?'التشكيلات':'Formations'}</h2><p>{ar?'ابدأ بالقالب الذي يناسب أسلوب فريقك ثم عدّل كل لاعب.':'Choose a starting shape, then tune each player.'}</p></div></header>
          <button type="button" className="tactical-formation-disclosure" aria-expanded={formationOpen} onClick={()=>setFormationOpen(value=>!value)}><span><strong>{ar?'جرّب ميزة تأمين الجديدة':'Try the new TAAMEN feature'}</strong><small>{ar?'اختر خطة حسب عدد اللاعبين، ثم عدّل المواضع داخل الملعب.':'Choose a shape for your format, then adjust positions on the board.'}</small></span><ChevronDown size={16} className={formationOpen?'is-open':''}/></button>
          {formationOpen&&<div className="tactical-formation-options"><div className="tactical-format-switch" aria-label={ar?'صيغة اللعب':'Match format'}>{(['5v5','7v7'] as BoardFormat[]).map(value=><button type="button" key={value} className={format===value?'is-active':''} onClick={()=>changeFormat(value)} aria-pressed={format===value}>{value==='5v5'?(ar?'5 ضد 5':'5 vs 5'):(ar?'7 ضد 7':'7 vs 7')}</button>)}</div>
          <div className="tactical-formation-grid">{formationOptions.map((value,index)=><button type="button" key={value} className={`tactical-formation-card${formation===value?' is-active':''}`} onClick={()=>changeFormation(value)}><span className="formation-mini-pitch" aria-hidden="true"/><strong>{value}</strong><small>{value==='3-1'||value==='4-1-1'?(ar?'كتلة دفاعية':'Defensive shape'):value==='1-1-2'||value==='2-1-3'?(ar?'نزعة هجومية':'Attacking shape'):index===0?(ar?'متوازن':'Balanced'):(ar?'مرن':'Flexible')}</small></button>)}</div></div>}
        </section>
        <section className="tactical-v3-panel"><header><span className="tactical-panel-number">02</span><div><h2>{ar?'تفاصيل الخطة':'Plan details'}</h2><p>{ar?'سمّ خطتك واكتب فكرتها الأساسية.':'Name your plan and describe its main idea.'}</p></div></header>
          <label className="tactical-field-label">{ar?'اسم الخطة':'Plan name'}<input value={title} maxLength={70} readOnly={!canWrite} onFocus={()=>{if(!canWrite)requireWrite(ar?'تعديل اسم الخطة':'edit plan name');}} onChange={event=>setTitle(event.target.value)} placeholder={ar?'مثال: ضغط عالٍ':'e.g. High press'}/></label>
          <label className="tactical-field-label">{ar?'ملاحظة تكتيكية':'Tactical note'}<textarea value={notes} maxLength={1000} rows={3} readOnly={!canWrite} onFocus={()=>{if(!canWrite)requireWrite(ar?'تعديل ملاحظات الخطة':'edit plan notes');}} onChange={event=>setNotes(event.target.value)} placeholder={ar?'ما الفكرة التي تريد تنفيذها؟':'What are you trying to achieve?'}/></label>
          {selectedPlayerData&&<div className="tactical-selected-player tactical-selected-player-editor"><div className="tactical-selected-player-heading"><span className={`tactical-selected-token${selectedPlayerData.team==='away'?' is-away':''}`}>{selectedPlayerData.number}</span><div><strong>{ar?(selectedPlayerData.team==='home'?'لاعب من فريقك':'لاعب من الخصم'):(selectedPlayerData.team==='home'?'Your team player':'Opponent player')} · {positionCode(selectedPlayerData)}</strong><small>{ar?'الاسم والرقم يُعدّلان كل واحد بشكل مستقل.':'Name and number are edited independently.'}</small></div><button type="button" onClick={()=>setSelectedPlayer(null)} aria-label={ar?'إغلاق خيارات اللاعب':'Close player options'}>×</button></div>
            <div className="tactical-player-edit-stack">
              <button type="button" className="tactical-player-edit-trigger" aria-expanded={playerEditField==='name'} onClick={()=>{if(!requireWrite(ar?'تعديل اسم اللاعب':'edit player name'))return;setPlayerNameDraft(selectedPlayerData.name||'');setPlayerEditField(playerEditField==='name'?null:'name');}}>{ar?'تعديل اسم اللاعب':'Edit player name'}<ChevronDown size={14}/></button>
              {playerEditField==='name'&&<div className="tactical-player-edit-field"><label className="tactical-field-label">{ar?'اسم اللاعب':'Player name'}<input autoFocus value={playerNameDraft} maxLength={28} onChange={event=>setPlayerNameDraft(event.target.value)} placeholder={ar?'اكتب اسمًا مختصرًا':'Short player name'}/></label><button type="button" className="tactical-primary-action" onClick={async()=>{const fallback=`${ar?(selectedPlayerData.team==='home'?'لاعب':'خصم'):(selectedPlayerData.team==='home'?'Player':'Opponent')} ${selectedPlayerData.number}`;if(await updateSelectedPlayer({name:playerNameDraft.trim()||fallback}))setPlayerEditField(null);}}><Check size={14}/>{ar?'تأكيد الاسم':'Confirm name'}</button></div>}
              <button type="button" className="tactical-player-edit-trigger" aria-expanded={playerEditField==='number'} onClick={()=>{if(!requireWrite(ar?'تعديل رقم اللاعب':'edit shirt number'))return;setPlayerNumberDraft(String(selectedPlayerData.number));setPlayerEditField(playerEditField==='number'?null:'number');}}>{ar?'تعديل رقم القميص':'Edit shirt number'}<ChevronDown size={14}/></button>
              {playerEditField==='number'&&<div className="tactical-player-edit-field"><label className="tactical-field-label">{ar?'رقم القميص':'Shirt number'}<input autoFocus type="number" min="1" max="99" value={playerNumberDraft} onChange={event=>setPlayerNumberDraft(event.target.value)}/><small className="tactical-number-rule">{ar?'من 1 إلى 99، دون تكرار داخل الفريق نفسه.':'1–99, unique within the same team.'}</small></label><button type="button" className="tactical-primary-action" onClick={async()=>{if(playerNumberDraft.trim()===''||!Number.isInteger(Number(playerNumberDraft))){setStatus(ar?'أدخل رقمًا صحيحًا.':'Enter a valid number.');return;}if(await updateSelectedPlayer({number:Number(playerNumberDraft)}))setPlayerEditField(null);}}><Check size={14}/>{ar?'تأكيد الرقم':'Confirm number'}</button></div>}
            </div></div>}
          <div className="tactical-save-actions"><button type="button" className="tactical-primary-action" onClick={()=>void savePlan()} disabled={busy}><Save size={15}/>{busy?(ar?'جارٍ الحفظ…':'Saving…'):(ar?'حفظ المسودة':'Save draft')}</button><button type="button" className="tactical-secondary-action" onClick={exportPlan}><ArrowDownToLine size={15}/>{ar?'تصدير JSON':'Export JSON'}</button><label className="tactical-secondary-action tactical-import-action"><ArrowUpFromLine size={15}/>{ar?'استيراد JSON':'Import JSON'}<input type="file" accept="application/json,.json" hidden onChange={event=>void importPlan(event)}/></label><button type="button" className="tactical-secondary-action tactical-ai-analysis-action" onClick={analyzeCurrentPlanWithAI} disabled={busy||!ready} title={busy?(ar?'انتظر حتى تنتهي العملية الحالية': 'Wait for the current operation to finish'):!ready?(ar?'جارٍ تحميل الخطة المحفوظة':'Loading the saved plan'):(ar?'حلّل الخطة الحالية. إذا لم تنشئ ملفًا محليًا بعد، سيظهر خيار إنشائه.':'Analyze the current plan. If you have not created a local profile, you will be prompted to create one.')}><Sparkles size={15}/>{ar?'حلّل الخطة مع TAAMEN AI':'Analyze with TAAMEN AI'}</button></div>
          {status&&<p className="tactical-v3-feedback" role="status"><Check size={14}/>{status}</p>}
        </section>
        <TacticalPlanLibraryPanel
          language={language}
          activeFormat={format}
          currentPlan={currentLibraryPlan}
          canEditDraft={canWrite}
          onLoadPlan={openLibraryPlan}
          cloudAccountReady={cloudAccountReady}
          repository={libraryRepository}
        />
        <section className="tactical-v3-panel tactical-v3-privacy"><span className="tactical-privacy-mark"><Save size={16}/></span><div><strong>{canWrite?(ar?'المسودة الحالية محفوظة على جهازك':'Your current draft is saved on this device'):(ar?'معاينة الملعب متاحة للزوار':'Board preview is available to guests')}</strong><p>{canWrite?(ar?'يُحفظ العمل الجاري تلقائيًا للمتابعة على هذا الجهاز. مكتبة الخطط الدائمة وحفظ خمس خطط لكل نمط تتطلب حسابًا سحابيًا.':'Your active work is saved locally so you can continue on this device. The permanent plan library and five saved plans per format require a cloud account.'):(ar?'أنشئ ملفًا محليًا لاستخدام الملعب والاحتفاظ بمسودة العمل. حفظ الخطط الدائم سيكون متاحًا مع الحساب السحابي.':'Create a local profile to use the board and keep a working draft. Permanent plan-library storage will be available with a cloud account.')}</p></div></section>
      </aside>
    </div>
    {!ready&&<div className="tactical-v3-load-cover" role="status">{ar?'جارٍ تحميل خطتك المحفوظة…':'Loading your saved plan…'}</div>}
    {showAIHandoffConfirmation&&<div className="overlay tactical-ai-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="tactical-ai-confirm-title" aria-describedby="tactical-ai-confirm-description">
      <button type="button" className="overlay-backdrop" onClick={()=>setShowAIHandoffConfirmation(false)} aria-label={ar?'إغلاق نافذة الموافقة':'Close consent dialog'}/>
      <section className="modal-card tactical-ai-confirm-card">
        <header className="panel-heading"><div><p className="eyebrow">TAAMEN / AI PLAN HANDOFF</p><h2 id="tactical-ai-confirm-title">{ar?'تأكيد مشاركة الخطة مع TAAMEN AI':'Confirm sharing this plan with TAAMEN AI'}</h2></div></header>
        <p id="tactical-ai-confirm-description">{ar?'سيتم تجهيز وصف منظم للخطة الحالية وإرفاقه بمحادثة TAAMEN AI. يشمل ذلك اسم الخطة وملاحظاتها وصيغة الملعب والتشكيلة وأسماء وأرقام اللاعبين ومواقعهم والرسومات والمسارات والمناطق. لن تُرسل الخطة إلى Cloudflare AI إلا بعد انتقالك للمساعد وإرسال سؤالك. لن تُحفظ في مكتبة سحابية.':'A structured description of the current plan will be attached to your TAAMEN AI conversation. It includes the plan title and notes, format, formation, player names and numbers, positions, drawings, routes, and zones. The plan is not sent to Cloudflare AI until you open the assistant and submit your question. It is not saved to a cloud library.'}</p>
        <div className="tactical-ai-confirm-summary"><strong>{title.trim()|| (ar?'خطة بدون اسم':'Untitled plan')}</strong><span>{format} · {formation} · {players.length} {ar?'لاعباً':'players'} · {objects.length} {ar?'رسماً':'drawings'}</span></div>
        <div className="modal-actions tactical-ai-confirm-actions">
          <button type="button" className="dark-action" onClick={()=>setShowAIHandoffConfirmation(false)}>{ar?'إلغاء':'Cancel'}</button>
          <button type="button" className="primary-action" onClick={confirmAnalyzeCurrentPlanWithAI}><Sparkles size={16}/>{ar?'متابعة إلى TAAMEN AI':'Continue to TAAMEN AI'}</button>
        </div>
      </section>
    </div>}
  </section>;
}
