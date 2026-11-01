import {
  AuditSettings,
  DailyAuditRecord,
  DiligenceReportItem,
  EmployeeMapping,
  EmployeeQuotaRecord,
  HROverrideRecord,
  LateSummaryReportItem,
  LeaveFormRecord,
  MonthlyActivitySummaryItem,
  MonthlyAuditOutput,
  MonthlyLeaveUsageReportItem,
  QuotaReportItem,
  RawAttendanceRow,
  ReconciliationCheckItem,
  UnpaidAndOtherLeaveReportItem,
} from '../types/attendance';
import {
  calculateSalesNextDayLate,
  calculateStandardLate,
  formatLeaveHuman,
  getThaiDayOfWeek,
  getWeekdaysInRange,
  inspectLeaveDateRange,
  isWeekday,
  round2,
} from './dateAndTime';

export interface ResolvedEmployee {
  empKey: string;
  empCode: string;
  personId: string;
  scannerName: string;
  fullName: string;
  nickname: string;
  department: string;
  position: string;
  isSales: boolean;
  isExcludedFromDiligenceByPos: boolean;
  isMappedOfficial: boolean;
}

/**
 * ตรวจสอบว่าตำแหน่งงานนี้ถูกยกเว้นสิทธิเบี้ยขยันหรือไม่
 * กฎบริษัท: พนักงานฝ่ายขายมีสิทธิได้รับเบี้ยขยัน ยกเว้นตำแหน่ง "เจ้าหน้าที่ฝ่ายขาย" (หรือ "เจ้าหน้าที่ขาย")
 */
export function isPositionExcludedFromDiligence(position: string): boolean {
  const pos = (position || '').replace(/\s+/g, '');
  return (
    pos === 'เจ้าหน้าที่ฝ่ายขาย' ||
    pos === 'เจ้าหน้าที่ขาย' ||
    pos.includes('เจ้าหน้าที่ฝ่ายขาย') ||
    pos.includes('เจ้าหน้าที่ขาย')
  );
}

/**
 * จับคู่พนักงานจากข้อมูลสแกนนิ้ว (personId + scannerName) เข้ากับตาราง ID บุคคลสำหรับเชื่อมต่อ (ใช้ภายในระบบ)
 */
export function resolveEmployeeFromScan(
  personId: string,
  scannerName: string,
  mappings: EmployeeMapping[]
): ResolvedEmployee {
  const pid = (personId || '').trim();
  const sName = (scannerName || '').trim();
  const sNameLower = sName.toLowerCase();

  // กรณีพิเศษจากข้อมูลจริง: "อนุชิต" ในชีต ม.ค.-ส.ค. มักถูกพิมพ์ต่อท้ายตารางโดยติด ID บุคคลของคนอื่น
  if (sName === 'อนุชิต' || sNameLower === 'anuchit') {
    const anuchit = mappings.find(
      (m) => m.scannerName === 'อนุชิต' || m.empCode === '010666001'
    );
    if (anuchit) {
      const pos = anuchit.position || 'พนักงานคลังสินค้า';
      return {
        empKey: anuchit.empCode,
        empCode: anuchit.empCode,
        personId: anuchit.personId,
        scannerName: anuchit.scannerName,
        fullName: anuchit.fullName,
        nickname: anuchit.nickname,
        department: anuchit.department,
        position: pos,
        isSales: (anuchit.department || '').includes('ขาย'),
        isExcludedFromDiligenceByPos: isPositionExcludedFromDiligence(pos),
        isMappedOfficial: true,
      };
    }
  }

  // กรณีพิเศษ: "Fah" ในชีต 10 มีทั้ง ID 24 (มีข้อมูลสแกนจริง) และ ID 27 (ว่างทั้งหมด) ให้รวมเป็น นันทวัน ดีชื่น (Fah)
  if (sNameLower === 'fah') {
    const fah = mappings.find(
      (m) => (m.scannerName || '').toLowerCase() === 'fah'
    );
    if (fah) {
      const pos = fah.position || 'เจ้าหน้าที่ประสานงานขาย';
      return {
        empKey: fah.empCode || '010969001',
        empCode: fah.empCode || '010969001',
        personId: fah.personId || '24',
        scannerName: fah.scannerName || 'Fah',
        fullName: fah.fullName || 'นันทวัน ดีชื่น',
        nickname: fah.nickname || 'Fah',
        department: fah.department || 'ฝ่ายขาย',
        position: pos,
        isSales: (fah.department || 'ฝ่ายขาย').includes('ขาย'),
        isExcludedFromDiligenceByPos: isPositionExcludedFromDiligence(pos),
        isMappedOfficial: true,
      };
    }
  }

  // 1. จับคู่ตรงทั้ง personId และ scannerName
  const exactMatch = mappings.find(
    (m) =>
      m.personId === pid &&
      ((m.scannerName || '').toLowerCase() === sNameLower ||
        (m.nickname || '').toLowerCase() === sNameLower)
  );
  if (exactMatch) {
    const pos = exactMatch.position || '-';
    return {
      empKey: exactMatch.empCode || exactMatch.personId,
      empCode: exactMatch.empCode || exactMatch.personId,
      personId: exactMatch.personId || '-',
      scannerName: exactMatch.scannerName || sName,
      fullName: exactMatch.fullName || sName,
      nickname: exactMatch.nickname || sName,
      department: exactMatch.department || 'ฝ่ายแอดมิน',
      position: pos,
      isSales: (exactMatch.department || '').includes('ขาย'),
      isExcludedFromDiligenceByPos: isPositionExcludedFromDiligence(pos),
      isMappedOfficial: true,
    };
  }

  // 2. จับคู่ด้วยชื่อในเครื่องสแกนนิ้ว (scannerName)
  const nameMatch = mappings.find(
    (m) =>
      (m.scannerName || '').toLowerCase() === sNameLower ||
      (sNameLower.length > 2 &&
        Boolean(m.scannerName) &&
        (m.scannerName || '').toLowerCase().startsWith(sNameLower))
  );
  if (nameMatch) {
    const pos = nameMatch.position || '-';
    return {
      empKey: nameMatch.empCode || nameMatch.personId,
      empCode: nameMatch.empCode || nameMatch.personId,
      personId: nameMatch.personId || '-',
      scannerName: nameMatch.scannerName || sName,
      fullName: nameMatch.fullName || sName,
      nickname: nameMatch.nickname || sName,
      department: nameMatch.department || 'ฝ่ายแอดมิน',
      position: pos,
      isSales: (nameMatch.department || '').includes('ขาย'),
      isExcludedFromDiligenceByPos: isPositionExcludedFromDiligence(pos),
      isMappedOfficial: true,
    };
  }

  // 3. จับคู่ด้วย personId (เฉพาะกรณีที่ไม่ใช่ ID ซ้ำอย่าง Sean/Dom)
  if (pid && pid !== '0') {
    const idMatch = mappings.find((m) => m.personId === pid);
    if (idMatch && !(pid === '24' && sNameLower === 'sean')) {
      const pos = idMatch.position || '-';
      return {
        empKey: idMatch.empCode || idMatch.personId,
        empCode: idMatch.empCode || idMatch.personId,
        personId: idMatch.personId || '-',
        scannerName: sName || idMatch.scannerName || '-',
        fullName: idMatch.fullName || sName,
        nickname: idMatch.nickname || sName,
        department: idMatch.department || 'ฝ่ายแอดมิน',
        position: pos,
        isSales: (idMatch.department || '').includes('ขาย'),
        isExcludedFromDiligenceByPos: isPositionExcludedFromDiligence(pos),
        isMappedOfficial: true,
      };
    }
  }

  // 4. พนักงานอื่นๆ ที่ไม่อยู่ในตารางผูก ID ปัจจุบัน
  const fallbackKey = `SCAN-${pid || '0'}-${sName}`;
  return {
    empKey: fallbackKey,
    empCode: fallbackKey,
    personId: pid || '-',
    scannerName: sName || '-',
    fullName: sName || `พนักงาน ${pid}`,
    nickname: sName || '-',
    department: 'ไม่ระบุแผนก',
    position: '-',
    isSales: false,
    isExcludedFromDiligenceByPos: false,
    isMappedOfficial: false,
  };
}

