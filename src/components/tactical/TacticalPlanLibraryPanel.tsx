import { useEffect, useId, useMemo, useState } from 'react';
import { Check, ChevronDown, Clock3, Download, LockKeyhole, Pencil, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import type { Language } from '../../i18n/translations';
import { ApiError } from '../../services/apiClient';
import {
  MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT,
  parseTacticalPlanLibraryEntry,
  selectTacticalPlanLibraryEntries,
  TacticalPlanLibraryError,
  type TacticalPlanLibraryEntry,
} from '../../domain/tactics/tacticalPlanLibrary';
import type { TacticalPlanDocument, TacticalPlanGameFormat } from '../../domain/tactics/tacticalPlanSchema';
import type { TacticalPlanLibraryRepository } from '../../services/tacticalPlanLibraryRepository';
import {
  deleteTacticalPlanFromLibrary,
  openTacticalPlanFromLibrary,
  renameTacticalPlanInLibrary,
  saveTacticalPlanToLibrary,
  updateTacticalPlanInLibrary,
} from '../../services/tacticalPlanLibraryActions';
import { TacticalPlanMiniPreview } from './TacticalPlanMiniPreview';
import '../../styles/tactical-plan-library.css';

const FORMATS: TacticalPlanGameFormat[] = ['5v5', '7v7'];

function formatDate(value: string, language: Language): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function safeEntries(value: unknown): TacticalPlanLibraryEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: TacticalPlanLibraryEntry[] = [];
  for (const item of value) {
    try {
      entries.push(parseTacticalPlanLibraryEntry(item));
    } catch {
      // Invalid remote records are never rendered or passed to the board.
    }
  }
  return entries;
}

type Props = {
  language: Language;
  activeFormat: TacticalPlanGameFormat;
  currentPlan: TacticalPlanDocument | null;
  canEditDraft?: boolean;
  onLoadPlan: (plan: TacticalPlanDocument) => void | boolean | Promise<void | boolean>;
  /** Remains false until authenticated cloud accounts and their API are implemented. */
  cloudAccountReady?: boolean;
  repository?: TacticalPlanLibraryRepository;
};

