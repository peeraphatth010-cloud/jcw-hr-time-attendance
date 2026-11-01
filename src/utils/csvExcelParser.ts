import * as XLSX from 'xlsx';
import {
  EmployeeMapping,
  EmployeeQuotaRecord,
  LeaveFormRecord,
  LeaveCategory,
  RawAttendanceRow,
} from '../types/attendance';
import {
  inspectLeaveDateRange,
  normalizeDateStr,
  round2,
} from './dateAndTime';

/**
 * แยกบรรทัด CSV โดยรองรับเครื่องหมายอัญประกาศ ("...")
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseOptionalNumber(
  val: string | number | undefined | null
): number | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s || s === '-') return null;
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * แปลงข้อความ CSV ของไฟล์ "บันทึกเข้างาน" เป็นรายการ RawAttendanceRow[]
 */
export function parseAttendanceCsvText(
  csvText: string,
  defaultSheetLabel = 'CSV'
): RawAttendanceRow[] {
  const lines = csvText.split(/\r?\n/);
  const rows: RawAttendanceRow[] = [];
  let currentSheetLabel = defaultSheetLabel;
  let rowSeq = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const cols = parseCsvLine(rawLine);
    const firstCol = (cols[0] || '').trim();

    if (firstCol.startsWith('เดือน')) {
      currentSheetLabel = firstCol;
      continue;
    }

    if (
      firstCol === 'หมายเลข' ||
      firstCol.startsWith('รายงานบันทึก') ||
      /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(firstCol)
    ) {
      continue;
    }

    // คอลัมน์ G (index 6) คือ วันที่ (YYYY-MM-DD)
    const rawDate = cols[6];
    const dateYmd = normalizeDateStr(rawDate, 'ATTENDANCE_YMD');
    if (!dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      continue;
    }

    const personId = String(cols[1] || '').trim();
    const scannerName = String(cols[2] || '').trim();
    if (!scannerName && !personId) continue;

    rowSeq++;
    const yearMonth = dateYmd.slice(0, 7);
    const scanInRaw = String(cols[9] || '').trim();
    const scanOutRaw = String(cols[10] || '').trim();

    rows.push({
      id: `att-${yearMonth}-${personId}-${scannerName}-${dateYmd}-${rowSeq}`,
      sheetMonth: currentSheetLabel || yearMonth,
      rowNumber: parseOptionalNumber(cols[0]) ?? rowSeq,
      personId,
      scannerName,
      companyDept: String(cols[3] || 'JCW').trim(),
      position: String(cols[4] || '-').trim(),
      gender: String(cols[5] || '-').trim(),
      date: dateYmd,
      dayOfWeek: String(cols[7] || '').trim(),
      schedule: String(cols[8] || '(08:00:00-17:00:00)').trim(),
      scanIn: scanInRaw && scanInRaw !== '-' ? scanInRaw : '-',
      scanOut: scanOutRaw && scanOutRaw !== '-' ? scanOutRaw : '-',
      sheetLateCount: parseOptionalNumber(cols[11]),
      sheetLateMinutes: parseOptionalNumber(cols[12]),
      sheetSickLeave: parseOptionalNumber(cols[13]),
      sheetPersonalLeave: parseOptionalNumber(cols[14]),
      sheetVacationLeave: parseOptionalNumber(cols[15]),
      sheetUnpaidLeave: parseOptionalNumber(cols[16]),
      sheetNote: String(cols[17] || '').trim(),
    });
  }

  return rows;
}

/**
 * แปลงข้อความจำนวนชั่วโมง เช่น "8 ชม.", "4 ชม.", "16 ชม.", "2" เป็นตัวเลขชั่วโมง
 */
export function parseLeaveHours(
  raw: string | number | undefined | null
): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const match = String(raw)
    .replace(/,/g, '')
    .match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  return isNaN(val) ? 0 : val;
}

/**
 * จัดหมวดหมู่ประเภทการลาด้วยสูตรมาตรฐานเดียวกันทุกรายงาน
 */
