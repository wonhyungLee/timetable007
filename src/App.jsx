import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AlertCircle, CheckCircle, Info, CalendarSync, X, ChevronLeft, ChevronRight, Copy, LayoutDashboard, CalendarDays, Calculator, MapPin, Settings, Trash2, Edit2, BookOpen, Coffee, Plus, Save, Eye, EyeOff } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';

// --- [1] 기본 설정 및 학사일정 주차 생성 ---
const DAYS = ['월', '화', '수', '목', '금'];
const PERIODS = [1, 2, 3, 4, 5, 6];
const CLASSES = Array.from({ length: 12 }, (_, i) => `${i + 1}반`);

const ALL_SUBJECTS = [
  '국어', '사회', '도덕', '수학', '과학', '실과', '체육', '음악', '미술', '영어', 
  '자율자치', '동아리', '봉사', '진로', '학교자율', '창체', '휴업일'
];

const HOMEROOM_FLEX_SUBJECTS = ['과학', '체육', '음악'];
const HOMEROOM_OVERRIDE_PREFIX = '__homeroom__::';

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

const SUBJECT_SELECT_OPTIONS = ALL_SUBJECTS.flatMap((subject) => {
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
const initialTeachers = [
  { id: 't1', name: '하승호', subject: '체육', classes: [1,2,3,4,5,6,7,8,9,10] },
  { id: 't2', name: '이지훈', subject: '체육', classes: [11,12] },
  { id: 't3', name: '윤지은', subject: '영어', classes: [1,2,3,4,5,6] },
  { id: 't4', name: '김수연', subject: '영어', classes: [7,8,9,10,11,12] },
  { id: 't5', name: '이소연', subject: '과학', classes: [1,2,3,4,5,6,7,8,9,10] },
  { id: 't6', name: '류동휘', subject: '과학', classes: [11,12] },
  { id: 't7', name: '장지은', subject: '음악', classes: [1,2,3,4,5,6,7,8,9,10,11,12] }
];

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
const generateInitialBaseSchedule = (teachers = initialTeachers) => {
  const schedule = {};
  CLASSES.forEach(cls => {
    schedule[cls] = Array(6).fill(null).map(() => Array(5).fill({ subject: '', type: 'empty' }));
  });

  const specialSubjects = [...new Set(teachers.map(t => t.subject))];
  const teacherOccupied = {}; 
  teachers.forEach(t => teacherOccupied[t.id] = new Set());

  // 1. 전담 배정
  CLASSES.forEach((cls) => {
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
  const defaultSubjects = ['국어', '수학', '사회', '도덕', '미술', '창체'];
  CLASSES.forEach(cls => {
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

const createAllSchedules = (teachers = initialTeachers) => {
  const base = generateInitialBaseSchedule(teachers);
  const allByWeek = {};
  WEEKS.forEach(week => {
    allByWeek[week] = JSON.parse(JSON.stringify(base));
  });
  return allByWeek;
};

const DEFAULT_HOMEROOM_SUBJECTS = ['국어', '수학', '사회', '도덕', '미술', '창체'];

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

const createHomeroomFallbackCell = (className, periodIndex, dayIndex) => ({
  subject: DEFAULT_HOMEROOM_SUBJECTS[(periodIndex + dayIndex) % DEFAULT_HOMEROOM_SUBJECTS.length],
  type: 'homeroom',
  location: '',
  id: `${className}-${periodIndex}-${dayIndex}`
});

const SHARED_STATE_ROW_ID = 'main';
const SYNC_DEBOUNCE_MS = 1200;

const isValidSharedPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  if (!payload.allSchedules || typeof payload.allSchedules !== 'object') return false;
  if (!payload.standardHours || typeof payload.standardHours !== 'object') return false;
  if (!Array.isArray(payload.teacherConfigs)) return false;
  if (payload.specialTemplates !== undefined && (!payload.specialTemplates || typeof payload.specialTemplates !== 'object')) return false;
  return true;
};

// --- [4] 메인 컴포넌트 ---
export default function TimetableApp() {
  const [teacherConfigs, setTeacherConfigs] = useState(initialTeachers);
  const [allSchedules, setAllSchedules] = useState(() => createAllSchedules(initialTeachers));

  // 기준 시수 상태 관리
  const [standardHours, setStandardHours] = useState(() => {
    const initial = {};
    ALL_SUBJECTS.forEach(s => initial[s] = 0);
    return initial;
  });

  const [viewMode, setViewMode] = useState('weekly'); // weekly, monthly, class_summary, teacher_summary, settings
  const [weeklyLayoutMode, setWeeklyLayoutMode] = useState('single'); // single, all
  const [monthlyLayoutMode, setMonthlyLayoutMode] = useState('class_weekly'); // matrix, class_weekly
  const [compactTextScalePercent, setCompactTextScalePercent] = useState(100);
  const [monthlyTextScalePercent, setMonthlyTextScalePercent] = useState(100);
  const [holidayWeekIndex, setHolidayWeekIndex] = useState(0);
  const [holidayDayIndex, setHolidayDayIndex] = useState(0);
  const [isTopHeaderHidden, setIsTopHeaderHidden] = useState(false);
  const [isSpacePanMode, setIsSpacePanMode] = useState(false);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [currentClass, setCurrentClass] = useState('1반');
  const [selectedCell, setSelectedCell] = useState(null);
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0);
  const [highlightTeacherIds, setHighlightTeacherIds] = useState([]);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
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
  const isRemoteReadyRef = useRef(!isSupabaseConfigured);
  const isApplyingRemoteRef = useRef(false);
  const lastSyncedPayloadRef = useRef('');
  const saveTimerRef = useRef(null);
  const clientIdRef = useRef(`client-${Math.random().toString(36).slice(2, 10)}`);
  const panDragRef = useRef(null);
  
  const currentWeekName = WEEKS[currentWeekIndex];
  const holidayTargetWeekName = WEEKS[holidayWeekIndex] || WEEKS[0];
  const holidayTargetDayLabel = getDatesForWeek(holidayTargetWeekName)?.[holidayDayIndex] || DAYS[holidayDayIndex];
  const schedules = allSchedules[currentWeekName];
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
  const selectedSubjectOptionValue = selectedCell
    ? (
      selectedCell.type === 'homeroom' && HOMEROOM_FLEX_SUBJECTS.includes(selectedCell.subject)
        ? toHomeroomOverrideValue(selectedCell.subject)
        : (selectedCell.subject || '')
    )
    : '';
  const hasTeacherHighlightFilter = highlightTeacherIds.length > 0;
  const templateExpectationMap = useMemo(() => {
    const map = {};
    CLASSES.forEach((className) => {
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
  }, [teacherConfigs, normalizedSpecialTemplates]);

  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => setToast({ ...toast, show: false }), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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

  const showNotification = (message, type = 'error') => setToast({ show: true, message, type });
  const teacherAssignableSubjects = ALL_SUBJECTS.filter(subject => subject !== '휴업일');

  const resetTeacherForm = () => {
    setEditingTeacherId(null);
    setTeacherForm({
      name: '',
      subject: teacherAssignableSubjects.includes('체육') ? '체육' : (teacherAssignableSubjects[0] || ''),
      classes: []
    });
  };

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
    const selectedClasses = [...new Set(teacherForm.classes)].sort((a, b) => a - b);

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

      CLASSES.forEach((className) => {
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
              location: (templateCell.location || '').trim() || getDefaultLocation(teacher.subject, d, p),
              id: `${targetClass}-${p}-${d}-special`
            };
          }
        }
      }

      newAllSchedules[weekName] = weekSchedule;
    }

    setSpecialTemplates(normalizedTemplates);
    setAllSchedules(newAllSchedules);
    setSelectedCell(null);
    showNotification(
      targetWeeks.length === 1
        ? `전담 시간표를 [${targetWeeks[0]}] 전체 학급에 배정했습니다.`
        : '전담 시간표를 모든 주차 전체 학급에 배정했습니다.',
      'success'
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

    const applyRemotePayload = (payload, syncedAt) => {
      if (!isValidSharedPayload(payload)) return;

      const normalizedRemoteTemplates = normalizeSpecialTemplates(
        payload.teacherConfigs,
        payload.specialTemplates || {}
      );

      isApplyingRemoteRef.current = true;
      setAllSchedules(payload.allSchedules);
      setStandardHours(payload.standardHours);
      setTeacherConfigs(payload.teacherConfigs);
      setSpecialTemplates(normalizedRemoteTemplates);
      lastSyncedPayloadRef.current = JSON.stringify({
        ...payload,
        specialTemplates: normalizedRemoteTemplates
      });
      setLastSyncedAt(syncedAt || new Date().toISOString());
      setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 0);
    };

    const ensureInitialState = async () => {
      const { data, error } = await supabase
        .from('timetable_state')
        .select('payload, updated_at')
        .eq('id', SHARED_STATE_ROW_ID)
        .maybeSingle();

      if (!isMounted) return;

      if (error) {
        setSyncStatus('동기화 오류 (초기 조회 실패)');
        isRemoteReadyRef.current = true;
        return;
      }

      if (data?.payload && isValidSharedPayload(data.payload)) {
        applyRemotePayload(data.payload, data.updated_at);
        setSyncStatus('실시간 동기화 연결됨');
      } else {
        const initialPayload = { allSchedules, standardHours, teacherConfigs, specialTemplates };
        const payloadText = JSON.stringify(initialPayload);
        const { error: upsertError } = await supabase.from('timetable_state').upsert(
          { id: SHARED_STATE_ROW_ID, payload: initialPayload, updated_by: clientIdRef.current },
          { onConflict: 'id' }
        );

        if (!isMounted) return;

        if (upsertError) {
          setSyncStatus('동기화 오류 (초기 저장 실패)');
        } else {
          lastSyncedPayloadRef.current = payloadText;
          setLastSyncedAt(new Date().toISOString());
          setSyncStatus('실시간 동기화 연결됨');
        }
      }

      isRemoteReadyRef.current = true;
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
          if (!isValidSharedPayload(payload.new?.payload)) return;

          applyRemotePayload(payload.new.payload, payload.new.updated_at);
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
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    if (!isRemoteReadyRef.current) return undefined;
    if (isApplyingRemoteRef.current) return undefined;

    const payload = { allSchedules, standardHours, teacherConfigs, specialTemplates };
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
      setSyncStatus('실시간 동기화 연결됨');
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [allSchedules, standardHours, teacherConfigs, specialTemplates]);

  // 충돌 검사 (선생님 기준)
  const isSwapValid = (sourceCell, targetWeek, targetClass, targetP, targetD) => {
    const targetCell = allSchedules[targetWeek][targetClass][targetP][targetD];
    const sourceWeek = sourceCell.weekName;
    const sourceClass = sourceCell.className;
    const sourceP = sourceCell.p;
    const sourceD = sourceCell.d;

    // 휴업일이나 빈칸은 충돌 검사 제외
    if (sourceCell.type !== 'homeroom' && sourceCell.type !== 'empty' && sourceCell.type !== 'holiday' && sourceCell.teacherId) {
      for (const cls of CLASSES) {
        if (cls === targetClass) continue;
        if (sourceWeek === targetWeek && sourceP === targetP && sourceD === targetD && cls === sourceClass) continue;
        if (allSchedules[targetWeek][cls][targetP][targetD].teacherId === sourceCell.teacherId) {
          return { valid: false, reason: `[${targetWeek}] ${sourceCell.teacher} 선생님이 ${cls} 수업 중입니다.` };
        }
      }
    }
    if (targetCell.type !== 'homeroom' && targetCell.type !== 'empty' && targetCell.type !== 'holiday' && targetCell.teacherId) {
      for (const cls of CLASSES) {
        if (cls === sourceClass) continue;
        if (sourceWeek === targetWeek && sourceP === targetP && sourceD === targetD && cls === targetClass) continue;
        if (allSchedules[sourceWeek][cls][sourceP][sourceD].teacherId === targetCell.teacherId) {
          return { valid: false, reason: `[${sourceWeek}] ${targetCell.teacher} 선생님이 ${cls} 수업 중입니다.` };
        }
      }
    }
    return { valid: true };
  };

  const handleUniversalCellClick = (wName, cName, p, d) => {
    const clickedCell = allSchedules[wName][cName][p][d];

    if (selectedCell && selectedCell.weekName === wName && selectedCell.className === cName && selectedCell.p === p && selectedCell.d === d) {
      setSelectedCell(null);
      return;
    }

    if (!selectedCell) {
      setSelectedCell({ weekName: wName, className: cName, p, d, ...clickedCell });
    } else {
      const validation = isSwapValid(selectedCell, wName, cName, p, d);
      if (!validation.valid) {
        showNotification(validation.reason, 'error');
        setSelectedCell(null);
        return;
      }
      
      const newAllSchedules = { ...allSchedules };
      const w1 = selectedCell.weekName; const c1 = selectedCell.className; const p1 = selectedCell.p; const d1 = selectedCell.d;

      newAllSchedules[w1] = { ...newAllSchedules[w1] };
      newAllSchedules[w1][c1] = [...newAllSchedules[w1][c1]];
      newAllSchedules[w1][c1][p1] = [...newAllSchedules[w1][c1][p1]];

      if (w1 !== wName) {
        newAllSchedules[wName] = { ...newAllSchedules[wName] };
        newAllSchedules[wName][cName] = [...newAllSchedules[wName][cName]];
        newAllSchedules[wName][cName][p] = [...newAllSchedules[wName][cName][p]];
      }

      const temp = newAllSchedules[wName][cName][p][d];
      newAllSchedules[wName][cName][p][d] = newAllSchedules[w1][c1][p1][d1];
      newAllSchedules[w1][c1][p1][d1] = temp;

      setAllSchedules(newAllSchedules);
      setSelectedCell(null);
      showNotification(`시간표가 성공적으로 변경되었습니다!`, 'success');
    }
  };

  // 📝 리스트에서 과목 바로 변경 또는 삭제(빈칸) 처리
  const handleDirectSubjectChange = (newSubjectSelection) => {
    if (!selectedCell) return;
    const { subject: newSubject, forceHomeroom } = parseSubjectSelection(newSubjectSelection);
    const { weekName, className, p, d } = selectedCell;
    const newAllSchedules = { ...allSchedules };

    newAllSchedules[weekName] = { ...newAllSchedules[weekName] };
    newAllSchedules[weekName][className] = [...newAllSchedules[weekName][className]];
    newAllSchedules[weekName][className][p] = [...newAllSchedules[weekName][className][p]];

    if (!newSubject) {
      // 수업 삭제 (빈칸 처리)
      newAllSchedules[weekName][className][p][d] = { subject: '', type: 'empty', id: `${className}-${p}-${d}` };
      showNotification('수업이 삭제되었습니다. (빈칸)', 'success');
    } else {
      // 과목 변경
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

          // 선생님 충돌 사전 검사
          for (const cls of CLASSES) {
            if (cls === className) continue;
            if (allSchedules[weekName][cls][p][d].teacherId === newTeacherId) {
              showNotification(`[${weekName}] ${newTeacherName} 선생님이 이미 ${cls} 수업 중입니다! 변경 불가.`, 'error');
              return;
            }
          }
        }
      }

      // 기존 비고/장소가 있다면 유지, 없으면 기본 장소 배정
      const finalLocation = selectedCell.location ? selectedCell.location : newLocation;

      newAllSchedules[weekName][className][p][d] = {
        subject: newSubject,
        type: newType,
        teacherId: newTeacherId,
        teacher: newTeacherName,
        location: finalLocation,
        id: `${className}-${p}-${d}`
      };
      showNotification(
        `${newSubject}${forceHomeroom ? ' (담임)' : ''} 과목으로 변경되었습니다.`,
        'success'
      );
    }

    setAllSchedules(newAllSchedules);
    setSelectedCell({ weekName, className, p, d, ...newAllSchedules[weekName][className][p][d] });
  };

  const handleLocationChange = (newLocation) => {
    if (!selectedCell) return; // 모든 교과에서 비고/장소 입력 가능
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
    const msg = `현재 [${currentWeekName}]의 '${currentClass}' 시간표를 이후 모든 주차에 덮어쓰시겠습니까?\n\n⚠️ 주의: 이후 주차에 이미 작성해둔 '${currentClass}'의 시간표 내용이 있다면 모두 지워지고 현재 시간표로 덮어씌워집니다.`;
      
    if (!window.confirm(msg)) return;
    
    const newAllSchedules = { ...allSchedules };
    const classTemplate = JSON.stringify(newAllSchedules[currentWeekName][currentClass]);
    
    for (let i = currentWeekIndex + 1; i < WEEKS.length; i++) {
      newAllSchedules[WEEKS[i]] = { ...newAllSchedules[WEEKS[i]] };
      newAllSchedules[WEEKS[i]][currentClass] = JSON.parse(classTemplate);
    }
    
    setAllSchedules(newAllSchedules);
    showNotification(`이후 모든 주차에 성공적으로 반영되었습니다.`, 'success');
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
      location: (expected.location || '').trim() || getDefaultLocation(expected.subject, dayIndex, periodIndex),
      id: `${className}-${periodIndex}-${dayIndex}-special`
    };
  };

  const applyHolidayToDay = (weekName, dayIndex) => {
    const sourceWeek = allSchedules[weekName];
    if (!sourceWeek) {
      showNotification('선택한 주차 정보를 찾을 수 없습니다.', 'error');
      return;
    }

    const nextAllSchedules = { ...allSchedules, [weekName]: { ...sourceWeek } };

    CLASSES.forEach((className) => {
      const classRows = sourceWeek[className];
      nextAllSchedules[weekName][className] = classRows.map((row, periodIndex) => {
        const copiedRow = [...row];
        copiedRow[dayIndex] = {
          subject: '휴업일',
          type: 'holiday',
          teacherId: null,
          teacher: '',
          location: '',
          id: `${className}-${periodIndex}-${dayIndex}-holiday`
        };
        return copiedRow;
      });
    });

    setAllSchedules(nextAllSchedules);
    setSelectedCell(null);
    showNotification(`[${weekName}] ${getDatesForWeek(weekName)[dayIndex]} 전체 학급을 휴업일로 지정했습니다.`, 'success');
  };

  const clearHolidayFromDay = (weekName, dayIndex) => {
    const sourceWeek = allSchedules[weekName];
    if (!sourceWeek) {
      showNotification('선택한 주차 정보를 찾을 수 없습니다.', 'error');
      return;
    }

    const nextAllSchedules = { ...allSchedules, [weekName]: { ...sourceWeek } };
    let restoredCount = 0;

    CLASSES.forEach((className) => {
      const classRows = sourceWeek[className];
      nextAllSchedules[weekName][className] = classRows.map((row, periodIndex) => {
        const copiedRow = [...row];
        const cell = copiedRow[dayIndex];
        const isHolidayCell = cell?.type === 'holiday' || cell?.subject === '휴업일';
        if (!isHolidayCell) return copiedRow;

        copiedRow[dayIndex] = createCellFromExpectationOrFallback(className, periodIndex, dayIndex);
        restoredCount += 1;
        return copiedRow;
      });
    });

    if (restoredCount === 0) {
      showNotification('선택한 요일에는 휴업일 지정 칸이 없습니다.', 'error');
      return;
    }

    setAllSchedules(nextAllSchedules);
    setSelectedCell(null);
    showNotification(`[${weekName}] ${getDatesForWeek(weekName)[dayIndex]} 휴업일 지정을 해제했습니다.`, 'success');
  };

  const getCellStyles = (p, d, cell) => {
    const isSelected = selectedCell?.weekName === currentWeekName && selectedCell?.className === currentClass && selectedCell?.p === p && selectedCell?.d === d;
    let baseStyle = "relative transition-all duration-200 ease-in-out border border-gray-300 p-2 h-24 flex flex-col items-center justify-center cursor-pointer font-medium text-lg rounded-sm ";
    
    baseStyle += getSubjectColor(cell.subject) + " ";

    if (isCellMismatchedWithTemplate(currentClass, p, d, cell)) {
      baseStyle += "border-red-500 border-2 ";
    }

    if (isSelected) baseStyle += "ring-4 ring-yellow-400 transform scale-105 z-10 shadow-lg ";

    let overlay = null;
    if (selectedCell && !isSelected) {
      const validation = isSwapValid(selectedCell, currentWeekName, currentClass, p, d);
      if (!validation.valid) {
        baseStyle += "opacity-50 cursor-not-allowed ";
        overlay = <div className="absolute inset-0 bg-red-500 bg-opacity-20 flex items-center justify-center z-20"><X className="text-red-600 w-8 h-8 opacity-70" /></div>;
      } else {
        baseStyle += "hover:ring-2 hover:ring-blue-400 hover:scale-105 z-10 ";
      }
    }
    return { style: baseStyle, overlay };
  };

  const isCellMismatchedWithTemplate = (className, periodIndex, dayIndex, cell) => {
    const expected = templateExpectationMap[className]?.[periodIndex]?.[dayIndex] ?? null;
    const actual = cell || { subject: '', type: 'empty', teacherId: null, location: '' };

    // 휴업일은 설정에서 의도적으로 지정한 예외로 간주
    if (actual.type === 'holiday' || actual.subject === '휴업일') return false;

    // 템플릿에 동일 슬롯의 기대값이 2개 이상이면 템플릿 자체 충돌로 간주
    if (Array.isArray(expected)) return true;

    if (!expected) {
      return actual.type === 'special';
    }

    if (actual.type !== 'special') return true;
    if (actual.teacherId !== expected.teacherId) return true;
    if ((actual.subject || '') !== expected.subject) return true;

    const actualLocation = (actual.location || '').trim();
    const expectedLocation = (expected.location || '').trim();
    if (actualLocation !== expectedLocation) return true;

    return false;
  };

  const getCompactCellStyles = (className, p, d, cell) => {
    const isSelected = selectedCell?.weekName === currentWeekName && selectedCell?.className === className && selectedCell?.p === p && selectedCell?.d === d;
    let baseStyle = 'relative transition-all duration-150 ease-in-out border border-gray-300 p-1 h-[60px] flex flex-col items-center justify-center cursor-pointer rounded ';
    baseStyle += getSubjectColor(cell.subject) + ' ';

    if (isCellMismatchedWithTemplate(className, p, d, cell)) {
      baseStyle += 'border-red-500 border-2 ';
    }

    if (isSelected) baseStyle += 'ring-2 ring-yellow-400 scale-[1.03] z-20 shadow ';

    let overlay = null;
    if (selectedCell && !isSelected) {
      const validation = isSwapValid(selectedCell, currentWeekName, className, p, d);
      if (!validation.valid) {
        baseStyle += 'opacity-50 cursor-not-allowed ';
        overlay = <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center z-20"><X className="text-red-600 w-4 h-4 opacity-70" /></div>;
      } else {
        baseStyle += 'hover:ring-2 hover:ring-blue-300 hover:scale-[1.02] ';
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
    let baseStyle = `relative transition-all duration-150 ease-in-out border border-gray-300 ${dense ? 'p-0.5 h-[52px] rounded-sm' : 'p-1 h-[78px] rounded'} flex flex-col items-center justify-center cursor-pointer `;
    baseStyle += getSubjectColor(cell.subject) + ' ';

    if (isCellMismatchedWithTemplate(className, p, d, cell)) {
      baseStyle += 'border-red-500 border-2 ';
    }
    if (isSelected) baseStyle += dense ? 'ring-1 ring-yellow-400 z-20 shadow ' : 'ring-2 ring-yellow-400 scale-[1.02] z-20 shadow ';

    let overlay = null;
    if (selectedCell && !isSelected) {
      const validation = isSwapValid(selectedCell, weekName, className, p, d);
      if (!validation.valid) {
        baseStyle += 'opacity-50 cursor-not-allowed ';
        overlay = <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center z-20"><X className={`text-red-600 ${dense ? 'w-3 h-3' : 'w-4 h-4'} opacity-70`} /></div>;
      } else {
        baseStyle += dense ? 'hover:ring-1 hover:ring-blue-300 ' : 'hover:ring-2 hover:ring-blue-300 hover:scale-[1.01] ';
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
    CLASSES.forEach(cls => {
      counts[cls] = {};
      ALL_SUBJECTS.forEach(s => counts[cls][s] = 0);
    });
    
    Object.values(allSchedules).forEach(week => {
      CLASSES.forEach(cls => {
        week[cls].forEach(dayRows => {
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
      <div className={`${isWideContentMode ? 'w-full' : 'max-w-[1400px]'} mx-auto`}>
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
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${isSupabaseConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                    {syncStatus}
                  </span>
                  {lastSyncedAt && (
                    <span className="text-gray-400">
                      마지막 동기화: {new Date(lastSyncedAt).toLocaleTimeString('ko-KR')}
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
                {CLASSES.map(cls => (
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
                <button onClick={applyToFutureWeeks} className="flex justify-center items-center gap-1 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 text-sm font-bold whitespace-nowrap shadow-sm">
                  <Copy size={16} /> 이후 덮어쓰기 (현재 반)
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
                    종합표 내용(1~12반)을 주차 카드 형태로 표시
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

        {/* 🛠️ [공통 퀵 에디터] 과목 변경 / 삭제 / 비고 입력 */}
        {selectedCell && (viewMode === 'weekly' || viewMode === 'monthly') && (
          <div className="mb-4 bg-white border-2 border-yellow-400 p-4 rounded-xl flex flex-col xl:flex-row items-start xl:items-center gap-4 shadow-md animate-fade-in relative">
            <div className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 cursor-pointer" onClick={() => setSelectedCell(null)}>
              <X size={20} />
            </div>
            
            <div className="flex items-center gap-2 font-bold text-gray-800">
              <Edit2 className="text-yellow-500" size={20} />
              <span>[{selectedCell.weekName}] {selectedCell.className} - {DAYS[selectedCell.d]}요일 {PERIODS[selectedCell.p]}교시</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-gray-500">과목 변경:</span>
              <select 
                value={selectedSubjectOptionValue} 
                onChange={(e) => handleDirectSubjectChange(e.target.value)}
                className="border border-gray-300 p-2 rounded-md shadow-inner focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-gray-50 font-bold text-gray-700"
              >
                <option value="" disabled>-- 과목 선택 --</option>
                {SUBJECT_SELECT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400">과학/체육/음악은 전담/담임 선택 가능</span>

              <button 
                onClick={() => handleDirectSubjectChange('')} 
                className="flex items-center gap-1 bg-red-50 text-red-600 px-3 py-2 rounded border border-red-200 hover:bg-red-100 font-bold text-sm transition"
              >
                <Trash2 size={16} /> 수업 삭제 (빈칸)
              </button>
            </div>

            <div className="flex items-center gap-2 ml-0 xl:ml-auto pt-4 xl:pt-0 border-t xl:border-t-0 border-gray-200 w-full xl:w-auto">
              <MapPin className="text-gray-400" size={18} />
              <span className="text-sm font-semibold text-gray-500 whitespace-nowrap">비고/장소:</span>
              <input 
                type="text" 
                value={selectedCell.location || ''} 
                onChange={(e) => handleLocationChange(e.target.value)}
                placeholder="비고나 장소 입력"
                className="border border-gray-300 p-2 rounded-md shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 md:w-64 text-sm"
              />
            </div>
            
            {/* 자리 교체 안내 */}
            <div className="w-full text-xs text-gray-400 mt-2 xl:mt-0 xl:absolute xl:bottom-1 xl:right-4 xl:w-auto xl:text-right">
              자리를 맞바꾸려면 다른 칸을 클릭하세요.
            </div>
          </div>
        )}

        {toast.show && (
          <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-bounce ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
            {toast.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
            <span className="font-semibold">{toast.message}</span>
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
                        const cell = schedules[currentClass][pIndex][dIndex];
                        const { style, overlay } = getCellStyles(pIndex, dIndex, cell);
                        return (
                          <td key={`${currentWeekName}-${pIndex}-${dIndex}`} className="p-1 align-middle">
                            <div onClick={() => handleUniversalCellClick(currentWeekName, currentClass, pIndex, dIndex)} className={style}>
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
              <p className="text-xs text-gray-500">각 학급 주간표를 전체 화면에 배치했습니다. 템플릿과 다른 칸은 빨간 테두리로 표시되며 텍스트 크기는 상단 슬라이더로 조정할 수 있습니다.</p>
            </div>
            <div className="p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {CLASSES.map((cls) => (
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
                                  <div onClick={() => { setCurrentClass(cls); handleUniversalCellClick(currentWeekName, cls, pIndex, dIndex); }} className={style}>
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
                <span className="text-sm text-indigo-800 font-medium">월간 조망 화면에서는 <strong>다른 학급의 전담 수업과도 자유롭게 교환</strong>할 수 있습니다! 템플릿과 다른 칸은 빨간 테두리로 표시됩니다.</span>
              </div>
            </div>
            <div className="overflow-auto flex-1 relative">
              <table className="w-full border-collapse text-sm min-w-[1000px]">
                <thead className="sticky top-0 z-20 shadow-sm">
                  <tr className="bg-gray-800 text-white">
                    <th className="p-2 w-20 border-r border-gray-700" colSpan={2}>주차/요일</th>
                    <th className="p-2 w-14 border-r border-gray-700">교시</th>
                    {CLASSES.map(cls => <th key={cls} className="p-2 border-r border-gray-700 font-bold">{cls}</th>)}
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
                            {CLASSES.map(cls => {
                              const cell = weekSchedules[cls][pIdx][dIdx];
                              const isSpecial = cell.type !== 'homeroom' && cell.type !== 'empty' && cell.type !== 'holiday';
                              const isHighlighted = hasTeacherHighlightFilter && cell.teacherId && highlightTeacherIds.includes(cell.teacherId);
                              const isDimmed = hasTeacherHighlightFilter && !isHighlighted;
                              const isTemplateMismatch = isCellMismatchedWithTemplate(cls, pIdx, dIdx, cell);
                              const isSelected = selectedCell?.weekName === weekName && selectedCell?.className === cls && selectedCell?.p === pIdx && selectedCell?.d === dIdx;
                              
                              let cellClass = `border border-gray-200 p-1 text-center h-14 relative cursor-pointer transition-all ${isDimmed ? 'opacity-20 grayscale ' : ''} ${isHighlighted ? 'ring-2 ring-inset ring-red-500 font-bold transform scale-105 z-10 shadow-md ' : ''}`;
                              cellClass += getSubjectColor(cell.subject) + " ";
                              if (isTemplateMismatch) cellClass += "border-red-500 border-2 ";

                              if (isSelected) cellClass += "ring-4 ring-yellow-400 transform scale-105 z-20 shadow-lg ";

                              let overlay = null;
                              if (selectedCell && !isSelected) {
                                const validation = isSwapValid(selectedCell, weekName, cls, pIdx, dIdx);
                                if (!validation.valid) {
                                  cellClass += "opacity-50 cursor-not-allowed ";
                                  overlay = <div className="absolute inset-0 bg-red-500 bg-opacity-20 flex items-center justify-center z-20"><X className="text-red-600 w-5 h-5 opacity-70" /></div>;
                                } else {
                                  cellClass += "hover:ring-2 hover:ring-blue-400 hover:scale-105 z-10 ";
                                }
                              }
                              
                              return (
                                <td key={cls} className={cellClass} onClick={() => handleUniversalCellClick(weekName, cls, pIdx, dIdx)}>
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
                <span className="text-sm text-indigo-800 font-medium">종합표와 같은 내용(전체 학급)을 주차별 카드 형태로 표시합니다. 템플릿과 다른 칸은 빨간 테두리로 표시되며, Space+클릭 드래그로 가로/세로 이동할 수 있습니다.</span>
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
                      <span className="text-[11px] text-indigo-600 font-semibold">1반~12반</span>
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
                                colSpan={CLASSES.length}
                                className="p-1.5 font-bold text-gray-700 bg-indigo-50 border border-indigo-100"
                                style={{ fontSize: `${Math.max(9, Math.min(13, 10.5 * getMonthlyScaleRatio())).toFixed(1)}px` }}
                              >
                                {dayLabel}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            {DAYS.map((day) => (
                              CLASSES.map((cls) => (
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
                                CLASSES.map((cls) => {
                                  const cell = weekSchedules[cls][pIdx][dIdx];
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
          CLASSES.forEach(c => totalActualByClass[c] = 0);
          
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
                      {CLASSES.map(cls => <th key={cls} className="border border-gray-300 p-2 font-bold w-12 md:w-16">{cls}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {ALL_SUBJECTS.filter(s => s !== '휴업일').map(subj => {
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
                          {CLASSES.map(cls => {
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
                      {CLASSES.map(cls => {
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
                    {CLASSES.map(cls => <th key={cls} className="border border-gray-300 p-3 w-16 text-sm">{cls}</th>)}
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
                        {CLASSES.map(cls => {
                          let count = 0;
                          schedules[cls].forEach(row => row.forEach(cell => { if(cell.teacherId === teacher.id) count++; }));
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
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Settings className="text-orange-600"/> 전담 교사 관리</h2>
              <button onClick={() => window.confirm('현재 전담 교사 설정으로 전체 시간표를 새로 배정하시겠습니까?') && setAllSchedules(createAllSchedules(teacherConfigs))} className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 font-bold text-sm whitespace-nowrap">전체 초기화 (새로 배정)</button>
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
                  <label className="block text-xs font-bold text-gray-500 mb-1">요일 선택</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day, dIdx) => {
                      const label = getDatesForWeek(holidayTargetWeekName)?.[dIdx] || day;
                      const isSelected = holidayDayIndex === dIdx;
                      return (
                        <button
                          key={`holiday-day-${day}`}
                          type="button"
                          onClick={() => setHolidayDayIndex(dIdx)}
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
                  현재 선택: <span className="font-bold text-slate-800">{holidayTargetWeekName}</span> · <span className="font-bold text-slate-800">{holidayTargetDayLabel}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const ok = window.confirm(`[${holidayTargetWeekName}] ${holidayTargetDayLabel}을(를) 전체 학급 휴업일로 지정할까요?`);
                      if (!ok) return;
                      applyHolidayToDay(holidayTargetWeekName, holidayDayIndex);
                    }}
                    className="px-3 py-2 text-xs font-bold bg-slate-700 text-white rounded border border-slate-700 hover:bg-slate-800"
                  >
                    휴업일 지정
                  </button>
                  <button
                    onClick={() => {
                      const ok = window.confirm(`[${holidayTargetWeekName}] ${holidayTargetDayLabel}의 휴업일 지정을 해제할까요?`);
                      if (!ok) return;
                      clearHolidayFromDay(holidayTargetWeekName, holidayDayIndex);
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
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from({ length: 12 }, (_, idx) => idx + 1).map((classNum) => {
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