/**
 * จับคู่พนักงานจากใบลาออนไลน์เข้ากับตารางพนักงาน
 */
export function resolveEmployeeFromLeave(
  leave: LeaveFormRecord,
  mappings: EmployeeMapping[]
): ResolvedEmployee {
  const code = (leave.empCode || '').trim();
  const fName = (leave.fullName || '').trim();
  const nick = (leave.nickname || '').trim().toLowerCase();

  // 1. จับคู่ด้วยรหัสพนักงาน
  let matched = mappings.find((m) => m.empCode === code);

  // 2. จับคู่ด้วยชื่อ-นามสกุล
  if (!matched && fName) {
    matched = mappings.find(
      (m) =>
        (m.fullName || '').replace(/\s+/g, '') === fName.replace(/\s+/g, '') ||
        (m.fullName || '').includes(fName) ||
        fName.includes(m.fullName || '')
    );
  }

  // 3. จับคู่ด้วยชื่อเล่น
  if (!matched && nick) {
    matched = mappings.find(
      (m) =>
        (m.nickname || '').toLowerCase() === nick ||
        (m.scannerName || '').toLowerCase() === nick
    );
  }

  if (matched) {
    const pos = matched.position || leave.position || '-';
    return {
      empKey: matched.empCode || matched.personId,
      empCode: matched.empCode || matched.personId,
      personId: matched.personId || '-',
      scannerName: matched.scannerName || matched.fullName,
      fullName: matched.fullName || fName,
      nickname: matched.nickname || '-',
      department: matched.department || leave.department || 'ฝ่ายแอดมิน',
      position: pos,
      isSales: (matched.department || leave.department || '').includes('ขาย'),
      isExcludedFromDiligenceByPos: isPositionExcludedFromDiligence(pos),
      isMappedOfficial: true,
    };
  }

  const fallbackKey = code || `LEAVE-${fName}`;
  const dept = leave.department || 'ไม่ระบุแผนก';
  const pos = leave.position || '-';
  return {
    empKey: fallbackKey,
    empCode: fallbackKey,
    personId: '-',
    scannerName: leave.nickname || fName,
    fullName: fName,
    nickname: leave.nickname || '-',
    department: dept,
    position: pos,
    isSales: dept.includes('ขาย'),
    isExcludedFromDiligenceByPos: isPositionExcludedFromDiligence(pos),
    isMappedOfficial: false,
  };
}

interface DailyLeaveAllocation {
  leaveId: string;
  leaveType: LeaveFormRecord['leaveType'];
  isUnpaid: boolean;
  days: number;
  hours: number;
  reason: string;
  note: string;
  source: 'form' | 'sheet';
}

/**
 * ประมวลผลข้อมูลการมาทำงานและการลาประจำเดือนตามกฎ Attendance_Audit_Business_Rules_JCW
 * โดยใช้แหล่งข้อมูลวันลากลางชุดเดียว (Single Canonical Source) และการปัดเศษ 2 ตำแหน่ง (round2) เหมือนกันทุกรายงาน
 */
