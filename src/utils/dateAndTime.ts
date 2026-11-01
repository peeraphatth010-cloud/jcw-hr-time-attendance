// ฟังก์ชันจัดการวันที่ เวลา และการแสดงผลวันลาแบบอ่านง่าย (1 วันทำงาน = 8 ชั่วโมง)

const THAI_MONTH_NAMES: Record<string, string> = {
  '01': 'มกราคม',
  '02': 'กุมภาพันธ์',
  '03': 'มีนาคม',
  '04': 'เมษายน',
  '05': 'พฤษภาคม',
  '06': 'มิถุนายน',
  '07': 'กรกฎาคม',
  '08': 'สิงหาคม',
  '09': 'กันยายน',
  '10': 'ตุลาคม',
  '11': 'พฤศจิกายน',
  '12': 'ธันวาคม',
};

const THAI_DAY_NAMES = [
  'อาทิตย์',
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัส',
  'ศุกร์',
  'เสาร์',
];

/**
 * ปัดเศษทศนิยม 2 ตำแหน่งสำหรับการคำนวณภายในระบบ
 */
export function round2(val: number | null | undefined): number {
  if (val === null || val === undefined || isNaN(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * แปลงตัวเลขวันลา (ฐาน 1 วัน = 8 ชั่วโมง) เป็นข้อความที่อ่านง่าย ไม่ลายตา
 * ตัวอย่าง:
 * - 0 -> "-" (หรือ "0 วัน" หากระบุ zeroText)
 * - 0.25 -> "2 ชม."
 * - 0.5 -> "ครึ่งวัน (4 ชม.)"
 * - 0.75 -> "6 ชม."
 * - 1 -> "1 วัน"
 * - 1.5 -> "1 วัน 4 ชม."
 * - 2.5 -> "2 วัน 4 ชม."
 * - 6.75 -> "6 วัน 6 ชม."
 * - 30 -> "30 วัน"
 */
export function formatLeaveHuman(
  days: number | null | undefined,
  options?: { zeroText?: string; compact?: boolean }
): string {
  const zeroText = options?.zeroText ?? '-';
  if (days === null || days === undefined || isNaN(days) || days <= 0) {
    return zeroText;
  }

  const totalHours = Math.round(days * 8 * 10) / 10;
  if (totalHours <= 0) return zeroText;

  const wholeDays = Math.floor((totalHours + 0.001) / 8);
  const remHours = Math.round((totalHours - wholeDays * 8) * 10) / 10;

  if (wholeDays > 0 && remHours <= 0) {
    return `${wholeDays} วัน`;
  }

  if (wholeDays === 0) {
    if (remHours === 4) {
      return options?.compact ? 'ครึ่งวัน (4 ชม.)' : 'ครึ่งวัน (4 ชม.)';
    }
    return `${remHours} ชม.`;
  }

  // กรณีมีทั้งจำนวนวันเต็ม และเศษชั่วโมง เช่น 1 วัน 4 ชม. หรือ 29 วัน 2 ชม.
  return `${wholeDays} วัน ${remHours} ชม.`;
}

/**
 * แสดงผลชั่วโมงแบบสะอาด ไม่มีทศนิยม .00 เกินจำเป็น เช่น 8 -> "8 ชม.", 4 -> "4 ชม."
 */
export function formatHoursClean(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || isNaN(hours) || hours <= 0) {
    return '0 ชม.';
  }
  const h = Math.round(hours * 10) / 10;
  return `${h} ชม.`;
}

/**
 * คงฟังก์ชัน format2 ไว้แต่ปรับให้เรียกแสดงผลตัวเลขสะอาด (ไม่แสดง .00 ที่ลายตา)
 */
export function format2(val: number | null | undefined): string {
  return formatLeaveHuman(val, { zeroText: '0 วัน' });
}

/**
 * แปลงปี พ.ศ. (เช่น 2568, 2569) เป็น ค.ศ. (2025, 2026)
 * และแปลงปี 2 หลัก (เช่น 69 -> 2026, 26 -> 2026)
 */
export function normalizeYear(y: number): number {
  if (y >= 2400) {
    return y - 543;
  }
  if (y < 100) {
    if (y >= 60) {
      return 2500 + y - 543;
    }
    return 2000 + y;
  }
  return y;
}

/**
 * แปลงค่าวันที่จาก Excel หรือข้อความให้เป็นมาตรฐาน YYYY-MM-DD เสมอ
 */
export function normalizeDateStr(
  raw: unknown,
  sourceType: 'ATTENDANCE_YMD' | 'LEAVE_DMY' = 'ATTENDANCE_YMD'
): string {
  if (raw === null || raw === undefined) return '';

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const y = normalizeYear(raw.getFullYear());
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const utcDays = Math.floor(raw - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const y = normalizeYear(dateInfo.getUTCFullYear());
    const m = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateInfo.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = String(raw).trim();
  if (!str || str === '-') return '';

  const datePart = str.split(/[\s,T]+/)[0].trim();

  // 1. รูปแบบที่ขึ้นต้นด้วยปี 4 หลัก: YYYY-MM-DD หรือ YYYY/MM/DD
  const ymdMatch = datePart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    const y = normalizeYear(parseInt(ymdMatch[1], 10));
    const p2 = parseInt(ymdMatch[2], 10);
    const p3 = parseInt(ymdMatch[3], 10);
    if (p2 >= 1 && p2 <= 12 && p3 >= 1 && p3 <= 31) {
      return `${y}-${String(p2).padStart(2, '0')}-${String(p3).padStart(2, '0')}`;
    }
    if (p3 >= 1 && p3 <= 12 && p2 >= 1 && p2 <= 31) {
      return `${y}-${String(p3).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
  }

  // 2. รูปแบบที่ลงท้ายด้วยปี 4 หลัก หรือ 2 หลัก: DD/MM/YYYY หรือ DD-MM-YYYY
  const dmyMatch = datePart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmyMatch) {
    const first = parseInt(dmyMatch[1], 10);
    const second = parseInt(dmyMatch[2], 10);
    const yearRaw = parseInt(dmyMatch[3], 10);
    const y = normalizeYear(yearRaw);

    if (sourceType === 'LEAVE_DMY') {
      if (first >= 1 && first <= 31 && second >= 1 && second <= 12) {
        return `${y}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
      }
      if (second >= 1 && second <= 31 && first >= 1 && first <= 12) {
        return `${y}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`;
      }
    } else {
      if (first > 12 && second >= 1 && second <= 12) {
        return `${y}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
      }
      if (first >= 1 && first <= 31 && second >= 1 && second <= 12) {
        return `${y}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
      }
      if (second > 12 && first >= 1 && first <= 12) {
        return `${y}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`;
      }
    }
  }

  return '';
}

/**
 * ตรวจสอบความถูกต้องของช่วงวันที่ลา และตรวจจับกรณีลาข้ามเดือนหรือลาล่วงหน้าต่างเดือน
 */
export function inspectLeaveDateRange(
  startRaw: string,
  endRaw: string,
  timestampRaw?: string
): {
  startDate: string;
  endDate: string;
  isSwapped: boolean;
  isCrossMonth: boolean;
  monthsCovered: string[];
  submittedYearMonth: string;
  isAdvanceOrBackdatedMonth: boolean;
  dateNote: string;
} {
  let s = startRaw || '';
  let e = endRaw || s;
  let isSwapped = false;

  if (s && e && s > e) {
    const tmp = s;
    s = e;
    e = tmp;
    isSwapped = true;
  }

  const weekdays = getWeekdaysInRange(s, e);
  const monthSet = new Set<string>();
  for (const d of weekdays) {
    monthSet.add(d.slice(0, 7));
  }
  if (monthSet.size === 0 && s.length >= 7) {
    monthSet.add(s.slice(0, 7));
  }
  const monthsCovered = Array.from(monthSet).sort();
  const isCrossMonth =
    monthsCovered.length > 1 ||
    (s.length >= 7 && e.length >= 7 && s.slice(0, 7) !== e.slice(0, 7));

  const tsNormalized = normalizeDateStr(timestampRaw, 'LEAVE_DMY');
  const submittedYearMonth = tsNormalized ? tsNormalized.slice(0, 7) : '';
  const isAdvanceOrBackdatedMonth = Boolean(
    submittedYearMonth &&
      s.length >= 7 &&
      submittedYearMonth !== s.slice(0, 7)
  );

  const notes: string[] = [];
  if (isSwapped) {
    notes.push('สลับวันเริ่มต้น-สิ้นสุดอัตโนมัติ');
  }
  if (isCrossMonth) {
    notes.push(`ลาข้ามเดือน (${monthsCovered.join(' → ')})`);
  }
  if (isAdvanceOrBackdatedMonth) {
    notes.push(
      `ยื่นในเดือน ${submittedYearMonth} สำหรับเดือน ${s.slice(0, 7)}`
    );
  }

  return {
    startDate: s,
    endDate: e,
    isSwapped,
    isCrossMonth,
    monthsCovered,
    submittedYearMonth,
    isAdvanceOrBackdatedMonth,
    dateNote: notes.join(' | '),
  };
}

/**
 * แปลงวันที่ YYYY-MM-DD เป็นรูปแบบแสดงผลภาษาไทย เช่น 01/10/2026 (พฤหัส)
 */
export function formatDateDisplay(
  ymd: string,
  includeDayName = false
): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || '-';
  const [y, m, d] = ymd.split('-');
  if (!includeDayName) {
    return `${d}/${m}/${y}`;
  }
  const dayName = getThaiDayOfWeek(ymd);
  return `${d}/${m}/${y} (${dayName})`;
}

