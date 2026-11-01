import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Briefcase,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  Database,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  LayoutDashboard,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
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
  format2,
  formatDateDisplay,
  formatHoursClean,
  formatLeaveHuman,
  formatYearMonthThai,
  inspectLeaveDateRange,
  round2,
} from './utils/dateAndTime';
import {
  exportHRPayrollReportToExcel,
  exportManagerReportToExcel,
} from './utils/excelExporter';
import {
  FirebaseConfigData,
  getSavedFirebaseConfig,
  isFirebaseConnected,
  loadHRState,
  saveFirebaseConfigToLocal,
  saveHRState,
} from './services/firebaseService';

type ActiveTab =
  | 'executive_1page'
  | 'hr_exceptions'
  | 'overview'
  | 'report1_diligence'
  | 'report2_late'
  | 'report3_unpaid'
  | 'report4_monthly_leave'
  | 'report5_activity'
  | 'report6_quota'
  | 'daily_audit'
  | 'company_rules';

type ReportAudienceMode = 'manager' | 'hr_payroll';

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
  const [autoSkipEmptyDays] = useState<boolean>(true);

  // เดือนที่เลือก (ค่าเริ่มต้น: 2026-10 เดือนตุลาคม ชีต 10 ล่าสุด)
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>('2026-10');
  const [activeTab, setActiveTab] = useState<ActiveTab>('executive_1page');
  const [reportMode, setReportMode] =
    useState<ReportAudienceMode>('hr_payroll');

  // ตัวกรองตารางตรวจสอบสแกนนิ้วรายวัน และหน้า HR Exception
  const [dailyFilterEmp, setDailyFilterEmp] = useState<string>('ALL');
  const [dailyFilterStatus, setDailyFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [exceptionSubFilter, setExceptionSubFilter] = useState<
    'ALL' | 'MISSING_OUT' | 'MISSING_IN' | 'CLIENT_VISIT'
  >('ALL');

  // ระบบแก้ไขแบบกลุ่ม (Bulk Edit) + แสดงผลกระทบก่อนบันทึก (Impact Preview)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkStatusInput, setBulkStatusInput] = useState<string>('ครบปกติ');
  const [bulkScanInInput, setBulkScanInInput] = useState<string>('');
  const [bulkScanOutInput, setBulkScanOutInput] = useState<string>('');
  const [bulkWaiveLate, setBulkWaiveLate] = useState<boolean>(false);
  const [bulkNoteInput, setBulkNoteInput] = useState<string>('');
  const [isBulkPreviewOpen, setIsBulkPreviewOpen] = useState<boolean>(false);

  // Modal สำหรับแก้ไข/ใส่หมายเหตุรายวันเดี่ยว (HR Override)
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
          authDomain: 'timeattendencejcw.firebaseapp.com',
          projectId: 'timeattendencejcw',
          storageBucket: 'timeattendencejcw.firebasestorage.app',
          messagingSenderId: '',
          appId: '',
        }
      );
    });
  const [syncStatus, setSyncStatus] = useState<string>(
    'พร้อมใช้งาน (timeattendenceJCW)'
  );

  // Modal เพิ่มใบลาออนไลน์ใหม่
  const [isAddLeaveModalOpen, setIsAddLeaveModalOpen] =
    useState<boolean>(false);
  const [newLeaveEmpCode, setNewLeaveEmpCode] = useState<string>(
    SEED_ID_MAPPING[0].empCode
  );
  const [newLeaveType, setNewLeaveType] = useState<LeaveCategory>('ลาป่วย');
  const [newLeaveStartDate, setNewLeaveStartDate] =
    useState<string>('2026-10-15');
  const [newLeaveEndDate, setNewLeaveEndDate] = useState<string>('2026-10-15');
  const [newLeaveHours, setNewLeaveHours] = useState<string>('8');
  const [newLeaveReason, setNewLeaveReason] = useState<string>('');
  const [newLeaveIsUnpaid, setNewLeaveIsUnpaid] = useState<boolean>(false);

  // โหลดข้อมูลจาก Firebase / LocalStorage ตอนเปิดแอป
  useEffect(() => {
    let mounted = true;
    loadHRState().then(async ({ state, source }) => {
      if (!mounted) return;
      const hasValidMappings =
        state?.employeeMappings &&
        state.employeeMappings.length > 0 &&
        state.employeeMappings.every(
          (m) =>
            Boolean(m.empCode) && Boolean(m.scannerName) && Boolean(m.position)
        );
      const hasValidQuotas =
        state?.quotaRecords &&
        state.quotaRecords.length > 0 &&
        state.quotaRecords.every(
          (q) => q.sickQuotaDays > 0 && Boolean(q.position)
        );
      const hasValidLeaves =
        state?.leaveRecords &&
        state.leaveRecords.length > 0 &&
        state.leaveRecords.every(
          (l) =>
            Boolean(l.startDate) &&
            /^\d{4}-\d{2}-\d{2}$/.test(l.startDate) &&
            l.hours > 0
        );

      const nextMappings = hasValidMappings
        ? state!.employeeMappings!
        : SEED_ID_MAPPING;
      const nextQuotas = hasValidQuotas
        ? state!.quotaRecords!
        : initialQuotaRecords;
      const nextLeaves = hasValidLeaves
        ? state!.leaveRecords!
        : initialLeaveRecords;
      const nextOverrides = state?.hrOverrides || {};
      const nextSettings = state?.settings || DEFAULT_SETTINGS;

      setEmployeeMappings(nextMappings);
      setQuotaRecords(nextQuotas);
      setLeaveRecords(nextLeaves);
      setHrOverrides(nextOverrides);
      setSettings(nextSettings);

      if (
        source === 'firebase' &&
        hasValidMappings &&
        hasValidQuotas &&
        hasValidLeaves
      ) {
        setSyncStatus(
          'เชื่อมต่อและซิงก์ข้อมูลกับ Firebase (timeattendenceJCW) สำเร็จ'
        );
      } else {
        const res = await saveHRState({
          employeeMappings: nextMappings,
          quotaRecords: nextQuotas,
          leaveRecords: nextLeaves,
          hrOverrides: nextOverrides,
          settings: nextSettings,
          updatedAt: new Date().toISOString(),
        });
        if (res.savedFirebase) {
          setSyncStatus(
            'ซิงก์ข้อมูลล่าสุดขึ้น Firebase (timeattendenceJCW) สำเร็จ'
          );
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, [initialLeaveRecords, initialQuotaRecords]);

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
      setSyncStatus('บันทึกขึ้น Firebase Firestore (timeattendenceJCW) แล้ว');
    } else if (res.savedLocal) {
      setSyncStatus('บันทึกในเครื่องแล้ว');
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

  // ประมวลผลรายงานทั้งหมดด้วย Audit Engine
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

  // สร้าง Map ของ dailyRecords ตาม key เพื่อใช้ใน Bulk Edit
  const dailyRecordByKey = useMemo(() => {
    const map = new Map<string, DailyAuditRecord>();
    for (const r of auditResult.dailyRecords) {
      map.set(r.key, r);
    }
    return map;
  }, [auditResult.dailyRecords]);

  // สร้างชุด Overrides จำลองสำหรับการแก้ไขแบบกลุ่ม (Bulk Edit Preview)
  const simulatedBulkOverrides = useMemo(() => {
    if (!isBulkPreviewOpen || selectedKeys.length === 0) return hrOverrides;
    const next = { ...hrOverrides };
    const nowStr = new Date().toLocaleString('th-TH');

    for (const key of selectedKeys) {
      const rec = dailyRecordByKey.get(key);
      if (!rec) continue;
      const existing = next[key];
      next[key] = {
        key,
        empKey: rec.empCode,
        employeeName: `${rec.fullName} (${rec.nickname})`,
        date: rec.date,
        previousSummary: `เข้า ${rec.originalScanIn} - ออก ${rec.originalScanOut} (${rec.scanStatus}${rec.lateMinutes > 0 ? `, สาย ${rec.lateMinutes} นาที` : ''})`,
        overrideScanIn:
          bulkScanInInput.trim() !== ''
            ? bulkScanInInput.trim()
            : existing?.overrideScanIn,
        overrideScanOut:
          bulkScanOutInput.trim() !== ''
            ? bulkScanOutInput.trim()
            : existing?.overrideScanOut,
        overrideStatus:
          bulkStatusInput !== ''
            ? (bulkStatusInput as DailyAuditRecord['scanStatus'])
            : existing?.overrideStatus,
        overrideLateCount: bulkWaiveLate
          ? 0
          : existing?.overrideLateCount ?? null,
        overrideLateMinutes: bulkWaiveLate
          ? 0
          : existing?.overrideLateMinutes ?? null,
        hrNote:
          bulkNoteInput.trim() !== ''
            ? bulkNoteInput.trim()
            : existing?.hrNote || 'HR ตรวจสอบและปรับปรุงแบบกลุ่ม',
        updatedAt: nowStr,
      };
    }
    return next;
  }, [
    isBulkPreviewOpen,
    selectedKeys,
    hrOverrides,
    dailyRecordByKey,
    bulkScanInInput,
    bulkScanOutInput,
    bulkStatusInput,
    bulkWaiveLate,
    bulkNoteInput,
  ]);

  // ประมวลผลผลลัพธ์จำลอง (After Bulk Edit) เพื่อแสดงผลกระทบก่อนบันทึกจริง
  const previewAuditResult = useMemo(() => {
    if (!isBulkPreviewOpen || selectedKeys.length === 0) return auditResult;
    return runMonthlyAttendanceAudit({
      yearMonth: selectedYearMonth,
      attendanceRows,
      leaveRecords,
      quotaRecords,
      employeeMappings,
      hrOverrides: simulatedBulkOverrides,
      settings: {
        ...settings,
        onlyMappedEmployees,
        autoSkipCompanyWideEmptyDays: autoSkipEmptyDays,
      },
    });
  }, [
    isBulkPreviewOpen,
    selectedKeys.length,
    auditResult,
    selectedYearMonth,
    attendanceRows,
    leaveRecords,
    quotaRecords,
    employeeMappings,
    simulatedBulkOverrides,
    settings,
    onlyMappedEmployees,
    autoSkipEmptyDays,
  ]);

  // กรองรายการในหน้า HR Exception (เฉพาะรายการผิดปกติ 32 รายการ)
  const filteredExceptionRecords = useMemo(() => {
    return auditResult.scanAnomalyRecords.filter((r) => {
      if (
        exceptionSubFilter === 'MISSING_OUT' &&
        r.scanStatus !== 'พบสแกนเข้า แต่ไม่พบสแกนออก'
      ) {
        return false;
      }
      if (
        exceptionSubFilter === 'MISSING_IN' &&
        r.scanStatus !== 'ไม่พบสแกนเข้า แต่พบสแกนออก'
      ) {
        return false;
      }
      if (
        exceptionSubFilter === 'CLIENT_VISIT' &&
        r.scanStatus !== 'คาดว่าไปพบลูกค้า' &&
        r.scanStatus !== 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา'
      ) {
        return false;
      }
      if (dailyFilterEmp !== 'ALL' && r.empCode !== dailyFilterEmp) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          r.fullName.toLowerCase().includes(q) ||
          r.nickname.toLowerCase().includes(q) ||
          r.position.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.date.includes(q) ||
          r.alertMessage.toLowerCase().includes(q) ||
          r.sheetNote.toLowerCase().includes(q) ||
          r.hrNote.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    auditResult.scanAnomalyRecords,
    exceptionSubFilter,
    dailyFilterEmp,
    searchQuery,
  ]);

  // กรองรายการตรวจสอบสแกนนิ้วรายวันทั้งหมด
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
        if (
          r.salesStatus !== 'คาดว่าไปพบลูกค้า' &&
          !r.isNextDayAfterClientVisit
        ) {
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
          r.position.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
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

  // สลับการเลือกแถวสำหรับ Bulk Edit
  const toggleSelectRow = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllVisibleExceptions = () => {
    const allVisibleKeys = filteredExceptionRecords.map((r) => r.key);
    const allSelected =
      allVisibleKeys.length > 0 &&
      allVisibleKeys.every((k) => selectedKeys.includes(k));
    if (allSelected) {
      setSelectedKeys((prev) =>
        prev.filter((k) => !allVisibleKeys.includes(k))
      );
    } else {
      setSelectedKeys((prev) =>
        Array.from(new Set([...prev, ...allVisibleKeys]))
      );
    }
  };

  // ยืนยันบันทึกการแก้ไขแบบกลุ่ม (Commit Bulk Edit)
  const handleConfirmBulkSave = async () => {
    setHrOverrides(simulatedBulkOverrides);
    setIsBulkPreviewOpen(false);
    setSelectedKeys([]);
    await triggerSaveState(
      employeeMappings,
      quotaRecords,
      leaveRecords,
      simulatedBulkOverrides,
      settings
    );
  };

  // ล้างการแก้ไขของแถวที่เลือกกลับเป็นค่าต้นฉบับ
  const handleClearSelectedOverrides = async () => {
    if (selectedKeys.length === 0) return;
    const next = { ...hrOverrides };
    for (const k of selectedKeys) {
      delete next[k];
    }
    setHrOverrides(next);
    setSelectedKeys([]);
    await triggerSaveState(
      employeeMappings,
      quotaRecords,
      leaveRecords,
      next,
      settings
    );
  };

  // เปิด Modal แก้ไข/ใส่หมายเหตุรายวันเดี่ยว
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

  // บันทึก HR Override เดี่ยว โดยไม่ทับข้อมูลดิบต้นฉบับ พร้อมเก็บประวัติการแก้ไข (Audit Log)
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
        employeeName: `${editingDailyRecord.fullName} (${editingDailyRecord.nickname})`,
        date: editingDailyRecord.date,
        previousSummary: `เข้า ${editingDailyRecord.originalScanIn} - ออก ${editingDailyRecord.originalScanOut} (${editingDailyRecord.scanStatus}${editingDailyRecord.lateMinutes > 0 ? `, สาย ${editingDailyRecord.lateMinutes} นาที` : ''})`,
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
          const uploadedDates = new Set(
            res.attendanceRows.map((r) => r.date.slice(0, 7))
          );
          nextAtt = nextAtt
            .filter((r) => !uploadedDates.has(r.date.slice(0, 7)))
            .concat(res.attendanceRows);
          const latestMonth = Array.from(uploadedDates).sort().pop();
          if (latestMonth) setSelectedYearMonth(latestMonth);
          logs.push(
            `ไฟล์ "${file.name}": นำเข้าข้อมูลสแกนนิ้ว ${res.attendanceRows.length} แถว (แปลงคอลัมน์ G YYYY-MM-DD อัตโนมัติ: ${Array.from(uploadedDates).join(', ')})`
          );
        }
        if (res.leaveRecords.length > 0) {
          nextLeaves = res.leaveRecords;
          logs.push(
            `ไฟล์ "${file.name}": นำเข้าประวัติการลาออนไลน์ ${res.leaveRecords.length} รายการ (แปลงวันที่ DD/MM/YYYY คอลัมน์ I, J และตรวจสอบการลาข้ามเดือนอัตโนมัติ)`
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
            `ไฟล์ "${file.name}": อัปเดตข้อมูลเชื่อมต่อพนักงาน ${res.employeeMappings.length} รายการ`
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

    const hrs = round2(parseFloat(newLeaveHours) || 8);
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const dateCheck = inspectLeaveDateRange(
      newLeaveStartDate,
      newLeaveEndDate || newLeaveStartDate,
      nowStr
    );

    const newRec: LeaveFormRecord = {
      id: `manual-leave-${Date.now()}`,
      timestamp: nowStr,
      fullName: emp.fullName,
      nickname: emp.nickname,
      empCode: emp.empCode,
      position: emp.position || '-',
      department: emp.department,
      leaveType: newLeaveIsUnpaid ? 'ลาไม่รับค่าจ้าง' : newLeaveType,
      reason: newLeaveReason || 'HR บันทึกผ่านเว็บแอป',
      startDate: dateCheck.startDate,
      endDate: dateCheck.endDate,
      hours: hrs,
      days: round2(hrs / 8),
      attachmentUrl: '',
      status: 'อนุมัติ',
      approvedDate: new Date().toISOString().slice(0, 10),
      note: newLeaveIsUnpaid ? 'ลาไม่รับค่าจ้าง' : '',
      isUnpaidLeave: newLeaveIsUnpaid || newLeaveType === 'ลาไม่รับค่าจ้าง',
      isHistoricalCarryover: false,
      isCrossMonth: dateCheck.isCrossMonth,
      dateValidationNote: dateCheck.dateNote,
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

  const eligibleDiligenceList = auditResult.diligenceReport.filter(
    (d) => d.isEligible
  );
  const ineligibleDiligenceList = auditResult.diligenceReport.filter(
    (d) => !d.isEligible
  );
  const latePeopleList = auditResult.lateSummaryReport.filter(
    (l) => l.lateCount > 0
  );
  const unpaidPeopleList = auditResult.unpaidAndOtherLeaveReport.filter(
    (u) => u.unpaidDays > 0
  );
  const overrideHistoryList = useMemo(
    () =>
      Object.values(hrOverrides).sort((a, b) =>
        b.date.localeCompare(a.date)
      ),
    [hrOverrides]
  );

  // สถิติแยกย่อยของ HR Exception (32 รายการในเดือน ต.ค. 2026)
  const anomalyMissingOutCount = auditResult.scanAnomalyRecords.filter(
    (r) => r.scanStatus === 'พบสแกนเข้า แต่ไม่พบสแกนออก'
  ).length;
  const anomalyMissingInCount = auditResult.scanAnomalyRecords.filter(
    (r) => r.scanStatus === 'ไม่พบสแกนเข้า แต่พบสแกนออก'
  ).length;
  const anomalyClientVisitCount = auditResult.scanAnomalyRecords.filter(
    (r) =>
      r.scanStatus === 'คาดว่าไปพบลูกค้า' ||
      r.scanStatus === 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา'
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="bg-gradient-to-r from-indigo-950 via-blue-900 to-indigo-900 text-white shadow-lg no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
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
                    พร้อมคำนวณเงินเดือนจริง
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-blue-200 mt-0.5">
                  ระบบสรุปรายงานเวลาเข้างาน การลา เบี้ยขยัน สิทธิคงเหลือ และตรวจสอบ HR Exception (เชื่อมฐานข้อมูล timeattendenceJCW)
                </p>
              </div>
            </div>

            {/* Action Buttons: แยกรายงานเป็น 2 แบบ (รายงานหัวหน้า vs รายงาน HR/Payroll) */}
            <div className="flex flex-wrap items-center gap-2">
              {/* สวิตช์มุมมองรายงานบนหน้าเว็บ */}
              <div className="inline-flex items-center bg-indigo-950/80 p-1 rounded-lg border border-white/20">
                <button
                  onClick={() => {
                    setReportMode('manager');
                    if (
                      activeTab === 'hr_exceptions' ||
                      activeTab === 'daily_audit'
                    ) {
                      setActiveTab('executive_1page');
                    }
                  }}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                    reportMode === 'manager'
                      ? 'bg-amber-400 text-slate-950 shadow-xs'
                      : 'text-blue-200 hover:text-white'
                  }`}
                  title="สั้น อ่านง่าย ตัดข้อมูลเทคนิค"
                >
                  มุมมองรายงานหัวหน้า
                </button>
                <button
                  onClick={() => setReportMode('hr_payroll')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                    reportMode === 'hr_payroll'
                      ? 'bg-emerald-400 text-slate-950 shadow-xs'
                      : 'text-blue-200 hover:text-white'
                  }`}
                  title="มีรายละเอียด สแกนต้นฉบับ หมายเหตุ และประวัติการแก้ไข"
                >
                  มุมมอง HR / Payroll
                </button>
              </div>

              <button
                onClick={() => exportManagerReportToExcel(auditResult)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-sm transition cursor-pointer"
                title="ดาวน์โหลดรายงานหัวหน้า (สั้น อ่านง่าย ตัดข้อมูลเทคนิค)"
              >
                <Download className="w-4 h-4" />
                Excel รายงานหัวหน้า
              </button>

              <button
                onClick={() =>
                  exportHRPayrollReportToExcel(auditResult, hrOverrides)
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition cursor-pointer"
                title="ดาวน์โหลดรายงาน HR/Payroll (มีรายละเอียด สแกนต้นฉบับ หมายเหตุ และประวัติการแก้ไข)"
              >
                <Download className="w-4 h-4" />
                Excel รายงาน HR/Payroll
              </button>

              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/20 transition cursor-pointer"
              >
                <Upload className="w-4 h-4 text-sky-300" />
                อัปโหลดไฟล์
              </button>

              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/20 transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-amber-300" />
                พิมพ์ / PDF
              </button>

              <button
                onClick={() => setIsFirebaseModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/20 transition cursor-pointer"
                title={syncStatus}
              >
                <Database
                  className={`w-4 h-4 ${
                    isFirebaseConnected()
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }`}
                />
                Firebase
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
                  onChange={(e) => {
                    setSelectedYearMonth(e.target.value);
                    setSelectedKeys([]);
                  }}
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
                | พนักงานทั้งหมดในเดือน:{' '}
                <strong className="text-white">
                  {auditResult.activitySummaryReport.length} คน
                </strong>{' '}
                | โหมดแสดงผล:{' '}
                <strong className="text-amber-300">
                  {reportMode === 'manager'
                    ? 'รายงานหัวหน้า (สั้น อ่านง่าย ตัดข้อมูลเทคนิค)'
                    : 'รายงาน HR/Payroll (ละเอียด + สแกนต้นฉบับ + ประวัติแก้ไข)'}
                </strong>
              </span>
            </div>

            {/* Smart Audit Toggles (ซ่อนเมื่ออยู่ในโหมดหัวหน้าเพื่อตัดข้อมูลเทคนิค) */}
            {reportMode === 'hr_payroll' && (
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
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
                  <span>ไม่นับแถว &quot;บันทึกเก่า/ทดสอบ&quot;</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer bg-white/5 px-2.5 py-1 rounded border border-white/10">
                  <input
                    type="checkbox"
                    checked={onlyMappedEmployees}
                    onChange={(e) => setOnlyMappedEmployees(e.target.checked)}
                    className="rounded text-emerald-500"
                  />
                  <span>เฉพาะพนักงานปัจจุบัน</span>
                </label>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 overflow-x-auto">
          <div className="flex items-center space-x-1 py-2 min-w-max">
            {[
              {
                id: 'executive_1page',
                label: 'สรุปผู้บริหาร (1 หน้า)',
                icon: LayoutDashboard,
                badge: 'Executive',
              },
              ...(reportMode === 'hr_payroll'
                ? [
                    {
                      id: 'hr_exceptions',
                      label: 'HR Exception (รายการผิดปกติ)',
                      icon: ShieldAlert,
                      badge: `${auditResult.scanAnomalyRecords.length} รายการ`,
                    },
                  ]
                : []),
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
                badge: formatLeaveHuman(auditResult.activityGrandTotal.unpaidDays, {
                  zeroText: '0 วัน',
                }),
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
                badge: formatLeaveHuman(
                  auditResult.activityGrandTotal.totalLeaveDays,
                  { zeroText: '0 วัน' }
                ),
              },
              {
                id: 'report6_quota',
                label: '6. สิทธิคงเหลือรายบุคคล',
                icon: UserCheck,
                badge: `${auditResult.quotaReport.length} คน`,
              },
              ...(reportMode === 'hr_payroll'
                ? [
                    {
                      id: 'daily_audit',
                      label: 'สแกนต้นฉบับ & ประวัติแก้ไข HR',
                      icon: Edit3,
                      badge: `${overrideHistoryList.length} แก้ไข`,
                    },
                  ]
                : []),
              {
                id: 'company_rules',
                label: 'รายชื่อพนักงาน & กฎบริษัท',
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
                          : tab.id === 'hr_exceptions'
                          ? 'bg-rose-100 text-rose-800'
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
        {/* Print Header */}
        <div className="hidden print:block border-b-2 border-slate-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {reportMode === 'manager'
              ? 'รายงานสรุปสำหรับหัวหน้างานและผู้บริหาร — บริษัท JCW International'
              : 'รายงานตรวจสอบเวลาทำงานและการลาสำหรับ HR / Payroll — บริษัท JCW International'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            ประจำเดือน: {formatYearMonthThai(selectedYearMonth)} | พิมพ์เมื่อ:{' '}
            {new Date().toLocaleString('th-TH')}
          </p>
        </div>

        {/* ===================================================================== */}
        {/* PRIORITY 3: หน้าสรุปผู้บริหาร 1 หน้า (Executive 1-Page Summary) */}
        {/* แสดงเฉพาะ 5 หัวข้อหลักตามที่ผู้ใช้กำหนด */}
        {/* ===================================================================== */}
        {activeTab === 'executive_1page' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    Executive 1-Page Summary
                  </span>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-2">
                    หน้าสรุปผู้บริหาร 1 หน้า — ประจำเดือน{' '}
                    {formatYearMonthThai(selectedYearMonth)}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                    สรุปเฉพาะ 5 ตัวชี้วัดหลักก่อนอนุมัติจ่ายเงินเดือน (ใช้สูตรและการปัดเศษทศนิยม 2 ตำแหน่งตรงกันทุกรายงาน)
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 no-print">
                  <button
                    onClick={() => exportManagerReportToExcel(auditResult)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    ดาวน์โหลดรายงานหัวหน้า (.xlsx)
                  </button>
                  <button
                    onClick={() =>
                      exportHRPayrollReportToExcel(auditResult, hrOverrides)
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    ดาวน์โหลดรายงาน HR/Payroll (.xlsx)
                  </button>
                </div>
              </div>

              {/* 5 Executive KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
                {/* 1. พนักงานทั้งหมด */}
                <div className="rounded-xl p-4 bg-slate-50 border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600 uppercase">
                        1. พนักงานทั้งหมด
                      </span>
                      <Users className="w-5 h-5 text-slate-700" />
                    </div>
                    <div className="mt-3 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-slate-900">
                        {auditResult.activitySummaryReport.length}
                      </span>
                      <span className="text-sm font-semibold text-slate-600">
                        คน
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    วันทำงานที่มีข้อมูลในเดือนนี้{' '}
                    <strong className="text-slate-800">
                      {auditResult.workdaysInMonth.length} วันทำการ
                    </strong>
                  </p>
                </div>

                {/* 2. มาสายกี่คน / กี่ครั้ง / กี่นาที */}
                <div
                  onClick={() => setActiveTab('report2_late')}
                  className="rounded-xl p-4 bg-amber-50/60 border border-amber-200 hover:border-amber-400 transition cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 uppercase">
                        2. มาสาย (คน / ครั้ง / นาที)
                      </span>
                      <Clock className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="mt-3 flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-2xl font-extrabold text-amber-950">
                        {latePeopleList.length} คน
                      </span>
                      <span className="text-sm font-bold text-amber-800">
                        / {auditResult.activityGrandTotal.lateCount} ครั้ง
                      </span>
                      <span className="text-sm font-bold text-rose-600">
                        / {auditResult.activityGrandTotal.lateMinutes} นาที
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-amber-900/80">
                    ไม่มีสาย {auditResult.lateSummaryReport.length - latePeopleList.length}{' '}
                    คน | คลิกเพื่อดูรายชื่อผู้มาสาย
                  </p>
                </div>

                {/* 3. ลาไม่รับค่าจ้างกี่วัน */}
                <div
                  onClick={() => setActiveTab('report3_unpaid')}
                  className="rounded-xl p-4 bg-rose-50/60 border border-rose-200 hover:border-rose-400 transition cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-900 uppercase">
                        3. ลาไม่รับค่าจ้างกี่วัน
                      </span>
                      <AlertTriangle className="w-5 h-5 text-rose-600" />
                    </div>
                    <div className="mt-3 flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-2xl font-extrabold text-rose-700">
                        {formatLeaveHuman(
                          auditResult.activityGrandTotal.unpaidDays,
                          { zeroText: '0 วัน' }
                        )}
                      </span>
                      <span className="text-xs font-bold text-rose-900">
                        ({formatHoursClean(auditResult.activityGrandTotal.unpaidHours)})
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-rose-900/80">
                    จำนวนผู้ลาไม่รับค่าจ้าง {unpaidPeopleList.length} คน (รวมวันลาทุกประเภททั้งเดือน{' '}
                    {formatLeaveHuman(auditResult.activityGrandTotal.totalLeaveDays, {
                      zeroText: '0 วัน',
                    })}
                    )
                  </p>
                </div>

                {/* 4. ผู้ได้รับ / ไม่ได้รับเบี้ยขยัน */}
                <div
                  onClick={() => setActiveTab('report1_diligence')}
                  className="rounded-xl p-4 bg-emerald-50/60 border border-emerald-200 hover:border-emerald-400 transition cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900 uppercase">
                        4. ได้รับ / ไม่ได้รับเบี้ยขยัน
                      </span>
                      <Award className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold text-emerald-700">
                        ได้ {eligibleDiligenceList.length} คน
                      </span>
                      <span className="text-sm font-bold text-slate-600">
                        / ไม่ได้ {ineligibleDiligenceList.length} คน
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-emerald-900/80 truncate">
                    {eligibleDiligenceList.length > 0
                      ? `ได้แก่: ${eligibleDiligenceList.map((e) => e.nickname).join(', ')}`
                      : 'ไม่มีผู้ผ่านเกณฑ์เบี้ยขยันในเดือนนี้'}
                  </p>
                </div>

                {/* 5. รายการที่ต้องให้ HR ตรวจสอบ */}
                <div
                  onClick={() => {
                    setReportMode('hr_payroll');
                    setActiveTab('hr_exceptions');
                  }}
                  className="rounded-xl p-4 bg-indigo-50/70 border border-indigo-200 hover:border-indigo-400 transition cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-900 uppercase">
                        5. รายการที่ HR ต้องตรวจสอบ
                      </span>
                      <ShieldAlert className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="mt-3 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-indigo-700">
                        {auditResult.scanAnomalyRecords.length}
                      </span>
                      <span className="text-sm font-bold text-indigo-900">
                        รายการผิดปกติ
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-indigo-900/80">
                    ไม่สแกนออก {anomalyMissingOutCount} | ไม่สแกนเข้า{' '}
                    {anomalyMissingInCount} | พบลูกค้า {anomalyClientVisitCount}
                  </p>
                </div>
              </div>

              {/* รายละเอียดสรุปในหน้าเดียว (แบ่ง 2 คอลัมน์อ่านง่าย) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* ซ้าย: ผู้ได้รับ / ไม่ได้รับเบี้ยขยัน */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-emerald-50/70 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-emerald-600" />
                      สรุปผู้ได้รับ / ไม่ได้รับเบี้ยขยัน ({auditResult.diligenceReport.length} คน)
                    </h3>
                    <span className="text-xs font-semibold text-emerald-800">
                      ได้รับ {eligibleDiligenceList.length} คน | ไม่ได้รับ{' '}
                      {ineligibleDiligenceList.length} คน
                    </span>
                  </div>
                  <div className="p-4 space-y-3 text-xs sm:text-sm">
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="font-bold text-emerald-950 mb-1">
                        ผู้ได้รับเบี้ยขยัน ({eligibleDiligenceList.length} คน):
                      </div>
                      {eligibleDiligenceList.length === 0 ? (
                        <div className="text-slate-500">ไม่มีผู้ได้รับในเดือนนี้</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {eligibleDiligenceList.map((e, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-emerald-300 text-emerald-900 font-semibold shadow-2xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              {e.fullName} ({e.nickname}) — {e.position} [ลา{' '}
                              {formatLeaveHuman(e.totalLeaveDays, {
                                zeroText: '0 วัน',
                              })}
                              ]
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="font-bold text-slate-800 mb-1.5">
                        ผู้ไม่ได้รับเบี้ยขยัน ({ineligibleDiligenceList.length} คน) และสาเหตุสรุป:
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                        {ineligibleDiligenceList.map((item, i) => (
                          <div
                            key={i}
                            className="px-3 py-2 flex items-start justify-between gap-2 hover:bg-slate-50 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-slate-900">
                                {item.fullName} ({item.nickname})
                              </span>{' '}
                              <span className="text-slate-500">
                                • {item.position}
                              </span>
                            </div>
                            <span className="text-rose-700 text-right font-medium">
                              {item.disqualifyReasons[0] || '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ขวา: สรุปคนมาสาย + ลาไม่รับค่าจ้าง + รายการที่ HR ต้องตรวจสอบ */}
                <div className="space-y-4">
                  {/* มาสาย & ลาไม่รับค่าจ้าง */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-amber-50/70 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-600" />
                        รายชื่อผู้มาสาย ({latePeopleList.length} คน) และผู้ลาไม่รับค่าจ้าง ({unpaidPeopleList.length} คน)
                      </h3>
                    </div>
                    <div className="p-4 space-y-3 text-xs">
                      <div>
                        <div className="font-bold text-amber-950 mb-1">
                          ผู้มาสายรวม {latePeopleList.length} คน ({auditResult.activityGrandTotal.lateCount} ครั้ง / {auditResult.activityGrandTotal.lateMinutes} นาที):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {latePeopleList.map((p, idx) => (
                            <div
                              key={idx}
                              className="px-2.5 py-1.5 rounded bg-amber-50/60 border border-amber-200 flex items-center justify-between"
                            >
                              <span className="font-medium text-slate-900">
                                {p.fullName} ({p.nickname})
                              </span>
                              <span className="font-bold text-rose-700">
                                {p.lateCount} ครั้ง ({p.lateMinutes} นาที)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200">
                        <div className="font-bold text-rose-950 mb-1">
                          ผู้ลาไม่รับค่าจ้างรวม{' '}
                          {formatLeaveHuman(
                            auditResult.activityGrandTotal.unpaidDays,
                            { zeroText: '0 วัน' }
                          )}{' '}
                          ({formatHoursClean(auditResult.activityGrandTotal.unpaidHours)}):
                        </div>
                        {unpaidPeopleList.length === 0 ? (
                          <div className="text-slate-500">
                            ไม่มีการลาไม่รับค่าจ้างในเดือนนี้ (0 วัน)
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {unpaidPeopleList.map((u, idx) => (
                              <div
                                key={idx}
                                className="px-2.5 py-1.5 rounded bg-rose-50/60 border border-rose-200 flex items-center justify-between"
                              >
                                <span className="font-medium text-slate-900">
                                  {u.fullName} ({u.nickname}) — {u.position}
                                </span>
                                <span className="font-bold text-rose-700">
                                  {formatLeaveHuman(u.unpaidDays, {
                                    zeroText: '0 วัน',
                                  })}{' '}
                                  ({formatHoursClean(u.unpaidHours)})
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* รายการที่ต้องให้ HR ตรวจสอบ (32 รายการ) */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-indigo-950 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-indigo-600" />
                        รายการที่ต้องให้ HR ตรวจสอบ: {auditResult.scanAnomalyRecords.length} รายการ
                      </div>
                      <p className="text-xs text-slate-600">
                        • พบสแกนเข้า แต่ไม่พบสแกนออก: <strong>{anomalyMissingOutCount} รายการ</strong> | ไม่พบสแกนเข้า แต่พบสแกนออก: <strong>{anomalyMissingInCount} รายการ</strong> | ฝ่ายขายคาดว่าไปพบลูกค้า: <strong>{anomalyClientVisitCount} รายการ</strong>
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setReportMode('hr_payroll');
                        setActiveTab('hr_exceptions');
                      }}
                      className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 cursor-pointer shadow-xs no-print"
                    >
                      เปิดหน้า HR Exception ({auditResult.scanAnomalyRecords.length})
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* PRIORITY 4 & 5: หน้า HR Exception (เฉพาะรายการผิดปกติ 32 รายการ) */}
        {/* พร้อมระบบแก้ไขแบบกลุ่ม (Bulk Edit) + แสดงผลกระทบก่อนบันทึก (Impact Preview) */}
        {/* ===================================================================== */}
        {activeTab === 'hr_exceptions' && (
          <section className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-rose-50/70 border-b border-rose-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ShieldAlert className="w-5 h-5 text-rose-600" />
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      หน้า HR Exception — แสดงเฉพาะรายการสแกนนิ้วผิดปกติ ({auditResult.scanAnomalyRecords.length} รายการ)
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white">
                      ต้องตรวจสอบก่อนปิดงวดเงินเดือน
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    แสดงเฉพาะรายการที่สแกนนิ้วไม่ครบ หรือฝ่ายขายไม่พบสแกนนิ้ว (ไม่รวมวันที่ลาเต็มวัน 3 รายการที่มีใบลาถูกต้องแล้ว) สามารถติ๊กเลือกหลายรายการเพื่อแก้ไขแบบกลุ่มและดูผลกระทบก่อนบันทึกได้ทันที
                  </p>
                </div>

                {/* ปุ่มกรองย่อยตามประเภทความผิดปกติ */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    {
                      id: 'ALL',
                      label: `ทั้งหมด (${auditResult.scanAnomalyRecords.length})`,
                    },
                    {
                      id: 'MISSING_OUT',
                      label: `มีเข้า-ไม่มีออก (${anomalyMissingOutCount})`,
                    },
                    {
                      id: 'MISSING_IN',
                      label: `ไม่มีเข้า-มีออก (${anomalyMissingInCount})`,
                    },
                    {
                      id: 'CLIENT_VISIT',
                      label: `คาดว่าพบลูกค้า/ไม่สแกน (${anomalyClientVisitCount})`,
                    },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() =>
                        setExceptionSubFilter(
                          f.id as typeof exceptionSubFilter
                        )
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        exceptionSubFilter === f.id
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* แถบเครื่องมือแก้ไขแบบกลุ่ม (Bulk Edit Toolbar) */}
              <div className="p-4 bg-indigo-50/70 border-b border-indigo-200 space-y-3 no-print">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-indigo-950">
                      <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ระบบแก้ไขแบบกลุ่ม (Bulk Edit): เลือกแล้ว{' '}
                      <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                        {selectedKeys.length} รายการ
                      </span>
                    </span>

                    <button
                      onClick={selectAllVisibleExceptions}
                      className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium cursor-pointer"
                    >
                      {filteredExceptionRecords.length > 0 &&
                      filteredExceptionRecords.every((r) =>
                        selectedKeys.includes(r.key)
                      )
                        ? 'ยกเลิกเลือกทั้งหมดในหน้านี้'
                        : `เลือกทั้งหมดในหน้านี้ (${filteredExceptionRecords.length})`}
                    </button>

                    <button
                      onClick={() => {
                        const keys = auditResult.scanAnomalyRecords
                          .filter(
                            (r) =>
                              r.scanStatus === 'พบสแกนเข้า แต่ไม่พบสแกนออก'
                          )
                          .map((r) => r.key);
                        setSelectedKeys(keys);
                        setBulkStatusInput('ครบปกติ');
                        setBulkScanOutInput('17:00:00');
                        setBulkNoteInput(
                          'HR ตรวจสอบแล้ว: อนุโลมเวลาออก 17:00 น. (ลืมสแกนออก)'
                        );
                      }}
                      className="px-2.5 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-semibold cursor-pointer"
                    >
                      เลือกกลุ่ม &quot;มีเข้า-ไม่มีออก&quot; ทั้งหมด ({anomalyMissingOutCount})
                    </button>

                    <button
                      onClick={() => {
                        const keys = auditResult.scanAnomalyRecords
                          .filter(
                            (r) => r.scanStatus === 'คาดว่าไปพบลูกค้า'
                          )
                          .map((r) => r.key);
                        setSelectedKeys(keys);
                        setBulkStatusInput('คาดว่าไปพบลูกค้า');
                        setBulkScanOutInput('');
                        setBulkNoteInput(
                          'HR ยืนยัน: ฝ่ายขายออกพบลูกค้าตามตารางงาน'
                        );
                      }}
                      className="px-2.5 py-1 rounded bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300 text-xs font-semibold cursor-pointer"
                    >
                      เลือกกลุ่ม &quot;คาดว่าไปพบลูกค้า&quot; ทั้งหมด ({anomalyClientVisitCount})
                    </button>

                    {selectedKeys.length > 0 && (
                      <button
                        onClick={() => setSelectedKeys([])}
                        className="px-2 py-1 rounded text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        ล้างการเลือก
                      </button>
                    )}
                  </div>

                  {selectedKeys.length > 0 && (
                    <button
                      onClick={handleClearSelectedOverrides}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      คืนค่าต้นฉบับเฉพาะที่เลือก
                    </button>
                  )}
                </div>

                {/* ฟอร์มกำหนดค่า Bulk Edit */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-end pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      1. ปรับสถานะเป็น:
                    </label>
                    <select
                      value={bulkStatusInput}
                      onChange={(e) => setBulkStatusInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="ครบปกติ">ครบปกติ (เคลียร์ออกจาก HR Exception)</option>
                      <option value="คาดว่าไปพบลูกค้า">คาดว่าไปพบลูกค้า (ฝ่ายขาย)</option>
                      <option value="ลาเต็มวัน/มีข้อมูลการลา">ลาเต็มวัน/มีข้อมูลการลา</option>
                      <option value="พบสแกนเข้า แต่ไม่พบสแกนออก">พบสแกนเข้า แต่ไม่พบสแกนออก</option>
                      <option value="ไม่พบสแกนเข้า แต่พบสแกนออก">ไม่พบสแกนเข้า แต่พบสแกนออก</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      2. เวลาเข้าที่ปรับแก้ (ถ้ามี):
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น 08:00:00 (เว้นว่าง=ค่าเดิม)"
                      value={bulkScanInInput}
                      onChange={(e) => setBulkScanInInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      3. เวลาออกที่ปรับแก้ (ถ้ามี):
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น 17:00:00 (เว้นว่าง=ค่าเดิม)"
                      value={bulkScanOutInput}
                      onChange={(e) => setBulkScanOutInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      4. หมายเหตุ HR สำหรับกลุ่มที่เลือก:
                    </label>
                    <input
                      type="text"
                      placeholder="ระบุหมายเหตุ เช่น อนุโลมลืมสแกนออก / ยืนยันไปพบลูกค้า..."
                      value={bulkNoteInput}
                      onChange={(e) => setBulkNoteInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkWaiveLate}
                        onChange={(e) => setBulkWaiveLate(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span className="font-medium">ยกเว้นสาย (สาย = 0)</span>
                    </label>
                    <button
                      disabled={selectedKeys.length === 0}
                      onClick={() => setIsBulkPreviewOpen(true)}
                      className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold shadow-xs transition ${
                        selectedKeys.length > 0
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <Eye className="w-4 h-4" />
                      ดูผลกระทบก่อนบันทึก ({selectedKeys.length})
                    </button>
                  </div>
                </div>
              </div>

              {/* ตารางรายการผิดปกติ HR Exception */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <th className="py-2.5 px-3 text-center w-10 no-print">
                        <input
                          type="checkbox"
                          checked={
                            filteredExceptionRecords.length > 0 &&
                            filteredExceptionRecords.every((r) =>
                              selectedKeys.includes(r.key)
                            )
                          }
                          onChange={selectAllVisibleExceptions}
                          className="rounded text-indigo-600 cursor-pointer"
                        />
                      </th>
                      <th className="py-2.5 px-2.5 font-semibold">ลำดับ</th>
                      <th className="py-2.5 px-3 font-semibold">วันที่</th>
                      <th className="py-2.5 px-3 font-semibold">
                        ชื่อ-นามสกุล (ชื่อเล่น)
                      </th>
                      <th className="py-2.5 px-2.5 font-semibold">
                        ตำแหน่ง / แผนก
                      </th>
                      <th className="py-2.5 px-2.5 font-semibold text-center">
                        สแกนต้นฉบับ (เข้า - ออก)
                      </th>
                      <th className="py-2.5 px-2.5 font-semibold text-center">
                        เวลาที่ใช้คำนวณ
                      </th>
                      <th className="py-2.5 px-3 font-semibold">
                        สาเหตุความผิดปกติ (HR Exception)
                      </th>
                      <th className="py-2.5 px-3 font-semibold">
                        หมายเหตุชีตเดิม / หมายเหตุ HR
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-center no-print">
                        จัดการรายคน
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredExceptionRecords.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10}
                          className="py-10 text-center text-slate-500"
                        >
                          ไม่พบรายการผิดปกติในตัวกรองที่เลือก
                        </td>
                      </tr>
                    ) : (
                      filteredExceptionRecords.map((r, idx) => {
                        const isChecked = selectedKeys.includes(r.key);
                        return (
                          <tr
                            key={r.key}
                            className={
                              isChecked
                                ? 'bg-indigo-50/80 hover:bg-indigo-100/70'
                                : r.salesStatus === 'คาดว่าไปพบลูกค้า'
                                ? 'bg-sky-50/40 hover:bg-sky-50/70'
                                : 'bg-amber-50/30 hover:bg-amber-50/60'
                            }
                          >
                            <td className="py-2.5 px-3 text-center no-print">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelectRow(r.key)}
                                className="rounded text-indigo-600 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-2.5 text-slate-500 font-medium">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                              {formatDateDisplay(r.date)}{' '}
                              <span className="text-slate-500">
                                ({r.dayOfWeek})
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              {r.fullName}{' '}
                              <span className="text-slate-500 font-normal">
                                ({r.nickname})
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5">
                              <div className="font-medium text-slate-800">
                                {r.position}
                              </div>
                              <div className="text-slate-500 text-[11px]">
                                {r.department}
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5 text-center font-mono text-slate-700">
                              {r.originalScanIn} - {r.originalScanOut}
                            </td>
                            <td className="py-2.5 px-2.5 text-center font-mono font-bold text-slate-900">
                              {r.effectiveScanIn} - {r.effectiveScanOut}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  r.scanStatus === 'คาดว่าไปพบลูกค้า'
                                    ? 'bg-sky-100 text-sky-800 border border-sky-300'
                                    : r.scanStatus ===
                                      'ไม่พบสแกนเข้า แต่พบสแกนออก'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {r.alertMessage || r.scanStatus}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 space-y-0.5">
                              {r.leaveDetails.length > 0 && (
                                <div className="text-indigo-700 font-medium">
                                  ใบลา: {r.leaveDetails.join(', ')}
                                </div>
                              )}
                              {r.sheetNote && (
                                <div className="text-slate-600">
                                  หมายเหตุชีตเดิม: <strong>{r.sheetNote}</strong>
                                </div>
                              )}
                              {r.hrNote && (
                                <div className="text-emerald-700 font-semibold">
                                  HR Override: {r.hrNote}
                                </div>
                              )}
                              {!r.sheetNote &&
                                !r.hrNote &&
                                r.leaveDetails.length === 0 && (
                                  <span className="text-slate-400">-</span>
                                )}
                            </td>
                            <td className="py-2.5 px-3 text-center no-print">
                              <button
                                onClick={() => handleOpenEditDaily(r)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold transition cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                แก้ไขเดี่ยว
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

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
                  เงื่อนไขเบี้ยขยัน: (1) พนักงานทุกแผนก (รวมฝ่ายขาย ยกเว้นตำแหน่งเจ้าหน้าที่ฝ่ายขาย) (2) ทุกวันทำงานต้องสแกนเข้างานไม่เกิน 08:00 น. (3) วันลารวมทุกประเภทในเดือนไม่เกิน 1.00 วัน
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 self-start sm:self-center">
                ได้รับ {eligibleDiligenceList.length} คน / ไม่ได้รับ{' '}
                {ineligibleDiligenceList.length} คน
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-semibold">ลำดับ</th>
                    <th className="py-2.5 px-3 font-semibold">
                      ชื่อ-นามสกุล (ชื่อเล่น)
                    </th>
                    <th className="py-2.5 px-3 font-semibold">ตำแหน่ง</th>
                    <th className="py-2.5 px-3 font-semibold">แผนก/ฝ่าย</th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      วันมาทำงาน
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      สแกนหลัง 08:00
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      วันลารวมในเดือน
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      สถานะเบี้ยขยัน
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      เหตุผล / รายละเอียดการตรวจสอบ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.diligenceReport.map((item, idx) => (
                    <tr
                      key={`${item.fullName}-${idx}`}
                      className={
                        item.isEligible
                          ? 'bg-emerald-50/50 hover:bg-emerald-50'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {item.fullName}{' '}
                        <span className="text-slate-500 font-normal">
                          ({item.nickname})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {item.position}
                      </td>
                      <td className="py-2.5 px-3">{item.department}</td>
                      <td className="py-2.5 px-3 text-center">
                        {item.daysWorked} วัน
                      </td>
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
                              : item.totalLeaveDays > 0
                              ? 'text-slate-800 font-medium'
                              : 'text-slate-400'
                          }
                        >
                          {formatLeaveHuman(item.totalLeaveDays)}
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
                            ผ่านเกณฑ์ครบทั้ง 3 ข้อ (เข้าไม่เกิน 08:00 น. ทุกวัน และลาไม่เกิน 1.00 วัน)
                          </span>
                        ) : reportMode === 'manager' ? (
                          item.disqualifyReasons[0] || '-'
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
                  รายงานที่ 2: สรุปการเข้างานสาย (จำนวนคน จำนวนครั้ง และจำนวนนาที) ประจำเดือน{' '}
                  {formatYearMonthThai(selectedYearMonth)}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  เวลาเข้างานปกติ 08:00 น. (อนุโลม 08:01–08:15 น. ไม่นับว่าสายแต่เสียเบี้ยขยัน) | สแกนตั้งแต่ 08:16 น. นับสาย 1 ครั้ง และคิดนาทีสายจากหลัง 08:15 น. (ฝ่ายขายวันถัดจากพบลูกค้าอนุโลมถึง 09:00 น.)
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 self-start sm:self-center">
                มาสาย {latePeopleList.length} คน / รวม{' '}
                {auditResult.activityGrandTotal.lateCount} ครั้ง (
                {auditResult.activityGrandTotal.lateMinutes} นาที)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-semibold">ลำดับ</th>
                    <th className="py-2.5 px-3 font-semibold">
                      ชื่อ-นามสกุล (ชื่อเล่น)
                    </th>
                    <th className="py-2.5 px-3 font-semibold">ตำแหน่ง</th>
                    <th className="py-2.5 px-3 font-semibold">แผนก/ฝ่าย</th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      จำนวนครั้งที่สาย
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      รวมเวลาสาย (นาที)
                    </th>
                    {reportMode === 'hr_payroll' && (
                      <th className="py-2.5 px-3 font-semibold">
                        รายละเอียดวันที่มาสายและเวลาสแกนเข้า
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.lateSummaryReport.map((item, idx) => (
                    <tr
                      key={`${item.fullName}-${idx}`}
                      className={
                        item.lateCount > 0
                          ? 'bg-amber-50/30 hover:bg-amber-50/60'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {item.fullName}{' '}
                        <span className="text-slate-500 font-normal">
                          ({item.nickname})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {item.position}
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
                      {reportMode === 'hr_payroll' && (
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
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={4} className="py-2.5 px-3 text-right">
                      รวมทั้งบริษัท (Grand Total — ผู้มาสาย {latePeopleList.length} คน):
                    </td>
                    <td className="py-2.5 px-3 text-center text-amber-800">
                      {auditResult.activityGrandTotal.lateCount} ครั้ง
                    </td>
                    <td className="py-2.5 px-3 text-center text-rose-700">
                      {auditResult.activityGrandTotal.lateMinutes} นาที
                    </td>
                    {reportMode === 'hr_payroll' && (
                      <td className="py-2.5 px-3 text-xs font-normal text-slate-600">
                        มีผู้มาสาย {latePeopleList.length} คน จากทั้งหมด{' '}
                        {auditResult.lateSummaryReport.length} คน
                      </td>
                    )}
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
                  รายงานที่ 3: สรุปการลาไม่รับค่าจ้าง และ ลาอื่นๆ (กี่วัน / กี่ชั่วโมง) ประจำเดือน{' '}
                  {formatYearMonthThai(selectedYearMonth)}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  คิดบนฐาน 1 วันทำงาน = 8 ชั่วโมง (ครึ่งวัน = 4 ชม.) และใช้สูตรจัดประเภทเดียวกับทุกรายงาน
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 self-start sm:self-center">
                ลาไม่รับค่าจ้าง{' '}
                {formatLeaveHuman(auditResult.activityGrandTotal.unpaidDays, {
                  zeroText: '0 วัน',
                })}{' '}
                ({formatHoursClean(auditResult.activityGrandTotal.unpaidHours)}) | ลาอื่นๆ{' '}
                {formatLeaveHuman(auditResult.activityGrandTotal.otherDays, {
                  zeroText: '0 วัน',
                })}{' '}
                ({formatHoursClean(auditResult.activityGrandTotal.otherHours)})
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-semibold">ลำดับ</th>
                    <th className="py-2.5 px-3 font-semibold">
                      ชื่อ-นามสกุล (ชื่อเล่น)
                    </th>
                    <th className="py-2.5 px-3 font-semibold">ตำแหน่ง</th>
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
                    {reportMode === 'hr_payroll' && (
                      <th className="py-2.5 px-3 font-semibold">
                        รายละเอียดวันที่ใช้สิทธิและเหตุผล
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.unpaidAndOtherLeaveReport.map((item, idx) => (
                    <tr
                      key={`${item.fullName}-${idx}`}
                      className={
                        item.totalDays > 0
                          ? 'bg-rose-50/30 hover:bg-rose-50/60'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {item.fullName}{' '}
                        <span className="text-slate-500 font-normal">
                          ({item.nickname})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {item.position}
                      </td>
                      <td className="py-2.5 px-3">{item.department}</td>
                      <td className="py-2.5 px-3 text-center">
                        {item.unpaidDays > 0 ? (
                          <span className="font-bold text-rose-700">
                            {formatLeaveHuman(item.unpaidDays)} (
                            {formatHoursClean(item.unpaidHours)})
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {item.otherDays > 0 ? (
                          <span className="font-bold text-purple-700">
                            {formatLeaveHuman(item.otherDays)} (
                            {formatHoursClean(item.otherHours)})
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold">
                        {item.totalDays > 0 ? (
                          <span className="text-slate-900">
                            {formatLeaveHuman(item.totalDays)} (
                            {formatHoursClean(item.totalHours)})
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      {reportMode === 'hr_payroll' && (
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
                                  : {d.type} {formatLeaveHuman(d.days)} (
                                  {formatHoursClean(d.hours)}) —{' '}
                                  <span className="text-slate-600">
                                    {d.reason}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={4} className="py-2.5 px-3 text-right">
                      รวมทั้งสิ้น (Grand Total):
                    </td>
                    <td className="py-2.5 px-3 text-center text-rose-700">
                      {formatLeaveHuman(auditResult.activityGrandTotal.unpaidDays, {
                        zeroText: '0 วัน',
                      })}{' '}
                      ({formatHoursClean(auditResult.activityGrandTotal.unpaidHours)})
                    </td>
                    <td className="py-2.5 px-3 text-center text-purple-700">
                      {formatLeaveHuman(auditResult.activityGrandTotal.otherDays, {
                        zeroText: '0 วัน',
                      })}{' '}
                      ({formatHoursClean(auditResult.activityGrandTotal.otherHours)})
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {formatLeaveHuman(
                        auditResult.activityGrandTotal.unpaidDays +
                          auditResult.activityGrandTotal.otherDays,
                        { zeroText: '0 วัน' }
                      )}{' '}
                      (
                      {formatHoursClean(
                        auditResult.activityGrandTotal.unpaidHours +
                          auditResult.activityGrandTotal.otherHours
                      )}
                      )
                    </td>
                    {reportMode === 'hr_payroll' && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* REPORT 4: ใครใช้สิทธิการลาอะไรบ้างในเดือน + ตรวจสอบวันลาข้ามเดือน/ล่วงหน้า */}
        {/* ===================================================================== */}
        {(activeTab === 'overview' || activeTab === 'report4_monthly_leave') && (
          <section className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                    รายงานที่ 4: รายละเอียดการใช้สิทธิการลาในเดือน และการตรวจสอบวันที่ข้ามเดือน ประจำเดือน{' '}
                    {formatYearMonthThai(selectedYearMonth)}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    แปลงวันที่จากแบบฟอร์มลาออนไลน์ (คอลัมน์ I, J: DD/MM/YYYY) เทียบกับไฟล์สแกนนิ้ว (คอลัมน์ G: YYYY-MM-DD) และหักเฉพาะวันทำงานที่อยู่ในเดือนที่เลือก
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
                      <th className="py-2.5 px-3 font-semibold">
                        ชื่อ-นามสกุล (ชื่อเล่น)
                      </th>
                      <th className="py-2.5 px-3 font-semibold">ตำแหน่ง</th>
                      <th className="py-2.5 px-3 font-semibold">แผนก/ฝ่าย</th>
                      <th className="py-2.5 px-3 font-semibold">
                        ประเภทสิทธิที่ใช้
                      </th>
                      <th className="py-2.5 px-3 font-semibold">
                        วันที่ใช้สิทธิ (ตั้งแต่วันที่ - ถึงวันที่)
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-center">
                        จำนวนวันลา
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-center">
                        คิดเป็นชั่วโมง
                      </th>
                      <th className="py-2.5 px-3 font-semibold">
                        เหตุผลการลา
                      </th>
                      {reportMode === 'hr_payroll' && (
                        <th className="py-2.5 px-3 font-semibold text-center">
                          การตรวจสอบวันที่ / แหล่งข้อมูล
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {auditResult.monthlyLeaveUsageReport.length === 0 ? (
                      <tr>
                        <td
                          colSpan={reportMode === 'hr_payroll' ? 10 : 9}
                          className="py-8 text-center text-slate-500"
                        >
                          ไม่มีรายการใช้สิทธิการลาในเดือนนี้
                        </td>
                      </tr>
                    ) : (
                      auditResult.monthlyLeaveUsageReport.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {item.fullName}{' '}
                            <span className="text-slate-500 font-normal">
                              ({item.nickname})
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {item.position}
                          </td>
                          <td className="py-2.5 px-3">{item.department}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                item.isUnpaid ||
                                item.leaveType === 'ลาไม่รับค่าจ้าง'
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
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium">
                            {item.startDate === item.endDate
                              ? formatDateDisplay(item.startDate, true)
                              : `${formatDateDisplay(item.startDate)} ถึง ${formatDateDisplay(item.endDate)}`}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-indigo-700">
                            {formatLeaveHuman(item.days)}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-700">
                            {formatHoursClean(item.hours)}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-700">
                            {item.reason}
                          </td>
                          {reportMode === 'hr_payroll' && (
                            <td className="py-2.5 px-3 text-center space-y-1">
                              {item.isCrossMonth ? (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-900">
                                  {item.dateValidationNote}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-700">
                                  วันที่ตรงเดือน ({item.source})
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                      <td colSpan={6} className="py-2.5 px-3 text-right">
                        รวมการใช้สิทธิการลาในเดือนนี้ (ตรงกับรายงานที่ 5 ทุกประการ):
                      </td>
                      <td className="py-2.5 px-3 text-center text-indigo-700">
                        {formatLeaveHuman(
                          auditResult.activityGrandTotal.totalLeaveDays,
                          { zeroText: '0 วัน' }
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-800">
                        {formatHoursClean(
                          auditResult.activityGrandTotal.totalLeaveHours
                        )}
                      </td>
                      <td colSpan={reportMode === 'hr_payroll' ? 2 : 1}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* PRIORITY 2: กล่องตรวจสอบใบลาข้ามเดือน หรือ ใบลายื่นล่วงหน้าในเดือนนี้แต่เป็นวันลาของเดือนอื่น */}
            {reportMode === 'hr_payroll' &&
              auditResult.crossMonthOrFutureLeaves.length > 0 && (
                <div className="bg-amber-50/70 rounded-xl border border-amber-200 p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        การตรวจสอบวันที่ข้ามเดือนและใบลาล่วงหน้าต่างเดือน (พบ{' '}
                        {auditResult.crossMonthOrFutureLeaves.length} รายการ)
                      </h3>
                      <p className="text-xs text-amber-900/80 mt-0.5">
                        รายการด้านล่างคือใบลาที่พนักงานยื่นในเดือน{' '}
                        {selectedYearMonth} แต่มีวันลาอยู่ในเดือนถัดไป (เช่น เดือนพฤศจิกายน 2026-11) หรือลาคร่อมหลายเดือน ระบบแยกตัดเฉพาะวันทำงานที่อยู่ในเดือน{' '}
                        {selectedYearMonth} เพื่อไม่ให้หักวันลาผิดเดือน
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto bg-white rounded-lg border border-amber-200">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-amber-100/60 text-amber-950 border-b border-amber-200">
                          <th className="py-2 px-3 font-semibold">ชื่อพนักงาน</th>
                          <th className="py-2 px-3 font-semibold">ประเภทการลา</th>
                          <th className="py-2 px-3 font-semibold">
                            ช่วงวันที่ลา (ตั้งแต่วันที่ - ถึงวันที่)
                          </th>
                          <th className="py-2 px-3 font-semibold text-center">
                            วันลาทั้งหมดในใบลา
                          </th>
                          <th className="py-2 px-3 font-semibold text-center">
                            หักในเดือน {selectedYearMonth}
                          </th>
                          <th className="py-2 px-3 font-semibold">
                            ผลการตรวจสอบวันที่ข้ามเดือน / ล่วงหน้า
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {auditResult.crossMonthOrFutureLeaves.map((c) => (
                          <tr key={c.id}>
                            <td className="py-2 px-3 font-semibold text-slate-900">
                              {c.fullName} ({c.nickname}) — {c.position}
                            </td>
                            <td className="py-2 px-3">{c.leaveType}</td>
                            <td className="py-2 px-3 font-mono">
                              {formatDateDisplay(c.startDate)} ถึง{' '}
                              {formatDateDisplay(c.endDate)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {formatLeaveHuman(c.totalRequestedDays ?? c.days)} (
                              {formatHoursClean(c.totalRequestedHours ?? c.hours)})
                            </td>
                            <td className="py-2 px-3 text-center font-bold text-indigo-700">
                              {formatLeaveHuman(c.days, { zeroText: '0 วัน' })} (
                              {formatHoursClean(c.hours)})
                            </td>
                            <td className="py-2 px-3 text-amber-900 font-medium">
                              {c.dateValidationNote} — เหตุผล: {c.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
          </section>
        )}

        {/* ===================================================================== */}
        {/* REPORT 5: สรุปกิจกรรมการลาพนักงาน (ป่วย/กิจ/พักร้อน/ไม่รับค่าจ้าง/อื่นๆ/สาย) */}
        {/* ===================================================================== */}
        {(activeTab === 'overview' || activeTab === 'report5_activity') && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                รายงานที่ 5: สรุปกิจกรรมการลาทุกประเภทและสถิติการมาสาย ประจำเดือน{' '}
                {formatYearMonthThai(selectedYearMonth)}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                แสดงยอดสรุปรายบุคคลแยกตามประเภท (ลาป่วย, ลากิจ, ลาพักร้อน, ลาไม่รับค่าจ้าง, ลาอื่นๆ, มาสาย) คิดบนฐาน 1 วัน = 8 ชม. (ครึ่งวัน = 4 ชม.)
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-2.5 font-semibold">ลำดับ</th>
                    <th className="py-2.5 px-3 font-semibold">
                      ชื่อ-นามสกุล (ชื่อเล่น)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold">ตำแหน่ง</th>
                    <th className="py-2.5 px-2.5 font-semibold">แผนก</th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-blue-50/60">
                      ลาป่วย
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-amber-50/60">
                      ลากิจ
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-emerald-50/60">
                      ลาพักร้อน
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-rose-50/60">
                      ลาไม่รับค่าจ้าง
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-purple-50/60">
                      ลาอื่นๆ
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold text-center bg-indigo-50/60">
                      รวมวันลา
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
                    <tr
                      key={`${item.fullName}-${idx}`}
                      className="hover:bg-slate-50"
                    >
                      <td className="py-2.5 px-2.5 text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {item.fullName}{' '}
                        <span className="text-slate-500 font-normal">
                          ({item.nickname})
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-xs text-slate-700">
                        {item.position}
                      </td>
                      <td className="py-2.5 px-2.5 text-xs">
                        {item.department}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.sickDays > 0 ? (
                          <span className="font-semibold text-blue-700">
                            {formatLeaveHuman(item.sickDays)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.personalDays > 0 ? (
                          <span className="font-semibold text-amber-700">
                            {formatLeaveHuman(item.personalDays)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.vacationDays > 0 ? (
                          <span className="font-semibold text-emerald-700">
                            {formatLeaveHuman(item.vacationDays)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.unpaidDays > 0 ? (
                          <span className="font-semibold text-rose-700">
                            {formatLeaveHuman(item.unpaidDays)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.otherDays > 0 ? (
                          <span className="font-semibold text-purple-700">
                            {formatLeaveHuman(item.otherDays)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-bold bg-indigo-50/30">
                        <span
                          className={
                            item.totalLeaveDays > 0
                              ? 'text-indigo-900'
                              : 'text-slate-400'
                          }
                        >
                          {formatLeaveHuman(item.totalLeaveDays)}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-semibold">
                        <span
                          className={
                            item.lateCount > 0
                              ? 'text-amber-700'
                              : 'text-slate-400'
                          }
                        >
                          {item.lateCount > 0 ? `${item.lateCount} ครั้ง` : '-'}
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
                          {item.lateMinutes > 0 ? `${item.lateMinutes} นาที` : '-'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {item.diligenceEligible ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            ได้รับ
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">ไม่ได้รับ</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-indigo-950 text-white font-bold">
                    <td colSpan={4} className="py-3 px-3 text-right">
                      รวมทั้งบริษัท (Grand Total):
                    </td>
                    <td className="py-3 px-2.5 text-center text-sky-200">
                      {formatLeaveHuman(auditResult.activityGrandTotal.sickDays, {
                        zeroText: '0 วัน',
                      })}
                    </td>
                    <td className="py-3 px-2.5 text-center text-amber-200">
                      {formatLeaveHuman(
                        auditResult.activityGrandTotal.personalDays,
                        { zeroText: '0 วัน' }
                      )}
                    </td>
                    <td className="py-3 px-2.5 text-center text-emerald-200">
                      {formatLeaveHuman(
                        auditResult.activityGrandTotal.vacationDays,
                        { zeroText: '0 วัน' }
                      )}
                    </td>
                    <td className="py-3 px-2.5 text-center text-rose-200">
                      {formatLeaveHuman(
                        auditResult.activityGrandTotal.unpaidDays,
                        { zeroText: '0 วัน' }
                      )}
                    </td>
                    <td className="py-3 px-2.5 text-center text-purple-200">
                      {formatLeaveHuman(auditResult.activityGrandTotal.otherDays, {
                        zeroText: '0 วัน',
                      })}
                    </td>
                    <td className="py-3 px-2.5 text-center bg-indigo-900 text-white">
                      {formatLeaveHuman(
                        auditResult.activityGrandTotal.totalLeaveDays,
                        { zeroText: '0 วัน' }
                      )}
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
                รายงานที่ 6: สรุปสิทธิวันลาคงเหลือรายบุคคล (คิดบนฐาน 1 วัน = 8 ชม.)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                แสดงโควตาวันลาที่ได้ทั้งหมด วันลาที่ใช้ไปสะสม และวันลาคงเหลือของพนักงานแต่ละคนในรูปแบบวันและชั่วโมงที่อ่านง่าย
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-2.5 font-semibold" rowSpan={2}>
                      ลำดับ
                    </th>
                    <th className="py-2.5 px-3 font-semibold" rowSpan={2}>
                      ชื่อ-นามสกุล (ชื่อเล่น)
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold" rowSpan={2}>
                      ตำแหน่ง
                    </th>
                    <th className="py-2.5 px-2.5 font-semibold" rowSpan={2}>
                      แผนก
                    </th>
                    <th
                      className="py-1.5 px-2 font-semibold text-center bg-blue-50 border-b border-blue-200"
                      colSpan={3}
                    >
                      ลาป่วย
                    </th>
                    <th
                      className="py-1.5 px-2 font-semibold text-center bg-amber-50 border-b border-amber-200"
                      colSpan={3}
                    >
                      ลากิจ
                    </th>
                    <th
                      className="py-1.5 px-2 font-semibold text-center bg-emerald-50 border-b border-emerald-200"
                      colSpan={3}
                    >
                      ลาพักร้อน
                    </th>
                    <th
                      className="py-1.5 px-2 font-semibold text-center bg-purple-50 border-b border-purple-200"
                      colSpan={2}
                    >
                      ลาอื่นๆ
                    </th>
                  </tr>
                  <tr className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
                    <th className="py-1.5 px-2 text-center bg-blue-50/50">
                      สิทธิ์
                    </th>
                    <th className="py-1.5 px-2 text-center bg-blue-50/50">
                      ใช้สะสม
                    </th>
                    <th className="py-1.5 px-2 text-center font-bold text-blue-900 bg-blue-100/60">
                      คงเหลือ
                    </th>
                    <th className="py-1.5 px-2 text-center bg-amber-50/50">
                      สิทธิ์
                    </th>
                    <th className="py-1.5 px-2 text-center bg-amber-50/50">
                      ใช้สะสม
                    </th>
                    <th className="py-1.5 px-2 text-center font-bold text-amber-900 bg-amber-100/60">
                      คงเหลือ
                    </th>
                    <th className="py-1.5 px-2 text-center bg-emerald-50/50">
                      สิทธิ์
                    </th>
                    <th className="py-1.5 px-2 text-center bg-emerald-50/50">
                      ใช้สะสม
                    </th>
                    <th className="py-1.5 px-2 text-center font-bold text-emerald-900 bg-emerald-100/60">
                      คงเหลือ
                    </th>
                    <th className="py-1.5 px-2 text-center bg-purple-50/50">
                      สิทธิ์
                    </th>
                    <th className="py-1.5 px-2 text-center font-bold text-purple-900 bg-purple-100/60">
                      คงเหลือ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.quotaReport.map((q, idx) => (
                    <tr
                      key={`${q.fullName}-${idx}`}
                      className="hover:bg-slate-50"
                    >
                      <td className="py-2.5 px-2.5 text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {q.fullName}{' '}
                        <span className="text-slate-500 font-normal">
                          ({q.nickname})
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-xs text-slate-700">
                        {q.position}
                      </td>
                      <td className="py-2.5 px-2.5 text-xs">{q.department}</td>
                      {/* ลาป่วย */}
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {formatLeaveHuman(q.sickQuota)}
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {formatLeaveHuman(q.sickUsedTotal)}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-blue-800 bg-blue-50/40">
                        {formatLeaveHuman(q.sickRemaining, { zeroText: '0 วัน' })}
                      </td>
                      {/* ลากิจ */}
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {formatLeaveHuman(q.personalQuota)}
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {formatLeaveHuman(q.personalUsedTotal)}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-amber-800 bg-amber-50/40">
                        {formatLeaveHuman(q.personalRemaining, {
                          zeroText: '0 วัน',
                        })}
                      </td>
                      {/* ลาพักร้อน */}
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {formatLeaveHuman(q.vacationQuota)}
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {formatLeaveHuman(q.vacationUsedTotal)}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-emerald-800 bg-emerald-50/40">
                        {formatLeaveHuman(q.vacationRemaining, {
                          zeroText: '0 วัน',
                        })}
                      </td>
                      {/* ลาอื่นๆ */}
                      <td className="py-2.5 px-2 text-center text-slate-600">
                        {formatLeaveHuman(q.otherQuota)}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-purple-800 bg-purple-50/40">
                        {formatLeaveHuman(q.otherRemaining)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ===================================================================== */}
        {/* TAB: สแกนต้นฉบับ & หมายเหตุ & ประวัติการแก้ไข (สำหรับ HR/Payroll) */}
        {/* ===================================================================== */}
        {activeTab === 'daily_audit' && (
          <div className="space-y-6">
            {/* ส่วนที่ 1: ประวัติการแก้ไขข้อมูลของ HR (Audit Log / Edit History) */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-indigo-50/70 border-b border-indigo-200 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-600" />
                    ประวัติการแก้ไขข้อมูลและหมายเหตุโดย HR (Audit Log) —{' '}
                    {overrideHistoryList.length} รายการ
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    บันทึกทุกการแก้ไขเปรียบเทียบกับข้อมูลสแกนนิ้วต้นฉบับ เพื่อความโปร่งใสในการตรวจสอบเงินเดือน (Payroll Audit)
                  </p>
                </div>
                {overrideHistoryList.length > 0 && (
                  <button
                    onClick={async () => {
                      setHrOverrides({});
                      await triggerSaveState(
                        employeeMappings,
                        quotaRecords,
                        leaveRecords,
                        {},
                        settings
                      );
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer no-print"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    ล้างประวัติการแก้ไขทั้งหมดกลับเป็นค่าต้นฉบับ
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <th className="py-2 px-3 font-semibold">ลำดับ</th>
                      <th className="py-2 px-3 font-semibold">วันที่รายการ</th>
                      <th className="py-2 px-3 font-semibold">ชื่อพนักงาน</th>
                      <th className="py-2 px-3 font-semibold">
                        ค่าก่อนแก้ไข (สแกนนิ้วต้นฉบับ)
                      </th>
                      <th className="py-2 px-3 font-semibold">
                        ค่าที่ปรับแก้ (เวลา / สถานะ / สาย)
                      </th>
                      <th className="py-2 px-3 font-semibold">หมายเหตุ HR</th>
                      <th className="py-2 px-3 font-semibold">
                        วันเวลาที่บันทึก
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {overrideHistoryList.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-6 text-center text-slate-500"
                        >
                          ยังไม่มีการแก้ไขข้อมูลโดย HR (แสดงผลตามข้อมูลสแกนนิ้วต้นฉบับ 100%)
                        </td>
                      </tr>
                    ) : (
                      overrideHistoryList.map((ov, idx) => (
                        <tr key={ov.key} className="hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 font-mono font-medium">
                            {formatDateDisplay(ov.date)}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {ov.employeeName || '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {ov.previousSummary || 'ตามข้อมูลสแกนนิ้วต้นฉบับ'}
                          </td>
                          <td className="py-2 px-3 font-medium text-indigo-800">
                            {ov.overrideStatus
                              ? `สถานะ: ${ov.overrideStatus}`
                              : ''}{' '}
                            {ov.overrideScanIn
                              ? `| เข้า: ${ov.overrideScanIn}`
                              : ''}{' '}
                            {ov.overrideScanOut
                              ? `| ออก: ${ov.overrideScanOut}`
                              : ''}{' '}
                            {ov.overrideLateCount !== undefined &&
                            ov.overrideLateCount !== null
                              ? `| สาย: ${ov.overrideLateCount} ครั้ง (${ov.overrideLateMinutes ?? 0} นาที)`
                              : ''}
                          </td>
                          <td className="py-2 px-3 text-emerald-800 font-semibold">
                            {ov.hrNote || '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-500">
                            {ov.updatedAt}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ส่วนที่ 2: ตารางสแกนนิ้วต้นฉบับรายวันทั้งหมด */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Edit3 className="w-5 h-5 text-indigo-600" />
                    ตารางตรวจสอบการสแกนนิ้วรายวันทั้งหมด (สแกนต้นฉบับ เวลาที่ใช้คำนวณ และหมายเหตุ)
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
                      placeholder="ค้นหาชื่อ, ตำแหน่ง, วันที่, หมายเหตุ..."
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
                    <option value="ALL">
                      ทุกสถานะ ({auditResult.dailyRecords.length})
                    </option>
                    <option value="ANOMALY">
                      เฉพาะรายการผิดปกติ HR Exception (
                      {auditResult.scanAnomalyRecords.length})
                    </option>
                    <option value="LATE">เฉพาะวันที่มาสาย</option>
                    <option value="SALES_VISIT">
                      เฉพาะฝ่ายขาย: คาดว่าไปพบลูกค้า & วันถัดไป (09:00)
                    </option>
                    <option value="OVERRIDDEN">
                      เฉพาะรายการที่ HR แก้ไข/ใส่หมายเหตุ
                    </option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <th className="py-2.5 px-3 font-semibold">วันที่</th>
                      <th className="py-2.5 px-3 font-semibold">
                        ชื่อ-นามสกุล (ชื่อเล่น)
                      </th>
                      <th className="py-2.5 px-2.5 font-semibold">
                        ตำแหน่ง / แผนก
                      </th>
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
                        ข้อมูลการลา (2 ตำแหน่ง) / หมายเหตุ HR
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
                          <span className="text-slate-500">
                            ({r.dayOfWeek})
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {r.fullName}{' '}
                          <span className="text-slate-500">({r.nickname})</span>
                        </td>
                        <td className="py-2.5 px-2.5">
                          <div className="font-medium text-slate-800">
                            {r.position}
                          </div>
                          <div className="text-slate-500 text-[11px]">
                            {r.department}
                          </div>
                        </td>
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
          </div>
        )}

        {/* ===================================================================== */}
        {/* TAB: รายชื่อพนักงาน & กฎการมาทำงานบริษัท */}
        {/* ===================================================================== */}
        {activeTab === 'company_rules' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  รายชื่อพนักงาน ตำแหน่ง และสิทธิ์การพิจารณาเบี้ยขยัน
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  พนักงานทุกแผนก (รวมฝ่ายขาย) มีสิทธิได้รับเบี้ยขยัน ยกเว้นตำแหน่ง &quot;เจ้าหน้าที่ฝ่ายขาย&quot;
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <th className="py-2.5 px-3">ลำดับ</th>
                      <th className="py-2.5 px-3">ชื่อ-นามสกุล (ชื่อเล่น)</th>
                      <th className="py-2.5 px-3">ตำแหน่ง</th>
                      <th className="py-2.5 px-3">แผนก/ฝ่าย</th>
                      <th className="py-2.5 px-3 text-center">
                        สิทธิ์เบี้ยขยันตามตำแหน่ง
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {employeeMappings.map((m, idx) => {
                      const isExcludedPos =
                        (m.position || '').includes('เจ้าหน้าที่ฝ่ายขาย') ||
                        (m.position || '').includes('เจ้าหน้าที่ขาย');
                      return (
                        <tr
                          key={`${m.fullName}-${idx}`}
                          className="hover:bg-slate-50"
                        >
                          <td className="py-2.5 px-3 text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {m.fullName}{' '}
                            <span className="text-slate-500 font-normal">
                              ({m.nickname})
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {m.position || '-'}
                          </td>
                          <td className="py-2.5 px-3">{m.department}</td>
                          <td className="py-2.5 px-3 text-center">
                            {isExcludedPos ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                ยกเว้น (เจ้าหน้าที่ฝ่ายขาย)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                มีสิทธิ์รับเบี้ยขยัน
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

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
                    <li>
                      ข้อ 1: พนักงานทุกแผนก (รวมฝ่ายขาย) มีสิทธิได้รับเบี้ยขยัน <strong>ยกเว้นตำแหน่ง &quot;เจ้าหน้าที่ฝ่ายขาย&quot;</strong>
                    </li>
                    <li>
                      ข้อ 2: ทุกวันทำงานที่มีการมาทำงาน ต้องมีเวลาสแกนเข้า <strong>&le; 08:00 น.</strong>
                    </li>
                    <li>
                      ข้อ 3: วันลารวมทุกประเภทในเดือนนั้น <strong>&le; 1.00 วัน</strong> (เช่น ลา 0.50 + 0.50 = 1.00 วัน ยังได้เบี้ยขยัน)
                    </li>
                  </ul>
                </div>

                <div className="p-3 rounded-lg bg-sky-50/60 border border-sky-200">
                  <h3 className="font-bold text-sky-950">
                    3. กฎพิเศษสำหรับการออกไปพบลูกค้าของฝ่ายขาย
                  </h3>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-xs text-sky-900">
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
                    4. มาตรฐานการปัดเศษและการตรวจสอบวันที่ข้ามเดือน
                  </h3>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-xs text-amber-900">
                    <li>
                      อัตราแปลงชั่วโมงลา: <strong>8 ชั่วโมง = 1.00 วันทำงาน</strong> (แสดงผลทศนิยม 2 ตำแหน่ง และปัดเศษแบบเดียวกันทุกรายงาน)
                    </li>
                    <li>
                      ระบบแยกตรวจจับวันที่จากไฟล์สแกนนิ้ว (YYYY-MM-DD) และไฟล์ฟอร์มลาออนไลน์ (DD/MM/YYYY) พร้อมแยกสัดส่วนวันลาข้ามเดือนและใบลาล่วงหน้าอัตโนมัติ
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* MODAL 0: แสดงผลกระทบก่อนบันทึกการแก้ไขแบบกลุ่ม (Bulk Edit Impact Preview) */}
      {/* ===================================================================== */}
      {isBulkPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                  Impact Simulation Preview
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                  ตรวจสอบผลกระทบต่อรายงานเงินเดือนก่อนบันทึกจริง (เลือกแก้ไข{' '}
                  {selectedKeys.length} รายการ)
                </h3>
              </div>
              <button
                onClick={() => setIsBulkPreviewOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* สรุปเปรียบเทียบ ก่อนแก้ -> หลังแก้ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm">
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
                <div className="font-semibold text-rose-900">
                  1. รายการผิดปกติ (HR Exception)
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-slate-500 line-through">
                    {auditResult.scanAnomalyRecords.length} รายการ
                  </span>
                  <span className="text-lg font-extrabold text-emerald-700">
                    → เหลือ {previewAuditResult.scanAnomalyRecords.length} รายการ
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 mt-1">
                  ลดลง{' '}
                  {auditResult.scanAnomalyRecords.length -
                    previewAuditResult.scanAnomalyRecords.length}{' '}
                  รายการ
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                <div className="font-semibold text-amber-900">
                  2. สถิติการมาสายรวมทั้งบริษัท
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-slate-500">
                    {auditResult.activityGrandTotal.lateCount} ครั้ง (
                    {auditResult.activityGrandTotal.lateMinutes} นาที)
                  </span>
                  <span className="text-base font-extrabold text-amber-900">
                    → {previewAuditResult.activityGrandTotal.lateCount} ครั้ง (
                    {previewAuditResult.activityGrandTotal.lateMinutes} นาที)
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="font-semibold text-emerald-900">
                  3. ผู้ได้รับเบี้ยขยันประจำเดือน
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-slate-500">
                    เดิม { auditResult.activityGrandTotal.diligenceEligibleCount } คน
                  </span>
                  <span className="text-lg font-extrabold text-emerald-700">
                    → ใหม่{' '}
                    {previewAuditResult.activityGrandTotal.diligenceEligibleCount}{' '}
                    คน
                  </span>
                </div>
                <div className="text-[11px] text-emerald-800 mt-1 truncate">
                  ได้แก่:{' '}
                  {previewAuditResult.diligenceReport
                    .filter((d) => d.isEligible)
                    .map((d) => d.nickname)
                    .join(', ') || '-'}
                </div>
              </div>
            </div>

            {/* ตารางเปรียบเทียบรายการที่กำลังจะถูกบันทึก */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 font-semibold">วันที่</th>
                    <th className="py-2 px-3 font-semibold">พนักงาน</th>
                    <th className="py-2 px-3 font-semibold">
                      ก่อนแก้ไข (เวลา / สถานะเดิม)
                    </th>
                    <th className="py-2 px-3 font-semibold">
                      หลังแก้ไข (เวลา / สถานะใหม่)
                    </th>
                    <th className="py-2 px-3 font-semibold">หมายเหตุ HR ที่จะบันทึก</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {selectedKeys.map((k) => {
                    const beforeRec = dailyRecordByKey.get(k);
                    const afterRec = previewAuditResult.dailyRecords.find(
                      (r) => r.key === k
                    );
                    if (!beforeRec || !afterRec) return null;
                    return (
                      <tr key={k} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono">
                          {formatDateDisplay(beforeRec.date)}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {beforeRec.fullName} ({beforeRec.nickname})
                        </td>
                        <td className="py-2 px-3 text-rose-700">
                          {beforeRec.effectiveScanIn} -{' '}
                          {beforeRec.effectiveScanOut} ({beforeRec.scanStatus})
                        </td>
                        <td className="py-2 px-3 font-semibold text-emerald-700">
                          {afterRec.effectiveScanIn} -{' '}
                          {afterRec.effectiveScanOut} ({afterRec.scanStatus})
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {afterRec.hrNote}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setIsBulkPreviewOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก / กลับไปแก้ไข
              </button>
              <button
                onClick={handleConfirmBulkSave}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer"
              >
                ยืนยันและบันทึกการแก้ไขทั้ง {selectedKeys.length} รายการ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: แก้ไข / ใส่หมายเหตุรายวันสำหรับ HR (Override เดี่ยว) */}
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
                อัปโหลดไฟล์ &quot;บันทึกเข้างาน.xlsx&quot; หรือ &quot;แบบฟอร์มลาออนไลน์.xlsx&quot;
              </h3>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p>
                ระบบรองรับการอัปโหลดไฟล์ Excel (<code>.xlsx</code>,{' '}
                <code>.xls</code>) และ <code>.csv</code> โดยจะตรวจสอบโครงสร้างคอลัมน์ให้อัตโนมัติ:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                <li>
                  <strong>ไฟล์บันทึกเข้างาน:</strong> อ่านคอลัมน์ G (วันที่เรียง{' '}
                  <code>YYYY-MM-DD</code>) จากทุกชีตในไฟล์
                </li>
                <li>
                  <strong>ไฟล์แบบฟอร์มลาออนไลน์:</strong> อ่านคอลัมน์ I, J (วันที่เรียง{' '}
                  <code>DD/MM/YYYY</code>) และชีต &quot;สิทธิคงเหลือ&quot; พร้อมแยกสัดส่วนวันลาข้ามเดือนอัตโนมัติ
                </li>
              </ul>
            </div>

            <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-300 rounded-xl p-6 bg-indigo-50/40 hover:bg-indigo-50 transition cursor-pointer">
              <Upload className="w-8 h-8 text-indigo-600 mb-2" />
              <span className="text-sm font-semibold text-indigo-900">
                คลิกเพื่อเลือกไฟล์ Excel หรือ CSV (เลือกได้หลายไฟล์พร้อมกัน)
              </span>
              <input
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {uploadStatusMsg && (
              <pre className="p-3 rounded-lg bg-slate-900 text-emerald-300 text-xs whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                {uploadStatusMsg}
              </pre>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs sm:text-sm font-medium cursor-pointer"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: บันทึกใบลาออนไลน์ใหม่ในแอป */}
      {/* ===================================================================== */}
      {isAddLeaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleAddManualLeave}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                บันทึกข้อมูลการลาพนักงานเพิ่ม
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
                      {m.fullName} ({m.nickname}) — {m.position}
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
                    จำนวนชั่วโมงที่ลา (8 ชม. = 1.00 วัน)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    required
                    value={newLeaveHours}
                    onChange={(e) => setNewLeaveHours(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    ลาตั้งแต่วันที่
                  </label>
                  <input
                    type="date"
                    required
                    value={newLeaveStartDate}
                    onChange={(e) => {
                      setNewLeaveStartDate(e.target.value);
                      setNewLeaveEndDate(e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    ถึงวันที่
                  </label>
                  <input
                    type="date"
                    required
                    value={newLeaveEndDate}
                    onChange={(e) => setNewLeaveEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newLeaveIsUnpaid}
                    onChange={(e) => setNewLeaveIsUnpaid(e.target.checked)}
                    className="rounded text-rose-600"
                  />
                  <span className="font-medium text-rose-700">
                    ระบุเป็นการลาไม่รับค่าจ้าง (Leave Without Pay)
                  </span>
                </label>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  เหตุผลการลา / หมายเหตุ
                </label>
                <input
                  type="text"
                  placeholder="เช่น พบแพทย์ตามนัด, ธุระส่วนตัว..."
                  value={newLeaveReason}
                  onChange={(e) => setNewLeaveReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddLeaveModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs sm:text-sm font-medium cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold cursor-pointer"
              >
                บันทึกใบลา
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: ตั้งค่าเชื่อมต่อ Firebase Firestore (โปรเจกต์ timeattendenceJCW) */}
      {/* ===================================================================== */}
      {isFirebaseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                ฐานข้อมูล Firebase Firestore — โปรเจกต์ timeattendenceJCW
              </h3>
              <button
                onClick={() => setIsFirebaseModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              สถานะปัจจุบัน: <strong>{syncStatus}</strong>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Project ID
                </label>
                <input
                  type="text"
                  value={firebaseConfigInput.projectId}
                  onChange={(e) =>
                    setFirebaseConfigInput({
                      ...firebaseConfigInput,
                      projectId: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  API Key
                </label>
                <input
                  type="text"
                  value={firebaseConfigInput.apiKey}
                  onChange={(e) =>
                    setFirebaseConfigInput({
                      ...firebaseConfigInput,
                      apiKey: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsFirebaseModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
              <button
                onClick={async () => {
                  saveFirebaseConfigToLocal(firebaseConfigInput);
                  await triggerSaveState();
                  setIsFirebaseModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                บันทึกและซิงก์ขึ้น Firebase ทันที
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
