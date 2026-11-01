import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Edit3,
  FileText,
  Filter,
  History,
  RotateCcw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {
  DailyAuditRecord,
  EmployeeMapping,
  HROverrideRecord,
  MonthlyAuditOutput,
} from '../types/attendance';
import {
  formatDateDisplay,
  formatLeaveHuman,
  formatYearMonthThai,
} from '../utils/dateAndTime';

interface AttendanceTimeViewProps {
  auditResult: MonthlyAuditOutput;
  selectedYearMonth: string;
  reportMode: 'manager' | 'hr_payroll';
  employeeMappings: EmployeeMapping[];
  hrOverrides: Record<string, HROverrideRecord>;
  onEditDailyRecord: (record: DailyAuditRecord) => void;
  onQuickNoteDailyRecord: (record: DailyAuditRecord) => void;
  onToggleReviewed: (record: DailyAuditRecord) => Promise<void>;
  onResetSingleOverride: (key: string) => Promise<void>;
}

export const AttendanceTimeView: React.FC<AttendanceTimeViewProps> = ({
  auditResult,
  selectedYearMonth,
  reportMode,
  employeeMappings,
  hrOverrides,
  onEditDailyRecord,
  onQuickNoteDailyRecord,
  onToggleReviewed,
  onResetSingleOverride,
}) => {
  const [subTab, setSubTab] = useState<
    | 'late_and_diligence'
    | 'original_scans'
    | 'missing_scans'
    | 'edit_history_notes'
  >('late_and_diligence');

  const [filterEmp, setFilterEmp] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const latePeopleCount = auditResult.lateSummaryReport.filter(
    (l) => l.lateCount > 0
  ).length;
  const eligibleDiligenceCount = auditResult.diligenceReport.filter(
    (d) => d.isEligible
  ).length;

  const missingScanList = useMemo(() => {
    return auditResult.dailyRecords.filter((r) => {
      const isMissing = !r.hasIn || !r.hasOut;
      if (!isMissing || r.scanStatus === 'ลาเต็มวัน/มีข้อมูลการลา')
        return false;
      if (filterEmp !== 'ALL' && r.fullName !== filterEmp) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.fullName.toLowerCase().includes(q) ||
          r.nickname.toLowerCase().includes(q) ||
          r.date.includes(q) ||
          r.scanStatus.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [auditResult.dailyRecords, filterEmp, searchQuery]);

  const filteredOriginalDaily = useMemo(() => {
    return auditResult.dailyRecords.filter((r) => {
      if (filterEmp !== 'ALL' && r.fullName !== filterEmp) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.fullName.toLowerCase().includes(q) ||
          r.nickname.toLowerCase().includes(q) ||
          r.date.includes(q) ||
          r.scanStatus.toLowerCase().includes(q) ||
          r.hrNote.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [auditResult.dailyRecords, filterEmp, searchQuery]);

  const overrideHistoryList = useMemo(() => {
    return Object.values(hrOverrides).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }, [hrOverrides]);

  return (
    <div className="space-y-6">
      {/* Header + Sub-tabs + Filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              เวลาเข้างาน เบี้ยขยัน และข้อมูลสแกนต้นฉบับ — ประจำเดือน{' '}
              {formatYearMonthThai(selectedYearMonth)}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              รวมรายงานเข้างานสาย สิทธิ์เบี้ยขยัน เวลาเข้า–ออกต้นฉบับ รายการไม่พบสแกน ประวัติการแก้ไข และหมายเหตุ HR
            </p>
          </div>

          {auditResult.suspiciousScanRecords.length > 0 && (
            <div className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                พบเวลาสแกนเข้าผิดปกติ (เช่น สแกนช่วงบ่าย/เย็น){' '}
                <strong>{auditResult.suspiciousScanRecords.length} รายการ</strong>{' '}
                กรุณาตรวจสอบก่อนคำนวณเงินเดือน
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pt-3 border-t border-slate-200 no-print">
          <div
            className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl"
            role="tablist"
            aria-label="หมวดหมู่เวลาเข้างาน"
          >
            {[
              {
                id: 'late_and_diligence',
                label: 'เข้างานสาย & เบี้ยขยัน',
                icon: Clock,
                badge: `สาย ${auditResult.activityGrandTotal.lateCount} ครั้ง`,
              },
              {
                id: 'original_scans',
                label: 'เวลาเข้า–ออกต้นฉบับ (รายวัน)',
                icon: FileText,
                badge: `${auditResult.dailyRecords.length} แถว`,
              },
              {
                id: 'missing_scans',
                label: 'รายการไม่พบสแกน',
                icon: ShieldAlert,
                badge: `${missingScanList.length} รายการ`,
              },
              {
                id: 'edit_history_notes',
                label: 'ประวัติการแก้ไข & หมายเหตุ HR',
                icon: History,
                badge: `${overrideHistoryList.length} รายการ`,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSubTab(tab.id as typeof subTab)}
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

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            <select
              aria-label="กรองเวลาเข้างานตามพนักงาน"
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

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                aria-label="ค้นหาวันที่หรือชื่อพนักงาน"
                placeholder="ค้นหาชื่อ, วันที่, หมายเหตุ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: รายงานเข้างานสาย & สรุปเบี้ยขยัน */}
      {subTab === 'late_and_diligence' && (
        <div className="space-y-6">
          {/* คำเตือนเวลาสแกนเข้าผิดปกติ เช่น 16:10 น. */}
          {auditResult.suspiciousScanRecords.length > 0 && (
            <div className="bg-rose-50 rounded-2xl border border-rose-200 p-4 space-y-2.5">
              <div className="text-sm font-bold text-rose-950 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                แจ้งเตือนข้อมูลเวลาเข้างานผิดปกติ (เช่น สแกนเข้าเวลา 16:10 น.) — กรุณาตรวจสอบก่อนคำนวณเงินเดือน
              </div>
              <div className="space-y-2">
                {auditResult.suspiciousScanRecords.map((rec) => (
                  <div
                    key={rec.key}
                    className="p-3 rounded-xl bg-white border border-rose-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">
                        {formatDateDisplay(rec.date, true)} — {rec.fullName} (
                        {rec.nickname})
                      </span>
                      <div className="text-rose-700 font-medium mt-0.5">
                        {rec.suspiciousScanWarning} (สแกนต้นฉบับ: เข้า{' '}
                        {rec.originalScanIn} / ออก {rec.originalScanOut})
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEditDailyRecord(rec)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
                      >
                        ตรวจสอบ / แก้ไขเวลา
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ตารางที่ 1: รายงานเข้างานสาย */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  รายงานการเข้างานสายรายบุคคล (จำนวนครั้ง และจำนวนนาที)
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  เวลาเข้างานปกติ 08:00 น. (อนุโลม 08:01–08:15 น. เสียเบี้ยขยันแต่ไม่นับสาย) | สแกนตั้งแต่ 08:16 น. นับสาย 1 ครั้ง
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                ผู้มาสาย {latePeopleCount} คน / รวม{' '}
                {auditResult.activityGrandTotal.lateCount} ครั้ง (
                {auditResult.activityGrandTotal.lateMinutes} นาที)
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
                    <th className="py-2.5 px-3 font-semibold text-center">
                      จำนวนครั้งที่สาย
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      รวมเวลาสาย (นาที)
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      รายละเอียดวันที่มาสายและเวลาสแกนเข้า
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.lateSummaryReport
                    .filter(
                      (item) =>
                        filterEmp === 'ALL' || item.fullName === filterEmp
                    )
                    .map((item, idx) => (
                      <tr
                        key={item.fullName + idx}
                        className={
                          item.lateCount > 0
                            ? 'bg-amber-50/30 hover:bg-amber-50/60'
                            : 'hover:bg-slate-50'
                        }
                      >
                        <td className="py-2.5 px-3 text-slate-500">
                          {idx + 1}
                        </td>
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
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              item.lateCount > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {item.lateCount} ครั้ง
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">
                          <span
                            className={
                              item.lateMinutes > 0
                                ? 'text-rose-600'
                                : 'text-slate-400'
                            }
                          >
                            {item.lateMinutes} นาที
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {item.dailyDetails.length === 0 ? (
                            <span className="text-xs text-emerald-700">
                              ไม่มาสายในเดือนนี้
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {item.dailyDetails.map((d) => (
                                <span
                                  key={d.date}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${
                                    d.lateMinutes >= 180
                                      ? 'bg-rose-50 border-rose-300 text-rose-900 font-semibold'
                                      : 'bg-white border-amber-200 text-slate-700'
                                  }`}
                                >
                                  <strong>{formatDateDisplay(d.date)}</strong>
                                  <span>เข้า {d.scanIn}</span>
                                  <span className="text-rose-600 font-bold">
                                    (+{d.lateMinutes} น.)
                                  </span>
                                  {d.lateMinutes >= 180 && (
                                    <span className="px-1 rounded bg-rose-600 text-white text-[10px]">
                                      เวลาผิดปกติ!
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ตารางที่ 2: สรุปสิทธิ์เบี้ยขยัน */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-600" />
                  รายงานการตรวจสอบสิทธิ์เบี้ยขยันประจำเดือน
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  ทุกแผนกมีสิทธิ์ได้รับเบี้ยขยัน (ยกเว้นตำแหน่งเจ้าหน้าที่ฝ่ายขาย) เมื่อสแกนเข้าไม่เกิน 08:00 น. ทุกวัน และลารวมไม่เกิน 1 วัน
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                ได้รับเบี้ยขยัน {eligibleDiligenceCount} คน / ไม่ได้รับ{' '}
                {auditResult.diligenceReport.length - eligibleDiligenceCount} คน
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
                    <th className="py-2.5 px-3 font-semibold text-center">
                      วันมาทำงาน
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      เข้าหลัง 08:00 น.
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      วันลารวมในเดือน
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      ผลการพิจารณา
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      เหตุผล / เงื่อนไข
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditResult.diligenceReport
                    .filter(
                      (item) =>
                        filterEmp === 'ALL' || item.fullName === filterEmp
                    )
                    .map((item, idx) => (
                      <tr
                        key={item.fullName + idx}
                        className={
                          item.isEligible
                            ? 'bg-emerald-50/50 hover:bg-emerald-50'
                            : 'hover:bg-slate-50'
                        }
                      >
                        <td className="py-2.5 px-3 text-slate-500">
                          {idx + 1}
                        </td>
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
                        <td className="py-2.5 px-3 text-center">
                          {item.daysWorked} วัน
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={
                              item.daysScanAfter0800 > 0
                                ? 'text-amber-700 font-semibold'
                                : 'text-emerald-700'
                            }
                          >
                            {item.daysScanAfter0800} วัน
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {formatLeaveHuman(item.totalLeaveDays)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.isEligible ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              ได้รับเบี้ยขยัน
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                              ไม่ได้รับ
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-600">
                          {item.isEligible
                            ? 'ผ่านเกณฑ์ครบทั้ง 3 ข้อ'
                            : reportMode === 'manager'
                            ? item.disqualifyReasons[0] || '-'
                            : item.disqualifyReasons.join(' • ')}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* SUB-TAB 2: เวลาเข้า–ออกต้นฉบับ (รายวัน) */}
      {subTab === 'original_scans' && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                ตารางเวลาสแกนนิ้วเข้า–ออกต้นฉบับ เทียบกับเวลาที่ใช้คำนวณ ({filteredOriginalDaily.length}{' '}
                รายการ)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                ข้อมูลสแกนต้นฉบับถูกเก็บรักษาไว้เสมอ การแก้ไขของ HR จะเก็บแยกเป็น Override พร้อมประวัติย้อนหลัง
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[620px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200 z-10">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">วันที่</th>
                  <th className="py-2.5 px-3 font-semibold">พนักงาน</th>
                  <th className="py-2.5 px-3 font-semibold">ตำแหน่ง / แผนก</th>
                  <th className="py-2.5 px-3 font-semibold text-center bg-slate-200/60">
                    สแกนต้นฉบับ (เข้า - ออก)
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-center bg-indigo-50/60">
                    เวลาที่ใช้คำนวณ (เข้า - ออก)
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-center">
                    สถานะการสแกน
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-center">
                    สาย (นาที)
                  </th>
                  <th className="py-2.5 px-3 font-semibold">
                    การลา / หมายเหตุ HR
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-center no-print">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredOriginalDaily.map((r) => (
                  <tr
                    key={r.key}
                    className={
                      r.suspiciousScanWarning
                        ? 'bg-rose-50/70 hover:bg-rose-50'
                        : r.hasHROverride
                        ? 'bg-indigo-50/30 hover:bg-indigo-50/60'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2 px-3 font-mono whitespace-nowrap">
                      {formatDateDisplay(r.date)} ({r.dayOfWeek})
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-900">
                      {r.fullName} ({r.nickname})
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {r.position} • {r.department}
                    </td>
                    <td className="py-2 px-3 text-center font-mono text-slate-600 bg-slate-50">
                      {r.originalScanIn} - {r.originalScanOut}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-indigo-900">
                      {r.effectiveScanIn} - {r.effectiveScanOut}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          r.scanStatus === 'ครบปกติ'
                            ? 'bg-emerald-50 text-emerald-700'
                            : r.scanStatus === 'คาดว่าไปพบลูกค้า'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {r.scanStatus}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center font-semibold">
                      {r.lateMinutes > 0 ? (
                        <span className="text-rose-600">
                          {r.lateMinutes} นาที
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {r.suspiciousScanWarning && (
                        <div className="text-rose-700 font-bold mb-0.5">
                          {r.suspiciousScanWarning}
                        </div>
                      )}
                      {r.leaveDetails.length > 0 && (
                        <div className="text-indigo-700 font-medium">
                          {r.leaveDetails.join(' | ')}
                        </div>
                      )}
                      {(r.hrNote || r.sheetNote) && (
                        <div className="text-slate-600">
                          หมายเหตุ: {r.hrNote || r.sheetNote}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center no-print">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEditDailyRecord(r)}
                          className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold cursor-pointer"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => onQuickNoteDailyRecord(r)}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                        >
                          หมายเหตุ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUB-TAB 3: รายการไม่พบสแกน */}
      {subTab === 'missing_scans' && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                รายการไม่พบสแกนเข้า หรือ ไม่พบสแกนออก ({missingScanList.length}{' '}
                รายการ)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                แสดงเฉพาะวันที่สแกนนิ้วไม่ครบ (ไม่พบสแกนเข้า, ไม่พบสแกนออก, หรือฝ่ายขายไปพบลูกค้า)
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="py-2.5 px-3 font-semibold">ลำดับ</th>
                  <th className="py-2.5 px-3 font-semibold">วันที่</th>
                  <th className="py-2.5 px-3 font-semibold">พนักงาน</th>
                  <th className="py-2.5 px-3 font-semibold">ตำแหน่ง / แผนก</th>
                  <th className="py-2.5 px-3 font-semibold text-center">
                    สแกนต้นฉบับ (เข้า - ออก)
                  </th>
                  <th className="py-2.5 px-3 font-semibold">สาเหตุที่ไม่ครบ</th>
                  <th className="py-2.5 px-3 font-semibold">หมายเหตุ HR</th>
                  <th className="py-2.5 px-3 font-semibold text-center no-print">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {missingScanList.map((r, idx) => (
                  <tr key={r.key} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-mono">
                      {formatDateDisplay(r.date)} ({r.dayOfWeek})
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {r.fullName} ({r.nickname})
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600">
                      {r.position} • {r.department}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">
                      เข้า {r.originalScanIn} / ออก {r.originalScanOut}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-amber-900">
                      {r.scanStatus}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-700">
                      {r.hrNote || r.sheetNote || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center no-print">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEditDailyRecord(r)}
                          className="px-2.5 py-1 rounded bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleReviewed(r)}
                          className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                            r.isReviewed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {r.isReviewed ? 'ตรวจแล้ว ✓' : 'ทำเครื่องหมายตรวจแล้ว'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUB-TAB 4: ประวัติการแก้ไข & หมายเหตุ HR */}
      {subTab === 'edit_history_notes' && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 bg-indigo-50/70 border-b border-indigo-200 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" />
                ประวัติการแก้ไขข้อมูลและหมายเหตุโดย HR (Audit Trail) —{' '}
                {overrideHistoryList.length} รายการ
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                บันทึกว่าใครแก้ไขอะไร เมื่อใด พร้อมเปรียบเทียบค่าสแกนต้นฉบับกับค่าหลังแก้ไข
              </p>
            </div>
          </div>

          {overrideHistoryList.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              ยังไม่มีประวัติการแก้ไขข้อมูลในรอบเดือนนี้ (ใช้ข้อมูลสแกนนิ้วต้นฉบับ 100%)
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-semibold">วันที่ข้อมูล</th>
                    <th className="py-2.5 px-3 font-semibold">พนักงาน</th>
                    <th className="py-2.5 px-3 font-semibold">
                      ข้อมูลต้นฉบับก่อนแก้ไข
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      ค่าที่ HR ปรับปรุง / สถานะใหม่
                    </th>
                    <th className="py-2.5 px-3 font-semibold">หมายเหตุ HR</th>
                    <th className="py-2.5 px-3 font-semibold">
                      ผู้แก้ไข / เวลาบันทึก
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-center no-print">
                      คืนค่าต้นฉบับ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {overrideHistoryList.map((ov) => (
                    <tr key={ov.key} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono">
                        {formatDateDisplay(ov.date)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {ov.employeeName || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {ov.previousSummary || 'ตามข้อมูลสแกนต้นฉบับ'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-indigo-700">
                        {ov.overrideScanIn ? `เข้า: ${ov.overrideScanIn} ` : ''}
                        {ov.overrideScanOut
                          ? `ออก: ${ov.overrideScanOut} `
                          : ''}
                        {ov.overrideStatus ? `[${ov.overrideStatus}] ` : ''}
                        {ov.overrideLateMinutes !== undefined &&
                        ov.overrideLateMinutes !== null
                          ? `(สาย ${ov.overrideLateMinutes} นาที)`
                          : ''}
                        {!ov.overrideScanIn &&
                        !ov.overrideScanOut &&
                        !ov.overrideStatus &&
                        (ov.overrideLateMinutes === undefined ||
                          ov.overrideLateMinutes === null)
                          ? ov.isReviewed
                            ? 'ทำเครื่องหมายว่าตรวจแล้ว'
                            : 'เพิ่มหมายเหตุ HR'
                          : ''}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">
                        {ov.hrNote || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        <div>{ov.updatedBy || ov.reviewedBy || 'HR'}</div>
                        <div className="font-mono text-[11px]">
                          {ov.updatedAt || ov.reviewedAt || '-'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center no-print">
                        <button
                          type="button"
                          onClick={() => onResetSingleOverride(ov.key)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          คืนค่าเดิม
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