/**
 * คืนค่าชื่อวันในสัปดาห์ภาษาไทยจาก YYYY-MM-DD
 */
export function getThaiDayOfWeek(ymd: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '-';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return THAI_DAY_NAMES[dt.getDay()] || '-';
}

/**
 * ตรวจสอบว่าเป็นวันทำงานปกติ (จันทร์ - ศุกร์) หรือไม่
 */
export function isWeekday(ymd: string): boolean {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  return day >= 1 && day <= 5;
}

/**
 * แปลง YYYY-MM เป็นชื่อเดือนภาษาไทย เช่น "ตุลาคม 2026 (2569)"
 */
export function formatYearMonthThai(yearMonth: string): string {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) return yearMonth;
  const [yStr, mStr] = yearMonth.split('-');
  const y = parseInt(yStr, 10);
  const thaiYear = y + 543;
  const monthName = THAI_MONTH_NAMES[mStr] || mStr;
  return `${monthName} ${y} (พ.ศ. ${thaiYear})`;
}

/**
 * แปลงข้อความเวลา เช่น "08:19:05" หรือ "08:15" เป็นจำนวนวินาทีตั้งแต่ 00:00:00
 */
export function parseTimeToSeconds(
  timeStr: string | undefined | null
): number | null {
  if (!timeStr) return null;
  const cleaned = String(timeStr).trim();
  if (!cleaned || cleaned === '-') return null;

  const match = cleaned.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * คำนวณการมาสายและผลต่อเบี้ยขยันตามกฎปกติ (เริ่มงาน 08:00, อนุโลมถึง 08:15, สายตั้งแต่ 08:16)
 */
export function calculateStandardLate(
  scanIn: string,
  strictZeroSecondsForDiligence = false
): {
  hasScanIn: boolean;
  isAfter0800: boolean;
  isGracePeriod0801To0815: boolean;
  isLate: boolean;
  lateCount: number;
  lateMinutes: number;
} {
  const sec = parseTimeToSeconds(scanIn);
  if (sec === null) {
    return {
      hasScanIn: false,
      isAfter0800: false,
      isGracePeriod0801To0815: false,
      isLate: false,
      lateCount: 0,
      lateMinutes: 0,
    };
  }

  const totalMinutes = Math.floor(sec / 60);
  const min0800 = 8 * 60;
  const min0815 = 8 * 60 + 15;

  const isAfter0800 = strictZeroSecondsForDiligence
    ? sec > 8 * 3600
    : totalMinutes > min0800;
  const isGracePeriod0801To0815 = isAfter0800 && totalMinutes <= min0815;
  const isLate = totalMinutes > min0815;
  const lateCount = isLate ? 1 : 0;
  const lateMinutes = isLate ? totalMinutes - min0815 : 0;

  return {
    hasScanIn: true,
    isAfter0800,
    isGracePeriod0801To0815,
    isLate,
    lateCount,
    lateMinutes,
  };
}

/**
 * คำนวณการมาสายสำหรับฝ่ายขายในวันทำงานถัดจากวันที่ "คาดว่าไปพบลูกค้า" (เกณฑ์ 09:00 น.)
 */
export function calculateSalesNextDayLate(scanIn: string): {
  hasScanIn: boolean;
  isLate: boolean;
  lateCount: number;
  lateMinutes: number;
} {
  const sec = parseTimeToSeconds(scanIn);
  if (sec === null) {
    return {
      hasScanIn: false,
      isLate: false,
      lateCount: 0,
      lateMinutes: 0,
    };
  }

  const totalMinutes = Math.floor(sec / 60);
  const min0900 = 9 * 60;

  const isLate = totalMinutes > min0900;
  const lateCount = isLate ? 1 : 0;
  const lateMinutes = isLate ? totalMinutes - min0900 : 0;

  return {
    hasScanIn: true,
    isLate,
    lateCount,
    lateMinutes,
  };
}

/**
 * สร้างรายการวันที่ทำงาน (จันทร์ - ศุกร์) ทั้งหมดในช่วงวันที่กำหนด
 */
export function getWeekdaysInRange(
  startYmd: string,
  endYmd: string
): string[] {
  if (!startYmd || !endYmd) return [];
  const start = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

  const result: string[] = [];
  const cur = new Date(start);
  let safety = 0;
  while (cur <= end && safety < 400) {
    const day = cur.getDay();
    if (day >= 1 && day <= 5) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      result.push(`${y}-${m}-${d}`);
    }
    cur.setDate(cur.getDate() + 1);
    safety++;
  }
  return result;
}
