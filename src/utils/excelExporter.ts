import XLSX from 'xlsx-js-style';
import { HROverrideRecord, MonthlyAuditOutput } from '../types/attendance';
import {
  formatDateDisplay,
  formatHoursClean,
  formatLeaveHuman,
  formatYearMonthThai,
} from './dateAndTime';

type ThemeColor = 'navy' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'purple';

const THEME_PALETTES: Record<
  ThemeColor,
  {
    bannerBg: string;
    subBannerBg: string;
    subBannerFg: string;
    headerBg: string;
    totalBg: string;
  }
> = {
  navy: {
    bannerBg: '1E3A8A',
    subBannerBg: 'DBEAFE',
    subBannerFg: '1E3A8A',
    headerBg: '1E40AF',
    totalBg: '0F172A',
  },
  emerald: {
    bannerBg: '065F46',
    subBannerBg: 'D1FAE5',
    subBannerFg: '065F46',
    headerBg: '047857',
    totalBg: '064E3B',
  },
  amber: {
    bannerBg: '92400E',
    subBannerBg: 'FEF3C7',
    subBannerFg: '92400E',
    headerBg: 'B45309',
    totalBg: '78350F',
  },
  rose: {
    bannerBg: '9F1239',
    subBannerBg: 'FFE4E6',
    subBannerFg: '9F1239',
    headerBg: 'BE123C',
    totalBg: '881337',
  },
  indigo: {
    bannerBg: '312E81',
    subBannerBg: 'E0E7FF',
    subBannerFg: '312E81',
    headerBg: '4338CA',
    totalBg: '1E1B4B',
  },
  purple: {
    bannerBg: '581C87',
    subBannerBg: 'F3E8FF',
    subBannerFg: '581C87',
    headerBg: '6B21A8',
    totalBg: '3B0764',
  },
};

const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
};

const HEADER_BORDER = {
  top: { style: 'medium', color: { rgb: '1E293B' } },
  bottom: { style: 'medium', color: { rgb: '1E293B' } },
  left: { style: 'thin', color: { rgb: '94A3B8' } },
  right: { style: 'thin', color: { rgb: '94A3B8' } },
};

/**
 * คำนวณความกว้างข้อความภาษาไทยโดยไม่นับสระบน/ล่างและวรรณยุกต์ซ้อน
 */
function getThaiVisibleLength(text: string): number {
  const withoutCombining = (text || '').replace(
    /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g,
    ''
  );
  return withoutCombining.length;
}

/**
 * ตกแต่งตารางใน Worksheet ให้สวยงามระดับผู้บริหาร:
 * - ฟอนต์ Tahoma อ่านง่ายทั้งภาษาไทยและอังกฤษ
 * - แถบหัวเรื่องผสานเซลล์ (Merged Title & Subtitle Banner)
 * - หัวตารางใส่สีตามหมวดหมู่ ตัวหนา จัดกึ่งกลาง
 * - แถวข้อมูลสลับสี (Zebra Striping) + ไฮไลต์สีตามสถานะ (เบี้ยขยัน/มาสาย/ลาไม่รับค่าจ้าง/พบลูกค้า)
 * - ตีเส้นตารางครบทุกช่อง พร้อมปรับความกว้างคอลัมน์และความสูงแถวอัตโนมัติ
 */
