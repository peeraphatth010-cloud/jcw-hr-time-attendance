import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Clock,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Lock,
  MessageSquarePlus,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  Upload,
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
  PayrollCycleStatus,
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
  formatHoursClean,
  formatLeaveHuman,
  formatYearMonthThai,
  inspectLeaveDateRange,
  round2,
} from './utils/dateAndTime';
import {
  exportDetailedCSV,
  exportHRPayrollReportToExcel,
  exportManagerReportToExcel,
} from './utils/excelExporter';
import {
  FirebaseConfigData,
  getSavedFirebaseConfig,
  loadHRState,
  saveFirebaseConfigToLocal,
  saveHRState,
} from './services/firebaseService';
import { AttendanceTimeView } from './components/AttendanceTimeView';
import { LeaveAndQuotaView } from './components/LeaveAndQuotaView';
import {
  DEFAULT_COMPANY_PROFILE,
  EmployeesAndSettingsView,
} from './components/SettingsAndExtraViews';

type MainSection =
  | 'overview_payroll'
  | 'review_items'
  | 'attendance_time'
  | 'leave_and_quota'
  | 'employees_settings'
  | 'extra_all_in_one';

type ReviewFilterType =
  | 'ALL'
  | 'MISSING_OUT'
  | 'MISSING_IN'
  | 'CLIENT_VISIT'
  | 'LATE'
  | 'HR_EDITED'
  | 'UNREVIEWED';

type ReportAudienceMode = 'manager' | 'hr_payroll';

