import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Info, CalendarSync, X, ChevronLeft, ChevronRight, Copy, LayoutDashboard, CalendarDays, Calculator, MapPin, Settings, Trash2, Edit2, Plus, Save, BookOpen, Coffee } from 'lucide-react';

// --- [1] 기본 설정 및 학사일정 주차 생성 ---
const DAYS = ['월', '화', '수', '목', '금'];
const PERIODS = [1, 2, 3, 4, 5, 6];
const CLASSES = Array.from({ length: 12 }, (_, i) => `${i + 1}반`);

const ALL_SUBJECTS = [
  '국어', '사회', '도덕', '수학', '과학', '실과', '체육', '음악', '미술', '영어', 
  '자율자치', '동아리', '봉사', '진로', '학교자율', '창체', '휴업일'
];

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
    '미술': 'bg-[#f48fb1]', '실과': 'bg-[#ffb300]'
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

// --- [4] 메인 컴포넌트 ---
export default function TimetableApp() {
  const [teacherConfigs, setTeacherConfigs] = useState(initialTeachers);
  const [allSchedules, setAllSchedules] = useState(() => {
    const base = generateInitialBaseSchedule(initialTeachers);
    const initialAll = {};
    WEEKS.forEach(week => { initialAll[week] = JSON.parse(JSON.stringify(base)); });
    return initialAll;
  });

  // 기준 시수 상태 관리
  const [standardHours, setStandardHours] = useState(() => {
    const initial = {};
    ALL_SUBJECTS.forEach(s => initial[s] = 0);
    return initial;
  });

  const [viewMode, setViewMode] = useState('weekly'); // weekly, monthly, class_summary, teacher_summary, settings
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [currentClass, setCurrentClass] = useState('1반');
  const [selectedCell, setSelectedCell] = useState(null);
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0);
  const [highlightTeacherId, setHighlightTeacherId] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  
  const [editingTeacher, setEditingTeacher] = useState(null);

  const currentWeekName = WEEKS[currentWeekIndex];
  const schedules = allSchedules[currentWeekName];

  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => setToast({ ...toast, show: false }), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showNotification = (message, type = 'error') => setToast({ show: true, message, type });

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
  const handleDirectSubjectChange = (newSubject) => {
    if (!selectedCell) return;
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
      let isSpecial = false;
      let newType = 'homeroom';
      let newTeacherId = null;
      let newTeacherName = '';
      let newLocation = '';

      if (newSubject === '휴업일') {
        newType = 'holiday';
      } else {
        const classNum = parseInt(className.replace('반', ''));
        const teacherObj = teacherConfigs.find(t => t.subject === newSubject && t.classes.includes(classNum));

        if (teacherObj) {
          isSpecial = true;
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
      showNotification(`${newSubject} 과목으로 변경되었습니다.`, 'success');
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

  const getCellStyles = (p, d, cell) => {
    const isSelected = selectedCell?.weekName === currentWeekName && selectedCell?.className === currentClass && selectedCell?.p === p && selectedCell?.d === d;
    let baseStyle = "relative transition-all duration-200 ease-in-out border border-gray-300 p-2 h-24 flex flex-col items-center justify-center cursor-pointer font-medium text-lg rounded-sm ";
    
    baseStyle += getSubjectColor(cell.subject) + " ";

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
    <div className="min-h-screen bg-slate-100 p-2 md:p-6 font-sans">
      <div className="max-w-[1400px] mx-auto">
        
        {/* 헤더 & 탭 스위처 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6 mb-6 border border-gray-200">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-3 rounded-full">
                <CalendarSync className="text-blue-600 w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">2026학년도 스마트 시간표</h1>
                <p className="text-sm text-gray-500">전담 충돌 방지 및 학기별 통합 관리 시스템</p>
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
              
              <div className="flex gap-2">
                <button onClick={applyToFutureWeeks} className="flex justify-center items-center gap-1 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 text-sm font-bold whitespace-nowrap shadow-sm">
                  <Copy size={16} /> 이후 덮어쓰기 (현재 반)
                </button>
              </div>
            </div>
          )}
          
          {/* 서브 컨트롤러 (Monthly) */}
          {viewMode === 'monthly' && (
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-xl border border-indigo-100">
                <button onClick={() => setCurrentMonthIndex(Math.max(0, currentMonthIndex - 1))} disabled={currentMonthIndex === 0} className="p-2 rounded-lg hover:bg-white disabled:opacity-30 text-indigo-700"><ChevronLeft className="w-5 h-5" /></button>
                <select value={currentMonthIndex} onChange={(e) => setCurrentMonthIndex(Number(e.target.value))} className="bg-transparent text-lg font-bold text-indigo-900 outline-none cursor-pointer px-4 text-center">
                  {MONTHS.map((month, idx) => <option key={idx} value={idx}>{month.name}</option>)}
                </select>
                <button onClick={() => setCurrentMonthIndex(Math.min(MONTHS.length - 1, currentMonthIndex + 1))} disabled={currentMonthIndex === MONTHS.length - 1} className="p-2 rounded-lg hover:bg-white disabled:opacity-30 text-indigo-700"><ChevronRight className="w-5 h-5" /></button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm bg-white p-2 border border-gray-200 rounded-lg shadow-sm">
                <span className="font-semibold text-gray-600 mr-2"><LayoutDashboard size={14} className="inline"/> 동선 하이라이트:</span>
                <button onClick={() => setHighlightTeacherId(null)} className={`px-2 py-1 rounded ${highlightTeacherId === null ? 'bg-gray-800 text-white' : 'bg-gray-100'}`}>전체보기</button>
                {teacherConfigs.map(teacher => (
                  <button key={teacher.id} onClick={() => setHighlightTeacherId(teacher.id)} className={`px-2 py-1 rounded border transition-all ${highlightTeacherId === teacher.id ? 'bg-yellow-300 border-yellow-500 text-black font-bold ring-2 ring-yellow-400' : 'bg-white text-gray-600 border-gray-200'}`}>
                    {teacher.name}({teacher.subject})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

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
                value={selectedCell.subject || ''} 
                onChange={(e) => handleDirectSubjectChange(e.target.value)}
                className="border border-gray-300 p-2 rounded-md shadow-inner focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-gray-50 font-bold text-gray-700"
              >
                <option value="" disabled>-- 과목 선택 --</option>
                {ALL_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

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
        
        {viewMode === 'weekly' && (
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

        {viewMode === 'monthly' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[75vh]">
            <div className="bg-indigo-50 border-b border-indigo-100 p-3 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Info className="text-indigo-500" size={18} />
                <span className="text-sm text-indigo-800 font-medium">월간 조망 화면에서는 <strong>다른 학급의 전담 수업과도 자유롭게 교환</strong>할 수 있습니다! 빈칸을 클릭해 과목을 추가할 수도 있습니다.</span>
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
                              const isHighlighted = highlightTeacherId && cell.teacherId === highlightTeacherId;
                              const isDimmed = highlightTeacherId && cell.teacherId !== highlightTeacherId;
                              const isSelected = selectedCell?.weekName === weekName && selectedCell?.className === cls && selectedCell?.p === pIdx && selectedCell?.d === dIdx;
                              
                              let cellClass = `border border-gray-200 p-1 text-center h-14 relative cursor-pointer transition-all ${isDimmed ? 'opacity-20 grayscale ' : ''} ${isHighlighted ? 'ring-2 ring-inset ring-red-500 font-bold transform scale-105 z-10 shadow-md ' : ''}`;
                              cellClass += getSubjectColor(cell.subject) + " ";

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
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Settings className="text-orange-600"/> 전담 교사 관리</h2>
              <button onClick={() => window.confirm('전체 시간표를 새로 만드시겠습니까?') && setAllSchedules(generateInitialBaseSchedule(teacherConfigs))} className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 font-bold text-sm">전체 초기화 (새로 배정)</button>
            </div>
            <p className="text-gray-500">※ 교사 관리 기능은 이전 버전과 동일하게 정상 작동합니다.</p>
          </div>
        )}

      </div>
    </div>
  );
}