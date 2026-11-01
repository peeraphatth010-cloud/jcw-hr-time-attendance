import * as XLSX from 'xlsx';
import { HROverrideRecord, MonthlyAuditOutput } from '../types/attendance';
import {
  format2,
  formatDateDisplay,
  formatYearMonthThai,
} from './dateAndTime';

/**
 * แบบที่ 1: รายงานหัวหน้า / ผู้บริหาร (Manager Report)
 * สั้น อ่านง่าย แสดงตัวเลขวันลา 2 ตำแหน่งเสมอ และตัดข้อมูลเทคนิคออกทั้งหมด
 * (ไม่แสดงรหัสพนักงานและ ID บุคคลตามความต้องการของผู้ใช้)
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
    ['รายงานสำหรับหัวหน้างานและผู้บริหาร (สั้น อ่านง่าย ตัดข้อมูลเทคนิค)'],
    [],
    ['หัวข้อสรุปสำคัญ', 'ตัวเลขสรุป', 'รายละเอียดประกอบ'],
    [
      '1. พนักงานทั้งหมดที่ตรวจสอบในเดือน',
      `${totalEmployees} คน`,
      `วันทำการที่มีข้อมูลในเดือนนี้ ${audit.workdaysInMonth.length} วัน`,
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
      '3. ลาไม่รับค่าจ้าง (จำนวนวัน)',
      `${format2(audit.activityGrandTotal.unpaidDays)} วัน (${format2(audit.activityGrandTotal.unpaidHours)} ชม.)`,
      audit.unpaidAndOtherLeaveReport
        .filter((u) => u.unpaidDays > 0)
        .map(
          (u) =>
            `${u.fullName} (${u.nickname}): ${format2(u.unpaidDays)} วัน (${format2(u.unpaidHours)} ชม.)`
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
      `สแกนเข้าแต่ไม่สแกนออก ${audit.scanAnomalyRecords.filter((r) => r.scanStatus === 'พบสแกนเข้า แต่ไม่พบสแกนออก').length} รายการ | ไม่สแกนเข้าแต่สแกนออก ${audit.scanAnomalyRecords.filter((r) => r.scanStatus === 'ไม่พบสแกนเข้า แต่พบสแกนออก').length} รายการ | คาดว่าไปพบลูกค้า/ไม่พบสแกน ${audit.scanAnomalyRecords.filter((r) => r.scanStatus === 'คาดว่าไปพบลูกค้า' || r.scanStatus === 'ไม่พบสแกนเข้า-ออกและไม่มีใบลา').length} รายการ`,
    ],
    [],
    ['สรุปรายชื่อผู้ได้รับเบี้ยขยันและผู้ไม่ได้รับเบี้ยขยัน'],
    ['ลำดับ', 'ชื่อ-นามสกุล', 'ชื่อเล่น', 'ตำแหน่ง', 'แผนก/ฝ่าย', 'สถานะเบี้ยขยัน', 'เหตุผลสรุป'],
    ...audit.diligenceReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      item.isEligible ? 'ได้รับเบี้ยขยัน' : 'ไม่ได้รับเบี้ยขยัน',
      item.isEligible
        ? 'มาทำงานตรงเวลาทุกวัน และลาไม่เกิน 1.00 วัน'
        : item.disqualifyReasons.join(' / '),
    ]),
  ];
  const wsExec = XLSX.utils.aoa_to_sheet(execRows);
  XLSX.utils.book_append_sheet(wb, wsExec, '1_สรุปผู้บริหาร_1หน้า');

  // ============================================================================
  // ชีตที่ 2: ตารางสรุปภาพรวมรายบุคคลสำหรับหัวหน้า (สั้น อ่านง่าย)
  // ============================================================================
  const summaryRows: (string | number)[][] = [
    [`สรุปภาพรวมการมาทำงานและการลารายบุคคล (รายงานหัวหน้า) — ประจำเดือน ${monthLabel}`],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'มาสาย (ครั้ง)',
      'เวลามาสายรวม (นาที)',
      'ลาป่วย (วัน)',
      'ลากิจ (วัน)',
      'ลาพักร้อน (วัน)',
      'ลาไม่รับค่าจ้าง (วัน)',
      'ลาอื่นๆ (วัน)',
      'รวมวันลาทั้งเดือน (วัน)',
      'ผลการพิจารณาเบี้ยขยัน',
    ],
    ...audit.activitySummaryReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      item.lateCount,
      item.lateMinutes,
      format2(item.sickDays),
      format2(item.personalDays),
      format2(item.vacationDays),
      format2(item.unpaidDays),
      format2(item.otherDays),
      format2(item.totalLeaveDays),
      item.diligenceEligible ? 'ได้รับเบี้ยขยัน' : 'ไม่ได้รับ',
    ]),
    [],
    [
      '',
      'รวมทั้งบริษัท (Grand Total)',
      '',
      '',
      '',
      audit.activityGrandTotal.lateCount,
      audit.activityGrandTotal.lateMinutes,
      format2(audit.activityGrandTotal.sickDays),
      format2(audit.activityGrandTotal.personalDays),
      format2(audit.activityGrandTotal.vacationDays),
      format2(audit.activityGrandTotal.unpaidDays),
      format2(audit.activityGrandTotal.otherDays),
      format2(audit.activityGrandTotal.totalLeaveDays),
      `ได้รับ ${audit.activityGrandTotal.diligenceEligibleCount} คน`,
    ],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, '2_สรุปรายคน_สาย_ลา_เบี้ยขยัน');

  // ============================================================================
  // ชีตที่ 3: สิทธิวันลาคงเหลือรายบุคคล (แสดงทศนิยม 2 ตำแหน่ง)
  // ============================================================================
  const quotaRows: (string | number)[][] = [
    [`สรุปสิทธิวันลาคงเหลือรายบุคคล — ประจำเดือน ${monthLabel}`],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'คงเหลือ ลาป่วย (วัน)',
      'คงเหลือ ลากิจ (วัน)',
      'คงเหลือ ลาพักร้อน (วัน)',
      'คงเหลือ ลาอื่นๆ (วัน)',
      `ใช้ในเดือน ${audit.yearMonth} - ลาป่วย (วัน)`,
      `ใช้ในเดือน ${audit.yearMonth} - ลากิจ (วัน)`,
      `ใช้ในเดือน ${audit.yearMonth} - ลาพักร้อน (วัน)`,
      `ใช้ในเดือน ${audit.yearMonth} - ลาไม่รับค่าจ้าง/อื่นๆ (วัน)`,
    ],
    ...audit.quotaReport.map((q, idx) => [
      idx + 1,
      q.fullName,
      q.nickname,
      q.position,
      q.department,
      format2(q.sickRemaining),
      format2(q.personalRemaining),
      format2(q.vacationRemaining),
      format2(q.otherRemaining),
      format2(q.monthSickUsed),
      format2(q.monthPersonalUsed),
      format2(q.monthVacationUsed),
      format2(q.monthOtherAndUnpaidUsed),
    ]),
  ];
  const wsQuota = XLSX.utils.aoa_to_sheet(quotaRows);
  XLSX.utils.book_append_sheet(wb, wsQuota, '3_สิทธิวันลาคงเหลือ');

  XLSX.writeFile(wb, `JCW_รายงานหัวหน้า_Manager_Report_${audit.yearMonth}.xlsx`);
}

/**
 * แบบที่ 2: รายงาน HR / Payroll ฉบับสมบูรณ์ (HR & Payroll Detailed Report)
 * มีรายละเอียดครบทั้ง 6 รายงานหลัก + หน้าสรุปผู้บริหาร + HR Exception 32 รายการ + สแกนต้นฉบับ/หมายเหตุ + ประวัติการแก้ไข (Audit Log)
 * แสดงตัวเลขวันลาเป็นทศนิยม 2 ตำแหน่งเสมอ และไม่แสดงรหัสพนักงาน/ID บุคคล
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
    [],
    ['ตัวชี้วัดสำคัญก่อนทำเงินเดือน', 'ผลลัพธ์', 'รายละเอียด'],
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
      '3. ลาไม่รับค่าจ้างกี่วัน',
      `${format2(audit.activityGrandTotal.unpaidDays)} วัน (${format2(audit.activityGrandTotal.unpaidHours)} ชม.)`,
      audit.unpaidAndOtherLeaveReport
        .filter((u) => u.unpaidDays > 0)
        .map(
          (u) =>
            `${u.fullName} (${u.nickname}): ${format2(u.unpaidDays)} วัน (${format2(u.unpaidHours)} ชม.)`
        )
        .join(' | ') || '0.00 วัน',
    ],
    [
      '4. ผู้ได้รับ / ไม่ได้รับเบี้ยขยัน',
      `ได้รับ ${eligibleList.length} คน / ไม่ได้รับ ${ineligibleList.length} คน`,
      eligibleList.length > 0
        ? `ผู้ได้รับ: ${eligibleList.map((e) => `${e.fullName} (${e.nickname})`).join(', ')}`
        : 'ไม่มีผู้ได้รับเบี้ยขยัน',
    ],
    [
      '5. รายการที่ต้องให้ HR ตรวจสอบ (HR Exception)',
      `${audit.scanAnomalyRecords.length} รายการ`,
      `สแกนไม่ครบหรือฝ่ายขายคาดว่าไปพบลูกค้า ${audit.scanAnomalyRecords.length} รายการ (ดูรายละเอียดในชีต 8_HR_Exception)`,
    ],
  ];
  const ws0 = XLSX.utils.aoa_to_sheet(sheet0Rows);
  XLSX.utils.book_append_sheet(wb, ws0, '1_สรุปผู้บริหาร');

  // ============================================================================
  // ชีตที่ 2: รายงานที่ 1 ผู้ได้รับเบี้ยขยัน
  // ============================================================================
  const sheet1Rows: (string | number)[][] = [
    [`รายงานที่ 1: สรุปรายชื่อผู้ได้รับเบี้ยขยัน ประจำเดือน ${monthLabel}`],
    [
      'เกณฑ์บริษัท: (1) พนักงานทุกแผนก (รวมฝ่ายขาย ยกเว้นตำแหน่งเจ้าหน้าที่ฝ่ายขาย) (2) สแกนเข้างานไม่เกิน 08:00 น. ทุกวันทำงาน (3) วันลารวมทุกประเภทในเดือนไม่เกิน 1.00 วัน',
    ],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'ผลการพิจารณาเบี้ยขยัน',
      'จำนวนวันมาทำงาน (วัน)',
      'จำนวนวันที่สแกนเกิน 08:00 น. (วัน)',
      'วันลารวมในเดือน (วัน)',
      'เหตุผลประกอบ / หมายเหตุ',
    ],
    ...audit.diligenceReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      item.isEligible ? 'ได้รับเบี้ยขยัน' : 'ไม่ได้รับเบี้ยขยัน',
      item.daysWorked,
      item.daysScanAfter0800,
      format2(item.totalLeaveDays),
      item.isEligible
        ? 'ผ่านเกณฑ์ครบทั้ง 3 ข้อ'
        : item.disqualifyReasons.join(' | '),
    ]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
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
      'จำนวนครั้งที่สาย (ครั้ง)',
      'รวมเวลาสาย (นาที)',
      'รายละเอียดวันที่มาสาย (วันที่ : เวลาสแกนเข้า -> นาทีสาย)',
    ],
    ...audit.lateSummaryReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      item.lateCount,
      item.lateMinutes,
      item.dailyDetails.length > 0
        ? item.dailyDetails
            .map(
              (d) =>
                `${formatDateDisplay(d.date)} (${d.scanIn} = ${d.lateMinutes} นาที [${d.rule}])`
            )
            .join(', ')
        : 'ไม่มีประวัติมาสาย',
    ]),
    [],
    [
      '',
      'รวมทั้งสิ้น',
      '',
      '',
      '',
      audit.activityGrandTotal.lateCount,
      audit.activityGrandTotal.lateMinutes,
      `ผู้มาสาย ${latePeople.length} คน`,
    ],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
  XLSX.utils.book_append_sheet(wb, ws2, '3_สรุปมาสาย');

  // ============================================================================
  // ชีตที่ 4: รายงานที่ 3 การลาไม่รับค่าจ้าง และ ลาอื่นๆ
  // ============================================================================
  const sheet3Rows: (string | number)[][] = [
    [
      `รายงานที่ 3: สรุปการลาไม่รับค่าจ้าง และ ลาอื่นๆ ประจำเดือน ${monthLabel}`,
    ],
    ['อัตราการแปลงเวลา: 8 ชั่วโมง = 1.00 วันทำงาน (แสดงทศนิยม 2 ตำแหน่งมาตรฐานเดียวกัน)'],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'ลาไม่รับค่าจ้าง (วัน)',
      'ลาไม่รับค่าจ้าง (ชม.)',
      'ลาอื่นๆ (วัน)',
      'ลาอื่นๆ (ชม.)',
      'รวมทั้งหมด (วัน)',
      'รวมทั้งหมด (ชม.)',
      'รายละเอียดวันที่และเหตุผล',
    ],
    ...audit.unpaidAndOtherLeaveReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      format2(item.unpaidDays),
      format2(item.unpaidHours),
      format2(item.otherDays),
      format2(item.otherHours),
      format2(item.totalDays),
      format2(item.totalHours),
      item.details.length > 0
        ? item.details
            .map(
              (d) =>
                `${formatDateDisplay(d.date)}: ${d.type} ${format2(d.days)} วัน (${format2(d.hours)} ชม. - ${d.reason})`
            )
            .join(' | ')
        : '-',
    ]),
    [],
    [
      '',
      'รวมทั้งสิ้น',
      '',
      '',
      '',
      format2(audit.activityGrandTotal.unpaidDays),
      format2(audit.activityGrandTotal.unpaidHours),
      format2(audit.activityGrandTotal.otherDays),
      format2(audit.activityGrandTotal.otherHours),
      format2(
        audit.activityGrandTotal.unpaidDays + audit.activityGrandTotal.otherDays
      ),
      format2(
        audit.activityGrandTotal.unpaidHours +
          audit.activityGrandTotal.otherHours
      ),
      '',
    ],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Rows);
  XLSX.utils.book_append_sheet(wb, ws3, '4_ลาไม่รับค่าจ้าง_อื่นๆ');

  // ============================================================================
  // ชีตที่ 5: รายงานที่ 4 การใช้สิทธิการลาในเดือน & การตรวจสอบวันลาข้ามเดือน
  // ============================================================================
  const sheet4Rows: (string | number)[][] = [
    [`รายงานที่ 4: รายละเอียดการใช้สิทธิการลาในเดือน ประจำเดือน ${monthLabel}`],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'ประเภทการลา (มาตรฐาน)',
      'สถานะรับค่าจ้าง',
      'ตั้งแต่วันที่',
      'ถึงวันที่',
      'จำนวนวันที่ใช้ในเดือนนี้ (วัน)',
      'จำนวนชั่วโมงในเดือนนี้ (ชม.)',
      'เหตุผลการลา',
      'สถานะอนุมัติ',
      'การตรวจสอบวันที่/ข้ามเดือน',
      'แหล่งข้อมูล',
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
      format2(item.days),
      format2(item.hours),
      item.reason,
      item.status,
      item.dateValidationNote || 'ปกติ (ภายในเดือน)',
      item.source,
    ]),
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
      'จำนวนวันที่หักในเดือนนี้ (วัน)',
      'จำนวนวันทั้งหมดในใบลา (วัน)',
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
      format2(item.days),
      format2(item.totalRequestedDays ?? item.days),
      item.dateValidationNote || '-',
      item.reason,
    ]),
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Rows);
  XLSX.utils.book_append_sheet(wb, ws4, '5_การใช้สิทธิลา_ข้ามเดือน');

  // ============================================================================
  // ชีตที่ 6: รายงานที่ 5 สรุปกิจกรรมการลาและมาสาย (รายบุคคล + รวมทั้งบริษัท)
  // ============================================================================
  const sheet5Rows: (string | number)[][] = [
    [
      `รายงานที่ 5: สรุปกิจกรรมการลาทุกประเภทและสถิติการมาสาย ประจำเดือน ${monthLabel}`,
    ],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'ลาป่วย (วัน)',
      'ลาป่วย (ชม.)',
      'ลากิจ (วัน)',
      'ลากิจ (ชม.)',
      'ลาพักร้อน (วัน)',
      'ลาพักร้อน (ชม.)',
      'ลาไม่รับค่าจ้าง (วัน)',
      'ลาไม่รับค่าจ้าง (ชม.)',
      'ลาอื่นๆ (วัน)',
      'ลาอื่นๆ (ชม.)',
      'รวมวันลาทั้งหมด (วัน)',
      'รวมชั่วโมงลาทั้งหมด (ชม.)',
      'มาสาย (ครั้ง)',
      'เวลามาสายรวม (นาที)',
      'สิทธิเบี้ยขยัน',
    ],
    ...audit.activitySummaryReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      format2(item.sickDays),
      format2(item.sickHours),
      format2(item.personalDays),
      format2(item.personalHours),
      format2(item.vacationDays),
      format2(item.vacationHours),
      format2(item.unpaidDays),
      format2(item.unpaidHours),
      format2(item.otherDays),
      format2(item.otherHours),
      format2(item.totalLeaveDays),
      format2(item.totalLeaveHours),
      item.lateCount,
      item.lateMinutes,
      item.diligenceEligible ? 'ได้รับ' : 'ไม่ได้รับ',
    ]),
    [],
    [
      '',
      'รวมทั้งสิ้น (Grand Total)',
      '',
      '',
      '',
      format2(audit.activityGrandTotal.sickDays),
      format2(audit.activityGrandTotal.sickHours),
      format2(audit.activityGrandTotal.personalDays),
      format2(audit.activityGrandTotal.personalHours),
      format2(audit.activityGrandTotal.vacationDays),
      format2(audit.activityGrandTotal.vacationHours),
      format2(audit.activityGrandTotal.unpaidDays),
      format2(audit.activityGrandTotal.unpaidHours),
      format2(audit.activityGrandTotal.otherDays),
      format2(audit.activityGrandTotal.otherHours),
      format2(audit.activityGrandTotal.totalLeaveDays),
      format2(audit.activityGrandTotal.totalLeaveHours),
      audit.activityGrandTotal.lateCount,
      audit.activityGrandTotal.lateMinutes,
      `ได้รับ ${audit.activityGrandTotal.diligenceEligibleCount} คน`,
    ],
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(sheet5Rows);
  XLSX.utils.book_append_sheet(wb, ws5, '6_สรุปกิจกรรมลาและสาย');

  // ============================================================================
  // ชีตที่ 7: รายงานที่ 6 สิทธิคงเหลือแต่ละบุคคล (ทศนิยม 2 ตำแหน่ง)
  // ============================================================================
  const sheet6Rows: (string | number)[][] = [
    [
      `รายงานที่ 6: สิทธิวันลาคงเหลือรายบุคคล (อ้างอิงฐานข้อมูลสิทธิคงเหลือ + สรุปใช้ไปในเดือน ${monthLabel})`,
    ],
    [],
    [
      'ลำดับ',
      'ชื่อ-นามสกุล',
      'ชื่อเล่น',
      'ตำแหน่ง',
      'แผนก/ฝ่าย',
      'สิทธิ์ลาป่วย (วัน)',
      'ใช้ไปสะสม-ลาป่วย (วัน)',
      'คงเหลือ-ลาป่วย (วัน)',
      'สิทธิ์ลากิจ (วัน)',
      'ใช้ไปสะสม-ลากิจ (วัน)',
      'คงเหลือ-ลากิจ (วัน)',
      'สิทธิ์ลาพักร้อน (วัน)',
      'ใช้ไปสะสม-ลาพักร้อน (วัน)',
      'คงเหลือ-ลาพักร้อน (วัน)',
      'สิทธิ์ลาอื่นๆ (วัน)',
      'ใช้ไปสะสม-ลาอื่นๆ (วัน)',
      'คงเหลือ-ลาอื่นๆ (วัน)',
      `ใช้ในเดือน ${audit.yearMonth} - ลาป่วย (วัน)`,
      `ใช้ในเดือน ${audit.yearMonth} - ลากิจ (วัน)`,
      `ใช้ในเดือน ${audit.yearMonth} - ลาพักร้อน (วัน)`,
      `ใช้ในเดือน ${audit.yearMonth} - ลาไม่รับ/อื่นๆ (วัน)`,
    ],
    ...audit.quotaReport.map((item, idx) => [
      idx + 1,
      item.fullName,
      item.nickname,
      item.position,
      item.department,
      format2(item.sickQuota),
      format2(item.sickUsedTotal),
      format2(item.sickRemaining),
      format2(item.personalQuota),
      format2(item.personalUsedTotal),
      format2(item.personalRemaining),
      format2(item.vacationQuota),
      format2(item.vacationUsedTotal),
      format2(item.vacationRemaining),
      format2(item.otherQuota),
      format2(item.otherUsedTotal),
      format2(item.otherRemaining),
      format2(item.monthSickUsed),
      format2(item.monthPersonalUsed),
      format2(item.monthVacationUsed),
      format2(item.monthOtherAndUnpaidUsed),
    ]),
  ];
  const ws6 = XLSX.utils.aoa_to_sheet(sheet6Rows);
  XLSX.utils.book_append_sheet(wb, ws6, '7_สิทธิคงเหลือรายบุคคล');

  // ============================================================================
  // ชีตที่ 8: หน้า HR Exception (เฉพาะรายการผิดปกติที่ต้องให้ HR ตรวจสอบ)
  // ============================================================================
  const sheet8Rows: (string | number)[][] = [
    [
      `หน้า HR Exception: รายการสแกนนิ้วผิดปกติที่ต้องให้ HR ตรวจสอบ (${audit.scanAnomalyRecords.length} รายการ) — ประจำเดือน ${monthLabel}`,
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
      'สถานะผิดปกติ / แจ้งเตือน HR',
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
  const ws8 = XLSX.utils.aoa_to_sheet(sheet8Rows);
  XLSX.utils.book_append_sheet(wb, ws8, '8_HR_Exception');

  // ============================================================================
  // ชีตที่ 9: ตารางตรวจสอบสแกนนิ้วรายวันทั้งหมด (สแกนต้นฉบับ + หมายเหตุ)
  // ============================================================================
  const sheet9Rows: (string | number)[][] = [
    [
      `ตารางตรวจสอบการสแกนนิ้วรายวัน (สแกนต้นฉบับ เวลาที่ใช้คำนวณ และหมายเหตุ) ประจำเดือน ${monthLabel}`,
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
      'สถานะฝ่ายขาย',
      'วันลาในวันนี้ (วัน)',
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
      r.lateCount,
      r.lateMinutes,
      r.alertMessage || r.scanStatus,
      r.salesStatus || '-',
      format2(r.totalLeaveDaysOnDate),
      r.leaveDetails.join('; '),
      r.sheetNote,
      r.hrNote,
    ]),
  ];
  const ws9 = XLSX.utils.aoa_to_sheet(sheet9Rows);
  XLSX.utils.book_append_sheet(wb, ws9, '9_สแกนต้นฉบับและหมายเหตุ');

  // ============================================================================
  // ชีตที่ 10: ประวัติการแก้ไขของ HR (Audit Log / Edit History)
  // ============================================================================
  const overrideList = Object.values(hrOverrides).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const sheet10Rows: (string | number)[][] = [
    [`ประวัติการแก้ไขข้อมูลและหมายเหตุโดย HR (Audit Log) — ประจำเดือน ${monthLabel}`],
    [],
    [
      'ลำดับ',
      'วันที่รายการ',
      'ชื่อพนักงาน',
      'ข้อมูลก่อนแก้ไข (ต้นฉบับ)',
      'เวลาเข้าที่ปรับแก้',
      'เวลาออกที่ปรับแก้',
      'สถานะที่ปรับแก้',
      'ปรับจำนวนสาย (ครั้ง)',
      'ปรับนาทีสาย (นาที)',
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
            ? ov.overrideLateCount
            : '(คำนวณอัตโนมัติ)',
          ov.overrideLateMinutes !== undefined &&
          ov.overrideLateMinutes !== null
            ? ov.overrideLateMinutes
            : '(คำนวณอัตโนมัติ)',
          ov.hrNote || '-',
          ov.updatedAt || '-',
        ])
      : [
          [
            '-',
            '-',
            'ยังไม่มีประวัติการแก้ไขข้อมูลในเดือนนี้',
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
  const ws10 = XLSX.utils.aoa_to_sheet(sheet10Rows);
  XLSX.utils.book_append_sheet(wb, ws10, '10_ประวัติการแก้ไข_HR');

  XLSX.writeFile(
    wb,
    `JCW_รายงาน_HR_Payroll_Detailed_${audit.yearMonth}.xlsx`
  );
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