const DEFAULT_SETTINGS: AuditSettings = {
  onlyApprovedLeaves: true,
  excludeCarryoverLeaves: true,
  includeSheetLeaves: true,
  customHolidays: [],
  companyProfile: DEFAULT_COMPANY_PROFILE,
  closedMonths: {},
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
  const [activeSection, setActiveSection] =
    useState<MainSection>('overview_payroll');
  const [reportMode, setReportMode] =
    useState<ReportAudienceMode>('hr_payroll');

  // Dropdown ส่งออกรายงาน
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);

  // ตัวกรองในหน้า "รายการต้องตรวจสอบ" (Menu 2)
  const [reviewFilter, setReviewFilter] = useState<ReviewFilterType>('ALL');
  const [dailyFilterEmp, setDailyFilterEmp] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // ระบบแก้ไขแบบกลุ่ม (Bulk Edit) + แสดงผลกระทบก่อนบันทึก (Impact Preview)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkStatusInput, setBulkStatusInput] = useState<string>('ครบปกติ');
  const [bulkScanInInput, setBulkScanInInput] = useState<string>('');
  const [bulkScanOutInput, setBulkScanOutInput] = useState<string>('');
  const [bulkWaiveLate, setBulkWaiveLate] = useState<boolean>(false);
  const [bulkNoteInput, setBulkNoteInput] = useState<string>('');
  const [isBulkPreviewOpen, setIsBulkPreviewOpen] = useState<boolean>(false);

  // Modal สำหรับแก้ไข / ใส่หมายเหตุรายวันเดี่ยว (HR Override พร้อมแสดงผลกระทบต่อเบี้ยขยัน/เงินเดือนก่อนบันทึก)
  const [editingDailyRecord, setEditingDailyRecord] =
    useState<DailyAuditRecord | null>(null);
  const [editingMode, setEditingMode] = useState<'full' | 'note_only'>('full');
  const [overrideScanInInput, setOverrideScanInInput] = useState<string>('');
  const [overrideScanOutInput, setOverrideScanOutInput] = useState<string>('');
  const [overrideStatusInput, setOverrideStatusInput] = useState<string>('');
  const [overrideLateCountInput, setOverrideLateCountInput] =
    useState<string>('');
  const [overrideLateMinutesInput, setOverrideLateMinutesInput] =
    useState<string>('');
  const [overrideNoteInput, setOverrideNoteInput] = useState<string>('');
  const [overrideReviewerInput, setOverrideReviewerInput] =
    useState<string>('HR');

  // Modal นำเข้าไฟล์ Excel/CSV
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string>('');

  // Modal ตั้งค่าฐานข้อมูลสำรอง
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
  const [lastSyncTimeText, setLastSyncTimeText] = useState<string>(
    () =>
      `ซิงก์ล่าสุดเมื่อ ${new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      })} น.`
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

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

  // โหลดข้อมูลจากคลาวด์ / LocalStorage ตอนเปิดแอป
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
      const nextSettings: AuditSettings = {
        ...DEFAULT_SETTINGS,
        ...(state?.settings || {}),
      };

      setEmployeeMappings(nextMappings);
      setQuotaRecords(nextQuotas);
      setLeaveRecords(nextLeaves);
      setHrOverrides(nextOverrides);
      setSettings(nextSettings);

      const timeStr = new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      });
      if (
        source === 'firebase' &&
        hasValidMappings &&
        hasValidQuotas &&
        hasValidLeaves
      ) {
        setLastSyncTimeText(`ซิงก์ล่าสุดเมื่อ ${timeStr} น.`);
      } else {
        await saveHRState({
          employeeMappings: nextMappings,
          quotaRecords: nextQuotas,
          leaveRecords: nextLeaves,
          hrOverrides: nextOverrides,
          settings: nextSettings,
          updatedAt: new Date().toISOString(),
        });
        setLastSyncTimeText(`ซิงก์ล่าสุดเมื่อ ${timeStr} น.`);
      }
    });
    return () => {
      mounted = false;
    };
  }, [initialLeaveRecords, initialQuotaRecords]);

  // บันทึกการเปลี่ยนแปลงลง LocalStorage และซิงก์อัตโนมัติ
  const triggerSaveState = async (
    nextMappings = employeeMappings,
    nextQuotas = quotaRecords,
    nextLeaves = leaveRecords,
    nextOverrides = hrOverrides,
    nextSettings = settings
  ) => {
    setIsSyncing(true);
    try {
      await saveHRState({
        employeeMappings: nextMappings,
        quotaRecords: nextQuotas,
        leaveRecords: nextLeaves,
        hrOverrides: nextOverrides,
        settings: nextSettings,
        updatedAt: new Date().toISOString(),
      });
      const timeStr = new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      });
      setLastSyncTimeText(`ซิงก์ล่าสุดเมื่อ ${timeStr} น.`);
    } finally {
      setIsSyncing(false);
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

  // สร้าง Map ของ dailyRecords ตาม key
  const dailyRecordByKey = useMemo(() => {
    const map = new Map<string, DailyAuditRecord>();
    for (const r of auditResult.dailyRecords) {
      map.set(r.key, r);
    }
    return map;
  }, [auditResult.dailyRecords]);

  // รวมรายการที่ต้องตรวจสอบทั้งหมดในหน้า "รายการต้องตรวจสอบ"
  // ประกอบด้วย: รายการสแกนไม่ครบ/ไปพบลูกค้า (32 รายการ) + รายการเวลาเข้าผิดปกติ เช่น 16:10 น. + รายการมาสาย (เมื่อเลือกตัวกรองมาสาย)
  const allReviewBaseRecords = useMemo(() => {
    const map = new Map<string, DailyAuditRecord>();
    for (const r of auditResult.scanAnomalyRecords) {
      map.set(r.key, r);
    }
    for (const r of auditResult.suspiciousScanRecords) {
      map.set(r.key, r);
    }
    // รวมรายการที่เคยเป็นรายการผิดปกติแต่ HR แก้ไขเป็นครบปกติแล้ว เพื่อให้แสดงในตัวกรอง "รายการที่ HR แก้ไขแล้ว"
    for (const r of auditResult.dailyRecords) {
      if (r.hasHROverride || r.isReviewed) {
        map.set(r.key, r);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [
    auditResult.scanAnomalyRecords,
    auditResult.suspiciousScanRecords,
    auditResult.dailyRecords,
  ]);

  // นับจำนวนรายการผิดปกติที่ยังไม่ได้ตรวจ vs ตรวจแล้ว
  const unreviewedAnomalyCount = useMemo(() => {
    const targetMap = new Map<string, DailyAuditRecord>();
    for (const r of auditResult.scanAnomalyRecords) targetMap.set(r.key, r);
    for (const r of auditResult.suspiciousScanRecords) targetMap.set(r.key, r);
    let unreviewed = 0;
    for (const r of targetMap.values()) {
      if (!r.isReviewed && !r.hasHROverride) {
        unreviewed++;
      }
    }
    return unreviewed;
  }, [auditResult.scanAnomalyRecords, auditResult.suspiciousScanRecords]);

  const reviewedOrEditedCount = useMemo(() => {
    return auditResult.dailyRecords.filter(
      (r) => r.isReviewed || r.hasHROverride
    ).length;
  }, [auditResult.dailyRecords]);

  // คำนวณสถานะรอบเงินเดือน (5 สถานะตามที่ผู้ใช้กำหนด)
  const currentMonthClosedInfo = settings.closedMonths?.[selectedYearMonth];
  const payrollCycleStatus: PayrollCycleStatus = useMemo(() => {
    if (currentMonthClosedInfo?.status === 'ปิดรอบแล้ว') {
      return 'ปิดรอบแล้ว';
    }
    if (unreviewedAnomalyCount === 0) {
      return 'พร้อมส่งหัวหน้า';
    }
    if (reviewedOrEditedCount === 0) {
      return 'ยังไม่เริ่มตรวจ';
    }
    if (unreviewedAnomalyCount > 0 && reviewedOrEditedCount > 0) {
      return 'กำลังตรวจ';
    }
    return 'เหลือรายการต้องแก้';
  }, [currentMonthClosedInfo, unreviewedAnomalyCount, reviewedOrEditedCount]);

  // กรองรายการในหน้า "2. รายการต้องตรวจสอบ" ตามตัวกรองทั้ง 6 แบบ
  const filteredReviewRecords = useMemo(() => {
    const sourceList =
      reviewFilter === 'LATE'
        ? auditResult.dailyRecords.filter(
            (r) => r.lateCount > 0 || Boolean(r.suspiciousScanWarning)
          )
        : allReviewBaseRecords;

    return sourceList.filter((r) => {
      if (
        reviewFilter === 'MISSING_OUT' &&
        r.scanStatus !== 'พบสแกนเข้า แต่ไม่พบสแกนออก'
      ) {
        return false;
      }
      if (
        reviewFilter === 'MISSING_IN' &&
        r.scanStatus !== 'ไม่พบสแกนเข้า แต่พบสแกนออก' &&
        r.scanStatus !== 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา'
      ) {
        return false;
      }
      if (
        reviewFilter === 'CLIENT_VISIT' &&
        r.scanStatus !== 'คาดว่าไปพบลูกค้า' &&
        r.salesStatus !== 'คาดว่าไปพบลูกค้า'
      ) {
        return false;
      }
      if (reviewFilter === 'HR_EDITED' && !r.hasHROverride && !r.isReviewed) {
        return false;
      }
      if (reviewFilter === 'UNREVIEWED' && (r.isReviewed || r.hasHROverride)) {
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
          (r.suspiciousScanWarning || '').toLowerCase().includes(q) ||
          r.sheetNote.toLowerCase().includes(q) ||
          r.hrNote.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    reviewFilter,
    allReviewBaseRecords,
    auditResult.dailyRecords,
    dailyFilterEmp,
    searchQuery,
  ]);

  // จำลองผลกระทบต่อเบี้ยขยัน/เงินเดือนก่อนบันทึก (สำหรับ Modal แก้ไขรายวันเดี่ยว!)
  const simulatedSingleRecordAudit = useMemo(() => {
    if (!editingDailyRecord) return null;
    const key = editingDailyRecord.key;
    const nextOverrides = { ...hrOverrides };
    const existing = nextOverrides[key];

    nextOverrides[key] = {
      key,
      empKey: editingDailyRecord.empCode,
      employeeName: `${editingDailyRecord.fullName} (${editingDailyRecord.nickname})`,
      date: editingDailyRecord.date,
      previousSummary: `เข้า ${editingDailyRecord.originalScanIn} - ออก ${editingDailyRecord.originalScanOut}`,
      overrideScanIn:
        overrideScanInInput.trim() || existing?.overrideScanIn || undefined,
      overrideScanOut:
        overrideScanOutInput.trim() || existing?.overrideScanOut || undefined,
      overrideStatus: (overrideStatusInput ||
        existing?.overrideStatus ||
        undefined) as DailyAuditRecord['scanStatus'],
      overrideLateCount:
        overrideLateCountInput.trim() !== ''
          ? Number(overrideLateCountInput)
          : existing?.overrideLateCount ?? null,
      overrideLateMinutes:
        overrideLateMinutesInput.trim() !== ''
          ? Number(overrideLateMinutesInput)
          : existing?.overrideLateMinutes ?? null,
      hrNote: overrideNoteInput.trim(),
      isReviewed: true,
      updatedBy: overrideReviewerInput.trim() || 'HR',
      updatedAt: new Date().toLocaleString('th-TH'),
    };

    return runMonthlyAttendanceAudit({
      yearMonth: selectedYearMonth,
      attendanceRows,
      leaveRecords,
      quotaRecords,
      employeeMappings,
      hrOverrides: nextOverrides,
      settings: {
        ...settings,
        onlyMappedEmployees,
        autoSkipCompanyWideEmptyDays: autoSkipEmptyDays,
      },
    });
  }, [
    editingDailyRecord,
    hrOverrides,
    overrideScanInInput,
    overrideScanOutInput,
    overrideStatusInput,
    overrideLateCountInput,
    overrideLateMinutesInput,
    overrideNoteInput,
    overrideReviewerInput,
    selectedYearMonth,
    attendanceRows,
    leaveRecords,
    quotaRecords,
    employeeMappings,
    settings,
    onlyMappedEmployees,
    autoSkipEmptyDays,
  ]);

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
        isReviewed: true,
        reviewedAt: nowStr,
        reviewedBy:
          settings.companyProfile?.hrReviewerName || 'HR / Payroll',
        updatedBy:
          settings.companyProfile?.hrReviewerName || 'HR / Payroll',
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
    settings.companyProfile?.hrReviewerName,
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

  // สลับการเลือกแถวสำหรับ Bulk Edit
  const toggleSelectRow = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllVisibleReviewItems = () => {
    const allVisibleKeys = filteredReviewRecords.map((r) => r.key);
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

  // ปุ่มทำเครื่องหมายว่าตรวจแล้ว (Mark as Reviewed) รายรายการ
  const handleToggleReviewed = async (record: DailyAuditRecord) => {
    const key = record.key;
    const next = { ...hrOverrides };
    const existing = next[key];
    const nowStr = new Date().toLocaleString('th-TH');
    const reviewer =
      settings.companyProfile?.hrReviewerName || 'HR / Payroll';

    if (existing?.isReviewed && !record.hasHROverride) {
      delete next[key];
    } else if (existing) {
      next[key] = {
        ...existing,
        isReviewed: !existing.isReviewed,
        reviewedAt: nowStr,
        reviewedBy: reviewer,
      };
    } else {
      next[key] = {
        key,
        empKey: record.empCode,
        employeeName: `${record.fullName} (${record.nickname})`,
        date: record.date,
        previousSummary: `เข้า ${record.originalScanIn} - ออก ${record.originalScanOut} (${record.scanStatus})`,
        hrNote: record.hrNote || 'HR ตรวจสอบรายการแล้ว',
        isReviewed: true,
        reviewedAt: nowStr,
        reviewedBy: reviewer,
        updatedBy: reviewer,
        updatedAt: nowStr,
      };
    }

    setHrOverrides(next);
    await triggerSaveState(
      employeeMappings,
      quotaRecords,
      leaveRecords,
      next,
      settings
    );
  };

  // ทำเครื่องหมายว่าตรวจแล้วแบบกลุ่ม
  const handleBulkMarkReviewed = async () => {
    if (selectedKeys.length === 0) return;
    const next = { ...hrOverrides };
    const nowStr = new Date().toLocaleString('th-TH');
    const reviewer =
      settings.companyProfile?.hrReviewerName || 'HR / Payroll';

    for (const key of selectedKeys) {
      const rec = dailyRecordByKey.get(key);
      if (!rec) continue;
      const existing = next[key];
      next[key] = {
        key,
        empKey: rec.empCode,
        employeeName: `${rec.fullName} (${rec.nickname})`,
        date: rec.date,
        previousSummary:
          existing?.previousSummary ||
          `เข้า ${rec.originalScanIn} - ออก ${rec.originalScanOut} (${rec.scanStatus})`,
        overrideScanIn: existing?.overrideScanIn,
        overrideScanOut: existing?.overrideScanOut,
        overrideStatus: existing?.overrideStatus,
        overrideLateCount: existing?.overrideLateCount,
        overrideLateMinutes: existing?.overrideLateMinutes,
        hrNote: existing?.hrNote || 'HR ตรวจสอบรายการแล้ว',
        isReviewed: true,
        reviewedAt: nowStr,
        reviewedBy: reviewer,
        updatedBy: existing?.updatedBy || reviewer,
        updatedAt: nowStr,
      };
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

  // เปิด Modal แก้ไข / ใส่หมายเหตุรายวันเดี่ยว
  const handleOpenEditDaily = (
    record: DailyAuditRecord,
    mode: 'full' | 'note_only' = 'full'
  ) => {
    const existing = hrOverrides[record.key];
    setEditingDailyRecord(record);
    setEditingMode(mode);
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
    setOverrideReviewerInput(
      existing?.updatedBy ||
        settings.companyProfile?.hrReviewerName ||
        'HR / Payroll'
    );
  };

  // บันทึก HR Override เดี่ยว โดยไม่ทับข้อมูลดิบต้นฉบับ พร้อมเก็บประวัติการแก้ไข (Audit Log)
  const handleSaveDailyOverride = async () => {
    if (!editingDailyRecord) return;
    const key = editingDailyRecord.key;
    const nextOverrides = { ...hrOverrides };
    const nowStr = new Date().toLocaleString('th-TH');

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
        isReviewed: true,
        reviewedAt: nowStr,
        reviewedBy: overrideReviewerInput.trim() || 'HR / Payroll',
        updatedBy: overrideReviewerInput.trim() || 'HR / Payroll',
        updatedAt: nowStr,
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

  // ปิดรอบเงินเดือน / เปิดรอบเพื่อแก้ไข
  const handleToggleClosePayrollCycle = async () => {
    const nextClosed = { ...(settings.closedMonths || {}) };
    if (nextClosed[selectedYearMonth]?.status === 'ปิดรอบแล้ว') {
      delete nextClosed[selectedYearMonth];
    } else {
      nextClosed[selectedYearMonth] = {
        closedAt: new Date().toLocaleString('th-TH'),
        closedBy:
          settings.companyProfile?.hrReviewerName || 'HR / Payroll',
        status: 'ปิดรอบแล้ว',
      };
    }
    const nextSettings: AuditSettings = {
      ...settings,
      closedMonths: nextClosed,
    };
    setSettings(nextSettings);
    await triggerSaveState(
      employeeMappings,
      quotaRecords,
      leaveRecords,
      hrOverrides,
      nextSettings
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
            `ไฟล์ "${file.name}": นำเข้าข้อมูลสแกนนิ้ว ${res.attendanceRows.length} แถว (${Array.from(uploadedDates).join(', ')})`
          );
        }
        if (res.leaveRecords.length > 0) {
          nextLeaves = res.leaveRecords;
          logs.push(
            `ไฟล์ "${file.name}": นำเข้าประวัติการลาออนไลน์ ${res.leaveRecords.length} รายการ`
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

  // พิมพ์ PDF รายงานหัวหน้า
  const handlePrintManagerPDF = () => {
    setReportMode('manager');
    setActiveSection('overview_payroll');
    setIsExportMenuOpen(false);
    setTimeout(() => {
      window.print();
    }, 150);
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

  // สถิติแยกย่อยของรายการต้องตรวจสอบ
  const anomalyMissingOutCount = auditResult.scanAnomalyRecords.filter(
    (r) => r.scanStatus === 'พบสแกนเข้า แต่ไม่พบสแกนออก'
  ).length;
  const anomalyMissingInCount = auditResult.scanAnomalyRecords.filter(
    (r) =>
      r.scanStatus === 'ไม่พบสแกนเข้า แต่พบสแกนออก' ||
      r.scanStatus === 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา'
  ).length;
  const anomalyClientVisitCount = auditResult.scanAnomalyRecords.filter(
    (r) => r.scanStatus === 'คาดว่าไปพบลูกค้า'
  ).length;
  const lateDailyCount = auditResult.dailyRecords.filter(
    (r) => r.lateCount > 0 || Boolean(r.suspiciousScanWarning)
  ).length;

  // รายการเมนูหลัก 5 หมวดหมู่บน Sidebar ด้านซ้าย
  const navItems: {
    id: MainSection;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    badgeTone?: 'rose' | 'emerald' | 'indigo' | 'amber';
  }[] = [
    {
      id: 'overview_payroll',
      label: '1. ภาพรวมเงินเดือน',
      subtitle: 'สรุปผู้บริหาร & ปิดรอบ',
      icon: LayoutDashboard,
      badge: `${auditResult.activitySummaryReport.length} คน`,
      badgeTone: 'indigo',
    },
    {
      id: 'review_items',
      label: '2. รายการต้องตรวจสอบ',
      subtitle: 'สแกนไม่ครบ / พบลูกค้า / สาย',
      icon: ShieldAlert,
      badge:
        unreviewedAnomalyCount > 0
          ? `รอตรวจ ${unreviewedAnomalyCount}`
          : 'ตรวจครบ ✓',
      badgeTone: unreviewedAnomalyCount > 0 ? 'rose' : 'emerald',
    },
    {
      id: 'attendance_time',
      label: '3. เวลาเข้างาน',
      subtitle: 'สาย • เบี้ยขยัน • สแกนต้นฉบับ',
      icon: Clock,
      badge: `สาย ${auditResult.activityGrandTotal.lateCount} ครั้ง`,
      badgeTone: 'amber',
    },
    {
      id: 'leave_and_quota',
      label: '4. การลาและสิทธิ',
      subtitle: 'วันลาทุกประเภท & สิทธิคงเหลือ',
      icon: Calendar,
      badge: formatLeaveHuman(
        auditResult.activityGrandTotal.totalLeaveDays,
        { zeroText: '0 วัน' }
      ),
      badgeTone: 'indigo',
    },
    {
      id: 'employees_settings',
      label: '5. พนักงานและตั้งค่า',
      subtitle: 'ผูกชื่อสแกน • แผนก • กฎบริษัท',
      icon: Settings,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col pb-16 lg:pb-0">
      {/* ===================================================================== */}
      {/* TOP BAR: ปุ่มหลักด้านบน (เลือกเดือน | นำเข้าข้อมูล | ส่งออก | พิมพ์ | ซิงก์ข้อมูล) */}
      {/* ===================================================================== */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md no-print">
        <div className="max-w-[1440px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* ชื่อระบบ + สถานะรอบเงินเดือน + สถานะซิงก์เล็ก ๆ */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-xs">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold tracking-tight">
                  JCW HR Time Attendance & Payroll Audit
                </h1>
                {/* ป้ายสถานะรอบเงินเดือน */}
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    payrollCycleStatus === 'ปิดรอบแล้ว'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                      : payrollCycleStatus === 'พร้อมส่งหัวหน้า'
                      ? 'bg-sky-500/20 text-sky-200 border-sky-400/40'
                      : payrollCycleStatus === 'กำลังตรวจ'
                      ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                      : payrollCycleStatus === 'เหลือรายการต้องแก้'
                      ? 'bg-rose-500/20 text-rose-200 border-rose-400/40'
                      : 'bg-slate-700 text-slate-200 border-slate-600'
                  }`}
                >
                  สถานะรอบ: {payrollCycleStatus}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  {lastSyncTimeText}
                </span>
                <span>•</span>
                <span>
                  มุมมองปัจจุบัน:{' '}
                  <strong className="text-amber-300">
                    {reportMode === 'manager'
                      ? 'สำหรับหัวหน้า (สรุปสั้น อ่านง่าย)'
                      : 'สำหรับ HR / Payroll (ละเอียด + แก้ไขได้)'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* ปุ่มหลักด้านบน: เลือกเดือน | นำเข้าข้อมูล | ส่งออก | พิมพ์ | ซิงก์ข้อมูล */}
          <div className="flex flex-wrap items-center gap-2">
            {/* สลับมุมมองหัวหน้า vs HR/Payroll */}
            <div
              className="inline-flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700"
              role="group"
              aria-label="สลับมุมมองหัวหน้าและมุมมอง HR"
            >
              <button
                type="button"
                onClick={() => setReportMode('manager')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  reportMode === 'manager'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                มุมมองหัวหน้า
              </button>
              <button
                type="button"
                onClick={() => setReportMode('hr_payroll')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  reportMode === 'hr_payroll'
                    ? 'bg-indigo-500 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                มุมมอง HR/Payroll
              </button>
            </div>

            {/* 1. เลือกเดือน */}
            <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700">
              <Calendar className="w-4 h-4 text-indigo-300" />
              <label htmlFor="top-month-select" className="sr-only">
                เลือกเดือนรอบเงินเดือน
              </label>
              <select
                id="top-month-select"
                aria-label="เลือกเดือนรอบเงินเดือน"
                value={selectedYearMonth}
                onChange={(e) => {
                  setSelectedYearMonth(e.target.value);
                  setSelectedKeys([]);
                }}
                className="bg-slate-800 text-white text-xs sm:text-sm font-bold focus:outline-none cursor-pointer"
              >
                {availableMonths.map((ym) => (
                  <option key={ym} value={ym}>
                    {formatYearMonthThai(ym)}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. นำเข้าข้อมูล */}
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              <Upload className="w-4 h-4 text-sky-300" />
              <span>นำเข้าข้อมูล</span>
            </button>

            {/* 3. ส่งออก (Dropdown แยก 4 รูปแบบ + รายงานเพิ่มเติม All-in-One) */}
            <div className="relative">
              <button
                type="button"
                aria-expanded={isExportMenuOpen}
                aria-label="เปิดเมนูส่งออกรายงาน"
                onClick={() => setIsExportMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>ส่งออก</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {isExportMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 py-2 z-50 text-xs">
                  <div className="px-3 py-1.5 font-bold text-slate-500 uppercase text-[11px] border-b border-slate-100">
                    เลือกรูปแบบเอกสารที่ต้องการส่งออก
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      exportManagerReportToExcel(auditResult);
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-amber-50 flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-900">
                        Excel รายงานหัวหน้า (.xlsx)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        สั้น อ่านง่าย แสดงเฉพาะตัวเลขสำคัญ
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      exportHRPayrollReportToExcel(auditResult, hrOverrides);
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-indigo-50 flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-900">
                        Excel รายงาน HR/Payroll (.xlsx)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        ครบทุกชีต พร้อมสแกนต้นฉบับและประวัติแก้ไข
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintManagerPDF}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-rose-50 flex items-center gap-2.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-rose-600 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-900">
                        PDF รายงานหัวหน้า
                      </div>
                      <div className="text-[11px] text-slate-500">
                        จัดหน้าสรุป 1 หน้าสำหรับพิมพ์หรือบันทึกเป็น PDF
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      exportDetailedCSV(auditResult);
                      setIsExportMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-emerald-50 flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-900">
                        CSV รายละเอียด (.csv)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        ข้อมูลรายวันและเวลาสแกนต้นฉบับทั้งหมด
                      </div>
                    </div>
                  </button>

                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection('extra_all_in_one');
                        setIsExportMenuOpen(false);
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-slate-100 flex items-center gap-2.5 text-indigo-700 font-semibold cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 shrink-0" />
                      <span>เปิดดูรายงานเพิ่มเติม (All-in-One)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. พิมพ์ */}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-amber-300" />
              <span>พิมพ์</span>
            </button>

            {/* 5. ซิงก์ข้อมูล */}
            <button
              type="button"
              onClick={() => triggerSaveState()}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition cursor-pointer"
              title={lastSyncTimeText}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-emerald-400 ${
                  isSyncing ? 'animate-spin' : ''
                }`}
              />
              <span>ซิงก์ข้อมูล</span>
            </button>
          </div>
        </div>

        {/* แถบขั้นตอนการทำงานหลักของ HR (8 ขั้นตอน) */}
        <div className="bg-slate-950/90 border-t border-slate-800 px-4 py-2 overflow-x-auto">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-2 text-[11px] min-w-max">
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="font-bold text-indigo-300 uppercase">
                ขั้นตอนปิดเงินเดือน:
              </span>
              {[
                {
                  step: '1. เลือกเดือน',
                  done: true,
                  onClick: () => setActiveSection('overview_payroll'),
                },
                {
                  step: '2. นำเข้า/ซิงก์ข้อมูล',
                  done: true,
                  onClick: () => setIsUploadModalOpen(true),
                },
                {
                  step: `3. ตรวจรายการผิดปกติ (${auditResult.scanAnomalyRecords.length - unreviewedAnomalyCount}/${auditResult.scanAnomalyRecords.length})`,
                  done: unreviewedAnomalyCount === 0,
                  onClick: () => setActiveSection('review_items'),
                },
                {
                  step: `4. แก้ไข/ใส่หมายเหตุ (${reviewedOrEditedCount})`,
                  done: reviewedOrEditedCount > 0,
                  onClick: () => setActiveSection('review_items'),
                },
                {
                  step: '5. ตรวจผลกระทบเงินเดือน',
                  done: auditResult.isAllReconciled,
                  onClick: () => setActiveSection('overview_payroll'),
                },
                {
                  step: '6. ดูภาพรวมเงินเดือน',
                  done: true,
                  onClick: () => setActiveSection('overview_payroll'),
                },
                {
                  step: '7. ส่งออกให้หัวหน้า',
                  done: unreviewedAnomalyCount === 0,
                  onClick: () => exportManagerReportToExcel(auditResult),
                },
                {
                  step:
                    payrollCycleStatus === 'ปิดรอบแล้ว'
                      ? '8. ปิดรอบเงินเดือนแล้ว ✓'
                      : '8. ปิดรอบเงินเดือน',
                  done: payrollCycleStatus === 'ปิดรอบแล้ว',
                  onClick: handleToggleClosePayrollCycle,
                },
              ].map((s, idx) => (
                <React.Fragment key={s.step}>
                  {idx > 0 && <span className="text-slate-600">→</span>}
                  <button
                    type="button"
                    onClick={s.onClick}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${
                      s.done
                        ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 font-semibold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {s.step}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* BODY LAYOUT: Desktop Left Sidebar + Main Content Area */}
      {/* ===================================================================== */}
      <div className="max-w-[1440px] w-full mx-auto flex-1 flex gap-6 px-4 py-6">
        {/* Desktop Left Sidebar */}
        <aside
          className="hidden lg:flex flex-col w-64 shrink-0 space-y-4 no-print"
          aria-label="เมนูหลักด้านซ้าย"
        >
          <nav className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs space-y-1">
            <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              เมนูหลักสำหรับ HR & หัวหน้า
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition flex items-start justify-between gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        isActive ? 'text-white' : 'text-indigo-600'
                      }`}
                    />
                    <div>
                      <div className="text-xs sm:text-sm font-bold leading-snug">
                        {item.label}
                      </div>
                      <div
                        className={`text-[11px] mt-0.5 ${
                          isActive ? 'text-indigo-100' : 'text-slate-500'
                        }`}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  {item.badge && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : item.badgeTone === 'rose'
                          ? 'bg-rose-100 text-rose-800'
                          : item.badgeTone === 'emerald'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.badgeTone === 'amber'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* การ์ดสถานะรอบเงินเดือนและปุ่มปิดรอบ */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">สถานะรอบเงินเดือน</span>
              <span
                className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                  payrollCycleStatus === 'ปิดรอบแล้ว'
                    ? 'bg-emerald-100 text-emerald-800'
                    : payrollCycleStatus === 'พร้อมส่งหัวหน้า'
                    ? 'bg-sky-100 text-sky-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {payrollCycleStatus}
              </span>
            </div>

            <div className="space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>รายการผิดปกติทั้งหมด:</span>
                <strong className="text-slate-900">
                  {auditResult.scanAnomalyRecords.length} รายการ
                </strong>
              </div>
              <div className="flex justify-between">
                <span>ยังไม่ได้ตรวจสอบ:</span>
                <strong
                  className={
                    unreviewedAnomalyCount > 0
                      ? 'text-rose-600'
                      : 'text-emerald-700'
                  }
                >
                  {unreviewedAnomalyCount} รายการ
                </strong>
              </div>
              <div className="flex justify-between">
                <span>ตรวจสอบยอดข้ามรายงาน:</span>
                <strong
                  className={
                    auditResult.isAllReconciled
                      ? 'text-emerald-700'
                      : 'text-rose-600'
                  }
                >
                  {auditResult.isAllReconciled ? 'ตรงกัน 100%' : 'พบจุดต่าง'}
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleClosePayrollCycle}
              className={`w-full py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                payrollCycleStatus === 'ปิดรอบแล้ว'
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {payrollCycleStatus === 'ปิดรอบแล้ว' ? (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  เปิดรอบเพื่อแก้ไขข้อมูล
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  ยืนยันปิดรอบเงินเดือน
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 space-y-6">
          {/* Print Header */}
          <div className="hidden print:block border-b-2 border-slate-800 pb-4 mb-6">
            <h1 className="text-2xl font-bold text-slate-900">
              {reportMode === 'manager'
                ? `รายงานสรุปเงินเดือนและเวลาทำงานสำหรับผู้บริหาร — ${settings.companyProfile?.companyName || 'JCW International'}`
                : `รายงานตรวจสอบเวลาทำงานและการลาสำหรับ HR / Payroll — ${settings.companyProfile?.companyName || 'JCW International'}`}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              ประจำเดือน: {formatYearMonthThai(selectedYearMonth)} | สถานะรอบ:{' '}
              {payrollCycleStatus} | พิมพ์เมื่อ:{' '}
              {new Date().toLocaleString('th-TH')}
            </p>
          </div>

          {/* ===================================================================== */}
          {/* MENU 1: ภาพรวมเงินเดือน (Payroll Overview / Executive Summary) */}
          {/* ===================================================================== */}
          {activeSection === 'overview_payroll' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                        <LayoutDashboard className="w-3.5 h-3.5" />
                        1. ภาพรวมเงินเดือนประจำเดือน
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          payrollCycleStatus === 'ปิดรอบแล้ว'
                            ? 'bg-emerald-100 text-emerald-800'
                            : payrollCycleStatus === 'พร้อมส่งหัวหน้า'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        สถานะ: {payrollCycleStatus}
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-2">
                      สรุปภาพรวมเงินเดือน — ประจำเดือน{' '}
                      {formatYearMonthThai(selectedYearMonth)}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                      แสดงเฉพาะข้อมูลสรุปสำคัญสำหรับการอนุมัติเงินเดือน (ตัดข้อมูลเชิงเทคนิคออกทั้งหมด)
                    </p>
                  </div>

                  {/* ปุ่มดาวน์โหลดรายงานหัวหน้า & ปุ่มพิมพ์ PDF */}
                  <div className="flex flex-wrap items-center gap-2 no-print">
                    <button
                      type="button"
                      onClick={() => exportManagerReportToExcel(auditResult)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      ดาวน์โหลดรายงานหัวหน้า (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintManagerPDF}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer"
                    >
                      <Printer className="w-4 h-4 text-amber-300" />
                      พิมพ์ PDF
                    </button>
                  </div>
                </div>

                {/* 5 การ์ดสรุปหลักตามโครงสร้างใหม่ */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
                  {/* 1. จำนวนพนักงาน */}
                  <div className="rounded-xl p-4 bg-slate-50 border border-slate-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600">
                          จำนวนพนักงาน
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
                      วันทำงานในเดือนนี้{' '}
                      <strong className="text-slate-800">
                        {auditResult.workdaysInMonth.length} วันทำการ
                      </strong>
                    </p>
                  </div>

                  {/* 2. จำนวนคน/ครั้ง/นาทีที่มาสาย */}
                  <div
                    onClick={() => setActiveSection('attendance_time')}
                    className="rounded-xl p-4 bg-amber-50/70 border border-amber-200 hover:border-amber-400 transition cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-950">
                          มาสาย (คน / ครั้ง / นาที)
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
                      ไม่มาสายเลย{' '}
                      {auditResult.lateSummaryReport.length -
                        latePeopleList.length}{' '}
                      คน
                    </p>
                  </div>

                  {/* 3. จำนวนลาไม่รับค่าจ้าง */}
                  <div
                    onClick={() => setActiveSection('leave_and_quota')}
                    className="rounded-xl p-4 bg-rose-50/70 border border-rose-200 hover:border-rose-400 transition cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-950">
                          ลาไม่รับค่าจ้าง
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
                        {auditResult.activityGrandTotal.unpaidHours > 0 && (
                          <span className="text-xs font-bold text-rose-900">
                            ({formatHoursClean(
                              auditResult.activityGrandTotal.unpaidHours
                            )})
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-rose-900/80">
                      ผู้ลาไม่รับค่าจ้าง {unpaidPeopleList.length} คน | รวมลาทุกประเภท{' '}
                      {formatLeaveHuman(
                        auditResult.activityGrandTotal.totalLeaveDays,
                        { zeroText: '0 วัน' }
                      )}
                    </p>
                  </div>

                  {/* 4. ผู้ได้รับและไม่ได้รับเบี้ยขยัน */}
                  <div
                    onClick={() => setActiveSection('attendance_time')}
                    className="rounded-xl p-4 bg-emerald-50/70 border border-emerald-200 hover:border-emerald-400 transition cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-950">
                          ได้รับ / ไม่ได้รับเบี้ยขยัน
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
                      ได้แก่:{' '}
                      {eligibleDiligenceList.map((e) => e.nickname).join(', ') ||
                        '-'}
                    </p>
                  </div>

                  {/* 5. จำนวนรายการผิดปกติที่ยังไม่ได้ตรวจ */}
                  <div
                    onClick={() => setActiveSection('review_items')}
                    className="rounded-xl p-4 bg-indigo-50/80 border border-indigo-200 hover:border-indigo-400 transition cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-950">
                          รายการผิดปกติที่ยังไม่ได้ตรวจ
                        </span>
                        <ShieldAlert className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="mt-3 flex items-baseline gap-1.5">
                        <span
                          className={`text-3xl font-extrabold ${
                            unreviewedAnomalyCount > 0
                              ? 'text-rose-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {unreviewedAnomalyCount}
                        </span>
                        <span className="text-sm font-bold text-indigo-900">
                          / {auditResult.scanAnomalyRecords.length} รายการ
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-indigo-900/80">
                      คลิกเพื่อตรวจรายการสแกนไม่ครบ / พบลูกค้า
                    </p>
                  </div>
                </div>

                {/* แจ้งเตือนหากมีเวลาสแกนเข้าผิดปกติ เช่น 16:10 น. */}
                {auditResult.suspiciousScanRecords.length > 0 && (
                  <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div className="text-xs sm:text-sm text-rose-950">
                        <div className="font-bold">
                          คำเตือนก่อนคำนวณเงินเดือน: พบข้อมูลเวลาสแกนเข้างานผิดปกติ{' '}
                          {auditResult.suspiciousScanRecords.length} รายการ
                        </div>
                        <p className="text-xs text-rose-800 mt-0.5">
                          {auditResult.suspiciousScanRecords
                            .map(
                              (r) =>
                                `${r.fullName} (${r.nickname}) วันที่ ${formatDateDisplay(r.date)} สแกนเข้าเวลา ${r.effectiveScanIn} น. (คิดสาย ${r.lateMinutes} นาที)`
                            )
                            .join(' • ')}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewFilter('LATE');
                        setActiveSection('review_items');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0 cursor-pointer no-print"
                    >
                      ไปตรวจสอบรายการนี้ทันที
                    </button>
                  </div>
                )}

                {/* รายละเอียดสรุป 2 คอลัมน์ (เบี้ยขยัน + มาสาย/ลาไม่รับค่าจ้าง) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  {/* ซ้าย: ผู้ได้รับและไม่ได้รับเบี้ยขยัน */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-emerald-50/70 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-emerald-600" />
                        ผู้ได้รับและไม่ได้รับเบี้ยขยัน ({auditResult.diligenceReport.length}{' '}
                        คน)
                      </h3>
                      <span className="text-xs font-semibold text-emerald-800">
                        ได้ {eligibleDiligenceList.length} | ไม่ได้{' '}
                        {ineligibleDiligenceList.length}
                      </span>
                    </div>
                    <div className="p-4 space-y-3 text-xs sm:text-sm">
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                        <div className="font-bold text-emerald-950 mb-1.5">
                          ผู้ได้รับเบี้ยขยัน ({eligibleDiligenceList.length} คน):
                        </div>
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
                      </div>

                      <div>
                        <div className="font-bold text-slate-800 mb-1.5">
                          ผู้ไม่ได้รับเบี้ยขยัน ({ineligibleDiligenceList.length}{' '}
                          คน) และสาเหตุหลัก:
                        </div>
                        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
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

                  {/* ขวา: สรุปมาสาย + ลาไม่รับค่าจ้าง + สรุปการลาแต่ละประเภท */}
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-3 bg-amber-50/70 border-b border-slate-200">
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-amber-600" />
                          รายชื่อผู้มาสาย ({latePeopleList.length} คน) และผู้ลาไม่รับค่าจ้าง (
                          {unpaidPeopleList.length} คน)
                        </h3>
                      </div>
                      <div className="p-4 space-y-3 text-xs">
                        <div>
                          <div className="font-bold text-amber-950 mb-1.5">
                            ผู้มาสายรวม {latePeopleList.length} คน (
                            {auditResult.activityGrandTotal.lateCount} ครั้ง /{' '}
                            {auditResult.activityGrandTotal.lateMinutes} นาที):
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
                            )}
                            :
                          </div>
                          {unpaidPeopleList.length === 0 ? (
                            <div className="text-slate-500">
                              ไม่มีการลาไม่รับค่าจ้างในเดือนนี้
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
                                    {formatLeaveHuman(u.unpaidDays)} (
                                    {formatHoursClean(u.unpaidHours)})
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ระบบตรวจสอบยอดรวมระหว่างรายงานต่าง ๆ อัตโนมัติ (Reconciliation Check) */}
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="text-xs sm:text-sm font-bold text-emerald-950 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ระบบตรวจสอบความตรงกันของตัวเลขข้ามหน้าจอ
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          {auditResult.isAllReconciled
                            ? 'ยอดตรงกันทุกหน้าจอ 100%'
                            : 'กรุณาตรวจสอบยอด'}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {auditResult.reconciliationChecks.map((chk) => (
                          <div
                            key={chk.id}
                            className="p-2 rounded-lg bg-white border border-emerald-200 flex items-center justify-between gap-2"
                          >
                            <span className="text-slate-700 font-medium">
                              {chk.label}:
                            </span>
                            <span className="font-bold text-emerald-800">
                              {chk.valueA} ✓
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* MENU 2: รายการต้องตรวจสอบ (เปลี่ยนชื่อจาก HR Exception เป็น รายการต้องตรวจสอบ) */}
          {/* ===================================================================== */}
          {activeSection === 'review_items' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        2. รายการต้องตรวจสอบ
                      </span>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                        ตรวจแล้ว {reviewedOrEditedCount} รายการ | รอตรวจ{' '}
                        {unreviewedAnomalyCount} รายการ
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5">
                      รายการต้องตรวจสอบประจำเดือน{' '}
                      {formatYearMonthThai(selectedYearMonth)} (แสดง{' '}
                      {filteredReviewRecords.length} รายการ)
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      ทุกการแก้ไขจะแสดงผลกระทบต่อเบี้ยขยัน/เงินเดือนก่อนบันทึก และเก็บรักษาเวลาสแกนนิ้วต้นฉบับไว้เสมอ
                    </p>
                  </div>

                  {/* ตัวกรองครบทั้ง 6 ประเภทตามที่ผู้ใช้กำหนด */}
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="tablist"
                    aria-label="ตัวกรองรายการต้องตรวจสอบ"
                  >
                    {[
                      {
                        id: 'ALL',
                        label: `ทั้งหมด (${allReviewBaseRecords.length})`,
                      },
                      {
                        id: 'UNREVIEWED',
                        label: `รายการที่ยังไม่ได้ตรวจสอบ (${unreviewedAnomalyCount})`,
                      },
                      {
                        id: 'MISSING_OUT',
                        label: `สแกนเข้าแต่ไม่สแกนออก (${anomalyMissingOutCount})`,
                      },
                      {
                        id: 'MISSING_IN',
                        label: `ไม่พบสแกนเข้า (${anomalyMissingInCount})`,
                      },
                      {
                        id: 'CLIENT_VISIT',
                        label: `ฝ่ายขายไปพบลูกค้า (${anomalyClientVisitCount})`,
                      },
                      {
                        id: 'LATE',
                        label: `มาสาย (${lateDailyCount})`,
                      },
                      {
                        id: 'HR_EDITED',
                        label: `รายการที่ HR แก้ไขแล้ว (${reviewedOrEditedCount})`,
                      },
                    ].map((btn) => (
                      <button
                        key={btn.id}
                        type="button"
                        role="tab"
                        aria-selected={reviewFilter === btn.id}
                        onClick={() =>
                          setReviewFilter(btn.id as ReviewFilterType)
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          reviewFilter === btn.id
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* แถบเครื่องมือค้นหา + ระบบแก้ไขแบบกลุ่ม (Bulk Edit) */}
                <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-3 no-print">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs sm:text-sm font-bold text-indigo-950">
                        จัดการแบบกลุ่ม (เลือกแล้ว {selectedKeys.length} รายการ)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllVisibleReviewItems}
                        className="px-2.5 py-1 rounded-lg bg-white border border-indigo-300 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                      >
                        เลือก/ยกเลิกทั้งหมดในหน้านี้ ({filteredReviewRecords.length})
                      </button>
                      {selectedKeys.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={handleBulkMarkReviewed}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                          >
                            ทำเครื่องหมายว่าตรวจแล้ว ({selectedKeys.length})
                          </button>
                          <button
                            type="button"
                            onClick={handleClearSelectedOverrides}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100 border border-rose-300 text-xs font-semibold text-rose-800 hover:bg-rose-200 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            คืนค่าต้นฉบับที่เลือก
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        เปลี่ยนสถานะเป็น:
                      </label>
                      <select
                        aria-label="เปลี่ยนสถานะแบบกลุ่ม"
                        value={bulkStatusInput}
                        onChange={(e) => setBulkStatusInput(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="ครบปกติ">ครบปกติ (ยืนยันมาทำงาน)</option>
                        <option value="คาดว่าไปพบลูกค้า">
                          คาดว่าไปพบลูกค้า (ฝ่ายขาย)
                        </option>
                        <option value="ลาเต็มวัน/มีข้อมูลการลา">
                          ลาเต็มวัน/มีข้อมูลการลา
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        เวลาเข้าใหม่ (เว้นว่างใช้ค่าเดิม):
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น 08:00:00"
                        value={bulkScanInInput}
                        onChange={(e) => setBulkScanInInput(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        เวลาออกใหม่ (เว้นว่างใช้ค่าเดิม):
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น 17:00:00"
                        value={bulkScanOutInput}
                        onChange={(e) => setBulkScanOutInput(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                      />
                    </div>

                    <div className=" lg:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">
                        หมายเหตุ HR:
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น HR ตรวจสอบแล้ว ยืนยันเวลาทำงาน..."
                        value={bulkNoteInput}
                        onChange={(e) => setBulkNoteInput(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                      />
                    </div>

                    <div className="flex flex-col justify-end">
                      <button
                        type="button"
                        disabled={selectedKeys.length === 0}
                        onClick={() => setIsBulkPreviewOpen(true)}
                        className={`w-full py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition ${
                          selectedKeys.length > 0
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        ดูผลกระทบก่อนบันทึก ({selectedKeys.length})
                      </button>
                    </div>
                  </div>
                </div>

                {/* ตัวกรองพนักงานและช่องค้นหา */}
                <div className="flex flex-wrap items-center gap-3 text-xs no-print">
                  <select
                    aria-label="กรองรายการต้องตรวจสอบตามพนักงาน"
                    value={dailyFilterEmp}
                    onChange={(e) => setDailyFilterEmp(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-medium"
                  >
                    <option value="ALL">พนักงานทุกคน</option>
                    {employeeMappings.map((m) => (
                      <option key={m.empCode} value={m.empCode}>
                        {m.fullName} ({m.nickname}) — {m.position}
                      </option>
                    ))}
                  </select>

                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
                    <input
                      type="text"
                      aria-label="ค้นหารายการต้องตรวจสอบ"
                      placeholder="ค้นหาชื่อ, วันที่ (เช่น 2026-10-15), เวลา (เช่น 16:10), หมายเหตุ..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* ตารางรายการต้องตรวจสอบ */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-2.5 text-center no-print">
                          <input
                            type="checkbox"
                            aria-label="เลือกทุกรายการในหน้านี้"
                            checked={
                              filteredReviewRecords.length > 0 &&
                              filteredReviewRecords.every((r) =>
                                selectedKeys.includes(r.key)
                              )
                            }
                            onChange={selectAllVisibleReviewItems}
                            className="rounded text-indigo-600 cursor-pointer"
                          />
                        </th>
                        <th className="py-2.5 px-2.5 font-semibold">วันที่</th>
                        <th className="py-2.5 px-3 font-semibold">
                          ชื่อ-นามสกุล (ชื่อเล่น)
                        </th>
                        <th className="py-2.5 px-2.5 font-semibold">
                          ตำแหน่ง / แผนก
                        </th>
                        <th className="py-2.5 px-2.5 font-semibold text-center bg-slate-200/50">
                          สแกนต้นฉบับ (เก็บไว้เสมอ)
                        </th>
                        <th className="py-2.5 px-2.5 font-semibold text-center bg-indigo-50/50">
                          เวลาที่ใช้คำนวณ
                        </th>
                        <th className="py-2.5 px-2.5 font-semibold">
                          สาเหตุที่ต้องตรวจ / คำเตือน
                        </th>
                        <th className="py-2.5 px-2.5 font-semibold">
                          หมายเหตุ & ประวัติการแก้ไข
                        </th>
                        <th className="py-2.5 px-2.5 font-semibold text-center no-print">
                          การจัดการของ HR
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredReviewRecords.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="py-8 text-center text-slate-500"
                          >
                            ไม่พบรายการตามตัวกรองที่เลือก
                          </td>
                        </tr>
                      ) : (
                        filteredReviewRecords.map((r) => {
                          const isChecked = selectedKeys.includes(r.key);
                          return (
                            <tr
                              key={r.key}
                              className={
                                isChecked
                                  ? 'bg-indigo-50/70'
                                  : r.suspiciousScanWarning
                                  ? 'bg-rose-50/60 hover:bg-rose-50'
                                  : r.isReviewed
                                  ? 'bg-emerald-50/30 hover:bg-emerald-50/50'
                                  : 'hover:bg-slate-50'
                              }
                            >
                              <td className="py-2.5 px-2.5 text-center no-print">
                                <input
                                  type="checkbox"
                                  aria-label={`เลือกรายการของ ${r.fullName} วันที่ ${r.date}`}
                                  checked={isChecked}
                                  onChange={() => toggleSelectRow(r.key)}
                                  className="rounded text-indigo-600 cursor-pointer"
                                />
                              </td>
                              <td className="py-2.5 px-2.5 font-mono whitespace-nowrap">
                                {formatDateDisplay(r.date)} ({r.dayOfWeek})
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">
                                {r.fullName}{' '}
                                <span className="text-slate-500 font-normal">
                                  ({r.nickname})
                                </span>
                              </td>
                              <td className="py-2.5 px-2.5 text-slate-600">
                                <div>{r.position}</div>
                                <div className="text-[11px] text-slate-400">
                                  {r.department}
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5 text-center font-mono text-slate-600 bg-slate-50">
                                เข้า {r.originalScanIn} / ออก {r.originalScanOut}
                              </td>
                              <td className="py-2.5 px-2.5 text-center font-mono font-bold text-indigo-900">
                                เข้า {r.effectiveScanIn} / ออก{' '}
                                {r.effectiveScanOut}
                              </td>
                              <td className="py-2.5 px-2.5 space-y-1">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                    r.scanStatus === 'คาดว่าไปพบลูกค้า'
                                      ? 'bg-sky-100 text-sky-800'
                                      : r.scanStatus ===
                                        'พบสแกนเข้า แต่ไม่พบสแกนออก'
                                      ? 'bg-amber-100 text-amber-800'
                                      : r.scanStatus === 'ครบปกติ'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {r.scanStatus}
                                </span>
                                {r.lateMinutes > 0 && (
                                  <div className="text-rose-600 font-bold">
                                    สาย {r.lateCount} ครั้ง ({r.lateMinutes}{' '}
                                    นาที)
                                  </div>
                                )}
                                {r.suspiciousScanWarning && (
                                  <div className="p-1.5 rounded bg-rose-100 border border-rose-300 text-rose-900 font-semibold text-[11px]">
                                    {r.suspiciousScanWarning}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5">
                                <div className="font-medium text-slate-800">
                                  {r.hrNote || r.sheetNote || '-'}
                                </div>
                                {(r.updatedAt || r.reviewedAt) && (
                                  <div className="text-[10px] text-indigo-700 mt-0.5">
                                    โดย {r.updatedBy || r.reviewedBy || 'HR'} เมื่อ{' '}
                                    {r.updatedAt || r.reviewedAt}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5 text-center no-print">
                                <div className="inline-flex flex-wrap items-center justify-center gap-1">
                                  {/* 1. ปุ่มแก้ไข */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenEditDaily(r, 'full')
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                                    title="แก้ไขเวลาเข้า-ออกหรือสถานะ พร้อมดูผลกระทบก่อนบันทึก"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    แก้ไข
                                  </button>

                                  {/* 2. ปุ่มใส่หมายเหตุ */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenEditDaily(r, 'note_only')
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                                    title="เพิ่มหรือแก้ไขหมายเหตุ HR"
                                  >
                                    <MessageSquarePlus className="w-3 h-3" />
                                    ใส่หมายเหตุ
                                  </button>

                                  {/* 3. ปุ่มทำเครื่องหมายว่าตรวจแล้ว */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleReviewed(r)}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold cursor-pointer ${
                                      r.isReviewed
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                                    }`}
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    {r.isReviewed ? 'ตรวจแล้ว' : 'ทำเครื่องหมายตรวจแล้ว'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* MENU 3: เวลาเข้างาน (Attendance & Original Scans & History) */}
          {/* ===================================================================== */}
          {activeSection === 'attendance_time' && (
            <AttendanceTimeView
              auditResult={auditResult}
              selectedYearMonth={selectedYearMonth}
              reportMode={reportMode}
              employeeMappings={employeeMappings}
              hrOverrides={hrOverrides}
              onEditDailyRecord={(rec) => handleOpenEditDaily(rec, 'full')}
              onQuickNoteDailyRecord={(rec) =>
                handleOpenEditDaily(rec, 'note_only')
              }
              onToggleReviewed={handleToggleReviewed}
              onResetSingleOverride={async (key) => {
                const next = { ...hrOverrides };
                delete next[key];
                setHrOverrides(next);
                await triggerSaveState(
                  employeeMappings,
                  quotaRecords,
                  leaveRecords,
                  next,
                  settings
                );
              }}
            />
          )}

          {/* ===================================================================== */}
          {/* MENU 4: การลาและสิทธิ (Leave & Quota Management) */}
          {/* ===================================================================== */}
          {activeSection === 'leave_and_quota' && (
            <LeaveAndQuotaView
              auditResult={auditResult}
              selectedYearMonth={selectedYearMonth}
              reportMode={reportMode}
              employeeMappings={employeeMappings}
              onOpenAddLeaveModal={() => setIsAddLeaveModalOpen(true)}
            />
          )}

          {/* ===================================================================== */}
          {/* MENU 5: พนักงานและตั้งค่า (Employees, Mapping & Company Rules) */}
          {/* ===================================================================== */}
          {activeSection === 'employees_settings' && (
            <EmployeesAndSettingsView
              employeeMappings={employeeMappings}
              onUpdateMappings={async (next) => {
                setEmployeeMappings(next);
                await triggerSaveState(
                  next,
                  quotaRecords,
                  leaveRecords,
                  hrOverrides,
                  settings
                );
              }}
              settings={settings}
              onlyMappedEmployees={onlyMappedEmployees}
              onConfirmSettingsChange={async (nextSettings, nextOnlyMapped) => {
                setSettings(nextSettings);
                setOnlyMappedEmployees(nextOnlyMapped);
                await triggerSaveState(
                  employeeMappings,
                  quotaRecords,
                  leaveRecords,
                  hrOverrides,
                  nextSettings
                );
              }}
              auditResult={auditResult}
              selectedYearMonth={selectedYearMonth}
              attendanceRows={attendanceRows}
              leaveRecords={leaveRecords}
              quotaRecords={quotaRecords}
              hrOverrides={hrOverrides}
              onOpenFirebaseModal={() => setIsFirebaseModalOpen(true)}
              lastSyncTimeText={lastSyncTimeText}
            />
          )}

          {/* ===================================================================== */}
          {/* รายงานเพิ่มเติม (All-in-One สำหรับส่งออก/พิมพ์ครบทุกตารางในหน้าเดียว) */}
          {/* ===================================================================== */}
          {activeSection === 'extra_all_in_one' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between flex-wrap gap-3 no-print">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    รายงานเพิ่มเติม (All-in-One ครบทุกตารางสำหรับตรวจสอบและพิมพ์)
                  </h2>
                  <p className="text-xs text-slate-600">
                    รวมตารางเวลาเข้างานสาย เบี้ยขยัน การลา และสิทธิคงเหลือไว้ในหน้าเดียวสำหรับการพิมพ์ออกทางเครื่องพิมพ์
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSection('overview_payroll')}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  กลับสู่หน้าภาพรวมเงินเดือน
                </button>
              </div>

              <AttendanceTimeView
                auditResult={auditResult}
                selectedYearMonth={selectedYearMonth}
                reportMode={reportMode}
                employeeMappings={employeeMappings}
                hrOverrides={hrOverrides}
                onEditDailyRecord={(rec) => handleOpenEditDaily(rec, 'full')}
                onQuickNoteDailyRecord={(rec) =>
                  handleOpenEditDaily(rec, 'note_only')
                }
                onToggleReviewed={handleToggleReviewed}
                onResetSingleOverride={async () => {}}
              />

              <LeaveAndQuotaView
                auditResult={auditResult}
                selectedYearMonth={selectedYearMonth}
                reportMode={reportMode}
                employeeMappings={employeeMappings}
                onOpenAddLeaveModal={() => setIsAddLeaveModalOpen(true)}
              />
            </div>
          )}
        </main>
      </div>

      {/* ===================================================================== */}
      {/* MOBILE BOTTOM NAVIGATION BAR (4 ปุ่ม: ภาพรวม | ต้องตรวจ | รายงาน | ตั้งค่า) */}
      {/* ===================================================================== */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-40 no-print"
        aria-label="เมนูล่างสำหรับมือถือ"
      >
        <div className="grid grid-cols-4 h-16">
          <button
            type="button"
            onClick={() => setActiveSection('overview_payroll')}
            className={`flex flex-col items-center justify-center gap-1 text-xs font-bold cursor-pointer ${
              activeSection === 'overview_payroll'
                ? 'text-indigo-600 bg-indigo-50/50'
                : 'text-slate-600'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>ภาพรวม</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('review_items')}
            className={`relative flex flex-col items-center justify-center gap-1 text-xs font-bold cursor-pointer ${
              activeSection === 'review_items'
                ? 'text-indigo-600 bg-indigo-50/50'
                : 'text-slate-600'
            }`}
          >
            <ShieldAlert className="w-5 h-5" />
            <span>ต้องตรวจ</span>
            {unreviewedAnomalyCount > 0 && (
              <span className="absolute top-1.5 right-5 px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px]">
                {unreviewedAnomalyCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveSection(
                activeSection === 'attendance_time'
                  ? 'leave_and_quota'
                  : 'attendance_time'
              )
            }
            className={`flex flex-col items-center justify-center gap-1 text-xs font-bold cursor-pointer ${
              activeSection === 'attendance_time' ||
              activeSection === 'leave_and_quota'
                ? 'text-indigo-600 bg-indigo-50/50'
                : 'text-slate-600'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>รายงาน</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('employees_settings')}
            className={`flex flex-col items-center justify-center gap-1 text-xs font-bold cursor-pointer ${
              activeSection === 'employees_settings'
                ? 'text-indigo-600 bg-indigo-50/50'
                : 'text-slate-600'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>ตั้งค่า</span>
          </button>
        </div>
      </nav>

      {/* ===================================================================== */}
      {/* MODAL 0: แสดงผลกระทบก่อนบันทึกการแก้ไขแบบกลุ่ม (Bulk Edit Impact Preview) */}
      {/* ===================================================================== */}
      {isBulkPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                  ตรวจสอบผลกระทบต่อเงินเดือนก่อนบันทึก
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                  เปรียบเทียบผลกระทบก่อนบันทึกการแก้ไขแบบกลุ่ม (เลือก{' '}
                  {selectedKeys.length} รายการ)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkPreviewOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm">
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
                <div className="font-semibold text-rose-900">
                  1. รายการผิดปกติคงเหลือ
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-slate-500 line-through">
                    {auditResult.scanAnomalyRecords.length} รายการ
                  </span>
                  <span className="text-lg font-extrabold text-emerald-700">
                    → เหลือ {previewAuditResult.scanAnomalyRecords.length}{' '}
                    รายการ
                  </span>
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
                    เดิม {auditResult.activityGrandTotal.diligenceEligibleCount}{' '}
                    คน
                  </span>
                  <span className="text-lg font-extrabold text-emerald-700">
                    → ใหม่{' '}
                    {
                      previewAuditResult.activityGrandTotal
                        .diligenceEligibleCount
                    }{' '}
                    คน
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 font-semibold">วันที่</th>
                    <th className="py-2 px-3 font-semibold">พนักงาน</th>
                    <th className="py-2 px-3 font-semibold">ก่อนแก้ไข</th>
                    <th className="py-2 px-3 font-semibold">หลังแก้ไข</th>
                    <th className="py-2 px-3 font-semibold">หมายเหตุ HR</th>
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
                type="button"
                onClick={() => setIsBulkPreviewOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkSave}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer"
              >
                ยืนยันและบันทึกทั้ง {selectedKeys.length} รายการ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: แก้ไข / ใส่หมายเหตุรายวันเดี่ยว พร้อมแสดงผลกระทบต่อเบี้ยขยัน/เงินเดือนก่อนบันทึก */}
      {/* ===================================================================== */}
      {editingDailyRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingMode === 'note_only'
                    ? 'บันทึกหมายเหตุการตรวจสอบของ HR'
                    : 'แก้ไขเวลา / สถานะรายวัน (พร้อมดูผลกระทบต่อเงินเดือนก่อนบันทึก)'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingDailyRecord.fullName} ({editingDailyRecord.nickname})
                  — วันที่ {formatDateDisplay(editingDailyRecord.date, true)}
                </p>
              </div>
              <button
                type="button"
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
              <span className="text-emerald-700 font-semibold">
                เก็บข้อมูลต้นฉบับไว้เสมอ
              </span>
            </div>

            {editingMode === 'full' && (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      เวลาเข้างานที่ปรับแก้
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
                      เวลาออกงานที่ปรับแก้
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
                    <option value="คาดว่าไปพบลูกค้า">
                      คาดว่าไปพบลูกค้า (ฝ่ายขาย)
                    </option>
                    <option value="ลาเต็มวัน/มีข้อมูลการลา">
                      ลาเต็มวัน/มีข้อมูลการลา
                    </option>
                    <option value="พบสแกนเข้า แต่ไม่พบสแกนออก">
                      พบสแกนเข้า แต่ไม่พบสแกนออก
                    </option>
                    <option value="ไม่พบสแกนเข้า แต่พบสแกนออก">
                      ไม่พบสแกนเข้า แต่พบสแกนออก
                    </option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      กำหนดจำนวนครั้งที่สายเอง
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      placeholder="คำนวณอัตโนมัติ"
                      value={overrideLateCountInput}
                      onChange={(e) =>
                        setOverrideLateCountInput(e.target.value)
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      กำหนดนาทีสายเอง
                    </label>
                    <input
                      type="number"
                      min={0}
                      placeholder="คำนวณอัตโนมัติ"
                      value={overrideLateMinutesInput}
                      onChange={(e) =>
                        setOverrideLateMinutesInput(e.target.value)
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm">
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  หมายเหตุจาก HR
                </label>
                <input
                  type="text"
                  placeholder="ระบุเหตุผล เช่น ลืมสแกนออก, พบลูกค้า, ยืนยันเวลาเข้างาน..."
                  value={overrideNoteInput}
                  onChange={(e) => setOverrideNoteInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  ชื่อผู้แก้ไข/ตรวจสอบ
                </label>
                <input
                  type="text"
                  value={overrideReviewerInput}
                  onChange={(e) => setOverrideReviewerInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* แสดงผลกระทบต่อเบี้ยขยันและนาทีสายของพนักงานคนนี้ก่อนบันทึก! */}
            {simulatedSingleRecordAudit && (
              <div className="p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200 space-y-2 text-xs">
                <div className="font-bold text-indigo-950">
                  ผลกระทบต่อเบี้ยขยันและเงินเดือนของ {editingDailyRecord.fullName}{' '}
                  ก่อนบันทึก:
                </div>
                {(() => {
                  const beforeDil = auditResult.diligenceReport.find(
                    (d) => d.empCode === editingDailyRecord.empCode
                  );
                  const afterDil =
                    simulatedSingleRecordAudit.diligenceReport.find(
                      (d) => d.empCode === editingDailyRecord.empCode
                    );
                  const beforeLate = auditResult.lateSummaryReport.find(
                    (l) => l.empCode === editingDailyRecord.empCode
                  );
                  const afterLate =
                    simulatedSingleRecordAudit.lateSummaryReport.find(
                      (l) => l.empCode === editingDailyRecord.empCode
                    );
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded bg-white border border-indigo-100">
                        <div className="text-slate-500">เวลาสายสะสมในเดือน:</div>
                        <div className="font-bold text-slate-900 mt-0.5">
                          เดิม {beforeLate?.lateCount || 0} ครั้ง (
                          {beforeLate?.lateMinutes || 0} น.) →{' '}
                          <span className="text-indigo-700">
                            ใหม่ {afterLate?.lateCount || 0} ครั้ง (
                            {afterLate?.lateMinutes || 0} น.)
                          </span>
                        </div>
                      </div>
                      <div className="p-2 rounded bg-white border border-indigo-100">
                        <div className="text-slate-500">สิทธิ์เบี้ยขยัน:</div>
                        <div className="font-bold mt-0.5">
                          เดิม{' '}
                          {beforeDil?.isEligible ? 'ได้รับ ✓' : 'ไม่ได้รับ'} →{' '}
                          <span
                            className={
                              afterDil?.isEligible
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }
                          >
                            ใหม่{' '}
                            {afterDil?.isEligible ? 'ได้รับ ✓' : 'ไม่ได้รับ'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingDailyRecord(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveDailyOverride}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                ยืนยันและบันทึกข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: นำเข้าไฟล์ Excel / CSV */}
      {/* ===================================================================== */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                นำเข้าไฟล์บันทึกเวลาเข้างาน หรือ แบบฟอร์มลาออนไลน์
              </h3>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p>
                รองรับไฟล์ Excel (<code>.xlsx</code>, <code>.xls</code>) และ{' '}
                <code>.csv</code> โดยระบบตรวจสอบรูปแบบวันที่ทั้ง{' '}
                <code>YYYY-MM-DD</code> และ <code>DD/MM/YYYY</code> อัตโนมัติ
              </p>
            </div>

            <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-300 rounded-xl p-6 bg-indigo-50/40 hover:bg-indigo-50 transition cursor-pointer">
              <Upload className="w-8 h-8 text-indigo-600 mb-2" />
              <span className="text-sm font-semibold text-indigo-900">
                คลิกเพื่อเลือกไฟล์ Excel หรือ CSV
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
                type="button"
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
      {/* MODAL 3: เพิ่มใบลาใหม่ */}
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
                เพิ่มใบลาพนักงาน
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
                    <option value="ลาอื่นๆ">ลาอื่น ๆ</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    จำนวนชั่วโมงที่ลา (8 ชม. = 1 วัน)
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
                  เหตุผลการลา
                </label>
                <input
                  type="text"
                  placeholder="เช่น พบแพทย์, ติดธุระ..."
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
      {/* MODAL 4: ตั้งค่าการเชื่อมต่อฐานข้อมูลสำรอง */}
      {/* ===================================================================== */}
      {isFirebaseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                ตั้งค่าการซิงก์ฐานข้อมูลคลาวด์สำรอง
              </h3>
              <button
                type="button"
                onClick={() => setIsFirebaseModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              สถานะปัจจุบัน: <strong>{lastSyncTimeText}</strong>
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
                type="button"
                onClick={() => setIsFirebaseModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
              <button
                type="button"
                onClick={async () => {
                  saveFirebaseConfigToLocal(firebaseConfigInput);
                  await triggerSaveState();
                  setIsFirebaseModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                บันทึกและซิงก์ทันที
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
