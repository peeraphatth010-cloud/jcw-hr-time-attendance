export interface LeaveQuotaItem {
  entitled: number;
  used: number;
  remaining: number;
}

export interface EmployeeQuotas {
  sick: LeaveQuotaItem;
  personal: LeaveQuotaItem;
  vacation: LeaveQuotaItem;
  other: LeaveQuotaItem;
}

export interface EmployeeProfile {
  key: string; // unique internal key e.g. empCode or personId+name
  empCode: string;
  prefix: string;
  firstName: string;
  lastName: string;
  fullName: string;
  department: string;
  position: string;
  email: string;
  personId: string; // ID บุคคล from mapping
  scannerNames: string[]; // Nicknames/names in fingerprint scanner
  isSales: boolean;
  isActive: boolean; // true for current 13 mapped employees, false for historical unmapped
  quotas: EmployeeQuotas;
}

export interface RawScanRecord {
  id: string;
  rowNum: string;
  personId: string;
  scannerName: string;
  empKey: string; // resolved employee key
  department: string;
  position: string;
  gender: string;
  date: string; // YYYY-MM-DD (CE)
  dayOfWeek: string;
  schedule: string;
  scanIn: string; // HH:mm:ss or ""
  scanOut: string; // HH:mm:ss or ""
  sheetLateCount: number;
  sheetLateMinutes: number;
  sheetSick: number;
  sheetPersonal: number;
  sheetVacation: number;
  sheetUnpaid: number;
  sheetNote: string;
  monthKey: string; // YYYY-MM
}

export type LeaveCategory = 'ลาป่วย' | 'ลากิจ' | 'ลาพักร้อน' | 'ลาไม่รับค่าจ้าง' | 'ลาอื่นๆ';

export interface LeaveFormRecord {
  id: string;
  timestamp: string;
  prefixName: string;
  firstName: string;
  lastName: string;
  fullName: string;
  empCode: string;
  empKey: string;
  startWorkDate: string;
  department: string;
  position: string;
  rawLeaveType: string; // ลาป่วย | ลากิจ | ลาพักร้อน | ลาอื่นๆ
  effectiveCategory: LeaveCategory;
  startDate: string; // YYYY-MM-DD (CE)
  endDate: string; // YYYY-MM-DD (CE)
  hours: number;
  reason: string;
  status: 'อนุมัติ' | 'รออนุมัติ' | 'ไม่อนุมัติ' | string;
  approvedAt: string;
  calculatedDays: number; // hours / 8
  isUnpaidLeave: boolean;
  isCarryoverOrTest: boolean; // true if reason indicates prior cumulative entry or system test
  excludeFromMonthlyUsage: boolean; // controllable by HR
}

export interface HROverrideRecord {
  key: string; // `${empKey}_${date}`
  empKey: string;
  date: string;
  overrideScanIn?: string; // HH:mm:ss
  overrideScanOut?: string; // HH:mm:ss
  overrideStatus?: 'auto' | 'normal' | 'client_visit' | 'excused_late' | 'holiday';
  overrideLeaveCategory?: LeaveCategory | '';
  overrideLeaveDays?: number;
  hrNote: string;
  updatedAt: string;
  updatedBy: string;
}

export interface DailyLeaveEntry {
  source: 'form' | 'sheet' | 'hr_override';
  category: LeaveCategory;
  days: number;
  hours: number;
  reason: string;
  date: string;
  formId?: string;
  status?: string;
}

export type ScanAuditStatus =
  | 'complete'
  | 'sales_client_visit'
  | 'missing_both_with_leave'
  | 'missing_both_no_leave'
  | 'missing_in_has_out'
  | 'has_in_missing_out'
  | 'holiday_or_off';

export interface DailyEvaluatedRecord {
  empKey: string;
  employee: EmployeeProfile;
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  rawScan?: RawScanRecord;
  hrOverride?: HROverrideRecord;
  // Original vs Effective Scan
  originalScanIn: string;
  originalScanOut: string;
  effectiveScanIn: string;
  effectiveScanOut: string;
  hasIn: boolean;
  hasOut: boolean;
  // Sales & Threshold logic
  isSales: boolean;
  prevWorkdayWasClientVisit: boolean;
  lateThreshold: '08:15' | '09:00';
  // Late evaluation
  isLate: boolean;
  lateCount: number;
  lateMinutes: number;
  isOnTimeForIncentive: boolean; // <= 08:00:00
  // Leave evaluation on this date
  leaves: DailyLeaveEntry[];
  sickDays: number;
  personalDays: number;
  vacationDays: number;
  unpaidDays: number;
  otherDays: number;
  totalLeaveDays: number;
  // Scan completeness & JCW Business Rules Status
  auditStatus: ScanAuditStatus;
  statusLabel: string;
  auditAlertMessage: string;
  combinedNote: string;
}

export interface MonthlyEmployeeSummary {
  empKey: string;
  employee: EmployeeProfile;
  monthKey: string; // YYYY-MM
  dailyRecords: DailyEvaluatedRecord[];
  workedDaysCount: number;
  // 1. เบี้ยขยัน (Diligence Allowance)
  incentiveEligible: boolean;
  allWorkedDaysBefore8: boolean;
  daysAfter8List: { date: string; scanIn: string }[];
  disqualifyReasons: string[];
  // 2. การมาสาย (Lateness)
  totalLateCount: number;
  totalLateMinutes: number;
  lateDaysDetail: {
    date: string;
    scanIn: string;
    threshold: string;
    minutes: number;
    note: string;
  }[];
  // 3. ลาไม่รับค่าจ้าง และ ลาอื่นๆ
  unpaidDays: number;
  unpaidHours: number;
  otherDays: number;
  otherHours: number;
  unpaidAndOtherList: DailyLeaveEntry[];
  // 4. รายละเอียดการใช้สิทธิในเดือน
  allLeavesInMonth: DailyLeaveEntry[];
  // 5. สรุปกิจกรรมการลาและสาย
  sickDays: number;
  sickHours: number;
  personalDays: number;
  personalHours: number;
  vacationDays: number;
  vacationHours: number;
  totalLeaveDays: number;
  totalLeaveHours: number;
  // 6. สิทธิคงเหลือ
  quotas: EmployeeQuotas;
  // 7. ความผิดปกติสแกนนิ้ว / ฝ่ายขายพบลูกค้า
  missingBothNoLeaveCount: number;
  missingInCount: number;
  missingOutCount: number;
  salesClientVisitCount: number;
  anomalyRecords: DailyEvaluatedRecord[];
}

export type LeaveSourceMode = 'hybrid' | 'form_only' | 'sheet_only';
export type IncentiveEightRule = 'strict_08_00_00' | 'minute_08_00_59';
export type LateMinuteCalcRule = 'truncate_seconds' | 'ceil_seconds';

export interface AuditSettings {
  leaveSourceMode: LeaveSourceMode;
  includeCarryoverLeavesInMonthly: boolean;
  incentiveEightRule: IncentiveEightRule;
  lateMinuteCalcRule: LateMinuteCalcRule;
  onlyActiveMappedEmployees: boolean;
  autoIgnoreEmptyCompanyDays: boolean;
  customHolidays: string[]; // YYYY-MM-DD
}
