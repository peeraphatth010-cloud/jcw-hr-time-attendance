import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Cloud,
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Filter,
  Info,
  Layers,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  AuditSettings,
  DailyAuditRecord,
  EmployeeMapping,
  EmployeeQuotaRecord,
  HROverrideRecord,
  LeaveCategory,
  LeaveFormRecord,
  RawAttendanceRow,
} from './types/attendance';
import {
  SEED_ID_MAPPING,
  SEED_LEAVE_FORM_CSV,
  SEED_QUOTA_CSV,
} from './data/seedData';
import { SEED_ATTENDANCE_CSV } from './data/seedAttendanceCsv';
import { SEED_ATTENDANCE_CSV_PART2 } from './data/seedAttendanceCsv2';
import { SEED_ATTENDANCE_CSV_PART3 } from './data/seedAttendanceCsv3';
import {
  parseAttendanceCsvText,
  parseLeaveFormCsvText,
  parseQuotaCsvText,
  parseUploadedFile,
} from './utils/csvExcelParser';
import { runMonthlyAttendanceAudit } from './utils/auditEngine';
import {
  formatDateDisplay,
  formatYearMonthThai,
} from './utils/dateAndTime';
import { exportMonthlyAuditToExcel } from './utils/excelExporter';
import {
  FirebaseConfigData,
  getSavedFirebaseConfig,
  isFirebaseConnected,
  loadHRState,
  saveFirebaseConfigToLocal,
  saveHRState,
} from './services/firebaseService';

type ActiveTab =
  | 'overview'
  | 'report1_diligence'
  | 'report2_late'
  | 'report3_unpaid'
  | 'report4_monthly_leave'
  | 'report5_activity'
  | 'report6_quota'
  | 'daily_audit'
  | 'id_mapping_rules';

const DEFAULT_SETTINGS: AuditSettings = {
  onlyApprovedLeaves: true,
  excludeCarryoverLeaves: true,
  includeSheetLeaves: true,
  customHolidays: [],
};