function buildStyledWorksheet(params: {
  rows: (string | number)[][];
  theme: ThemeColor;
  centerCols?: number[];
  boldCols?: number[];
  customColWidths?: number[];
}): XLSX.WorkSheet {
  const {
    rows,
    theme,
    centerCols = [],
    boldCols = [],
    customColWidths,
  } = params;
  const palette = THEME_PALETTES[theme];
  const ws = XLSX.utils.aoa_to_sheet(rows);

  const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 1);

  // ผสานเซลล์แถวที่ 1 (ชื่อรายงาน) และแถวที่ 2 (คำอธิบายเกณฑ์)
  const merges: XLSX.Range[] = [];
  if (rows.length > 0 && maxCols > 1) {
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: maxCols - 1 } });
  }
  if (
    rows.length > 1 &&
    rows[1].length === 1 &&
    String(rows[1][0] || '').trim() !== '' &&
    maxCols > 1
  ) {
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: maxCols - 1 } });
  }
  ws['!merges'] = merges;

  // ค้นหาแถวที่เป็นหัวตาราง (Header Row) และแถวผลรวม (Total Row)
  const headerRowIndices = new Set<number>();
  const totalRowIndices = new Set<number>();
  const sectionTitleRowIndices = new Set<number>();

  rows.forEach((row, rIdx) => {
    if (rIdx === 0 || rIdx === 1) return;
    const firstCell = String(row[0] ?? '').trim();
    const secondCell = String(row[1] ?? '').trim();
    const nonEmptyCount = row.filter(
      (c) => String(c ?? '').trim() !== ''
    ).length;

    if (
      firstCell === 'ลำดับ' ||
      firstCell === 'วันที่' ||
      firstCell === 'หัวข้อสรุปสำคัญ' ||
      firstCell === 'ตัวชี้วัดสำคัญก่อนทำเงินเดือน' ||
      firstCell === 'ชื่อพนักงาน'
    ) {
      headerRowIndices.add(rIdx);
    } else if (
      secondCell.includes('รวมทั้งสิ้น') ||
      secondCell.includes('Grand Total') ||
      firstCell.includes('รวมทั้งสิ้น')
    ) {
      totalRowIndices.add(rIdx);
    } else if (rIdx > 2 && nonEmptyCount === 1 && firstCell.length > 10) {
      sectionTitleRowIndices.add(rIdx);
      if (maxCols > 1) {
        merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: maxCols - 1 } });
      }
    }
  });

  // กำหนดความสูงของแต่ละแถว (Row Heights)
  ws['!rows'] = rows.map((row, rIdx) => {
    if (rIdx === 0) return { hpt: 38 };
    if (rIdx === 1 && row.length === 1) return { hpt: 26 };
    if (headerRowIndices.has(rIdx)) return { hpt: 32 };
    if (totalRowIndices.has(rIdx)) return { hpt: 28 };
    if (sectionTitleRowIndices.has(rIdx)) return { hpt: 28 };
    const isBlank = row.every((c) => String(c ?? '').trim() === '');
    if (isBlank) return { hpt: 12 };
    return { hpt: 24 };
  });

  // ตกแต่งสไตล์ทุกเซลล์ในตาราง
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;

    const isTitleRow = r === 0;
    const isSubBannerRow =
      r === 1 && row.length === 1 && String(row[0] ?? '').trim() !== '';
    const isHeaderRow = headerRowIndices.has(r);
    const isTotalRow = totalRowIndices.has(r);
    const isSectionTitle = sectionTitleRowIndices.has(r);

    // ตรวจจับสีพื้นหลังของแถวข้อมูลตามความหมาย (Semantic Row Coloring)
    const rowJoined = row.map((c) => String(c ?? '')).join(' | ');
    let dataRowBg = r % 2 === 0 ? 'FFFFFF' : 'F8FAFC';

    if (!isHeaderRow && !isTotalRow && !isTitleRow && !isSubBannerRow) {
      if (
        rowJoined.includes('ได้รับเบี้ยขยัน') &&
        !rowJoined.includes('ไม่ได้รับเบี้ยขยัน')
      ) {
        dataRowBg = 'ECFDF5'; // เขียวอ่อนสบายตา
      } else if (rowJoined.includes('คาดว่าไปพบลูกค้า')) {
        dataRowBg = 'F0F9FF'; // ฟ้าอ่อน
      } else if (
        rowJoined.includes('พบสแกนเข้า แต่ไม่พบสแกนออก') ||
        rowJoined.includes('ไม่พบสแกนเข้า แต่พบสแกนออก')
      ) {
        dataRowBg = 'FFFBEB'; // เหลืองอำพันอ่อน
      }
    }

    const colLimit =
      isTitleRow || isSubBannerRow || isSectionTitle ? maxCols : row.length;

    for (let c = 0; c < colLimit; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      if (!ws[cellAddress]) {
        ws[cellAddress] = { t: 's', v: '' };
      }
      const cell = ws[cellAddress];
      const valStr = String(cell.v ?? '').trim();

      if (isTitleRow) {
        cell.s = {
          font: {
            name: 'Tahoma',
            sz: 14,
            bold: true,
            color: { rgb: 'FFFFFF' },
          },
          fill: { fgColor: { rgb: palette.bannerBg } },
          alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
        };
      } else if (isSubBannerRow) {
        cell.s = {
          font: {
            name: 'Tahoma',
            sz: 10,
            bold: false,
            color: { rgb: palette.subBannerFg },
          },
          fill: { fgColor: { rgb: palette.subBannerBg } },
          alignment: {
            vertical: 'center',
            horizontal: 'left',
            indent: 1,
            wrapText: true,
          },
        };
      } else if (isSectionTitle) {
        cell.s = {
          font: {
            name: 'Tahoma',
            sz: 11,
            bold: true,
            color: { rgb: palette.subBannerFg },
          },
          fill: { fgColor: { rgb: palette.subBannerBg } },
          alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
          border: THIN_BORDER,
        };
      } else if (isHeaderRow) {
        cell.s = {
          font: {
            name: 'Tahoma',
            sz: 10.5,
            bold: true,
            color: { rgb: 'FFFFFF' },
          },
          fill: { fgColor: { rgb: palette.headerBg } },
          alignment: {
            vertical: 'center',
            horizontal: 'center',
            wrapText: true,
          },
          border: HEADER_BORDER,
        };
      } else if (isTotalRow) {
        cell.s = {
          font: {
            name: 'Tahoma',
            sz: 10.5,
            bold: true,
            color: { rgb: 'FFFFFF' },
          },
          fill: { fgColor: { rgb: palette.totalBg } },
          alignment: {
            vertical: 'center',
            horizontal: c <= 1 ? 'left' : 'center',
            wrapText: true,
          },
          border: HEADER_BORDER,
        };
      } else {
        // แถวข้อมูลปกติ
        const isCentered =
          c === 0 ||
          centerCols.includes(c) ||
          valStr === '-' ||
          valStr.endsWith('วัน') ||
          valStr.endsWith('ชม.') ||
          valStr.includes('ครึ่งวัน') ||
          valStr.endsWith('ครั้ง') ||
          valStr.endsWith('นาที') ||
          valStr === 'ได้รับ' ||
          valStr === 'ไม่ได้รับ' ||
          valStr === 'ได้รับเบี้ยขยัน' ||
          valStr === 'ไม่ได้รับเบี้ยขยัน';

        let fontColor = '1E293B';
        let isBold = boldCols.includes(c) || c === 1;

        if (valStr === 'ได้รับเบี้ยขยัน' || valStr === 'ได้รับ') {
          fontColor = '047857';
          isBold = true;
        } else if (valStr === 'ไม่ได้รับเบี้ยขยัน' || valStr === 'ไม่ได้รับ') {
          fontColor = '64748B';
        } else if (valStr === '-') {
          fontColor = '94A3B8';
        } else if (
          valStr.includes('นาที') &&
          !valStr.startsWith('0 ') &&
          c >= 4 &&
          valStr.length < 15
        ) {
          fontColor = 'BE123C';
          isBold = true;
        }

        cell.s = {
          font: {
            name: 'Tahoma',
            sz: 10,
            bold: isBold,
            color: { rgb: fontColor },
          },
          fill: { fgColor: { rgb: dataRowBg } },
          alignment: {
            vertical: 'center',
            horizontal: isCentered ? 'center' : 'left',
            wrapText: true,
          },
          border: THIN_BORDER,
        };
      }
    }
  }

  // คำนวณความกว้างคอลัมน์อัตโนมัติ (Column Widths)
  if (customColWidths && customColWidths.length > 0) {
    ws['!cols'] = customColWidths.map((w) => ({ wch: w }));
  } else {
    const colWidths: { wch: number }[] = [];
    for (let c = 0; c < maxCols; c++) {
      let maxLen = 10;
      for (let r = 2; r < rows.length; r++) {
        if (sectionTitleRowIndices.has(r)) continue;
        const val = String(rows[r]?.[c] ?? '');
        const visibleLen = getThaiVisibleLength(val);
        if (visibleLen > maxLen) {
          maxLen = visibleLen;
        }
      }
      const padded = Math.min(Math.max(maxLen + 5, c === 0 ? 8 : 14), 52);
      colWidths.push({ wch: padded });
    }
    ws['!cols'] = colWidths;
  }

  return ws;
}

/**
 * แบบที่ 1: รายงานหัวหน้า / ผู้บริหาร (Manager Report)
 * สั้น อ่านง่าย จัดสีและฟอนต์สวยงาม แสดงวันลาเป็นวันและชั่วโมง (เช่น 1 วัน, ครึ่งวัน (4 ชม.), 2 ชม.)
 */