export function classifyLeaveType(
  rawType: string,
  reason: string,
  note: string
): { leaveType: LeaveCategory; isUnpaidLeave: boolean } {
  const t = (rawType || '').trim();
  const combinedText = `${t} ${reason || ''} ${note || ''}`.toLowerCase();

  const unpaidKeywords = [
    'ไม่รับค่าจ้าง',
    'ลาไม่รับ',
    'หักเงิน',
    'หักค่าจ้าง',
    'without pay',
    'leave without pay',
  ];
  const hasUnpaidKeyword = unpaidKeywords.some((kw) =>
    combinedText.includes(kw)
  );

  if (t.includes('ไม่รับค่าจ้าง') || t.includes('ลาไม่รับ')) {
    return { leaveType: 'ลาไม่รับค่าจ้าง', isUnpaidLeave: true };
  }
  if (t.includes('ป่วย')) {
    return {
      leaveType: hasUnpaidKeyword ? 'ลาไม่รับค่าจ้าง' : 'ลาป่วย',
      isUnpaidLeave: hasUnpaidKeyword,
    };
  }
  if (t.includes('กิจ')) {
    return {
      leaveType: hasUnpaidKeyword ? 'ลาไม่รับค่าจ้าง' : 'ลากิจ',
      isUnpaidLeave: hasUnpaidKeyword,
    };
  }
  if (t.includes('พักร้อน') || t.includes('พักผ่อน')) {
    return {
      leaveType: hasUnpaidKeyword ? 'ลาไม่รับค่าจ้าง' : 'ลาพักร้อน',
      isUnpaidLeave: hasUnpaidKeyword,
    };
  }
  if (hasUnpaidKeyword) {
    return { leaveType: 'ลาไม่รับค่าจ้าง', isUnpaidLeave: true };
  }
  return { leaveType: 'ลาอื่นๆ', isUnpaidLeave: false };
}

/**
 * ตรวจสอบว่าเป็นรายการที่ HR บันทึกยอดสะสมย้อนหลังหรือทดสอบระบบหรือไม่
 */
export function detectHistoricalCarryoverOrTest(
  reason: string,
  note: string,
  hours: number,
  timestamp?: string
): boolean {
  const r = (reason || '').trim();
  const n = (note || '').trim();
  const carryoverKeywords = [
    'บันทึกเก่า',
    'บันทึกลาเก่า',
    'บันทึกลาเดิม',
    'บันทึกการลาเก่า',
    'บันทึกการลาล่าสุด',
    'บันทึกลาล่าสุด',
    'บันทึกการลา',
    'บันทึกใหม่',
    'สิทธิคงเหลือล่าสุด',
    'ทดสอบ',
    'เทสระบบ',
    'กดก',
  ];
  if (r === 'บันทึก' || r === 'ทด' || r === 'ขอลา') {
    // 'ขอลา' ที่กรอกตอนตั้งค่าระบบวันที่ 2026-10-01 13:07 (ขณะที่สแกนทำงานเต็มวัน 07:53-17:02)
    if (r === 'ขอลา' && !(timestamp || '').startsWith('2026-10-01 13:07')) {
      return false;
    }
    return true;
  }
  if (carryoverKeywords.some((kw) => r.includes(kw) || n.includes(kw))) {
    return true;
  }
  if (hours >= 32 && r.includes('บันทึก')) {
    return true;
  }
  return false;
}

function stripThaiPrefix(name: string): string {
  return (name || '')
    .replace(/^(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.)\s*/g, '')
    .trim();
}

/**
 * แปลงข้อความ CSV ของชีต "การตอบแบบฟอร์ม 1" (แบบฟอร์มลาออนไลน์) เป็น LeaveFormRecord[]
 */
export function parseLeaveFormCsvText(csvText: string): LeaveFormRecord[] {
  const lines = csvText.split(/\r?\n/);
  const records: LeaveFormRecord[] = [];
  let seq = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const cols = parseCsvLine(rawLine);
    const firstCol = (cols[0] || '').trim();
    const secondCol = (cols[1] || '').trim();

    if (
      firstCol === 'ประทับเวลา' ||
      secondCol === 'ชื่อ' ||
      secondCol === 'ชื่อ-นามสกุล' ||
      (!firstCol && !secondCol)
    ) {
      continue;
    }

    const rawStart = normalizeDateStr(cols[8], 'LEAVE_DMY');
    const rawEnd = normalizeDateStr(cols[9], 'LEAVE_DMY') || rawStart;
    if (!rawStart) continue;

    const hours = round2(parseLeaveHours(cols[10]));
    if (hours <= 0) continue; // ข้ามแถวที่ชั่วโมงลาเป็น 0

    const dateCheck = inspectLeaveDateRange(rawStart, rawEnd, firstCol);
    const days = round2(hours / 8);

    const firstNameClean = stripThaiPrefix(cols[1] || '');
    const lastNameClean = (cols[2] || '').trim();
    const fullName = `${firstNameClean} ${lastNameClean}`.trim();

    const rawLeaveType = String(cols[7] || '').trim();
    const reason = String(cols[11] || '').trim();
    const status = String(cols[12] || 'รออนุมัติ').trim();
    const approvedDate =
      normalizeDateStr(cols[13], 'LEAVE_DMY') || String(cols[13] || '').trim();
    const note = '';

    const { leaveType, isUnpaidLeave } = classifyLeaveType(
      rawLeaveType,
      reason,
      note
    );
    const isHistoricalCarryover = detectHistoricalCarryoverOrTest(
      reason,
      note,
      hours,
      firstCol
    );

    seq++;
    records.push({
      id: `leave-${seq}-${dateCheck.startDate}`,
      timestamp: firstCol,
      fullName,
      nickname: firstNameClean,
      empCode: String(cols[3] || '').trim(),
      position: String(cols[6] || '').trim(),
      department: String(cols[5] || '').trim(),
      leaveType,
      reason,
      startDate: dateCheck.startDate,
      endDate: dateCheck.endDate,
      hours,
      days,
      attachmentUrl: '',
      status,
      approvedDate,
      note,
      isUnpaidLeave,
      isHistoricalCarryover,
      isCrossMonth: dateCheck.isCrossMonth,
      dateValidationNote: dateCheck.dateNote,
    });
  }

  return records;
}

