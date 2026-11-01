// ฟังก์ชันจัดการวันที่และเวลาตามกฎ Attendance_Audit_Business_Rules_JCW
// ระวังเรื่องรูปแบบวันที่:
// 1. ไฟล์บันทึกเข้างาน (คอลัมน์ G) เรียง YYYY-MM-DD (ปี ค.ศ. - เดือน - วันที่)
// 2. ไฟล์แบบฟอร์มลาออนไลน์ (คอลัมน์ I, J) เรียง DD/MM/YYYY (วันที่ / เดือน / ปี) หรือ YYYY-MM-DD

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

const THAI_DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

/**
 * แปลงปี พ.ศ. (เช่น 2568, 2569) เป็น ค.ศ. (2025, 2026)
 * และแปลงปี 2 หลัก (เช่น 69 -> 2026, 26 -> 2026)
 */
export function normalizeYear(y: number): number {
  if (y >= 2400) {
    return y - 543;
  }
  if (y < 100) {
    // ถ้าเป็น 68, 69 (พ.ศ. ย่อ) -> 2568 - 543 = 2025
    if (y >= 60) {
      return 2500 + y - 543;
    }
    return 2000 + y;
  }
  return y;
}

/**
 * แปลงค่าวันที่จาก Excel หรือข้อความให้เป็นมาตรฐาน YYYY-MM-DD เสมอ
 * @param raw ค่าดิบจากเซลล์ (string, number, Date)
 * @param sourceType 'ATTENDANCE_YMD' สำหรับไฟล์สแกนนิ้ว (คอลัมน์ G: YYYY-MM-DD)
 *                   หรือ 'LEAVE_DMY' สำหรับไฟล์ใบลาออนไลน์ (คอลัมน์ I, J: DD/MM/YYYY)
 */
export function normalizeDateStr(
  raw: unknown,
  sourceType: 'ATTENDANCE_YMD' | 'LEAVE_DMY' = 'ATTENDANCE_YMD'
): string {
  if (raw === null || raw === undefined) return '';

  // กรณีเป็น Date object
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const y = normalizeYear(raw.getFullYear());
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // กรณีเป็นตัวเลข Serial Number ของ Excel (เช่น 46327)
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

  // ตัดส่วนเวลาออกถ้ามี เช่น "2026-10-01 00:00:00" หรือ "15/09/2026, 9:58:23"
  const datePart = str.split(/[\s,T]+/)[0].trim();

  // 1. รูปแบบที่ขึ้นต้นด้วยปี 4 หลัก: YYYY-MM-DD หรือ YYYY/MM/DD
  const ymdMatch = datePart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    const y = normalizeYear(parseInt(ymdMatch[1], 10));
    const p2 = parseInt(ymdMatch[2], 10);
    const p3 = parseInt(ymdMatch[3], 10);
    // กรณี YYYY-MM-DD ปกติ
    if (p2 >= 1 && p2 <= 12 && p3 >= 1 && p3 <= 31) {
      return `${y}-${String(p2).padStart(2, '0')}-${String(p3).padStart(2, '0')}`;
    }
    // เผื่อกรณี YYYY-DD-MM
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
      // คอลัมน์ I, J ของไฟล์แบบฟอร์มลาออนไลน์ เรียง วัน/เดือน/ปี (DD/MM/YYYY) เป็นหลัก
      if (first >= 1 && first <= 31 && second >= 1 && second <= 12) {
        return `${y}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
      }
      // fallback ถ้า second > 12 แปลว่าถูกแปลงเป็น MM/DD/YYYY มาจาก CSV
      if (second >= 1 && second <= 31 && first >= 1 && first <= 12) {
        return `${y}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`;
      }
    } else {
      // สำหรับไฟล์ทั่วไป ถ้าอันแรก > 12 แปลว่าเป็น DD/MM/YYYY แน่นอน
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
 * แปลงวันที่ YYYY-MM-DD เป็นรูปแบบแสดงผลภาษาไทย เช่น 01/10/2026 (พฤหัส)
 */
export function formatDateDisplay(ymd: string, includeDayName = false): string {
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
 * คืนค่า null ถ้าไม่มีข้อมูล ("-" หรือว่าง)
 */
export function parseTimeToSeconds(timeStr: string | undefined | null): number | null {
  if (!timeStr) return null;
  const cleaned = String(timeStr).trim();
  if (!cleaned || cleaned === '-') return null;

  const match = cleaned.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * คำนวณการมาสายและผลต่อเบี้ยขยันตามกฎปกติ (เริ่มงาน 08:00, อนุโลมถึง 08:15, สายตั้งแต่ 08:16)
 * - <= 08:00 (ไม่เกินนาทีที่ 08:00): ปกติ ไม่สาย ได้สิทธิเบี้ยขยัน
 * - 08:01 - 08:15: ไม่ถือว่าสาย (0 ครั้ง, 0 นาที) แต่เสียสิทธิเบี้ยขยัน
 * - >= 08:16: สาย 1 ครั้ง และคิดนาทีสายตั้งแต่นาทีหลัง 08:15 (เช่น 08:16 = 1 นาที, 08:19:05 = 4 นาที)
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

  const totalMinutes = Math.floor(sec / 60); // ตัดเศษวินาทีตามมาตรฐานตารางสแกนนิ้วบริษัท
  const min0800 = 8 * 60; // 480
  const min0815 = 8 * 60 + 15; // 495

  // ตรวจสอบว่าเกิน 08:00 น. หรือไม่ (ตามกฎ "08:01 - 08:15 เสียสิทธิเบี้ยขยัน")
  const isAfter0800 = strictZeroSecondsForDiligence ? sec > 8 * 3600 : totalMinutes > min0800;
  const isGracePeriod0801To0815 = isAfter0800 && totalMinutes <= min0815;
  const isLate = totalMinutes > min0815; // >= 08:16
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
 * คำนวณการมาสายสำหรับฝ่ายขายในวันทำงานถัดจากวันที่ "คาดว่าไปพบลูกค้า"
 * - อนุโลมให้เข้างานได้ถึง 09:00 น. โดยไม่ถือว่าสาย
 * - สแกนตั้งแต่ 09:01 น. ขึ้นไป ถือว่าสาย 1 ครั้ง และนับนาทีสายจากหลัง 09:00 น. (เช่น 09:09:41 = 9 นาที)
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
  const min0900 = 9 * 60; // 540

  const isLate = totalMinutes > min0900; // >= 09:01
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
 * สร้างรายการวันที่ทำงาน (จันทร์ - ศุกร์) ทั้งหมดในช่วงวันที่กำหนด (รวมวันเริ่มต้นและวันสิ้นสุด)
 */
export function getWeekdaysInRange(startYmd: string, endYmd: string): string[] {
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
