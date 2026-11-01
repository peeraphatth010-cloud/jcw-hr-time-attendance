import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  Edit3,
  FileSpreadsheet,
  Link2,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  AuditSettings,
  CompanyProfileSettings,
  EmployeeMapping,
  EmployeeQuotaRecord,
  HROverrideRecord,
  LeaveFormRecord,
  MonthlyAuditOutput,
  RawAttendanceRow,
} from '../types/attendance';
import { runMonthlyAttendanceAudit } from '../utils/auditEngine';
import {
  formatDateDisplay,
  formatHoursClean,
  formatLeaveHuman,
  formatYearMonthThai,
} from '../utils/dateAndTime';

interface EmployeesAndSettingsProps {
  employeeMappings: EmployeeMapping[];
  onUpdateMappings: (next: EmployeeMapping[]) => Promise<void>;
  settings: AuditSettings;
  onlyMappedEmployees: boolean;
  onConfirmSettingsChange: (
    nextSettings: AuditSettings,
    nextOnlyMapped: boolean
  ) => Promise<void>;
  auditResult: MonthlyAuditOutput;
  selectedYearMonth: string;
  attendanceRows: RawAttendanceRow[];
  leaveRecords: LeaveFormRecord[];
  quotaRecords: EmployeeQuotaRecord[];
  hrOverrides: Record<string, HROverrideRecord>;
  onOpenFirebaseModal: () => void;
  lastSyncTimeText: string;
}

export const DEFAULT_COMPANY_PROFILE: CompanyProfileSettings = {
  companyName: 'บริษัท เจซีดับบลิว อินเตอร์เนชั่นแนล จำกัด (JCW International)',
  branchName: 'สำนักงานใหญ่',
  standardStartTime: '08:00',
  graceEndTime: '08:15',
  salesNextDayStartTime: '09:00',
  hoursPerDay: 8,
  diligenceMaxLeaveDays: 1,
  hrReviewerName: 'ฝ่ายทรัพยากรบุคคล (HR / Payroll)',
};