/**
 * แปลงข้อความ CSV ของชีต "สิทธิคงเหลือ" (ข้อมูลพนักงาน) เป็น EmployeeQuotaRecord[]
 */
export function parseQuotaCsvText(csvText: string): EmployeeQuotaRecord[] {
  const lines = csvText.split(/\r?\n/);
  const quotas: EmployeeQuotaRecord[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;
    const cols = parseCsvLine(rawLine);
    const empCode = String(cols[0] || '').trim();
    const firstName = stripThaiPrefix(String(cols[2] || '').trim());
    const lastName = String(cols[3] || '').trim();

    if (
      !empCode ||
      empCode.includes('ข้อมูลพนักงาน') ||
      empCode === 'รหัสพนักงาน' ||
      empCode.includes('ตารางข้อมูล')
    ) {
      continue;
    }

    const fullName =
      firstName && lastName
        ? `${firstName} ${lastName}`.trim()
        : stripThaiPrefix(String(cols[1] || '').trim());
    if (!fullName) continue;

    const num = (idx: number) => round2(parseOptionalNumber(cols[idx]) ?? 0);

    const sickQuota = num(6);
    const sickUsed = num(7);
    const sickRem = cols[8] !== undefined && cols[8] !== '' ? num(8) : round2(sickQuota - sickUsed);

    const persQuota = num(9);
    const persUsed = num(10);
    const persRem = cols[11] !== undefined && cols[11] !== '' ? num(11) : round2(persQuota - persUsed);

    const vacQuota = num(12);
    const vacUsed = num(13);
    const vacRem = cols[14] !== undefined && cols[14] !== '' ? num(14) : round2(vacQuota - vacUsed);

    const otherQuota = num(15);
    const otherUsed = num(16);
    const otherRem = cols[17] !== undefined && cols[17] !== '' ? num(17) : round2(otherQuota - otherUsed);

    quotas.push({
      empCode,
      fullName,
      nickname: firstName || fullName,
      department: String(cols[4] || '').trim(),
      position: String(cols[5] || '').trim(),
      sickQuotaDays: sickQuota,
      sickUsedDays: sickUsed,
      sickRemainingDays: sickRem,
      personalQuotaDays: persQuota,
      personalUsedDays: persUsed,
      personalRemainingDays: persRem,
      vacationQuotaDays: vacQuota,
      vacationUsedDays: vacUsed,
      vacationRemainingDays: vacRem,
      otherQuotaDays: otherQuota,
      otherUsedDays: otherUsed,
      otherRemainingDays: otherRem,
    });
  }

  return quotas;
}

/**
 * อ่านไฟล์ Excel (.xlsx / .xls) หรือ .csv ที่ผู้ใช้เลือกอัปโหลดในหน้าเว็บ
 */
