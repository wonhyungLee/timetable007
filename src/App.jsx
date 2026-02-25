import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AlertCircle, CheckCircle, Info, CalendarSync, X, ChevronLeft, ChevronRight, Copy, LayoutDashboard, CalendarDays, Calculator, MapPin, Settings, Trash2, Edit2, BookOpen, Coffee, Plus, Save, Eye, EyeOff } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';

// --- [1] 기본 설정 및 학사일정 주차 생성 ---
const DAYS = ['월', '화', '수', '목', '금'];
const PERIODS = [1, 2, 3, 4, 5, 6];
const MIN_CLASS_COUNT = 1;
const MAX_CLASS_COUNT = 20;
const DEFAULT_CLASS_COUNT = 12;

const DEFAULT_SUBJECTS = [
  '국어', '사회', '도덕', '수학', '과학', '실과', '체육', '음악', '미술', '영어', 
  '자율자치', '동아리', '봉사', '진로', '학교자율', '창체', '휴업일'
];
const DEFAULT_HOMEROOM_SUBJECTS = ['국어', '수학', '사회', '도덕', '미술', '창체'];

const HOMEROOM_FLEX_SUBJECTS = ['과학', '체육', '음악'];
const HOMEROOM_OVERRIDE_PREFIX = '__homeroom__::';

const createClassNames = (classCount = DEFAULT_CLASS_COUNT) =>
  Array.from({ length: classCount }, (_, i) => `${i + 1}반`);

const normalizeClassCount = (value, fallback = DEFAULT_CLASS_COUNT) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(MAX_CLASS_COUNT, Math.max(MIN_CLASS_COUNT, parsed));
};

const normalizeSubjects = (source, fallback = DEFAULT_SUBJECTS) => {
  const sourceList = Array.isArray(source)
    ? source
    : String(source ?? '').split(/[,\n]/g);
  const deduped = [...new Set(
    sourceList
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
  )];

  const withoutHoliday = deduped.filter((subject) => subject !== '휴업일');
  if (withoutHoliday.length === 0) {
    const fallbackWithoutHoliday = [...new Set(
      (Array.isArray(fallback) ? fallback : DEFAULT_SUBJECTS)
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    )].filter((subject) => subject !== '휴업일');
    if (fallbackWithoutHoliday.length > 0) {
      withoutHoliday.push(...fallbackWithoutHoliday);
    } else {
      withoutHoliday.push('국어');
    }
  }

  return [...withoutHoliday, '휴업일'];
};

const getHomeroomSubjectPool = (subjectPool = DEFAULT_SUBJECTS) => {
  const filtered = normalizeSubjects(subjectPool).filter((subject) =>
    subject !== '휴업일' && !HOMEROOM_FLEX_SUBJECTS.includes(subject)
  );
  if (filtered.length > 0) return filtered;
  return DEFAULT_HOMEROOM_SUBJECTS;
};

const toHomeroomOverrideValue = (subject) => `${HOMEROOM_OVERRIDE_PREFIX}${subject}`;

const parseSubjectSelection = (value) => {
  if (!value) return { subject: '', forceHomeroom: false };
  if (typeof value === 'string' && value.startsWith(HOMEROOM_OVERRIDE_PREFIX)) {
    return {
      subject: value.slice(HOMEROOM_OVERRIDE_PREFIX.length),
      forceHomeroom: true
    };
  }
  return { subject: value, forceHomeroom: false };
};

const getSubjectSelectionValueForCell = (cell) => {
  if (!cell) return '';
  if (cell.type === 'homeroom' && HOMEROOM_FLEX_SUBJECTS.includes(cell.subject)) {
    return toHomeroomOverrideValue(cell.subject);
  }
  return cell.subject || '';
};

const buildSubjectSelectOptions = (subjectPool = DEFAULT_SUBJECTS) =>
  normalizeSubjects(subjectPool).flatMap((subject) => {
  if (!HOMEROOM_FLEX_SUBJECTS.includes(subject)) {
    return [{ value: subject, label: subject }];
  }

  return [
    { value: subject, label: `${subject} (전담)` },
    { value: toHomeroomOverrideValue(subject), label: `${subject} (담임)` }
  ];
  });

const WEEK_START_DATES = {};

const generate2026Weeks = () => {
  const weeks = [];
  let current = new Date(2026, 2, 2); 
  let end1 = new Date(2026, 6, 24);
  let w1 = 1;
  while (current <= end1) {
    let fri = new Date(current);
    fri.setDate(fri.getDate() + 4);
    const name = `1학기 ${w1}주차 (${current.getMonth()+1}.${current.getDate()}~${fri.getMonth()+1}.${fri.getDate()})`;
    WEEK_START_DATES[name] = new Date(current);
    weeks.push({ term: 1, name });
    current.setDate(current.getDate() + 7);
    w1++;
  }
  current = new Date(2026, 7, 17);
  let end2 = new Date(2026, 11, 31);
  let w2 = 1;
  while (current <= end2) {
    let fri = new Date(current);
    fri.setDate(fri.getDate() + 4);
    const name = `2학기 ${w2}주차 (${current.getMonth()+1}.${current.getDate()}~${fri.getMonth()+1}.${fri.getDate()})`;
    WEEK_START_DATES[name] = new Date(current);
    weeks.push({ term: 2, name });
    current.setDate(current.getDate() + 7);
    w2++;
  }
  return weeks.map(w => w.name);
};

const WEEKS = generate2026Weeks();

const getDatesForWeek = (weekName) => {
  const start = WEEK_START_DATES[weekName];
  if (!start) return DAYS;
  return DAYS.map((day, idx) => {
    const d = new Date(start);
    d.setDate(d.getDate() + idx);
    return `${day}(${d.getMonth() + 1}.${d.getDate()})`;
  });
};

const MONTHS = [];
for(let i=0; i<WEEKS.length; i+=4) {
  const firstWeekName = WEEKS[i];
  const startDate = WEEK_START_DATES[firstWeekName];
  const term = firstWeekName.startsWith('1학기') ? '1' : '2';
  const month = startDate ? startDate.getMonth() + 1 : '';
  const wIndices = [i, i+1, i+2, i+3].filter(idx => idx < WEEKS.length);
  
  const startW = WEEKS[wIndices[0]].split(' ')[1]; 
  const endW = WEEKS[wIndices[wIndices.length-1]].split(' ')[1]; 
  const weekRange = startW === endW ? startW : `${startW}~${endW}`;

  MONTHS.push({
    name: `${term}학기(${month}월) [${weekRange}]`,
    weekIndices: wIndices
  });
}

// --- [2] 전담 교사 및 장소 로직 ---
const initialTeachers = [];

const getSubjectColor = (subject) => {
  if (!subject) return 'bg-gray-100 border-dashed border-2 text-gray-400'; // 빈칸(삭제됨)
  if (subject === '휴업일') return 'bg-gray-400 text-white border-gray-500'; // 휴업일 스타일
  
  const colors = {
    '체육': 'bg-[#00c853]', '영어': 'bg-[#00e5ff]',
    '과학': 'bg-[#b388ff]', '음악': 'bg-[#ff8a80]',
    '실과': 'bg-[#ffb300]'
  };
  return colors[subject] || 'bg-white text-gray-700'; // 담임 과목은 기본 흰색
};

const isHolidayCell = (cell) => cell?.type === 'holiday' || cell?.subject === '휴업일';
const isSpecialLikeCell = (cell) => {
  if (!cell || isHolidayCell(cell)) return false;
  if (cell.type === 'special') return true;
  // 레거시 데이터에서 type이 비어 있고 teacherId만 남아있는 경우만 전담으로 간주
  if (!cell.type && cell.teacherId) return true;
  return false;
};

const getTimetableCellColor = (cell) => {
  const subject = cell?.subject || '';
  if (!subject) return getSubjectColor('');
  if (isHolidayCell(cell)) return getSubjectColor('휴업일');
  if (cell?.type !== 'special') return 'bg-white text-gray-700';
  return getSubjectColor(subject);
};

const getDefaultLocation = (subject, dayIndex, periodIndex) => {
  if (subject === '과학') return '과학1실';
  if (subject === '체육') {
    const d = dayIndex; const p = periodIndex;
    if (d === 0 || d === 1) return '강당';
    if (d === 2) { if (p >= 1 && p <= 3) return '체육실'; if (p === 4) return '강당'; }
    if (d === 3) { if (p === 0) return '강당'; if (p >= 2 && p <= 4) return '체육실'; }
    if (d === 4) { if (p >= 1 && p <= 3) return '체육실'; if (p >= 4 && p <= 5) return '강당'; }
  }
  return '';
};

// --- [3] 초기 시간표 생성 ---
const generateInitialBaseSchedule = (
  teachers = initialTeachers,
  classNames = createClassNames(DEFAULT_CLASS_COUNT),
  subjectPool = DEFAULT_SUBJECTS
) => {
  const schedule = {};
  classNames.forEach(cls => {
    schedule[cls] = Array(6).fill(null).map(() => Array(5).fill({ subject: '', type: 'empty' }));
  });

  const specialSubjects = [...new Set(teachers.map(t => t.subject))];
  const teacherOccupied = {}; 
  teachers.forEach(t => teacherOccupied[t.id] = new Set());

  // 1. 전담 배정
  classNames.forEach((cls) => {
    const classNum = parseInt(cls.replace('반', ''));
    specialSubjects.forEach((subject) => {
      const teacher = teachers.find(t => t.subject === subject && t.classes.includes(classNum));
      if (!teacher) return;
      
      let assignedCount = 0; let attempts = 0;
      while (assignedCount < 2 && attempts < 100) {
        let d = Math.floor(Math.random() * 5);
        let p = Math.floor(Math.random() * 6);
        // 66566 세팅: 수요일 6교시(d=2, p=5)는 전담 배정에서도 회피
        if (d === 2 && p === 5) { attempts++; continue; }
        
        let slotKey = `${p}-${d}`;
        if (!schedule[cls][p][d].subject && !teacherOccupied[teacher.id].has(slotKey)) {
          schedule[cls][p][d] = {
            subject: subject, type: 'special', teacher: teacher.name, teacherId: teacher.id,
            location: getDefaultLocation(subject, d, p), id: `${cls}-${p}-${d}-special`
          };
          teacherOccupied[teacher.id].add(slotKey);
          assignedCount++;
        }
        attempts++;
      }
    });
  });

  // 2. 담임 채우기 (66566 반영)
  const defaultSubjects = getHomeroomSubjectPool(subjectPool);
  classNames.forEach(cls => {
    for(let p=0; p<6; p++) {
      for(let d=0; d<5; d++) {
        // [기본 66566 세팅] 수요일(2) 6교시(5)는 비워둠
        if (d === 2 && p === 5) {
          if (!schedule[cls][p][d].subject) {
            schedule[cls][p][d] = { subject: '', type: 'empty', id: `${cls}-${p}-${d}` };
          }
          continue;
        }
        if(!schedule[cls][p][d].subject) {
          schedule[cls][p][d] = { 
            subject: defaultSubjects[Math.floor(Math.random() * defaultSubjects.length)], 
            type: 'homeroom', id: `${cls}-${p}-${d}`
          };
        }
      }
    }
  });

  return schedule;
};

const createAllSchedules = (
  teachers = initialTeachers,
  classNames = createClassNames(DEFAULT_CLASS_COUNT),
  subjectPool = DEFAULT_SUBJECTS
) => {
  const base = generateInitialBaseSchedule(teachers, classNames, subjectPool);
  const allByWeek = {};
  WEEKS.forEach(week => {
    allByWeek[week] = JSON.parse(JSON.stringify(base));
  });
  return allByWeek;
};

const createTemplateCell = (className = '', location = '') => ({
  className,
  location
});

const createEmptyTeacherTemplate = () =>
  Array.from({ length: PERIODS.length }, () =>
    Array.from({ length: DAYS.length }, () => createTemplateCell())
  );

const normalizeSpecialTemplates = (teachers, templates = {}) => {
  const normalized = {};

  teachers.forEach((teacher) => {
    const template = createEmptyTeacherTemplate();
    const allowedClassNames = new Set(teacher.classes.map((num) => `${num}반`));
    const rawTemplate = templates?.[teacher.id];

    for (let p = 0; p < PERIODS.length; p++) {
      for (let d = 0; d < DAYS.length; d++) {
        const rawCell = rawTemplate?.[p]?.[d];
        let className = '';
        let location = '';

        if (typeof rawCell === 'number' || typeof rawCell === 'string') {
          const candidate = typeof rawCell === 'number' ? `${rawCell}반` : rawCell;
          className = candidate;
        } else if (rawCell && typeof rawCell === 'object') {
          const candidateRaw = rawCell.className ?? '';
          const candidate = typeof candidateRaw === 'number' ? `${candidateRaw}반` : candidateRaw;
          className = typeof candidate === 'string' ? candidate : '';
          location = typeof rawCell.location === 'string' ? rawCell.location : '';
        }

        if (!allowedClassNames.has(className)) {
          template[p][d] = createTemplateCell();
        } else {
          template[p][d] = createTemplateCell(className, location.trim());
        }
      }
    }

    normalized[teacher.id] = template;
  });

  return normalized;
};

const createHomeroomFallbackCell = (
  className,
  periodIndex,
  dayIndex,
  subjectPool = DEFAULT_SUBJECTS
) => {
  const homeroomSubjects = getHomeroomSubjectPool(subjectPool);
  return {
    subject: homeroomSubjects[(periodIndex + dayIndex) % homeroomSubjects.length],
    type: 'homeroom',
    forcedConflict: false,
    location: '',
    id: `${className}-${periodIndex}-${dayIndex}`
  };
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const createInitialStandardHours = (subjectPool = DEFAULT_SUBJECTS) => {
  const initial = {};
  normalizeSubjects(subjectPool).forEach((subject) => {
    initial[subject] = 0;
  });
  return initial;
};

const normalizeTeacherConfigsForSync = (
  sourceTeachers,
  fallbackTeachers = [],
  options = {}
) => {
  const classCount = normalizeClassCount(options.classCount, DEFAULT_CLASS_COUNT);
  const subjectPool = normalizeSubjects(options.subjectPool || DEFAULT_SUBJECTS);
  if (!Array.isArray(sourceTeachers)) return fallbackTeachers;

  const normalized = sourceTeachers
    .filter((teacher) => teacher && typeof teacher === 'object')
    .map((teacher, idx) => {
      const safeId = typeof teacher.id === 'string' && teacher.id.trim()
        ? teacher.id.trim()
        : `teacher-${idx + 1}`;
      const safeName = typeof teacher.name === 'string' && teacher.name.trim()
        ? teacher.name.trim()
        : `교사${idx + 1}`;
      const rawSubject = typeof teacher.subject === 'string' ? teacher.subject.trim() : '';
      const safeSubject = rawSubject && subjectPool.includes(rawSubject)
        ? rawSubject
        : (subjectPool[0] || '국어');
      const safeClasses = Array.isArray(teacher.classes)
        ? [...new Set(
          teacher.classes
            .map((cls) => Number(cls))
            .filter((num) => Number.isInteger(num) && num >= 1 && num <= classCount)
        )].sort((a, b) => a - b)
        : [];

      return {
        id: safeId,
        name: safeName,
        subject: safeSubject,
        classes: safeClasses
      };
    })
    .filter((teacher) => teacher.classes.length > 0);

  return normalized;
};

const normalizeStandardHoursForSync = (
  sourceStandardHours,
  fallbackStandardHours,
  subjectPool = DEFAULT_SUBJECTS
) => {
  const next = { ...fallbackStandardHours };
  if (!isPlainObject(sourceStandardHours)) return next;

  normalizeSubjects(subjectPool).forEach((subject) => {
    const raw = sourceStandardHours[subject];
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(value)) next[subject] = value;
  });

  return next;
};

const normalizeAllSchedulesForSync = (
  sourceAllSchedules,
  fallbackAllSchedules,
  classNames = createClassNames(DEFAULT_CLASS_COUNT),
  subjectPool = DEFAULT_SUBJECTS
) => {
  const next = {};

  WEEKS.forEach((weekName) => {
    const sourceWeek = isPlainObject(sourceAllSchedules?.[weekName]) ? sourceAllSchedules[weekName] : null;
    const fallbackWeek = isPlainObject(fallbackAllSchedules?.[weekName]) ? fallbackAllSchedules[weekName] : {};
    next[weekName] = {};

    classNames.forEach((className) => {
      const sourceGrid = Array.isArray(sourceWeek?.[className]) ? sourceWeek[className] : null;
      const fallbackGrid = Array.isArray(fallbackWeek?.[className]) ? fallbackWeek[className] : null;

      next[weekName][className] = Array.from({ length: PERIODS.length }, (_, pIdx) =>
        Array.from({ length: DAYS.length }, (_, dIdx) => {
          const fallbackCellRaw = fallbackGrid?.[pIdx]?.[dIdx];
          const fallbackCell = isPlainObject(fallbackCellRaw)
            ? { ...fallbackCellRaw }
            : createHomeroomFallbackCell(className, pIdx, dIdx, subjectPool);
          const rawCell = sourceGrid?.[pIdx]?.[dIdx];

          if (!isPlainObject(rawCell)) {
            return {
              ...fallbackCell,
              forcedConflict: Boolean(fallbackCell.forcedConflict)
            };
          }

          const subject = typeof rawCell.subject === 'string'
            ? rawCell.subject
            : (fallbackCell.subject || '');
          const inferredType = typeof rawCell.type === 'string'
            ? rawCell.type
            : (subject === '휴업일' ? 'holiday' : (rawCell.teacherId ? 'special' : (subject ? 'homeroom' : 'empty')));

          return {
            ...fallbackCell,
            ...rawCell,
            subject,
            type: inferredType,
            teacherId: rawCell.teacherId ?? null,
            teacher: typeof rawCell.teacher === 'string' ? rawCell.teacher : (fallbackCell.teacher || ''),
            location: typeof rawCell.location === 'string' ? rawCell.location : (fallbackCell.location || ''),
            forcedConflict: Boolean(rawCell.forcedConflict),
            id: typeof rawCell.id === 'string' ? rawCell.id : `${className}-${pIdx}-${dIdx}`
          };
        })
      );
    });
  });

  return next;
};

const normalizeClassConfigForSync = (payload, fallbackClassCount, fallbackSubjects) => {
  const rawClassCount = payload?.classConfig?.classCount ?? payload?.classCount;
  const rawSubjects = payload?.classConfig?.subjects ?? payload?.subjects;
  const classCount = normalizeClassCount(rawClassCount, fallbackClassCount);
  const subjects = normalizeSubjects(rawSubjects, fallbackSubjects);
  return {
    classCount,
    subjects
  };
};

const normalizeWeeklyNoticesForSync = (sourceWeeklyNotices, fallbackWeeklyNotices = {}) => {
  const source = isPlainObject(sourceWeeklyNotices) ? sourceWeeklyNotices : {};
  const fallback = isPlainObject(fallbackWeeklyNotices) ? fallbackWeeklyNotices : {};
  const next = {};

  WEEKS.forEach((weekName) => {
    const sourceValue = source[weekName];
    const fallbackValue = fallback[weekName];
    if (typeof sourceValue === 'string') {
      next[weekName] = sourceValue;
      return;
    }
    next[weekName] = typeof fallbackValue === 'string' ? fallbackValue : '';
  });

  return next;
};

const normalizePayloadForSync = (payload, fallbackSnapshot) => {
  if (!isPlainObject(payload) || !isPlainObject(fallbackSnapshot)) return null;

  const fallbackConfig = normalizeClassConfigForSync(
    fallbackSnapshot,
    DEFAULT_CLASS_COUNT,
    DEFAULT_SUBJECTS
  );
  const resolvedConfig = normalizeClassConfigForSync(
    payload,
    fallbackConfig.classCount,
    fallbackConfig.subjects
  );
  const classNames = createClassNames(resolvedConfig.classCount);
  const fallbackTeachers = normalizeTeacherConfigsForSync(
    fallbackSnapshot.teacherConfigs,
    initialTeachers,
    {
      classCount: resolvedConfig.classCount,
      subjectPool: resolvedConfig.subjects
    }
  );
  const teacherConfigs = normalizeTeacherConfigsForSync(payload.teacherConfigs, fallbackTeachers, {
    classCount: resolvedConfig.classCount,
    subjectPool: resolvedConfig.subjects
  });
  const allSchedules = normalizeAllSchedulesForSync(
    isPlainObject(payload.allSchedules) ? payload.allSchedules : fallbackSnapshot.allSchedules,
    fallbackSnapshot.allSchedules,
    classNames,
    resolvedConfig.subjects
  );
  const fallbackStandardHours = normalizeStandardHoursForSync(
    fallbackSnapshot.standardHours,
    createInitialStandardHours(resolvedConfig.subjects),
    resolvedConfig.subjects
  );
  const standardHours = normalizeStandardHoursForSync(
    payload.standardHours,
    fallbackStandardHours,
    resolvedConfig.subjects
  );
  const specialTemplates = normalizeSpecialTemplates(
    teacherConfigs,
    isPlainObject(payload.specialTemplates) ? payload.specialTemplates : fallbackSnapshot.specialTemplates
  );
  const changeLogs = Array.isArray(payload.changeLogs)
    ? payload.changeLogs
    : (Array.isArray(fallbackSnapshot.changeLogs) ? fallbackSnapshot.changeLogs : []);
  const weeklyNotices = normalizeWeeklyNoticesForSync(
    payload.weeklyNotices,
    fallbackSnapshot.weeklyNotices
  );

  return {
    allSchedules,
    standardHours,
    teacherConfigs,
    specialTemplates,
    changeLogs,
    weeklyNotices,
    classCount: resolvedConfig.classCount,
    subjects: resolvedConfig.subjects
  };
};

const hasRemoteSchedulePayload = (payload) =>
  isPlainObject(payload?.allSchedules) && Object.keys(payload.allSchedules).length > 0;

const SHARED_STATE_ROW_ID = 'main';
const SYNC_DEBOUNCE_MS = 1200;
const MAX_UNDO_HISTORY = 50;
const MAX_CHANGE_LOGS = 400;

