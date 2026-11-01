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
  UnpaidAndOtherLeaveReportItem,
} from '../types/attendance';
import {
  calculateSalesNextDayLate,
  calculateStandardLate,
  getThaiDayOfWeek,
  getWeekdaysInRange,
  isWeekday,
} from './dateAndTime';

export interface ResolvedEmployee {
  empKey: string;
  empCode: string;
  personId: string;
  scannerName: string;
  fullName: string;
  nickname: string;
  department: string;
  isSales: boolean;
  isMappedOfficial: boolean;
}

/**
 * จับคู่พนักงานจากข้อมูลสแกนนิ้ว (personId + scannerName) เข้ากับตาราง ID บุคคลสำหรับเชื่อมต่อ
 */
export function resolveEmployeeFromScan(
  personId: string,
  scannerName: string,
  mappings: EmployeeMapping[]
): ResolvedEmployee {
  const pid = (personId || '').trim();
  const sName = (scannerName || '').trim();
  const sNameLower = sName.toLowerCase();

  // กรณีพิเศษจากข้อมูลจริง: "อนุชิต" ในชีต ม.ค.-ส.ค. มักถูกพิมพ์ต่อท้ายตารางโดยติด ID บุคคลของคนอื่น (22, 23, 24, 25, 26, 12)
  if (sName === 'อนุชิต' || sNameLower === 'anuchit') {
    const anuchit = mappings.find((m) => m.scannerName === 'อนุชิต' || m.empCode === '010666001');
    if (anuchit) {
      return {
        empKey: anuchit.empCode,
        empCode: anuchit.empCode,
        personId: anuchit.personId,
        scannerName: anuchit.scannerName,
        fullName: anuchit.fullName,
        nickname: anuchit.nickname,
        department: anuchit.department,
        isSales: anuchit.department.includes('ขาย'),
        isMappedOfficial: true,
      };
    }
  }

  // กรณีพิเศษ: "Fah" ในชีต 10 มีทั้ง ID 24 (มีข้อมูลสแกนจริง) และ ID 27 (ว่างทั้งหมด) ให้รวมเป็น นันทวัน ดีชื่น (Fah)
  if (sNameLower === 'fah') {
    const fah = mappings.find((m) => (m.scannerName || '').toLowerCase() === 'fah');
    if (fah) {
      return {
        empKey: fah.empCode || '010969001',
        empCode: fah.empCode || '010969001',
        personId: fah.personId || '24',
        scannerName: fah.scannerName || 'Fah',
        fullName: fah.fullName || 'นันทวัน ดีชื่น',
        nickname: fah.nickname || 'Fah',
        department: fah.department || 'ฝ่ายขาย',
        isSales: (fah.department || 'ฝ่ายขาย').includes('ขาย'),
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
    return {
      empKey: exactMatch.empCode || exactMatch.personId,
      empCode: exactMatch.empCode || exactMatch.personId,
      personId: exactMatch.personId || '-',
      scannerName: exactMatch.scannerName || sName,
      fullName: exactMatch.fullName || sName,
      nickname: exactMatch.nickname || sName,
      department: exactMatch.department || 'ฝ่ายแอดมิน',
      isSales: (exactMatch.department || '').includes('ขาย'),
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
    return {
      empKey: nameMatch.empCode || nameMatch.personId,
      empCode: nameMatch.empCode || nameMatch.personId,
      personId: nameMatch.personId || '-',
      scannerName: nameMatch.scannerName || sName,
      fullName: nameMatch.fullName || sName,
      nickname: nameMatch.nickname || sName,
      department: nameMatch.department || 'ฝ่ายแอดมิน',
      isSales: (nameMatch.department || '').includes('ขาย'),
      isMappedOfficial: true,
    };
  }

  // 3. จับคู่ด้วย personId (เฉพาะกรณีที่ไม่ใช่ ID ซ้ำอย่าง Sean/Dom)
  if (pid && pid !== '0') {
    const idMatch = mappings.find((m) => m.personId === pid);
    // ป้องกัน Sean (ID 24 เดือน เม.ย.-พ.ค.) ชนกับ Fah (ID 24 เดือน ก.ย.-ต.ค.)
    if (idMatch && !(pid === '24' && sNameLower === 'sean')) {
      return {
        empKey: idMatch.empCode || idMatch.personId,
        empCode: idMatch.empCode || idMatch.personId,
        personId: idMatch.personId || '-',
        scannerName: sName || idMatch.scannerName || '-',
        fullName: idMatch.fullName || sName,
        nickname: idMatch.nickname || sName,
        department: idMatch.department || 'ฝ่ายแอดมิน',
        isSales: (idMatch.department || '').includes('ขาย'),
        isMappedOfficial: true,
      };
    }
  }

  // 4. พนักงานอื่นๆ ที่ไม่อยู่ในตารางผูก ID ปัจจุบัน (เช่น พนักงานที่ลาออกไปแล้วในเดือนก่อนหน้า)
  const fallbackKey = `SCAN-${pid || '0'}-${sName}`;
  return {
    empKey: fallbackKey,
    empCode: fallbackKey,
    personId: pid || '-',
    scannerName: sName || '-',
    fullName: sName || `พนักงาน ID ${pid}`,
    nickname: sName || '-',
    department: 'ไม่ระบุแผนก (ไม่อยู่ในผังปัจจุบัน)',
    isSales: false,
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
    return {
      empKey: matched.empCode || matched.personId,
      empCode: matched.empCode || matched.personId,
      personId: matched.personId || '-',
      scannerName: matched.scannerName || matched.fullName,
      fullName: matched.fullName || fName,
      nickname: matched.nickname || '-',
      department: matched.department || leave.department || 'ฝ่ายแอดมิน',
      isSales: (matched.department || leave.department || '').includes('ขาย'),
      isMappedOfficial: true,
    };
  }

  const fallbackKey = code || `LEAVE-${fName}`;
  const dept = leave.department || 'ไม่ระบุแผนก';
  return {
    empKey: fallbackKey,
    empCode: fallbackKey,
    personId: '-',
    scannerName: leave.nickname || fName,
    fullName: fName,
    nickname: leave.nickname || '-',
    department: dept,
    isSales: dept.includes('ขาย'),
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

  // 1. กรองแถวสแกนนิ้วเฉพาะเดือนที่เลือก (YYYY-MM)
  const monthAttRows = attendanceRows.filter((r) => r.date.startsWith(yearMonth));

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
      dateActivityCount.set(row.date, (dateActivityCount.get(row.date) || 0) + 1);
    }
  }

  // เรียงลำดับวันทำงานในเดือน
  const activeWorkdays = Array.from(allCandidateDates)
    .filter((d) => {
      if (settings.customHolidays.includes(d)) return false;
      if (autoSkipEmptyDays && (dateActivityCount.get(d) || 0) === 0) {
        return false; // ข้ามวันหยุดบริษัทหรือวันสิ้นเดือนที่ดึงไฟล์ก่อนเวลาสแกน (ไม่มีใครสแกนเลยทั้งบริษัท)
      }
      return true;
    })
    .sort();

  // 3. รวบรวมรายชื่อพนักงานที่จะนำมาประมวลผลในเดือนนี้
  const employeesMap = new Map<string, ResolvedEmployee>();

  // ใส่พนักงานตามตารางผูก ID หลักที่มีความเคลื่อนไหวในเดือนนี้ หรือทั้งหมดในผังบริษัท
  for (const m of employeeMappings) {
    const key = m.empCode || m.personId || m.fullName;
    employeesMap.set(key, {
      empKey: key,
      empCode: m.empCode || '-',
      personId: m.personId || '-',
      scannerName: m.scannerName || m.fullName || '-',
      fullName: m.fullName || '-',
      nickname: m.nickname || m.scannerName || '-',
      department: m.department || 'ฝ่ายแอดมิน',
      isSales: (m.department || '').includes('ขาย'),
      isMappedOfficial: true,
    });
  }

  // จับคู่แถวสแกนนิ้วเข้ากับพนักงาน และเก็บแถวสแกนนิ้วรายวัน (เลือกแถวที่มีข้อมูลสแกนจริงหากซ้ำ เช่น Fah ID 24 vs ID 27)
  const scanRowByEmpDate = new Map<string, RawAttendanceRow>();
  const employeesSeenInMonthScan = new Set<string>();

  for (const row of monthAttRows) {
    const resolved = resolveEmployeeFromScan(row.personId, row.scannerName, employeeMappings);
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
      // ถ้าแถวใหม่มีเวลาสแกนหรือหมายเหตุ แต่แถวเดิมเป็น '-' ให้ใช้แถวใหม่แทน
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

  // 4. ประมวลผลใบลาจากแบบฟอร์มลาออนไลน์ในเดือนที่เลือก
  const dailyLeaveByEmpDate = new Map<string, DailyLeaveAllocation[]>();
  const monthlyLeaveUsageList: MonthlyLeaveUsageReportItem[] = [];

  for (const leave of leaveRecords) {
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

    const weekdaysInLeave = getWeekdaysInRange(leave.startDate, leave.endDate);
    if (weekdaysInLeave.length === 0) continue;

    // ตรวจดูว่ามีกี่วันในใบลานี้ที่อยู่ในเดือนที่กำลังตรวจสอบ
    const weekdaysInTargetMonth = weekdaysInLeave.filter((d) => d.startsWith(yearMonth));
    if (weekdaysInTargetMonth.length === 0) continue;

    // เฉลี่ยจำนวนชั่วโมงและวันลาต่อวันทำงานในช่วงใบลา
    const totalDays = leave.days > 0 ? leave.days : leave.hours / 8;
    const daysPerWeekday =
      weekdaysInLeave.length > 1
        ? totalDays / weekdaysInLeave.length
        : totalDays;
    const hoursPerWeekday = daysPerWeekday * 8;

    let monthDaysUsedForThisRecord = 0;
    let monthHoursUsedForThisRecord = 0;

    for (const d of weekdaysInTargetMonth) {
      const key = `${resolved.empKey}__${d}`;
      const list = dailyLeaveByEmpDate.get(key) || [];
      list.push({
        leaveId: leave.id,
        leaveType: leave.leaveType,
        isUnpaid: leave.isUnpaidLeave,
        days: Number(daysPerWeekday.toFixed(4)),
        hours: Number(hoursPerWeekday.toFixed(2)),
        reason: leave.reason,
        note: leave.note,
        source: 'form',
      });
      dailyLeaveByEmpDate.set(key, list);
      monthDaysUsedForThisRecord += daysPerWeekday;
      monthHoursUsedForThisRecord += hoursPerWeekday;
    }

    monthlyLeaveUsageList.push({
      id: leave.id,
      empCode: resolved.empCode,
      personId: resolved.personId,
      fullName: resolved.fullName,
      nickname: resolved.nickname,
      department: resolved.department,
      leaveType: leave.leaveType,
      isUnpaid: leave.isUnpaidLeave,
      startDate: leave.startDate,
      endDate: leave.endDate,
      hours: Number(monthHoursUsedForThisRecord.toFixed(2)),
      days: Number(monthDaysUsedForThisRecord.toFixed(4)),
      reason: leave.reason,
      status: leave.status,
      note: leave.note,
      source: 'แบบฟอร์มลาออนไลน์',
      isHistoricalCarryover: leave.isHistoricalCarryover,
    });
  }

  // 5. เดินเครื่องตรวจสอบรายวัน (Daily Audit State Machine) สำหรับพนักงานแต่ละคน
  const dailyRecords: DailyAuditRecord[] = [];
  const diligenceReport: DiligenceReportItem[] = [];
  const lateSummaryReport: LateSummaryReportItem[] = [];
  const unpaidAndOtherLeaveReport: UnpaidAndOtherLeaveReportItem[] = [];
  const activitySummaryReport: MonthlyActivitySummaryItem[] = [];

  // กรองเฉพาะพนักงานที่มีชื่อในชีตสแกนนิ้วของเดือนนี้ หรือมีใบลาในเดือนนี้ (ยกเว้นพนักงานที่ยังไม่ได้เริ่มงานในเดือนนั้น)
  const activeEmployeesInMonth = Array.from(employeesMap.values()).filter((emp) => {
    if (employeesSeenInMonthScan.has(emp.empKey)) return true;
    const hasLeaveInMonth = monthlyLeaveUsageList.some((l) => l.empCode === emp.empCode);
    return hasLeaveInMonth;
  });

  for (const emp of activeEmployeesInMonth) {
    let prevWorkdayWasClientVisit = false;

    let empWorkedDays = 0;
    let empLateCount = 0;
    let empLateMinutes = 0;
    let empAfter0800Days = 0;
    let empMissingScanDays = 0;

    let empSickDays = 0;
    let empPersonalDays = 0;
    let empVacationDays = 0;
    let empUnpaidDays = 0;
    let empOtherDays = 0;

    const empLateDetails: LateSummaryReportItem['dailyDetails'] = [];
    const empUnpaidDetails: UnpaidAndOtherLeaveReportItem['details'] = [];

    for (const date of activeWorkdays) {
      const key = `${emp.empKey}__${date}`;
      const rawRow = scanRowByEmpDate.get(key);
      const override = hrOverrides[key];

      // ถ้าพนักงานคนนี้ไม่มีแถวในชีตสแกนนิ้วของวันนี้เลย และไม่มีใบลา (เช่น พนักงานเพิ่งเริ่มงานกลางเดือน)
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
        override?.overrideScanOut !== undefined && override.overrideScanOut !== ''
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
        if (fl.isUnpaid || fl.leaveType === 'ลาไม่รับค่าจ้าง') {
          unpaidLeaveDays += fl.days;
        } else if (fl.leaveType === 'ลาป่วย') {
          sickLeaveDays += fl.days;
        } else if (fl.leaveType === 'ลากิจ') {
          personalLeaveDays += fl.days;
        } else if (fl.leaveType === 'ลาพักร้อน') {
          vacationLeaveDays += fl.days;
        } else {
          otherLeaveDays += fl.days;
        }
        leaveDetailsText.push(
          `${fl.leaveType} ${fl.days} วัน (${fl.hours} ชม.)${fl.reason ? ` - ${fl.reason}` : ''}`
        );
      }

      // หากเปิดตั้งค่ารวมวันลาจากชีตสแกนนิ้ว (กรณีที่ไม่ได้กรอกในฟอร์มออนไลน์)
      if (settings.includeSheetLeaves && rawRow && formLeavesToday.length === 0) {
        const sSick = rawRow.sheetSickLeave ?? 0;
        const sPers = rawRow.sheetPersonalLeave ?? 0;
        const sVac = rawRow.sheetVacationLeave ?? 0;
        const sUnpaid = rawRow.sheetUnpaidLeave ?? 0;

        if (sSick > 0) {
          sickLeaveDays += sSick;
          leaveDetailsText.push(`ลาป่วย (ในชีตสแกน) ${sSick} วัน`);
          monthlyLeaveUsageList.push({
            id: `sheet-sick-${key}`,
            empCode: emp.empCode,
            personId: emp.personId,
            fullName: emp.fullName,
            nickname: emp.nickname,
            department: emp.department,
            leaveType: 'ลาป่วย',
            isUnpaid: false,
            startDate: date,
            endDate: date,
            hours: sSick * 8,
            days: sSick,
            reason: rawRow.sheetNote || 'ระบุในชีตสแกนนิ้ว',
            status: 'อนุมัติ',
            note: rawRow.sheetNote || '',
            source: 'ชีตสแกนนิ้ว',
            isHistoricalCarryover: false,
          });
        }
        if (sPers > 0) {
          personalLeaveDays += sPers;
          leaveDetailsText.push(`ลากิจ (ในชีตสแกน) ${sPers} วัน`);
          monthlyLeaveUsageList.push({
            id: `sheet-pers-${key}`,
            empCode: emp.empCode,
            personId: emp.personId,
            fullName: emp.fullName,
            nickname: emp.nickname,
            department: emp.department,
            leaveType: 'ลากิจ',
            isUnpaid: false,
            startDate: date,
            endDate: date,
            hours: sPers * 8,
            days: sPers,
            reason: rawRow.sheetNote || 'ระบุในชีตสแกนนิ้ว',
            status: 'อนุมัติ',
            note: rawRow.sheetNote || '',
            source: 'ชีตสแกนนิ้ว',
            isHistoricalCarryover: false,
          });
        }
        if (sVac > 0) {
          vacationLeaveDays += sVac;
          leaveDetailsText.push(`ลาพักร้อน (ในชีตสแกน) ${sVac} วัน`);
          monthlyLeaveUsageList.push({
            id: `sheet-vac-${key}`,
            empCode: emp.empCode,
            personId: emp.personId,
            fullName: emp.fullName,
            nickname: emp.nickname,
            department: emp.department,
            leaveType: 'ลาพักร้อน',
            isUnpaid: false,
            startDate: date,
            endDate: date,
            hours: sVac * 8,
            days: sVac,
            reason: rawRow.sheetNote || 'ระบุในชีตสแกนนิ้ว',
            status: 'อนุมัติ',
            note: rawRow.sheetNote || '',
            source: 'ชีตสแกนนิ้ว',
            isHistoricalCarryover: false,
          });
        }
        if (sUnpaid > 0) {
          unpaidLeaveDays += sUnpaid;
          leaveDetailsText.push(`ลาไม่รับค่าจ้าง (ในชีตสแกน) ${sUnpaid} วัน`);
          monthlyLeaveUsageList.push({
            id: `sheet-unpaid-${key}`,
            empCode: emp.empCode,
            personId: emp.personId,
            fullName: emp.fullName,
            nickname: emp.nickname,
            department: emp.department,
            leaveType: 'ลาไม่รับค่าจ้าง',
            isUnpaid: true,
            startDate: date,
            endDate: date,
            hours: sUnpaid * 8,
            days: sUnpaid,
            reason: rawRow.sheetNote || 'ระบุในชีตสแกนนิ้ว',
            status: 'อนุมัติ',
            note: rawRow.sheetNote || '',
            source: 'ชีตสแกนนิ้ว',
            isHistoricalCarryover: false,
          });
        }
      }

      const totalLeaveDaysOnDate =
        sickLeaveDays + personalLeaveDays + vacationLeaveDays + unpaidLeaveDays + otherLeaveDays;

      // ตรวจสอบสถานะการสแกนนิ้วและกฎพิเศษฝ่ายขาย
      let scanStatus: DailyAuditRecord['scanStatus'] = 'ครบปกติ';
      let alertMessage = '';
      let salesStatus: '' | 'คาดว่าไปพบลูกค้า' = '';
      const isNextDayAfterClientVisit = emp.isSales && prevWorkdayWasClientVisit;

      if (hasIn && hasOut) {
        scanStatus = 'ครบปกติ';
      } else if (!hasIn && !hasOut) {
        if (totalLeaveDaysOnDate > 0) {
          scanStatus = 'ลาเต็มวัน/มีข้อมูลการลา';
        } else if (emp.isSales) {
          // กฎข้อ 7.2: ฝ่ายขายที่ไม่มีสแกนเข้าและไม่มีวันลา -> คาดว่าไปพบลูกค้า
          salesStatus = 'คาดว่าไปพบลูกค้า';
          scanStatus = 'คาดว่าไปพบลูกค้า';
          alertMessage = 'คาดว่าไปพบลูกค้า (ไม่พบสแกนนิ้วเข้า-ออก และไม่มีใบลา)';
        } else {
          scanStatus = 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา';
          alertMessage = 'พบวันที่ไม่ได้สแกนนิ้วเข้างานและออกจากงาน และไม่พบข้อมูลการลา';
        }
      } else if (!hasIn && hasOut) {
        if (emp.isSales && totalLeaveDaysOnDate === 0) {
          salesStatus = 'คาดว่าไปพบลูกค้า';
          scanStatus = 'ไม่พบสแกนเข้า แต่พบสแกนออก';
          alertMessage = 'ไม่พบสแกนเข้า แต่พบสแกนออก (ฝ่ายขาย: คาดว่าไปพบลูกค้าช่วงเช้า)';
        } else {
          scanStatus = 'ไม่พบสแกนเข้า แต่พบสแกนออก';
          alertMessage = 'ไม่พบสแกนเข้า แต่พบสแกนออก';
        }
      } else if (hasIn && !hasOut) {
        scanStatus = 'พบสแกนเข้า แต่ไม่พบสแกนออก';
        alertMessage = 'พบสแกนเข้า แต่ไม่พบสแกนออก';
      }

      // ถ้า HR มีการแก้ไขสถานะด้วยตนเองใน Override
      if (override?.overrideStatus) {
        scanStatus = override.overrideStatus;
        if (override.overrideStatus === 'คาดว่าไปพบลูกค้า') {
          salesStatus = 'คาดว่าไปพบลูกค้า';
        } else {
          salesStatus = '';
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
          // กฎข้อ 7.3: วันทำงานถัดจากวันที่ "คาดว่าไปพบลูกค้า" อนุโลมถึง 09:00 น.
          lateRuleApplied = 'อนุโลมฝ่ายขาย (09:00)';
          const salesCalc = calculateSalesNextDayLate(effectiveScanIn);
          lateCount = salesCalc.lateCount;
          lateMinutes = salesCalc.lateMinutes;
          isAfter0800Today = true; // ฝ่ายขายไม่มีสิทธิเบี้ยขยันอยู่แล้ว
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

      // ถ้า HR ได้ Override จำนวนครั้งที่สายหรือนาทีสายไว้ ให้ใช้ค่าที่ HR กำหนด
      if (override?.overrideLateCount !== undefined && override.overrideLateCount !== null) {
        lateCount = override.overrideLateCount;
      }
      if (override?.overrideLateMinutes !== undefined && override.overrideLateMinutes !== null) {
        lateMinutes = override.overrideLateMinutes;
      }

      // อัปเดตสถานะสำหรับวันทำงานถัดไปของฝ่ายขาย:
      // ถ้าวันนี้ไม่มีสแกนเข้าและไม่มีวันลา (คาดว่าไปพบลูกค้า) -> วันทำงานถัดไปได้เกณฑ์ 09:00 น.
      prevWorkdayWasClientVisit = emp.isSales && salesStatus === 'คาดว่าไปพบลูกค้า';

      // สะสมยอดรายเดือนของพนักงาน
      empLateCount += lateCount;
      empLateMinutes += lateMinutes;
      if (isAfter0800Today || lateCount > 0) {
        empAfter0800Days++;
      }
      if (
        scanStatus === 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา' ||
        scanStatus === 'ไม่พบสแกนเข้า แต่พบสแกนออก'
      ) {
        empMissingScanDays++;
      }

      empSickDays += sickLeaveDays;
      empPersonalDays += personalLeaveDays;
      empVacationDays += vacationLeaveDays;
      empUnpaidDays += unpaidLeaveDays;
      empOtherDays += otherLeaveDays;

      if (lateCount > 0 || lateMinutes > 0) {
        empLateDetails.push({
          date,
          scanIn: effectiveScanIn,
          lateMinutes,
          rule: lateRuleApplied,
          note: override?.hrNote || rawRow?.sheetNote || '',
        });
      }

      if (unpaidLeaveDays > 0) {
        empUnpaidDetails.push({
          date,
          type: 'ลาไม่รับค่าจ้าง',
          days: unpaidLeaveDays,
          hours: unpaidLeaveDays * 8,
          reason:
            formLeavesToday.find((f) => f.isUnpaid)?.reason ||
            rawRow?.sheetNote ||
            'ลาไม่รับค่าจ้าง',
        });
      }
      if (otherLeaveDays > 0) {
        empUnpaidDetails.push({
          date,
          type: 'ลาอื่นๆ',
          days: otherLeaveDays,
          hours: otherLeaveDays * 8,
          reason:
            formLeavesToday.find((f) => f.leaveType === 'ลาอื่นๆ' && !f.isUnpaid)?.reason ||
            rawRow?.sheetNote ||
            'ลาอื่นๆ',
        });
      }

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
        hasHROverride: Boolean(override),
      });
    }

    const totalLeaveDays = Number(
      (
        empSickDays +
        empPersonalDays +
        empVacationDays +
        empUnpaidDays +
        empOtherDays
      ).toFixed(4)
    );

    // ตรวจสอบสิทธิ์เบี้ยขยันตามกฎข้อ 5 (3 เงื่อนไขหลัก):
    // 1. ไม่ได้อยู่ฝ่ายขาย
    // 2. ทุกวันทำงานที่มาทำงานต้องมีเวลาเข้างาน <= 08:00 น. (ไม่มีวันใดเกิน 08:00 น. และไม่มีวันขาดสแกนเข้า)
    // 3. วันลารวมทุกประเภทในเดือนนั้น <= 1.0 วัน
    const disqualifyReasons: string[] = [];
    if (emp.isSales) {
      disqualifyReasons.push('อยู่ฝ่ายขาย (ไม่มีสิทธิรับเบี้ยขยันตามกฎบริษัท)');
    }
    if (empAfter0800Days > 0) {
      disqualifyReasons.push(
        `มีวันสแกนเข้าหลัง 08:00 น. จำนวน ${empAfter0800Days} วัน (สาย ${empLateCount} ครั้ง รวม ${empLateMinutes} นาที)`
      );
    }
    if (empMissingScanDays > 0) {
      disqualifyReasons.push(`มีวันไม่พบข้อมูลสแกนเข้างาน ${empMissingScanDays} วัน`);
    }
    if (totalLeaveDays > 1.0) {
      disqualifyReasons.push(`วันลารวมในเดือนเกิน 1 วัน (ลาไป ${totalLeaveDays} วัน)`);
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
      lateCount: empLateCount,
      lateMinutes: empLateMinutes,
      dailyDetails: empLateDetails,
    });

    unpaidAndOtherLeaveReport.push({
      empCode: emp.empCode,
      personId: emp.personId,
      fullName: emp.fullName,
      nickname: emp.nickname,
      department: emp.department,
      unpaidDays: Number(empUnpaidDays.toFixed(4)),
      unpaidHours: Number((empUnpaidDays * 8).toFixed(2)),
      otherDays: Number(empOtherDays.toFixed(4)),
      otherHours: Number((empOtherDays * 8).toFixed(2)),
      totalDays: Number((empUnpaidDays + empOtherDays).toFixed(4)),
      totalHours: Number(((empUnpaidDays + empOtherDays) * 8).toFixed(2)),
      details: empUnpaidDetails,
    });

    activitySummaryReport.push({
      empCode: emp.empCode,
      personId: emp.personId,
      fullName: emp.fullName,
      nickname: emp.nickname,
      department: emp.department,
      sickDays: Number(empSickDays.toFixed(4)),
      sickHours: Number((empSickDays * 8).toFixed(2)),
      personalDays: Number(empPersonalDays.toFixed(4)),
      personalHours: Number((empPersonalDays * 8).toFixed(2)),
      vacationDays: Number(empVacationDays.toFixed(4)),
      vacationHours: Number((empVacationDays * 8).toFixed(2)),
      unpaidDays: Number(empUnpaidDays.toFixed(4)),
      unpaidHours: Number((empUnpaidDays * 8).toFixed(2)),
      otherDays: Number(empOtherDays.toFixed(4)),
      otherHours: Number((empOtherDays * 8).toFixed(2)),
      totalLeaveDays,
      totalLeaveHours: Number((totalLeaveDays * 8).toFixed(2)),
      lateCount: empLateCount,
      lateMinutes: empLateMinutes,
      diligenceEligible: isEligibleForDiligence,
    });
  }

  // 6. สร้างรายงานที่ 6: สิทธิคงเหลือรายบุคคล (อ้างอิงจากชีต "สิทธิคงเหลือ" เป็นหลัก พร้อมแสดงยอดใช้ไปในเดือนนี้)
  const quotaReport: QuotaReportItem[] = [];
  const activityByEmpCode = new Map<string, MonthlyActivitySummaryItem>();
  for (const act of activitySummaryReport) {
    activityByEmpCode.set(act.empCode, act);
  }

  for (const q of quotaRecords) {
    const mapped = employeeMappings.find(
      (m) =>
        m.empCode === q.empCode ||
        m.fullName.replace(/\s+/g, '') === q.fullName.replace(/\s+/g, '')
    );
    const act = activityByEmpCode.get(q.empCode);

    quotaReport.push({
      empCode: q.empCode,
      personId: mapped?.personId || '-',
      fullName: q.fullName,
      nickname: q.nickname || mapped?.nickname || '-',
      department: q.department || mapped?.department || '-',
      sickQuota: q.sickQuotaDays,
      sickUsedTotal: q.sickUsedDays,
      sickRemaining: q.sickRemainingDays,
      personalQuota: q.personalQuotaDays,
      personalUsedTotal: q.personalUsedDays,
      personalRemaining: q.personalRemainingDays,
      vacationQuota: q.vacationQuotaDays,
      vacationUsedTotal: q.vacationUsedDays,
      vacationRemaining: q.vacationRemainingDays,
      otherQuota: q.otherQuotaDays,
      otherUsedTotal: q.otherUsedDays,
      otherRemaining: q.otherRemainingDays,
      monthSickUsed: act?.sickDays || 0,
      monthPersonalUsed: act?.personalDays || 0,
      monthVacationUsed: act?.vacationDays || 0,
      monthOtherAndUnpaidUsed: Number(((act?.unpaidDays || 0) + (act?.otherDays || 0)).toFixed(4)),
    });
  }

  // 7. คำนวณผลรวมทั้งบริษัท (Activity Totals)
  const activityGrandTotal = activitySummaryReport.reduce(
    (acc, item) => {
      acc.sickDays = Number((acc.sickDays + item.sickDays).toFixed(4));
      acc.sickHours = Number((acc.sickHours + item.sickHours).toFixed(2));
      acc.personalDays = Number((acc.personalDays + item.personalDays).toFixed(4));
      acc.personalHours = Number((acc.personalHours + item.personalHours).toFixed(2));
      acc.vacationDays = Number((acc.vacationDays + item.vacationDays).toFixed(4));
      acc.vacationHours = Number((acc.vacationHours + item.vacationHours).toFixed(2));
      acc.unpaidDays = Number((acc.unpaidDays + item.unpaidDays).toFixed(4));
      acc.unpaidHours = Number((acc.unpaidHours + item.unpaidHours).toFixed(2));
      acc.otherDays = Number((acc.otherDays + item.otherDays).toFixed(4));
      acc.otherHours = Number((acc.otherHours + item.otherHours).toFixed(2));
      acc.totalLeaveDays = Number((acc.totalLeaveDays + item.totalLeaveDays).toFixed(4));
      acc.totalLeaveHours = Number((acc.totalLeaveHours + item.totalLeaveHours).toFixed(2));
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

  const scanAnomalyRecords = dailyRecords.filter(
    (r) =>
      r.scanStatus !== 'ครบปกติ' &&
      r.scanStatus !== 'ลาเต็มวัน/มีข้อมูลการลา'
  );

  return {
    yearMonth,
    workdaysInMonth: activeWorkdays,
    dailyRecords,
    diligenceReport,
    lateSummaryReport,
    unpaidAndOtherLeaveReport,
    monthlyLeaveUsageReport: monthlyLeaveUsageList,
    activitySummaryReport,
    activityGrandTotal,
    quotaReport,
    scanAnomalyRecords,
  };
}
