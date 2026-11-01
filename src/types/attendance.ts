export type LeaveCategory =
  | 'ลาป่วย'
  | 'ลากิจ'
  | 'ลาพักร้อน'
  | 'ลาไม่รับค่าจ้าง'
  | 'ลาอื่นๆ';

export interface EmployeeMapping {
  personId: string;
  scannerName: string;
  empCode: string;
  fullName: string;
  nickname: string;
  department: string;
}

export interface RawAttendanceRow {
  id: string;
  sheetMonth: string;
  rowNumber: number;
  personId: string;
  scannerName: string;
  companyDept: string;
  position: string;
  gender: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  schedule: string;
  scanIn: string;
  scanOut: string;
  sheetLateCount: number | null;
  sheetLateMinutes: number | null;
  sheetSickLeave: number | null;
  sheetPersonalLeave: number | null;
  sheetVacationLeave: number | null;
  sheetUnpaidLeave: number | null;
  sheetNote: string;
}

export interface LeaveFormRecord {
  id: string;
  timestamp: string;
  fullName: string;
  nickname: string;
  empCode: string;
  position: string;
  department: string;
  leaveType: LeaveCategory;
  reason: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  hours: number;
  days: number;
  attachmentUrl: string;
  status: string;
  approvedDate: string;
  note: string;
  isUnpaidLeave: boolean;
  isHistoricalCarryover: boolean;
}

export interface EmployeeQuotaRecord {
  empCode: string;
  fullName: string;
  nickname: string;
  department: string;
  sickQuotaDays: number;
  personalQuotaDays: number;
  vacationQuotaDays: number;
  otherQuotaDays: number;
  sickUsedDays: number;
  personalUsedDays: number;
  vacationUsedDays: number;
  otherUsedDays: number;
  sickRemainingDays: number;
  personalRemainingDays: number;
  vacationRemainingDays: number;
  otherRemainingDays: number;
}

export interface HROverrideRecord {
  key: string;
  empKey: string;
  date: string;
  overrideScanIn?: string;
  overrideScanOut?: string;
  overrideStatus?: DailyAuditRecord['scanStatus'];
  overrideLateCount?: number | null;
  overrideLateMinutes?: number | null;
  hrNote: string;
  updatedAt: string;
}

export interface AuditSettings {
  onlyApprovedLeaves: boolean;
  excludeCarryoverLeaves: boolean;
  includeSheetLeaves: boolean;
  customHolidays: string[];
}

export interface DailyAuditRecord {
  key: string;
  date: string;
  dayOfWeek: string;
  empCode: string;
  personId: string;
  scannerName: string;
  fullName: string;
  nickname: string;
  department: string;
  isSales: boolean;
  originalScanIn: string;
  originalScanOut: string;
  effectiveScanIn: string;
  effectiveScanOut: string;
  hasIn: boolean;
  hasOut: boolean;
  scanStatus:
    | 'ครบปกติ'
    | 'ลาเต็มวัน/มีข้อมูลการลา'
    | 'คาดว่าไปพบลูกค้า'
    | 'พบสแกนเข้า แต่ไม่พบสแกนออก'
    | 'ไม่พบสแกนเข้า แต่พบสแกนออก'
    | 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา';
  alertMessage: string;
  salesStatus: '' | 'คาดว่าไปพบลูกค้า';
  isNextDayAfterClientVisit: boolean;
  lateRuleApplied:
    | 'ปกติ (08:15)'
    | 'อนุโลม (08:01-08:15 เสียเบี้ยขยัน)'
    | 'อนุโลมฝ่ายขาย (09:00)';
  lateCount: number;
  lateMinutes: number;
  sickLeaveDays: number;
  personalLeaveDays: number;
  vacationLeaveDays: number;
  unpaidLeaveDays: number;
  otherLeaveDays: number;
  totalLeaveDaysOnDate: number;
  leaveDetails: string[];
  sheetNote: string;
  hrNote: string;
  hasHROverride: boolean;
}