export function exportManagerReportToExcel(audit: MonthlyAuditOutput): void {
  const wb = XLSX.utils.book_new();
  const monthLabel = formatYearMonthThai(audit.yearMonth);

  const totalEmployees = audit.activitySummaryReport.length;
  const latePeople = audit.lateSummaryReport.filter((l) => l.lateCount > 0);
  const eligibleList = audit.diligenceReport.filter((d) => d.isEligible);
  const ineligibleList = audit.diligenceReport.filter((d) => !d.isEligible);

  // ============================================================================
  // ชีตที่ 1: หน้าสรุปผู้บริหาร 1 หน้า (Executive 1-Page Summary)
  // ============================================================================
  const execRows: (string | number)[][] = [
    [`สรุปผู้บริหาร (Executive 1-Page Summary) — ประจำเดือน ${monthLabel}`],
    [
      'รายงานสรุปสำหรับหัวหน้างานและผู้บริหาร (1 วันทำงาน = 8 ชั่วโมง | ตัดข้อมูลเทคนิค อ่านง่าย)',
    ],
    [],
    ['หัวข้อสรุปสำคัญ', 'ตัวเลขสรุป', 'รายละเอียดประกอบ'],
    [
      '1. พนักงานทั้งหมดที่ตรวจสอบในเดือน',
      `${totalEmployees} คน`,
      `วันทำการที่มีข้อมูลในเดือนนี้ ${audit.workdaysInMonth.length} วันทำการ`,
    ],
    [
      '2. สถิติการมาสาย (กี่คน / กี่ครั้ง / กี่นาที)',
      `${latePeople.length} คน / ${audit.activityGrandTotal.lateCount} ครั้ง / ${audit.activityGrandTotal.lateMinutes} นาที`,
      latePeople.length > 0
        ? latePeople
            .map(
              (p) =>
                `${p.fullName} (${p.nickname}): ${p.lateCount} ครั้ง (${p.lateMinutes} นาที)`
            )
            .join(' | ')
        : 'ไม่มีพนักงานมาสายในเดือนนี้',
    ],
    [
      '3. ลาไม่รับค่าจ้าง',
      formatLeaveHuman(audit.activityGrandTotal.unpaidDays, {
        zeroText: '0 วัน',
      }),
      audit.unpaidAndOtherLeaveReport
        .filter((u) => u.unpaidDays > 0)
        .map(
          (u) =>
            `${u.fullName} (${u.nickname}): ${formatLeaveHuman(u.unpaidDays)}`
        )
        .join(' | ') || 'ไม่มีการลาไม่รับค่าจ้างในเดือนนี้',
    ],
    [
      '4. ผู้ได้รับเบี้ยขยัน / ไม่ได้รับเบี้ยขยัน',
      `ได้รับ ${eligibleList.length} คน / ไม่ได้รับ ${ineligibleList.length} คน`,
      eligibleList.length > 0
        ? `ผู้ได้รับเบี้ยขยัน: ${eligibleList.map((e) => `${e.fullName} (${e.nickname})`).join(', ')}`
        : 'ไม่มีผู้ได้รับเบี้ยขยันในเดือนนี้',
    ],
    [
      '5. รายการที่ต้องให้ HR ตรวจสอบ (HR Exception)',
      `${audit.scanAnomalyRecords.length} รายการ`,
      `มีสแกนเข้าแต่ไม่มีสแกนออก ${audit.scanAnomalyRecords.filter((r) => r.scanStatus === 'พบสแกนเข้า แต่ไม่พบสแกนออก').length} รายการ | ไม่มีสแกนเข้าแต่มีสแกนออก ${audit.scanAnomalyRecords.filter((r) => r.scanStatus === 'ไม่พบสแกนเข้า แต่พบสแกนออก').length} รายการ | คาดว่าไปพบลูกค้า ${audit.scanAnomalyRecords.filter((r) => r.scanStatus === 'คาดว่าไปพบลูกค้า' || r.scanStatus === 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา').length} รายการ`,
    ],
    [],
    ['ตารางสรุปผลการพิจารณาเบี้ยขยันรายบุคคล'],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'วันลารวมในเดือน',
      'สถานะเบี้ยขยัน',
      'เหตุผลสรุป',
    ],
    ...audit.diligenceReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      formatLeaveHuman(item.totalLeaveDays),
      item.isEligible ? 'ได้รับเบี้ยขยัน' : 'ไม่ได้รับเบี้ยขยัน',
      item.isEligible
        ? 'มาทำงานตรงเวลาทุกวัน และลาไม่เกิน 1 วัน'
        : item.disqualifyReasons[0] || '-',
    ]),
  ];
  const wsExec = buildStyledWorksheet({
    rows: execRows,
    theme: 'navy',
    customColWidths: [10, 26, 14, 28, 16, 18, 18, 48],
  });
  XLSX.utils.book_append_sheet(wb, wsExec, '1_สรุปผู้บริหาร_1หน้า');

  // ============================================================================
  // ชีตที่ 2: ตารางสรุปภาพรวมรายบุคคลสำหรับหัวหน้า (สั้น อ่านง่าย)
  // ============================================================================
  const summaryRows: (string | number)[][] = [
    [
      `สรุปภาพรวมการมาทำงานและการลารายบุคคล (รายงานหัวหน้า) — ประจำเดือน ${monthLabel}`,
    ],
    [
      'หน่วยการลา: คิดตามเวลาทำงานจริง 1 วัน = 8 ชั่วโมง (เช่น ครึ่งวัน = 4 ชม., 2 ชม. = ลารายชั่วโมง) ช่องที่ไม่มีการลาแสดง "-" เพื่อให้อ่านง่าย',
    ],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'มาสาย (ครั้ง)',
      'เวลามาสายรวม',
      'ลาป่วย',
      'ลากิจ',
      'ลาพักร้อน',
      'ลาไม่รับค่าจ้าง',
      'ลาอื่นๆ',
      'รวมวันลาทั้งเดือน',
      'เบี้ยขยัน',
    ],
    ...audit.activitySummaryReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      item.lateCount > 0 ? `${item.lateCount} ครั้ง` : '-',
      item.lateMinutes > 0 ? `${item.lateMinutes} นาที` : '-',
      formatLeaveHuman(item.sickDays),
      formatLeaveHuman(item.personalDays),
      formatLeaveHuman(item.vacationDays),
      formatLeaveHuman(item.unpaidDays),
      formatLeaveHuman(item.otherDays),
      formatLeaveHuman(item.totalLeaveDays),
      item.diligenceEligible ? 'ได้รับเบี้ยขยัน' : 'ไม่ได้รับ',
    ]),
    [],
    [
      '',
      'รวมทั้งบริษัท (Grand Total)',
      '',
      '',
      '',
      `${audit.activityGrandTotal.lateCount} ครั้ง`,
      `${audit.activityGrandTotal.lateMinutes} นาที`,
      formatLeaveHuman(audit.activityGrandTotal.sickDays, {
        zeroText: '0 วัน',
      }),
      formatLeaveHuman(audit.activityGrandTotal.personalDays, {
        zeroText: '0 วัน',
      }),
      formatLeaveHuman(audit.activityGrandTotal.vacationDays, {
        zeroText: '0 วัน',
      }),
      formatLeaveHuman(audit.activityGrandTotal.unpaidDays, {
        zeroText: '0 วัน',
      }),
      formatLeaveHuman(audit.activityGrandTotal.otherDays, {
        zeroText: '0 วัน',
      }),
      formatLeaveHuman(audit.activityGrandTotal.totalLeaveDays, {
        zeroText: '0 วัน',
      }),
      `ได้รับ ${audit.activityGrandTotal.diligenceEligibleCount} คน`,
    ],
  ];
  const wsSummary = buildStyledWorksheet({
    rows: summaryRows,
    theme: 'indigo',
  });
  XLSX.utils.book_append_sheet(wb, wsSummary, '2_สรุปรายคน_สาย_ลา_เบี้ยขยัน');

  // ============================================================================
  // ชีตที่ 3: สิทธิวันลาคงเหลือรายบุคคล
  // ============================================================================
  const quotaRows: (string | number)[][] = [
    [`สรุปสิทธิวันลาคงเหลือรายบุคคล — ประจำเดือน ${monthLabel}`],
    [
      'แสดงวันลาคงเหลือเป็นหน่วย วัน และ ชั่วโมง (1 วัน = 8 ชั่วโมง) อ่านง่าย ไม่ใช้ทศนิยมยาว',
    ],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'คงเหลือ ลาป่วย',
      'คงเหลือ ลากิจ',
      'คงเหลือ ลาพักร้อน',
      'คงเหลือ ลาอื่นๆ',
      `ใช้ในเดือนนี้ - ลาป่วย`,
      `ใช้ในเดือนนี้ - ลากิจ`,
      `ใช้ในเดือนนี้ - ลาพักร้อน`,
      `ใช้ในเดือนนี้ - ไม่รับค่าจ้าง/อื่นๆ`,
    ],
    ...audit.quotaReport.map((q, idx) => [
      idx + 1,
      q.fullName,
      q.nickname,
      q.position,
      q.department,
      formatLeaveHuman(q.sickRemaining, { zeroText: '0 วัน' }),
      formatLeaveHuman(q.personalRemaining, { zeroText: '0 วัน' }),
      formatLeaveHuman(q.vacationRemaining, { zeroText: '0 วัน' }),
      formatLeaveHuman(q.otherRemaining, { zeroText: '0 วัน' }),
      formatLeaveHuman(q.monthSickUsed),
      formatLeaveHuman(q.monthPersonalUsed),
      formatLeaveHuman(q.monthVacationUsed),
      formatLeaveHuman(q.monthOtherAndUnpaidUsed),
    ]),
  ];
  const wsQuota = buildStyledWorksheet({
    rows: quotaRows,
    theme: 'emerald',
  });
  XLSX.utils.book_append_sheet(wb, wsQuota, '3_สิทธิวันลาคงเหลือ');

  XLSX.writeFile(wb, `JCW_รายงานหัวหน้า_Manager_Report_${audit.yearMonth}.xlsx`);
}