export const EmployeesAndSettingsView: React.FC<EmployeesAndSettingsProps> = ({
  employeeMappings,
  onUpdateMappings,
  settings,
  onlyMappedEmployees,
  onConfirmSettingsChange,
  auditResult,
  selectedYearMonth,
  attendanceRows,
  leaveRecords,
  quotaRecords,
  hrOverrides,
  onOpenFirebaseModal,
  lastSyncTimeText,
}) => {
  const [subTab, setSubTab] = useState<
    'mapping' | 'departments' | 'rules' | 'company'
  >('mapping');
  const [empSearch, setEmpSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EmployeeMapping | null>(null);

  // Draft การตั้งค่ากฎการคำนวณ (ต้องแสดงผลกระทบและยืนยันก่อนบันทึกเสมอ)
  const [draftSettings, setDraftSettings] = useState<AuditSettings>(settings);
  const [draftOnlyMapped, setDraftOnlyMapped] =
    useState<boolean>(onlyMappedEmployees);
  const [isRuleImpactModalOpen, setIsRuleImpactModalOpen] = useState(false);
  const [newHolidayInput, setNewHolidayInput] = useState('');

  const companyProfile = settings.companyProfile || DEFAULT_COMPANY_PROFILE;
  const [companyDraft, setCompanyDraft] =
    useState<CompanyProfileSettings>(companyProfile);
  const [companySavedMsg, setCompanySavedMsg] = useState('');

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const m of employeeMappings) {
      if (m.department) set.add(m.department);
    }
    return Array.from(set);
  }, [employeeMappings]);

  const filteredMappings = useMemo(() => {
    return employeeMappings.filter((m) => {
      if (deptFilter !== 'ALL' && m.department !== deptFilter) return false;
      if (empSearch.trim()) {
        const q = empSearch.toLowerCase();
        return (
          m.fullName.toLowerCase().includes(q) ||
          m.nickname.toLowerCase().includes(q) ||
          m.scannerName.toLowerCase().includes(q) ||
          (m.position || '').toLowerCase().includes(q) ||
          m.department.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [employeeMappings, deptFilter, empSearch]);

  // จำลองผลกระทบเมื่อเปลี่ยนกฎคำนวณเงินเดือน
  const simulatedRuleAudit = useMemo(() => {
    if (!isRuleImpactModalOpen) return auditResult;
    return runMonthlyAttendanceAudit({
      yearMonth: selectedYearMonth,
      attendanceRows,
      leaveRecords,
      quotaRecords,
      employeeMappings,
      hrOverrides,
      settings: {
        ...draftSettings,
        onlyMappedEmployees: draftOnlyMapped,
        autoSkipCompanyWideEmptyDays: true,
      },
    });
  }, [
    isRuleImpactModalOpen,
    auditResult,
    selectedYearMonth,
    attendanceRows,
    leaveRecords,
    quotaRecords,
    employeeMappings,
    hrOverrides,
    draftSettings,
    draftOnlyMapped,
  ]);

  const handleSaveEmployeeEdit = async () => {
    if (editingIdx === null || !editDraft) return;
    const next = [...employeeMappings];
    next[editingIdx] = editDraft;
    await onUpdateMappings(next);
    setEditingIdx(null);
    setEditDraft(null);
  };

  const handleSaveCompanyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextSettings: AuditSettings = {
      ...settings,
      companyProfile: companyDraft,
    };
    await onConfirmSettingsChange(nextSettings, onlyMappedEmployees);
    setCompanySavedMsg('บันทึกข้อมูลบริษัทเรียบร้อยแล้ว');
    setTimeout(() => setCompanySavedMsg(''), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header & Sub-navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-600" />
              พนักงานและตั้งค่าระบบ (Employees & Payroll Rules)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              จัดการการผูกชื่อสแกนนิ้วกับรายชื่อพนักงาน แผนก กฎเบี้ยขยัน กฎเวลาสาย การแปลงชั่วโมงลา และข้อมูลบริษัท
            </p>
          </div>

          <div
            className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl"
            role="tablist"
            aria-label="หมวดหมู่การตั้งค่า"
          >
            {[
              {
                id: 'mapping',
                label: 'ผูกข้อมูล & รายชื่อพนักงาน',
                icon: Link2,
              },
              {
                id: 'departments',
                label: 'แผนก & สิทธิ์เบี้ยขยัน',
                icon: Users,
              },
              {
                id: 'rules',
                label: 'กฎเวลาสาย & แปลงวันลา',
                icon: Clock,
              },
              {
                id: 'company',
                label: 'ตั้งค่าข้อมูลบริษัท',
                icon: Building2,
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
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: ผูกข้อมูลพนักงาน & รายชื่อพนักงาน */}
      {subTab === 'mapping' && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-indigo-600" />
                ตารางผูกชื่อเครื่องสแกนนิ้วกับรายชื่อพนักงานจริง ({filteredMappings.length}{' '}
                คน)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                ระบบใช้ตัวเชื่อมภายในเชื่อมข้อมูลระหว่างไฟล์ &quot;บันทึกเข้างาน&quot; และ &quot;แบบฟอร์มลาออนไลน์&quot; โดยอัตโนมัติ
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  aria-label="ค้นหาชื่อพนักงานหรือชื่อสแกนนิ้ว"
                  placeholder="ค้นหาชื่อ, ชื่อเล่น, ชื่อสแกน..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <select
                aria-label="กรองตามแผนก"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
              >
                <option value="ALL">ทุกแผนก ({employeeMappings.length} คน)</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="py-2.5 px-3 font-semibold">ลำดับ</th>
                  <th className="py-2.5 px-3 font-semibold">
                    ชื่อในเครื่องสแกนนิ้ว
                  </th>
                  <th className="py-2.5 px-3 font-semibold">
                    ชื่อ-นามสกุลจริง (ในใบลาออนไลน์)
                  </th>
                  <th className="py-2.5 px-3 font-semibold">ชื่อเล่น</th>
                  <th className="py-2.5 px-3 font-semibold">ตำแหน่ง</th>
                  <th className="py-2.5 px-3 font-semibold">แผนก/ฝ่าย</th>
                  <th className="py-2.5 px-3 font-semibold text-center">
                    สถานะการผูกข้อมูล
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-center">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredMappings.map((m, idx) => {
                  const realIdx = employeeMappings.findIndex(
                    (orig) => orig.fullName === m.fullName
                  );
                  const isEditing = editingIdx === realIdx && editDraft;

                  return (
                    <tr key={m.fullName + idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-indigo-700">
                        {isEditing ? (
                          <input
                            type="text"
                            aria-label="แก้ไขชื่อในเครื่องสแกนนิ้ว"
                            value={editDraft.scannerName}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                scannerName: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-indigo-300 rounded text-xs w-28"
                          />
                        ) : (
                          m.scannerName
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            aria-label="แก้ไขชื่อ-นามสกุลจริง"
                            value={editDraft.fullName}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                fullName: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-indigo-300 rounded text-xs w-44"
                          />
                        ) : (
                          m.fullName
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {isEditing ? (
                          <input
                            type="text"
                            aria-label="แก้ไขชื่อเล่น"
                            value={editDraft.nickname}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                nickname: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-indigo-300 rounded text-xs w-20"
                          />
                        ) : (
                          m.nickname
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {isEditing ? (
                          <input
                            type="text"
                            aria-label="แก้ไขตำแหน่ง"
                            value={editDraft.position || ''}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                position: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-indigo-300 rounded text-xs w-40"
                          />
                        ) : (
                          m.position || '-'
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {isEditing ? (
                          <input
                            type="text"
                            aria-label="แก้ไขแผนก"
                            value={editDraft.department}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                department: e.target.value,
                              })
                            }
                            className="px-2 py-1 border border-indigo-300 rounded text-xs w-28"
                          />
                        ) : (
                          m.department
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" />
                          ผูกข้อมูลสำเร็จ
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={handleSaveEmployeeEdit}
                              className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                            >
                              บันทึก
                            </button>
                            <button
                              onClick={() => {
                                setEditingIdx(null);
                                setEditDraft(null);
                              }}
                              className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-xs cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingIdx(realIdx);
                              setEditDraft({ ...m });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-medium cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            แก้ไข
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUB-TAB 2: แผนก & สิทธิ์เบี้ยขยัน */}
      {subTab === 'departments' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              สรุปจำนวนพนักงานแยกตามแผนก และสิทธิ์เบี้ยขยัน
            </h3>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden text-xs sm:text-sm">
              {departments.map((dept) => {
                const members = employeeMappings.filter(
                  (m) => m.department === dept
                );
                const excludedCount = members.filter(
                  (m) =>
                    (m.position || '').includes('เจ้าหน้าที่ฝ่ายขาย') ||
                    (m.position || '') === 'เจ้าหน้าที่ขาย'
                ).length;
                return (
                  <div
                    key={dept}
                    className="p-3.5 flex items-center justify-between hover:bg-slate-50"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{dept}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {members.map((m) => `${m.fullName} (${m.nickname})`).join(', ')}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 font-bold text-xs">
                        {members.length} คน
                      </span>
                      {excludedCount > 0 && (
                        <div className="text-[11px] text-amber-700 mt-1">
                          ยกเว้นเบี้ยขยัน {excludedCount} คน (เจ้าหน้าที่ฝ่ายขาย)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-600" />
              กฎการได้รับเบี้ยขยัน (Diligence Allowance Rules)
            </h3>
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2.5 text-xs sm:text-sm text-emerald-950">
              <p className="font-bold">
                พนักงานจะได้รับเบี้ยขยันประจำเดือนเมื่อผ่านเกณฑ์ครบทั้ง 3 ข้อดังนี้:
              </p>
              <ol className="list-decimal list-inside space-y-2">
                <li>
                  <strong>เกณฑ์ตำแหน่งและแผนก:</strong> พนักงานทุกแผนก (รวมฝ่ายขาย เช่น ผู้จัดการฝ่ายขาย, ธุรการขาย) มีสิทธิ์ได้รับเบี้ยขยัน{' '}
                  <span className="underline font-bold text-rose-700">
                    ยกเว้นตำแหน่ง &quot;เจ้าหน้าที่ฝ่ายขาย&quot;
                  </span>
                </li>
                <li>
                  <strong>เกณฑ์เวลาสแกนนิ้วเข้างาน:</strong> ทุกวันทำงานที่มาทำงานต้องมีเวลาสแกนเข้างาน{' '}
                  <strong>ไม่เกิน 08:00 น.</strong> (หากสแกนช่วงอนุโลม 08:01–08:15 น. จะไม่นับว่าสาย แต่ไม่ได้รับเบี้ยขยัน) และต้องไม่มีวันที่ลืมสแกนเข้างาน
                </li>
                <li>
                  <strong>เกณฑ์จำนวนวันลา:</strong> วันลารวมทุกประเภทในเดือนนั้นต้อง{' '}
                  <strong>ไม่เกิน 1 วัน (8 ชั่วโมง)</strong>
                </li>
              </ol>
            </div>
          </section>
        </div>
      )}

      {/* SUB-TAB 3: กฎเวลาสาย & การแปลงชั่วโมงลาเป็นวัน (พร้อมแสดงผลกระทบก่อนบันทึก) */}
      {subTab === 'rules' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                กฎเวลาสาย การแปลงชั่วโมงลาเป็นวัน และตัวกรองการคำนวณเงินเดือน
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                ทุกการเปลี่ยนแปลงกฎการคำนวณ ระบบจะจำลองและแสดงผลกระทบต่อเบี้ยขยัน วันลา และนาทีสายให้ยืนยันก่อนบันทึกเสมอ
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm">
            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 space-y-1.5">
              <div className="font-bold text-amber-950">
                1. กฎเวลาเข้างานและนาทีสายปกติ
              </div>
              <p className="text-amber-900">
                • เวลาเข้างานปกติ: <strong>08:00 น.</strong>
                <br />• ช่วงอนุโลม: <strong>08:01 – 08:15 น.</strong> (ไม่นับว่าสาย แต่เสียเบี้ยขยัน)
                <br />• เริ่มนับสาย: <strong>ตั้งแต่ 08:16 น. เป็นต้นไป</strong> นับสาย 1 ครั้ง และคิดนาทีสายตั้งแต่นาทีที่ 08:15 น.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200 space-y-1.5">
              <div className="font-bold text-sky-950">
                2. กฎพิเศษฝ่ายขายไปพบลูกค้า
              </div>
              <p className="text-sky-900">
                • วันที่ฝ่ายขายไม่พบสแกนเข้า-ออกและไม่มีใบลา ระบบตั้งเป็น{' '}
                <strong>&quot;คาดว่าไปพบลูกค้า&quot;</strong>
                <br />• <strong>วันทำงานถัดไป</strong> อนุโลมเข้างานได้ถึง{' '}
                <strong>09:00 น.</strong> (เริ่มนับสายตั้งแต่ 09:01 น. คิดนาทีสายจาก 09:00 น.)
              </p>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-1.5">
              <div className="font-bold text-indigo-950">
                3. การแปลงชั่วโมงลาเป็นวันทำงาน
              </div>
              <p className="text-indigo-900">
                • มาตรฐาน: <strong>8 ชั่วโมง = 1 วันทำงาน</strong>
                <br />• ลา 4 ชั่วโมง = <strong>ครึ่งวัน (4 ชม.)</strong>
                <br />• ลา 2 ชั่วโมง = <strong>2 ชม.</strong> (0.25 วัน)
                <br />• แยกสัดส่วนวันลาข้ามเดือนและใบลาล่วงหน้าอัตโนมัติ
              </p>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <h4 className="text-sm font-bold text-slate-900">
              ตั้งค่าเงื่อนไขการนำข้อมูลมาคำนวณเงินเดือน (ต้องตรวจสอบผลกระทบก่อนบันทึก)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-white border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftSettings.onlyApprovedLeaves}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      onlyApprovedLeaves: e.target.checked,
                    })
                  }
                  className="mt-0.5 rounded text-indigo-600"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    นับเฉพาะใบลาที่สถานะ &quot;อนุมัติ&quot; แล้วเท่านั้น
                  </div>
                  <div className="text-xs text-slate-500">
                    ไม่นำใบลาที่ถูกยกเลิกหรือไม่อนุมัติมาหักวันลา
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-white border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftSettings.excludeCarryoverLeaves}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      excludeCarryoverLeaves: e.target.checked,
                    })
                  }
                  className="mt-0.5 rounded text-indigo-600"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    กรองแถว &quot;บันทึกเก่า / บันทึกลาเก่า / ทดสอบ&quot; ออกอัตโนมัติ
                  </div>
                  <div className="text-xs text-slate-500">
                    ป้องกันไม่ให้ยอดบันทึกสะสมย้อนหลังถูกนำมาหักซ้ำในเดือนปัจจุบัน
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-white border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftSettings.includeSheetLeaves}
                  onChange={(e) =>
                    setDraftSettings({
                      ...draftSettings,
                      includeSheetLeaves: e.target.checked,
                    })
                  }
                  className="mt-0.5 rounded text-indigo-600"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    รวมวันลาที่ระบุในชีตสแกนนิ้ว (กรณีไม่ได้ยื่นฟอร์มออนไลน์)
                  </div>
                  <div className="text-xs text-slate-500">
                    ดึงวันลาจากคอลัมน์ลาป่วย/ลากิจ/พักร้อนในชีตสแกนเมื่อไม่มีใบลาออนไลน์ตรงวัน
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-white border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftOnlyMapped}
                  onChange={(e) => setDraftOnlyMapped(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    แสดงเฉพาะพนักงานปัจจุบันที่ผูกข้อมูลในระบบแล้ว
                  </div>
                  <div className="text-xs text-slate-500">
                    ซ่อนรายชื่อพนักงานที่ลาออกไปแล้วออกจากรายงานประจำเดือน
                  </div>
                </div>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsRuleImpactModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
              >
                ดูผลกระทบต่อเงินเดือนและยืนยันการบันทึกกฎ
              </button>
            </div>
          </div>
        </section>
      )}

      {/* SUB-TAB 4: ตั้งค่าข้อมูลบริษัท & วันหยุดนักขัตฤกษ์ */}
      {subTab === 'company' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleSaveCompanyProfile}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              ข้อมูลบริษัทสำหรับหัวรายงานและเอกสารเงินเดือน
            </h3>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  ชื่อบริษัท
                </label>
                <input
                  type="text"
                  value={companyDraft.companyName}
                  onChange={(e) =>
                    setCompanyDraft({
                      ...companyDraft,
                      companyName: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    สำนักงาน / สาขา
                  </label>
                  <input
                    type="text"
                    value={companyDraft.branchName}
                    onChange={(e) =>
                      setCompanyDraft({
                        ...companyDraft,
                        branchName: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    ชื่อผู้ตรวจสอบ HR / Payroll
                  </label>
                  <input
                    type="text"
                    value={companyDraft.hrReviewerName}
                    onChange={(e) =>
                      setCompanyDraft({
                        ...companyDraft,
                        hrReviewerName: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-semibold text-emerald-700">
                {companySavedMsg}
              </span>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                บันทึกข้อมูลบริษัท
              </button>
            </div>
          </form>

          <div className="space-y-6">
            {/* วันหยุดนักขัตฤกษ์เพิ่มเติม */}
            <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                กำหนดวันหยุดนักขัตฤกษ์ / วันหยุดบริษัทเพิ่มเติม
              </h3>
              <p className="text-xs text-slate-600">
                ระบบข้ามวันเสาร์–อาทิตย์และวันที่ไม่มีสแกนทั้งบริษัท (เช่น 13 และ 23 ต.ค.) ให้อัตโนมัติอยู่แล้ว สามารถเพิ่มวันหยุดพิเศษได้ด้านล่าง:
              </p>
              <div className="flex gap-2">
                <input
                  type="date"
                  aria-label="เลือกวันหยุดบริษัทเพิ่มเติม"
                  value={newHolidayInput}
                  onChange={(e) => setNewHolidayInput(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!newHolidayInput) return;
                    if (!settings.customHolidays.includes(newHolidayInput)) {
                      const next: AuditSettings = {
                        ...settings,
                        customHolidays: [
                          ...settings.customHolidays,
                          newHolidayInput,
                        ].sort(),
                      };
                      setDraftSettings(next);
                      await onConfirmSettingsChange(next, onlyMappedEmployees);
                    }
                    setNewHolidayInput('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                >
                  เพิ่มวันหยุด
                </button>
              </div>
              {settings.customHolidays.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {settings.customHolidays.map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-xs"
                    >
                      {formatDateDisplay(h)}
                      <button
                        type="button"
                        aria-label={`ลบวันหยุด ${h}`}
                        onClick={async () => {
                          const next: AuditSettings = {
                            ...settings,
                            customHolidays: settings.customHolidays.filter(
                              (d) => d !== h
                            ),
                          };
                          setDraftSettings(next);
                          await onConfirmSettingsChange(
                            next,
                            onlyMappedEmployees
                          );
                        }}
                        className="text-rose-600 hover:text-rose-800 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* ตั้งค่าการซิงก์ฐานข้อมูลสำรอง */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-emerald-600" />
                  การซิงก์ข้อมูลคลาวด์สำรอง
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  สถานะล่าสุด: {lastSyncTimeText}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenFirebaseModal}
                className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer shrink-0"
              >
                ตั้งค่าการเชื่อมต่อ
              </button>
            </section>
          </div>
        </div>
      )}

      {/* Modal แสดงผลกระทบเมื่อเปลี่ยนกฎคำนวณเงินเดือน */}
      {isRuleImpactModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                ยืนยันผลกระทบต่อเงินเดือนก่อนเปลี่ยนกฎการคำนวณ
              </h3>
              <button
                onClick={() => setIsRuleImpactModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="font-semibold text-slate-600">จำนวนพนักงานในรอบ</div>
                <div className="mt-1 font-bold text-slate-900">
                  เดิม {auditResult.activitySummaryReport.length} คน → ใหม่{' '}
                  <span className="text-indigo-700">
                    {simulatedRuleAudit.activitySummaryReport.length} คน
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="font-semibold text-emerald-900">
                  ผู้ได้รับเบี้ยขยัน
                </div>
                <div className="mt-1 font-bold text-emerald-950">
                  เดิม {auditResult.activityGrandTotal.diligenceEligibleCount} คน → ใหม่{' '}
                  <span className="text-emerald-700">
                    {simulatedRuleAudit.activityGrandTotal.diligenceEligibleCount}{' '}
                    คน
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                <div className="font-semibold text-indigo-900">รวมวันลาทั้งเดือน</div>
                <div className="mt-1 font-bold text-indigo-950">
                  เดิม{' '}
                  {formatLeaveHuman(
                    auditResult.activityGrandTotal.totalLeaveDays,
                    { zeroText: '0 วัน' }
                  )}{' '}
                  → ใหม่{' '}
                  <span className="text-indigo-700">
                    {formatLeaveHuman(
                      simulatedRuleAudit.activityGrandTotal.totalLeaveDays,
                      { zeroText: '0 วัน' }
                    )}
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                <div className="font-semibold text-rose-900">
                  รวมลาไม่รับค่าจ้าง
                </div>
                <div className="mt-1 font-bold text-rose-950">
                  เดิม{' '}
                  {formatLeaveHuman(auditResult.activityGrandTotal.unpaidDays, {
                    zeroText: '0 วัน',
                  })}{' '}
                  → ใหม่{' '}
                  <span className="text-rose-700">
                    {formatLeaveHuman(
                      simulatedRuleAudit.activityGrandTotal.unpaidDays,
                      { zeroText: '0 วัน' }
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setIsRuleImpactModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={async () => {
                  await onConfirmSettingsChange(draftSettings, draftOnlyMapped);
                  setIsRuleImpactModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
              >
                ยืนยันและบันทึกกฎการคำนวณ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