const cloneSchedulesForHistory = (schedules) => {
  try {
    return JSON.parse(JSON.stringify(schedules));
  } catch (_error) {
    return schedules;
  }
};

// --- [4] 메인 컴포넌트 ---
export default function TimetableApp() {
  const [classCount, setClassCount] = useState(DEFAULT_CLASS_COUNT);
  const [subjects, setSubjects] = useState(() => normalizeSubjects(DEFAULT_SUBJECTS));
  const [classCountInput, setClassCountInput] = useState(String(DEFAULT_CLASS_COUNT));
  const [subjectsInputText, setSubjectsInputText] = useState(() => normalizeSubjects(DEFAULT_SUBJECTS).join('\n'));
  const classNames = useMemo(() => createClassNames(classCount), [classCount]);
  const allSubjects = useMemo(() => normalizeSubjects(subjects, DEFAULT_SUBJECTS), [subjects]);
  const subjectSelectOptions = useMemo(() => buildSubjectSelectOptions(allSubjects), [allSubjects]);
  const [teacherConfigs, setTeacherConfigs] = useState(initialTeachers);
  const [allSchedules, setAllSchedules] = useState(() =>
    createAllSchedules(initialTeachers, createClassNames(DEFAULT_CLASS_COUNT), normalizeSubjects(DEFAULT_SUBJECTS))
  );
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [changeLogs, setChangeLogs] = useState([]);
  const [weeklyNotices, setWeeklyNotices] = useState(() => normalizeWeeklyNoticesForSync({}));
  const [showChangeSummary, setShowChangeSummary] = useState(false);
  const [baselineReady, setBaselineReady] = useState(false);
  const [pendingResolution, setPendingResolution] = useState(null);

  // 기준 시수 상태 관리
  const [standardHours, setStandardHours] = useState(() => createInitialStandardHours(normalizeSubjects(DEFAULT_SUBJECTS)));

  const [viewMode, setViewMode] = useState('weekly'); // weekly, monthly, class_summary, teacher_summary, settings
  const [weeklyLayoutMode, setWeeklyLayoutMode] = useState('single'); // single, all
  const [monthlyLayoutMode, setMonthlyLayoutMode] = useState('class_weekly'); // matrix, class_weekly
  const [compactTextScalePercent, setCompactTextScalePercent] = useState(100);
  const [monthlyTextScalePercent, setMonthlyTextScalePercent] = useState(100);
  const [holidayWeekIndex, setHolidayWeekIndex] = useState(0);
  const [holidayDayIndices, setHolidayDayIndices] = useState([0]);
  const [isTopHeaderHidden, setIsTopHeaderHidden] = useState(false);
  const [isSpacePanMode, setIsSpacePanMode] = useState(false);
  const [cellSubjectContextMenu, setCellSubjectContextMenu] = useState(null);
  const [contextMenuSubjectValue, setContextMenuSubjectValue] = useState('');
  const [contextMenuInitialSubjectValue, setContextMenuInitialSubjectValue] = useState('');
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [currentClass, setCurrentClass] = useState('1반');
  const [selectedCell, setSelectedCell] = useState(null);
  const [quickEditorAction, setQuickEditorAction] = useState('subject');
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0);
  const [highlightTeacherIds, setHighlightTeacherIds] = useState([]);
  const [toast, setToast] = useState({ show: false, message: '', type: '', actionType: null, duration: 3000 });
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [teacherForm, setTeacherForm] = useState({
    name: '',
    subject: '체육',
    classes: []
  });
  const [specialTemplates, setSpecialTemplates] = useState(() => normalizeSpecialTemplates(initialTeachers));
  const [selectedTemplateTeacherId, setSelectedTemplateTeacherId] = useState(initialTeachers[0]?.id || '');
  const [syncStatus, setSyncStatus] = useState(
    isSupabaseConfigured ? '초기 동기화 중...' : '로컬 모드 (동기화 비활성)'
  );
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [lastUpdatedBy, setLastUpdatedBy] = useState(null);
  const isRemoteReadyRef = useRef(!isSupabaseConfigured);
  const isApplyingRemoteRef = useRef(false);
  const lastSyncedPayloadRef = useRef('');
  const saveTimerRef = useRef(null);
  const clientIdRef = useRef(`client-${Math.random().toString(36).slice(2, 10)}`);
  const panDragRef = useRef(null);
  const contextMenuRef = useRef(null);
  const baselineSchedulesRef = useRef(null);
  
  const currentWeekName = WEEKS[currentWeekIndex];
  const holidayTargetWeekName = WEEKS[holidayWeekIndex] || WEEKS[0];
  const selectedHolidayDayIndices = useMemo(() => {
    const normalized = [...new Set(
      (holidayDayIndices || [])
        .map((idx) => Number(idx))
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < DAYS.length)
    )].sort((a, b) => a - b);
    return normalized.length > 0 ? normalized : [0];
  }, [holidayDayIndices]);
  const holidayTargetDayLabels = selectedHolidayDayIndices
    .map((idx) => getDatesForWeek(holidayTargetWeekName)?.[idx] || DAYS[idx])
    .join(', ');
  const contextViewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const contextViewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
  const contextMenuLeft = cellSubjectContextMenu
    ? Math.max(8, Math.min(cellSubjectContextMenu.x, contextViewportWidth - 280))
    : 0;
  const contextMenuTop = cellSubjectContextMenu
    ? Math.max(8, Math.min(cellSubjectContextMenu.y, contextViewportHeight - 240))
    : 0;
  const schedules = allSchedules[currentWeekName] || {};
  const normalizedSpecialTemplates = useMemo(
    () => normalizeSpecialTemplates(teacherConfigs, specialTemplates),
    [teacherConfigs, specialTemplates]
  );
  const selectedTemplateTeacher = teacherConfigs.find((teacher) => teacher.id === selectedTemplateTeacherId) || null;
  const selectedTeacherTemplate = selectedTemplateTeacher
    ? (normalizedSpecialTemplates[selectedTemplateTeacher.id] || createEmptyTeacherTemplate())
    : createEmptyTeacherTemplate();
  const isWeeklyAllView = viewMode === 'weekly' && weeklyLayoutMode === 'all';
  const isMonthlyClassWeeklyView = viewMode === 'monthly' && monthlyLayoutMode === 'class_weekly';
  const isWideContentMode = isWeeklyAllView || isMonthlyClassWeeklyView;
  const isQuickEditorVisible = Boolean(selectedCell && (viewMode === 'weekly' || viewMode === 'monthly'));
  const isSelectedHolidayCell = isHolidayCell(selectedCell);
  const liveSelectedCell = selectedCell
    ? allSchedules?.[selectedCell.weekName]?.[selectedCell.className]?.[selectedCell.p]?.[selectedCell.d]
    : null;
  const selectedCellDateText = selectedCell
    ? (getDatesForWeek(selectedCell.weekName)?.[selectedCell.d] || DAYS[selectedCell.d])
    : '';
  const quickEditorCurrentCell = liveSelectedCell || selectedCell;
  const selectedSubjectOptionValue = selectedCell ? getSubjectSelectionValueForCell(selectedCell) : '';
  const hasTeacherHighlightFilter = highlightTeacherIds.length > 0;
  const teacherClassNameSetMap = useMemo(() => {
    const map = {};
    teacherConfigs.forEach((teacher) => {
      map[teacher.id] = new Set((teacher.classes || []).map((num) => `${num}반`));
    });
    return map;
  }, [teacherConfigs]);
  const templateExpectationMap = useMemo(() => {
    const map = {};
    classNames.forEach((className) => {
      map[className] = Array.from({ length: PERIODS.length }, () =>
        Array.from({ length: DAYS.length }, () => null)
      );
    });

    teacherConfigs.forEach((teacher) => {
      const template = normalizedSpecialTemplates[teacher.id] || createEmptyTeacherTemplate();
      for (let p = 0; p < PERIODS.length; p++) {
        for (let d = 0; d < DAYS.length; d++) {
          const templateCell = template[p][d] || createTemplateCell();
          const className = templateCell.className;
          if (!className || !map[className]) continue;

          const expected = {
            teacherId: teacher.id,
            teacher: teacher.name,
            subject: teacher.subject,
            location: ((templateCell.location || '').trim() || getDefaultLocation(teacher.subject, d, p) || '').trim()
          };

          const prev = map[className][p][d];
          if (!prev) {
            map[className][p][d] = expected;
          } else if (Array.isArray(prev)) {
            map[className][p][d] = [...prev, expected];
          } else {
            map[className][p][d] = [prev, expected];
          }
        }
      }
    });

    return map;
  }, [teacherConfigs, normalizedSpecialTemplates, classNames]);
  const hasConfiguredSpecialTemplate = useMemo(
    () =>
      teacherConfigs.some((teacher) =>
        (normalizedSpecialTemplates[teacher.id] || []).some((row) =>
          Array.isArray(row) && row.some((cell) => typeof cell?.className === 'string' && cell.className.trim() !== '')
        )
      ),
    [teacherConfigs, normalizedSpecialTemplates]
  );

  useEffect(() => {
    if (classNames.length === 0) return;
    if (!classNames.includes(currentClass)) {
      setCurrentClass(classNames[0]);
    }
  }, [classNames, currentClass]);

  useEffect(() => {
    setClassCountInput(String(classCount));
  }, [classCount]);

  useEffect(() => {
    setSubjectsInputText(allSubjects.join('\n'));
  }, [allSubjects]);

  useEffect(() => {
    if (!toast.show) return undefined;
    const timer = setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false, actionType: null }));
    }, toast.duration || 3000);
    return () => clearTimeout(timer);
  }, [toast.show, toast.duration]);

  const showNotification = (message, type = 'error', options = {}) =>
    setToast({
      show: true,
      message,
      type,
      actionType: options.actionType || null,
      duration: options.duration ?? 3000
    });

  const formatSlotLabel = (periodIndex, dayIndex) => `${DAYS[dayIndex]} ${PERIODS[periodIndex]}교시`;
  const getCellLabel = (cell) => (cell?.subject ? cell.subject : '빈칸');
  const formatCellAddress = (weekName, className, periodIndex, dayIndex) =>
    `${className} ${formatSlotLabel(periodIndex, dayIndex)}${weekName ? ` [${weekName}]` : ''}`;

  const createChangeLogEntry = ({ type, summary, announcementText, weekKeys }) => ({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    summary,
    announcementText: announcementText || summary,
    weekKeys: Array.from(new Set((weekKeys || []).filter(Boolean))),
    updatedBy: clientIdRef.current,
    updatedAt: new Date().toISOString()
  });

  const appendChangeLog = (entry) => {
    if (!entry) return;
    setChangeLogs((prev) => [entry, ...prev].slice(0, MAX_CHANGE_LOGS));
  };

  const applyScheduleChangeWithHistory = ({ nextAllSchedules, nextSelectedCell, changeLogEntry }) => {
    const previousSnapshot = cloneSchedulesForHistory(allSchedules);
    setUndoStack((prev) => [...prev.slice(-(MAX_UNDO_HISTORY - 1)), previousSnapshot]);
    setRedoStack([]);
    setAllSchedules(nextAllSchedules);
    if (nextSelectedCell !== undefined) {
      setSelectedCell(nextSelectedCell);
    }
    appendChangeLog(changeLogEntry);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) {
      showNotification('되돌릴 변경이 없습니다.', 'error');
      return;
    }

    const previousSchedules = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [
      ...prev.slice(-(MAX_UNDO_HISTORY - 1)),
      cloneSchedulesForHistory(allSchedules)
    ]);
    setAllSchedules(cloneSchedulesForHistory(previousSchedules));
    setSelectedCell(null);
    appendChangeLog(
      createChangeLogEntry({
        type: 'undo',
        summary: '되돌리기 실행',
        announcementText: '되돌리기 실행: 직전 변경 취소',
        weekKeys: [currentWeekName]
      })
    );
    showNotification('직전 변경을 되돌렸습니다.', 'success', { actionType: 'redo', duration: 5500 });
  };

  const handleRedo = () => {
    if (redoStack.length === 0) {
      showNotification('다시 적용할 변경이 없습니다.', 'error');
      return;
    }

    const nextSchedules = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [
      ...prev.slice(-(MAX_UNDO_HISTORY - 1)),
      cloneSchedulesForHistory(allSchedules)
    ]);
    setAllSchedules(cloneSchedulesForHistory(nextSchedules));
    setSelectedCell(null);
    appendChangeLog(
      createChangeLogEntry({
        type: 'redo',
        summary: '다시하기 실행',
        announcementText: '다시하기 실행: 취소된 변경 재적용',
        weekKeys: [currentWeekName]
      })
    );
    showNotification('취소된 변경을 다시 적용했습니다.', 'success', { actionType: 'undo', duration: 5500 });
  };

  const currentWeekNotice = weeklyNotices[currentWeekName] || '';

  const isExpectedSpecialMatch = (actualCell, expectedEntry) => {
    if (!isSpecialLikeCell(actualCell) || !expectedEntry) return false;
    const actualTeacherId = typeof actualCell.teacherId === 'string' ? actualCell.teacherId : '';
    const expectedTeacherId = typeof expectedEntry.teacherId === 'string' ? expectedEntry.teacherId : '';
    const actualTeacher = typeof actualCell.teacher === 'string' ? actualCell.teacher.trim() : '';
    const expectedTeacher = typeof expectedEntry.teacher === 'string' ? expectedEntry.teacher.trim() : '';
    const actualSubject = typeof actualCell.subject === 'string' ? actualCell.subject.trim() : '';
    const expectedSubject = typeof expectedEntry.subject === 'string' ? expectedEntry.subject.trim() : '';

    const teacherMatched = actualTeacherId && expectedTeacherId
      ? actualTeacherId === expectedTeacherId
      : actualTeacher === expectedTeacher;

    return teacherMatched && actualSubject === expectedSubject;
  };

  const formatExpectedSpecialLabel = (expectedEntries) => {
    if (!Array.isArray(expectedEntries) || expectedEntries.length === 0) return '전담 없음';
    return expectedEntries
      .map((entry) => `${entry.subject || '전담'}${entry.teacher ? `(${entry.teacher})` : ''}`)
      .join(' / ');
  };

  const formatActualSpecialLabel = (actualCell) => {
    if (!isSpecialLikeCell(actualCell)) return '전담 해제';
    const subject = (actualCell.subject || '').trim() || '전담';
    const teacher = (actualCell.teacher || '').trim();
    return teacher ? `${subject}(${teacher})` : subject;
  };

  const currentWeekSpecialChangeItems = useMemo(() => {
    const weekSchedule = allSchedules?.[currentWeekName];
    if (!weekSchedule) return [];
    if (!hasConfiguredSpecialTemplate && !baselineSchedulesRef.current) return [];

    const items = [];

    classNames.forEach((className) => {
      for (let p = 0; p < PERIODS.length; p++) {
        for (let d = 0; d < DAYS.length; d++) {
          let expectedEntries = [];
          if (hasConfiguredSpecialTemplate) {
            const expectedRaw = templateExpectationMap[className]?.[p]?.[d] ?? null;
            expectedEntries = Array.isArray(expectedRaw)
              ? expectedRaw
              : (expectedRaw ? [expectedRaw] : []);
          } else {
            const baselineCell = baselineSchedulesRef.current?.[currentWeekName]?.[className]?.[p]?.[d];
            expectedEntries = isSpecialLikeCell(baselineCell)
              ? [{
                teacherId: baselineCell.teacherId || '',
                teacher: baselineCell.teacher || '',
                subject: baselineCell.subject || '',
                location: (baselineCell.location || '').trim()
              }]
              : [];
          }
          const actualCell = weekSchedule?.[className]?.[p]?.[d];

          if (!isSpecialLikeCell(actualCell) && expectedEntries.length === 0) continue;
          // 요청사항: 휴업일 관련 변경은 "변경사항" 목록에서 제외한다.
          if (actualCell?.type === 'holiday' || actualCell?.subject === '휴업일') continue;

          const expectedMatched = expectedEntries.some((expected) => isExpectedSpecialMatch(actualCell, expected));
          const hasDifference = expectedEntries.length > 0
            ? !expectedMatched
            : isSpecialLikeCell(actualCell);

          if (!hasDifference) continue;

          items.push({
            id: `${className}-${p}-${d}`,
            summary: `${className} ${DAYS[d]}요일 ${PERIODS[p]}교시: ${formatExpectedSpecialLabel(expectedEntries)} → ${formatActualSpecialLabel(actualCell)}`,
            weekName: currentWeekName
          });
        }
      }
    });

    return items;
  }, [allSchedules, currentWeekName, templateExpectationMap, hasConfiguredSpecialTemplate, baselineReady, classNames]);

  const quickEditorActionGuideText = useMemo(() => {
    if (quickEditorAction === 'swap') {
      return '교환 모드: 다른 수업 칸을 클릭하면 서로 바뀝니다.';
    }
    if (quickEditorAction === 'move') {
      return '이동 모드: 빈칸을 클릭하면 해당 칸으로 이동합니다.';
    }
    return '과목 변경 모드: 아래에서 과목/장소를 바로 수정하세요.';
  }, [quickEditorAction]);

  const copyCurrentWeekChangeSummary = async () => {
    const noticeText = currentWeekNotice.trim();
    const changeLines = currentWeekSpecialChangeItems.map((item) => item.summary);
    const text = [
      `[${currentWeekName}] 공지사항`,
      noticeText || '공지사항 없음',
      '',
      `[${currentWeekName}] 전담 변경사항`,
      ...(changeLines.length > 0 ? changeLines : ['전담 변경사항 없음'])
    ].join('\n');

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showNotification('공지 및 변경사항을 복사했습니다.', 'success');
    } catch (_error) {
      showNotification('클립보드 복사에 실패했습니다.', 'error');
    }
  };

  useEffect(() => {
    const isTypingLikeElement = (el) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return true;
      return el.isContentEditable;
    };

    const handleUndoRedoKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isTypingLikeElement(e.target) || isTypingLikeElement(document.activeElement)) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleUndoRedoKey);
    return () => window.removeEventListener('keydown', handleUndoRedoKey);
  }, [undoStack, redoStack, allSchedules, currentWeekName]);

  useEffect(() => {
    if (!isQuickEditorVisible) {
      setQuickEditorAction('subject');
    }
  }, [isQuickEditorVisible]);

  useEffect(() => {
    if (baselineSchedulesRef.current) return;
    if (isSupabaseConfigured && !isRemoteReadyRef.current) return;
    baselineSchedulesRef.current = cloneSchedulesForHistory(allSchedules);
    setBaselineReady(true);
  }, [allSchedules, syncStatus]);

  useEffect(() => {
    const stopPanDrag = () => {
      const dragging = panDragRef.current;
      if (!dragging) return;
      dragging.el.style.cursor = '';
      dragging.el.style.userSelect = '';
      panDragRef.current = null;
    };

    const isTypingLikeElement = (el) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return true;
      return el.isContentEditable;
    };

    const handleKeyDown = (e) => {
      if (e.code !== 'Space') return;
      if (isTypingLikeElement(e.target) || isTypingLikeElement(document.activeElement)) return;
      setIsSpacePanMode(true);
      e.preventDefault();
    };

    const handleKeyUp = (e) => {
      if (e.code !== 'Space') return;
      setIsSpacePanMode(false);
      stopPanDrag();
    };

    const handleBlur = () => {
      setIsSpacePanMode(false);
      stopPanDrag();
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    const stopPanDrag = () => {
      const dragging = panDragRef.current;
      if (!dragging) return;
      dragging.el.style.cursor = '';
      dragging.el.style.userSelect = '';
      panDragRef.current = null;
    };

    const handleMouseMove = (e) => {
      const dragging = panDragRef.current;
      if (!dragging) return;
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      dragging.el.scrollLeft = dragging.startScrollLeft - dx;
      dragging.el.scrollTop = dragging.startScrollTop - dy;
      e.preventDefault();
    };

    const handleMouseUp = () => stopPanDrag();

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!cellSubjectContextMenu) return undefined;

    const handleMouseDown = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        applyContextMenuSubjectChange();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeCellSubjectContextMenu();
    };

    const handleScroll = () => applyContextMenuSubjectChange();

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [cellSubjectContextMenu, contextMenuSubjectValue, contextMenuInitialSubjectValue]);

  const teacherAssignableSubjects = useMemo(
    () => allSubjects.filter((subject) => subject !== '휴업일'),
    [allSubjects]
  );

  const resetTeacherForm = () => {
    setEditingTeacherId(null);
    setTeacherForm({
      name: '',
      subject: teacherAssignableSubjects.includes('체육') ? '체육' : (teacherAssignableSubjects[0] || ''),
      classes: []
    });
  };

  useEffect(() => {
    setTeacherForm((prev) => {
      const normalizedClasses = [...new Set(
        (prev.classes || [])
          .map((num) => Number(num))
          .filter((num) => Number.isInteger(num) && num >= 1 && num <= classCount)
      )].sort((a, b) => a - b);
      const normalizedSubject = teacherAssignableSubjects.includes(prev.subject)
        ? prev.subject
        : (teacherAssignableSubjects.includes('체육') ? '체육' : (teacherAssignableSubjects[0] || ''));

      const classesUnchanged =
        normalizedClasses.length === (prev.classes || []).length &&
        normalizedClasses.every((value, index) => value === prev.classes[index]);
      if (classesUnchanged && normalizedSubject === prev.subject) return prev;

      return {
        ...prev,
        subject: normalizedSubject,
        classes: normalizedClasses
      };
    });
  }, [teacherAssignableSubjects, classCount]);

  const toggleTeacherClassSelection = (classNum) => {
    setTeacherForm((prev) => {
      const hasClass = prev.classes.includes(classNum);
      const nextClasses = hasClass
        ? prev.classes.filter(num => num !== classNum)
        : [...prev.classes, classNum];
      return {
        ...prev,
        classes: nextClasses.sort((a, b) => a - b)
      };
    });
  };

  const startTeacherEdit = (teacher) => {
    setEditingTeacherId(teacher.id);
    setTeacherForm({
      name: teacher.name,
      subject: teacher.subject,
      classes: [...teacher.classes].sort((a, b) => a - b)
    });
  };

  const saveTeacherConfig = () => {
    const trimmedName = teacherForm.name.trim();
    const selectedClasses = [...new Set(
      teacherForm.classes
        .map((num) => Number(num))
        .filter((num) => Number.isInteger(num) && num >= 1 && num <= classCount)
    )].sort((a, b) => a - b);

    if (!trimmedName) {
      showNotification('교사명을 입력해주세요.', 'error');
      return;
    }
    if (!teacherForm.subject) {
      showNotification('담당 과목을 선택해주세요.', 'error');
      return;
    }
    if (selectedClasses.length === 0) {
      showNotification('담당 학급을 1개 이상 선택해주세요.', 'error');
      return;
    }

    if (editingTeacherId) {
      setTeacherConfigs((prev) =>
        prev.map((teacher) =>
          teacher.id === editingTeacherId
            ? { ...teacher, name: trimmedName, subject: teacherForm.subject, classes: selectedClasses }
            : teacher
        )
      );
      showNotification('전담 교사 정보가 수정되었습니다.', 'success');
    } else {
      const newTeacher = {
        id: `t${Date.now().toString(36)}`,
        name: trimmedName,
        subject: teacherForm.subject,
        classes: selectedClasses
      };
      setTeacherConfigs((prev) => [...prev, newTeacher]);
      showNotification('전담 교사가 추가되었습니다.', 'success');
    }

    resetTeacherForm();
  };

  const deleteTeacherConfig = (teacher) => {
    const ok = window.confirm(
      `${teacher.name} 선생님을 삭제하시겠습니까?\n\n삭제 후 시간표에 완전히 반영하려면 '전체 초기화 (새로 배정)'를 실행하세요.`
    );
    if (!ok) return;

    setTeacherConfigs((prev) => prev.filter((item) => item.id !== teacher.id));
    if (editingTeacherId === teacher.id) resetTeacherForm();
    setHighlightTeacherIds((prev) => prev.filter((id) => id !== teacher.id));
    showNotification('전담 교사가 삭제되었습니다.', 'success');
  };

  const toggleHighlightTeacher = (teacherId) => {
    setHighlightTeacherIds((prev) => {
      if (prev.includes(teacherId)) return prev.filter((id) => id !== teacherId);
      return [...prev, teacherId];
    });
  };

  const applyClassAndSubjectSettings = () => {
    const nextClassCount = normalizeClassCount(classCountInput, classCount);
    const nextSubjects = normalizeSubjects(subjectsInputText, allSubjects);
    const nextClassNames = createClassNames(nextClassCount);

    const isClassCountChanged = nextClassCount !== classCount;
    const isSubjectsChanged = JSON.stringify(nextSubjects) !== JSON.stringify(allSubjects);
    if (!isClassCountChanged && !isSubjectsChanged) {
      showNotification('변경된 설정이 없습니다.', 'info');
      return;
    }

    if (isClassCountChanged && nextClassCount < classCount) {
      const confirmShrink = window.confirm(
        `학급 수를 ${classCount}개에서 ${nextClassCount}개로 줄이면 상위 학급 데이터가 제외될 수 있습니다. 계속할까요?`
      );
      if (!confirmShrink) return;
    }

    const nextTeachers = normalizeTeacherConfigsForSync(teacherConfigs, [], {
      classCount: nextClassCount,
      subjectPool: nextSubjects
    });
    const nextAllSchedules = normalizeAllSchedulesForSync(
      allSchedules,
      createAllSchedules([], nextClassNames, nextSubjects),
      nextClassNames,
      nextSubjects
    );
    const nextStandardHours = normalizeStandardHoursForSync(
      standardHours,
      createInitialStandardHours(nextSubjects),
      nextSubjects
    );
    const nextSpecialTemplates = normalizeSpecialTemplates(nextTeachers, specialTemplates);

    const nextSelectedCell =
      selectedCell && nextClassNames.includes(selectedCell.className)
        ? selectedCell
        : null;

    setClassCount(nextClassCount);
    setSubjects(nextSubjects);
    setTeacherConfigs(nextTeachers);
    setSpecialTemplates(nextSpecialTemplates);
    setStandardHours(nextStandardHours);
    setHighlightTeacherIds((prev) => prev.filter((id) => nextTeachers.some((teacher) => teacher.id === id)));
    setPendingResolution(null);
    if (!nextClassNames.includes(currentClass)) {
      setCurrentClass(nextClassNames[0]);
    }
    if (selectedTemplateTeacherId && !nextTeachers.some((teacher) => teacher.id === selectedTemplateTeacherId)) {
      setSelectedTemplateTeacherId(nextTeachers[0]?.id || '');
    }

    applyScheduleChangeWithHistory({
      nextAllSchedules,
      nextSelectedCell,
      changeLogEntry: createChangeLogEntry({
        type: 'config_update',
        summary: `기본 설정 변경: 학급 ${nextClassCount}개, 과목 ${nextSubjects.length}개`,
        announcementText: `기본 설정 변경: 학급 ${nextClassCount}개 / 과목 ${nextSubjects.join(', ')}`,
        weekKeys: [currentWeekName]
      })
    });

    showNotification('학급 수/과목 설정을 적용했습니다.', 'success', { actionType: 'undo', duration: 5500 });
  };

  const clearAllSpecialConfigurations = () => {
    const ok = window.confirm(
      '전담 교사, 전담 템플릿, 전담 하이라이트를 모두 삭제할까요?\n기존 시간표는 유지됩니다.'
    );
    if (!ok) return;

    setTeacherConfigs([]);
    setSpecialTemplates({});
    setSelectedTemplateTeacherId('');
    setHighlightTeacherIds([]);
    setPendingResolution(null);
    resetTeacherForm();
    showNotification('전담 교사/템플릿 설정을 모두 삭제했습니다.', 'success');
  };

  useEffect(() => {
    setSpecialTemplates((prev) => normalizeSpecialTemplates(teacherConfigs, prev));
    setSelectedTemplateTeacherId((prev) => {
      if (teacherConfigs.some((teacher) => teacher.id === prev)) return prev;
      return teacherConfigs[0]?.id || '';
    });
  }, [teacherConfigs]);

  const updateTemplateCell = (teacherId, periodIndex, dayIndex, className) => {
    setSpecialTemplates((prev) => {
      const next = normalizeSpecialTemplates(teacherConfigs, prev);
      if (!next[teacherId]) next[teacherId] = createEmptyTeacherTemplate();
      const previousCell = next[teacherId][periodIndex][dayIndex] || createTemplateCell();
      next[teacherId][periodIndex][dayIndex] = createTemplateCell(
        className,
        className ? previousCell.location : ''
      );
      return next;
    });
  };

  const updateTemplateLocation = (teacherId, periodIndex, dayIndex, location) => {
    setSpecialTemplates((prev) => {
      const next = normalizeSpecialTemplates(teacherConfigs, prev);
      if (!next[teacherId]) next[teacherId] = createEmptyTeacherTemplate();
      const previousCell = next[teacherId][periodIndex][dayIndex] || createTemplateCell();
      next[teacherId][periodIndex][dayIndex] = createTemplateCell(previousCell.className, location);
      return next;
    });
  };

  const clearTeacherTemplate = (teacherId) => {
    setSpecialTemplates((prev) => ({
      ...normalizeSpecialTemplates(teacherConfigs, prev),
      [teacherId]: createEmptyTeacherTemplate()
    }));
  };

  const applySpecialTemplateToWeeks = (targetWeeks) => {
    if (teacherConfigs.length === 0) {
      showNotification('전담 교사가 없습니다. 먼저 전담 교사를 등록해주세요.', 'error');
      return;
    }

    const normalizedTemplates = normalizeSpecialTemplates(teacherConfigs, specialTemplates);
    const newAllSchedules = { ...allSchedules };

    for (const weekName of targetWeeks) {
      const sourceWeek = newAllSchedules[weekName];
      if (!sourceWeek) continue;

      const weekSchedule = JSON.parse(JSON.stringify(sourceWeek));

      classNames.forEach((className) => {
        for (let p = 0; p < PERIODS.length; p++) {
          for (let d = 0; d < DAYS.length; d++) {
            if (weekSchedule[className][p][d]?.type === 'special') {
              weekSchedule[className][p][d] = createHomeroomFallbackCell(className, p, d);
            }
          }
        }
      });

      for (const teacher of teacherConfigs) {
        const teacherTemplate = normalizedTemplates[teacher.id] || createEmptyTeacherTemplate();
        const allowedClassNames = new Set(teacher.classes.map((num) => `${num}반`));

        for (let p = 0; p < PERIODS.length; p++) {
          for (let d = 0; d < DAYS.length; d++) {
            const templateCell = teacherTemplate[p][d] || createTemplateCell();
            const targetClass = templateCell.className;
            if (!targetClass) continue;

            if (!allowedClassNames.has(targetClass)) {
              showNotification(`[${teacher.name}] ${targetClass}은 담당 학급이 아닙니다.`, 'error');
              return;
            }

            if (!weekSchedule[targetClass]?.[p]?.[d]) continue;

            if (weekSchedule[targetClass][p][d].type === 'special') {
              showNotification(`[${weekName}] ${DAYS[d]} ${PERIODS[p]}교시에 ${targetClass} 중복 전담 배정입니다.`, 'error');
              return;
            }

            weekSchedule[targetClass][p][d] = {
              subject: teacher.subject,
              type: 'special',
              teacher: teacher.name,
              teacherId: teacher.id,
              forcedConflict: false,
              location: (templateCell.location || '').trim() || getDefaultLocation(teacher.subject, d, p),
              id: `${targetClass}-${p}-${d}-special`
            };
          }
        }
      }

      newAllSchedules[weekName] = weekSchedule;
    }

    setSpecialTemplates(normalizedTemplates);
    applyScheduleChangeWithHistory({
      nextAllSchedules: newAllSchedules,
      nextSelectedCell: null,
      changeLogEntry: createChangeLogEntry({
        type: 'template_apply',
        summary: targetWeeks.length === 1
          ? `[${targetWeeks[0]}] 전담 시간표 템플릿 전체 학급 배정`
          : '모든 주차 전담 시간표 템플릿 전체 학급 배정',
        announcementText: targetWeeks.length === 1
          ? `${targetWeeks[0]}: 전담 시간표 템플릿을 전체 학급에 배정`
          : '모든 주차: 전담 시간표 템플릿을 전체 학급에 배정',
        weekKeys: targetWeeks
      })
    });
    showNotification(
      targetWeeks.length === 1
        ? `전담 시간표를 [${targetWeeks[0]}] 전체 학급에 배정했습니다.`
        : '전담 시간표를 모든 주차 전체 학급에 배정했습니다.',
      'success',
      { actionType: 'undo', duration: 5500 }
    );
  };

  const applySpecialTemplateToCurrentWeek = () => {
    const ok = window.confirm(`현재 주차 [${currentWeekName}]에 전담 시간표 템플릿을 전체 학급에 배정하시겠습니까?`);
    if (!ok) return;
    applySpecialTemplateToWeeks([currentWeekName]);
  };

  const applySpecialTemplateToAllWeeks = () => {
    const ok = window.confirm('모든 주차에 전담 시간표 템플릿을 일괄 배정하시겠습니까? 기존 전담 배정은 덮어써집니다.');
    if (!ok) return;
    applySpecialTemplateToWeeks(WEEKS);
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;

    let isMounted = true;
    let retryTimer = null;

    const getFallbackSnapshot = () => ({
      classCount,
      subjects: allSubjects,
      classConfig: {
        classCount,
        subjects: allSubjects
      },
      allSchedules,
      standardHours,
      teacherConfigs,
      specialTemplates: normalizeSpecialTemplates(teacherConfigs, specialTemplates),
      changeLogs,
      weeklyNotices
    });

    const applyRemotePayload = (payload, syncedAt, updatedBy, fallbackSnapshot = getFallbackSnapshot()) => {
      const normalizedPayload = normalizePayloadForSync(payload, fallbackSnapshot);
      if (!normalizedPayload) return false;

      const payloadForSync = {
        classCount: normalizedPayload.classCount,
        subjects: normalizedPayload.subjects,
        classConfig: {
          classCount: normalizedPayload.classCount,
          subjects: normalizedPayload.subjects
        },
        allSchedules: normalizedPayload.allSchedules,
        standardHours: normalizedPayload.standardHours,
        teacherConfigs: normalizedPayload.teacherConfigs,
        specialTemplates: normalizedPayload.specialTemplates,
        changeLogs: normalizedPayload.changeLogs,
        weeklyNotices: normalizedPayload.weeklyNotices
      };

      isApplyingRemoteRef.current = true;
      const nextRemoteClassNames = createClassNames(payloadForSync.classCount);
      setClassCount(payloadForSync.classCount);
      setSubjects(payloadForSync.subjects);
      setAllSchedules(payloadForSync.allSchedules);
      setCurrentClass((prev) => (nextRemoteClassNames.includes(prev) ? prev : (nextRemoteClassNames[0] || '1반')));
      setSelectedCell(null);
      setStandardHours(payloadForSync.standardHours);
      setTeacherConfigs(payloadForSync.teacherConfigs);
      setSpecialTemplates(payloadForSync.specialTemplates);
      setChangeLogs(Array.isArray(payloadForSync.changeLogs) ? payloadForSync.changeLogs : []);
      setWeeklyNotices(normalizeWeeklyNoticesForSync(payloadForSync.weeklyNotices));
      lastSyncedPayloadRef.current = JSON.stringify(payloadForSync);
      setLastSyncedAt(syncedAt || new Date().toISOString());
      setLastUpdatedBy(updatedBy || null);
      setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 0);
      return true;
    };

    const ensureInitialState = async () => {
      const { data, error } = await supabase
        .from('timetable_state')
        .select('payload, updated_at, updated_by')
        .eq('id', SHARED_STATE_ROW_ID)
        .maybeSingle();

      if (!isMounted) return;

      if (error) {
        setSyncStatus('동기화 오류 (초기 조회 실패, 재시도 중)');
        isRemoteReadyRef.current = false;
        retryTimer = setTimeout(() => {
          if (isMounted) ensureInitialState();
        }, 5000);
        return;
      }

      const fallbackSnapshot = getFallbackSnapshot();
      const remotePayload = data?.payload;
      const isRemotePayloadEmpty = isPlainObject(remotePayload) && Object.keys(remotePayload).length === 0;

      if (hasRemoteSchedulePayload(remotePayload)) {
        const applied = applyRemotePayload(remotePayload, data.updated_at, data.updated_by, fallbackSnapshot);
        if (!applied) {
          setSyncStatus('동기화 보류 (원격 데이터 형식 확인 필요)');
          isRemoteReadyRef.current = false;
          return;
        }
        setSyncStatus('실시간 동기화 연결됨');
        isRemoteReadyRef.current = true;
        return;
      }

      if (!data || isRemotePayloadEmpty) {
        const initialPayload = fallbackSnapshot;
        const payloadText = JSON.stringify(initialPayload);
        const { error: upsertError } = await supabase.from('timetable_state').upsert(
          { id: SHARED_STATE_ROW_ID, payload: initialPayload, updated_by: clientIdRef.current },
          { onConflict: 'id' }
        );

        if (!isMounted) return;

        if (upsertError) {
          setSyncStatus('동기화 오류 (초기 저장 실패, 재시도 중)');
          isRemoteReadyRef.current = false;
          retryTimer = setTimeout(() => {
            if (isMounted) ensureInitialState();
          }, 5000);
        } else {
          lastSyncedPayloadRef.current = payloadText;
          setLastSyncedAt(new Date().toISOString());
          setLastUpdatedBy(clientIdRef.current);
          setSyncStatus('실시간 동기화 연결됨');
          isRemoteReadyRef.current = true;
        }
        return;
      }

      setSyncStatus('동기화 보류 (원격 데이터 형식 확인 필요)');
      isRemoteReadyRef.current = false;
    };

    ensureInitialState();

    const channel = supabase
      .channel('timetable-state-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'timetable_state',
          filter: `id=eq.${SHARED_STATE_ROW_ID}`
        },
        (payload) => {
          if (!isMounted) return;
          if (payload.new?.updated_by === clientIdRef.current) return;
          if (!hasRemoteSchedulePayload(payload.new?.payload)) return;

          const applied = applyRemotePayload(payload.new.payload, payload.new.updated_at, payload.new.updated_by);
          if (!applied) return;
          isRemoteReadyRef.current = true;
          setSyncStatus('원격 변경 반영됨');
        }
      )
      .subscribe((status) => {
        if (!isMounted) return;
        if (status === 'SUBSCRIBED') setSyncStatus('실시간 동기화 연결됨');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncStatus('실시간 연결 오류');
        if (status === 'CLOSED') setSyncStatus('실시간 연결 종료');
      });

    return () => {
      isMounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    if (!isRemoteReadyRef.current) return undefined;
    if (isApplyingRemoteRef.current) return undefined;

    const payload = {
      classCount,
      subjects: allSubjects,
      classConfig: {
        classCount,
        subjects: allSubjects
      },
      allSchedules,
      standardHours,
      teacherConfigs,
      specialTemplates,
      changeLogs,
      weeklyNotices
    };
    const payloadText = JSON.stringify(payload);

    if (payloadText === lastSyncedPayloadRef.current) return undefined;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const { error } = await supabase.from('timetable_state').upsert(
        { id: SHARED_STATE_ROW_ID, payload, updated_by: clientIdRef.current },
        { onConflict: 'id' }
      );

      if (error) {
        setSyncStatus('동기화 오류 (저장 실패)');
        return;
      }

      lastSyncedPayloadRef.current = payloadText;
      setLastSyncedAt(new Date().toISOString());
      setLastUpdatedBy(clientIdRef.current);
      setSyncStatus('실시간 동기화 연결됨');
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [classCount, allSubjects, allSchedules, standardHours, teacherConfigs, specialTemplates, changeLogs, weeklyNotices]);

  const findTeacherOverlapClasses = (schedulesMap, weekName, className, periodIndex, dayIndex, teacherId) => {
    if (!teacherId) return [];
    const weekSchedule = schedulesMap?.[weekName];
    if (!weekSchedule) return [];

    return classNames.filter((cls) => {
      if (cls === className) return false;
      const targetCell = weekSchedule[cls]?.[periodIndex]?.[dayIndex];
      return targetCell?.type === 'special' && targetCell.teacherId === teacherId;
    });
  };

  const hasTeacherOverlapConflict = (weekName, className, periodIndex, dayIndex, cell, schedulesMap = allSchedules) => {
    if (!cell || cell.type !== 'special' || !cell.teacherId) return false;
    return findTeacherOverlapClasses(schedulesMap, weekName, className, periodIndex, dayIndex, cell.teacherId).length > 0;
  };

  const buildTeacherOverlapWarning = (weekName, className, periodIndex, dayIndex, cell, schedulesMap = allSchedules) => {
    if (!cell || cell.type !== 'special' || !cell.teacherId) return '';
    const overlapClasses = findTeacherOverlapClasses(schedulesMap, weekName, className, periodIndex, dayIndex, cell.teacherId);
    if (overlapClasses.length === 0) return '';
    const teacherName = cell.teacher || '전담 교사';
    return `[경고] [${weekName}] ${DAYS[dayIndex]} ${PERIODS[periodIndex]}교시 ${className} 수업이 ${teacherName} 선생님 기준 ${overlapClasses.join(', ')}와 중복됩니다. (변경은 적용됨)`;
  };

  const buildTemplateMismatchNotice = (weekName, className, periodIndex, dayIndex, cell) => {
    if (!isCellMismatchedWithTemplate(weekName, className, periodIndex, dayIndex, cell)) return '';
    return `[안내] [${weekName}] ${DAYS[dayIndex]} ${PERIODS[periodIndex]}교시 ${className} 수업이 전담 기준 배치(원배치/템플릿)와 달라 파란색 테두리로 표시됩니다.`;
  };

  const getTeacherNameById = (teacherId) =>
    teacherConfigs.find((teacher) => teacher.id === teacherId)?.name || '전담교사';

  const findTeacherConflictClassesAtSlot = (
    schedulesMap,
    weekName,
    periodIndex,
    dayIndex,
    teacherId,
    ignorePositions = []
  ) => {
    if (!teacherId) return [];
    const weekSchedule = schedulesMap?.[weekName];
    if (!weekSchedule) return [];

    const ignored = new Set(
      ignorePositions.map((position) =>
        `${position.weekName}|${position.className}|${position.p}|${position.d}`
      )
    );

    return classNames.filter((cls) => {
      const key = `${weekName}|${cls}|${periodIndex}|${dayIndex}`;
      if (ignored.has(key)) return false;
      const cell = weekSchedule?.[cls]?.[periodIndex]?.[dayIndex];
      return isSpecialLikeCell(cell) && cell.teacherId === teacherId;
    });
  };

  const evaluateSpecialSwapTarget = (
    sourceMeta,
    sourceCell,
    targetMeta,
    targetCell,
    schedulesMap = allSchedules
  ) => {
    if (!sourceCell || !isSpecialLikeCell(sourceCell)) {
      return { canSwap: true, blockReason: '', details: {} };
    }

    if (isHolidayCell(sourceCell) || isHolidayCell(targetCell)) {
      return { canSwap: false, blockReason: 'holiday', details: {} };
    }

    const sourceTeacherId = sourceCell.teacherId;
    if (!sourceTeacherId) {
      return { canSwap: false, blockReason: 'missing_teacher', details: {} };
    }

    const sourceAllowedClasses = teacherClassNameSetMap[sourceTeacherId];
    if (sourceAllowedClasses && sourceAllowedClasses.size > 0 && !sourceAllowedClasses.has(targetMeta.className)) {
      return {
        canSwap: false,
        blockReason: 'teacher_class_mismatch',
        details: { teacherId: sourceTeacherId }
      };
    }

    const ignorePositions = [sourceMeta, targetMeta];
    const sourceTeacherConflicts = findTeacherConflictClassesAtSlot(
      schedulesMap,
      targetMeta.weekName,
      targetMeta.p,
      targetMeta.d,
      sourceTeacherId,
      ignorePositions
    );
    if (sourceTeacherConflicts.length > 0) {
      return {
        canSwap: false,
        blockReason: 'source_teacher_busy',
        details: {
          teacherId: sourceTeacherId,
          conflictClasses: sourceTeacherConflicts
        }
      };
    }

    if (isSpecialLikeCell(targetCell) && targetCell.teacherId) {
      const targetTeacherId = targetCell.teacherId;
      if (targetTeacherId !== sourceTeacherId) {
        const targetAllowedClasses = teacherClassNameSetMap[targetTeacherId];
        if (targetAllowedClasses && targetAllowedClasses.size > 0 && !targetAllowedClasses.has(sourceMeta.className)) {
          return {
            canSwap: false,
            blockReason: 'target_teacher_class_mismatch',
            details: { teacherId: targetTeacherId }
          };
        }
      }

      const targetTeacherConflicts = findTeacherConflictClassesAtSlot(
        schedulesMap,
        sourceMeta.weekName,
        sourceMeta.p,
        sourceMeta.d,
        targetTeacherId,
        ignorePositions
      );
      if (targetTeacherConflicts.length > 0) {
        return {
          canSwap: false,
          blockReason: 'target_teacher_busy',
          details: {
            teacherId: targetTeacherId,
            conflictClasses: targetTeacherConflicts
          }
        };
      }
    }

    return { canSwap: true, blockReason: '', details: {} };
  };

  const getSpecialSwapBlockReasonText = (evaluation, sourceCell) => {
    const blockReason = evaluation?.blockReason || '';
    const details = evaluation?.details || {};

    if (blockReason === 'holiday') {
      return '휴업일 칸은 수업 이동 대상이 아닙니다.';
    }
    if (blockReason === 'missing_teacher') {
      return '전담 교사 정보가 없어 이동 가능 시간을 계산할 수 없습니다.';
    }
    if (blockReason === 'teacher_class_mismatch') {
      const teacherName = sourceCell?.teacher || getTeacherNameById(sourceCell?.teacherId);
      return `${teacherName} 선생님의 담당 학급이 아닙니다.`;
    }
    if (blockReason === 'target_teacher_class_mismatch') {
      return `교환 대상 전담(${getTeacherNameById(details.teacherId)})을 현재 학급으로 옮길 수 없습니다.`;
    }
    if (blockReason === 'source_teacher_busy') {
      const teacherName = sourceCell?.teacher || getTeacherNameById(sourceCell?.teacherId);
      const overlapClasses = Array.isArray(details.conflictClasses) ? details.conflictClasses : [];
      return overlapClasses.length > 0
        ? `${teacherName} 선생님이 해당 시간에 ${overlapClasses.join(', ')} 수업 중입니다.`
        : `${teacherName} 선생님이 해당 시간에 이미 수업 중입니다.`;
    }
    if (blockReason === 'target_teacher_busy') {
      const overlapClasses = Array.isArray(details.conflictClasses) ? details.conflictClasses : [];
      const targetTeacherName = getTeacherNameById(details.teacherId);
      return overlapClasses.length > 0
        ? `교환 대상 전담(${targetTeacherName})이 원래 시간에 ${overlapClasses.join(', ')} 수업 중입니다.`
        : `교환 대상 전담(${targetTeacherName})이 원래 시간으로 이동할 수 없습니다.`;
    }
    return '현재 조건에서는 이동할 수 없습니다.';
  };

  const buildSpecialForcedSwapConfirmMessage = (sourceMeta, sourceCell, targetMeta, evaluation) => {
    const teacherName = sourceCell?.teacher || getTeacherNameById(sourceCell?.teacherId);
    const subjectName = sourceCell?.subject || '전담수업';
    const fromLine = `현재 선택: [${sourceMeta.weekName}] ${sourceMeta.className} ${DAYS[sourceMeta.d]}요일 ${PERIODS[sourceMeta.p]}교시 ${subjectName} (${teacherName})`;
    const targetLine = `선택한 대상: [${targetMeta.weekName}] ${targetMeta.className} ${DAYS[targetMeta.d]}요일 ${PERIODS[targetMeta.p]}교시`;
    const reasonLine = `이동 불가 사유: ${getSpecialSwapBlockReasonText(evaluation, sourceCell)}`;

    return `전담 수업 이동 제약 안내\n\n${fromLine}\n${targetLine}\n\n${reasonLine}\n\n그래도 이동하시겠습니까?\n확인 시 강제 이동되어 빨간 테두리로 표시됩니다.`;
  };

  const getConflictBorderClassName = (hasTemplateMismatch, hasTeacherConflict, hasForcedConflict = false) => {
    if (hasTeacherConflict || hasForcedConflict) return 'border-red-500 border-2 ';
    if (hasTemplateMismatch) return 'border-blue-500 border-2 ';
    return '';
  };

  const getSwapTargetState = (weekName, className, periodIndex, dayIndex, targetCell) => {
    if (!selectedCell) {
      return {
        active: false,
        isSelectedTarget: false,
        canSwap: true,
        blockReason: '',
        highlightReason: ''
      };
    }

    const isSelectedTarget =
      selectedCell.weekName === weekName &&
      selectedCell.className === className &&
      selectedCell.p === periodIndex &&
      selectedCell.d === dayIndex;

    if (isSelectedTarget) {
      return {
        active: false,
        isSelectedTarget: true,
        canSwap: true,
        blockReason: '',
        highlightReason: ''
      };
    }

    const sourceLiveCell =
      allSchedules?.[selectedCell.weekName]?.[selectedCell.className]?.[selectedCell.p]?.[selectedCell.d];
    const sourceCell = sourceLiveCell || selectedCell;

    const isSpecialSwapMode = isSpecialLikeCell(sourceCell);
    if (!isSpecialSwapMode) {
      return {
        active: false,
        isSelectedTarget: false,
        canSwap: true,
        blockReason: '',
        highlightReason: ''
      };
    }

    const sourceMeta = {
      weekName: selectedCell.weekName,
      className: selectedCell.className,
      p: selectedCell.p,
      d: selectedCell.d
    };
    const targetMeta = { weekName, className, p: periodIndex, d: dayIndex };
    const evaluation = evaluateSpecialSwapTarget(sourceMeta, sourceCell, targetMeta, targetCell);

    return {
      active: true,
      isSelectedTarget: false,
      canSwap: evaluation.canSwap,
      blockReason: evaluation.blockReason,
      highlightReason: evaluation.canSwap ? 'special_teacher_available' : ''
    };
  };

  const openCellSubjectContextMenu = (e, weekName, className, p, d) => {
    if (isSpacePanMode) return;
    e.preventDefault();
    e.stopPropagation();

    const cell = allSchedules?.[weekName]?.[className]?.[p]?.[d];
    if (!cell) return;

    setCurrentClass(className);
    setCellSubjectContextMenu({
      weekName,
      className,
      p,
      d,
      x: e.clientX,
      y: e.clientY
    });
    const selectionValue = getSubjectSelectionValueForCell(cell);
    setContextMenuSubjectValue(selectionValue);
    setContextMenuInitialSubjectValue(selectionValue);
  };

  const closeCellSubjectContextMenu = () => {
    setCellSubjectContextMenu(null);
    setContextMenuSubjectValue('');
    setContextMenuInitialSubjectValue('');
  };

  // 충돌 검사 (선생님 기준)
  const isSwapValid = (sourceCell, targetWeek, targetClass, targetP, targetD) => {
    const targetCell = allSchedules[targetWeek][targetClass][targetP][targetD];
    const sourceWeek = sourceCell.weekName;
    const sourceClass = sourceCell.className;
    const sourceP = sourceCell.p;
    const sourceD = sourceCell.d;
    const warnings = [];

    // 휴업일이나 빈칸은 충돌 검사 제외
    if (sourceCell.type !== 'homeroom' && sourceCell.type !== 'empty' && sourceCell.type !== 'holiday' && sourceCell.teacherId) {
      const conflicts = [];
      for (const cls of classNames) {
        if (cls === targetClass) continue;
        if (sourceWeek === targetWeek && sourceP === targetP && sourceD === targetD && cls === sourceClass) continue;
        if (allSchedules[targetWeek][cls][targetP][targetD].teacherId === sourceCell.teacherId) {
          conflicts.push(cls);
        }
      }
      if (conflicts.length > 0) {
        warnings.push(`[경고] ${sourceCell.teacher} 선생님이 [${targetWeek}] ${DAYS[targetD]} ${PERIODS[targetP]}교시에 ${conflicts.join(', ')}와 중복됩니다.`);
      }
    }
    if (targetCell.type !== 'homeroom' && targetCell.type !== 'empty' && targetCell.type !== 'holiday' && targetCell.teacherId) {
      const conflicts = [];
      for (const cls of classNames) {
        if (cls === sourceClass) continue;
        if (sourceWeek === targetWeek && sourceP === targetP && sourceD === targetD && cls === targetClass) continue;
        if (allSchedules[sourceWeek][cls][sourceP][sourceD].teacherId === targetCell.teacherId) {
          conflicts.push(cls);
        }
      }
      if (conflicts.length > 0) {
        warnings.push(`[경고] ${targetCell.teacher} 선생님이 [${sourceWeek}] ${DAYS[sourceD]} ${PERIODS[sourceP]}교시에 ${conflicts.join(', ')}와 중복됩니다.`);
      }
    }
    return { valid: true, reason: warnings.join(' ') };
  };

  const selectedCellRecommendations = useMemo(() => {
    if (!selectedCell) return null;
    const { weekName, className, p: sourceP, d: sourceD } = selectedCell;
    const weekSchedule = allSchedules?.[weekName];
    if (!weekSchedule?.[className]) return null;

    const sourceCellCurrent = weekSchedule[className]?.[sourceP]?.[sourceD];
    if (!sourceCellCurrent) return null;

    const sourceMeta = {
      weekName,
      className,
      p: sourceP,
      d: sourceD
    };
    const sourceCellForValidation = {
      ...sourceCellCurrent,
      ...sourceMeta
    };

    const moveTargets = [];
    const swapTargets = [];
    const blockedTargets = [];

    for (let d = 0; d < DAYS.length; d++) {
      for (let p = 0; p < PERIODS.length; p++) {
        if (p === sourceP && d === sourceD) continue;

        const targetCell = weekSchedule[className][p][d];
        const targetMeta = { weekName, className, p, d };
        const slotLabel = formatSlotLabel(p, d);

        if (isHolidayCell(sourceCellCurrent) || isHolidayCell(targetCell)) {
          blockedTargets.push({ slotLabel, reason: '휴업일 칸은 이동/교환 대상이 아닙니다.' });
          continue;
        }

        if (isSpecialLikeCell(sourceCellCurrent)) {
          const evaluation = evaluateSpecialSwapTarget(sourceMeta, sourceCellCurrent, targetMeta, targetCell);
          if (!evaluation.canSwap) {
            blockedTargets.push({ slotLabel, reason: getSpecialSwapBlockReasonText(evaluation, sourceCellCurrent) });
            continue;
          }
        }

        const validation = isSwapValid(sourceCellForValidation, weekName, className, p, d);
        const warningReason = validation.reason ? `주의: ${validation.reason}` : '';
        if (targetCell?.subject) {
          swapTargets.push({
            slotLabel,
            reason: warningReason || `교환 가능 (${getCellLabel(targetCell)})`
          });
        } else {
          moveTargets.push({
            slotLabel,
            reason: warningReason || '전담 충돌 없음'
          });
        }
      }
    }

    return { moveTargets, swapTargets, blockedTargets };
  }, [selectedCell, allSchedules]);

  const handleUniversalCellClick = (wName, cName, p, d) => {
    const clickedCell = allSchedules[wName][cName][p][d];

    if (selectedCell && selectedCell.weekName === wName && selectedCell.className === cName && selectedCell.p === p && selectedCell.d === d) {
      setSelectedCell(null);
      setQuickEditorAction('subject');
      return;
    }

    if (!selectedCell) {
      setSelectedCell({ weekName: wName, className: cName, p, d, ...clickedCell });
      setQuickEditorAction('subject');
    } else {
      if (quickEditorAction === 'move' && clickedCell?.subject) {
        showNotification('이동 모드에서는 빈칸만 선택할 수 있습니다. 빈칸 후보를 선택해주세요.', 'error');
        return;
      }
      if (quickEditorAction === 'swap' && !clickedCell?.subject) {
        showNotification('교환 모드에서는 수업이 있는 칸을 선택해주세요.', 'error');
        return;
      }

      const sourceCellCurrent = allSchedules[selectedCell.weekName][selectedCell.className][selectedCell.p][selectedCell.d];
      const sourceMeta = {
        weekName: selectedCell.weekName,
        className: selectedCell.className,
        p: selectedCell.p,
        d: selectedCell.d
      };
      const targetMeta = {
        weekName: wName,
        className: cName,
        p,
        d
      };
      let isForcedSpecialSwap = false;
      if (isSpecialLikeCell(sourceCellCurrent)) {
        const evaluation = evaluateSpecialSwapTarget(sourceMeta, sourceCellCurrent, targetMeta, clickedCell);
        if (!evaluation.canSwap) {
          const shouldForceMove = window.confirm(
            buildSpecialForcedSwapConfirmMessage(sourceMeta, sourceCellCurrent, targetMeta, evaluation)
          );
          if (!shouldForceMove) return;
          isForcedSpecialSwap = true;
        }
      }

      if (isHolidayCell(sourceCellCurrent) || isHolidayCell(clickedCell)) {
        showNotification('휴업일 칸은 수업 교환 대상이 아닙니다. 설정에서 휴업일 해제 후 수정하세요.', 'error');
        setSelectedCell(null);
        return;
      }

      const sourceCellForValidation = {
        ...sourceCellCurrent,
        ...sourceMeta
      };
      const validation = isSwapValid(sourceCellForValidation, wName, cName, p, d);
      
      const newAllSchedules = { ...allSchedules };
      const w1 = selectedCell.weekName; const c1 = selectedCell.className; const p1 = selectedCell.p; const d1 = selectedCell.d;

      const cloneEditableSlot = (schedulesMap, weekName, className, periodIndex) => {
        // 소스/타깃 슬롯을 독립 복사해 원본 state 오염(undo 스냅샷 깨짐)을 방지한다.
        schedulesMap[weekName] = { ...schedulesMap[weekName] };
        schedulesMap[weekName][className] = [...schedulesMap[weekName][className]];
        schedulesMap[weekName][className][periodIndex] = [...schedulesMap[weekName][className][periodIndex]];
      };

      cloneEditableSlot(newAllSchedules, w1, c1, p1);
      if (!(w1 === wName && c1 === cName && p1 === p)) {
        cloneEditableSlot(newAllSchedules, wName, cName, p);
      }

      const targetOriginalCell = newAllSchedules[wName][cName][p][d];
      const sourceOriginalCell = newAllSchedules[w1][c1][p1][d1];
      const movedToTargetCell = { ...sourceOriginalCell, forcedConflict: false };
      const movedToSourceCell = { ...targetOriginalCell, forcedConflict: false };

      if (isForcedSpecialSwap) {
        if (isSpecialLikeCell(movedToTargetCell)) movedToTargetCell.forcedConflict = true;
        if (isSpecialLikeCell(movedToSourceCell)) movedToSourceCell.forcedConflict = true;
      }

      newAllSchedules[wName][cName][p][d] = movedToTargetCell;
      newAllSchedules[w1][c1][p1][d1] = movedToSourceCell;

      applyScheduleChangeWithHistory({
        nextAllSchedules: newAllSchedules,
        nextSelectedCell: null,
        changeLogEntry: createChangeLogEntry({
          type: 'swap',
          summary: `${formatCellAddress(w1, c1, p1, d1)} ↔ ${formatCellAddress(wName, cName, p, d)} (${getCellLabel(sourceOriginalCell)} ↔ ${getCellLabel(targetOriginalCell)})`,
          announcementText: `${c1} ${DAYS[d1]}요일 ${PERIODS[p1]}교시: ${getCellLabel(sourceOriginalCell)} ↔ ${cName} ${DAYS[d]}요일 ${PERIODS[p]}교시: ${getCellLabel(targetOriginalCell)}`,
          weekKeys: [w1, wName]
        })
      });

      const warnings = [validation.reason];
      if (isForcedSpecialSwap) {
        warnings.push('[경고] 교사 조건을 무시하고 강제 이동했습니다. 빨간 테두리로 표시됩니다.');
      }
      const movedCellWarning = buildTeacherOverlapWarning(wName, cName, p, d, newAllSchedules[wName][cName][p][d], newAllSchedules);
      const sourceCellWarning = buildTeacherOverlapWarning(w1, c1, p1, d1, newAllSchedules[w1][c1][p1][d1], newAllSchedules);
      const movedCellMismatchNotice = buildTemplateMismatchNotice(wName, cName, p, d, newAllSchedules[wName][cName][p][d]);
      const sourceCellMismatchNotice = buildTemplateMismatchNotice(w1, c1, p1, d1, newAllSchedules[w1][c1][p1][d1]);
      if (movedCellWarning) warnings.push(movedCellWarning);
      if (sourceCellWarning) warnings.push(sourceCellWarning);
      const notices = [movedCellMismatchNotice, sourceCellMismatchNotice];
      const warningMessage = [...new Set(warnings.filter(Boolean))].join(' ');
      const noticeMessage = [...new Set(notices.filter(Boolean))].join(' ');
      const mergedMessage = [warningMessage, noticeMessage].filter(Boolean).join(' ');

      if (mergedMessage) {
        showNotification(mergedMessage, warningMessage ? 'error' : 'info');
      } else {
        showNotification(`시간표가 성공적으로 변경되었습니다!`, 'success', { actionType: 'undo', duration: 5500 });
      }
      setQuickEditorAction('subject');
    }
  };

  const applyResolutionOperations = (sourceSchedules, operations = []) => {
    const nextSchedules = cloneSchedulesForHistory(sourceSchedules);
    if (!Array.isArray(operations)) return nextSchedules;

    const getCellAt = (pos) => nextSchedules?.[pos.weekName]?.[pos.className]?.[pos.p]?.[pos.d];
    const setCellAt = (pos, cell) => {
      if (!nextSchedules?.[pos.weekName]?.[pos.className]?.[pos.p]) return;
      nextSchedules[pos.weekName][pos.className][pos.p][pos.d] = {
        ...cell,
        forcedConflict: Boolean(cell?.forcedConflict),
        id: typeof cell?.id === 'string' ? cell.id : `${pos.className}-${pos.p}-${pos.d}`
      };
    };

    operations.forEach((operation) => {
      if (!operation || typeof operation !== 'object') return;
      if (operation.kind === 'swap') {
        const fromCell = getCellAt(operation.a);
        const toCell = getCellAt(operation.b);
        if (!fromCell || !toCell) return;
        setCellAt(operation.a, toCell);
        setCellAt(operation.b, fromCell);
      }
      if (operation.kind === 'set') {
        setCellAt(operation.at, operation.cell);
      }
    });

    return nextSchedules;
  };

  const collectChangedPositionsFromPlan = (operations = []) => {
    const map = new Map();
    operations.forEach((operation) => {
      if (!operation || typeof operation !== 'object') return;
      if (operation.kind === 'swap') {
        [operation.a, operation.b].forEach((pos) => {
          if (!pos) return;
          map.set(`${pos.weekName}|${pos.className}|${pos.p}|${pos.d}`, pos);
        });
      } else if (operation.kind === 'set' && operation.at) {
        const pos = operation.at;
        map.set(`${pos.weekName}|${pos.className}|${pos.p}|${pos.d}`, pos);
      }
    });
    return Array.from(map.values());
  };

  const scoreResolutionPlan = (operations, options = {}) => {
    const simulatedSchedules = applyResolutionOperations(allSchedules, operations);
    const changedPositions = collectChangedPositionsFromPlan(operations);

    let mismatchCount = 0;
    let overlapCount = 0;

    changedPositions.forEach((pos) => {
      const cell = simulatedSchedules?.[pos.weekName]?.[pos.className]?.[pos.p]?.[pos.d];
      if (!cell) return;
      if (hasTeacherOverlapConflict(pos.weekName, pos.className, pos.p, pos.d, cell, simulatedSchedules)) {
        overlapCount += 1;
      }
      if (isCellMismatchedWithTemplate(pos.weekName, pos.className, pos.p, pos.d, cell)) {
        mismatchCount += 1;
      }
    });

    const forcePenalty = options.isForced ? 120 : 0;
    const score = operations.length * 10 + overlapCount * 18 + mismatchCount * 6 + forcePenalty;

    const warnings = [];
    if (options.isForced) warnings.push('교사 조건을 무시하는 강제 적용입니다. (빨간 테두리)');
    if (overlapCount > 0) warnings.push(`적용 후 전담 중복 경고 ${overlapCount}건이 남습니다.`);
    if (mismatchCount > 0) warnings.push(`적용 후 템플릿 불일치 ${mismatchCount}건이 생길 수 있습니다.`);

    return { score, warnings };
  };

  const buildSpecialConflictResolutionPlans = ({
    weekName,
    className,
    periodIndex,
    dayIndex,
    nextCell
  }) => {
    const overlapClasses = findTeacherOverlapClasses(
      allSchedules,
      weekName,
      className,
      periodIndex,
      dayIndex,
      nextCell.teacherId
    );
    if (overlapClasses.length === 0) return [];

    const weekSchedule = allSchedules?.[weekName];
    if (!weekSchedule) return [];

    const sourcePos = { weekName, className, p: periodIndex, d: dayIndex };
    const plans = [];

    overlapClasses.forEach((conflictClass) => {
      const conflictSourcePos = { weekName, className: conflictClass, p: periodIndex, d: dayIndex };
      const conflictSourceCell = weekSchedule?.[conflictClass]?.[periodIndex]?.[dayIndex];
      if (!isSpecialLikeCell(conflictSourceCell)) return;

      for (let d = 0; d < DAYS.length; d++) {
        for (let p = 0; p < PERIODS.length; p++) {
          if (p === periodIndex && d === dayIndex) continue;
          const candidateCell = weekSchedule?.[conflictClass]?.[p]?.[d];
          if (!candidateCell || isHolidayCell(candidateCell) || isSpecialLikeCell(candidateCell)) continue;

          const conflictTargetPos = { weekName, className: conflictClass, p, d };
          const evaluation = evaluateSpecialSwapTarget(
            conflictSourcePos,
            conflictSourceCell,
            conflictTargetPos,
            candidateCell,
            allSchedules
          );
          if (!evaluation.canSwap) continue;

          const operations = [
            { kind: 'swap', a: conflictSourcePos, b: conflictTargetPos },
            { kind: 'set', at: sourcePos, cell: { ...nextCell } }
          ];
          const quality = scoreResolutionPlan(operations);
          plans.push({
            id: `resolve-${conflictClass}-${p}-${d}`,
            title: `추천: ${conflictClass} ${formatSlotLabel(periodIndex, dayIndex)} → ${formatSlotLabel(p, d)} 이동`,
            details: [
              `${conflictClass}의 ${nextCell.subject} 수업을 ${formatSlotLabel(p, d)}로 이동`,
              `${className} ${formatSlotLabel(periodIndex, dayIndex)}에 ${nextCell.subject} 배치`
            ],
            operations,
            score: quality.score,
            warnings: quality.warnings
          });
        }
      }
    });

    for (let d = 0; d < DAYS.length; d++) {
      for (let p = 0; p < PERIODS.length; p++) {
        if (p === periodIndex && d === dayIndex) continue;
        const candidateCell = weekSchedule?.[className]?.[p]?.[d];
        if (!candidateCell || isHolidayCell(candidateCell) || isSpecialLikeCell(candidateCell)) continue;
        const conflicts = findTeacherConflictClassesAtSlot(
          allSchedules,
          weekName,
          p,
          d,
          nextCell.teacherId,
          [{ weekName, className, p: periodIndex, d: dayIndex }]
        );
        if (conflicts.length > 0) continue;

        const targetPos = { weekName, className, p, d };
        const operations = [
          {
            kind: 'set',
            at: targetPos,
            cell: {
              ...nextCell,
              id: `${className}-${p}-${d}`
            }
          }
        ];
        const quality = scoreResolutionPlan(operations);
        plans.push({
          id: `alternative-${className}-${p}-${d}`,
          title: `대안: ${className} ${formatSlotLabel(p, d)}에 배치`,
          details: [
            `${className} ${formatSlotLabel(periodIndex, dayIndex)}는 유지`,
            `${className} ${formatSlotLabel(p, d)}에 ${nextCell.subject} 배치`
          ],
          operations,
          score: quality.score + 8,
          warnings: quality.warnings
        });
      }
    }

    const forcedOperations = [
      {
        kind: 'set',
        at: sourcePos,
        cell: { ...nextCell, forcedConflict: true }
      }
    ];
    const forcedQuality = scoreResolutionPlan(forcedOperations, { isForced: true });
    plans.push({
      id: 'forced-apply',
      title: '강제 적용 (빨간 테두리 표시)',
      details: [`${className} ${formatSlotLabel(periodIndex, dayIndex)}에 ${nextCell.subject} 강제 배치`],
      operations: forcedOperations,
      score: forcedQuality.score,
      warnings: forcedQuality.warnings
    });

    return plans
      .sort((a, b) => a.score - b.score)
      .slice(0, 10);
  };

  const applyResolutionPlan = (plan) => {
    if (!plan || !Array.isArray(plan.operations)) return;
    const nextAllSchedules = applyResolutionOperations(allSchedules, plan.operations);
    const weekKeys = Array.from(new Set(
      plan.operations
        .flatMap((operation) => {
          if (operation.kind === 'swap') return [operation.a?.weekName, operation.b?.weekName];
          if (operation.kind === 'set') return [operation.at?.weekName];
          return [];
        })
        .filter(Boolean)
    ));

    applyScheduleChangeWithHistory({
      nextAllSchedules,
      nextSelectedCell: null,
      changeLogEntry: createChangeLogEntry({
        type: 'auto_resolve',
        summary: `[자동 해결] ${plan.title}`,
        announcementText: `[자동 해결] ${plan.title}`,
        weekKeys
      })
    });

    const warningText = (plan.warnings || []).join(' ');
    if (warningText) {
      showNotification(`해결안 적용 완료. ${warningText}`, 'info', { actionType: 'undo', duration: 5500 });
    } else {
      showNotification('충돌 해결안을 적용했습니다.', 'success', { actionType: 'undo', duration: 5500 });
    }
    setPendingResolution(null);
  };

  const applySubjectChangeToCell = (weekName, className, p, d, newSubjectSelection) => {
    const currentCell = allSchedules?.[weekName]?.[className]?.[p]?.[d];
    if (!currentCell) return;
    const previousSubjectLabel = getCellLabel(currentCell);

    const { subject: newSubject, forceHomeroom } = parseSubjectSelection(newSubjectSelection);

    const newAllSchedules = { ...allSchedules };

    newAllSchedules[weekName] = { ...newAllSchedules[weekName] };
    newAllSchedules[weekName][className] = [...newAllSchedules[weekName][className]];
    newAllSchedules[weekName][className][p] = [...newAllSchedules[weekName][className][p]];

    if (!newSubject) {
      const nextCell = { subject: '', type: 'empty', forcedConflict: false, id: `${className}-${p}-${d}` };
      newAllSchedules[weekName][className][p][d] = nextCell;
      const nextSelectedCell = selectedCell && selectedCell.weekName === weekName && selectedCell.className === className && selectedCell.p === p && selectedCell.d === d
        ? { weekName, className, p, d, ...nextCell }
        : undefined;
      applyScheduleChangeWithHistory({
        nextAllSchedules: newAllSchedules,
        nextSelectedCell,
        changeLogEntry: createChangeLogEntry({
          type: 'subject_change',
          summary: `${formatCellAddress(weekName, className, p, d)}: ${previousSubjectLabel} → 빈칸`,
          announcementText: `${className} ${DAYS[d]}요일 ${PERIODS[p]}교시: ${previousSubjectLabel} → 빈칸`,
          weekKeys: [weekName]
        })
      });
      showNotification('수업이 삭제되었습니다. (빈칸)', 'success', { actionType: 'undo', duration: 5500 });
      return;
    }

    let newType = 'homeroom';
    let newTeacherId = null;
    let newTeacherName = '';
    let newLocation = '';

    if (newSubject === '휴업일') {
      newType = 'holiday';
    } else if (!forceHomeroom) {
      const classNum = parseInt(className.replace('반', ''));
      const teacherObj = teacherConfigs.find(t => t.subject === newSubject && t.classes.includes(classNum));
      if (teacherObj) {
        newType = 'special';
        newTeacherId = teacherObj.id;
        newTeacherName = teacherObj.name;
        newLocation = getDefaultLocation(newSubject, d, p);
      }
    }

    const finalLocation = currentCell.location ? currentCell.location : newLocation;

    const nextCell = {
      subject: newSubject,
      type: newType,
      teacherId: newTeacherId,
      teacher: newTeacherName,
      forcedConflict: false,
      location: finalLocation,
      id: `${className}-${p}-${d}`
    };

    if (nextCell.type === 'special' && nextCell.teacherId) {
      const plans = buildSpecialConflictResolutionPlans({
        weekName,
        className,
        periodIndex: p,
        dayIndex: d,
        nextCell
      });
      if (plans.length > 0) {
        setPendingResolution({
          weekName,
          className,
          periodIndex: p,
          dayIndex: d,
          currentSubject: previousSubjectLabel,
          nextSubject: nextCell.subject,
          teacherName: nextCell.teacher,
          plans
        });
        return;
      }
    }

    newAllSchedules[weekName][className][p][d] = nextCell;
    const nextSelectedCell = selectedCell && selectedCell.weekName === weekName && selectedCell.className === className && selectedCell.p === p && selectedCell.d === d
      ? { weekName, className, p, d, ...nextCell }
      : undefined;
    applyScheduleChangeWithHistory({
      nextAllSchedules: newAllSchedules,
      nextSelectedCell,
      changeLogEntry: createChangeLogEntry({
        type: 'subject_change',
        summary: `${formatCellAddress(weekName, className, p, d)}: ${previousSubjectLabel} → ${getCellLabel(nextCell)}`,
        announcementText: `${className} ${DAYS[d]}요일 ${PERIODS[p]}교시: ${previousSubjectLabel} → ${getCellLabel(nextCell)}`,
        weekKeys: [weekName]
      })
    });

    const warning = buildTeacherOverlapWarning(weekName, className, p, d, nextCell, newAllSchedules);
    const mismatchNotice = buildTemplateMismatchNotice(weekName, className, p, d, nextCell);
    if (warning) {
      showNotification([warning, mismatchNotice].filter(Boolean).join(' '), 'error');
      return;
    }
    if (mismatchNotice) {
      showNotification(mismatchNotice, 'info');
      return;
    }

    showNotification(`${newSubject}${forceHomeroom ? ' (담임)' : ''} 과목으로 변경되었습니다.`, 'success', { actionType: 'undo', duration: 5500 });
  };

  // 📝 리스트에서 과목 바로 변경 또는 삭제(빈칸) 처리
  const handleDirectSubjectChange = (newSubjectSelection) => {
    if (!selectedCell) return;
    const { weekName, className, p, d } = selectedCell;
    applySubjectChangeToCell(weekName, className, p, d, newSubjectSelection);
  };

  const applyContextMenuSubjectChange = () => {
    if (!cellSubjectContextMenu) return;
    const hasChange = contextMenuSubjectValue !== contextMenuInitialSubjectValue;
    const { weekName, className, p, d } = cellSubjectContextMenu;
    if (hasChange) {
      applySubjectChangeToCell(weekName, className, p, d, contextMenuSubjectValue);
    }
    closeCellSubjectContextMenu();
  };

  const handleLocationChange = (newLocation) => {
    if (!selectedCell) return; // 모든 교과에서 비고/장소 입력 가능
    if (isHolidayCell(selectedCell)) {
      showNotification('휴업일 칸은 비고/장소를 수정할 수 없습니다.', 'error');
      return;
    }
    const newAllSchedules = { ...allSchedules };
    const { weekName, className, p, d } = selectedCell;
    
    newAllSchedules[weekName] = { ...newAllSchedules[weekName] };
    newAllSchedules[weekName][className] = [...newAllSchedules[weekName][className]];
    newAllSchedules[weekName][className][p] = [...newAllSchedules[weekName][className][p]];
    newAllSchedules[weekName][className][p][d] = { ...newAllSchedules[weekName][className][p][d], location: newLocation };
    
    setAllSchedules(newAllSchedules);
    setSelectedCell({...selectedCell, location: newLocation});
  };

  // 📝 이후 주차 덮어쓰기 로직 고도화 (현재 반만 덮어쓰기, 강력한 경고창 적용)
  const applyToFutureWeeks = () => {
    const msg = `현재 [${currentWeekName}]의 '${currentClass}' 시간표를 이후 모든 주차에 덮어쓰시겠습니까?\n\n⚠️ 주의: 이후 주차에 이미 작성해둔 '${currentClass}'의 시간표 내용이 덮어씌워지며, 휴업일 칸은 유지됩니다.`;
      
    if (!window.confirm(msg)) return;
    
    const newAllSchedules = { ...allSchedules };
    const sourceClassRows = newAllSchedules[currentWeekName]?.[currentClass];
    if (!sourceClassRows) {
      showNotification('현재 주차 학급 시간표를 찾을 수 없습니다.', 'error');
      return;
    }

    let preservedHolidaySlots = 0;
    
    for (let i = currentWeekIndex + 1; i < WEEKS.length; i++) {
      const weekName = WEEKS[i];
      const weekSchedule = newAllSchedules[weekName];
      if (!weekSchedule?.[currentClass]) continue;

      newAllSchedules[weekName] = { ...weekSchedule };
      const targetClassRows = weekSchedule[currentClass];

      const mergedRows = targetClassRows.map((targetRow, pIdx) =>
        targetRow.map((targetCell, dIdx) => {
          const sourceCell = sourceClassRows?.[pIdx]?.[dIdx];
          if (!sourceCell) return { ...targetCell };

          // 휴업일은 덮어쓰기 대상에서 제외한다.
          if (isHolidayCell(targetCell) || isHolidayCell(sourceCell)) {
            preservedHolidaySlots += 1;
            return { ...targetCell };
          }

          return { ...sourceCell };
        })
      );

      newAllSchedules[weekName][currentClass] = mergedRows;
    }
    
    applyScheduleChangeWithHistory({
      nextAllSchedules: newAllSchedules,
      nextSelectedCell: null,
      changeLogEntry: createChangeLogEntry({
        type: 'copy_to_future',
        summary: `[${currentWeekName}] ${currentClass} 시간표를 이후 주차에 덮어쓰기`,
        announcementText: `${currentClass} 시간표를 [${currentWeekName}] 기준으로 이후 주차에 덮어썼습니다.`,
        weekKeys: [currentWeekName]
      })
    });
    showNotification(
      preservedHolidaySlots > 0
        ? `이후 모든 주차에 반영되었습니다. (휴업일 ${preservedHolidaySlots}칸은 유지)`
        : '이후 모든 주차에 성공적으로 반영되었습니다.',
      'success',
      { actionType: 'undo', duration: 5500 }
    );
  };

  const handleResetAllSchedules = () => {
    const ok = window.confirm('현재 전담 교사 설정으로 전체 시간표를 새로 배정하시겠습니까?');
    if (!ok) return;

    const nextAllSchedules = createAllSchedules(teacherConfigs, classNames, allSubjects);
    applyScheduleChangeWithHistory({
      nextAllSchedules,
      nextSelectedCell: null,
      changeLogEntry: createChangeLogEntry({
        type: 'reset',
        summary: '전체 시간표 새로 배정',
        announcementText: '전체 시간표를 현재 전담 교사 설정으로 다시 생성했습니다.',
        weekKeys: [currentWeekName]
      })
    });
    showNotification('전체 시간표를 새로 배정했습니다.', 'success', { actionType: 'undo', duration: 5500 });
  };

  const createCellFromExpectationOrFallback = (className, periodIndex, dayIndex) => {
    const expected = templateExpectationMap[className]?.[periodIndex]?.[dayIndex] ?? null;
    if (!expected || Array.isArray(expected)) {
      return createHomeroomFallbackCell(className, periodIndex, dayIndex);
    }

    return {
      subject: expected.subject,
      type: 'special',
      teacherId: expected.teacherId,
      teacher: expected.teacher,
      forcedConflict: false,
      location: (expected.location || '').trim() || getDefaultLocation(expected.subject, dayIndex, periodIndex),
      id: `${className}-${periodIndex}-${dayIndex}-special`
    };
  };

  const normalizeHolidayDaySelection = (dayIndices = []) =>
    [...new Set(
      (dayIndices || [])
        .map((idx) => Number(idx))
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < DAYS.length)
    )].sort((a, b) => a - b);

  const formatHolidayDayLabels = (weekName, dayIndices) =>
    dayIndices
      .map((idx) => getDatesForWeek(weekName)?.[idx] || DAYS[idx])
      .join(', ');

  const toggleHolidayDaySelection = (dayIndex) => {
    setHolidayDayIndices((prev) => {
      const normalized = normalizeHolidayDaySelection(prev);
      if (normalized.includes(dayIndex)) {
        const next = normalized.filter((idx) => idx !== dayIndex);
        return next.length > 0 ? next : normalized;
      }
      return [...normalized, dayIndex].sort((a, b) => a - b);
    });
  };

  const applyHolidayToDays = (weekName, dayIndices) => {
    const validDayIndices = normalizeHolidayDaySelection(dayIndices);
    if (validDayIndices.length === 0) {
      showNotification('휴업일로 지정할 요일을 선택해주세요.', 'error');
      return;
    }

    const sourceWeek = allSchedules[weekName];
    if (!sourceWeek) {
      showNotification('선택한 주차 정보를 찾을 수 없습니다.', 'error');
      return;
    }

    const nextAllSchedules = { ...allSchedules, [weekName]: { ...sourceWeek } };

    classNames.forEach((className) => {
      const classRows = sourceWeek[className] || Array.from(
        { length: PERIODS.length },
        (_, periodIndex) => Array.from(
          { length: DAYS.length },
          (_, dayIndex) => createHomeroomFallbackCell(className, periodIndex, dayIndex, allSubjects)
        )
      );
      nextAllSchedules[weekName][className] = classRows.map((row, periodIndex) => {
        const copiedRow = [...row];
        validDayIndices.forEach((dayIndex) => {
          copiedRow[dayIndex] = {
            subject: '휴업일',
            type: 'holiday',
            teacherId: null,
            teacher: '',
            forcedConflict: false,
            location: '',
            id: `${className}-${periodIndex}-${dayIndex}-holiday`
          };
        });
        return copiedRow;
      });
    });

    applyScheduleChangeWithHistory({
      nextAllSchedules,
      nextSelectedCell: null,
      changeLogEntry: createChangeLogEntry({
        type: 'holiday_apply',
        summary: `[${weekName}] ${formatHolidayDayLabels(weekName, validDayIndices)} 전체 학급 휴업일 지정`,
        announcementText: `[${weekName}] ${formatHolidayDayLabels(weekName, validDayIndices)} 전체 학급: 휴업일 지정`,
        weekKeys: [weekName]
      })
    });
    showNotification(
      `[${weekName}] ${formatHolidayDayLabels(weekName, validDayIndices)} 전체 학급을 휴업일로 지정했습니다.`,
      'success',
      { actionType: 'undo', duration: 5500 }
    );
  };

  const clearHolidayFromDays = (weekName, dayIndices) => {
    const validDayIndices = normalizeHolidayDaySelection(dayIndices);
    if (validDayIndices.length === 0) {
      showNotification('휴업일 해제할 요일을 선택해주세요.', 'error');
      return;
    }

    const sourceWeek = allSchedules[weekName];
    if (!sourceWeek) {
      showNotification('선택한 주차 정보를 찾을 수 없습니다.', 'error');
      return;
    }

    const nextAllSchedules = { ...allSchedules, [weekName]: { ...sourceWeek } };
    let restoredCount = 0;

    classNames.forEach((className) => {
      const classRows = sourceWeek[className] || Array.from(
        { length: PERIODS.length },
        (_, periodIndex) => Array.from(
          { length: DAYS.length },
          (_, dayIndex) => createHomeroomFallbackCell(className, periodIndex, dayIndex, allSubjects)
        )
      );
      nextAllSchedules[weekName][className] = classRows.map((row, periodIndex) => {
        const copiedRow = [...row];
        validDayIndices.forEach((dayIndex) => {
          const cell = copiedRow[dayIndex];
          if (!isHolidayCell(cell)) return;
          copiedRow[dayIndex] = createCellFromExpectationOrFallback(className, periodIndex, dayIndex);
          restoredCount += 1;
        });
        return copiedRow;
      });
    });

    if (restoredCount === 0) {
      showNotification('선택한 요일들에는 휴업일 지정 칸이 없습니다.', 'error');
      return;
    }

    applyScheduleChangeWithHistory({
      nextAllSchedules,
      nextSelectedCell: null,
      changeLogEntry: createChangeLogEntry({
        type: 'holiday_clear',
        summary: `[${weekName}] ${formatHolidayDayLabels(weekName, validDayIndices)} 휴업일 해제`,
        announcementText: `[${weekName}] ${formatHolidayDayLabels(weekName, validDayIndices)} 전체 학급: 휴업일 해제`,
        weekKeys: [weekName]
      })
    });
    showNotification(
      `[${weekName}] ${formatHolidayDayLabels(weekName, validDayIndices)} 휴업일 지정을 해제했습니다.`,
      'success',
      { actionType: 'undo', duration: 5500 }
    );
  };

  const getCellStyles = (p, d, cell) => {
    const isSelected = selectedCell?.weekName === currentWeekName && selectedCell?.className === currentClass && selectedCell?.p === p && selectedCell?.d === d;
    const hasTeacherConflict = hasTeacherOverlapConflict(currentWeekName, currentClass, p, d, cell);
    const hasForcedConflict = Boolean(cell?.forcedConflict);
    const hasTemplateMismatch = isCellMismatchedWithTemplate(currentWeekName, currentClass, p, d, cell);
    const swapTargetState = getSwapTargetState(currentWeekName, currentClass, p, d, cell);
    let baseStyle = "relative transition-all duration-200 ease-in-out border border-gray-300 p-2 h-24 flex flex-col items-center justify-center cursor-pointer font-medium text-lg rounded-sm ";
    
    baseStyle += getTimetableCellColor(cell) + " ";
    baseStyle += getConflictBorderClassName(hasTemplateMismatch, hasTeacherConflict, hasForcedConflict);

    if (isSelected) baseStyle += "ring-4 ring-yellow-400 transform scale-105 z-10 shadow-lg ";

    let overlay = null;
    if (selectedCell && !isSelected) {
      if (swapTargetState.active) {
        if (swapTargetState.canSwap && swapTargetState.highlightReason === 'special_teacher_available') {
          baseStyle += "ring-2 ring-inset ring-emerald-500 bg-emerald-50 ";
          overlay = <div className="absolute inset-0 bg-emerald-500/10 z-20" />;
        } else if (!swapTargetState.canSwap && swapTargetState.blockReason === 'holiday') {
          baseStyle += "opacity-60 cursor-not-allowed ";
          overlay = <div className="absolute inset-0 bg-red-500 bg-opacity-20 flex items-center justify-center z-20"><X className="text-red-600 w-8 h-8 opacity-70" /></div>;
        } else if (!swapTargetState.canSwap) {
          baseStyle += "opacity-60 cursor-not-allowed ";
          overlay = <div className="absolute inset-0 bg-black bg-opacity-70 z-20" />;
        } else {
          baseStyle += "hover:ring-2 hover:ring-blue-400 hover:scale-105 z-10 ";
        }
      }
    }
    return { style: baseStyle, overlay };
  };

  const getSpecialPlacementIdentity = (cell) => {
    if (!isSpecialLikeCell(cell)) return '';
    const teacherId = typeof cell.teacherId === 'string' ? cell.teacherId : '';
    const teacherName = typeof cell.teacher === 'string' ? cell.teacher.trim() : '';
    const subjectName = typeof cell.subject === 'string' ? cell.subject.trim() : '';
    return `${teacherId}|${teacherName}|${subjectName}`;
  };

  const isCellMismatchedWithOriginalSpecialPlacement = (weekName, className, periodIndex, dayIndex, cell) => {
    const actual = cell || { subject: '', type: 'empty', teacherId: null, location: '' };

    if (actual.type === 'holiday' || actual.subject === '휴업일') return false;
    // 원배치 비교는 "현재 전담 수업 칸"에 한해서만 적용한다.
    if (!isSpecialLikeCell(actual)) return false;

    const baselineCell = baselineSchedulesRef.current?.[weekName]?.[className]?.[periodIndex]?.[dayIndex];
    if (!isSpecialLikeCell(baselineCell)) return true;

    return getSpecialPlacementIdentity(actual) !== getSpecialPlacementIdentity(baselineCell);
  };

  const isCellMismatchedWithTemplate = (weekName, className, periodIndex, dayIndex, cell) => {
    const expected = templateExpectationMap[className]?.[periodIndex]?.[dayIndex] ?? null;
    const actual = cell || { subject: '', type: 'empty', teacherId: null, location: '' };
    const hasOriginalPlacementMismatch = isCellMismatchedWithOriginalSpecialPlacement(
      weekName,
      className,
      periodIndex,
      dayIndex,
      actual
    );

    // 휴업일은 설정에서 의도적으로 지정한 예외로 간주
    if (actual.type === 'holiday' || actual.subject === '휴업일') return hasOriginalPlacementMismatch;

    // 과학/체육/음악은 담임 수업으로 운용 가능하므로 템플릿 불일치에서 제외
    if (
      actual.type === 'homeroom' &&
      HOMEROOM_FLEX_SUBJECTS.includes((actual.subject || '').trim())
    ) {
      return hasOriginalPlacementMismatch;
    }

    // 템플릿에 동일 슬롯의 기대값이 2개 이상이면 템플릿 자체 충돌로 간주
    if (Array.isArray(expected)) return true;

    if (!expected) {
      return actual.type === 'special' || hasOriginalPlacementMismatch;
    }

    if (actual.type !== 'special') return true;
    if (actual.teacherId !== expected.teacherId) return true;
    if ((actual.subject || '') !== expected.subject) return true;

    const actualLocation = (actual.location || '').trim();
    const expectedLocation = (expected.location || '').trim();
    if (actualLocation !== expectedLocation) return true;

    return hasOriginalPlacementMismatch;
  };

  const getCompactCellStyles = (className, p, d, cell) => {
    const isSelected = selectedCell?.weekName === currentWeekName && selectedCell?.className === className && selectedCell?.p === p && selectedCell?.d === d;
    const hasTeacherConflict = hasTeacherOverlapConflict(currentWeekName, className, p, d, cell);
    const hasForcedConflict = Boolean(cell?.forcedConflict);
    const hasTemplateMismatch = isCellMismatchedWithTemplate(currentWeekName, className, p, d, cell);
    const swapTargetState = getSwapTargetState(currentWeekName, className, p, d, cell);
    let baseStyle = 'relative transition-all duration-150 ease-in-out border border-gray-300 p-1 h-[60px] flex flex-col items-center justify-center cursor-pointer rounded ';
    baseStyle += getTimetableCellColor(cell) + ' ';
    baseStyle += getConflictBorderClassName(hasTemplateMismatch, hasTeacherConflict, hasForcedConflict);

    if (isSelected) baseStyle += 'ring-2 ring-yellow-400 scale-[1.03] z-20 shadow ';

    let overlay = null;
    if (selectedCell && !isSelected) {
      if (swapTargetState.active) {
        if (swapTargetState.canSwap && swapTargetState.highlightReason === 'special_teacher_available') {
          baseStyle += 'ring-2 ring-inset ring-emerald-500 bg-emerald-50 ';
          overlay = <div className="absolute inset-0 bg-emerald-500/10 z-20" />;
        } else if (!swapTargetState.canSwap && swapTargetState.blockReason === 'holiday') {
          baseStyle += 'opacity-60 cursor-not-allowed ';
          overlay = <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center z-20"><X className="text-red-600 w-4 h-4 opacity-70" /></div>;
        } else if (!swapTargetState.canSwap) {
          baseStyle += 'opacity-60 cursor-not-allowed ';
          overlay = <div className="absolute inset-0 bg-black bg-opacity-70 z-20" />;
        } else {
          baseStyle += 'hover:ring-2 hover:ring-blue-300 hover:scale-[1.02] ';
        }
      }
    }

    return { style: baseStyle, overlay };
  };

  const getCompactScaleRatio = () => compactTextScalePercent / 100;

  const getFittedTextPx = (text, options = {}) => {
    const {
      baseWidthPx = 58,
      maxHeightPx = 18,
      minPx = 8,
      maxPx = 24
    } = options;

    const safe = String(text || '-');
    const length = Math.max(safe.length, 1);
    const widthBased = baseWidthPx / (length * 0.92 + 0.35);
    const autoSize = Math.min(widthBased, maxHeightPx);
    const scaled = autoSize * getCompactScaleRatio();

    return Math.max(minPx, Math.min(maxPx, scaled));
  };

  const getCompactSubjectTextStyle = (subject, hasTeacherLine) => {
    const px = getFittedTextPx(subject || '-', {
      baseWidthPx: 58,
      maxHeightPx: hasTeacherLine ? 13.5 : 21,
      minPx: 8,
      maxPx: 26
    });
    return { fontSize: `${px.toFixed(1)}px`, lineHeight: 1.08 };
  };

  const getCompactTeacherTextStyle = (teacher) => {
    const px = getFittedTextPx(teacher || '-', {
      baseWidthPx: 58,
      maxHeightPx: 11.5,
      minPx: 7,
      maxPx: 15
    });
    return { fontSize: `${px.toFixed(1)}px`, lineHeight: 1.05 };
  };

  const getMonthlyScaleRatio = () => monthlyTextScalePercent / 100;

  const getMonthlyFittedTextPx = (text, options = {}) => {
    const {
      baseWidthPx = 100,
      maxHeightPx = 20,
      minPx = 9,
      maxPx = 26
    } = options;

    const safe = String(text || '-');
    const length = Math.max(safe.length, 1);
    const widthBased = baseWidthPx / (length * 0.92 + 0.35);
    const autoSize = Math.min(widthBased, maxHeightPx);
    const scaled = autoSize * getMonthlyScaleRatio();

    return Math.max(minPx, Math.min(maxPx, scaled));
  };

  const getMonthlyDenseCellFitScale = (cell) => {
    const subjectText = cell?.subject === '휴업일' ? '휴업' : (cell?.subject || '-');
    const teacherText = cell?.type === 'special' && cell?.teacher ? cell.teacher : '';
    const locationText = cell?.location ? String(cell.location) : '';
    const rows = [subjectText, teacherText, locationText].filter(Boolean);
    const requiredRows = rows.reduce((sum, text) => sum + Math.max(1, Math.ceil(text.length / 6)), 0);
    const rowCapacity = 6;
    const rowPenalty = rowCapacity / Math.max(rowCapacity, requiredRows);
    const totalLength = rows.join('').length;
    const lengthPenalty = totalLength > 26 ? (26 / totalLength) : 1;

    return Math.max(0.4, Math.min(1, rowPenalty * lengthPenalty));
  };

  const getMonthlyClassSubjectTextStyle = (subject, hasTeacherLine, dense = false, fitScale = 1) => {
    const px = getMonthlyFittedTextPx(subject || '-', {
      baseWidthPx: dense ? 42 : 100,
      maxHeightPx: dense ? (hasTeacherLine ? 10.5 : 14.5) : (hasTeacherLine ? 15 : 24),
      minPx: dense ? 4.2 : 9,
      maxPx: dense ? 18 : 28
    });
    const adjusted = Math.max(dense ? 4.2 : 9, px * fitScale);
    return { fontSize: `${adjusted.toFixed(1)}px`, lineHeight: dense ? 1 : 1.08 };
  };

  const getMonthlyClassTeacherTextStyle = (teacher, dense = false, fitScale = 1) => {
    const px = getMonthlyFittedTextPx(teacher || '-', {
      baseWidthPx: dense ? 42 : 100,
      maxHeightPx: dense ? 8.5 : 12,
      minPx: dense ? 3.8 : 8,
      maxPx: dense ? 12 : 16
    });
    const adjusted = Math.max(dense ? 3.8 : 8, px * fitScale);
    return { fontSize: `${adjusted.toFixed(1)}px`, lineHeight: dense ? 1 : 1.02 };
  };

  const getMonthlyClassLocationTextStyle = (location, dense = false, fitScale = 1) => {
    const px = getMonthlyFittedTextPx(location || '-', {
      baseWidthPx: dense ? 42 : 100,
      maxHeightPx: dense ? 8 : 11,
      minPx: dense ? 3.5 : 7,
      maxPx: dense ? 11 : 14
    });
    const adjusted = Math.max(dense ? 3.5 : 7, px * fitScale);
    return { fontSize: `${adjusted.toFixed(1)}px`, lineHeight: dense ? 1 : 1.02 };
  };

  const getMonthlyClassCellStyles = (weekName, className, p, d, cell, dense = false) => {
    const isSelected = selectedCell?.weekName === weekName && selectedCell?.className === className && selectedCell?.p === p && selectedCell?.d === d;
    const hasTeacherConflict = hasTeacherOverlapConflict(weekName, className, p, d, cell);
    const hasForcedConflict = Boolean(cell?.forcedConflict);
    const hasTemplateMismatch = isCellMismatchedWithTemplate(weekName, className, p, d, cell);
    const swapTargetState = getSwapTargetState(weekName, className, p, d, cell);
    let baseStyle = `relative transition-all duration-150 ease-in-out border border-gray-300 ${dense ? 'p-0.5 h-[52px] rounded-sm' : 'p-1 h-[78px] rounded'} flex flex-col items-center justify-center cursor-pointer `;
    baseStyle += getTimetableCellColor(cell) + ' ';
    baseStyle += getConflictBorderClassName(hasTemplateMismatch, hasTeacherConflict, hasForcedConflict);
    if (isSelected) baseStyle += dense ? 'ring-1 ring-yellow-400 z-20 shadow ' : 'ring-2 ring-yellow-400 scale-[1.02] z-20 shadow ';

    let overlay = null;
    if (selectedCell && !isSelected) {
      if (swapTargetState.active) {
        if (swapTargetState.canSwap && swapTargetState.highlightReason === 'special_teacher_available') {
          baseStyle += dense ? 'ring-1 ring-inset ring-emerald-500 bg-emerald-50 ' : 'ring-2 ring-inset ring-emerald-500 bg-emerald-50 ';
          overlay = <div className="absolute inset-0 bg-emerald-500/10 z-20" />;
        } else if (!swapTargetState.canSwap && swapTargetState.blockReason === 'holiday') {
          baseStyle += 'opacity-60 cursor-not-allowed ';
          overlay = <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center z-20"><X className={`text-red-600 ${dense ? 'w-3 h-3' : 'w-4 h-4'} opacity-70`} /></div>;
        } else if (!swapTargetState.canSwap) {
          baseStyle += 'opacity-60 cursor-not-allowed ';
          overlay = <div className="absolute inset-0 bg-black bg-opacity-70 z-20" />;
        } else {
          baseStyle += dense ? 'hover:ring-1 hover:ring-blue-300 ' : 'hover:ring-2 hover:ring-blue-300 hover:scale-[1.01] ';
        }
      }
    }

    return { style: baseStyle, overlay };
  };

  const handlePanSurfaceMouseDown = (e) => {
    if (!isSpacePanMode || e.button !== 0) return;
    const el = e.currentTarget;
    panDragRef.current = {
      el,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: el.scrollLeft,
      startScrollTop: el.scrollTop
    };
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
    e.preventDefault();
  };

  // --- 집계 로직 (전체 학급 교과 시수) ---
  const calculateAllClassesSummary = () => {
    const counts = {};
    classNames.forEach(cls => {
      counts[cls] = {};
      allSubjects.forEach(s => counts[cls][s] = 0);
    });
    
    Object.values(allSchedules).forEach(week => {
      classNames.forEach(cls => {
        const classRows = week?.[cls] || [];
        classRows.forEach(dayRows => {
          dayRows.forEach(cell => {
            if (cell.subject && cell.subject !== '휴업일') {
              counts[cls][cell.subject] = (counts[cls][cell.subject] || 0) + 1;
            }
          });
        });
      });
    });
    return counts;
  };

  return (
    <div className={`min-h-screen bg-slate-100 font-sans ${isWideContentMode ? 'p-2 md:p-3' : 'p-2 md:p-6'}`}>
      <div className={`${isWideContentMode ? 'w-full' : 'max-w-[1400px]'} mx-auto ${isQuickEditorVisible ? 'xl:pr-[25rem]' : ''}`}>
        <div className="mb-2 flex justify-end">
          <button
            onClick={() => setIsTopHeaderHidden(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-100 shadow-sm"
          >
            {isTopHeaderHidden ? <Eye size={14} /> : <EyeOff size={14} />}
            {isTopHeaderHidden ? '상단 헤드 보기' : '상단 헤드 숨기기'}
          </button>
        </div>
        
        {/* 헤더 & 탭 스위처 */}
        {!isTopHeaderHidden && (
        <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6 mb-6 border border-gray-200">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-3 rounded-full">
                <CalendarSync className="text-blue-600 w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">2026학년도 스마트 시간표</h1>
                <p className="text-sm text-gray-500">전담 충돌 방지 및 학기별 통합 관리 시스템</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${isSupabaseConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                    {syncStatus}
                  </span>
                  {lastSyncedAt && (
                    <span className="text-gray-400">
                      마지막 동기화: {new Date(lastSyncedAt).toLocaleString('ko-KR')}
                    </span>
                  )}
                  {lastUpdatedBy && (
                    <span className="text-gray-400">
                      최근 수정자: {lastUpdatedBy}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap bg-gray-100 p-1 rounded-xl w-full lg:w-auto gap-1">
              <button onClick={() => setViewMode('weekly')} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-bold transition-all text-sm ${viewMode === 'weekly' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <CalendarDays size={16} /> 주간
              </button>
              <button onClick={() => setViewMode('monthly')} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-bold transition-all text-sm ${viewMode === 'monthly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <LayoutDashboard size={16} /> 월간
              </button>
              <button onClick={() => setViewMode('class_summary')} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-bold transition-all text-sm ${viewMode === 'class_summary' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <BookOpen size={16} /> 학급 시수
              </button>
              <button onClick={() => setViewMode('teacher_summary')} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-bold transition-all text-sm ${viewMode === 'teacher_summary' ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Calculator size={16} /> 전담 시수
              </button>
              <button onClick={() => setViewMode('settings')} className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-bold transition-all text-sm ${viewMode === 'settings' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Settings size={16} /> 설정
              </button>
            </div>
          </div>

          {/* 서브 컨트롤러 (Weekly) */}
          {viewMode === 'weekly' && (
            <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center w-full">
              <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200 w-full md:w-auto">
                <button onClick={() => { setCurrentWeekIndex(Math.max(0, currentWeekIndex - 1)); setSelectedCell(null); }} disabled={currentWeekIndex === 0} className="p-1 rounded hover:bg-white disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
                <select value={currentWeekIndex} onChange={(e) => { setCurrentWeekIndex(Number(e.target.value)); setSelectedCell(null); }} className="bg-transparent text-sm md:text-base font-bold text-gray-800 outline-none cursor-pointer px-1">
                  {WEEKS.map((week, idx) => <option key={idx} value={idx}>{week}</option>)}
                </select>
                <button onClick={() => { setCurrentWeekIndex(Math.min(WEEKS.length - 1, currentWeekIndex + 1)); setSelectedCell(null); }} disabled={currentWeekIndex === WEEKS.length - 1} className="p-1 rounded hover:bg-white disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
              </div>

              <div className="flex flex-wrap gap-1 bg-gray-100 p-1.5 rounded-lg w-full xl:w-auto justify-start">
                {classNames.map(cls => (
                  <button key={cls} onClick={() => setCurrentClass(cls)} className={`px-2 py-1.5 whitespace-nowrap text-sm rounded-md font-semibold transition-colors ${currentClass === cls ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {cls}
                  </button>
                ))}
              </div>
              
              <div className="flex flex-wrap gap-2">
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button onClick={() => setWeeklyLayoutMode('single')} className={`px-3 py-1.5 text-xs rounded-md font-bold ${weeklyLayoutMode === 'single' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}>
                    단일 학급
                  </button>
                  <button onClick={() => setWeeklyLayoutMode('all')} className={`px-3 py-1.5 text-xs rounded-md font-bold ${weeklyLayoutMode === 'all' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}>
                    전체 학급
                  </button>
                </div>
                {weeklyLayoutMode === 'all' && (
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                    <span className="text-xs font-bold text-gray-500 whitespace-nowrap">텍스트 크기</span>
                    <input
                      type="range"
                      min={70}
                      max={180}
                      value={compactTextScalePercent}
                      onChange={(e) => setCompactTextScalePercent(Number(e.target.value))}
                      className="w-28 accent-blue-600"
                    />
                    <button
                      onClick={() => setCompactTextScalePercent(100)}
                      className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100"
                    >
                      기본
                    </button>
                    <span className="text-xs font-bold text-blue-700 w-10 text-right">{compactTextScalePercent}%</span>
                  </div>
                )}
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-bold whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ↶ 되돌리기
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-bold whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ↷ 다시하기
                </button>
                <button onClick={applyToFutureWeeks} className="flex justify-center items-center gap-1 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 text-sm font-bold whitespace-nowrap shadow-sm">
                  <Copy size={16} /> 이후 덮어쓰기 (현재 반)
                </button>
                <button
                  onClick={() => setShowChangeSummary((prev) => !prev)}
                  className={`px-3 py-2 border rounded-lg text-sm font-bold whitespace-nowrap ${
                    showChangeSummary
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  공지 및 변경사항
                </button>
              </div>
            </div>
          )}
          
          {/* 서브 컨트롤러 (Monthly) */}
          {viewMode === 'monthly' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3">
                <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-xl border border-indigo-100">
                  <button onClick={() => setCurrentMonthIndex(Math.max(0, currentMonthIndex - 1))} disabled={currentMonthIndex === 0} className="p-2 rounded-lg hover:bg-white disabled:opacity-30 text-indigo-700"><ChevronLeft className="w-5 h-5" /></button>
                  <select value={currentMonthIndex} onChange={(e) => setCurrentMonthIndex(Number(e.target.value))} className="bg-transparent text-lg font-bold text-indigo-900 outline-none cursor-pointer px-4 text-center">
                    {MONTHS.map((month, idx) => <option key={idx} value={idx}>{month.name}</option>)}
                  </select>
                  <button onClick={() => setCurrentMonthIndex(Math.min(MONTHS.length - 1, currentMonthIndex + 1))} disabled={currentMonthIndex === MONTHS.length - 1} className="p-2 rounded-lg hover:bg-white disabled:opacity-30 text-indigo-700"><ChevronRight className="w-5 h-5" /></button>
                </div>

                <div className="flex bg-indigo-100 p-1 rounded-lg">
                  <button onClick={() => setMonthlyLayoutMode('matrix')} className={`px-3 py-1.5 text-xs rounded-md font-bold ${monthlyLayoutMode === 'matrix' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-500'}`}>
                    종합표
                  </button>
                  <button onClick={() => setMonthlyLayoutMode('class_weekly')} className={`px-3 py-1.5 text-xs rounded-md font-bold ${monthlyLayoutMode === 'class_weekly' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-500'}`}>
                    주차 카드형
                  </button>
                </div>
              </div>

              {monthlyLayoutMode === 'matrix' ? (
                <div className="flex flex-wrap items-center gap-2 text-sm bg-white p-2 border border-gray-200 rounded-lg shadow-sm">
                  <span className="font-semibold text-gray-600 mr-2"><LayoutDashboard size={14} className="inline"/> 동선 하이라이트(복수 선택):</span>
                  <button onClick={() => setHighlightTeacherIds([])} className={`px-2 py-1 rounded ${!hasTeacherHighlightFilter ? 'bg-gray-800 text-white' : 'bg-gray-100'}`}>전체보기</button>
                  {teacherConfigs.map(teacher => (
                    <button key={teacher.id} onClick={() => toggleHighlightTeacher(teacher.id)} className={`px-2 py-1 rounded border transition-all ${highlightTeacherIds.includes(teacher.id) ? 'bg-yellow-300 border-yellow-500 text-black font-bold ring-2 ring-yellow-400' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {teacher.name}({teacher.subject})
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 bg-white p-2 border border-gray-200 rounded-lg shadow-sm">
                  <div className="text-xs md:text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg">
                    종합표 내용({classNames.length > 0 ? `${classNames[0]}~${classNames[classNames.length - 1]}` : '학급 없음'})을 주차 카드 형태로 표시
                  </div>
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5">
                    <span className="text-xs font-bold text-indigo-600 whitespace-nowrap">텍스트 크기</span>
                    <input
                      type="range"
                      min={70}
                      max={180}
                      value={monthlyTextScalePercent}
                      onChange={(e) => setMonthlyTextScalePercent(Number(e.target.value))}
                      className="w-28 accent-indigo-600"
                    />
                    <button
                      onClick={() => setMonthlyTextScalePercent(100)}
                      className="text-[11px] px-2 py-1 rounded border border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-100"
                    >
                      기본
                    </button>
                    <span className="text-xs font-bold text-indigo-700 w-10 text-right">{monthlyTextScalePercent}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {isQuickEditorVisible && (
          <>
            <div
              className="fixed inset-0 z-[52] bg-black/20 xl:hidden"
              onClick={() => {
                setSelectedCell(null);
                setQuickEditorAction('subject');
              }}
            />
            <aside className="fixed z-[60] inset-x-0 bottom-0 max-h-[82vh] rounded-t-2xl bg-white border border-gray-200 shadow-2xl flex flex-col xl:inset-auto xl:right-4 xl:top-4 xl:bottom-4 xl:w-[380px] xl:max-h-none xl:rounded-2xl">
              <div className="p-4 border-b border-gray-200 bg-slate-50 rounded-t-2xl xl:rounded-t-2xl">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">선택한 칸 편집</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      [{selectedCell.weekName}] {selectedCell.className} / {selectedCellDateText} / {PERIODS[selectedCell.p]}교시
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCell(null);
                      setQuickEditorAction('subject');
                    }}
                    className="text-gray-400 hover:text-gray-700"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-4 overflow-y-auto space-y-4">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <p className="text-xs text-gray-500">현재 과목</p>
                    <p className="font-bold text-gray-800">{quickEditorCurrentCell?.subject || '빈칸'}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <p className="text-xs text-gray-500">전담 교사</p>
                    <p className="font-bold text-gray-800">{quickEditorCurrentCell?.teacher || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <p className="text-xs text-gray-500">장소/비고</p>
                    <p className="font-bold text-gray-800">{quickEditorCurrentCell?.location || '-'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setQuickEditorAction('subject')}
                    className={`px-3 py-2 rounded-lg font-bold text-sm border ${quickEditorAction === 'subject' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    과목 변경
                  </button>
                  <button
                    onClick={() => setQuickEditorAction('swap')}
                    className={`px-3 py-2 rounded-lg font-bold text-sm border ${quickEditorAction === 'swap' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    교환
                  </button>
                  <button
                    onClick={() => setQuickEditorAction('move')}
                    className={`px-3 py-2 rounded-lg font-bold text-sm border ${quickEditorAction === 'move' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    이동
                  </button>
                  <button
                    onClick={() => handleDirectSubjectChange('')}
                    className="px-3 py-2 rounded-lg font-bold text-sm border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    삭제(빈칸)
                  </button>
                  <button
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    className="col-span-2 px-3 py-2 rounded-lg font-bold text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    되돌리기
                  </button>
                </div>

                <p className="text-xs text-gray-500">{quickEditorActionGuideText}</p>

                {(() => {
                  const hasMismatch = isCellMismatchedWithTemplate(
                    selectedCell.weekName,
                    selectedCell.className,
                    selectedCell.p,
                    selectedCell.d,
                    quickEditorCurrentCell
                  );
                  const hasOverlap = hasTeacherOverlapConflict(selectedCell.weekName, selectedCell.className, selectedCell.p, selectedCell.d, quickEditorCurrentCell);
                  const hasForcedConflict = Boolean(quickEditorCurrentCell?.forcedConflict);
                  if (!hasMismatch && !hasOverlap && !hasForcedConflict) return null;

                  return (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {hasMismatch && (
                        <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">파란 테두리 원인: 전담 원배치/템플릿 불일치</span>
                      )}
                      {(hasOverlap || hasForcedConflict) && (
                        <span className="px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 font-semibold">빨간 테두리 원인: 전담 중복 배치 또는 강제 이동</span>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Edit2 className="text-yellow-500" size={16} />
                    <span className="text-sm font-semibold text-gray-600">과목 변경</span>
                  </div>
                  <select
                    value={selectedSubjectOptionValue}
                    onChange={(e) => handleDirectSubjectChange(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded-md shadow-inner focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-gray-50 font-bold text-gray-700"
                  >
                    <option value="" disabled>-- 과목 선택 --</option>
                    {subjectSelectOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400">과학/체육/음악은 전담/담임 선택 가능</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="text-gray-400" size={16} />
                    <span className="text-sm font-semibold text-gray-600">장소/비고</span>
                  </div>
                  <input
                    type="text"
                    value={selectedCell.location || ''}
                    onChange={(e) => handleLocationChange(e.target.value)}
                    placeholder="비고나 장소 입력"
                    disabled={isSelectedHolidayCell}
                    className="w-full border border-gray-300 p-2 rounded-md shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>

                <div className="text-xs text-gray-400">
                  {quickEditorAction === 'swap' ? '교환할 수업 칸을 클릭하세요.' : quickEditorAction === 'move' ? '이동할 빈칸을 클릭하세요.' : '셀을 다시 클릭해 선택 해제할 수 있습니다.'}
                </div>

                {selectedCellRecommendations && (
                  <div className="grid grid-cols-1 gap-3 text-xs">
                    <div className="border border-emerald-200 rounded-lg p-3 bg-emerald-50/60">
                      <p className="font-bold text-emerald-800 mb-2">가능한 이동 칸 (빈칸 우선)</p>
                      {selectedCellRecommendations.moveTargets.length > 0 ? (
                        <ul className="space-y-1 text-emerald-900">
                          {selectedCellRecommendations.moveTargets.slice(0, 8).map((item) => (
                            <li key={`move-${item.slotLabel}`}>✅ {item.slotLabel} ({item.reason})</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-emerald-700">이동 가능한 빈칸이 없습니다.</p>
                      )}
                    </div>

                    <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/60">
                      <p className="font-bold text-blue-800 mb-2">가능한 교환 칸</p>
                      {selectedCellRecommendations.swapTargets.length > 0 ? (
                        <ul className="space-y-1 text-blue-900">
                          {selectedCellRecommendations.swapTargets.slice(0, 8).map((item) => (
                            <li key={`swap-${item.slotLabel}`}>✅ {item.slotLabel} ({item.reason})</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-blue-700">교환 가능한 칸이 없습니다.</p>
                      )}
                    </div>

                    <div className="border border-red-200 rounded-lg p-3 bg-red-50/60">
                      <p className="font-bold text-red-800 mb-2">불가 사유</p>
                      {selectedCellRecommendations.blockedTargets.length > 0 ? (
                        <ul className="space-y-1 text-red-900">
                          {selectedCellRecommendations.blockedTargets.slice(0, 6).map((item) => (
                            <li key={`blocked-${item.slotLabel}`}>❌ {item.slotLabel} ({item.reason})</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-red-700">불가한 칸이 없습니다.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </>
        )}

        {viewMode === 'weekly' && showChangeSummary && (
          <div className="mb-4 bg-white border border-emerald-200 rounded-xl p-4 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
              <div>
                <h3 className="font-bold text-emerald-900">공지 및 변경사항</h3>
                <p className="text-xs text-emerald-700">
                  [{currentWeekName}] 기준 전담 변경 {currentWeekSpecialChangeItems.length}건
                </p>
              </div>
              <button
                onClick={copyCurrentWeekChangeSummary}
                className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 w-full md:w-auto"
              >
                공지/변경 복사
              </button>
            </div>

            <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/50 mb-3">
              <p className="text-sm font-bold text-blue-900 mb-2">공지사항</p>
              <textarea
                value={currentWeekNotice}
                onChange={(e) =>
                  setWeeklyNotices((prev) => ({
                    ...prev,
                    [currentWeekName]: e.target.value
                  }))
                }
                placeholder="예) 4.17(금) 체육대회, 5교시까지 운영 / 4.18(토) 과학행사 준비"
                className="w-full min-h-[110px] border border-blue-200 rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="mt-1 text-[11px] text-blue-700">해당 주차 공지사항은 자동 저장되어 다른 선생님과 공유됩니다.</p>
            </div>

            {currentWeekSpecialChangeItems.length > 0 ? (
              <div className="max-h-72 overflow-auto space-y-2">
                {currentWeekSpecialChangeItems.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                    <p className="text-sm font-semibold text-gray-800">{item.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">이번 주 전담 변경사항이 없습니다.</p>
            )}
          </div>
        )}

        {toast.show && (
          <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[80] px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-bounce ${toast.type === 'error' ? 'bg-red-600 text-white' : toast.type === 'info' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>
            {toast.type === 'error' ? <AlertCircle size={20} /> : toast.type === 'info' ? <Info size={20} /> : <CheckCircle size={20} />}
            <span className="font-semibold">{toast.message}</span>
            {toast.actionType === 'undo' && (
              <button
                onClick={handleUndo}
                className="ml-2 px-2 py-1 text-xs rounded bg-white/20 hover:bg-white/30 font-bold"
              >
                되돌리기
              </button>
            )}
            {toast.actionType === 'redo' && (
              <button
                onClick={handleRedo}
                className="ml-2 px-2 py-1 text-xs rounded bg-white/20 hover:bg-white/30 font-bold"
              >
                다시하기
              </button>
            )}
          </div>
        )}

        {pendingResolution && (
          <div className="fixed inset-0 z-[85] bg-black/40 flex items-center justify-center p-3">
            <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-h-[88vh] flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 bg-slate-50 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">전담 충돌 해결안 선택</p>
                  <p className="text-xs text-slate-600 mt-1">
                    [{pendingResolution.weekName}] {pendingResolution.className} {formatSlotLabel(pendingResolution.periodIndex, pendingResolution.dayIndex)} ·
                    {` ${pendingResolution.currentSubject} → ${pendingResolution.nextSubject}`}
                    {pendingResolution.teacherName ? ` (${pendingResolution.teacherName})` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setPendingResolution(null)}
                  className="px-2 py-1 text-xs font-bold rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                >
                  닫기
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3">
                {pendingResolution.plans.map((plan, idx) => (
                  <button
                    key={plan.id}
                    onClick={() => applyResolutionPlan(plan)}
                    className="w-full text-left border border-gray-200 rounded-xl p-3 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-gray-900">
                        {idx + 1}. {plan.title}
                      </p>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                        점수 {plan.score}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-gray-700 space-y-1">
                      {(plan.details || []).map((detail, detailIdx) => (
                        <p key={`${plan.id}-detail-${detailIdx}`}>• {detail}</p>
                      ))}
                    </div>
                    {Array.isArray(plan.warnings) && plan.warnings.length > 0 && (
                      <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        {plan.warnings.join(' ')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {cellSubjectContextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-[70] w-72 bg-white border border-gray-300 rounded-xl shadow-xl p-3"
            style={{ left: `${contextMenuLeft}px`, top: `${contextMenuTop}px` }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-bold text-gray-700 mb-1">우클릭 과목 변경</p>
            <p className="text-[11px] text-gray-500 mb-2">
              [{cellSubjectContextMenu.weekName}] {cellSubjectContextMenu.className} · {DAYS[cellSubjectContextMenu.d]}요일 {PERIODS[cellSubjectContextMenu.p]}교시
            </p>
            <select
              value={contextMenuSubjectValue}
              onChange={(e) => setContextMenuSubjectValue(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm bg-gray-50 font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">빈칸 (삭제)</option>
              {subjectSelectOptions.map((opt) => (
                <option key={`context-${opt.value}`} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="mt-3 flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeCellSubjectContextMenu}
                className="px-2.5 py-1.5 text-xs font-bold bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={applyContextMenuSubjectChange}
                className="px-2.5 py-1.5 text-xs font-bold bg-blue-600 text-white border border-blue-600 rounded hover:bg-blue-700"
              >
                적용
              </button>
            </div>
          </div>
        )}

        {/* ======================= VIEW RENDERING ======================= */}
        
        {viewMode === 'weekly' && weeklyLayoutMode === 'single' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-gray-200 p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800">
                <span className="text-blue-600">[{currentWeekName}]</span> {currentClass}
              </h2>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full border-collapse min-w-[600px]">
                <thead>
                  <tr>
                    <th className="w-16 p-2 text-gray-400 font-medium"></th>
                    {getDatesForWeek(currentWeekName).map((dayWithDate, idx) => <th key={idx} className="p-3 text-lg font-bold text-gray-700 bg-gray-50 border-b-2 border-gray-200 w-1/5">{dayWithDate}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((period, pIndex) => (
                    <tr key={period}>
                      <td className="text-center font-bold text-gray-500 border-r border-gray-100 bg-gray-50/50">{period}교시</td>
                      {DAYS.map((day, dIndex) => {
                        const cell = schedules?.[currentClass]?.[pIndex]?.[dIndex]
                          || createHomeroomFallbackCell(currentClass, pIndex, dIndex, allSubjects);
                        const { style, overlay } = getCellStyles(pIndex, dIndex, cell);
                        return (
                          <td key={`${currentWeekName}-${pIndex}-${dIndex}`} className="p-1 align-middle">
                            <div
                              onClick={() => handleUniversalCellClick(currentWeekName, currentClass, pIndex, dIndex)}
                              onContextMenu={(e) => openCellSubjectContextMenu(e, currentWeekName, currentClass, pIndex, dIndex)}
                              className={style}
                            >
                              {cell.subject ? (
                                <>
                                  <span className="relative z-10">{cell.subject === '휴업일' ? <span className="flex items-center gap-1"><Coffee size={16}/>휴업일</span> : cell.subject}</span>
                                  <div className="flex flex-col items-center mt-1 relative z-10 text-center">
                                    {cell.type !== 'homeroom' && cell.type !== 'holiday' && cell.teacher && (
                                      <span className="text-[11px] font-bold opacity-80 leading-tight">{cell.teacher}</span>
                                    )}
                                    {cell.location && <span className="text-[10px] bg-white/50 px-1.5 py-0.5 mt-1 rounded text-gray-900 border border-black/10 truncate max-w-[80px]">{cell.location}</span>}
                                  </div>
                                </>
                              ) : (
                                <span className="relative z-10 text-xs text-gray-400">(빈칸)</span>
                              )}
                              {overlay}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {viewMode === 'weekly' && weeklyLayoutMode === 'all' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-gray-200 p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-2">
              <h2 className="text-xl font-bold text-gray-800">
                <span className="text-blue-600">[{currentWeekName}]</span> 전체 학급 주간 시간표
              </h2>
              <p className="text-xs text-gray-500">각 학급 주간표를 전체 화면에 배치했습니다. 전담 중복은 빨간 테두리, 전담 원배치/템플릿 불일치는 파란 테두리로 표시되며 텍스트 크기는 상단 슬라이더로 조정할 수 있습니다.</p>
            </div>
            <div className="p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {classNames.map((cls) => (
                <div key={cls} className={`border rounded-xl overflow-hidden ${currentClass === cls ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'}`}>
                  <div className="px-2.5 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <button onClick={() => setCurrentClass(cls)} className="font-bold text-sm text-gray-800 hover:text-blue-600">
                      {cls}
                    </button>
                    {currentClass === cls && <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">기준 학급</span>}
                  </div>
                  <div className="p-1.5">
                    <table className="w-full table-fixed border-collapse min-w-full">
                      <thead>
                        <tr>
                          <th className="w-7 p-1 text-gray-400 font-medium text-[10px]"></th>
                          {DAYS.map((day) => (
                            <th
                              key={`${cls}-${day}`}
                              className="p-1 font-bold text-gray-600 bg-gray-50 border-b border-gray-200"
                              style={{ fontSize: `${Math.max(9, Math.min(14, 11 * getCompactScaleRatio())).toFixed(1)}px` }}
                            >
                              {day}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {PERIODS.map((period, pIndex) => (
                          <tr key={`${cls}-${period}`}>
                            <td
                              className="text-center font-bold text-gray-400 border-r border-gray-100 bg-gray-50/60"
                              style={{ fontSize: `${Math.max(8, Math.min(13, 10 * getCompactScaleRatio())).toFixed(1)}px` }}
                            >
                              {period}
                            </td>
                            {DAYS.map((_, dIndex) => {
                              const cell = schedules[cls][pIndex][dIndex];
                              const { style, overlay } = getCompactCellStyles(cls, pIndex, dIndex, cell);
                              const hasTeacherLine = cell.type === 'special' && Boolean(cell.teacher);
                              return (
                                <td key={`${cls}-${pIndex}-${dIndex}`} className="p-0.5 align-middle">
                                  <div
                                    onClick={() => { setCurrentClass(cls); handleUniversalCellClick(currentWeekName, cls, pIndex, dIndex); }}
                                    onContextMenu={(e) => openCellSubjectContextMenu(e, currentWeekName, cls, pIndex, dIndex)}
                                    className={style}
                                  >
                                    <span className="leading-tight font-semibold text-gray-800" style={getCompactSubjectTextStyle(cell.subject || '-', hasTeacherLine)}>
                                      {cell.subject || '-'}
                                    </span>
                                    {cell.type === 'special' && cell.teacher && (
                                      <span className="leading-tight text-gray-700 truncate max-w-full" style={getCompactTeacherTextStyle(cell.teacher)}>{cell.teacher}</span>
                                    )}
                                    {overlay}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {viewMode === 'monthly' && monthlyLayoutMode === 'matrix' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[75vh]">
            <div className="bg-indigo-50 border-b border-indigo-100 p-3 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Info className="text-indigo-500" size={18} />
                <span className="text-sm text-indigo-800 font-medium">월간 조망 화면에서는 <strong>다른 학급의 전담 수업과도 자유롭게 교환</strong>할 수 있습니다! 전담 중복은 빨간 테두리, 전담 원배치/템플릿 불일치는 파란 테두리로 표시됩니다.</span>
              </div>
            </div>
            <div className="overflow-auto flex-1 relative">
              <table className="w-full border-collapse text-sm min-w-[1000px]">
                <thead className="sticky top-0 z-20 shadow-sm">
                  <tr className="bg-gray-800 text-white">
                    <th className="p-2 w-20 border-r border-gray-700" colSpan={2}>주차/요일</th>
                    <th className="p-2 w-14 border-r border-gray-700">교시</th>
                    {classNames.map(cls => <th key={cls} className="p-2 border-r border-gray-700 font-bold">{cls}</th>)}
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {MONTHS[currentMonthIndex].weekIndices.map(weekIdx => {
                    const weekName = WEEKS[weekIdx];
                    const weekSchedules = allSchedules[weekName];
                    const daysWithDates = getDatesForWeek(weekName);
                    
                    return DAYS.map((day, dIdx) => {
                      return PERIODS.map((period, pIdx) => {
                        return (
                          <tr key={`${weekIdx}-${dIdx}-${pIdx}`} className="hover:bg-blue-50/30">
                            {dIdx === 0 && pIdx === 0 && (
                              <td rowSpan={30} className="border border-gray-300 bg-indigo-50 w-12 text-center relative">
                                <div style={{ writingMode: 'vertical-rl' }} className="rotate-180 font-bold text-indigo-800 mx-auto tracking-widest">{weekName}</div>
                              </td>
                            )}
                            {pIdx === 0 && (
                              <td rowSpan={6} className="border border-gray-300 bg-gray-50 font-bold text-gray-700 w-12 text-center leading-tight">
                                {day}<br/><span className="text-[10px] font-normal text-gray-500">({daysWithDates[dIdx].split('(')[1]}</span>
                              </td>
                            )}
                            <td className="border border-gray-300 text-gray-500 w-14 text-center bg-white">{period}교시</td>
                            {classNames.map(cls => {
                              const cell = weekSchedules?.[cls]?.[pIdx]?.[dIdx]
                                || createHomeroomFallbackCell(cls, pIdx, dIdx, allSubjects);
                              const isSpecial = cell.type !== 'homeroom' && cell.type !== 'empty' && cell.type !== 'holiday';
                              const isHighlighted = hasTeacherHighlightFilter && cell.teacherId && highlightTeacherIds.includes(cell.teacherId);
                              const isDimmed = hasTeacherHighlightFilter && !isHighlighted;
                              const isTemplateMismatch = isCellMismatchedWithTemplate(weekName, cls, pIdx, dIdx, cell);
                              const isTeacherConflict = hasTeacherOverlapConflict(weekName, cls, pIdx, dIdx, cell);
                              const hasForcedConflict = Boolean(cell?.forcedConflict);
                              const isSelected = selectedCell?.weekName === weekName && selectedCell?.className === cls && selectedCell?.p === pIdx && selectedCell?.d === dIdx;
                              const swapTargetState = getSwapTargetState(weekName, cls, pIdx, dIdx, cell);
                              
                              let cellClass = `border border-gray-200 p-1 text-center h-14 relative cursor-pointer transition-all ${isDimmed ? 'opacity-20 grayscale ' : ''} ${isHighlighted ? 'ring-2 ring-inset ring-red-500 font-bold transform scale-105 z-10 shadow-md ' : ''}`;
                              cellClass += getTimetableCellColor(cell) + " ";
                              cellClass += getConflictBorderClassName(isTemplateMismatch, isTeacherConflict, hasForcedConflict);

                              if (isSelected) cellClass += "ring-4 ring-yellow-400 transform scale-105 z-20 shadow-lg ";

                              let overlay = null;
                              if (selectedCell && !isSelected) {
                                if (swapTargetState.active) {
                                  if (swapTargetState.canSwap && swapTargetState.highlightReason === 'special_teacher_available') {
                                    cellClass += "ring-2 ring-inset ring-emerald-500 bg-emerald-50 ";
                                    overlay = <div className="absolute inset-0 bg-emerald-500/10 z-20" />;
                                  } else if (!swapTargetState.canSwap && swapTargetState.blockReason === 'holiday') {
                                    cellClass += "opacity-60 cursor-not-allowed ";
                                    overlay = <div className="absolute inset-0 bg-red-500 bg-opacity-20 flex items-center justify-center z-20"><X className="text-red-600 w-5 h-5 opacity-70" /></div>;
                                  } else if (!swapTargetState.canSwap) {
                                    cellClass += "opacity-60 cursor-not-allowed ";
                                    overlay = <div className="absolute inset-0 bg-black bg-opacity-70 z-20" />;
                                  } else {
                                    cellClass += "hover:ring-2 hover:ring-blue-400 hover:scale-105 z-10 ";
                                  }
                                }
                              }
                              
                              return (
                                <td
                                  key={cls}
                                  className={cellClass}
                                  onClick={() => handleUniversalCellClick(weekName, cls, pIdx, dIdx)}
                                  onContextMenu={(e) => openCellSubjectContextMenu(e, weekName, cls, pIdx, dIdx)}
                                >
                                  <div className="flex flex-col items-center justify-center h-full">
                                    <span className="font-semibold text-gray-800 leading-tight">{cell.subject === '휴업일' ? <Coffee size={14}/> : (cell.subject || '-')}</span>
                                    {isSpecial && !isDimmed && cell.teacher && <span className="text-[9px] text-gray-900 mt-0.5 leading-none">{cell.teacher}</span>}
                                    {cell.location && <span className="text-[9px] text-gray-600 mt-0.5 leading-none truncate w-full px-1">{cell.location}</span>}
                                    {overlay}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      });
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {viewMode === 'monthly' && monthlyLayoutMode === 'class_weekly' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-indigo-50 border-b border-indigo-100 p-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Info className="text-indigo-500" size={18} />
                <span className="text-sm text-indigo-800 font-medium">종합표와 같은 내용(전체 학급)을 주차별 카드 형태로 표시합니다. 전담 중복은 빨간 테두리, 전담 원배치/템플릿 불일치는 파란 테두리로 표시되며, Space+클릭 드래그로 가로/세로 이동할 수 있습니다.</span>
              </div>
            </div>
            <div className="p-2 md:p-3 grid grid-cols-1 gap-3">
              {MONTHS[currentMonthIndex].weekIndices.map((weekIdx) => {
                const weekName = WEEKS[weekIdx];
                const weekSchedules = allSchedules[weekName];
                const dayHeaders = getDatesForWeek(weekName);

                if (!weekSchedules) return null;

                return (
                  <div key={`monthly-all-classes-week-${weekName}`} className="border border-indigo-200 rounded-xl overflow-hidden bg-white">
                    <div className="px-3 py-2 bg-indigo-100 border-b border-indigo-200 flex items-center justify-between">
                      <p className="text-xs font-bold text-indigo-900 truncate">{weekName}</p>
                      <span className="text-[11px] text-indigo-600 font-semibold">
                        {classNames.length > 0 ? `${classNames[0]}~${classNames[classNames.length - 1]}` : '학급 없음'}
                      </span>
                    </div>
                    <div
                      className={`overflow-auto ${isSpacePanMode ? 'cursor-grab select-none' : ''}`}
                      onMouseDown={handlePanSurfaceMouseDown}
                    >
                      <table className="w-full border-collapse min-w-[3200px] table-fixed">
                        <thead>
                          <tr>
                            <th rowSpan={2} className="p-1 w-10 text-[10px] text-gray-500 bg-gray-50 border border-gray-200">교시</th>
                            {dayHeaders.map((dayLabel) => (
                              <th
                                key={`monthly-all-day-head-${weekName}-${dayLabel}`}
                                colSpan={classNames.length}
                                className="p-1.5 font-bold text-gray-700 bg-indigo-50 border border-indigo-100"
                                style={{ fontSize: `${Math.max(9, Math.min(13, 10.5 * getMonthlyScaleRatio())).toFixed(1)}px` }}
                              >
                                {dayLabel}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            {DAYS.map((day) => (
                              classNames.map((cls) => (
                                <th
                                  key={`monthly-all-class-head-${weekName}-${day}-${cls}`}
                                  className="p-0.5 text-[10px] font-semibold text-gray-500 bg-gray-50 border border-gray-200"
                                >
                                  {cls.replace('반', '')}
                                </th>
                              ))
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {PERIODS.map((period, pIdx) => (
                            <tr key={`monthly-all-period-row-${weekName}-${period}`}>
                              <td
                                className="text-center font-bold text-gray-500 border border-gray-200 bg-gray-50"
                                style={{ fontSize: `${Math.max(8, Math.min(12, 9.5 * getMonthlyScaleRatio())).toFixed(1)}px` }}
                              >
                                {period}
                              </td>
                              {DAYS.map((_, dIdx) => (
                                classNames.map((cls) => {
                                  const cell = weekSchedules?.[cls]?.[pIdx]?.[dIdx]
                                    || createHomeroomFallbackCell(cls, pIdx, dIdx, allSubjects);
                                  const { style, overlay } = getMonthlyClassCellStyles(weekName, cls, pIdx, dIdx, cell, true);
                                  const hasTeacherLine = cell.type === 'special' && Boolean(cell.teacher);
                                  const denseFitScale = getMonthlyDenseCellFitScale(cell);
                                  return (
                                    <td key={`monthly-all-cell-${weekName}-${pIdx}-${dIdx}-${cls}`} className="p-0.5 align-middle">
                                      <div
                                        onClick={() => {
                                          if (isSpacePanMode) return;
                                          setCurrentClass(cls);
                                          handleUniversalCellClick(weekName, cls, pIdx, dIdx);
                                        }}
                                        onContextMenu={(e) => openCellSubjectContextMenu(e, weekName, cls, pIdx, dIdx)}
                                        className={style}
                                      >
                                        <span className="leading-tight font-semibold text-gray-800 max-w-full px-0.5 text-center whitespace-normal break-all" style={getMonthlyClassSubjectTextStyle(cell.subject || '-', hasTeacherLine, true, denseFitScale)}>
                                          {cell.subject === '휴업일' ? '휴업' : (cell.subject || '-')}
                                        </span>
                                        {cell.type === 'special' && cell.teacher && (
                                          <span className="leading-tight text-gray-700 max-w-full px-0.5 text-center whitespace-normal break-all" style={getMonthlyClassTeacherTextStyle(cell.teacher, true, denseFitScale)}>{cell.teacher}</span>
                                        )}
                                        {cell.location && (
                                          <span className="leading-tight text-gray-600 max-w-full px-0.5 text-center whitespace-normal break-all" style={getMonthlyClassLocationTextStyle(cell.location, true, denseFitScale)}>
                                            {cell.location}
                                          </span>
                                        )}
                                        {overlay}
                                      </div>
                                    </td>
                                  );
                                })
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ======================= CLASS SUMMARY VIEW (학급별 교과 시수) ======================= */}
        {viewMode === 'class_summary' && (() => {
          const allClassCounts = calculateAllClassesSummary();
          let totalStandard = 0;
          const totalActualByClass = {};
          classNames.forEach(c => totalActualByClass[c] = 0);
          
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 animate-fade-in">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-gray-100 pb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <BookOpen className="text-emerald-600"/> 전체 학급 교과/창체 시수 집계표 (1년 전체)
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 text-center text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-gray-800">
                      <th className="border border-gray-300 p-2 font-bold whitespace-nowrap">과목 / 활동</th>
                      <th className="border border-gray-300 p-2 font-bold bg-yellow-50 w-24">기준 시수</th>
                      {classNames.map(cls => <th key={cls} className="border border-gray-300 p-2 font-bold w-12 md:w-16">{cls}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {allSubjects.filter(s => s !== '휴업일').map(subj => {
                      const standard = Number(standardHours[subj]) || 0;
                      totalStandard += standard;

                      return (
                        <tr key={subj} className="hover:bg-gray-50 transition-colors">
                          <td className="border border-gray-300 p-2 font-bold text-gray-700">{subj}</td>
                          <td className="border border-gray-300 p-1 bg-yellow-50/30">
                            <input 
                              type="number" 
                              value={standardHours[subj] || ''} 
                              onChange={(e) => setStandardHours({...standardHours, [subj]: parseInt(e.target.value) || 0})}
                              className="w-16 border border-gray-300 p-1 rounded text-center focus:ring-2 focus:ring-emerald-500 font-bold"
                              placeholder="0"
                            />
                          </td>
                          {classNames.map(cls => {
                            const actual = allClassCounts[cls][subj] || 0;
                            totalActualByClass[cls] += actual;
                            const diff = actual - standard;
                            
                            let cellColor = "text-gray-600";
                            if (standard > 0) {
                              if (diff > 0) cellColor = "text-blue-600 font-bold bg-blue-50/30";
                              else if (diff < 0) cellColor = "text-red-500 font-bold bg-red-50/30";
                              else cellColor = "text-emerald-600 font-bold bg-emerald-50/30";
                            } else if (actual > 0) {
                              cellColor = "text-blue-600 font-medium";
                            }

                            return (
                              <td key={cls} className={`border border-gray-300 p-2 ${cellColor}`}>
                                {actual > 0 ? actual : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {/* 총계 렌더링 */}
                    <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                      <td className="border border-gray-300 p-2 font-extrabold text-emerald-900">총계</td>
                      <td className="border border-gray-300 p-2 font-extrabold text-emerald-900 text-lg">{totalStandard}</td>
                      {classNames.map(cls => {
                        const total = totalActualByClass[cls];
                        const diff = total - totalStandard;
                        let color = "text-emerald-800";
                        if (totalStandard > 0) {
                           if (diff > 0) color = "text-blue-600";
                           else if (diff < 0) color = "text-red-600";
                        }
                        return (
                          <td key={cls} className={`border border-gray-300 p-2 font-extrabold text-base ${color}`}>
                            {total}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm text-gray-500">
                ※ 휴업일은 시수에 집계되지 않습니다. 기준 시수를 입력하면 각 학급의 실제 배정 시수와 자동 비교됩니다. 일치하면 <span className="text-emerald-600 font-bold bg-emerald-50 px-1 rounded">초록색</span>, 부족하면 <span className="text-red-500 font-bold bg-red-50 px-1 rounded">빨간색</span>, 초과하면 <span className="text-blue-600 font-bold bg-blue-50 px-1 rounded">파란색</span>으로 표시되어 오류를 한눈에 잡을 수 있습니다.
              </p>
            </div>
          );
        })()}

        {/* ======================= TEACHER SUMMARY VIEW (전담 시수) ======================= */}
        {viewMode === 'teacher_summary' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 animate-fade-in">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Calculator className="text-teal-600"/> 교사별 학급 시수 현황표
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-center">
                <thead>
                  <tr className="bg-gray-100 text-gray-800">
                    <th className="border border-gray-300 p-3 font-bold w-32">교사명</th>
                    <th className="border border-gray-300 p-3 font-bold w-24">담당 과목</th>
                    {classNames.map(cls => <th key={cls} className="border border-gray-300 p-3 w-16 text-sm">{cls}</th>)}
                    <th className="border border-gray-300 p-3 font-bold bg-green-50 w-24">총 시수</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherConfigs.map(teacher => {
                    let total = 0;
                    return (
                      <tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
                        <td className="border border-gray-300 p-3 font-bold text-gray-700">{teacher.name}</td>
                        <td className="border border-gray-300 p-3">
                          <span className={`px-2 py-1 rounded text-xs font-bold text-gray-900 ${getSubjectColor(teacher.subject)}`}>{teacher.subject}</span>
                        </td>
                        {classNames.map(cls => {
                          let count = 0;
                          const classRows = schedules?.[cls] || [];
                          classRows.forEach((row) => row.forEach((cell) => { if (cell.teacherId === teacher.id) count++; }));
                          total += count;
                          return <td key={cls} className={`border border-gray-300 p-3 font-medium ${count > 0 ? 'text-blue-600 bg-blue-50/30' : 'text-gray-300'}`}>{count > 0 ? count : '-'}</td>;
                        })}
                        <td className="border border-gray-300 p-3 font-bold text-green-700 bg-green-50/50 text-lg">{total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ======================= SETTINGS VIEW ======================= */}
        {viewMode === 'settings' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 border-b pb-4 gap-3">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Settings className="text-orange-600"/> 기본 설정 및 전담 교사 관리</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={clearAllSpecialConfigurations}
                  className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 font-bold text-sm whitespace-nowrap"
                >
                  전담 설정 전체 삭제
                </button>
                <button
                  onClick={handleResetAllSchedules}
                  className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 font-bold text-sm whitespace-nowrap"
                >
                  전체 초기화 (새로 배정)
                </button>
              </div>
            </div>

            <div className="mb-6 border border-emerald-200 rounded-xl overflow-hidden">
              <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                <h3 className="font-bold text-emerald-900">학급 수 / 과목 설정</h3>
                <span className="text-xs text-emerald-700 font-medium">대회 제출용 기본값으로 손쉽게 재설정할 수 있습니다.</span>
              </div>

              <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">학급 수</label>
                  <input
                    type="number"
                    min={MIN_CLASS_COUNT}
                    max={MAX_CLASS_COUNT}
                    value={classCountInput}
                    onChange={(e) => setClassCountInput(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">허용 범위: {MIN_CLASS_COUNT}~{MAX_CLASS_COUNT}</p>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1">시간표 과목 목록 (줄바꿈 또는 쉼표 구분)</label>
                  <textarea
                    value={subjectsInputText}
                    onChange={(e) => setSubjectsInputText(e.target.value)}
                    className="w-full min-h-[120px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder={'국어\n수학\n사회\n체육\n영어\n창체\n휴업일'}
                  />
                  <p className="mt-1 text-[11px] text-gray-500">`휴업일`은 자동으로 유지됩니다.</p>
                </div>
              </div>

              <div className="px-4 pb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <p className="text-xs text-emerald-700">
                  현재 적용값: 학급 <span className="font-bold">{classCount}개</span> / 과목 <span className="font-bold">{allSubjects.join(', ')}</span>
                </p>
                <button
                  onClick={applyClassAndSubjectSettings}
                  className="px-4 py-2 text-sm font-bold bg-emerald-600 text-white rounded border border-emerald-600 hover:bg-emerald-700"
                >
                  학급/과목 설정 적용
                </button>
              </div>
            </div>

            <div className="mb-6 border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                <h3 className="font-bold text-slate-900">휴업일 지정</h3>
                <span className="text-xs text-slate-600 font-medium">선택한 날짜를 전체 학급 · 전교시 휴업일로 일괄 반영합니다.</span>
              </div>

              <div className="p-4 bg-white grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">주차 선택</label>
                  <select
                    value={holidayWeekIndex}
                    onChange={(e) => setHolidayWeekIndex(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    {WEEKS.map((weekName, idx) => (
                      <option key={`holiday-week-${weekName}`} value={idx}>{weekName}</option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1">요일 선택 (복수 선택 가능)</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day, dIdx) => {
                      const label = getDatesForWeek(holidayTargetWeekName)?.[dIdx] || day;
                      const isSelected = selectedHolidayDayIndices.includes(dIdx);
                      return (
                        <button
                          key={`holiday-day-${day}`}
                          type="button"
                          onClick={() => toggleHolidayDaySelection(dIdx)}
                          className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-colors ${isSelected ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="px-4 pb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <p className="text-xs text-slate-600">
                  현재 선택: <span className="font-bold text-slate-800">{holidayTargetWeekName}</span> · <span className="font-bold text-slate-800">{holidayTargetDayLabels}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const ok = window.confirm(`[${holidayTargetWeekName}] ${holidayTargetDayLabels}을(를) 전체 학급 휴업일로 지정할까요?`);
                      if (!ok) return;
                      applyHolidayToDays(holidayTargetWeekName, selectedHolidayDayIndices);
                    }}
                    className="px-3 py-2 text-xs font-bold bg-slate-700 text-white rounded border border-slate-700 hover:bg-slate-800"
                  >
                    휴업일 지정
                  </button>
                  <button
                    onClick={() => {
                      const ok = window.confirm(`[${holidayTargetWeekName}] ${holidayTargetDayLabels}의 휴업일 지정을 해제할까요?`);
                      if (!ok) return;
                      clearHolidayFromDays(holidayTargetWeekName, selectedHolidayDayIndices);
                    }}
                    className="px-3 py-2 text-xs font-bold bg-white text-slate-700 rounded border border-slate-300 hover:bg-slate-100"
                  >
                    휴업일 해제
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-orange-50 px-4 py-3 border-b border-orange-100 font-bold text-orange-900">등록된 전담 교사 목록</div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-3 border-b border-gray-200">교사명</th>
                        <th className="text-left p-3 border-b border-gray-200">과목</th>
                        <th className="text-left p-3 border-b border-gray-200">담당 학급</th>
                        <th className="text-left p-3 border-b border-gray-200">작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherConfigs.map((teacher) => (
                        <tr key={teacher.id} className="hover:bg-gray-50">
                          <td className="p-3 border-b border-gray-100 font-semibold text-gray-800">{teacher.name}</td>
                          <td className="p-3 border-b border-gray-100">
                            <span className={`px-2 py-1 rounded text-xs font-bold text-gray-900 ${getSubjectColor(teacher.subject)}`}>{teacher.subject}</span>
                          </td>
                          <td className="p-3 border-b border-gray-100">
                            <div className="flex flex-wrap gap-1">
                              {[...teacher.classes].sort((a, b) => a - b).map((num) => (
                                <span key={`${teacher.id}-${num}`} className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">{num}반</span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 border-b border-gray-100">
                            <div className="flex gap-2">
                              <button onClick={() => startTeacherEdit(teacher)} className="px-2.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-bold hover:bg-blue-100">수정</button>
                              <button onClick={() => deleteTeacherConfig(teacher)} className="px-2.5 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-bold hover:bg-red-100">삭제</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {teacherConfigs.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-gray-400">등록된 전담 교사가 없습니다.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <h3 className="font-bold text-gray-800 mb-4">
                  {editingTeacherId ? '전담 교사 수정' : '전담 교사 추가'}
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">교사명</label>
                    <input
                      type="text"
                      value={teacherForm.name}
                      onChange={(e) => setTeacherForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="예: 홍길동"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">담당 과목</label>
                    <select
                      value={teacherForm.subject}
                      onChange={(e) => setTeacherForm((prev) => ({ ...prev, subject: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                    >
                      {teacherAssignableSubjects.map((subject) => (
                        <option key={subject} value={subject}>{subject}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2">담당 학급</label>
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                      {Array.from({ length: classCount }, (_, idx) => idx + 1).map((classNum) => {
                        const isSelected = teacherForm.classes.includes(classNum);
                        return (
                          <button
                            key={classNum}
                            type="button"
                            onClick={() => toggleTeacherClassSelection(classNum)}
                            className={`px-2 py-1.5 rounded text-xs font-bold border transition-colors ${isSelected ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-orange-50'}`}
                          >
                            {classNum}반
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button onClick={saveTeacherConfig} className="flex items-center justify-center gap-1 px-3 py-2 bg-orange-500 text-white rounded-lg font-bold text-sm hover:bg-orange-600">
                      {editingTeacherId ? <Save size={14} /> : <Plus size={14} />}
                      {editingTeacherId ? '수정 저장' : '교사 추가'}
                    </button>
                    <button onClick={resetTeacherForm} className="px-3 py-2 bg-white text-gray-600 border border-gray-300 rounded-lg font-bold text-sm hover:bg-gray-100">
                      입력 초기화
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 border border-indigo-200 rounded-xl overflow-hidden">
              <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <h3 className="font-bold text-indigo-900">전담 시간표 템플릿 작성 (교사별)</h3>
                <div className="flex flex-wrap gap-2">
                  <button onClick={applySpecialTemplateToCurrentWeek} className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded hover:bg-indigo-700">
                    현재 주차 전체학급 배정
                  </button>
                  <button onClick={applySpecialTemplateToAllWeeks} className="px-3 py-1.5 text-xs font-bold bg-violet-100 text-violet-700 border border-violet-200 rounded hover:bg-violet-200">
                    모든 주차 일괄 배정
                  </button>
                </div>
              </div>

              <div className="p-4 bg-white">
                {teacherConfigs.length > 0 ? (
                  <>
                    <div className="flex flex-col md:flex-row md:items-center gap-2 mb-4">
                      <span className="text-xs font-bold text-gray-500">템플릿 교사</span>
                      <select
                        value={selectedTemplateTeacherId}
                        onChange={(e) => setSelectedTemplateTeacherId(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {teacherConfigs.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.name} ({teacher.subject})
                          </option>
                        ))}
                      </select>
                      {selectedTemplateTeacher && (
                        <button
                          onClick={() => clearTeacherTemplate(selectedTemplateTeacher.id)}
                          className="px-3 py-2 text-xs font-bold bg-gray-100 text-gray-700 rounded border border-gray-300 hover:bg-gray-200"
                        >
                          선택 교사 템플릿 비우기
                        </button>
                      )}
                    </div>

                    {selectedTemplateTeacher && (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs min-w-[720px]">
                          <thead>
                            <tr className="bg-gray-50 text-gray-700">
                              <th className="border border-gray-200 p-2 w-16">교시</th>
                              {DAYS.map((day) => (
                                <th key={`tpl-head-${day}`} className="border border-gray-200 p-2">{day}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {PERIODS.map((period, pIndex) => (
                              <tr key={`tpl-row-${period}`}>
                                <td className="border border-gray-200 p-2 text-center font-bold bg-gray-50">{period}교시</td>
                                {DAYS.map((_, dIndex) => (
                                  <td key={`tpl-cell-${pIndex}-${dIndex}`} className="border border-gray-200 p-1">
                                    <select
                                      value={selectedTeacherTemplate[pIndex][dIndex].className}
                                      onChange={(e) => updateTemplateCell(selectedTemplateTeacher.id, pIndex, dIndex, e.target.value)}
                                      className="w-full border border-gray-200 rounded px-2 py-1.5 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                    >
                                      <option value="">- 비움 -</option>
                                      {[...selectedTemplateTeacher.classes].sort((a, b) => a - b).map((num) => {
                                        const className = `${num}반`;
                                        return (
                                          <option key={`tpl-opt-${selectedTemplateTeacher.id}-${className}`} value={className}>
                                            {className}
                                          </option>
                                        );
                                      })}
                                    </select>
                                    <input
                                      type="text"
                                      value={selectedTeacherTemplate[pIndex][dIndex].location}
                                      onChange={(e) => updateTemplateLocation(selectedTemplateTeacher.id, pIndex, dIndex, e.target.value)}
                                      placeholder="비고/장소"
                                      disabled={!selectedTeacherTemplate[pIndex][dIndex].className}
                                      className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-100 disabled:text-gray-400"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-2 text-[11px] text-gray-500">
                          ※ 학급을 선택한 칸에서 비고/장소를 입력하면 배정 시 해당 값이 우선 적용됩니다.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">전담 교사를 먼저 등록해주세요.</p>
                )}
              </div>
            </div>

            <p className="text-gray-500 text-sm mt-4">
              ※ 전담 교사 설정을 바꾼 뒤 기존 시간표에 반영하려면 <span className="font-bold text-red-600">전체 초기화 (새로 배정)</span> 또는 <span className="font-bold text-indigo-700">전담 시간표 템플릿 배정</span>을 실행하세요.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
