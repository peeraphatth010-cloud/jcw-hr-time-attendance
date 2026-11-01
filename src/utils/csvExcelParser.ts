import * as XLSX from 'xlsx';
import {
  EmployeeMapping,
  EmployeeQuotaRecord,
  LeaveFormRecord,
  LeaveCategory,
  RawAttendanceRow,
} from '../types/attendance';
import { normalizeDateStr } from './dateAndTime';

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

function parseOptionalNumber(val: string | number | undefined | null): number | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s || s === '-') return null;
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * แปลงข้อความ CSV ของไฟล์ "บันทึกเข้างาน" (รองรับหลายเดือนต่อกัน) เป็นรายการ RawAttendanceRow[]
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

    // ตรวจจับชื่อเดือนในหัวกระดาษ เช่น "เดือนมกราคม2569" หรือ "เดือนตุลาคม2569"
    if (firstCol.startsWith('เดือน')) {
      currentSheetLabel = firstCol;
      continue;
    }

    // ข้ามบรรทัดหัวตารางหรือช่วงเวลา
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
export function parseLeaveHours(raw: string | number | undefined | null): number {
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
 * จัดหมวดหมู่ประเภทการลา และตรวจจับ "ลาไม่รับค่าจ้าง" อัตโนมัติจากเหตุผล/หมายเหตุ
 */
export function classifyLeaveType(
  rawType: string,
  reason: string,
  note: string
): { leaveType: LeaveCategory; isUnpaidLeave: boolean } {
  const t = (rawType || '').trim();
  const combinedText = `${t} ${reason || ''} ${note || ''}`.toLowerCase();

  const unpaidKeywords = ['ไม่รับค่าจ้าง', 'ลาไม่รับ', 'หักเงิน', 'หักค่าจ้าง', 'without pay', 'leave without pay'];
  const hasUnpaidKeyword = unpaidKeywords.some((kw) => combinedText.includes(kw));

  if (t.includes('ไม่รับค่าจ้าง') || t.includes('ลาไม่รับ')) {
    return { leaveType: 'ลาไม่รับค่าจ้าง', isUnpaidLeave: true };
  }
  if (t.includes('ป่วย')) {
    return { leaveType: 'ลาป่วย', isUnpaidLeave: hasUnpaidKeyword };
  }
  if (t.includes('กิจ')) {
    return { leaveType: 'ลากิจ', isUnpaidLeave: hasUnpaidKeyword };
  }
  if (t.includes('พักร้อน') || t.includes('พักผ่อน')) {
    return { leaveType: 'ลาพักร้อน', isUnpaidLeave: hasUnpaidKeyword };
  }
  // กรณี "ลาอื่นๆ" แต่ระบุในเหตุผลหรือหมายเหตุว่าไม่รับค่าจ้าง
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
  hours: number
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
    'บันทึกเดิม',
    'บันทึกใหม่',
    'สิทธิคงเหลือล่าสุด',
    'ทดสอบ',
    'ทด',
    'กดก',
  ];
  if (r === 'บันทึก') return true;
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
 * โครงสร้างคอลัมน์จริงของ JCW:
 * 0: ประทับเวลา, 1: ชื่อ, 2: นามสกุล, 3: รหัสพนักงาน, 4: วันเริ่มงาน, 5: แผนก/ฝ่าย, 6: ตำแหน่ง,
 * 7: ประเภทการลา, 8: ลาตั้งแต่วันที่ (Col I), 9: ถึงวันที่ (Col J), 10: ระบุชั่วโมงการลา,
 * 11: เหตุผลการลา, 12: สถานะการอนุมัติ, 13: วันเวลาที่บันทึกผล, 14: จำนวนวันที่ลา (คำนวณ)
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

    // ข้ามบรรทัดหัวตาราง
    if (
      firstCol === 'ประทับเวลา' ||
      secondCol === 'ชื่อ' ||
      secondCol === 'ชื่อ-นามสกุล' ||
      (!firstCol && !secondCol)
    ) {
      continue;
    }

    const startDate = normalizeDateStr(cols[8], 'LEAVE_DMY');
    const endDate = normalizeDateStr(cols[9], 'LEAVE_DMY') || startDate;
    if (!startDate) continue;

    const firstNameClean = stripThaiPrefix(cols[1] || '');
    const lastNameClean = (cols[2] || '').trim();
    const fullName = `${firstNameClean} ${lastNameClean}`.trim();

    const hours = parseLeaveHours(cols[10]);
    const days = Number((hours / 8).toFixed(4));
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
      hours
    );

    seq++;
    records.push({
      id: `leave-${seq}-${startDate}`,
      timestamp: firstCol,
      fullName,
      nickname: firstNameClean,
      empCode: String(cols[3] || '').trim(),
      position: String(cols[6] || '').trim(),
      department: String(cols[5] || '').trim(),
      leaveType,
      reason,
      startDate,
      endDate,
      hours,
      days,
      attachmentUrl: '',
      status,
      approvedDate,
      note,
      isUnpaidLeave,
      isHistoricalCarryover,
    });
  }

  return records;
}

