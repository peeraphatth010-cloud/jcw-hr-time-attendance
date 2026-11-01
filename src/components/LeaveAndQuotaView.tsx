import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  FileSpreadsheet,
  Filter,
  Plus,
  UserCheck,
} from 'lucide-react';
import {
  EmployeeMapping,
  LeaveCategory,
  MonthlyAuditOutput,
} from '../types/attendance';
import {
  formatDateDisplay,
  formatHoursClean,
  formatLeaveHuman,
  formatYearMonthThai,
} from '../utils/dateAndTime';

interface LeaveAndQuotaViewProps {
  auditResult: MonthlyAuditOutput;
  selectedYearMonth: string;
  reportMode: 'manager' | 'hr_payroll';
  employeeMappings: EmployeeMapping[];
  onOpenAddLeaveModal: () => void;
}

export const LeaveAndQuotaView: React.FC<LeaveAndQuotaViewProps> = ({
  auditResult,
  selectedYearMonth,
  reportMode,
  employeeMappings,
  onOpenAddLeaveModal,
}) => {
  const [subView, setSubView] = useState<
    'summary_all' | 'leave_details' | 'unpaid_leave' | 'quota_remaining'
  >('summary_all');

  // ตัวกรองตามพนักงาน ประเภทลา และสถานะอนุมัติ
  const [filterEmp, setFilterEmp] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | LeaveCategory>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const filteredLeaveDetails = useMemo(() => {
    return auditResult.monthlyLeaveUsageReport.filter((item) => {
      if (filterEmp !== 'ALL' && item.fullName !== filterEmp) return false;
      if (filterType !== 'ALL' && item.leaveType !== filterType) return false;
      if (filterStatus !== 'ALL') {
        if (filterStatus === 'APPROVED' && !item.status.includes('อนุมัติ'))
          return false;
        if (filterStatus === 'CROSS_MONTH' && !item.isCrossMonth) return false;
      }
      return true;
    });
  }, [
    auditResult.monthlyLeaveUsageReport,
    filterEmp,
    filterType,
    filterStatus,
  ]);

  const filteredActivitySummary = useMemo(() => {
    return auditResult.activitySummaryReport.filter((item) => {
      if (filterEmp !== 'ALL' && item.fullName !== filterEmp) return false;
      if (filterType === 'ลาป่วย' && item.sickDays <= 0) return false;
      if (filterType === 'ลากิจ' && item.personalDays <= 0) return false;
      if (filterType === 'ลาพักร้อน' && item.vacationDays <= 0) return false;
      if (filterType === 'ลาไม่รับค่าจ้าง' && item.unpaidDays <= 0) return false;
      if (filterType === 'ลาอื่นๆ' && item.otherDays <= 0) return false;
      return true;
    });
  }, [auditResult.activitySummaryReport, filterEmp, filterType]);

  const filteredUnpaidReport = useMemo(() => {
    return auditResult.unpaidAndOtherLeaveReport.filter((item) => {
      if (filterEmp !== 'ALL' && item.fullName !== filterEmp) return false;
      return true;
    });
  }, [auditResult.unpaidAndOtherLeaveReport, filterEmp]);

  const filteredQuotaReport = useMemo(() => {
    return auditResult.quotaReport.filter((item) => {
      if (filterEmp !== 'ALL' && item.fullName !== filterEmp) return false;
      return true;
    });
  }, [auditResult.quotaReport, filterEmp]);

  return (
    <div className="space-y-6">
      {/* Header + Sub-tabs + Add Leave Button */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              การลาและสิทธิวันลาประจำเดือน {formatYearMonthThai(selectedYearMonth)}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              รวมสรุปการลาทุกประเภท รายละเอียดใบลา ลาไม่รับค่าจ้าง และสิทธิคงเหลือรายบุคคล (8 ชม. = 1 วันทำงาน)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={onOpenAddLeaveModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              เพิ่มใบลา
            </button>
          </div>
        </div>

        {/* Sub-navigation & Filters */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pt-3 border-t border-slate-200 no-print">
          <div
            className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl"
            role="tablist"
            aria-label="มุมมองรายงานการลาและสิทธิ"
          >
            {[
              {
                id: 'summary_all',
                label: 'สรุปการลาทุกประเภท',
                icon: FileSpreadsheet,
                badge: formatLeaveHuman(
                  auditResult.activityGrandTotal.totalLeaveDays,
                  { zeroText: '0 วัน' }
                ),
              },
              {
                id: 'leave_details',
                label: 'รายละเอียดการลาในเดือน',
                icon: Calendar,
                badge: `${auditResult.monthlyLeaveUsageReport.length} รายการ`,
              },
              {
                id: 'unpaid_leave',
                label: 'ลาไม่รับค่าจ้าง & ลาอื่น ๆ',
                icon: AlertTriangle,
                badge: formatLeaveHuman(
                  auditResult.activityGrandTotal.unpaidDays,
                  { zeroText: '0 วัน' }
                ),
              },
              {
                id: 'quota_remaining',
                label: 'สิทธิคงเหลือรายบุคคล',
                icon: UserCheck,
                badge: `${auditResult.quotaReport.length} คน`,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = subView === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSubView(tab.id as typeof subView)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    active
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {tab.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ตัวกรองตามพนักงาน ประเภทลา และสถานะอนุมัติ */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              ตัวกรอง:
            </span>
            <select
              aria-label="กรองข้อมูลการลาตามพนักงาน"
              value={filterEmp}
              onChange={(e) => setFilterEmp(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium"
            >
              <option value="ALL">พนักงานทุกคน</option>
              {employeeMappings.map((m) => (
                <option key={m.fullName} value={m.fullName}>
                  {m.fullName} ({m.nickname})
                </option>
              ))}
            </select>

            <select
              aria-label="กรองตามประเภทการลา"
              value={filterType}
              onChange={(e) =>
                setFilterType(e.target.value as 'ALL' | LeaveCategory)
              }
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium"
            >
              <option value="ALL">ทุกประเภทการลา</option>
              <option value="ลาป่วย">ลาป่วย</option>
              <option value="ลากิจ">ลากิจ</option>
              <option value="ลาพักร้อน">ลาพักร้อน</option>
              <option value="ลาไม่รับค่าจ้าง">ลาไม่รับค่าจ้าง</option>
              <option value="ลาอื่นๆ">ลาอื่น ๆ</option>
            </select>

            <select
              aria-label="กรองตามสถานะอนุมัติ"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium"
            >
              <option value="ALL">ทุกสถานะอนุมัติ</option>
              <option value="APPROVED">เฉพาะที่อนุมัติแล้ว</option>
              <option value="CROSS_MONTH">เฉพาะใบลาข้ามเดือน</option>
            </select>

            {(filterEmp !== 'ALL' ||
              filterType !== 'ALL' ||
              filterStatus !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setFilterEmp('ALL');
                  setFilterType('ALL');
                  setFilterStatus('ALL');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 1. สรุปการลาทุกประเภท (ลาป่วย, ลากิจ, ลาพักร้อน, ลาไม่รับค่าจ้าง, ลาอื่น ๆ) */}
      {subView === 'summary_all' && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                ตารางสรุปการลาแยกตามประเภทจริงรายบุคคล (ลาป่วย • ลากิจ • ลาพักร้อน • ลาไม่รับค่าจ้าง • ลาอื่น ๆ)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                ใช้สูตรและการปัดเศษเดียวกับหน้าภาพรวมเงินเดือนและรายงานเบี้ยขยันทุกประการ
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="py-2.5 px-2.5 font-semibold">ลำดับ</th>
                  <th className="py-2.5 px-3 font-semibold">
                    ชื่อ-นามสกุล (ชื่อเล่น)
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold">ตำแหน่ง</th>
                  <th className="py-2.5 px-2.5 font-semibold">แผนก</th>
                  <th className="py-2.5 px-2.5 font-semibold text-center bg-blue-50/60">
                    ลาป่วย
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-center bg-amber-50/60">
                    ลากิจ
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-center bg-emerald-50/60">
                    ลาพักร้อน
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-center bg-rose-50/60">
                    ลาไม่รับค่าจ้าง
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-center bg-purple-50/60">
                    ลาอื่น ๆ
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-center bg-indigo-50/60">
                    รวมวันลา
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold text-center">
                    คิดเป็นชั่วโมง
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredActivitySummary.map((item, idx) => (
                  <tr key={item.fullName + idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-2.5 text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {item.fullName}{' '}
                      <span className="text-slate-500 font-normal">
                        ({item.nickname})
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 text-xs text-slate-700">
                      {item.position}
                    </td>
                    <td className="py-2.5 px-2.5 text-xs">{item.department}</td>
                    <td className="py-2.5 px-2.5 text-center">
                      {item.sickDays > 0 ? (
                        <span className="font-semibold text-blue-700">
                          {formatLeaveHuman(item.sickDays)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-center">
                      {item.personalDays > 0 ? (
                        <span className="font-semibold text-amber-700">
                          {formatLeaveHuman(item.personalDays)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-center">
                      {item.vacationDays > 0 ? (
                        <span className="font-semibold text-emerald-700">
                          {formatLeaveHuman(item.vacationDays)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-center">
                      {item.unpaidDays > 0 ? (
                        <span className="font-semibold text-rose-700">
                          {formatLeaveHuman(item.unpaidDays)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-center">
                      {item.otherDays > 0 ? (
                        <span className="font-semibold text-purple-700">
                          {formatLeaveHuman(item.otherDays)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-center font-bold bg-indigo-50/30">
                      <span
                        className={
                          item.totalLeaveDays > 0
                            ? 'text-indigo-900'
                            : 'text-slate-400'
                        }
                      >
                        {formatLeaveHuman(item.totalLeaveDays)}
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 text-center text-slate-600">
                      {item.totalLeaveHours > 0
                        ? formatHoursClean(item.totalLeaveHours)
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-950 text-white font-bold">
                  <td colSpan={4} className="py-3 px-3 text-right">
                    รวมทั้งบริษัท (Grand Total):
                  </td>
                  <td className="py-3 px-2.5 text-center text-sky-200">
                    {formatLeaveHuman(auditResult.activityGrandTotal.sickDays, {
                      zeroText: '0 วัน',
                    })}
                  </td>
                  <td className="py-3 px-2.5 text-center text-amber-200">
                    {formatLeaveHuman(
                      auditResult.activityGrandTotal.personalDays,
                      { zeroText: '0 วัน' }
                    )}
                  </td>
                  <td className="py-3 px-2.5 text-center text-emerald-200">
                    {formatLeaveHuman(
                      auditResult.activityGrandTotal.vacationDays,
                      { zeroText: '0 วัน' }
                    )}
                  </td>
                  <td className="py-3 px-2.5 text-center text-rose-200">
                    {formatLeaveHuman(
                      auditResult.activityGrandTotal.unpaidDays,
                      { zeroText: '0 วัน' }
                    )}
                  </td>
                  <td className="py-3 px-2.5 text-center text-purple-200">
                    {formatLeaveHuman(auditResult.activityGrandTotal.otherDays, {
                      zeroText: '0 วัน',
                    })}
                  </td>
                  <td className="py-3 px-2.5 text-center bg-indigo-900 text-white">
                    {formatLeaveHuman(
                      auditResult.activityGrandTotal.totalLeaveDays,
                      { zeroText: '0 วัน' }
                    )}
                  </td>
                  <td className="py-3 px-2.5 text-center text-indigo-200">
                    {formatHoursClean(
                      auditResult.activityGrandTotal.totalLeaveHours
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* 2. รายละเอียดการลาในเดือน + ตรวจสอบวันลาข้ามเดือน */}
      {subView === 'leave_details' && (
        <div className="space-y-4">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                รายละเอียดการใช้สิทธิการลาในเดือน ({filteredLeaveDetails.length}{' '}
                รายการ)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                รองรับการแปลงวันที่ทั้ง YYYY-MM-DD และ DD/MM/YYYY พร้อมตัดสัดส่วนเฉพาะวันทำงานในเดือนที่เลือก
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-semibold">ลำดับ</th>
                    <th className="py-2.5 px-3 font-semibold">
                      ชื่อ-นามสกุล (ชื่อเล่น)
                    </th>
                    <th className="py-2.5 px-3 font-semibold">ตำแหน่ง</th>
                    <th className="py-2.5 px-3 font-semibold">แผนก</th>
                    <th className="py-2.5 px-3 font-semibold">ประเภทการลา</th>
                    <th className="py-2.5 px-3 font-semibold">
                      วันที่ลา (ตั้งแต่วันที่ - ถึงวันที่)
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      จำนวนวันลา
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      ชั่วโมงลา
                    </th>
                    <th className="py-2.5 px-3 font-semibold">เหตุผลการลา</th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      สถานะอนุมัติ
                    </th>
                    {reportMode === 'hr_payroll' && (
                      <th className="py-2.5 px-3 font-semibold text-center">
                        แหล่งข้อมูล / ตรวจวันข้ามเดือน
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredLeaveDetails.length === 0 ? (
                    <tr>
                      <td
                        colSpan={reportMode === 'hr_payroll' ? 11 : 10}
                        className="py-8 text-center text-slate-500"
                      >
                        ไม่พบรายการลาตามตัวกรองที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredLeaveDetails.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {item.fullName}{' '}
                          <span className="text-slate-500 font-normal">
                            ({item.nickname})
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          {item.position}
                        </td>
                        <td className="py-2.5 px-3">{item.department}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              item.isUnpaid ||
                              item.leaveType === 'ลาไม่รับค่าจ้าง'
                                ? 'bg-rose-100 text-rose-800'
                                : item.leaveType === 'ลาป่วย'
                                ? 'bg-blue-100 text-blue-800'
                                : item.leaveType === 'ลากิจ'
                                ? 'bg-amber-100 text-amber-800'
                                : item.leaveType === 'ลาพักร้อน'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {item.leaveType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium">
                          {item.startDate === item.endDate
                            ? formatDateDisplay(item.startDate, true)
                            : `${formatDateDisplay(item.startDate)} ถึง ${formatDateDisplay(item.endDate)}`}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-indigo-700">
                          {formatLeaveHuman(item.days)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-700">
                          {formatHoursClean(item.hours)}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-700">
                          {item.reason}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                            {item.status || 'อนุมัติ'}
                          </span>
                        </td>
                        {reportMode === 'hr_payroll' && (
                          <td className="py-2.5 px-3 text-center">
                            {item.isCrossMonth ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-900">
                                {item.dateValidationNote}
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700">
                                {item.source}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {auditResult.crossMonthOrFutureLeaves.length > 0 && (
            <section className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4 space-y-3">
              <h4 className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                ใบลาข้ามเดือนและใบลาล่วงหน้าต่างเดือนที่ระบบตรวจพบ ({auditResult.crossMonthOrFutureLeaves.length}{' '}
                รายการ)
              </h4>
              <div className="overflow-x-auto bg-white rounded-xl border border-amber-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-amber-100/60 text-amber-950 border-b border-amber-200">
                      <th className="py-2 px-3 font-semibold">พนักงาน</th>
                      <th className="py-2 px-3 font-semibold">ประเภทลา</th>
                      <th className="py-2 px-3 font-semibold">ช่วงวันที่ลา</th>
                      <th className="py-2 px-3 font-semibold text-center">
                        วันลาตามใบลา
                      </th>
                      <th className="py-2 px-3 font-semibold text-center">
                        หักในเดือน {selectedYearMonth}
                      </th>
                      <th className="py-2 px-3 font-semibold">ผลการตรวจสอบ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {auditResult.crossMonthOrFutureLeaves.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {c.fullName} ({c.nickname})
                        </td>
                        <td className="py-2 px-3">{c.leaveType}</td>
                        <td className="py-2 px-3 font-mono">
                          {formatDateDisplay(c.startDate)} ถึง{' '}
                          {formatDateDisplay(c.endDate)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {formatLeaveHuman(c.totalRequestedDays ?? c.days)}
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-indigo-700">
                          {formatLeaveHuman(c.days, { zeroText: '0 วัน' })}
                        </td>
                        <td className="py-2 px-3 text-amber-900">
                          {c.dateValidationNote}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* 3. ลาไม่รับค่าจ้าง & ลาอื่น ๆ */}
      {subView === 'unpaid_leave' && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                รายงานการลาไม่รับค่าจ้าง (Leave Without Pay) และลาอื่น ๆ
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                แสดงจำนวนวันลาและชั่วโมงลาอย่างชัดเจนสำหรับนำไปคำนวณการหักเงินเดือน
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
              รวมลาไม่รับค่าจ้าง:{' '}
              {formatLeaveHuman(auditResult.activityGrandTotal.unpaidDays, {
                zeroText: '0 วัน',
              })}{' '}
              ({formatHoursClean(auditResult.activityGrandTotal.unpaidHours)})
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="py-2.5 px-3 font-semibold">ลำดับ</th>
                  <th className="py-2.5 px-3 font-semibold">
                    ชื่อ-นามสกุล (ชื่อเล่น)
                  </th>
                  <th className="py-2.5 px-3 font-semibold">ตำแหน่ง</th>
                  <th className="py-2.5 px-3 font-semibold">แผนก</th>
                  <th className="py-2.5 px-3 font-semibold text-center bg-rose-50/60">
                    ลาไม่รับค่าจ้าง (วัน)
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-center bg-rose-50/60">
                    ชั่วโมงไม่รับค่าจ้าง
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-center bg-purple-50/60">
                    ลาอื่น ๆ
                  </th>
                  <th className="py-2.5 px-3 font-semibold">
                    รายละเอียดวันที่ใช้สิทธิและเหตุผล
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredUnpaidReport.map((item, idx) => (
                  <tr
                    key={item.fullName + idx}
                    className={
                      item.unpaidDays > 0
                        ? 'bg-rose-50/30 hover:bg-rose-50/60'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {item.fullName}{' '}
                      <span className="text-slate-500 font-normal">
                        ({item.nickname})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {item.position}
                    </td>
                    <td className="py-2.5 px-3">{item.department}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-rose-700">
                      {formatLeaveHuman(item.unpaidDays)}
                    </td>
                    <td className="py-2.5 px-3 text-center text-rose-800">
                      {item.unpaidHours > 0
                        ? formatHoursClean(item.unpaidHours)
                        : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-purple-700">
                      {formatLeaveHuman(item.otherDays)}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-700">
                      {item.details.length === 0
                        ? '-'
                        : item.details
                            .map(
                              (d) =>
                                `${formatDateDisplay(d.date)}: ${d.type} ${formatLeaveHuman(d.days)} (${d.reason})`
                            )
                            .join(' • ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. สิทธิคงเหลือรายบุคคล */}
      {subView === 'quota_remaining' && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              ตารางสรุปสิทธิวันลาคงเหลือรายบุคคล (ลาป่วย • ลากิจ • ลาพักร้อน • ลาอื่น ๆ)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              แสดงโควตาวันลาทั้งปี วันลาที่ใช้สะสม และวันลาคงเหลือของพนักงานแต่ละคน
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="py-2.5 px-2.5 font-semibold" rowSpan={2}>
                    ลำดับ
                  </th>
                  <th className="py-2.5 px-3 font-semibold" rowSpan={2}>
                    ชื่อ-นามสกุล (ชื่อเล่น)
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold" rowSpan={2}>
                    ตำแหน่ง
                  </th>
                  <th className="py-2.5 px-2.5 font-semibold" rowSpan={2}>
                    แผนก
                  </th>
                  <th
                    className="py-1.5 px-2 font-semibold text-center bg-blue-50 border-b border-blue-200"
                    colSpan={3}
                  >
                    ลาป่วย
                  </th>
                  <th
                    className="py-1.5 px-2 font-semibold text-center bg-amber-50 border-b border-amber-200"
                    colSpan={3}
                  >
                    ลากิจ
                  </th>
                  <th
                    className="py-1.5 px-2 font-semibold text-center bg-emerald-50 border-b border-emerald-200"
                    colSpan={3}
                  >
                    ลาพักร้อน
                  </th>
                  <th
                    className="py-1.5 px-2 font-semibold text-center bg-purple-50 border-b border-purple-200"
                    colSpan={2}
                  >
                    ลาอื่น ๆ
                  </th>
                </tr>
                <tr className="bg-slate-50 text-[11px] text-slate-600 border-b border-slate-200">
                  <th className="py-1.5 px-2 text-center bg-blue-50/50">สิทธิ์</th>
                  <th className="py-1.5 px-2 text-center bg-blue-50/50">ใช้สะสม</th>
                  <th className="py-1.5 px-2 text-center font-bold text-blue-900 bg-blue-100/60">
                    คงเหลือ
                  </th>
                  <th className="py-1.5 px-2 text-center bg-amber-50/50">
                    สิทธิ์
                  </th>
                  <th className="py-1.5 px-2 text-center bg-amber-50/50">
                    ใช้สะสม
                  </th>
                  <th className="py-1.5 px-2 text-center font-bold text-amber-900 bg-amber-100/60">
                    คงเหลือ
                  </th>
                  <th className="py-1.5 px-2 text-center bg-emerald-50/50">
                    สิทธิ์
                  </th>
                  <th className="py-1.5 px-2 text-center bg-emerald-50/50">
                    ใช้สะสม
                  </th>
                  <th className="py-1.5 px-2 text-center font-bold text-emerald-900 bg-emerald-100/60">
                    คงเหลือ
                  </th>
                  <th className="py-1.5 px-2 text-center bg-purple-50/50">
                    สิทธิ์
                  </th>
                  <th className="py-1.5 px-2 text-center font-bold text-purple-900 bg-purple-100/60">
                    คงเหลือ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredQuotaReport.map((q, idx) => (
                  <tr key={q.fullName + idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-2.5 text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {q.fullName}{' '}
                      <span className="text-slate-500 font-normal">
                        ({q.nickname})
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 text-xs text-slate-700">
                      {q.position}
                    </td>
                    <td className="py-2.5 px-2.5 text-xs">{q.department}</td>
                    <td className="py-2.5 px-2 text-center text-slate-600">
                      {formatLeaveHuman(q.sickQuota)}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-600">
                      {formatLeaveHuman(q.sickUsedTotal)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-blue-800 bg-blue-50/40">
                      {formatLeaveHuman(q.sickRemaining, { zeroText: '0 วัน' })}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-600">
                      {formatLeaveHuman(q.personalQuota)}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-600">
                      {formatLeaveHuman(q.personalUsedTotal)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-amber-800 bg-amber-50/40">
                      {formatLeaveHuman(q.personalRemaining, {
                        zeroText: '0 วัน',
                      })}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-600">
                      {formatLeaveHuman(q.vacationQuota)}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-600">
                      {formatLeaveHuman(q.vacationUsedTotal)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-emerald-800 bg-emerald-50/40">
                      {formatLeaveHuman(q.vacationRemaining, {
                        zeroText: '0 วัน',
                      })}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-600">
                      {formatLeaveHuman(q.otherQuota)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-purple-800 bg-purple-50/40">
                      {formatLeaveHuman(q.otherRemaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