/**
 * แบบที่ 2: รายงาน HR / Payroll ฉบับสมบูรณ์ (HR & Payroll Detailed Report)
 * ตกแต่งสีและฟอนต์สวยงาม แยกชีตครบทั้ง 10 ชีต พร้อมสแกนต้นฉบับ หมายเหตุ และประวัติการแก้ไข
 */
export function exportHRPayrollReportToExcel(
  audit: MonthlyAuditOutput,
  hrOverrides: Record<string, HROverrideRecord> = {}
): void {
  const wb = XLSX.utils.book_new();
  const monthLabel = formatYearMonthThai(audit.yearMonth);

  const totalEmployees = audit.activitySummaryReport.length;
  const latePeople = audit.lateSummaryReport.filter((l) => l.lateCount > 0);
  const eligibleList = audit.diligenceReport.filter((d) => d.isEligible);
  const ineligibleList = audit.diligenceReport.filter((d) => !d.isEligible);

  // ============================================================================
  // ชีตที่ 1: หน้าสรุปผู้บริหาร 1 หน้า (Executive 1-Page Summary)
  // ============================================================================
  const sheet0Rows: (string | number)[][] = [
    [`หน้าสรุปผู้บริหาร 1 หน้า (Executive Summary) — ประจำเดือน ${monthLabel}`],
    [
      'สรุป 5 ตัวชี้วัดหลักก่อนทำเงินเดือน (1 วันทำงาน = 8 ชั่วโมง | ข้อมูลตรงกันทุกรายงาน 100%)',
    ],
    [],
    ['ตัวชี้วัดสำคัญก่อนทำเงินเดือน', 'ผลลัพธ์สรุป', 'รายละเอียดประกอบ'],
    [
      '1. พนักงานทั้งหมด',
      `${totalEmployees} คน`,
      `ตรวจสอบจากวันทำงานจริง ${audit.workdaysInMonth.length} วันทำการ`,
    ],
    [
      '2. มาสายกี่คน / กี่ครั้ง / กี่นาที',
      `${latePeople.length} คน / ${audit.activityGrandTotal.lateCount} ครั้ง / ${audit.activityGrandTotal.lateMinutes} นาที`,
      latePeople
        .map(
          (p) =>
            `${p.fullName} (${p.nickname}): ${p.lateCount} ครั้ง (${p.lateMinutes} นาที)`
        )
        .join(' | ') || 'ไม่มีผู้มาสาย',
    ],
    [
      '3. ลาไม่รับค่าจ้าง',
      `${formatLeaveHuman(audit.activityGrandTotal.unpaidDays, { zeroText: '0 วัน' })} (${formatHoursClean(audit.activityGrandTotal.unpaidHours)})`,
      audit.unpaidAndOtherLeaveReport
        .filter((u) => u.unpaidDays > 0)
        .map(
          (u) =>
            `${u.fullName} (${u.nickname}): ${formatLeaveHuman(u.unpaidDays)}`
        )
        .join(' | ') || 'ไม่มีการลาไม่รับค่าจ้าง',
    ],
    [
      '4. ผู้ได้รับ / ไม่ได้รับเบี้ยขยัน',
      `ได้รับ ${eligibleList.length} คน / ไม่ได้รับ ${ineligibleList.length} คน`,
      eligibleList.length > 0
        ? `ผู้ได้รับเบี้ยขยัน: ${eligibleList.map((e) => `${e.fullName} (${e.nickname})`).join(', ')}`
        : 'ไม่มีผู้ได้รับเบี้ยขยัน',
    ],
    [
      '5. รายการที่ต้องให้ HR ตรวจสอบ (HR Exception)',
      `${audit.scanAnomalyRecords.length} รายการ`,
      `สแกนไม่ครบหรือฝ่ายขายคาดว่าไปพบลูกค้า ${audit.scanAnomalyRecords.length} รายการ (ดูรายละเอียดในชีต 8_HR_Exception)`,
    ],
  ];
  const ws0 = buildStyledWorksheet({
    rows: sheet0Rows,
    theme: 'navy',
    customColWidths: [34, 30, 75],
  });
  XLSX.utils.book_append_sheet(wb, ws0, '1_สรุปผู้บริหาร');

  // ============================================================================
  // ชีตที่ 2: รายงานที่ 1 ผู้ได้รับเบี้ยขยัน
  // ============================================================================
  const sheet1Rows: (string | number)[][] = [
    [`รายงานที่ 1: สรุปรายชื่อผู้ได้รับเบี้ยขยัน ประจำเดือน ${monthLabel}`],
    [
      'เกณฑ์บริษัท: (1) พนักงานทุกแผนก (รวมฝ่ายขาย ยกเว้นตำแหน่งเจ้าหน้าที่ฝ่ายขาย) (2) สแกนเข้างานไม่เกิน 08:00 น. ทุกวันทำงาน (3) วันลารวมทุกประเภทในเดือนไม่เกิน 1 วัน (8 ชม.)',
    ],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'ผลการพิจารณาเบี้ยขยัน',
      'จำนวนวันมาทำงาน',
      'วันที่สแกนเกิน 08:00 น.',
      'วันลารวมในเดือน',
      'เหตุผลประกอบ / หมายเหตุ',
    ],
    ...audit.diligenceReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      item.isEligible ? 'ได้รับเบี้ยขยัน' : 'ไม่ได้รับเบี้ยขยัน',
      `${item.daysWorked} วัน`,
      item.daysScanAfter0800 > 0 ? `${item.daysScanAfter0800} วัน` : '-',
      formatLeaveHuman(item.totalLeaveDays),
      item.isEligible
        ? 'ผ่านเกณฑ์ครบทั้ง 3 ข้อ'
        : item.disqualifyReasons.join(' | '),
    ]),
  ];
  const ws1 = buildStyledWorksheet({
    rows: sheet1Rows,
    theme: 'emerald',
  });
  XLSX.utils.book_append_sheet(wb, ws1, '2_เบี้ยขยัน');

  // ============================================================================
  // ชีตที่ 3: รายงานที่ 2 สรุปการมาสาย
  // ============================================================================
  const sheet2Rows: (string | number)[][] = [
    [`รายงานที่ 2: สรุปการเข้างานสาย ประจำเดือน ${monthLabel}`],
    [
      'เกณฑ์เวลาสาย: สแกนเข้าตั้งแต่ 08:16 น. ขึ้นไป (นับนาทีสายจากหลัง 08:15 น.) / ฝ่ายขายวันถัดจากพบลูกค้า อนุโลมถึง 09:00 น.',
    ],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'จำนวนครั้งที่สาย',
      'รวมเวลาสาย (นาที)',
      'รายละเอียดวันที่มาสาย (วันที่ : เวลาสแกนเข้า -> นาทีสาย)',
    ],
    ...audit.lateSummaryReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      item.lateCount > 0 ? `${item.lateCount} ครั้ง` : '-',
      item.lateMinutes > 0 ? `${item.lateMinutes} นาที` : '-',
      item.dailyDetails.length > 0
        ? item.dailyDetails
            .map(
              (d) =>
                `${formatDateDisplay(d.date)} (เข้า ${d.scanIn} = สาย ${d.lateMinutes} นาที)`
            )
            .join(', ')
        : 'ไม่มาสาย',
    ]),
    [],
    [
      '',
      'รวมทั้งสิ้น (Grand Total)',
      '',
      '',
      '',
      `${audit.activityGrandTotal.lateCount} ครั้ง`,
      `${audit.activityGrandTotal.lateMinutes} นาที`,
      `มีผู้มาสายรวม ${latePeople.length} คน จากทั้งหมด ${totalEmployees} คน`,
    ],
  ];
  const ws2 = buildStyledWorksheet({
    rows: sheet2Rows,
    theme: 'amber',
  });
  XLSX.utils.book_append_sheet(wb, ws2, '3_สรุปมาสาย');

  // ============================================================================
  // ชีตที่ 4: รายงานที่ 3 การลาไม่รับค่าจ้าง และ ลาอื่นๆ
  // ============================================================================
  const sheet3Rows: (string | number)[][] = [
    [
      `รายงานที่ 3: สรุปการลาไม่รับค่าจ้าง และ ลาอื่นๆ ประจำเดือน ${monthLabel}`,
    ],
    [
      'อัตราการแปลงเวลา: 1 วันทำงาน = 8 ชั่วโมง (เช่น ครึ่งวัน = 4 ชม., ลารายชั่วโมง = 2 ชม.)',
    ],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'ลาไม่รับค่าจ้าง',
      'ชั่วโมงลาไม่รับค่าจ้าง',
      'ลาอื่นๆ',
      'ชั่วโมงลาอื่นๆ',
      'รวมทั้ง 2 ประเภท',
      'รายละเอียดวันที่และเหตุผล',
    ],
    ...audit.unpaidAndOtherLeaveReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      formatLeaveHuman(item.unpaidDays),
      item.unpaidHours > 0 ? formatHoursClean(item.unpaidHours) : '-',
      formatLeaveHuman(item.otherDays),
      item.otherHours > 0 ? formatHoursClean(item.otherHours) : '-',
      formatLeaveHuman(item.totalDays),
      item.details.length > 0
        ? item.details
            .map(
              (d) =>
                `${formatDateDisplay(d.date)}: ${d.type} ${formatLeaveHuman(d.days)} (${d.reason})`
            )
            .join(' | ')
        : '-',
    ]),
    [],
    [
      '',
      'รวมทั้งสิ้น (Grand Total)',
      '',
      '',
      '',
      formatLeaveHuman(audit.activityGrandTotal.unpaidDays, {
        zeroText: '0 วัน',
      }),
      formatHoursClean(audit.activityGrandTotal.unpaidHours),
      formatLeaveHuman(audit.activityGrandTotal.otherDays, {
        zeroText: '0 วัน',
      }),
      formatHoursClean(audit.activityGrandTotal.otherHours),
      formatLeaveHuman(
        audit.activityGrandTotal.unpaidDays +
          audit.activityGrandTotal.otherDays,
        { zeroText: '0 วัน' }
      ),
      '',
    ],
  ];
  const ws3 = buildStyledWorksheet({
    rows: sheet3Rows,
    theme: 'rose',
  });
  XLSX.utils.book_append_sheet(wb, ws3, '4_ลาไม่รับค่าจ้าง_อื่นๆ');

  // ============================================================================
  // ชีตที่ 5: รายงานที่ 4 การใช้สิทธิการลาในเดือน & การตรวจสอบวันลาข้ามเดือน
  // ============================================================================
  const sheet4Rows: (string | number)[][] = [
    [`รายงานที่ 4: รายละเอียดการใช้สิทธิการลาในเดือน ประจำเดือน ${monthLabel}`],
    [
      'แสดงรายการใบลาที่อนุมัติในเดือนนี้ พร้อมแปลงหน่วยเป็นวันและชั่วโมงที่อ่านง่าย (1 วัน = 8 ชม.)',
    ],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'ประเภทการลา',
      'สถานะรับค่าจ้าง',
      'ตั้งแต่วันที่',
      'ถึงวันที่',
      'ระยะเวลาที่ลา',
      'คิดเป็นชั่วโมง',
      'เหตุผลการลา',
      'สถานะอนุมัติ',
      'การตรวจสอบวันที่/ข้ามเดือน',
    ],
    ...audit.monthlyLeaveUsageReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      item.leaveType,
      item.isUnpaid ? 'ไม่รับค่าจ้าง' : 'ตามสิทธิ์ปกติ',
      formatDateDisplay(item.startDate),
      formatDateDisplay(item.endDate),
      formatLeaveHuman(item.days),
      formatHoursClean(item.hours),
      item.reason,
      item.status,
      item.dateValidationNote || 'ปกติ (ตรงเดือน)',
    ]),
    [],
    [
      '',
      'รวมการใช้สิทธิลาในเดือนทั้งสิ้น',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      formatLeaveHuman(audit.activityGrandTotal.totalLeaveDays, {
        zeroText: '0 วัน',
      }),
      formatHoursClean(audit.activityGrandTotal.totalLeaveHours),
      '',
      '',
      '',
    ],
    [],
    [
      `รายการตรวจพบใบลาข้ามเดือน หรือ ใบลายื่นล่วงหน้าสำหรับเดือนอื่น (${audit.crossMonthOrFutureLeaves.length} รายการ)`,
    ],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'ประเภทการลา',
      'ตั้งแต่วันที่',
      'ถึงวันที่',
      'หักในเดือนนี้',
      'รวมในใบลาทั้งหมด',
      'ผลการตรวจสอบวันที่ข้ามเดือน / ล่วงหน้า',
      'เหตุผลการลา',
    ],
    ...audit.crossMonthOrFutureLeaves.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      item.leaveType,
      formatDateDisplay(item.startDate),
      formatDateDisplay(item.endDate),
      formatLeaveHuman(item.days, { zeroText: '0 วัน' }),
      formatLeaveHuman(item.totalRequestedDays ?? item.days),
      item.dateValidationNote || '-',
      item.reason,
    ]),
  ];
  const ws4 = buildStyledWorksheet({
    rows: sheet4Rows,
    theme: 'indigo',
  });
  XLSX.utils.book_append_sheet(wb, ws4, '5_การใช้สิทธิลา_ข้ามเดือน');

  // ============================================================================
  // ชีตที่ 6: รายงานที่ 5 สรุปกิจกรรมการลาและมาสาย (รายบุคคล + รวมทั้งบริษัท)
  // ============================================================================
  const sheet5Rows: (string | number)[][] = [
    [
      `รายงานที่ 5: สรุปกิจกรรมการลาทุกประเภทและสถิติการมาสาย ประจำเดือน ${monthLabel}`,
    ],
    [
      'แสดงยอดสรุปเป็นวันและชั่วโมง (เช่น 1 วัน, ครึ่งวัน (4 ชม.), 2 ชม.) ช่องที่ไม่มีการลาแสดง "-" เพื่อไม่ให้ตัวเลขลายตา',
    ],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'ลาป่วย',
      'ลากิจ',
      'ลาพักร้อน',
      'ลาไม่รับค่าจ้าง',
      'ลาอื่นๆ',
      'รวมวันลาทั้งหมด',
      'รวมชั่วโมงลา',
      'มาสาย (ครั้ง)',
      'เวลามาสายรวม',
      'สิทธิเบี้ยขยัน',
    ],
    ...audit.activitySummaryReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      formatLeaveHuman(item.sickDays),
      formatLeaveHuman(item.personalDays),
      formatLeaveHuman(item.vacationDays),
      formatLeaveHuman(item.unpaidDays),
      formatLeaveHuman(item.otherDays),
      formatLeaveHuman(item.totalLeaveDays),
      item.totalLeaveHours > 0 ? formatHoursClean(item.totalLeaveHours) : '-',
      item.lateCount > 0 ? `${item.lateCount} ครั้ง` : '-',
      item.lateMinutes > 0 ? `${item.lateMinutes} นาที` : '-',
      item.diligenceEligible ? 'ได้รับเบี้ยขยัน' : 'ไม่ได้รับ',
    ]),
    [],
    [
      '',
      'รวมทั้งสิ้น (Grand Total)',
      '',
      '',
      '',
      formatLeaveHuman(audit.activityGrandTotal.sickDays, {
        zeroText: '0 วัน',
      }),
      formatLeaveHuman(audit.activityGrandTotal.personalDays, {
        zeroText: '0 วัน',
      }),
      formatLeaveHuman(audit.activityGrandTotal.vacationDays, {
        zeroText: '0 วัน',
      }),
      formatLeaveHuman(audit.activityGrandTotal.unpaidDays, {
        zeroText: '0 วัน',
      }),
      formatLeaveHuman(audit.activityGrandTotal.otherDays, {
        zeroText: '0 วัน',
      }),
      formatLeaveHuman(audit.activityGrandTotal.totalLeaveDays, {
        zeroText: '0 วัน',
      }),
      formatHoursClean(audit.activityGrandTotal.totalLeaveHours),
      `${audit.activityGrandTotal.lateCount} ครั้ง`,
      `${audit.activityGrandTotal.lateMinutes} นาที`,
      `ได้รับ ${audit.activityGrandTotal.diligenceEligibleCount} คน`,
    ],
  ];
  const ws5 = buildStyledWorksheet({
    rows: sheet5Rows,
    theme: 'navy',
  });
  XLSX.utils.book_append_sheet(wb, ws5, '6_สรุปกิจกรรมลาและสาย');

  // ============================================================================
  // ชีตที่ 7: รายงานที่ 6 สิทธิคงเหลือแต่ละบุคคล
  // ============================================================================
  const sheet6Rows: (string | number)[][] = [
    [
      `รายงานที่ 6: สิทธิวันลาคงเหลือรายบุคคล (อ้างอิงฐานข้อมูลสิทธิคงเหลือ + สรุปใช้ไปในเดือน ${monthLabel})`,
    ],
    [
      'แสดงโควตาวันลา วันลาที่ใช้สะสม และวันลาคงเหลือเป็นหน่วย วัน และ ชั่วโมง (1 วัน = 8 ชั่วโมง)',
    ],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'สิทธิ์ลาป่วย',
      'ใช้สะสม-ลาป่วย',
      'คงเหลือ-ลาป่วย',
      'สิทธิ์ลากิจ',
      'ใช้สะสม-ลากิจ',
      'คงเหลือ-ลากิจ',
      'สิทธิ์ลาพักร้อน',
      'ใช้สะสม-ลาพักร้อน',
      'คงเหลือ-ลาพักร้อน',
      'สิทธิ์ลาอื่นๆ',
      'ใช้สะสม-ลาอื่นๆ',
      'คงเหลือ-ลาอื่นๆ',
    ],
    ...audit.quotaReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      formatLeaveHuman(item.sickQuota, { zeroText: '0 วัน' }),
      formatLeaveHuman(item.sickUsedTotal),
      formatLeaveHuman(item.sickRemaining, { zeroText: '0 วัน' }),
      formatLeaveHuman(item.personalQuota, { zeroText: '0 วัน' }),
      formatLeaveHuman(item.personalUsedTotal),
      formatLeaveHuman(item.personalRemaining, { zeroText: '0 วัน' }),
      formatLeaveHuman(item.vacationQuota, { zeroText: '0 วัน' }),
      formatLeaveHuman(item.vacationUsedTotal),
      formatLeaveHuman(item.vacationRemaining, { zeroText: '0 วัน' }),
      formatLeaveHuman(item.otherQuota, { zeroText: '0 วัน' }),
      formatLeaveHuman(item.otherUsedTotal),
      formatLeaveHuman(item.otherRemaining, { zeroText: '0 วัน' }),
    ]),
  ];
  const ws6 = buildStyledWorksheet({
    rows: sheet6Rows,
    theme: 'purple',
  });
  XLSX.utils.book_append_sheet(wb, ws6, '7_สิทธิคงเหลือรายบุคคล');

  // ============================================================================
  // ชีตที่ 8: หน้า HR Exception (เฉพาะรายการผิดปกติที่ต้องให้ HR ตรวจสอบ)
  // ============================================================================
  const sheet8Rows: (string | number)[][] = [
    [
      `หน้า HR Exception: รายการสแกนนิ้วผิดปกติที่ต้องให้ HR ตรวจสอบ (${audit.scanAnomalyRecords.length} รายการ) — ประจำเดือน ${monthLabel}`,
    ],
    [
      'แสดงเฉพาะรายการสแกนนิ้วไม่ครบ หรือฝ่ายขายไม่พบสแกนนิ้ว (ไม่รวมวันลาเต็มวันที่อนุมัติแล้ว)',
    ],
    [],
    [
      'ลำดับ',
      'วันที่',
      'วันของสัปดาห์',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'สแกนเข้า (ต้นฉบับ)',
      'สแกนออก (ต้นฉบับ)',
      'เวลาเข้าที่ใช้คำนวณ',
      'เวลาออกที่ใช้คำนวณ',
      'สาเหตุความผิดปกติ / แจ้งเตือน HR',
      'หมายเหตุในชีตเดิม',
      'หมายเหตุจาก HR (Override)',
    ],
    ...audit.scanAnomalyRecords.map((r, idx) => [
      idx + 1,
      formatDateDisplay(r.date),
      r.dayOfWeek,
      r.fullName,
      r.nickname,
      r.position,
      r.department,
      r.originalScanIn,
      r.originalScanOut,
      r.effectiveScanIn,
      r.effectiveScanOut,
      r.alertMessage || r.scanStatus,
      r.sheetNote || '-',
      r.hrNote || '-',
    ]),
  ];
  const ws8 = buildStyledWorksheet({
    rows: sheet8Rows,
    theme: 'rose',
  });
  XLSX.utils.book_append_sheet(wb, ws8, '8_HR_Exception');

  // ============================================================================
  // ชีตที่ 9: ตารางตรวจสอบสแกนนิ้วรายวันทั้งหมด (สแกนต้นฉบับ + หมายเหตุ)
  // ============================================================================
  const sheet9Rows: (string | number)[][] = [
    [
      `ตารางตรวจสอบการสแกนนิ้วรายวัน (สแกนต้นฉบับ เวลาที่ใช้คำนวณ และหมายเหตุ) ประจำเดือน ${monthLabel}`,
    ],
    [
      'ข้อมูลสแกนนิ้วต้นฉบับถูกเก็บรักษาไว้เสมอ พร้อมแสดงเวลาที่ใช้คำนวณและหมายเหตุจาก HR',
    ],
    [],
    [
      'วันที่',
      'วันของสัปดาห์',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'สแกนเข้า (ต้นฉบับ)',
      'สแกนออก (ต้นฉบับ)',
      'เวลาเข้าที่ใช้คำนวณ',
      'เวลาออกที่ใช้คำนวณ',
      'เกณฑ์เวลาสายที่ใช้',
      'สาย (ครั้ง)',
      'สาย (นาที)',
      'สถานะการสแกน / แจ้งเตือน',
      'การลาในวันนี้',
      'รายละเอียดการลา',
      'หมายเหตุในชีตเดิม',
      'หมายเหตุจาก HR (Override)',
    ],
    ...audit.dailyRecords.map((r) => [
      formatDateDisplay(r.date),
      r.dayOfWeek,
      r.fullName,
      r.nickname,
      r.position,
      r.department,
      r.originalScanIn,
      r.originalScanOut,
      r.effectiveScanIn,
      r.effectiveScanOut,
      r.lateRuleApplied,
      r.lateCount > 0 ? `${r.lateCount} ครั้ง` : '-',
      r.lateMinutes > 0 ? `${r.lateMinutes} นาที` : '-',
      r.alertMessage || r.scanStatus,
      formatLeaveHuman(r.totalLeaveDaysOnDate),
      r.leaveDetails.join('; ') || '-',
      r.sheetNote || '-',
      r.hrNote || '-',
    ]),
  ];
  const ws9 = buildStyledWorksheet({
    rows: sheet9Rows,
    theme: 'navy',
  });
  XLSX.utils.book_append_sheet(wb, ws9, '9_สแกนต้นฉบับและหมายเหตุ');

  // ============================================================================
  // ชีตที่ 10: ประวัติการแก้ไขของ HR (Audit Log / Edit History)
  // ============================================================================
  const overrideList = Object.values(hrOverrides).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const sheet10Rows: (string | number)[][] = [
    [
      `ประวัติการแก้ไขข้อมูลและหมายเหตุโดย HR (Audit Log) — ประจำเดือน ${monthLabel}`,
    ],
    [
      'บันทึกการแก้ไขข้อมูลสแกนนิ้วและสถานะทุกครั้ง พร้อมเปรียบเทียบค่าก่อนแก้ไขและเวลาที่บันทึก',
    ],
    [],
    [
      'ลำดับ',
      'วันที่รายการ',
      'ชื่อพนักงาน',
      'ข้อมูลก่อนแก้ไข (ต้นฉบับ)',
      'เวลาเข้าที่ปรับแก้',
      'เวลาออกที่ปรับแก้',
      'สถานะที่ปรับแก้',
      'ปรับจำนวนสาย',
      'ปรับนาทีสาย',
      'หมายเหตุจาก HR',
      'วันเวลาที่บันทึกการแก้ไข',
    ],
    ...(overrideList.length > 0
      ? overrideList.map((ov, idx) => [
          idx + 1,
          formatDateDisplay(ov.date),
          ov.employeeName || '-',
          ov.previousSummary || 'ตามข้อมูลสแกนนิ้วต้นฉบับ',
          ov.overrideScanIn || '(ใช้ค่าเดิม)',
          ov.overrideScanOut || '(ใช้ค่าเดิม)',
          ov.overrideStatus || '(คำนวณอัตโนมัติ)',
          ov.overrideLateCount !== undefined && ov.overrideLateCount !== null
            ? `${ov.overrideLateCount} ครั้ง`
            : '(คำนวณอัตโนมัติ)',
          ov.overrideLateMinutes !== undefined &&
          ov.overrideLateMinutes !== null
            ? `${ov.overrideLateMinutes} นาที`
            : '(คำนวณอัตโนมัติ)',
          ov.hrNote || '-',
          ov.updatedAt || '-',
        ])
      : [
          [
            1,
            '-',
            'ยังไม่มีประวัติการแก้ไขข้อมูลในเดือนนี้ (ใช้ข้อมูลสแกนนิ้วต้นฉบับ 100%)',
            '-',
            '-',
            '-',
            '-',
            '-',
            '-',
            '-',
            '-',
          ],
        ]),
  ];
  const ws10 = buildStyledWorksheet({
    rows: sheet10Rows,
    theme: 'indigo',
  });
  XLSX.utils.book_append_sheet(wb, ws10, '10_ประวัติการแก้ไข_HR');

  XLSX.writeFile(
    wb,
    `JCW_รายงาน_HR_Payroll_Detailed_${audit.yearMonth}.xlsx`
  );
}

