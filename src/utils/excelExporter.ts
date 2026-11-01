import * as XLSX from 'xlsx';
import { MonthlyAuditOutput } from '../types/attendance';
import { formatDateDisplay, formatYearMonthThai } from './dateAndTime';

/**
 * ส่งออกรายงานสรุปผล HR Time Attendance & Leave Audit ทั้ง 6 รายงานหลัก + ตารางตรวจสอบรายวัน เป็นไฟล์ Excel (.xlsx)
 * (ตัดคอลัมน์รหัสพนักงานและ ID บุคคลออกจากรายงานทั้งหมดตามความต้องการของผู้ใช้)
 */
export function exportMonthlyAuditToExcel(audit: MonthlyAuditOutput): void {
  const wb = XLSX.utils.book_new();
  const monthLabel = formatYearMonthThai(audit.yearMonth);

  // ============================================================================
  // ชีตที่ 1: รายงานผู้ได้รับเบี้ยขยัน
  // ============================================================================
  const sheet1Rows = [
    [`รายงานที่ 1: สรุปรายชื่อผู้ได้รับเบี้ยขยัน ประจำเดือน ${monthLabel}`],
    [
      'เกณฑ์บริษัท: (1) พนักงานทุกแผนก (รวมฝ่ายขาย ยกเว้นตำแหน่งเจ้าหน้าที่ฝ่ายขาย) (2) สแกนเข้างานไม่เกิน 08:00 น. ทุกวันทำงาน (3) วันลารวมทุกประเภทในเดือนไม่เกิน 1.0 วัน',
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
      item.totalLeaveDays,
      item.isEligible
        ? 'ผ่านเกณฑ์ครบทั้ง 3 ข้อ'
        : item.disqualifyReasons.join(' | '),
    ]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
  XLSX.utils.book_append_sheet(wb, ws1, '1_เบี้ยขยัน');

  // ============================================================================
  // ชีตที่ 2: รายงานสรุปการมาสาย
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
      '',
    ],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
  XLSX.utils.book_append_sheet(wb, ws2, '2_สรุปมาสาย');

  // ============================================================================
  // ชีตที่ 3: รายงานการลาไม่รับค่าจ้าง และ ลาอื่นๆ
  // ============================================================================
  const sheet3Rows: (string | number)[][] = [
    [
      `รายงานที่ 3: สรุปการลาไม่รับค่าจ้าง และ ลาอื่นๆ ประจำเดือน ${monthLabel}`,
    ],
    ['อัตราการแปลงเวลา: 8 ชั่วโมง = 1 วันทำงาน'],
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
      item.unpaidDays,
      item.unpaidHours,
      item.otherDays,
      item.otherHours,
      item.totalDays,
      item.totalHours,
      item.details.length > 0
        ? item.details
            .map(
              (d) =>
                `${formatDateDisplay(d.date)}: ${d.type} ${d.days} วัน (${d.hours} ชม. - ${d.reason})`
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
      audit.activityGrandTotal.unpaidDays,
      audit.activityGrandTotal.unpaidHours,
      audit.activityGrandTotal.otherDays,
      audit.activityGrandTotal.otherHours,
      Number(
        (
          audit.activityGrandTotal.unpaidDays +
          audit.activityGrandTotal.otherDays
        ).toFixed(4)
      ),
      Number(
        (
          audit.activityGrandTotal.unpaidHours +
          audit.activityGrandTotal.otherHours
        ).toFixed(2)
      ),
      '',
    ],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Rows);
  XLSX.utils.book_append_sheet(wb, ws3, '3_ลาไม่รับค่าจ้าง_อื่นๆ');

  // ============================================================================
  // ชีตที่ 4: รายงานการใช้สิทธิการลาในเดือน
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
      'ประเภทการลา',
      'สถานะรับค่าจ้าง',
      'ตั้งแต่วันที่',
      'ถึงวันที่',
      'จำนวนชั่วโมงที่ใช้ในเดือน (ชม.)',
      'จำนวนวันที่ใช้ในเดือน (วัน)',
      'เหตุผลการลา',
      'สถานะอนุมัติ',
      'แหล่งข้อมูล',
      'หมายเหตุ',
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
      item.hours,
      item.days,
      item.reason,
      item.status,
      item.source,
      item.note,
    ]),
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Rows);
  XLSX.utils.book_append_sheet(wb, ws4, '4_การใช้สิทธิลาในเดือน');

  // ============================================================================
  // ชีตที่ 5: สรุปกิจกรรมการลาและมาสาย (รายบุคคล + รวมทั้งบริษัท)
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
      item.sickDays,
      item.sickHours,
      item.personalDays,
      item.personalHours,
      item.vacationDays,
      item.vacationHours,
      item.unpaidDays,
      item.unpaidHours,
      item.otherDays,
      item.otherHours,
      item.totalLeaveDays,
      item.totalLeaveHours,
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
      audit.activityGrandTotal.sickDays,
      audit.activityGrandTotal.sickHours,
      audit.activityGrandTotal.personalDays,
      audit.activityGrandTotal.personalHours,
      audit.activityGrandTotal.vacationDays,
      audit.activityGrandTotal.vacationHours,
      audit.activityGrandTotal.unpaidDays,
      audit.activityGrandTotal.unpaidHours,
      audit.activityGrandTotal.otherDays,
      audit.activityGrandTotal.otherHours,
      audit.activityGrandTotal.totalLeaveDays,
      audit.activityGrandTotal.totalLeaveHours,
      audit.activityGrandTotal.lateCount,
      audit.activityGrandTotal.lateMinutes,
      `ได้รับ ${audit.activityGrandTotal.diligenceEligibleCount} คน`,
    ],
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(sheet5Rows);
  XLSX.utils.book_append_sheet(wb, ws5, '5_สรุปกิจกรรมลาและสาย');

  // ============================================================================
  // ชีตที่ 6: สิทธิคงเหลือแต่ละบุคคล
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
      item.sickQuota,
      item.sickUsedTotal,
      item.sickRemaining,
      item.personalQuota,
      item.personalUsedTotal,
      item.personalRemaining,
      item.vacationQuota,
      item.vacationUsedTotal,
      item.vacationRemaining,
      item.otherQuota,
      item.otherUsedTotal,
      item.otherRemaining,
      item.monthSickUsed,
      item.monthPersonalUsed,
      item.monthVacationUsed,
      item.monthOtherAndUnpaidUsed,
    ]),
  ];
  const ws6 = XLSX.utils.aoa_to_sheet(sheet6Rows);
  XLSX.utils.book_append_sheet(wb, ws6, '6_สิทธิคงเหลือรายบุคคล');

  // ============================================================================
  // ชีตที่ 7: ตารางตรวจสอบเวลาเข้า-ออกรายวัน & หมายเหตุ HR
  // ============================================================================
  const sheet7Rows: (string | number)[][] = [
    [
      `ตารางตรวจสอบการสแกนนิ้วรายวัน และบันทึกการแก้ไข/หมายเหตุจาก HR ประจำเดือน ${monthLabel}`,
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
      r.totalLeaveDaysOnDate,
      r.leaveDetails.join('; '),
      r.sheetNote,
      r.hrNote,
    ]),
  ];
  const ws7 = XLSX.utils.aoa_to_sheet(sheet7Rows);
  XLSX.utils.book_append_sheet(wb, ws7, '7_ตรวจสอบสแกนนิ้วรายวัน');

  XLSX.writeFile(wb, `JCW_HR_Attendance_Report_${audit.yearMonth}.xlsx`);
}