export interface DiligenceReportItem {
  empCode: string;
  personId: string;
  fullName: string;
  nickname: string;
  department: string;
  isSales: boolean;
  isEligible: boolean;
  totalWorkdays: number;
  daysWorked: number;
  daysScanAfter0800: number;
  totalLeaveDays: number;
  disqualifyReasons: string[];
}

export interface LateSummaryReportItem {
  empCode: string;
  personId: string;
  fullName: string;
  nickname: string;
  department: string;
  lateCount: number;
  lateMinutes: number;
  dailyDetails: {
    date: string;
    scanIn: string;
    lateMinutes: number;
    rule: string;
    note: string;
  }[];
}

export interface UnpaidAndOtherLeaveReportItem {
  empCode: string;
  personId: string;
  fullName: string;
  nickname: string;
  department: string;
  unpaidDays: number;
  unpaidHours: number;
  otherDays: number;
  otherHours: number;
  totalDays: number;
  totalHours: number;
  details: {
    date: string;
    type: 'ลาไม่รับค่าจ้าง' | 'ลาอื่นๆ';
    days: number;
    hours: number;
    reason: string;
  }[];
}

export interface MonthlyLeaveUsageReportItem {
  id: string;
  empCode: string;
  personId: string;
  fullName: string;
  nickname: string;
  department: string;
  leaveType: LeaveCategory;
  isUnpaid: boolean;
  startDate: string;
  endDate: string;
  hours: number;
  days: number;
  reason: string;
  status: string;
  note: string;
  source: string;
  isHistoricalCarryover: boolean;
}

export interface MonthlyActivitySummaryItem {
  empCode: string;
  personId: string;
  fullName: string;
  nickname: string;
  department: string;
  sickDays: number;
  sickHours: number;
  personalDays: number;
  personalHours: number;
  vacationDays: number;
  vacationHours: number;
  unpaidDays: number;
  unpaidHours: number;
  otherDays: number;
  otherHours: number;
  totalLeaveDays: number;
  totalLeaveHours: number;
  lateCount: number;
  lateMinutes: number;
  diligenceEligible: boolean;
}

export interface QuotaReportItem {
  empCode: string;
  personId: string;
  fullName: string;
  nickname: string;
  department: string;
  sickQuota: number;
  sickUsedTotal: number;
  sickRemaining: number;
  personalQuota: number;
  personalUsedTotal: number;
  personalRemaining: number;
  vacationQuota: number;
  vacationUsedTotal: number;
  vacationRemaining: number;
  otherQuota: number;
  otherUsedTotal: number;
  otherRemaining: number;
  monthSickUsed: number;
  monthPersonalUsed: number;
  monthVacationUsed: number;
  monthOtherAndUnpaidUsed: number;
}

export interface MonthlyAuditOutput {
  yearMonth: string;
  workdaysInMonth: string[];
  dailyRecords: DailyAuditRecord[];
  diligenceReport: DiligenceReportItem[];
  lateSummaryReport: LateSummaryReportItem[];
  unpaidAndOtherLeaveReport: UnpaidAndOtherLeaveReportItem[];
  monthlyLeaveUsageReport: MonthlyLeaveUsageReportItem[];
  activitySummaryReport: MonthlyActivitySummaryItem[];
  activityGrandTotal: {
    sickDays: number;
    sickHours: number;
    personalDays: number;
    personalHours: number;
    vacationDays: number;
    vacationHours: number;
    unpaidDays: number;
    unpaidHours: number;
    otherDays: number;
    otherHours: number;
    totalLeaveDays: number;
    totalLeaveHours: number;
    lateCount: number;
    lateMinutes: number;
    diligenceEligibleCount: number;
  };
  quotaReport: QuotaReportItem[];
  scanAnomalyRecords: DailyAuditRecord[];
}