/**
 * ส่งออกไฟล์ CSV รายละเอียดรายวันและสรุปการลา (UTF-8 with BOM เปิดใน Excel ภาษาไทยไม่เพี้ยน)
 */
export function exportDetailedCSV(audit: MonthlyAuditOutput): void {
  const headers = [
    'ลำดับ',
    'วันที่',
    'วัน',
    'ชื่อ-นามสกุล',
    'ชื่อเล่น',
    'ตำแหน่ง',
    'แผนก/ฝ่าย',
    'เวลาเข้า (ต้นฉบับ)',
    'เวลาออก (ต้นฉบับ)',
    'เวลาเข้า (ใช้คำนวณ)',
    'เวลาออก (ใช้คำนวณ)',
    'สถานะการสแกน',
    'คำเตือนเวลาผิดปกติ',
    'เกณฑ์เวลาสาย',
    'สาย (ครั้ง)',
    'สาย (นาที)',
    'ลาป่วย',
    'ลากิจ',
    'ลาพักร้อน',
    'ลาไม่รับค่าจ้าง',
    'ลาอื่นๆ',
    'รวมวันลาในวันนั้น',
    'รายละเอียดการลา',
    'หมายเหตุจากชีตสแกน',
    'หมายเหตุ HR',
    'สถานะการตรวจสอบ HR',
    'ผู้แก้ไข/ตรวจสอบ',
    'เวลาแก้ไขล่าสุด',
  ];

  const escapeCsvCell = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = audit.dailyRecords.map((r, idx) => [
    idx + 1,
    formatDateDisplay(r.date),
    r.dayOfWeek,
    r.fullName,
    r.nickname,
    r.position,
    r.department,
    r.originalScanIn,
    r.originalScanOut,
    r.effectiveScanIn,
    r.effectiveScanOut,
    r.scanStatus,
    r.suspiciousScanWarning || '-',
    r.lateRuleApplied,
    r.lateCount,
    r.lateMinutes,
    formatLeaveHuman(r.sickLeaveDays),
    formatLeaveHuman(r.personalLeaveDays),
    formatLeaveHuman(r.vacationLeaveDays),
    formatLeaveHuman(r.unpaidLeaveDays),
    formatLeaveHuman(r.otherLeaveDays),
    formatLeaveHuman(r.totalLeaveDaysOnDate),
    r.leaveDetails.join(' | ') || '-',
    r.sheetNote || '-',
    r.hrNote || '-',
    r.isReviewed
      ? r.hasHROverride
        ? 'HR แก้ไขและตรวจแล้ว'
        : 'ตรวจแล้ว'
      : 'ยังไม่ได้ตรวจ',
    r.reviewedBy || r.updatedBy || '-',
    r.updatedAt || r.reviewedAt || '-',
  ]);

  const csvContent =
    '\uFEFF' +
    [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `JCW_รายละเอียดเวลาทำงานและการลา_${audit.yearMonth}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * ฟังก์ชันหลักเดิม (คงไว้เพื่อความเข้ากันได้) ชี้ไปยังรายงาน HR/Payroll ฉบับสมบูรณ์
 */
export function exportMonthlyAuditToExcel(
  audit: MonthlyAuditOutput,
  hrOverrides: Record<string, HROverrideRecord> = {}
): void {
  exportHRPayrollReportToExcel(audit, hrOverrides);
}