export async function parseUploadedFile(file: File): Promise<{
  detectedType: 'attendance' | 'leave_form' | 'id_mapping' | 'unknown';
  attendanceRows: RawAttendanceRow[];
  leaveRecords: LeaveFormRecord[];
  quotaRecords: EmployeeQuotaRecord[];
  employeeMappings: EmployeeMapping[];
  sheetNames: string[];
}> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetNames = workbook.SheetNames;

  let attendanceRows: RawAttendanceRow[] = [];
  let leaveRecords: LeaveFormRecord[] = [];
  let quotaRecords: EmployeeQuotaRecord[] = [];
  const employeeMappings: EmployeeMapping[] = [];

  for (const sheetName of sheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    const csv = XLSX.utils.sheet_to_csv(ws, {
      blankrows: false,
      rawNumbers: false,
    });
    if (!csv.trim()) continue;

    if (
      csv.includes('รายงานบันทึกการเข้าถึง') ||
      (csv.includes('ID บุคคล') &&
        csv.includes('เข้าก่อน') &&
        csv.includes('ออกทีหลัง'))
    ) {
      const parsedAtt = parseAttendanceCsvText(csv, `ชีต ${sheetName}`);
      attendanceRows = attendanceRows.concat(parsedAtt);
    } else if (csv.includes('ประทับเวลา') && csv.includes('ประเภทการลา')) {
      const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
        header: 1,
        raw: false,
        dateNF: 'dd/mm/yyyy',
      });
      const parsedFromMatrix = parseLeaveFormMatrix(matrix);
      leaveRecords = leaveRecords.concat(
        parsedFromMatrix.length > 0
          ? parsedFromMatrix
          : parseLeaveFormCsvText(csv)
      );
    } else if (
      sheetName.includes('สิทธิคงเหลือ') ||
      sheetName.includes('ข้อมูลพนักงาน') ||
      (csv.includes('สิทธิ (วัน)') && csv.includes('คงเหลือ (วัน)'))
    ) {
      const parsedQuotas = parseQuotaCsvText(csv);
      quotaRecords = quotaRecords.concat(parsedQuotas);
    }
  }

  let detectedType: 'attendance' | 'leave_form' | 'id_mapping' | 'unknown' =
    'unknown';
  if (attendanceRows.length > 0) detectedType = 'attendance';
  else if (leaveRecords.length > 0 || quotaRecords.length > 0)
    detectedType = 'leave_form';
  else if (employeeMappings.length > 0) detectedType = 'id_mapping';

  return {
    detectedType,
    attendanceRows,
    leaveRecords,
    quotaRecords,
    employeeMappings,
    sheetNames,
  };
}

function parseLeaveFormMatrix(
  matrix: (string | number | null)[][]
): LeaveFormRecord[] {
  const records: LeaveFormRecord[] = [];
  let seq = 0;

  for (let i = 0; i < matrix.length; i++) {
    const cols = matrix[i];
    if (!cols || cols.length < 11) continue;

    const firstCol = String(cols[0] ?? '').trim();
    const secondCol = String(cols[1] ?? '').trim();
    if (
      !firstCol ||
      firstCol === 'ประทับเวลา' ||
      secondCol === 'ชื่อ' ||
      secondCol === 'ชื่อ-นามสกุล'
    ) {
      continue;
    }

    const rawStart = normalizeDateStr(cols[8], 'LEAVE_DMY');
    const rawEnd = normalizeDateStr(cols[9], 'LEAVE_DMY') || rawStart;
    if (!rawStart) continue;

    const hours = round2(parseLeaveHours(cols[10]));
    if (hours <= 0) continue;

    const dateCheck = inspectLeaveDateRange(rawStart, rawEnd, firstCol);
    const days = round2(hours / 8);

    const firstNameClean = stripThaiPrefix(secondCol);
    const lastNameClean = String(cols[2] ?? '').trim();
    const fullName = `${firstNameClean} ${lastNameClean}`.trim();

    const rawLeaveType = String(cols[7] ?? '').trim();
    const reason = String(cols[11] ?? '').trim();
    const status = String(cols[12] ?? 'รออนุมัติ').trim();
    const approvedDate =
      normalizeDateStr(cols[13], 'LEAVE_DMY') || String(cols[13] ?? '').trim();
    const note = '';

    const { leaveType, isUnpaidLeave } = classifyLeaveType(
      rawLeaveType,
      reason,
      note
    );
    const isHistoricalCarryover = detectHistoricalCarryoverOrTest(
      reason,
      note,
      hours,
      firstCol
    );

    seq++;
    records.push({
      id: `leave-${seq}-${dateCheck.startDate}`,
      timestamp: firstCol,
      fullName,
      nickname: firstNameClean,
      empCode: String(cols[3] ?? '').trim(),
      position: String(cols[6] ?? '').trim(),
      department: String(cols[5] ?? '').trim(),
      leaveType,
      reason,
      startDate: dateCheck.startDate,
      endDate: dateCheck.endDate,
      hours,
      days,
      attachmentUrl: '',
      status,
      approvedDate,
      note,
      isUnpaidLeave,
      isHistoricalCarryover,
      isCrossMonth: dateCheck.isCrossMonth,
      dateValidationNote: dateCheck.dateNote,
    });
  }

  return records;
}