export default function App() {
  // 1. โหลดข้อมูลตั้งต้นจากไฟล์จริง ม.ค. - ต.ค. 2026 (2569)
  const initialAttendanceRows = useMemo(() => {
    const combinedCsv = [
      SEED_ATTENDANCE_CSV,
      SEED_ATTENDANCE_CSV_PART2,
      SEED_ATTENDANCE_CSV_PART3,
    ].join('\n');
    return parseAttendanceCsvText(combinedCsv);
  }, []);

  const initialLeaveRecords = useMemo(
    () => parseLeaveFormCsvText(SEED_LEAVE_FORM_CSV),
    []
  );
  const initialQuotaRecords = useMemo(
    () => parseQuotaCsvText(SEED_QUOTA_CSV),
    []
  );

  // State ข้อมูลหลัก
  const [attendanceRows, setAttendanceRows] = useState<RawAttendanceRow[]>(
    initialAttendanceRows
  );
  const [leaveRecords, setLeaveRecords] =
    useState<LeaveFormRecord[]>(initialLeaveRecords);
  const [quotaRecords, setQuotaRecords] =
    useState<EmployeeQuotaRecord[]>(initialQuotaRecords);
  const [employeeMappings, setEmployeeMappings] =
    useState<EmployeeMapping[]>(SEED_ID_MAPPING);
  const [hrOverrides, setHrOverrides] = useState<
    Record<string, HROverrideRecord>
  >({});
  const [settings, setSettings] = useState<AuditSettings>(DEFAULT_SETTINGS);
  const [onlyMappedEmployees, setOnlyMappedEmployees] = useState<boolean>(true);
  const [autoSkipEmptyDays, setAutoSkipEmptyDays] = useState<boolean>(true);

  // เดือนที่เลือก (ค่าเริ่มต้น: 2026-10 เดือนตุลาคม ชีต 10 ล่าสุดตามคำสั่งผู้ใช้)
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>('2026-10');
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // ตัวกรองตารางตรวจสอบสแกนนิ้วรายวัน
  const [dailyFilterEmp, setDailyFilterEmp] = useState<string>('ALL');
  const [dailyFilterStatus, setDailyFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal สำหรับแก้ไข/ใส่หมายเหตุรายวัน (HR Override)
  const [editingDailyRecord, setEditingDailyRecord] =
    useState<DailyAuditRecord | null>(null);
  const [overrideScanInInput, setOverrideScanInInput] = useState<string>('');
  const [overrideScanOutInput, setOverrideScanOutInput] = useState<string>('');
  const [overrideStatusInput, setOverrideStatusInput] = useState<string>('');
  const [overrideLateCountInput, setOverrideLateCountInput] =
    useState<string>('');
  const [overrideLateMinutesInput, setOverrideLateMinutesInput] =
    useState<string>('');
  const [overrideNoteInput, setOverrideNoteInput] = useState<string>('');

  // Modal อัปโหลดไฟล์ Excel/CSV
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string>('');

  // Modal ตั้งค่า Firebase
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] =
    useState<boolean>(false);
  const [firebaseConfigInput, setFirebaseConfigInput] =
    useState<FirebaseConfigData>(() => {
      return (
        getSavedFirebaseConfig() || {
          apiKey: '',
          authDomain: '',
          projectId: '',
          storageBucket: '',
          messagingSenderId: '',
          appId: '',
        }
      );
    });
  const [syncStatus, setSyncStatus] = useState<string>('พร้อมใช้งาน (Local + Seed)');

  // Modal เพิ่มใบลาออนไลน์ใหม่
  const [isAddLeaveModalOpen, setIsAddLeaveModalOpen] =
    useState<boolean>(false);
  const [newLeaveEmpCode, setNewLeaveEmpCode] = useState<string>('010661001');
  const [newLeaveType, setNewLeaveType] = useState<LeaveCategory>('ลาป่วย');
  const [newLeaveStartDate, setNewLeaveStartDate] =
    useState<string>('2026-10-15');
  const [newLeaveEndDate, setNewLeaveEndDate] = useState<string>('2026-10-15');
  const [newLeaveHours, setNewLeaveHours] = useState<string>('8');
  const [newLeaveReason, setNewLeaveReason] = useState<string>('');
  const [newLeaveIsUnpaid, setNewLeaveIsUnpaid] = useState<boolean>(false);

  // Modal เพิ่มการผูก ID พนักงานใหม่
  const [newMapPersonId, setNewMapPersonId] = useState<string>('');
  const [newMapScannerName, setNewMapScannerName] = useState<string>('');
  const [newMapEmpCode, setNewMapEmpCode] = useState<string>('');
  const [newMapFullName, setNewMapFullName] = useState<string>('');
  const [newMapNickname, setNewMapNickname] = useState<string>('');
  const [newMapDept, setNewMapDept] = useState<string>('ฝ่ายแอดมิน');

  // โหลดข้อมูลจาก Firebase / LocalStorage ตอนเปิดแอป
  useEffect(() => {
    let mounted = true;
    loadHRState().then(({ state, source }) => {
      if (!mounted || !state) return;
      if (state.employeeMappings && state.employeeMappings.length > 0) {
        setEmployeeMappings(state.employeeMappings);
      }
      if (state.quotaRecords && state.quotaRecords.length > 0) {
        setQuotaRecords(state.quotaRecords);
      }
      if (state.leaveRecords && state.leaveRecords.length > 0) {
        setLeaveRecords(state.leaveRecords);
      }
      if (state.hrOverrides) {
        setHrOverrides(state.hrOverrides);
      }
      if (state.settings) {
        setSettings(state.settings);
      }
      setSyncStatus(
        source === 'firebase'
          ? 'ซิงก์ข้อมูลจาก Firebase Firestore สำเร็จ'
          : 'โหลดข้อมูลล่าสุดจากเครื่อง (LocalStorage)'
      );
    });
    return () => {
      mounted = false;
    };
  }, []);

  // บันทึกการเปลี่ยนแปลงลง LocalStorage และ Firebase อัตโนมัติ
  const triggerSaveState = async (
    nextMappings = employeeMappings,
    nextQuotas = quotaRecords,
    nextLeaves = leaveRecords,
    nextOverrides = hrOverrides,
    nextSettings = settings
  ) => {
    const res = await saveHRState({
      employeeMappings: nextMappings,
      quotaRecords: nextQuotas,
      leaveRecords: nextLeaves,
      hrOverrides: nextOverrides,
      settings: nextSettings,
      updatedAt: new Date().toISOString(),
    });
    if (res.savedFirebase) {
      setSyncStatus('บันทึกขึ้น Firebase Firestore แล้ว');
    } else if (res.savedLocal) {
      setSyncStatus('บันทึกในเครื่องแล้ว (พร้อมซิงก์ Firebase)');
    }
  };

  // รายการเดือนทั้งหมดที่มีในระบบ (เรียงจากล่าสุดไปเก่าสุด)
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of attendanceRows) {
      if (r.date && r.date.length >= 7) {
        set.add(r.date.slice(0, 7));
      }
    }
    const arr = Array.from(set).sort().reverse();
    if (!arr.includes('2026-10')) arr.unshift('2026-10');
    return arr;
  }, [attendanceRows]);

  // ประมวลผลรายงานทั้ง 6 ข้อ + ตารางตรวจสอบสแกนนิ้วด้วย Audit Engine
  const auditResult = useMemo(() => {
    return runMonthlyAttendanceAudit({
      yearMonth: selectedYearMonth,
      attendanceRows,
      leaveRecords,
      quotaRecords,
      employeeMappings,
      hrOverrides,
      settings: {
        ...settings,
        onlyMappedEmployees,
        autoSkipCompanyWideEmptyDays: autoSkipEmptyDays,
      },
    });
  }, [
    selectedYearMonth,
    attendanceRows,
    leaveRecords,
    quotaRecords,
    employeeMappings,
    hrOverrides,
    settings,
    onlyMappedEmployees,
    autoSkipEmptyDays,
  ]);

  // กรองรายการตรวจสอบสแกนนิ้วรายวัน
  const filteredDailyRecords = useMemo(() => {
    return auditResult.dailyRecords.filter((r) => {
      if (dailyFilterEmp !== 'ALL' && r.empCode !== dailyFilterEmp) return false;
      if (dailyFilterStatus === 'ANOMALY') {
        if (
          r.scanStatus === 'ครบปกติ' ||
          r.scanStatus === 'ลาเต็มวัน/มีข้อมูลการลา'
        ) {
          return false;
        }
      } else if (dailyFilterStatus === 'LATE') {
        if (r.lateCount === 0) return false;
      } else if (dailyFilterStatus === 'SALES_VISIT') {
        if (r.salesStatus !== 'คาดว่าไปพบลูกค้า' && !r.isNextDayAfterClientVisit) {
          return false;
        }
      } else if (dailyFilterStatus === 'OVERRIDDEN') {
        if (!r.hasHROverride) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          r.fullName.toLowerCase().includes(q) ||
          r.nickname.toLowerCase().includes(q) ||
          r.scannerName.toLowerCase().includes(q) ||
          r.empCode.toLowerCase().includes(q) ||
          r.date.includes(q) ||
          r.alertMessage.toLowerCase().includes(q) ||
          r.hrNote.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    auditResult.dailyRecords,
    dailyFilterEmp,
    dailyFilterStatus,
    searchQuery,
  ]);

  // เปิด Modal แก้ไข/ใส่หมายเหตุของ HR
  const handleOpenEditDaily = (record: DailyAuditRecord) => {
    const existing = hrOverrides[record.key];
    setEditingDailyRecord(record);
    setOverrideScanInInput(existing?.overrideScanIn ?? '');
    setOverrideScanOutInput(existing?.overrideScanOut ?? '');
    setOverrideStatusInput(existing?.overrideStatus ?? '');
    setOverrideLateCountInput(
      existing?.overrideLateCount !== undefined &&
        existing?.overrideLateCount !== null
        ? String(existing.overrideLateCount)
        : ''
    );
    setOverrideLateMinutesInput(
      existing?.overrideLateMinutes !== undefined &&
        existing?.overrideLateMinutes !== null
        ? String(existing.overrideLateMinutes)
        : ''
    );
    setOverrideNoteInput(existing?.hrNote ?? '');
  };

  // บันทึก HR Override โดยไม่ทับข้อมูลดิบต้นฉบับ
  const handleSaveDailyOverride = async () => {
    if (!editingDailyRecord) return;
    const key = editingDailyRecord.key;
    const nextOverrides = { ...hrOverrides };

    const hasAnyValue =
      overrideScanInInput.trim() !== '' ||
      overrideScanOutInput.trim() !== '' ||
      overrideStatusInput.trim() !== '' ||
      overrideLateCountInput.trim() !== '' ||
      overrideLateMinutesInput.trim() !== '' ||
      overrideNoteInput.trim() !== '';

    if (!hasAnyValue) {
      delete nextOverrides[key];
    } else {
      nextOverrides[key] = {
        key,
        empKey: editingDailyRecord.empCode,
        date: editingDailyRecord.date,
        overrideScanIn: overrideScanInInput.trim() || undefined,
        overrideScanOut: overrideScanOutInput.trim() || undefined,
        overrideStatus: (overrideStatusInput ||
          undefined) as DailyAuditRecord['scanStatus'],
        overrideLateCount:
          overrideLateCountInput.trim() !== ''
            ? Number(overrideLateCountInput)
            : null,
        overrideLateMinutes:
          overrideLateMinutesInput.trim() !== ''
            ? Number(overrideLateMinutesInput)
            : null,
        hrNote: overrideNoteInput.trim(),
        updatedAt: new Date().toLocaleString('th-TH'),
      };
    }

    setHrOverrides(nextOverrides);
    setEditingDailyRecord(null);
    await triggerSaveState(
      employeeMappings,
      quotaRecords,
      leaveRecords,
      nextOverrides,
      settings
    );
  };

  // จัดการอัปโหลดไฟล์ Excel / CSV
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const logs: string[] = [];
    let nextAtt = [...attendanceRows];
    let nextLeaves = [...leaveRecords];
    let nextQuotas = [...quotaRecords];
    let nextMappings = [...employeeMappings];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const res = await parseUploadedFile(file);
        if (res.attendanceRows.length > 0) {
          // รวมข้อมูลสแกนนิ้ว (แทนที่เดือนที่ซ้ำหรือเพิ่มแถวใหม่)
          const uploadedDates = new Set(
            res.attendanceRows.map((r) => r.date.slice(0, 7))
          );
          nextAtt = nextAtt
            .filter((r) => !uploadedDates.has(r.date.slice(0, 7)))
            .concat(res.attendanceRows);
          const latestMonth = Array.from(uploadedDates).sort().pop();
          if (latestMonth) setSelectedYearMonth(latestMonth);
          logs.push(
            `ไฟล์ "${file.name}": นำเข้าข้อมูลสแกนนิ้ว ${res.attendanceRows.length} แถว (${Array.from(uploadedDates).join(', ')})`
          );
        }
        if (res.leaveRecords.length > 0) {
          nextLeaves = res.leaveRecords;
          logs.push(
            `ไฟล์ "${file.name}": นำเข้าประวัติการลาออนไลน์ ${res.leaveRecords.length} รายการ (แปลงวันที่ DD/MM/YYYY คอลัมน์ I, J อัตโนมัติ)`
          );
        }
        if (res.quotaRecords.length > 0) {
          nextQuotas = res.quotaRecords;
          logs.push(
            `ไฟล์ "${file.name}": นำเข้าข้อมูลสิทธิคงเหลือพนักงาน ${res.quotaRecords.length} คน`
          );
        }
        if (res.employeeMappings.length > 0) {
          nextMappings = res.employeeMappings;
          logs.push(
            `ไฟล์ "${file.name}": นำเข้าตารางผูก ID บุคคล ${res.employeeMappings.length} รายการ`
          );
        }
        if (res.detectedType === 'unknown') {
          logs.push(
            `ไฟล์ "${file.name}": ไม่พบรูปแบบคอลัมน์ที่ตรงกับไฟล์บันทึกเข้างานหรือแบบฟอร์มลาออนไลน์`
          );
        }
      } catch (err) {
        logs.push(
          `เกิดข้อผิดพลาดในการอ่านไฟล์ "${file.name}": ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    setAttendanceRows(nextAtt);
    setLeaveRecords(nextLeaves);
    setQuotaRecords(nextQuotas);
    setEmployeeMappings(nextMappings);
    setUploadStatusMsg(logs.join('\n'));

    await triggerSaveState(
      nextMappings,
      nextQuotas,
      nextLeaves,
      hrOverrides,
      settings
    );
  };

  // เพิ่มใบลาออนไลน์ใหม่ในแอปโดยตรง
  const handleAddManualLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employeeMappings.find((m) => m.empCode === newLeaveEmpCode);
    if (!emp) return;

    const hrs = parseFloat(newLeaveHours) || 8;
    const newRec: LeaveFormRecord = {
      id: `manual-leave-${Date.now()}`,
      timestamp: new Date().toLocaleString('th-TH'),
      fullName: emp.fullName,
      nickname: emp.nickname,
      empCode: emp.empCode,
      position: '-',
      department: emp.department,
      leaveType: newLeaveIsUnpaid ? 'ลาไม่รับค่าจ้าง' : newLeaveType,
      reason: newLeaveReason || 'HR บันทึกผ่านเว็บแอป',
      startDate: newLeaveStartDate,
      endDate: newLeaveEndDate || newLeaveStartDate,
      hours: hrs,
      days: Number((hrs / 8).toFixed(4)),
      attachmentUrl: '',
      status: 'อนุมัติ',
      approvedDate: new Date().toISOString().slice(0, 10),
      note: newLeaveIsUnpaid ? 'ลาไม่รับค่าจ้าง' : '',
      isUnpaidLeave: newLeaveIsUnpaid || newLeaveType === 'ลาไม่รับค่าจ้าง',
      isHistoricalCarryover: false,
    };

    const nextLeaves = [newRec, ...leaveRecords];
    setLeaveRecords(nextLeaves);
    setIsAddLeaveModalOpen(false);
    setNewLeaveReason('');
    await triggerSaveState(
      employeeMappings,
      quotaRecords,
      nextLeaves,
      hrOverrides,
      settings
    );
  };

  // เพิ่มพนักงานในตารางผูก ID บุคคล
  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMapFullName.trim() || !newMapEmpCode.trim()) return;
    const nextMappings: EmployeeMapping[] = [
      ...employeeMappings,
      {
        personId: newMapPersonId.trim() || '0',
        scannerName: newMapScannerName.trim() || newMapEmpCode.trim(),
        empCode: newMapEmpCode.trim(),
        fullName: newMapFullName.trim(),
        nickname: newMapNickname.trim() || '-',
        department: newMapDept,
      },
    ];
    setEmployeeMappings(nextMappings);
    setNewMapPersonId('');
    setNewMapScannerName('');
    setNewMapEmpCode('');
    setNewMapFullName('');
    setNewMapNickname('');
    await triggerSaveState(
      nextMappings,
      quotaRecords,
      leaveRecords,
      hrOverrides,
      settings
    );
  };

  const eligibleDiligenceList = auditResult.diligenceReport.filter(
    (d) => d.isEligible
  );
  const latePeopleList = auditResult.lateSummaryReport.filter(
    (l) => l.lateCount > 0
  );
  const unpaidOrOtherPeopleList = auditResult.unpaidAndOtherLeaveReport.filter(
    (u) => u.totalDays > 0
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="bg-gradient-to-r from-indigo-950 via-blue-900 to-indigo-900 text-white shadow-lg no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2.5 bg-white/10 rounded-xl border border-white/20 backdrop-blur-sm">
                <ShieldCheck className="w-8 h-8 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                    JCW International — HR Time Attendance & Leave Audit
                  </h1>
                  <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 rounded-full">
                    Business Rules v1.0
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-blue-200 mt-0.5">
                  ระบบตรวจสอบเวลาสแกนนิ้วเข้างาน ประวัติใบลาออนไลน์ เบี้ยขยัน และสิทธิคงเหลือรายบุคคล
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium border border-white/20 transition cursor-pointer"
              >
                <Upload className="w-4 h-4 text-sky-300" />
                อัปโหลดไฟล์ Excel/CSV
              </button>

              <button
                onClick={() => exportMonthlyAuditToExcel(auditResult)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold shadow-sm transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                ดาวน์โหลดรายงาน Excel (.xlsx)
              </button>

              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium border border-white/20 transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-amber-300" />
                พิมพ์ / PDF
              </button>

              <button
                onClick={() => setIsFirebaseModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium border border-white/20 transition cursor-pointer"
                title={syncStatus}
              >
                <Database
                  className={`w-4 h-4 ${
                    isFirebaseConnected() ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                />
                Firebase DB
              </button>
            </div>
          </div>

          {/* Month Selector & Quick Rule Filter Bar */}
          <div className="mt-4 pt-3 border-t border-white/15 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
                <Calendar className="w-4 h-4 text-sky-300" />
                <label className="text-xs font-medium text-blue-100">
                  เลือกเดือนที่ตรวจสอบ:
                </label>
                <select
                  value={selectedYearMonth}
                  onChange={(e) => setSelectedYearMonth(e.target.value)}
                  className="bg-indigo-950 text-white text-sm font-semibold rounded px-2 py-0.5 border border-indigo-400/40 focus:outline-none"
                >
                  {availableMonths.map((ym) => (
                    <option key={ym} value={ym}>
                      {formatYearMonthThai(ym)}{' '}
                      {ym === '2026-10' ? ' (ชีต 10 - ล่าสุด)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-xs text-blue-200">
                วันทำงานที่มีข้อมูลสแกน:{' '}
                <strong className="text-white">
                  {auditResult.workdaysInMonth.length} วัน
                </strong>{' '}
                | พนักงานที่ตรวจสอบ:{' '}
                <strong className="text-white">
                  {auditResult.activitySummaryReport.length} คน
                </strong>
              </span>
            </div>

            {/* Smart Audit Toggles */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-1.5 cursor-pointer bg-white/5 px-2.5 py-1 rounded border border-white/10">
                <input
                  type="checkbox"
                  checked={settings.onlyApprovedLeaves}
                  onChange={(e) => {
                    const next = {
                      ...settings,
                      onlyApprovedLeaves: e.target.checked,
                    };
                    setSettings(next);
                    triggerSaveState(
                      employeeMappings,
                      quotaRecords,
                      leaveRecords,
                      hrOverrides,
                      next
                    );
                  }}
                  className="rounded text-emerald-500"
                />
                <span>เฉพาะใบลาที่ &quot;อนุมัติ&quot;</span>
              </label>

              <label
                className="inline-flex items-center gap-1.5 cursor-pointer bg-white/5 px-2.5 py-1 rounded border border-white/10"
                title="กรองรายการที่ HR กรอกสะสมย้อนหลัง เช่น 'บันทึกเก่า', 'บันทึกลาเก่า', 'ทดสอบ' ออกจากการคำนวณรายเดือน"
              >
                <input
                  type="checkbox"
                  checked={settings.excludeCarryoverLeaves}
                  onChange={(e) => {
                    const next = {
                      ...settings,
                      excludeCarryoverLeaves: e.target.checked,
                    };
                    setSettings(next);
                    triggerSaveState(
                      employeeMappings,
                      quotaRecords,
                      leaveRecords,
                      hrOverrides,
                      next
                    );
                  }}
                  className="rounded text-emerald-500"
                />
                <span>ไม่นับแถว &quot;บันทึกเก่า/ทดสอบ&quot; ในฟอร์มลา</span>
              </label>

              <label
                className="inline-flex items-center gap-1.5 cursor-pointer bg-white/5 px-2.5 py-1 rounded border border-white/10"
                title="แสดงเฉพาะพนักงานตามไฟล์ ID บุคคลสำหรับเชื่อมต่อ (13 คน)"
              >
                <input
                  type="checkbox"
                  checked={onlyMappedEmployees}
                  onChange={(e) => setOnlyMappedEmployees(e.target.checked)}
                  className="rounded text-emerald-500"
                />
                <span>เฉพาะพนักงานในผัง ID บุคคล</span>
              </label>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 overflow-x-auto">
          <div className="flex items-center space-x-1 py-2 min-w-max">
            {[
              {
                id: 'overview',
                label: 'สรุปครบทั้ง 6 รายงาน',
                icon: Layers,
                badge: 'All-in-One',
              },
              {
                id: 'report1_diligence',
                label: '1. เบี้ยขยัน',
                icon: Award,
                badge: `${eligibleDiligenceList.length} คน`,
              },
              {
                id: 'report2_late',
                label: '2. เข้างานสาย',
                icon: Clock,
                badge: `${auditResult.activityGrandTotal.lateCount} ครั้ง`,
              },
              {
                id: 'report3_unpaid',
                label: '3. ลาไม่รับค่าจ้าง/อื่นๆ',
                icon: AlertTriangle,
                badge: `${Number((auditResult.activityGrandTotal.unpaidDays + auditResult.activityGrandTotal.otherDays).toFixed(2))} วัน`,
              },
              {
                id: 'report4_monthly_leave',
                label: '4. การใช้สิทธิลาในเดือน',
                icon: Calendar,
                badge: `${auditResult.monthlyLeaveUsageReport.length} รายการ`,
              },
              {
                id: 'report5_activity',
                label: '5. สรุปกิจกรรมลา & สาย',
                icon: FileSpreadsheet,
                badge: 'ตารางรวม',
              },
              {
                id: 'report6_quota',
                label: '6. สิทธิคงเหลือรายบุคคล',
                icon: UserCheck,
                badge: `${auditResult.quotaReport.length} คน`,
              },
              {
                id: 'daily_audit',
                label: 'ตรวจสอบสแกนนิ้ว & แก้ไข/หมายเหตุ',
                icon: Edit3,
                badge: `${auditResult.scanAnomalyRecords.length} แจ้งเตือน`,
              },
              {
                id: 'id_mapping_rules',
                label: 'ผูก ID บุคคล & กฎบริษัท',
                icon: Users,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ActiveTab)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`px-1.5 py-0.5 text-[11px] rounded-full font-semibold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">
        {/* Print Header (แสดงเฉพาะเวลาสั่งพิมพ์ PDF) */}
        <div className="hidden print:block border-b-2 border-slate-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            รายงานสรุปเวลาทำงานและการลาพนักงาน — บริษัท JCW International
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            ประจำเดือน: {formatYearMonthThai(selectedYearMonth)} | พิมพ์เมื่อ:{' '}
            {new Date().toLocaleString('th-TH')}
          </p>
        </div>

        {/* KPI Cards ด้านบน */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            onClick={() => setActiveTab('report1_diligence')}
            className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-emerald-400 transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                1. ผู้ได้รับเบี้ยขยัน
              </span>
              <Award className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {eligibleDiligenceList.length}
              </span>
              <span className="text-xs text-slate-500">
                / {auditResult.diligenceReport.length} คน
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 truncate">
              {eligibleDiligenceList.length > 0
                ? eligibleDiligenceList
                    .map((e) => `${e.fullName} (${e.nickname})`)
                    .join(', ')
                : 'ไม่มีผู้ผ่านเกณฑ์ในเดือนนี้'}
            </p>
          </div>

          <div
            onClick={() => setActiveTab('report2_late')}
            className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-amber-400 transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md">
                2. สถิติเข้างานสาย
              </span>
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {latePeopleList.length} คน
              </span>
              <span className="text-xs font-semibold text-amber-700">
                ({auditResult.activityGrandTotal.lateCount} ครั้ง /{' '}
                {auditResult.activityGrandTotal.lateMinutes} นาที)
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              เกณฑ์สาย 08:16 น. (ฝ่ายขายหลังพบลูกค้า 09:01 น.)
            </p>
          </div>

          <div
            onClick={() => setActiveTab('report3_unpaid')}
            className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-rose-400 transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md">
                3. ลาไม่รับค่าจ้าง & อื่นๆ
              </span>
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {Number(
                  (
                    auditResult.activityGrandTotal.unpaidDays +
                    auditResult.activityGrandTotal.otherDays
                  ).toFixed(2)
                )}{' '}
                วัน
              </span>
              <span className="text-xs text-rose-700 font-semibold">
                (
                {Number(
                  (
                    auditResult.activityGrandTotal.unpaidHours +
                    auditResult.activityGrandTotal.otherHours
                  ).toFixed(1)
                )}{' '}
                ชม.)
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              ผู้ลาไม่รับค่าจ้าง/อื่นๆ จำนวน {unpaidOrOtherPeopleList.length} คน
            </p>
          </div>

          <div
            onClick={() => setActiveTab('report5_activity')}
            className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-indigo-400 transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md">
                4–5. รวมวันลาทุกประเภท
              </span>
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {auditResult.activityGrandTotal.totalLeaveDays} วัน
              </span>
              <span className="text-xs text-indigo-700 font-semibold">
                ({auditResult.activityGrandTotal.totalLeaveHours} ชม.)
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              ป่วย {auditResult.activityGrandTotal.sickDays} | กิจ{' '}
              {auditResult.activityGrandTotal.personalDays} | พักร้อน{' '}
              {auditResult.activityGrandTotal.vacationDays} วัน
            </p>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* REPORT 1: ผู้ได้รับเบี้ยขยัน */}
        {/* ===================================================================== */}
        {(activeTab === 'overview' || activeTab === 'report1_diligence') && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-600" />
                  รายงานที่ 1: สรุปรายชื่อผู้ได้รับเบี้ยขยัน ประจำเดือน{' '}
                  {formatYearMonthThai(selectedYearMonth)}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  เงื่อนไขเบี้ยขยัน JCW: (1) ไม่ได้อยู่ฝ่ายขาย (2) ทุกวันทำงานต้องสแกนเข้างานไม่เกิน 08:00 น. (3) วันลารวมทุกประเภทในเดือนไม่เกิน 1.0 วัน
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 self-start sm:self-center">
                ผ่านเกณฑ์ {eligibleDiligenceList.length} คน
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-semibold">ลำดับ</th>
                    <th className="py-2.5 px-3 font-semibold">รหัสพนักงาน</th>
                    <th className="py-2.5 px-3 font-semibold">ID สแกน</th>
                    <th className="py-2.5 px-3 font-semibold">ชื่อ-นามสกุล (ชื่อเล่น)</th>
                    <th className="py-2.5 px-3 font-semibold">แผนก/ฝ่าย</th>
                    <th className="py-2.5 px-3 font-semibold text-center">วันมาทำงาน</th>
                    <th className="py-2.5 px-3 font-semibold text-center">สแกนหลัง 08:00</th>
                    <th className="py-2.5 px-3 font-semibold text-center">วันลารวมในเดือน</th>
                    <th className="py-2.5 px-3 font-semibold text-center">สถานะเบี้ยขยัน</th>
                    <th className="py-2.5 px-3 font-semibold">เหตุผล / รายละเอียดการตรวจสอบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.diligenceReport.map((item, idx) => (
                    <tr
                      key={item.empCode}
                      className={
                        item.isEligible
                          ? 'bg-emerald-50/50 hover:bg-emerald-50'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">{item.empCode}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">{item.personId}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {item.fullName}{' '}
                        <span className="text-slate-500 font-normal">
                          ({item.nickname})
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{item.department}</td>
                      <td className="py-2.5 px-3 text-center">{item.daysWorked} วัน</td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={
                            item.daysScanAfter0800 > 0
                              ? 'text-amber-700 font-semibold'
                              : 'text-emerald-700'
                          }
                        >
                          {item.daysScanAfter0800} วัน
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={
                            item.totalLeaveDays > 1
                              ? 'text-rose-600 font-semibold'
                              : 'text-slate-700'
                          }
                        >
                          {item.totalLeaveDays} วัน
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {item.isEligible ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            ได้รับเบี้ยขยัน
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                            ไม่ได้รับ
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">
                        {item.isEligible ? (
                          <span className="text-emerald-700 font-medium">
                            ผ่านเกณฑ์ครบทั้ง 3 ข้อ (เข้าไม่เกิน 08:00 น. ทุกวัน และลาไม่เกิน 1 วัน)
                          </span>
                        ) : (
                          item.disqualifyReasons.join(' • ')
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* REPORT 2: สรุปการมาสาย (กี่ครั้ง กี่นาที) */}
        {/* ===================================================================== */}
        {(activeTab === 'overview' || activeTab === 'report2_late') && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  รายงานที่ 2: สรุปการเข้างานสาย (จำนวนครั้งและจำนวนนาที) ประจำเดือน{' '}
                  {formatYearMonthThai(selectedYearMonth)}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  เวลาเข้างานปกติ 08:00 น. (อนุโลม 08:01–08:15 น. ไม่นับว่าสายแต่เสียเบี้ยขยัน) | สแกนตั้งแต่ 08:16 น. นับสาย 1 ครั้ง และคิดนาทีสายจากหลัง 08:15 น. (ฝ่ายขายวันถัดจากพบลูกค้าอนุโลมถึง 09:00 น.)
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 self-start sm:self-center">
                รวมสาย {auditResult.activityGrandTotal.lateCount} ครั้ง ({auditResult.activityGrandTotal.lateMinutes} นาที)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-semibold">ลำดับ</th>
                    <th className="py-2.5 px-3 font-semibold">รหัสพนักงาน</th>
                    <th className="py-2.5 px-3 font-semibold">ID สแกน</th>
                    <th className="py-2.5 px-3 font-semibold">ชื่อ-นามสกุล (ชื่อเล่น)</th>
                    <th className="py-2.5 px-3 font-semibold">แผนก/ฝ่าย</th>
                    <th className="py-2.5 px-3 font-semibold text-center">จำนวนครั้งที่สาย</th>
                    <th className="py-2.5 px-3 font-semibold text-center">รวมเวลาสาย (นาที)</th>
                    <th className="py-2.5 px-3 font-semibold">รายละเอียดวันที่มาสายและเวลาสแกนเข้า</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.lateSummaryReport.map((item, idx) => (
                    <tr
                      key={item.empCode}
                      className={
                        item.lateCount > 0
                          ? 'bg-amber-50/30 hover:bg-amber-50/60'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">{item.empCode}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">{item.personId}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {item.fullName}{' '}
                        <span className="text-slate-500 font-normal">
                          ({item.nickname})
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{item.department}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            item.lateCount > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {item.lateCount} ครั้ง
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold">
                        <span
                          className={
                            item.lateMinutes > 0
                              ? 'text-rose-600'
                              : 'text-slate-500'
                          }
                        >
                          {item.lateMinutes} นาที
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {item.dailyDetails.length === 0 ? (
                          <span className="text-xs text-emerald-700">
                            ไม่มาสายในเดือนนี้
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {item.dailyDetails.map((d) => (
                              <span
                                key={d.date}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-amber-200 text-xs text-slate-700"
                              >
                                <strong className="text-slate-900">
                                  {formatDateDisplay(d.date)}
                                </strong>
                                <span>เข้า {d.scanIn}</span>
                                <span className="text-rose-600 font-semibold">
                                  (+{d.lateMinutes} น.)
                                </span>
                                {d.rule.includes('09:00') && (
                                  <span className="text-[10px] bg-blue-50 text-blue-700 px-1 rounded">
                                    เกณฑ์ 09:00
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={5} className="py-2.5 px-3 text-right">
                      รวมทั้งบริษัท (Grand Total):
                    </td>
                    <td className="py-2.5 px-3 text-center text-amber-800">
                      {auditResult.activityGrandTotal.lateCount} ครั้ง
                    </td>
                    <td className="py-2.5 px-3 text-center text-rose-700">
                      {auditResult.activityGrandTotal.lateMinutes} นาที
                    </td>
                    <td className="py-2.5 px-3 text-xs font-normal text-slate-600">
                      มีผู้มาสาย {latePeopleList.length} คน จากทั้งหมด{' '}
                      {auditResult.lateSummaryReport.length} คน
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* REPORT 3: ใครลาไม่รับค่าจ้าง หรือ ลาอื่นๆ บ้าง กี่วัน กี่ชั่วโมง */}
        {/* ===================================================================== */}
        {(activeTab === 'overview' || activeTab === 'report3_unpaid') && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  รายงานที่ 3: สรุปการลาไม่รับค่าจ้าง และ ลาอื่นๆ (จำนวนวันและชั่วโมง) ประจำเดือน{' '}
                  {formatYearMonthThai(selectedYearMonth)}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  คำนวณตามเกณฑ์ 8 ชั่วโมง = 1 วันทำงาน | แยกตรวจจับ &quot;ลาไม่รับค่าจ้าง&quot; จากประเภทการลา เหตุผลการลา และหมายเหตุอัตโนมัติ
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 self-start sm:self-center">
                ลาไม่รับค่าจ้าง {auditResult.activityGrandTotal.unpaidDays} วัน (
                {auditResult.activityGrandTotal.unpaidHours} ชม.) | ลาอื่นๆ{' '}
                {auditResult.activityGrandTotal.otherDays} วัน (
                {auditResult.activityGrandTotal.otherHours} ชม.)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-semibold">ลำดับ</th>
                    <th className="py-2.5 px-3 font-semibold">รหัสพนักงาน</th>
                    <th className="py-2.5 px-3 font-semibold">ชื่อ-นามสกุล (ชื่อเล่น)</th>
                    <th className="py-2.5 px-3 font-semibold">แผนก/ฝ่าย</th>
                    <th className="py-2.5 px-3 font-semibold text-center bg-rose-50/60">
                      ลาไม่รับค่าจ้าง (วัน / ชม.)
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center bg-purple-50/60">
                      ลาอื่นๆ (วัน / ชม.)
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      รวมทั้ง 2 ประเภท
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      รายละเอียดวันที่ใช้สิทธิและเหตุผล
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.unpaidAndOtherLeaveReport.map((item, idx) => (
                    <tr
                      key={item.empCode}
                      className={
                        item.totalDays > 0
                          ? 'bg-rose-50/30 hover:bg-rose-50/60'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">{item.empCode}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {item.fullName}{' '}
                        <span className="text-slate-500 font-normal">
                          ({item.nickname})
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{item.department}</td>
                      <td className="py-2.5 px-3 text-center">
                        {item.unpaidDays > 0 ? (
                          <span className="font-bold text-rose-700">
                            {item.unpaidDays} วัน ({item.unpaidHours} ชม.)
                          </span>
                        ) : (
                          <span className="text-slate-400">0 วัน (0 ชม.)</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {item.otherDays > 0 ? (
                          <span className="font-bold text-purple-700">
                            {item.otherDays} วัน ({item.otherHours} ชม.)
                          </span>
                        ) : (
                          <span className="text-slate-400">0 วัน (0 ชม.)</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold">
                        {item.totalDays > 0 ? (
                          <span className="text-slate-900">
                            {item.totalDays} วัน ({item.totalHours} ชม.)
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-700">
                        {item.details.length === 0 ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <div className="space-y-1">
                            {item.details.map((d, i) => (
                              <div key={`${d.date}-${i}`}>
                                <span className="font-semibold">
                                  {formatDateDisplay(d.date)}
                                </span>
                                : {d.type} {d.days} วัน ({d.hours} ชม.) —{' '}
                                <span className="text-slate-600">{d.reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={4} className="py-2.5 px-3 text-right">
                      รวมทั้งสิ้น (Grand Total):
                    </td>
                    <td className="py-2.5 px-3 text-center text-rose-700">
                      {auditResult.activityGrandTotal.unpaidDays} วัน (
                      {auditResult.activityGrandTotal.unpaidHours} ชม.)
                    </td>
                    <td className="py-2.5 px-3 text-center text-purple-700">
                      {auditResult.activityGrandTotal.otherDays} วัน (
                      {auditResult.activityGrandTotal.otherHours} ชม.)
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {Number(
                        (
                          auditResult.activityGrandTotal.unpaidDays +
                          auditResult.activityGrandTotal.otherDays
                        ).toFixed(4)
                      )}{' '}
                      วัน (
                      {Number(
                        (
                          auditResult.activityGrandTotal.unpaidHours +
                          auditResult.activityGrandTotal.otherHours
                        ).toFixed(2)
                      )}{' '}
                      ชม.)
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* REPORT 4: ใครใช้สิทธิการลาอะไรบ้างในเดือน ใช้ไปเมื่อไหร่ กี่วัน */}
        {/* ===================================================================== */}
        {(activeTab === 'overview' || activeTab === 'report4_monthly_leave') && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  รายงานที่ 4: รายละเอียดการใช้สิทธิการลาในเดือน (ใช้สิทธิอะไร เมื่อไหร่ กี่วัน/ชั่วโมง) ประจำเดือน{' '}
                  {formatYearMonthThai(selectedYearMonth)}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  เชื่อมโยงข้อมูลจากไฟล์ &quot;แบบฟอร์มลาออนไลน์&quot; (คอลัมน์ I วันที่-เดือน-ปี) และคอลัมน์วันลาในชีตสแกนนิ้ว
                </p>
              </div>
              <button
                onClick={() => setIsAddLeaveModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition cursor-pointer no-print"
              >
                <Plus className="w-4 h-4" />
                บันทึกใบลาเพิ่ม
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-semibold">ลำดับ</th>
                    <th className="py-2.5 px-3 font-semibold">รหัสพนักงาน</th>
                    <th className="py-2.5 px-3 font-semibold">ชื่อ-นามสกุล (ชื่อเล่น)</th>
                    <th className="py-2.5 px-3 font-semibold">แผนก/ฝ่าย</th>
                    <th className="py-2.5 px-3 font-semibold">ประเภทสิทธิที่ใช้</th>
                    <th className="py-2.5 px-3 font-semibold">วันที่ใช้สิทธิ (ตั้งแต่วันที่ - ถึงวันที่)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">จำนวนวัน</th>
                    <th className="py-2.5 px-3 font-semibold text-center">จำนวนชั่วโมง</th>
                    <th className="py-2.5 px-3 font-semibold">เหตุผลการลา / หมายเหตุ</th>
                    <th className="py-2.5 px-3 font-semibold text-center">แหล่งข้อมูล</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.monthlyLeaveUsageReport.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="py-8 text-center text-slate-500"
                      >
                        ไม่มีรายการใช้สิทธิการลาในเดือนนี้
                      </td>
                    </tr>
                  ) : (
                    auditResult.monthlyLeaveUsageReport.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono text-xs">{item.empCode}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {item.fullName}{' '}
                          <span className="text-slate-500 font-normal">
                            ({item.nickname})
                          </span>
                        </td>
                        <td className="py-2.5 px-3">{item.department}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              item.isUnpaid || item.leaveType === 'ลาไม่รับค่าจ้าง'
                                ? 'bg-rose-100 text-rose-800'
                                : item.leaveType === 'ลาป่วย'
                                ? 'bg-blue-100 text-blue-800'
                                : item.leaveType === 'ลากิจ'
                                ? 'bg-amber-100 text-amber-800'
                                : item.leaveType === 'ลาพักร้อน'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {item.leaveType}
                            {item.isUnpaid && item.leaveType !== 'ลาไม่รับค่าจ้าง'
                              ? ' (ไม่รับค่าจ้าง)'
                              : ''}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium">
                          {item.startDate === item.endDate
                            ? formatDateDisplay(item.startDate, true)
                            : `${formatDateDisplay(item.startDate)} ถึง ${formatDateDisplay(item.endDate)}`}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-indigo-700">
                          {item.days} วัน
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-700">
                          {item.hours} ชม.
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-700">
                          {item.reason}
                          {item.note ? ` (${item.note})` : ''}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-600">
                            {item.source}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* REPORT 5: สรุปกิจกรรมการลาพนักงาน (ป่วย/กิจ/พักร้อน/อื่นๆ/สาย) รายคน + รวมทั้งบริษัท */}
        {/* ===================================================================== */}
        {(activeTab === 'overview' || activeTab === 'report5_activity') && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                รายงานที่ 5: สรุปกิจกรรมการลาทุกประเภทและสถิติการมาสาย (รายบุคคล และ ยอดรวมทั้งบริษัท) ประจำเดือน{' '}
                {formatYearMonthThai(selectedYearMonth)}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                แสดงยอดสรุปรายบุคคลแยกตามประเภท (ลาป่วย, ลากิจ, ลาพักร้อน, ลาไม่รับค่าจ้าง, ลาอื่นๆ, มาสาย) พร้อมแถวสรุปรวมทั้งหมดท้ายตาราง
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-2.5 font-semibold">ลำดับ</th>
                    <th className="py-2.5 px-2.5 font-semibold">รหัสพนักงาน</th>
                    <th className="py-2.5 px-2.5 font-semibold">ID</th>
                    <th className="py-2.5 px-3 font-semibold">ชื่อ-นามสกุล (ชื่อเล่น)</th>
                    <th className="py-2.5 px-2.5 font-semibold">แผนก</th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-blue-50/60">
                      ลาป่วย (วัน/ชม.)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-amber-50/60">
                      ลากิจ (วัน/ชม.)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-emerald-50/60">
                      ลาพักร้อน (วัน/ชม.)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-rose-50/60">
                      ลาไม่รับค่าจ้าง (วัน/ชม.)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-purple-50/60">
                      ลาอื่นๆ (วัน/ชม.)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-indigo-50/60">
                      รวมวันลา (วัน/ชม.)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center">
                      สาย (ครั้ง)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center">
                      สาย (นาที)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center">
                      เบี้ยขยัน
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.activitySummaryReport.map((item, idx) => (
                    <tr key={item.empCode} className="hover:bg-slate-50">
                      <td className="py-2.5 px-2.5 text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-2.5 font-mono text-xs">{item.empCode}</td>
                      <td className="py-2.5 px-2.5 font-mono text-xs">{item.personId}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {item.fullName}{' '}
                        <span className="text-slate-500 font-normal">
                          ({item.nickname})
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-xs">{item.department}</td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.sickDays > 0 ? (
                          <span className="font-semibold text-blue-700">
                            {item.sickDays} ({item.sickHours}ชม.)
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.personalDays > 0 ? (
                          <span className="font-semibold text-amber-700">
                            {item.personalDays} ({item.personalHours}ชม.)
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.vacationDays > 0 ? (
                          <span className="font-semibold text-emerald-700">
                            {item.vacationDays} ({item.vacationHours}ชม.)
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.unpaidDays > 0 ? (
                          <span className="font-semibold text-rose-700">
                            {item.unpaidDays} ({item.unpaidHours}ชม.)
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.otherDays > 0 ? (
                          <span className="font-semibold text-purple-700">
                            {item.otherDays} ({item.otherHours}ชม.)
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-bold bg-indigo-50/30">
                        {item.totalLeaveDays > 0 ? (
                          <span className="text-indigo-900">
                            {item.totalLeaveDays} วัน ({item.totalLeaveHours}ชม.)
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-semibold">
                        <span
                          className={
                            item.lateCount > 0
                              ? 'text-amber-700'
                              : 'text-slate-400'
                          }
                        >
                          {item.lateCount}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-semibold">
                        <span
                          className={
                            item.lateMinutes > 0
                              ? 'text-rose-600'
                              : 'text-slate-400'
                          }
                        >
                          {item.lateMinutes}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.diligenceEligible ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            ได้รับ
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-indigo-950 text-white font-bold">
                    <td colSpan={5} className="py-3 px-3 text-right">
                      รวมทั้งบริษัท (Grand Total):
                    </td>
                    <td className="py-3 px-2.5 text-center text-sky-200">
                      {auditResult.activityGrandTotal.sickDays} วัน (
                      {auditResult.activityGrandTotal.sickHours}ชม.)
                    </td>
                    <td className="py-3 px-2.5 text-center text-amber-200">
                      {auditResult.activityGrandTotal.personalDays} วัน (
                      {auditResult.activityGrandTotal.personalHours}ชม.)
                    </td>
                    <td className="py-3 px-2.5 text-center text-emerald-200">
                      {auditResult.activityGrandTotal.vacationDays} วัน (
                      {auditResult.activityGrandTotal.vacationHours}ชม.)
                    </td>
                    <td className="py-3 px-2.5 text-center text-rose-200">
                      {auditResult.activityGrandTotal.unpaidDays} วัน (
                      {auditResult.activityGrandTotal.unpaidHours}ชม.)
                    </td>
                    <td className="py-3 px-2.5 text-center text-purple-200">
                      {auditResult.activityGrandTotal.otherDays} วัน (
                      {auditResult.activityGrandTotal.otherHours}ชม.)
                    </td>
                    <td className="py-3 px-2.5 text-center bg-indigo-900 text-white">
                      {auditResult.activityGrandTotal.totalLeaveDays} วัน (
                      {auditResult.activityGrandTotal.totalLeaveHours}ชม.)
                    </td>
                    <td className="py-3 px-2.5 text-center text-amber-300">
                      {auditResult.activityGrandTotal.lateCount} ครั้ง
                    </td>
                    <td className="py-3 px-2.5 text-center text-rose-300">
                      {auditResult.activityGrandTotal.lateMinutes} นาที
                    </td>
                    <td className="py-3 px-2.5 text-center text-emerald-300">
                      {auditResult.activityGrandTotal.diligenceEligibleCount} คน
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* REPORT 6: สิทธิคงเหลือแต่ละบุคคล */}
        {/* ===================================================================== */}
        {(activeTab === 'overview' || activeTab === 'report6_quota') && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                รายงานที่ 6: สรุปสิทธิวันลาคงเหลือรายบุคคล (อ้างอิงจากชีต &quot;สิทธิคงเหลือ&quot; เป็นหลัก)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                แสดงโควตาวันลาที่ได้ทั้งหมด วันลาที่ใช้ไปสะสม และวันลาคงเหลือของพนักงานแต่ละคน พร้อมเปรียบเทียบยอดใช้ในเดือน {selectedYearMonth}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-2.5 font-semibold" rowSpan={2}>
                      รหัสพนักงาน
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold" rowSpan={2}>
                      ID
                    </th>
                    <th className="py-2.5 px-3 font-semibold" rowSpan={2}>
                      ชื่อ-นามสกุล (ชื่อเล่น)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold" rowSpan={2}>
                      แผนก
                    </th>
                    <th
                      className="py-1.5 px-2 font-semibold text-center bg-blue-50 border-b border-blue-200"
                      colSpan={3}
                    >
                      ลาป่วย (วัน)
                    </th>
                    <th
                      className="py-1.5 px-2 font-semibold text-center bg-amber-50 border-b border-amber-200"
                      colSpan={3}
                    >
                      ลากิจ (วัน)
                    </th>
                    <th
                      className="py-1.5 px-2 font-semibold text-center bg-emerald-50 border-b border-emerald-200"
                      colSpan={3}
                    >
                      ลาพักร้อน (วัน)
                    </th>
                    <th
                      className="py-1.5 px-2 font-semibold text-center bg-purple-50 border-b border-purple-200"
                      colSpan={2}
                    >
                      ลาอื่นๆ (วัน)
                    </th>
                  </tr>
                  <tr className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
                    <th className="py-1.5 px-2 text-center bg-blue-50/50">สิทธิ์</th>
                    <th className="py-1.5 px-2 text-center bg-blue-50/50">ใช้สะสม</th>
                    <th className="py-1.5 px-2 text-center font-bold text-blue-900 bg-blue-100/60">
                      คงเหลือ
                    </th>
                    <th className="py-1.5 px-2 text-center bg-amber-50/50">สิทธิ์</th>
                    <th className="py-1.5 px-2 text-center bg-amber-50/50">ใช้สะสม</th>
                    <th className="py-1.5 px-2 text-center font-bold text-amber-900 bg-amber-100/60">
                      คงเหลือ
                    </th>
                    <th className="py-1.5 px-2 text-center bg-emerald-50/50">สิทธิ์</th>
                    <th className="py-1.5 px-2 text-center bg-emerald-50/50">ใช้สะสม</th>
                    <th className="py-1.5 px-2 text-center font-bold text-emerald-900 bg-emerald-100/60">
                      คงเหลือ
                    </th>
                    <th className="py-1.5 px-2 text-center bg-purple-50/50">สิทธิ์</th>
                    <th className="py-1.5 px-2 text-center font-bold text-purple-900 bg-purple-100/60">
                      คงเหลือ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.quotaReport.map((q) => (
                    <tr key={q.empCode} className="hover:bg-slate-50">
                      <td className="py-2.5 px-2.5 font-mono text-xs">{q.empCode}</td>
                      <td className="py-2.5 px-2.5 font-mono text-xs">{q.personId}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {q.fullName}{' '}
                        <span className="text-slate-500 font-normal">
                          ({q.nickname})
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-xs">{q.department}</td>
                      {/* ลาป่วย */}
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {q.sickQuota}
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {q.sickUsedTotal}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-blue-800 bg-blue-50/40">
                        {q.sickRemaining}
                      </td>
                      {/* ลากิจ */}
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {q.personalQuota}
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {q.personalUsedTotal}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-amber-800 bg-amber-50/40">
                        {q.personalRemaining}
                      </td>
                      {/* ลาพักร้อน */}
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {q.vacationQuota}
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {q.vacationUsedTotal}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-emerald-800 bg-emerald-50/40">
                        {q.vacationRemaining}
                      </td>
                      {/* ลาอื่นๆ */}
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {q.otherQuota}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-purple-800 bg-purple-50/40">
                        {q.otherRemaining}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* TAB 7: ตรวจสอบสแกนนิ้วรายวัน & แก้ไข/ใส่หมายเหตุ (HR Override) */}
        {/* ===================================================================== */}
        {activeTab === 'daily_audit' && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-indigo-600" />
                  ตรวจสอบการสแกนนิ้วรายวัน กฎฝ่ายขาย และเมนู &quot;แก้ไข/ใส่หมายเหตุ&quot; สำหรับ HR
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  ข้อมูลสแกนนิ้วต้นฉบับจะถูกเก็บรักษาไว้เสมอ การแก้ไขหรือใส่หมายเหตุของ HR จะถูกบันทึกแยกในชั้น Override
                </p>
              </div>

              {/* ตัวกรอง */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อ, วันที่, หมายเหตุ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <select
                  value={dailyFilterEmp}
                  onChange={(e) => setDailyFilterEmp(e.target.value)}
                  className="px-2.5 py-1.5 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ALL">พนักงานทุกคน</option>
                  {auditResult.activitySummaryReport.map((emp) => (
                    <option key={emp.empCode} value={emp.empCode}>
                      {emp.fullName} ({emp.nickname})
                    </option>
                  ))}
                </select>

                <select
                  value={dailyFilterStatus}
                  onChange={(e) => setDailyFilterStatus(e.target.value)}
                  className="px-2.5 py-1.5 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ALL">ทุกสถานะ ({auditResult.dailyRecords.length})</option>
                  <option value="ANOMALY">
                    เฉพาะแจ้งเตือนสแกนไม่ครบ / พบลูกค้า ({auditResult.scanAnomalyRecords.length})
                  </option>
                  <option value="LATE">เฉพาะวันที่มาสาย</option>
                  <option value="SALES_VISIT">
                    เฉพาะฝ่ายขาย: คาดว่าไปพบลูกค้า & วันถัดไป (09:00)
                  </option>
                  <option value="OVERRIDDEN">เฉพาะรายการที่ HR แก้ไข/ใส่หมายเหตุ</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-semibold">วันที่</th>
                    <th className="py-2.5 px-3 font-semibold">พนักงาน</th>
                    <th className="py-2.5 px-2.5 font-semibold">แผนก</th>
                    <th className="py-2.5 px-2.5 font-semibold text-center">
                      สแกนต้นฉบับ (เข้า - ออก)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center">
                      เวลาที่ใช้คำนวณ
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center">
                      เกณฑ์เวลาสาย
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center">
                      สาย (นาที)
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      สถานะสแกนนิ้ว / กฎฝ่ายขาย
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      ข้อมูลการลา / หมายเหตุ HR
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center no-print">
                      จัดการ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredDailyRecords.map((r) => (
                    <tr
                      key={r.key}
                      className={
                        r.hasHROverride
                          ? 'bg-indigo-50/40 hover:bg-indigo-50/70'
                          : r.scanStatus === 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา'
                          ? 'bg-rose-50/40 hover:bg-rose-50/70'
                          : r.salesStatus === 'คาดว่าไปพบลูกค้า'
                          ? 'bg-sky-50/40 hover:bg-sky-50/70'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                        {formatDateDisplay(r.date)}{' '}
                        <span className="text-slate-500">({r.dayOfWeek})</span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {r.fullName}{' '}
                        <span className="text-slate-500">
                          ({r.nickname} / ID:{r.personId})
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5">{r.department}</td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-slate-600">
                        {r.originalScanIn} - {r.originalScanOut}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono font-semibold text-slate-900">
                        {r.effectiveScanIn} - {r.effectiveScanOut}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            r.lateRuleApplied.includes('09:00')
                              ? 'bg-sky-100 text-sky-800 font-semibold'
                              : r.lateRuleApplied.includes('เสียเบี้ยขยัน')
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.lateRuleApplied}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {r.lateCount > 0 ? (
                          <span className="font-bold text-rose-600">
                            {r.lateMinutes} นาที
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            r.scanStatus === 'ครบปกติ'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.scanStatus === 'ลาเต็มวัน/มีข้อมูลการลา'
                              ? 'bg-indigo-100 text-indigo-800'
                              : r.scanStatus === 'คาดว่าไปพบลูกค้า'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.alertMessage || r.scanStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 space-y-0.5">
                        {r.leaveDetails.length > 0 && (
                          <div className="text-indigo-700 font-medium">
                            {r.leaveDetails.join(', ')}
                          </div>
                        )}
                        {r.sheetNote && (
                          <div className="text-slate-500">
                            ชีตเดิม: {r.sheetNote}
                          </div>
                        )}
                        {r.hrNote && (
                          <div className="text-emerald-700 font-semibold">
                            หมายเหตุ HR: {r.hrNote}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center no-print">
                        <button
                          onClick={() => handleOpenEditDaily(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          แก้ไข/หมายเหตุ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* TAB 8: ผูก ID บุคคล & กฎการมาทำงานบริษัท */}
        {/* ===================================================================== */}
        {activeTab === 'id_mapping_rules' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ตารางผูก ID บุคคล */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  ตารางผูก ID บุคคลสำหรับเชื่อมต่อ (สแกนนิ้ว ↔ แบบฟอร์มลาออนไลน์)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  ใช้เชื่อมโยง ID บุคคลและชื่อเล่นในเครื่องสแกนนิ้วเข้ากับรหัสพนักงานและชื่อ-นามสกุลจริง
                </p>
              </div>

              <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                <form
                  onSubmit={handleAddMapping}
                  className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs"
                >
                  <input
                    type="text"
                    placeholder="ID บุคคล (เช่น 25)"
                    value={newMapPersonId}
                    onChange={(e) => setNewMapPersonId(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                  />
                  <input
                    type="text"
                    placeholder="ชื่อในสแกนนิ้ว (เช่น Sita)"
                    value={newMapScannerName}
                    onChange={(e) => setNewMapScannerName(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                  />
                  <input
                    type="text"
                    placeholder="รหัสพนักงาน *"
                    value={newMapEmpCode}
                    onChange={(e) => setNewMapEmpCode(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                    required
                  />
                  <input
                    type="text"
                    placeholder="ชื่อ-นามสกุลจริง *"
                    value={newMapFullName}
                    onChange={(e) => setNewMapFullName(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                    required
                  />
                  <input
                    type="text"
                    placeholder="ชื่อเล่นไทย (เช่น สิตา)"
                    value={newMapNickname}
                    onChange={(e) => setNewMapNickname(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                  />
                  <div className="flex gap-1">
                    <select
                      value={newMapDept}
                      onChange={(e) => setNewMapDept(e.target.value)}
                      className="px-2 py-1.5 border border-slate-300 rounded bg-white flex-1"
                    >
                      <option value="ฝ่ายแอดมิน">ฝ่ายแอดมิน</option>
                      <option value="ฝ่ายขาย">ฝ่ายขาย</option>
                      <option value="ฝ่ายคลังสินค้า">ฝ่ายคลังสินค้า</option>
                    </select>
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-indigo-600 text-white font-semibold rounded hover:bg-indigo-500 cursor-pointer"
                    >
                      + เพิ่ม
                    </button>
                  </div>
                </form>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <th className="py-2 px-3">ID บุคคล</th>
                      <th className="py-2 px-3">ชื่อสแกนนิ้ว</th>
                      <th className="py-2 px-3">รหัสพนักงาน</th>
                      <th className="py-2 px-3">ชื่อ-นามสกุล</th>
                      <th className="py-2 px-3">ชื่อเล่น</th>
                      <th className="py-2 px-3">แผนก/ฝ่าย</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {employeeMappings.map((m) => (
                      <tr key={m.empCode} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                          {m.personId}
                        </td>
                        <td className="py-2 px-3 font-medium">{m.scannerName}</td>
                        <td className="py-2 px-3 font-mono">{m.empCode}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {m.fullName}
                        </td>
                        <td className="py-2 px-3">{m.nickname}</td>
                        <td className="py-2 px-3">{m.department}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* กฎการมาทำงานบริษัท Attendance_Audit_Business_Rules_JCW */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
                <FileText className="w-5 h-5 text-emerald-600" />
                สรุปกฎการมาทำงานและการลา (Attendance_Audit_Business_Rules_JCW)
              </h2>

              <div className="space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <h3 className="font-bold text-slate-900">
                    1. เวลาทำงานมาตรฐานและการนับสาย
                  </h3>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
                    <li>เวลาทำงานปกติ: 08:00 – 17:00 น. (จันทร์ – ศุกร์)</li>
                    <li>
                      สแกนเข้างาน <strong>ไม่เกิน 08:00 น.</strong> = ปกติ และเข้าเงื่อนไขเบี้ยขยัน
                    </li>
                    <li>
                      สแกนเข้างาน <strong>08:01 – 08:15 น.</strong> = อนุโลมไม่ถือว่าสาย (สาย 0 ครั้ง, 0 นาที) แต่<strong>เสียสิทธิเบี้ยขยัน</strong>
                    </li>
                    <li>
                      สแกนเข้างาน <strong>08:16 น. เป็นต้นไป</strong> = สาย 1 ครั้ง และนับนาทีสายตั้งแต่นาทีหลัง 08:15 น. (เช่น 08:16 = 1 นาที, 08:19 = 4 นาที)
                    </li>
                  </ul>
                </div>

                <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200">
                  <h3 className="font-bold text-emerald-950">
                    2. กฎการพิจารณาเบี้ยขยัน (ต้องผ่านครบทั้ง 3 ข้อ)
                  </h3>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-xs text-emerald-900">
                    <li>ข้อ 1: ไม่ได้สังกัด <strong>ฝ่ายขาย</strong></li>
                    <li>
                      ข้อ 2: ทุกวันทำงานที่มีการมาทำงาน ต้องมีเวลาสแกนเข้า <strong>&le; 08:00 น.</strong>
                    </li>
                    <li>
                      ข้อ 3: วันลารวมทุกประเภทในเดือนนั้น <strong>&le; 1.0 วัน</strong> (เช่น ลา 0.5 + 0.5 = 1.0 วัน ยังได้เบี้ยขยัน)
                    </li>
                  </ul>
                </div>

                <div className="p-3 rounded-lg bg-sky-50/60 border border-sky-200">
                  <h3 className="font-bold text-sky-950">
                    3. กฎพิเศษสำหรับ &quot;ฝ่ายขาย&quot; (Sales Department)
                  </h3>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-xs text-sky-900">
                    <li>พนักงานฝ่ายขายไม่มีสิทธิได้รับเบี้ยขยัน</li>
                    <li>
                      ในวันทำงานที่พนักงานฝ่ายขาย<strong>ไม่พบสแกนนิ้วเข้างาน และไม่มีข้อมูลการลา</strong> ระบบจะตั้งสถานะเป็น{' '}
                      <strong>&quot;คาดว่าไปพบลูกค้า&quot;</strong>
                    </li>
                    <li>
                      <strong>วันทำงานถัดไป</strong>หลังจากวันที่ &quot;คาดว่าไปพบลูกค้า&quot; พนักงานฝ่ายขายคนนั้นได้รับสิทธิ์เข้างานได้ถึง{' '}
                      <strong>09:00 น.</strong> โดยไม่ถือว่าสาย (เริ่มนับสายตั้งแต่ <strong>09:01 น.</strong> เป็นต้นไป โดยคิดนาทีสายจากหลัง 09:00 น.)
                    </li>
                  </ul>
                </div>

                <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200">
                  <h3 className="font-bold text-amber-950">
                    4. การแปลงชั่วโมงการลาและรูปแบบวันที่ระหว่างไฟล์
                  </h3>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-xs text-amber-900">
                    <li>อัตราแปลงชั่วโมงลา: <strong>8 ชั่วโมง = 1 วันทำงาน</strong> (4 ชม. = 0.5 วัน, 2 ชม. = 0.25 วัน)</li>
                    <li>
                      <strong>ระวังรูปแบบวันที่:</strong> ไฟล์บันทึกเข้างาน (คอลัมน์ G) เรียง <code>YYYY-MM-DD</code> ส่วนไฟล์แบบฟอร์มลาออนไลน์ (คอลัมน์ I, J) เรียง <code>DD/MM/YYYY</code> (ระบบแปลงให้อัตโนมัติ)
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* MODAL 1: แก้ไข / ใส่หมายเหตุรายวันสำหรับ HR (Override) */}
      {/* ===================================================================== */}
      {editingDailyRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  แก้ไข / ใส่หมายเหตุ HR (ไม่ทับข้อมูลสแกนนิ้วเดิม)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingDailyRecord.fullName} ({editingDailyRecord.nickname}) — วันที่{' '}
                  {formatDateDisplay(editingDailyRecord.date, true)}
                </p>
              </div>
              <button
                onClick={() => setEditingDailyRecord(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-slate-100 text-xs flex items-center justify-between">
              <span>
                เวลาสแกนนิ้วต้นฉบับ:{' '}
                <strong className="font-mono">
                  เข้า {editingDailyRecord.originalScanIn} / ออก{' '}
                  {editingDailyRecord.originalScanOut}
                </strong>
              </span>
              <span className="text-slate-500">
                (ข้อมูลต้นฉบับถูกเก็บไว้เสมอ)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  เวลาเข้างานที่ปรับแก้ (ถ้ามี)
                </label>
                <input
                  type="text"
                  placeholder="เช่น 08:00:00"
                  value={overrideScanInInput}
                  onChange={(e) => setOverrideScanInInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  เวลาออกงานที่ปรับแก้ (ถ้ามี)
                </label>
                <input
                  type="text"
                  placeholder="เช่น 17:00:00"
                  value={overrideScanOutInput}
                  onChange={(e) => setOverrideScanOutInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="text-xs sm:text-sm">
              <label className="block font-medium text-slate-700 mb-1">
                ปรับสถานะการสแกนนิ้วรายวัน
              </label>
              <select
                value={overrideStatusInput}
                onChange={(e) => setOverrideStatusInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- คำนวณตามกฎบริษัทอัตโนมัติ --</option>
                <option value="ครบปกติ">ครบปกติ</option>
                <option value="คาดว่าไปพบลูกค้า">คาดว่าไปพบลูกค้า (ฝ่ายขาย)</option>
                <option value="ลาเต็มวัน/มีข้อมูลการลา">ลาเต็มวัน/มีข้อมูลการลา</option>
                <option value="พบสแกนเข้า แต่ไม่พบสแกนออก">
                  พบสแกนเข้า แต่ไม่พบสแกนออก
                </option>
                <option value="ไม่พบสแกนเข้า แต่พบสแกนออก">
                  ไม่พบสแกนเข้า แต่พบสแกนออก
                </option>
                <option value="ไม่พบสแกนเข้า-ออกและไม่มีใบลา">
                  ไม่พบสแกนเข้า-ออกและไม่มีใบลา
                </option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  กำหนดจำนวนครั้งที่สายเอง (ถ้าต้องการ)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  placeholder="เว้นว่างเพื่อคำนวณอัตโนมัติ"
                  value={overrideLateCountInput}
                  onChange={(e) => setOverrideLateCountInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  กำหนดนาทีสายเอง (ถ้าต้องการ)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="เว้นว่างเพื่อคำนวณอัตโนมัติ"
                  value={overrideLateMinutesInput}
                  onChange={(e) => setOverrideLateMinutesInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="text-xs sm:text-sm">
              <label className="block font-medium text-slate-700 mb-1">
                หมายเหตุจาก HR
              </label>
              <textarea
                rows={3}
                placeholder="ระบุหมายเหตุ เช่น ลืมสแกนนิ้วออก, ออกไปพบลูกค้าข้างนอก, อนุโลมพิเศษ..."
                value={overrideNoteInput}
                onChange={(e) => setOverrideNoteInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingDailyRecord(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveDailyOverride}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold cursor-pointer"
              >
                บันทึกการแก้ไข/หมายเหตุ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: อัปโหลดไฟล์ Excel / CSV */}
      {/* ===================================================================== */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                อัปโหลดไฟล์ Excel (.xlsx) หรือ CSV ประจำเดือน
              </h3>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-2 border-dashed border-indigo-300 rounded-xl bg-indigo-50/40 text-center space-y-2">
              <p className="text-xs sm:text-sm font-medium text-slate-800">
                เลือกไฟล์ <strong>บันทึกเข้างาน.xlsx</strong> หรือ{' '}
                <strong>แบบฟอร์มลาออนไลน์.xlsx</strong> (เลือกพร้อมกันหลายไฟล์ได้)
              </p>
              <p className="text-xs text-slate-500">
                ระบบรองรับการอ่านทุกชีตอัตโนมัติ และแยกแยะรูปแบบวันที่คอลัมน์ G (YYYY-MM-DD) กับคอลัมน์ I (DD/MM/YYYY) ให้ทันที
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 mt-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold cursor-pointer">
                <Upload className="w-4 h-4" />
                เลือกไฟล์จากคอมพิวเตอร์
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {uploadStatusMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 whitespace-pre-line">
                {uploadStatusMsg}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs sm:text-sm font-semibold cursor-pointer"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: เพิ่มใบลาออนไลน์ใหม่ */}
      {/* ===================================================================== */}
      {isAddLeaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleAddManualLeave}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                บันทึกการใช้สิทธิการลาเพิ่มเติม
              </h3>
              <button
                type="button"
                onClick={() => setIsAddLeaveModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  เลือกพนักงาน
                </label>
                <select
                  value={newLeaveEmpCode}
                  onChange={(e) => setNewLeaveEmpCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {employeeMappings.map((m) => (
                    <option key={m.empCode} value={m.empCode}>
                      {m.fullName} ({m.nickname}) — {m.department}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    ประเภทการลา
                  </label>
                  <select
                    value={newLeaveType}
                    onChange={(e) =>
                      setNewLeaveType(e.target.value as LeaveCategory)
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ลาป่วย">ลาป่วย</option>
                    <option value="ลากิจ">ลากิจ</option>
                    <option value="ลาพักร้อน">ลาพักร้อน</option>
                    <option value="ลาไม่รับค่าจ้าง">ลาไม่รับค่าจ้าง</option>
                    <option value="ลาอื่นๆ">ลาอื่นๆ</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    จำนวนชั่วโมงลา (8 ชม. = 1 วัน)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={newLeaveHours}
                    onChange={(e) => setNewLeaveHours(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    ตั้งแต่วันที่
                  </label>
                  <input
                    type="date"
                    value={newLeaveStartDate}
                    onChange={(e) => {
                      setNewLeaveStartDate(e.target.value);
                      setNewLeaveEndDate(e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    ถึงวันที่
                  </label>
                  <input
                    type="date"
                    value={newLeaveEndDate}
                    onChange={(e) => setNewLeaveEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  เหตุผลการลา
                </label>
                <input
                  type="text"
                  placeholder="ระบุเหตุผลการลา..."
                  value={newLeaveReason}
                  onChange={(e) => setNewLeaveReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newLeaveIsUnpaid}
                  onChange={(e) => setNewLeaveIsUnpaid(e.target.checked)}
                />
                <span className="text-rose-700 font-medium">
                  ระบุเป็น &quot;ลาไม่รับค่าจ้าง&quot;
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddLeaveModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs sm:text-sm font-semibold cursor-pointer"
              >
                บันทึกรายการลา
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: ตั้งค่าฐานข้อมูล Firebase Firestore */}
      {/* ===================================================================== */}
      {isFirebaseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-indigo-600" />
                  ตั้งค่าการเชื่อมต่อฐานข้อมูล Firebase Firestore
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  สถานะปัจจุบัน: {syncStatus}
                </p>
              </div>
              <button
                onClick={() => setIsFirebaseModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  API Key (VITE_FIREBASE_API_KEY)
                </label>
                <input
                  type="text"
                  placeholder="AIzaSy..."
                  value={firebaseConfigInput.apiKey}
                  onChange={(e) =>
                    setFirebaseConfigInput({
                      ...firebaseConfigInput,
                      apiKey: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Project ID (VITE_FIREBASE_PROJECT_ID)
                </label>
                <input
                  type="text"
                  placeholder="jcw-hr-attendance"
                  value={firebaseConfigInput.projectId}
                  onChange={(e) =>
                    setFirebaseConfigInput({
                      ...firebaseConfigInput,
                      projectId: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Auth Domain
                </label>
                <input
                  type="text"
                  placeholder="jcw-hr-attendance.firebaseapp.com"
                  value={firebaseConfigInput.authDomain}
                  onChange={(e) =>
                    setFirebaseConfigInput({
                      ...firebaseConfigInput,
                      authDomain: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  App ID
                </label>
                <input
                  type="text"
                  placeholder="1:123456789:web:abcdef"
                  value={firebaseConfigInput.appId || ''}
                  onChange={(e) =>
                    setFirebaseConfigInput({
                      ...firebaseConfigInput,
                      appId: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={async () => {
                  saveFirebaseConfigToLocal(firebaseConfigInput);
                  await triggerSaveState();
                  setIsFirebaseModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold cursor-pointer"
              >
                บันทึกและซิงก์ข้อมูลขึ้น Firebase
              </button>
              <button
                onClick={() => setIsFirebaseModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs sm:text-sm cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 no-print">
        JCW International HR Time Attendance & Leave Audit System • รองรับ Firebase Firestore + GitHub + Vercel Deployment
      </footer>
    </div>
  );
}