export default function TacticalPlanLibraryPanel({
  language,
  activeFormat,
  currentPlan,
  canEditDraft = false,
  onLoadPlan,
  cloudAccountReady = false,
  repository,
}: Props) {
  const ar = language === 'ar';
  const contentId = useId();
  const [sectionExpanded, setSectionExpanded] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<TacticalPlanGameFormat>(activeFormat);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TacticalPlanLibraryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const visibleEntries = useMemo(
    () => selectTacticalPlanLibraryEntries(entries, selectedFormat),
    [entries, selectedFormat],
  );
  const canManage = cloudAccountReady && Boolean(repository);
  const canSaveCurrent = Boolean(
    canManage && canEditDraft && currentPlan && currentPlan.metadata.gameFormat === selectedFormat,
  );
  const slotsRemaining = Math.max(0, MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT - visibleEntries.length);
  const busy = saving || Boolean(busyId) || loading;

  // When the board itself changes format (for example after opening a 7v7 plan), follow it.
  useEffect(() => {
    setSelectedFormat(activeFormat);
    setExpandedPlanId(null);
    setEditingId(null);
  }, [activeFormat]);

  // Do not make network requests while the whole library panel is collapsed.
  useEffect(() => {
    if (!cloudAccountReady || !repository) {
      setEntries([]);
      setLoading(false);
      return;
    }
    if (!sectionExpanded) return;

    let active = true;
    setLoading(true);
    setStatus('');
    repository.list(selectedFormat)
      .then((rows) => {
        if (!active) return;
        const validRows = safeEntries(rows).filter((entry) => entry.gameFormat === selectedFormat);
        setEntries((current) => [
          ...current.filter((entry) => entry.gameFormat !== selectedFormat),
          ...validRows.slice(0, MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT),
        ]);
        if (validRows.length > MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT) {
          setStatus(ar
            ? 'أعاد الخادم أكثر من خمس خطط لهذا النمط؛ عُرضت أول خمس خطط فقط. راجع قيد المكتبة على الخادم.'
            : 'The server returned more than five plans for this format. Only the first five are shown; verify the server-side limit.');
        }
      })
      .catch(() => {
        if (active) setStatus(ar
          ? 'تعذر تحميل مكتبة الخطط. تحقق من الاتصال ثم أعد المحاولة.'
          : 'Could not load the plan library. Check the connection and try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [ar, cloudAccountReady, repository, sectionExpanded, selectedFormat]);

  const saveCurrent = async (slotNumber?: number) => {
    if (!cloudAccountReady) {
      setStatus(ar
        ? 'إضافة الخطط وحفظها الدائم يتطلبان حساباً سحابياً موثقاً. مسودتك الحالية محفوظة على هذا الجهاز.'
        : 'Adding plans to the permanent library requires an authenticated cloud account. Your current draft remains saved on this device.');
      return;
    }
    if (!repository) {
      setStatus(ar ? 'الحساب السحابي غير مربوط بمخزن الخطط بعد.' : 'The cloud account is not connected to the plan repository yet.');
      return;
    }
    if (!canEditDraft || !currentPlan) {
      setStatus(ar ? 'أنشئ ملفاً محلياً وعدّل خطة قبل إضافتها إلى المكتبة.' : 'Set up a local profile and edit a plan before adding it to the library.');
      return;
    }
    if (currentPlan.metadata.gameFormat !== selectedFormat) {
      setStatus(ar ? 'اختر نمط الملعب المطابق للخطة الحالية أولاً.' : 'Select the format that matches the current board first.');
      return;
    }
    if (busy) return;
    if (slotsRemaining <= 0) {
      setStatus(ar ? 'اكتملت الخطط الخمس لهذا النمط. احذف خطة قبل إضافة أخرى.' : 'All five slots for this format are full. Delete a plan before adding another.');
      return;
    }

    const generatedTitle = currentPlan.metadata.title.trim()
      || (ar ? `خطة ${String(slotNumber ?? visibleEntries.length + 1).padStart(2, '0')}` : `Plan ${String(slotNumber ?? visibleEntries.length + 1).padStart(2, '0')}`);
    setSaving(true);
    setStatus('');
    try {
      const created = await saveTacticalPlanToLibrary(repository, entries, currentPlan, generatedTitle, slotNumber);
      setEntries((current) => [created, ...current.filter((entry) => entry.id !== created.id)]);
      setExpandedPlanId(created.id);
      setStatus(ar ? `تمت إضافة «${created.title}» إلى الخانة ${created.slotNumber} من مكتبة ${selectedFormat}.` : `“${created.title}” was saved to slot ${created.slotNumber} in the ${selectedFormat} library.`);
    } catch (error) {
      if (error instanceof TacticalPlanLibraryError && error.code === 'limit-reached') {
        setStatus(ar ? 'اكتملت الخطط الخمس لهذا النمط. استبدل خطة محفوظة أو احذفها قبل إضافة أخرى.' : 'All five slots for this format are full. Replace or delete a saved plan before adding another.');
      } else if (error instanceof TacticalPlanLibraryError && error.code === 'slot-occupied') {
        setStatus(ar ? 'الخانة التي اخترتها لم تعد فارغة. حدّث المكتبة واختر خانة أخرى.' : 'That slot is no longer empty. Refresh the library and choose another slot.');
      } else if (error instanceof ApiError && error.code === 'slot_occupied') {
        setStatus(ar ? 'الخانة التي اخترتها حُجزت بالفعل. حدّث المكتبة ثم أعد المحاولة.' : 'That slot was just claimed. Refresh the library and try again.');
      } else {
        setStatus(ar ? 'تعذر إضافة الخطة. بقيت المسودة الحالية دون تغيير.' : 'Could not add the plan. Your current draft was not changed.');
      }
    } finally {
      setSaving(false);
    }
  };

  const loadEntry = async (entry: TacticalPlanLibraryEntry) => {
    if (!canManage || busyId || saving) return;
    setBusyId(entry.id);
    setStatus('');
    try {
      const opened = await openTacticalPlanFromLibrary(entry, onLoadPlan);
      setStatus(opened
        ? (ar ? `تم استبدال المسودة الحالية بالخطة «${entry.title}» بعد التأكيد.` : `The current draft was replaced with “${entry.title}” after confirmation.`)
        : (ar ? 'لم يتم استبدال المسودة الحالية.' : 'The current draft was not replaced.'));
    } catch {
      setStatus(ar ? 'تعذر فتح الخطة. بقيت المسودة الحالية دون تغيير.' : 'Could not open the plan. The current draft was left unchanged.');
    } finally {
      setBusyId(null);
    }
  };

  const replaceSavedEntry = async (entry: TacticalPlanLibraryEntry) => {
    if (!repository || !canManage || busyId || saving) return;
    if (!canEditDraft || !currentPlan) {
      setStatus(ar ? 'أنشئ ملفاً محلياً وافتح خطة قبل استبدال الخطة المحفوظة.' : 'Create a local profile and prepare a draft before replacing a saved plan.');
      return;
    }
    if (currentPlan.metadata.gameFormat !== entry.gameFormat) {
      setStatus(ar ? 'صيغة الملعب الحالي لا تطابق صيغة الخطة المحفوظة.' : 'The current board format does not match this saved plan.');
      return;
    }

    const replacementTitle = currentPlan.metadata.title.trim() || entry.title;
    const confirmed = window.confirm(ar
      ? `استبدال الخطة السحابية «${entry.title}» بالخطة الحالية؟ سيبقى رقم الخانة ومعرّف الخطة، وستُحفظ نسخة مراجعة جديدة بدلاً من محتوى الخطة الحالي.`
      : `Replace the saved cloud plan “${entry.title}” with the current board? Its slot and plan ID will stay the same, while a new revision replaces the saved content.`);
    if (!confirmed) return;

    const replacement: TacticalPlanDocument = {
      ...currentPlan,
      id: entry.id,
      metadata: {
        ...currentPlan.metadata,
        title: replacementTitle,
        createdAt: entry.createdAt,
      },
    };
    setBusyId(entry.id);
    setStatus('');
    try {
      const updated = await updateTacticalPlanInLibrary(repository, entry, replacement);
      setEntries((current) => current.map((item) => item.id === entry.id ? updated : item));
      setStatus(ar
        ? `تم استبدال محتوى «${entry.title}» بالخطة الحالية. رقم الخانة محفوظ والمراجعة الآن ${updated.revision}.`
        : `“${entry.title}” was replaced with the current board. Its slot is unchanged; current revision: ${updated.revision}.`);
    } catch {
      setStatus(ar
        ? 'تعذر استبدال الخطة. قد تكون عُدّلت من جهاز آخر؛ حدّث المكتبة قبل إعادة المحاولة.'
        : 'Could not replace the plan. It may have changed on another device; refresh the library before retrying.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteEntry = async (entry: TacticalPlanLibraryEntry) => {
    if (!repository || !canManage || busyId || saving) return;
    const confirmed = window.confirm(ar
      ? `حذف خطة «${entry.title}» نهائياً من المكتبة السحابية؟ لن تُحذف المسودة الحالية على هذا الجهاز.`
      : `Permanently delete “${entry.title}” from the cloud library? The current device draft will not be deleted.`);
    if (!confirmed) return;

    setBusyId(entry.id);
    setStatus('');
    try {
      await deleteTacticalPlanFromLibrary(repository, entry);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setExpandedPlanId(null);
      setEditingId(null);
      setStatus(ar ? 'تم حذف الخطة من المكتبة السحابية.' : 'Plan deleted from the cloud library.');
    } catch {
      setStatus(ar ? 'تعذر حذف الخطة. لم يتم تغيير المسودة الحالية.' : 'Could not delete the plan. The current draft was not changed.');
    } finally {
      setBusyId(null);
    }
  };

  const beginRename = (entry: TacticalPlanLibraryEntry) => {
    if (!canManage || busy) return;
    setEditingId(entry.id);
    setEditingTitle(entry.title);
    setStatus('');
  };

  const commitRename = async (entry: TacticalPlanLibraryEntry) => {
    if (!repository || !canManage || busyId || saving) return;
    const cleanTitle = editingTitle.trim();
    if (!cleanTitle || cleanTitle.length > 70) {
      setStatus(ar ? 'اسم الخطة يجب أن يكون من 1 إلى 70 حرفاً.' : 'The plan name must contain 1–70 characters.');
      return;
    }
    setBusyId(entry.id);
    setStatus('');
    try {
      const updated = await renameTacticalPlanInLibrary(repository, entry, cleanTitle);
      setEntries((current) => current.map((item) => item.id === entry.id ? updated : item));
      setEditingId(null);
      setEditingTitle('');
      setStatus(ar ? 'تم تحديث اسم الخطة.' : 'Plan name updated.');
    } catch {
      setStatus(ar ? 'تعذر تحديث اسم الخطة.' : 'Could not update the plan name.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleEntry = (id: string) => {
    setExpandedPlanId((current) => current === id ? null : id);
    setEditingId(null);
    setStatus('');
  };

  return (
    <section className="tactical-v3-panel tactical-library-panel" aria-labelledby="tactical-library-title">
      <header className="tactical-library-header">
        <span className="tactical-panel-number">03</span>
        <div className="tactical-library-heading-copy">
          <h2 id="tactical-library-title">
            <button
              type="button"
              className="tactical-library-section-toggle"
              aria-expanded={sectionExpanded}
              aria-controls={contentId}
              onClick={() => {
                if (sectionExpanded) {
                  setExpandedPlanId(null);
                  setEditingId(null);
                }
                setSectionExpanded((value) => !value);
              }}
            >
              <span>{ar ? 'مكتبة الخطط' : 'Plan library'}</span>
              <ChevronDown className="tactical-library-toggle-icon" size={17} aria-hidden="true" />
            </button>
          </h2>
          <p>{ar ? 'احتفظ بخططك التكتيكية للعودة إليها وتطويرها.' : 'Keep your tactical plans and return to refine them.'}</p>
        </div>
      </header>

      <div id={contentId} className="tactical-library-content" hidden={!sectionExpanded}>
        <div className="tactical-library-format-switch" role="group" aria-label={ar ? 'صيغة الخطط' : 'Plan format'}>
          {FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              aria-pressed={selectedFormat === format}
              disabled={busy}
              className={selectedFormat === format ? 'is-active' : ''}
              onClick={() => {
                setSelectedFormat(format);
                setExpandedPlanId(null);
                setEditingId(null);
                setStatus('');
              }}
            >
              {format === '5v5' ? (ar ? '5 ضد 5' : '5 vs 5') : (ar ? '7 ضد 7' : '7 vs 7')}
            </button>
          ))}
        </div>

        <div className="tactical-library-capacity" aria-live="polite">
          <span>{ar ? 'الخطط المحفوظة / الحد الأقصى' : 'Saved plans / maximum'}</span>
          <strong>{visibleEntries.length}/{MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT}</strong>
          <button
            type="button"
            className="tactical-library-add-current"
            onClick={() => void saveCurrent()}
            disabled={busy || (canManage && (!canSaveCurrent || slotsRemaining <= 0)) || (!canManage && !canEditDraft)}
            aria-label={ar ? `إضافة التكتيك الحالي إلى مكتبة ${selectedFormat}` : `Add the current tactic to the ${selectedFormat} library`}
            title={ar ? 'إضافة التكتيك الحالي' : 'Add current tactic'}
          >
            <Plus size={17} aria-hidden="true" />
            <span>{ar ? 'إضافة التكتيك الحالي' : 'Add current tactic'}</span>
          </button>
        </div>

        <div className="tactical-library-list" aria-label={ar ? 'خانات الخطط المحفوظة' : 'Saved plan slots'}>
          {Array.from({ length: MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT }, (_, index) => {
            const slotNumber = index + 1;
            const entry = visibleEntries.find((item) => item.slotNumber === slotNumber);
            if (!entry) {
              return (
                <div className="tactical-library-slot is-empty" key={`empty-${selectedFormat}-${index + 1}`}>
                  <span className="tactical-library-slot-index">{String(slotNumber).padStart(2, '0')}</span>
                  <span className="tactical-library-slot-label">{ar ? 'خانة فارغة' : 'Empty slot'}</span>
                  {canManage && canEditDraft && currentPlan?.metadata.gameFormat === selectedFormat ? (
                    <button
                      type="button"
                      className="tactical-library-slot-save"
                      onClick={() => void saveCurrent(slotNumber)}
                      disabled={busy}
                      aria-label={ar ? `حفظ الخطة الحالية في الخانة ${slotNumber}` : `Save the current plan to slot ${slotNumber}`}
                    >
                      <Plus size={13} /><span>{ar ? 'حفظ هنا' : 'Save here'}</span>
                    </button>
                  ) : (
                    <span className="tactical-library-slot-state">{canManage ? (ar ? 'متاحة' : 'Available') : <><LockKeyhole size={12} />{ar ? 'للحسابات' : 'Account'}</>}</span>
                  )}
                </div>
              );
            }

            const expanded = expandedPlanId === entry.id;
            const regionId = `${contentId}-plan-${encodeURIComponent(entry.id)}`;
            const editing = editingId === entry.id;
            return (
              <article className={`tactical-library-entry${expanded ? ' is-expanded' : ''}`} key={entry.id}>
                <button
                  type="button"
                  className="tactical-library-entry-toggle"
                  aria-expanded={expanded}
                  aria-controls={regionId}
                  onClick={() => toggleEntry(entry.id)}
                  disabled={busyId === entry.id || saving}
                >
                  <span className="tactical-library-slot-index">{String(slotNumber).padStart(2, '0')}</span>
                  <span className="tactical-library-entry-title" title={entry.title}>{entry.title}</span>
                  <ChevronDown className="tactical-library-entry-chevron" size={16} aria-hidden="true" />
                </button>

                <div id={regionId} className="tactical-library-entry-content" hidden={!expanded}>
                  <TacticalPlanMiniPreview plan={entry.document} label={ar ? `معاينة الخطة ${entry.title}` : `${entry.title} plan preview`} />
                  <div className="tactical-library-entry-meta">
                    <span>{entry.formation}</span>
                    <span><Clock3 size={12} />{formatDate(entry.updatedAt, language)}</span>
                  </div>

                  {editing ? (
                    <div className="tactical-library-rename">
                      <label className="tactical-library-visually-hidden" htmlFor={`${regionId}-rename`}>{ar ? 'اسم الخطة الجديد' : 'New plan name'}</label>
                      <input
                        id={`${regionId}-rename`}
                        value={editingTitle}
                        maxLength={70}
                        autoFocus
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void commitRename(entry);
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button type="button" onClick={() => void commitRename(entry)} disabled={busy} aria-label={ar ? 'حفظ الاسم الجديد' : 'Save new name'}><Check size={15} /></button>
                      <button type="button" onClick={() => setEditingId(null)} disabled={busy} aria-label={ar ? 'إلغاء إعادة التسمية' : 'Cancel rename'}><X size={15} /></button>
                    </div>
                  ) : (
                    <div className="tactical-library-card-actions">
                      <button type="button" onClick={() => void loadEntry(entry)} disabled={!canManage || busy} className="is-primary" title={ar ? 'فتح الخطة داخل المسودة الحالية' : 'Open the saved plan as the current draft'}>
                        <Download size={14} /><span>{ar ? 'استبدال المسودة' : 'Replace draft'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void replaceSavedEntry(entry)}
                        disabled={!canManage || !canEditDraft || !currentPlan || currentPlan.metadata.gameFormat !== entry.gameFormat || busy}
                        aria-label={ar ? `استبدال الخطة المحفوظة ${entry.title} بالخطة الحالية` : `Replace saved plan ${entry.title} with the current board`}
                        title={ar ? 'استبدال محتوى الخطة المحفوظة بالخطة الحالية' : 'Replace saved plan content with the current board'}
                      >
                        <Save size={14} /><span>{ar ? 'استبدال المحفوظة' : 'Replace saved'}</span>
                      </button>
                      <button type="button" onClick={() => beginRename(entry)} disabled={!canManage || busy} aria-label={ar ? 'إعادة تسمية الخطة' : 'Rename plan'}>
                        <Pencil size={14} /><span>{ar ? 'تسمية' : 'Rename'}</span>
                      </button>
                      <button type="button" onClick={() => void deleteEntry(entry)} disabled={!canManage || busy} aria-label={ar ? 'حذف الخطة' : 'Delete plan'}>
                        <Trash2 size={14} /><span>{ar ? 'حذف' : 'Delete'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {!canManage && (
          <div className="tactical-library-locked" role="note">
            <span className="tactical-library-lock-icon"><LockKeyhole size={17} /></span>
            <div>
              <strong>{cloudAccountReady
                ? (ar ? 'خدمة المكتبة السحابية غير متصلة' : 'Cloud library service is not connected')
                : (ar ? 'المكتبة السحابية للحسابات' : 'Cloud library for account holders')}</strong>
              <p>{cloudAccountReady
                ? (ar ? 'الحساب متاح، لكن خدمة تخزين الخطط لم تُربط بعد. لم يتم حفظ أي خطة محلياً.' : 'The account is available, but the cloud plan service is not connected yet. No plan was saved locally.')
                : (canEditDraft
                  ? (ar
                    ? 'الملف المحلي يحفظ مسودة العمل الحالية على هذا الجهاز فقط. زر الإضافة ومكتبة الخطط الدائمة يتطلبان حساباً سحابياً موثقاً.'
                    : 'A local profile keeps only the current working draft on this device. Adding plans to the permanent library requires an authenticated cloud account.')
                  : (ar
                    ? 'يمكنك معاينة الملعب والخانات، لكن التعديل يتطلب ملفاً محلياً، ومكتبة الخطط الدائمة تتطلب حساباً سحابياً.'
                    : 'You can preview the board and its slots. Editing requires a local profile; the permanent plan library requires a cloud account.'))}</p>
            </div>
            <span className="tactical-library-coming-soon"><LockKeyhole size={12} />{ar ? 'قريباً' : 'Coming soon'}</span>
          </div>
        )}

        {loading && <p className="tactical-library-status" role="status">{ar ? 'جارٍ تحميل المكتبة…' : 'Loading library…'}</p>}
        {status && <p className="tactical-library-status" role="status">{status}</p>}
        <div className="tactical-library-footnote"><ShieldCheck size={13} />{ar
          ? '5 خطط مستقلة لكل نمط. فتح الخطة يستبدل المسودة الحالية بعد التأكيد، وحذفها لا يحذف المسودة على الجهاز.'
          : 'Five independent plans per format. Opening replaces the current draft only after confirmation; deleting a library plan never deletes the device draft.'}</div>
      </div>
    </section>
  );
}
