# Batch Task Tracker — Login, IDF, RCA, KPI Tracking, Analytics, Documents, MI, Approval

Status legend: [ ] todo · [x] done · [~] partial. Update this file as work progresses so an
interrupted run can resume from the first unchecked item. All persistence must go through
`savePersistedState` / Supabase (pa_kv_state + dedicated tables), never local-only state.

## Login
- [x] L1 Strict Company Unit validation (fail even if ID + password correct)
- [x] L2 Cross-browser login: hydrate gate + fresh backend fetch of users/security map before verify; merge-safe security writes

## Inter-Department Feedback
- [x] F1 Summary / Catatan Penerima (owner editable)
- [x] F2 Notification to Approver 1 on follow-up submit
- [x] F3 "Contoh Feedback" -> "Lihat Contoh Feedback" (approvals/measurement)
- [x] F4 Timeline Evaluasi as calendar (min > today)
- [x] F5 Nominate > 3
- [x] F6 Manual Submit Feedback & Summary (confirm, requires all summaries)
- [x] F7 Show feedback as it arrives, Save Draft summary, tooltip on submit
- [x] F8 Tag "Tindak Lanjut Berjalan" soft yellow + yellow dot on tab
- [x] F9/F10 Owner "Hasil Tindak Lanjut Saya" section (fields + multi evidence) + Submit confirm
- [x] F11 Approver approve (comment) / revise (note) owner result; owner can revise
- [x] F12 Completion log = after AP1 & AP2 follow-up received by owner

## RCA
- [x] R1 Target (Yearly) after Baseline (auto-fill from KPI Tracking row)
- [x] R2 5-Why fields disabled until Faktor chosen + tooltip
- [x] R3 Action plans 2 per row grid
- [x] R4 Rename warning text "... di bulan berjalan."
- [x] R5 RCA table View Detail with progress update table (image ref)

## KPI Tracking
- [x] K1 Block submit if red RCA tags in month; tooltip; highlight red tags
- [x] K2 Require evidence for month; fix evidence upload on new month
- [x] K3 Submit confirm -> KPI tracking + RCA of month to approval chain
- [x] K4 Approvers see 2 requests: KPI Tracking & RCA (per month)
- [x] K5 Dashboard Approval Progress by Module: KPI Tracking monthly segments colored by status
- [x] K6 Profile Score by Module: YTD info + tooltip last fully-approved month
- [x] K7 Decimal separator validation actual vs target

## Analytics
- [x] A1 Supervisor / HR Unit scoping by unit/division/department; module filter by grouping
- [x] A2 Colored icons + soft colors on charts

## Documents
- [x] D1 Tabs Inter-Department Feedback, Management Interview, Other
- [x] D2 Tab order
- [x] D3 Admin/HR ICF Add New / Edit / Publish editor (sections, tags, collapsible subsections, files jpg/pdf embed+download, video link) persisted to backend

## Management Interview
- [x] M1 Employee search, Interviewer w/o dummy, notification "Yth. Bapak/Ibu {{Nama}} ...", "Kirim Jadwal" + confirm
- [x] M2 Lampiran column (view/download)
- [x] M3 Only invited users see schedule table
- [x] M4 Assessment participants = Employee field only
- [x] M5 Score tooltip with indicator description
- [x] M6 Submit tooltip when unassessed participants remain
- [x] M7 PA Score tag + summary popup
- [x] M8 Colorful professional styling

## Approval
- [x] P1 Remove tabs Approval Module / ICF / Other + related code
- [x] P2 Delegation table redesign + start/stop + search
- [x] P3 Approvals > Delegation submenu; delegates act per module/access, notifications, "atas nama"
- [x] P4 Approver Monitoring tab (view/edit AP1/AP2)
- [x] P5 Any appointed approver can approve regardless of role/grouping
- [x] P6 AP1 == AP2 -> single approval
Baseline note: 46 pre-existing tsc errors at start of IDF/RCA batch; compare with /tmp/tsc_baseline.txt (line numbers stripped)