export function runMonthlyAttendanceAudit(params: {
  yearMonth: string; // เช่น "2026-10"
  attendanceRows: RawAttendanceRow[];
  leaveRecords: LeaveFormRecord[];
  quotaRecords: EmployeeQuotaRecord[];
  employeeMappings: EmployeeMapping[];
  hrOverrides: Record<string, HROverrideRecord>;
  settings: AuditSettings & {
    onlyMappedEmployees?: boolean;
    autoSkipCompanyWideEmptyDays?: boolean;
  };
}): MonthlyAuditOutput {
  const {
    yearMonth,
    attendanceRows,
    leaveRecords,
    quotaRecords,
    employeeMappings,
    hrOverrides,
    settings,
  } = params;

  const onlyMapped = settings.onlyMappedEmployees ?? true;
  const autoSkipEmptyDays = settings.autoSkipCompanyWideEmptyDays ?? true;

  // สร้างแผนที่ตำแหน่งงานจากชีตสิทธิคงเหลือเพื่อความแม่นยำสูงสุด
  const positionByEmpCode = new Map<string, string>();
  const positionByFullName = new Map<string, string>();
  for (const q of quotaRecords) {
    if (q.position) {
      if (q.empCode) positionByEmpCode.set(q.empCode, q.position);
      if (q.fullName)
        positionByFullName.set(q.fullName.replace(/\s+/g, ''), q.position);
    }
  }

  // 1. กรองแถวสแกนนิ้วเฉพาะเดือนที่เลือก (YYYY-MM)
  const monthAttRows = attendanceRows.filter((r) =>
    r.date.startsWith(yearMonth)
  );

  // 2. สำรวจวันที่ทั้งหมดในเดือนที่มีการสแกนนิ้วหรือมีข้อมูลการลาของบริษัท
  const dateActivityCount = new Map<string, number>();
  const allCandidateDates = new Set<string>();

  for (const row of monthAttRows) {
    if (!isWeekday(row.date)) continue;
    allCandidateDates.add(row.date);
    const hasAnyActivity =
      (row.scanIn && row.scanIn !== '-') ||
      (row.scanOut && row.scanOut !== '-') ||
      (row.sheetSickLeave ?? 0) > 0 ||
      (row.sheetPersonalLeave ?? 0) > 0 ||
      (row.sheetVacationLeave ?? 0) > 0 ||
      (row.sheetUnpaidLeave ?? 0) > 0 ||
      Boolean(row.sheetNote);
    if (hasAnyActivity) {
      dateActivityCount.set(
        row.date,
        (dateActivityCount.get(row.date) || 0) + 1
      );
    }
  }

  // เรียงลำดับวันทำงานในเดือน
  const activeWorkdays = Array.from(allCandidateDates)
    .filter((d) => {
      if (settings.customHolidays.includes(d)) return false;
      if (autoSkipEmptyDays && (dateActivityCount.get(d) || 0) === 0) {
        return false;
      }
      return true;
    })
    .sort();

  // 3. รวบรวมรายชื่อพนักงานที่จะนำมาประมวลผลในเดือนนี้
  const employeesMap = new Map<string, ResolvedEmployee>();

  for (const m of employeeMappings) {
    const key = m.empCode || m.personId || m.fullName;
    const pos =
      m.position ||
      positionByEmpCode.get(m.empCode) ||
      positionByFullName.get((m.fullName || '').replace(/\s+/g, '')) ||
      '-';
    employeesMap.set(key, {
      empKey: key,
      empCode: m.empCode || '-',
      personId: m.personId || '-',
      scannerName: m.scannerName || m.fullName || '-',
      fullName: m.fullName || '-',
      nickname: m.nickname || m.scannerName || '-',
      department: m.department || 'ฝ่ายแอดมิน',
      position: pos,
      isSales: (m.department || '').includes('ขาย'),
      isExcludedFromDiligenceByPos: isPositionExcludedFromDiligence(pos),
      isMappedOfficial: true,
    });
  }

  // จับคู่แถวสแกนนิ้วเข้ากับพนักงาน
  const scanRowByEmpDate = new Map<string, RawAttendanceRow>();
  const employeesSeenInMonthScan = new Set<string>();

  for (const row of monthAttRows) {
    const resolved = resolveEmployeeFromScan(
      row.personId,
      row.scannerName,
      employeeMappings
    );
    if (onlyMapped && !resolved.isMappedOfficial) continue;

    if (!employeesMap.has(resolved.empKey)) {
      employeesMap.set(resolved.empKey, resolved);
    }
    employeesSeenInMonthScan.add(resolved.empKey);

    const key = `${resolved.empKey}__${row.date}`;
    const existing = scanRowByEmpDate.get(key);
    if (!existing) {
      scanRowByEmpDate.set(key, row);
    } else {
      const existingHasData =
        existing.scanIn !== '-' ||
        existing.scanOut !== '-' ||
        Boolean(existing.sheetNote) ||
        (existing.sheetSickLeave ?? 0) > 0 ||
        (existing.sheetPersonalLeave ?? 0) > 0 ||
        (existing.sheetVacationLeave ?? 0) > 0 ||
        (existing.sheetUnpaidLeave ?? 0) > 0;
      const newHasData =
        row.scanIn !== '-' ||
        row.scanOut !== '-' ||
        Boolean(row.sheetNote) ||
        (row.sheetSickLeave ?? 0) > 0 ||
        (row.sheetPersonalLeave ?? 0) > 0 ||
        (row.sheetVacationLeave ?? 0) > 0 ||
        (row.sheetUnpaidLeave ?? 0) > 0;
      if (!existingHasData && newHasData) {
        scanRowByEmpDate.set(key, row);
      }
    }
  }

  // 4. ประมวลผลใบลาจากแบบฟอร์มลาออนไลน์ในเดือนที่เลือก + ตรวจสอบการลาข้ามเดือน/ลาล่วงหน้า
  const dailyLeaveByEmpDate = new Map<string, DailyLeaveAllocation[]>();
  const monthlyLeaveUsageList: MonthlyLeaveUsageReportItem[] = [];
  const crossMonthOrFutureLeaves: MonthlyLeaveUsageReportItem[] = [];

  for (const leave of leaveRecords) {
    const totalReqHours = round2(leave.hours > 0 ? leave.hours : leave.days * 8);
    if (totalReqHours <= 0) continue;
    const totalReqDays = round2(totalReqHours / 8);

    const dateCheck = inspectLeaveDateRange(
      leave.startDate,
      leave.endDate,
      leave.timestamp
    );

    if (settings.onlyApprovedLeaves && leave.status !== 'อนุมัติ') {
      continue;
    }
    if (settings.excludeCarryoverLeaves && leave.isHistoricalCarryover) {
      continue;
    }

    const resolved = resolveEmployeeFromLeave(leave, employeeMappings);
    if (onlyMapped && !resolved.isMappedOfficial) continue;

    if (!employeesMap.has(resolved.empKey)) {
      employeesMap.set(resolved.empKey, resolved);
    }

    const weekdaysInLeave = getWeekdaysInRange(
      dateCheck.startDate,
      dateCheck.endDate
    );
    if (weekdaysInLeave.length === 0) continue;

    const weekdaysInTargetMonth = weekdaysInLeave.filter((d) =>
      d.startsWith(yearMonth)
    );

    // ตรวจจับกรณีลาข้ามเดือน หรือ ยื่นใบลาในเดือนนี้แต่เป็นวันลาของเดือนอื่น (เช่น ยื่น ต.ค. ลา พ.ย.)
    const isRelevantCrossOrFuture =
      (dateCheck.isCrossMonth &&
        (weekdaysInTargetMonth.length > 0 ||
          dateCheck.submittedYearMonth === yearMonth)) ||
      (weekdaysInTargetMonth.length === 0 &&
        dateCheck.submittedYearMonth === yearMonth);

    if (isRelevantCrossOrFuture) {
      const daysInTarget =
        weekdaysInTargetMonth.length > 0
          ? round2(
              (totalReqDays * weekdaysInTargetMonth.length) /
                weekdaysInLeave.length
            )
          : 0;
      const hoursInTarget = round2(daysInTarget * 8);

      crossMonthOrFutureLeaves.push({
        id: `cross-${leave.id}`,
        empCode: resolved.empCode,
        personId: resolved.personId,
        fullName: resolved.fullName,
        nickname: resolved.nickname,
        department: resolved.department,
        position: resolved.position,
        leaveType: leave.leaveType,
        isUnpaid: leave.isUnpaidLeave,
        startDate: dateCheck.startDate,
        endDate: dateCheck.endDate,
        hours: hoursInTarget,
        days: daysInTarget,
        totalRequestedHours: totalReqHours,
        totalRequestedDays: totalReqDays,
        reason: leave.reason,
        status: leave.status,
        note: leave.note,
        source: 'แบบฟอร์มลาออนไลน์',
        isHistoricalCarryover: leave.isHistoricalCarryover,
        isCrossMonth: dateCheck.isCrossMonth,
        dateValidationNote:
          dateCheck.dateNote ||
          (weekdaysInTargetMonth.length === 0
            ? `ใบลายื่นล่วงหน้าสำหรับเดือน ${dateCheck.startDate.slice(0, 7)} (ไม่ถูกนำมาหักในเดือน ${yearMonth})`
            : `หักเฉพาะสัดส่วนวันทำงานในเดือน ${yearMonth} จำนวน ${formatLeaveHuman(daysInTarget, { zeroText: '0 วัน' })}`),
      });
    }

    if (weekdaysInTargetMonth.length === 0) continue;

    const rawDaysPerWeekday =
      weekdaysInLeave.length > 1
        ? totalReqDays / weekdaysInLeave.length
        : totalReqDays;

    let monthDaysAccum = 0;

    for (const d of weekdaysInTargetMonth) {
      const dayPortion = round2(rawDaysPerWeekday);
      const hourPortion = round2(dayPortion * 8);
      const key = `${resolved.empKey}__${d}`;
      const list = dailyLeaveByEmpDate.get(key) || [];
      list.push({
        leaveId: leave.id,
        leaveType: leave.leaveType,
        isUnpaid: leave.isUnpaidLeave,
        days: dayPortion,
        hours: hourPortion,
        reason: leave.reason,
        note: leave.note,
        source: 'form',
      });
      dailyLeaveByEmpDate.set(key, list);
      monthDaysAccum = round2(monthDaysAccum + dayPortion);
    }

    const monthHoursAccum = round2(monthDaysAccum * 8);

    monthlyLeaveUsageList.push({
      id: leave.id,
      empCode: resolved.empCode,
      personId: resolved.personId,
      fullName: resolved.fullName,
      nickname: resolved.nickname,
      department: resolved.department,
      position: resolved.position,
      leaveType: leave.leaveType,
      isUnpaid: leave.isUnpaidLeave,
      startDate: dateCheck.startDate,
      endDate: dateCheck.endDate,
      hours: monthHoursAccum,
      days: monthDaysAccum,
      totalRequestedHours: totalReqHours,
      totalRequestedDays: totalReqDays,
      reason: leave.reason,
      status: leave.status,
      note: leave.note,
      source: 'แบบฟอร์มลาออนไลน์',
      isHistoricalCarryover: leave.isHistoricalCarryover,
      isCrossMonth: dateCheck.isCrossMonth,
      dateValidationNote: dateCheck.dateNote,
    });
  }

  // 5. เดินเครื่องตรวจสอบรายวัน (Daily Audit State Machine) สำหรับพนักงานแต่ละคน
  const dailyRecords: DailyAuditRecord[] = [];
  const diligenceReport: DiligenceReportItem[] = [];
  const lateSummaryReport: LateSummaryReportItem[] = [];
  const unpaidAndOtherLeaveReport: UnpaidAndOtherLeaveReportItem[] = [];
  const activitySummaryReport: MonthlyActivitySummaryItem[] = [];

  const activeEmployeesInMonth = Array.from(employeesMap.values()).filter(
    (emp) => {
      if (employeesSeenInMonthScan.has(emp.empKey)) return true;
      const hasLeaveInMonth = monthlyLeaveUsageList.some(
        (l) => l.empCode === emp.empCode
      );
      return hasLeaveInMonth;
    }
  );

  for (const emp of activeEmployeesInMonth) {
    let prevWorkdayWasClientVisit = false;

    let empWorkedDays = 0;
    let empLateCount = 0;
    let empLateMinutes = 0;
    let empAfter0800Days = 0;
    let empMissingScanDays = 0;

    const empLateDetails: LateSummaryReportItem['dailyDetails'] = [];

    for (const date of activeWorkdays) {
      const key = `${emp.empKey}__${date}`;
      const rawRow = scanRowByEmpDate.get(key);
      const override = hrOverrides[key];

      if (!rawRow && !dailyLeaveByEmpDate.has(key) && !override) {
        continue;
      }

      const originalScanIn = rawRow ? rawRow.scanIn : '-';
      const originalScanOut = rawRow ? rawRow.scanOut : '-';

      const effectiveScanIn =
        override?.overrideScanIn !== undefined && override.overrideScanIn !== ''
          ? override.overrideScanIn
          : originalScanIn;
      const effectiveScanOut =
        override?.overrideScanOut !== undefined &&
        override.overrideScanOut !== ''
          ? override.overrideScanOut
          : originalScanOut;

      const hasIn = effectiveScanIn !== '-' && effectiveScanIn !== '';
      const hasOut = effectiveScanOut !== '-' && effectiveScanOut !== '';

      // รวบรวมวันลาในวันนี้จากแบบฟอร์มลาออนไลน์
      const formLeavesToday = dailyLeaveByEmpDate.get(key) || [];
      let sickLeaveDays = 0;
      let personalLeaveDays = 0;
      let vacationLeaveDays = 0;
      let unpaidLeaveDays = 0;
      let otherLeaveDays = 0;
      const leaveDetailsText: string[] = [];

      for (const fl of formLeavesToday) {
        const dVal = round2(fl.days);
        if (fl.isUnpaid || fl.leaveType === 'ลาไม่รับค่าจ้าง') {
          unpaidLeaveDays = round2(unpaidLeaveDays + dVal);
        } else if (fl.leaveType === 'ลาป่วย') {
          sickLeaveDays = round2(sickLeaveDays + dVal);
        } else if (fl.leaveType === 'ลากิจ') {
          personalLeaveDays = round2(personalLeaveDays + dVal);
        } else if (fl.leaveType === 'ลาพักร้อน') {
          vacationLeaveDays = round2(vacationLeaveDays + dVal);
        } else {
          otherLeaveDays = round2(otherLeaveDays + dVal);
        }
        leaveDetailsText.push(
          `${fl.leaveType} ${formatLeaveHuman(dVal)}${fl.reason ? ` - ${fl.reason}` : ''}`
        );
      }

      // หากเปิดตั้งค่ารวมวันลาจากชีตสแกนนิ้ว (เฉพาะกรณีที่วันนั้นไม่มีใบลาออนไลน์ในระบบ)
      if (
        settings.includeSheetLeaves &&
        rawRow &&
        formLeavesToday.length === 0
      ) {
        const sSick = round2(rawRow.sheetSickLeave ?? 0);
        const sPers = round2(rawRow.sheetPersonalLeave ?? 0);
        const sVac = round2(rawRow.sheetVacationLeave ?? 0);
        const sUnpaid = round2(rawRow.sheetUnpaidLeave ?? 0);

        if (sSick > 0) {
          sickLeaveDays = round2(sickLeaveDays + sSick);
          leaveDetailsText.push(
            `ลาป่วย (ในชีตสแกน) ${formatLeaveHuman(sSick)}`
          );
          monthlyLeaveUsageList.push({
            id: `sheet-sick-${key}`,
            empCode: emp.empCode,
            personId: emp.personId,
            fullName: emp.fullName,
            nickname: emp.nickname,
            department: emp.department,
            position: emp.position,
            leaveType: 'ลาป่วย',
            isUnpaid: false,
            startDate: date,
            endDate: date,
            hours: round2(sSick * 8),
            days: sSick,
            totalRequestedHours: round2(sSick * 8),
            totalRequestedDays: sSick,
            reason: rawRow.sheetNote || 'ระบุในชีตสแกนนิ้ว',
            status: 'อนุมัติ',
            note: rawRow.sheetNote || '',
            source: 'ชีตสแกนนิ้ว',
            isHistoricalCarryover: false,
          });
        }
        if (sPers > 0) {
          personalLeaveDays = round2(personalLeaveDays + sPers);
          leaveDetailsText.push(
            `ลากิจ (ในชีตสแกน) ${formatLeaveHuman(sPers)}`
          );
          monthlyLeaveUsageList.push({
            id: `sheet-pers-${key}`,
            empCode: emp.empCode,
            personId: emp.personId,
            fullName: emp.fullName,
            nickname: emp.nickname,
            department: emp.department,
            position: emp.position,
            leaveType: 'ลากิจ',
            isUnpaid: false,
            startDate: date,
            endDate: date,
            hours: round2(sPers * 8),
            days: sPers,
            totalRequestedHours: round2(sPers * 8),
            totalRequestedDays: sPers,
            reason: rawRow.sheetNote || 'ระบุในชีตสแกนนิ้ว',
            status: 'อนุมัติ',
            note: rawRow.sheetNote || '',
            source: 'ชีตสแกนนิ้ว',
            isHistoricalCarryover: false,
          });
        }
        if (sVac > 0) {
          vacationLeaveDays = round2(vacationLeaveDays + sVac);
          leaveDetailsText.push(
            `ลาพักร้อน (ในชีตสแกน) ${formatLeaveHuman(sVac)}`
          );
          monthlyLeaveUsageList.push({
            id: `sheet-vac-${key}`,
            empCode: emp.empCode,
            personId: emp.personId,
            fullName: emp.fullName,
            nickname: emp.nickname,
            department: emp.department,
            position: emp.position,
            leaveType: 'ลาพักร้อน',
            isUnpaid: false,
            startDate: date,
            endDate: date,
            hours: round2(sVac * 8),
            days: sVac,
            totalRequestedHours: round2(sVac * 8),
            totalRequestedDays: sVac,
            reason: rawRow.sheetNote || 'ระบุในชีตสแกนนิ้ว',
            status: 'อนุมัติ',
            note: rawRow.sheetNote || '',
            source: 'ชีตสแกนนิ้ว',
            isHistoricalCarryover: false,
          });
        }
        if (sUnpaid > 0) {
          unpaidLeaveDays = round2(unpaidLeaveDays + sUnpaid);
          leaveDetailsText.push(
            `ลาไม่รับค่าจ้าง (ในชีตสแกน) ${formatLeaveHuman(sUnpaid)}`
          );
          monthlyLeaveUsageList.push({
            id: `sheet-unpaid-${key}`,
            empCode: emp.empCode,
            personId: emp.personId,
            fullName: emp.fullName,
            nickname: emp.nickname,
            department: emp.department,
            position: emp.position,
            leaveType: 'ลาไม่รับค่าจ้าง',
            isUnpaid: true,
            startDate: date,
            endDate: date,
            hours: round2(sUnpaid * 8),
            days: sUnpaid,
            totalRequestedHours: round2(sUnpaid * 8),
            totalRequestedDays: sUnpaid,
            reason: rawRow.sheetNote || 'ระบุในชีตสแกนนิ้ว',
            status: 'อนุมัติ',
            note: rawRow.sheetNote || '',
            source: 'ชีตสแกนนิ้ว',
            isHistoricalCarryover: false,
          });
        }
      }

      const totalLeaveDaysOnDate = round2(
        sickLeaveDays +
          personalLeaveDays +
          vacationLeaveDays +
          unpaidLeaveDays +
          otherLeaveDays
      );

      // ตรวจสอบสถานะการสแกนนิ้วและกฎพิเศษฝ่ายขาย
      let scanStatus: DailyAuditRecord['scanStatus'] = 'ครบปกติ';
      let alertMessage = '';
      let salesStatus: '' | 'คาดว่าไปพบลูกค้า' = '';
      const isNextDayAfterClientVisit =
        emp.isSales && prevWorkdayWasClientVisit;

      if (hasIn && hasOut) {
        scanStatus = 'ครบปกติ';
      } else if (!hasIn && !hasOut) {
        if (totalLeaveDaysOnDate > 0) {
          scanStatus = 'ลาเต็มวัน/มีข้อมูลการลา';
        } else if (emp.isSales) {
          salesStatus = 'คาดว่าไปพบลูกค้า';
          scanStatus = 'คาดว่าไปพบลูกค้า';
          alertMessage =
            'คาดว่าไปพบลูกค้า (ไม่พบสแกนนิ้วเข้า-ออก และไม่มีใบลา)';
        } else {
          scanStatus = 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา';
          alertMessage =
            'พบวันที่ไม่ได้สแกนนิ้วเข้างานและออกจากงาน และไม่พบข้อมูลการลา';
        }
      } else if (!hasIn && hasOut) {
        if (emp.isSales && totalLeaveDaysOnDate === 0) {
          salesStatus = 'คาดว่าไปพบลูกค้า';
          scanStatus = 'ไม่พบสแกนเข้า แต่พบสแกนออก';
          alertMessage =
            'ไม่พบสแกนเข้า แต่พบสแกนออก (ฝ่ายขาย: คาดว่าไปพบลูกค้าช่วงเช้า)';
        } else {
          scanStatus = 'ไม่พบสแกนเข้า แต่พบสแกนออก';
          alertMessage = 'ไม่พบสแกนเข้า แต่พบสแกนออก';
        }
      } else if (hasIn && !hasOut) {
        scanStatus = 'พบสแกนเข้า แต่ไม่พบสแกนออก';
        alertMessage = 'พบสแกนเข้า แต่ไม่พบสแกนออก';
      }

      if (override?.overrideStatus) {
        scanStatus = override.overrideStatus;
        if (override.overrideStatus === 'คาดว่าไปพบลูกค้า') {
          salesStatus = 'คาดว่าไปพบลูกค้า';
          alertMessage = 'คาดว่าไปพบลูกค้า (HR ยืนยันสถานะ)';
        } else if (
          override.overrideStatus === 'ครบปกติ' ||
          override.overrideStatus === 'ลาเต็มวัน/มีข้อมูลการลา'
        ) {
          salesStatus = '';
          alertMessage = '';
        } else {
          salesStatus = '';
          alertMessage = override.overrideStatus;
        }
      }

      // คำนวณการมาสายและนาทีสายตามกฎ
      let lateCount = 0;
      let lateMinutes = 0;
      let lateRuleApplied: DailyAuditRecord['lateRuleApplied'] = 'ปกติ (08:15)';
      let isAfter0800Today = false;

      if (hasIn) {
        empWorkedDays++;

        if (isNextDayAfterClientVisit) {
          lateRuleApplied = 'อนุโลมฝ่ายขาย (09:00)';
          const salesCalc = calculateSalesNextDayLate(effectiveScanIn);
          lateCount = salesCalc.lateCount;
          lateMinutes = salesCalc.lateMinutes;
          const stdCheck = calculateStandardLate(effectiveScanIn, false);
          isAfter0800Today = stdCheck.isAfter0800;
        } else {
          const stdCalc = calculateStandardLate(effectiveScanIn, false);
          lateCount = stdCalc.lateCount;
          lateMinutes = stdCalc.lateMinutes;
          isAfter0800Today = stdCalc.isAfter0800;

          if (stdCalc.isGracePeriod0801To0815) {
            lateRuleApplied = 'อนุโลม (08:01-08:15 เสียเบี้ยขยัน)';
          } else {
            lateRuleApplied = 'ปกติ (08:15)';
          }
        }

        // กรณีลาครึ่งวันเช้า (totalLeaveDaysOnDate >= 0.5) แล้วสแกนเข้าช่วงเที่ยง และในชีตไม่ได้นับว่าสาย
        if (
          totalLeaveDaysOnDate >= 0.5 &&
          lateMinutes > 60 &&
          (rawRow?.sheetLateCount === null || rawRow?.sheetLateCount === 0)
        ) {
          lateCount = 0;
          lateMinutes = 0;
        }
      }

      if (
        override?.overrideLateCount !== undefined &&
        override.overrideLateCount !== null
      ) {
        lateCount = override.overrideLateCount;
        if (lateCount === 0) {
          isAfter0800Today = false;
        }
      }
      if (
        override?.overrideLateMinutes !== undefined &&
        override.overrideLateMinutes !== null
      ) {
        lateMinutes = override.overrideLateMinutes;
      }

      // ตรวจจับเวลาสแกนเข้างานผิดปกติ เช่น สแกนเข้าช่วงบ่าย/เย็น (เช่น 16:10 น.) หรือสายเกิน 180 นาทีโดยไม่มีใบลา
      let suspiciousScanWarning: string | undefined;
      if (hasIn && totalLeaveDaysOnDate < 0.5 && lateMinutes >= 180) {
        suspiciousScanWarning = `⚠️ เวลาเข้างานผิดปกติ (${effectiveScanIn} น. / คิดสาย ${lateMinutes} นาที) — อาจเป็นเวลาสแกนออกที่ถูกบันทึกในช่องเข้างาน กรุณาให้ HR ตรวจสอบก่อนคำนวณเงินเดือน`;
      }

      prevWorkdayWasClientVisit =
        emp.isSales && salesStatus === 'คาดว่าไปพบลูกค้า';

      empLateCount += lateCount;
      empLateMinutes += lateMinutes;
      if (isAfter0800Today || lateCount > 0) {
        empAfter0800Days++;
      }
      if (
        scanStatus === 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา' ||
        scanStatus === 'ไม่พบสแกนเข้า แต่พบสแกนออก' ||
        scanStatus === 'คาดว่าไปพบลูกค้า'
      ) {
        empMissingScanDays++;
      }

      if (lateCount > 0 || lateMinutes > 0) {
        empLateDetails.push({
          date,
          scanIn: effectiveScanIn,
          lateMinutes,
          rule: lateRuleApplied,
          note: override?.hrNote || rawRow?.sheetNote || '',
        });
      }

      const hasMeaningfulOverride = Boolean(
        override &&
          (override.overrideScanIn ||
            override.overrideScanOut ||
            override.overrideStatus ||
            (override.overrideLateCount !== undefined &&
              override.overrideLateCount !== null) ||
            (override.overrideLateMinutes !== undefined &&
              override.overrideLateMinutes !== null) ||
            override.hrNote)
      );

      dailyRecords.push({
        key,
        date,
        dayOfWeek: rawRow?.dayOfWeek || getThaiDayOfWeek(date),
        empCode: emp.empCode,
        personId: emp.personId,
        scannerName: emp.scannerName,
        fullName: emp.fullName,
        nickname: emp.nickname,
        department: emp.department,
        position: emp.position,
        isSales: emp.isSales,
        originalScanIn,
        originalScanOut,
        effectiveScanIn,
        effectiveScanOut,
        hasIn,
        hasOut,
        scanStatus,
        alertMessage,
        salesStatus,
        isNextDayAfterClientVisit,
        lateRuleApplied,
        lateCount,
        lateMinutes,
        sickLeaveDays,
        personalLeaveDays,
        vacationLeaveDays,
        unpaidLeaveDays,
        otherLeaveDays,
        totalLeaveDaysOnDate,
        leaveDetails: leaveDetailsText,
        sheetNote: rawRow?.sheetNote || '',
        hrNote: override?.hrNote || '',
        hasHROverride: hasMeaningfulOverride,
        isReviewed: Boolean(override?.isReviewed || hasMeaningfulOverride),
        reviewedAt: override?.reviewedAt || override?.updatedAt,
        reviewedBy: override?.reviewedBy || override?.updatedBy || (hasMeaningfulOverride ? 'HR' : undefined),
        updatedBy: override?.updatedBy || (hasMeaningfulOverride ? 'HR' : undefined),
        updatedAt: override?.updatedAt,
        suspiciousScanWarning,
      });
    }

    // -------------------------------------------------------------------------
    // คำนวณยอดวันลาแต่ละประเภทของพนักงานคนนี้จากแหล่งข้อมูลกลางชุดเดียว (monthlyLeaveUsageList)
    // เพื่อให้ตัวเลขวันลาในรายงานที่ 1, 3, 4, 5, 6 และหน้าสรุปผู้บริหาร ตรงกัน 100% ทุกจุด
    // -------------------------------------------------------------------------
    const empCanonicalLeaves = monthlyLeaveUsageList.filter(
      (item) => item.empCode === emp.empCode
    );

    let empSickDays = 0;
    let empPersonalDays = 0;
    let empVacationDays = 0;
    let empUnpaidDays = 0;
    let empOtherDays = 0;
    const empUnpaidDetails: UnpaidAndOtherLeaveReportItem['details'] = [];

    for (const item of empCanonicalLeaves) {
      const d = round2(item.days);
      const h = round2(item.hours);
      if (item.isUnpaid || item.leaveType === 'ลาไม่รับค่าจ้าง') {
        empUnpaidDays = round2(empUnpaidDays + d);
        empUnpaidDetails.push({
          date: item.startDate,
          type: 'ลาไม่รับค่าจ้าง',
          days: d,
          hours: h,
          reason: item.reason || 'ลาไม่รับค่าจ้าง',
        });
      } else if (item.leaveType === 'ลาป่วย') {
        empSickDays = round2(empSickDays + d);
      } else if (item.leaveType === 'ลากิจ') {
        empPersonalDays = round2(empPersonalDays + d);
      } else if (item.leaveType === 'ลาพักร้อน') {
        empVacationDays = round2(empVacationDays + d);
      } else {
        empOtherDays = round2(empOtherDays + d);
        empUnpaidDetails.push({
          date: item.startDate,
          type: 'ลาอื่นๆ',
          days: d,
          hours: h,
          reason: item.reason || 'ลาอื่นๆ',
        });
      }
    }

    const totalLeaveDays = round2(
      empSickDays +
        empPersonalDays +
        empVacationDays +
        empUnpaidDays +
        empOtherDays
    );

    // ตรวจสอบสิทธิ์เบี้ยขยัน:
    // 1. พนักงานทุกแผนก (รวมฝ่ายขาย) ยกเว้นตำแหน่ง "เจ้าหน้าที่ฝ่ายขาย"
    // 2. ทุกวันทำงานที่มาทำงานต้องมีเวลาเข้างาน <= 08:00 น. (ไม่มีวันใดเกิน 08:00 น. และไม่มีวันไม่พบสแกนเข้า)
    // 3. วันลารวมทุกประเภทในเดือนนั้น <= 1.00 วัน
    const disqualifyReasons: string[] = [];
    if (emp.isExcludedFromDiligenceByPos) {
      disqualifyReasons.push(
        `ตำแหน่ง${emp.position} (ยกเว้นสิทธิเบี้ยขยันตามกฎบริษัท)`
      );
    }
    if (empAfter0800Days > 0) {
      disqualifyReasons.push(
        `มีวันสแกนเข้าหลัง 08:00 น. จำนวน ${empAfter0800Days} วัน (สาย ${empLateCount} ครั้ง รวม ${empLateMinutes} นาที)`
      );
    }
    if (empMissingScanDays > 0) {
      disqualifyReasons.push(
        `มีวันไม่พบข้อมูลสแกนเข้างาน ${empMissingScanDays} วัน`
      );
    }
    if (totalLeaveDays > 1.0) {
      disqualifyReasons.push(
        `วันลารวมในเดือนเกิน 1 วัน (ลาไป ${formatLeaveHuman(totalLeaveDays)})`
      );
    }
    if (empWorkedDays === 0) {
      disqualifyReasons.push('ไม่มีวันมาสแกนปฏิบัติงานในเดือนนี้');
    }

    const isEligibleForDiligence = disqualifyReasons.length === 0;

    diligenceReport.push({
      empCode: emp.empCode,
      personId: emp.personId,
      fullName: emp.fullName,
      nickname: emp.nickname,
      department: emp.department,
      position: emp.position,
      isSales: emp.isSales,
      isEligible: isEligibleForDiligence,
      totalWorkdays: activeWorkdays.length,
      daysWorked: empWorkedDays,
      daysScanAfter0800: empAfter0800Days,
      totalLeaveDays,
      disqualifyReasons,
    });

    lateSummaryReport.push({
      empCode: emp.empCode,
      personId: emp.personId,
      fullName: emp.fullName,
      nickname: emp.nickname,
      department: emp.department,
      position: emp.position,
      lateCount: empLateCount,
      lateMinutes: empLateMinutes,
      dailyDetails: empLateDetails,
    });

    const unpaidPlusOtherDays = round2(empUnpaidDays + empOtherDays);
    unpaidAndOtherLeaveReport.push({
      empCode: emp.empCode,
      personId: emp.personId,
      fullName: emp.fullName,
      nickname: emp.nickname,
      department: emp.department,
      position: emp.position,
      unpaidDays: empUnpaidDays,
      unpaidHours: round2(empUnpaidDays * 8),
      otherDays: empOtherDays,
      otherHours: round2(empOtherDays * 8),
      totalDays: unpaidPlusOtherDays,
      totalHours: round2(unpaidPlusOtherDays * 8),
      details: empUnpaidDetails,
    });

    activitySummaryReport.push({
      empCode: emp.empCode,
      personId: emp.personId,
      fullName: emp.fullName,
      nickname: emp.nickname,
      department: emp.department,
      position: emp.position,
      sickDays: empSickDays,
      sickHours: round2(empSickDays * 8),
      personalDays: empPersonalDays,
      personalHours: round2(empPersonalDays * 8),
      vacationDays: empVacationDays,
      vacationHours: round2(empVacationDays * 8),
      unpaidDays: empUnpaidDays,
      unpaidHours: round2(empUnpaidDays * 8),
      otherDays: empOtherDays,
      otherHours: round2(empOtherDays * 8),
      totalLeaveDays,
      totalLeaveHours: round2(totalLeaveDays * 8),
      lateCount: empLateCount,
      lateMinutes: empLateMinutes,
      diligenceEligible: isEligibleForDiligence,
    });
  }

  // 6. สร้างรายงานที่ 6: สิทธิคงเหลือรายบุคคล (ปัดเศษ 2 ตำแหน่งด้วย round2 ทุกค่า)
  const quotaReport: QuotaReportItem[] = [];
  const activityByEmpCode = new Map<string, MonthlyActivitySummaryItem>();
  for (const act of activitySummaryReport) {
    activityByEmpCode.set(act.empCode, act);
  }

  for (const q of quotaRecords) {
    const mapped = employeeMappings.find(
      (m) =>
        m.empCode === q.empCode ||
        (m.fullName || '').replace(/\s+/g, '') ===
          (q.fullName || '').replace(/\s+/g, '')
    );
    const act = activityByEmpCode.get(q.empCode);

    quotaReport.push({
      empCode: q.empCode,
      personId: mapped?.personId || '-',
      fullName: q.fullName,
      nickname: q.nickname || mapped?.nickname || '-',
      department: q.department || mapped?.department || '-',
      position: q.position || mapped?.position || '-',
      sickQuota: round2(q.sickQuotaDays),
      sickUsedTotal: round2(q.sickUsedDays),
      sickRemaining: round2(q.sickRemainingDays),
      personalQuota: round2(q.personalQuotaDays),
      personalUsedTotal: round2(q.personalUsedDays),
      personalRemaining: round2(q.personalRemainingDays),
      vacationQuota: round2(q.vacationQuotaDays),
      vacationUsedTotal: round2(q.vacationUsedDays),
      vacationRemaining: round2(q.vacationRemainingDays),
      otherQuota: round2(q.otherQuotaDays),
      otherUsedTotal: round2(q.otherUsedDays),
      otherRemaining: round2(q.otherRemainingDays),
      monthSickUsed: round2(act?.sickDays || 0),
      monthPersonalUsed: round2(act?.personalDays || 0),
      monthVacationUsed: round2(act?.vacationDays || 0),
      monthOtherAndUnpaidUsed: round2(
        (act?.unpaidDays || 0) + (act?.otherDays || 0)
      ),
    });
  }

  // 7. คำนวณผลรวมทั้งบริษัท (Activity Totals) ด้วย round2 เสมอ
  const activityGrandTotal = activitySummaryReport.reduce(
    (acc, item) => {
      acc.sickDays = round2(acc.sickDays + item.sickDays);
      acc.sickHours = round2(acc.sickHours + item.sickHours);
      acc.personalDays = round2(acc.personalDays + item.personalDays);
      acc.personalHours = round2(acc.personalHours + item.personalHours);
      acc.vacationDays = round2(acc.vacationDays + item.vacationDays);
      acc.vacationHours = round2(acc.vacationHours + item.vacationHours);
      acc.unpaidDays = round2(acc.unpaidDays + item.unpaidDays);
      acc.unpaidHours = round2(acc.unpaidHours + item.unpaidHours);
      acc.otherDays = round2(acc.otherDays + item.otherDays);
      acc.otherHours = round2(acc.otherHours + item.otherHours);
      acc.totalLeaveDays = round2(acc.totalLeaveDays + item.totalLeaveDays);
      acc.totalLeaveHours = round2(acc.totalLeaveHours + item.totalLeaveHours);
      acc.lateCount += item.lateCount;
      acc.lateMinutes += item.lateMinutes;
      if (item.diligenceEligible) acc.diligenceEligibleCount += 1;
      return acc;
    },
    {
      sickDays: 0,
      sickHours: 0,
      personalDays: 0,
      personalHours: 0,
      vacationDays: 0,
      vacationHours: 0,
      unpaidDays: 0,
      unpaidHours: 0,
      otherDays: 0,
      otherHours: 0,
      totalLeaveDays: 0,
      totalLeaveHours: 0,
      lateCount: 0,
      lateMinutes: 0,
      diligenceEligibleCount: 0,
    }
  );

  // รายการผิดปกติที่ต้องให้ HR ตรวจสอบ (32 รายการในเดือนตุลาคม 2026)
  const scanAnomalyRecords = dailyRecords.filter(
    (r) =>
      r.scanStatus !== 'ครบปกติ' &&
      r.scanStatus !== 'ลาเต็มวัน/มีข้อมูลการลา'
  );

  // รายการที่เวลาสแกนผิดปกติ เช่น สแกนเข้างาน 16:10 น.
  const suspiciousScanRecords = dailyRecords.filter((r) =>
    Boolean(r.suspiciousScanWarning)
  );

  // 8. ตรวจสอบยอดรวมระหว่างรายงานต่าง ๆ (Cross-Report Reconciliation Checks)
  const sumMonthlyUsageDays = round2(
    monthlyLeaveUsageList.reduce((acc, i) => acc + round2(i.days), 0)
  );
  const sumDiligenceLeaveDays = round2(
    diligenceReport.reduce((acc, i) => acc + round2(i.totalLeaveDays), 0)
  );
  const sumUnpaidReportDays = round2(
    unpaidAndOtherLeaveReport.reduce((acc, i) => acc + round2(i.unpaidDays), 0)
  );
  const sumLateReportCount = lateSummaryReport.reduce(
    (acc, i) => acc + i.lateCount,
    0
  );
  const sumLateReportMinutes = lateSummaryReport.reduce(
    (acc, i) => acc + i.lateMinutes,
    0
  );
  const countEligibleDiligence = diligenceReport.filter((d) => d.isEligible).length;

  const reconciliationChecks: ReconciliationCheckItem[] = [
    {
      id: 'check-total-leave',
      label: 'ยอดรวมวันลาทุกประเภททั้งเดือน',
      sourceA: 'หน้าภาพรวมเงินเดือน & สรุปกิจกรรม',
      valueA: formatLeaveHuman(activityGrandTotal.totalLeaveDays, {
        zeroText: '0 วัน',
      }),
      sourceB: 'รายละเอียดการลาในเดือน & รายงานเบี้ยขยัน',
      valueB: `${formatLeaveHuman(sumMonthlyUsageDays, { zeroText: '0 วัน' })} / ${formatLeaveHuman(sumDiligenceLeaveDays, { zeroText: '0 วัน' })}`,
      isMatched:
        activityGrandTotal.totalLeaveDays === sumMonthlyUsageDays &&
        activityGrandTotal.totalLeaveDays === sumDiligenceLeaveDays,
    },
    {
      id: 'check-unpaid-leave',
      label: 'ยอดรวมวันลาไม่รับค่าจ้าง',
      sourceA: 'หน้าภาพรวมเงินเดือน (Executive)',
      valueA: formatLeaveHuman(activityGrandTotal.unpaidDays, {
        zeroText: '0 วัน',
      }),
      sourceB: 'รายงานลาไม่รับค่าจ้าง',
      valueB: formatLeaveHuman(sumUnpaidReportDays, { zeroText: '0 วัน' }),
      isMatched: activityGrandTotal.unpaidDays === sumUnpaidReportDays,
    },
    {
      id: 'check-late-summary',
      label: 'ยอดรวมจำนวนครั้งและนาทีที่มาสาย',
      sourceA: 'หน้าภาพรวมเงินเดือน (Executive)',
      valueA: `${activityGrandTotal.lateCount} ครั้ง (${activityGrandTotal.lateMinutes} นาที)`,
      sourceB: 'รายงานเวลาเข้างานสาย',
      valueB: `${sumLateReportCount} ครั้ง (${sumLateReportMinutes} นาที)`,
      isMatched:
        activityGrandTotal.lateCount === sumLateReportCount &&
        activityGrandTotal.lateMinutes === sumLateReportMinutes,
    },
    {
      id: 'check-diligence-count',
      label: 'จำนวนผู้ได้รับเบี้ยขยัน',
      sourceA: 'หน้าภาพรวมเงินเดือน (Executive)',
      valueA: `${activityGrandTotal.diligenceEligibleCount} คน`,
      sourceB: 'รายงานเบี้ยขยัน',
      valueB: `${countEligibleDiligence} คน`,
      isMatched:
        activityGrandTotal.diligenceEligibleCount === countEligibleDiligence,
    },
  ];

  const isAllReconciled = reconciliationChecks.every((c) => c.isMatched);

  return {
    yearMonth,
    workdaysInMonth: activeWorkdays,
    dailyRecords,
    diligenceReport,
    lateSummaryReport,
    unpaidAndOtherLeaveReport,
    monthlyLeaveUsageReport: monthlyLeaveUsageList,
    crossMonthOrFutureLeaves,
    activitySummaryReport,
    activityGrandTotal,
    quotaReport,
    scanAnomalyRecords,
    suspiciousScanRecords,
    reconciliationChecks,
    isAllReconciled,
  };
}