/**
 * แปลงข้อความ CSV ของชีต "สิทธิคงเหลือ" (ข้อมูลพนักงาน) เป็น EmployeeQuotaRecord[]
 * โครงสร้างคอลัมน์จริงของ JCW:
 * 0: รหัสพนักงาน, 1: คำนำหน้า, 2: ชื่อ, 3: นามสกุล, 4: แผนก/ฝ่าย, 5: ตำแหน่ง,
 * 6: สิทธิป่วย, 7: ใช้ไปป่วย, 8: คงเหลือป่วย,
 * 9: สิทธิกิจ, 10: ใช้ไปกิจ, 11: คงเหลือกิจ,
 * 12: สิทธิพักร้อน, 13: ใช้ไปพักร้อน, 14: คงเหลือพักร้อน,
 * 15: สิทธิอื่นๆ, 16: ใช้ไปอื่นๆ, 17: คงเหลืออื่นๆ, 18: อีเมล, 19: ID บุคคล
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

    const num = (idx: number) => parseOptionalNumber(cols[idx]) ?? 0;

    quotas.push({
      empCode,
      fullName,
      nickname: firstName || fullName,
      department: String(cols[4] || '').trim(),
      sickQuotaDays: num(6),
      sickUsedDays: num(7),
      sickRemainingDays: num(8),
      personalQuotaDays: num(9),
      personalUsedDays: num(10),
      personalRemainingDays: num(11),
      vacationQuotaDays: num(12),
      vacationUsedDays: num(13),
      vacationRemainingDays: num(14),
      otherQuotaDays: num(15),
      otherUsedDays: num(16),
      otherRemainingDays: num(17),
    });
  }

  return quotas;
}

/**
 * อ่านไฟล์ Excel (.xlsx / .xls) หรือ .csv ที่ผู้ใช้เลือกอัปโหลดในหน้าเว็บ
 * รองรับทั้ง:
 * - ไฟล์บันทึกเข้างาน (อ่านทุกชีตที่มีข้อมูลสแกนนิ้ว เช่น ชีต 1 ถึง 10)
 * - ไฟล์แบบฟอร์มลาออนไลน์ (อ่านทั้งชีต "การตอบแบบฟอร์ม 1" และชีต "สิทธิคงเหลือ")
 * - ไฟล์ผูก ID บุคคล
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

    // แปลงชีตเป็น CSV เพื่อตรวจสอบโครงสร้างคอลัมน์
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false, rawNumbers: false });
    if (!csv.trim()) continue;

    if (
      csv.includes('รายงานบันทึกการเข้าถึง') ||
      (csv.includes('ID บุคคล') && csv.includes('เข้าก่อน') && csv.includes('ออกทีหลัง'))
    ) {
      const parsedAtt = parseAttendanceCsvText(csv, `ชีต ${sheetName}`);
      attendanceRows = attendanceRows.concat(parsedAtt);
    } else if (csv.includes('ประทับเวลา') && csv.includes('ประเภทการลา')) {
      // อ่านแบบ raw matrix เพื่อป้องกันปัญหาเรื่องการฟอร์แมตวันที่ DD/MM/YYYY ในคอลัมน์ I, J
      const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
        header: 1,
        raw: false,
        dateNF: 'dd/mm/yyyy',
      });
      const parsedFromMatrix = parseLeaveFormMatrix(matrix);
      leaveRecords = leaveRecords.concat(
        parsedFromMatrix.length > 0 ? parsedFromMatrix : parseLeaveFormCsvText(csv)
      );
    } else if (
      sheetName.includes('สิทธิคงเหลือ') ||
      (csv.includes('สิทธิ์วันลา') && csv.includes('วันลาคงเหลือ'))
    ) {
      const parsedQuotas = parseQuotaCsvText(csv);
      quotaRecords = quotaRecords.concat(parsedQuotas);
    } else if (csv.includes('ชื่อในเครื่องสแกนนิ้ว') || csv.includes('รหัสพนักงาน')) {
      // กรณีอัปโหลดตารางผูก ID บุคคล
      const lines = csv.split(/\r?\n/);
      for (const line of lines) {
        const cols = parseCsvLine(line);
        if (cols.length >= 4 && cols[0] !== 'ID บุคคล' && !isNaN(Number(cols[0]))) {
          employeeMappings.push({
            personId: String(cols[0]).trim(),
            scannerName: String(cols[1]).trim(),
            empCode: String(cols[2]).trim(),
            fullName: String(cols[3]).trim(),
            nickname: String(cols[4] || cols[1]).trim(),
            department: String(cols[5] || 'ฝ่ายแอดมิน').trim(),
          });
        }
      }
    }
  }

  let detectedType: 'attendance' | 'leave_form' | 'id_mapping' | 'unknown' = 'unknown';
  if (attendanceRows.length > 0) detectedType = 'attendance';
  else if (leaveRecords.length > 0 || quotaRecords.length > 0) detectedType = 'leave_form';
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

function parseLeaveFormMatrix(matrix: (string | number | null)[][]): LeaveFormRecord[] {
  const records: LeaveFormRecord[] = [];
  let seq = 0;

  for (let i = 0; i < matrix.length; i++) {
    const cols = matrix[i];
    if (!cols || cols.length < 10) continue;

    const firstCol = String(cols[0] ?? '').trim();
    const secondCol = String(cols[1] ?? '').trim();
    if (!firstCol || firstCol === 'ประทับเวลา' || secondCol === 'ชื่อ-นามสกุล') continue;

    const startDate = normalizeDateStr(cols[8], 'LEAVE_DMY');
    const endDate = normalizeDateStr(cols[9], 'LEAVE_DMY') || startDate;
    if (!startDate) continue;

    const hours = parseLeaveHours(cols[10]);
    const days = Number((hours / 8).toFixed(4));
    const reason = String(cols[7] ?? '').trim();
    const note = String(cols[14] ?? '').trim();
    const { leaveType, isUnpaidLeave } = classifyLeaveType(String(cols[6] ?? ''), reason, note);
    const isHistoricalCarryover = detectHistoricalCarryoverOrTest(reason, note, hours);

    seq++;
    records.push({
      id: `leave-${seq}-${startDate}`,
      timestamp: firstCol,
      fullName: secondCol,
      nickname: String(cols[2] ?? '').trim(),
      empCode: String(cols[3] ?? '').trim(),
      position: String(cols[4] ?? '').trim(),
      department: String(cols[5] ?? '').trim(),
      leaveType,
      reason,
      startDate,
      endDate,
      hours,
      days,
      attachmentUrl: String(cols[11] ?? '').trim(),
      status: String(cols[12] ?? 'รออนุมัติ').trim(),
      approvedDate: normalizeDateStr(cols[13], 'LEAVE_DMY') || String(cols[13] ?? '').trim(),
      note,
      isUnpaidLeave,
      isHistoricalCarryover,
    });
  }

  return records;
}
