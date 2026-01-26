# STS Module Architecture

## Stack
- Next.js App Router (server components + API routes)
- Prisma + PostgreSQL
- NextAuth (JWT session)
- Tailwind UI

## Roles y capacidades
- Roles base: ADMIN, BACKOFFICE, TECHNICIAN
- Capacidades asignables por admin:
  - STS_READ, STS_WRITE, STS_ADMIN
  - PLANNER, CASE_ASSIGN

## Module Overview (Text Diagram)

Client (STS UI)
  -> /sts dashboard (cards + KPIs)
  -> /sts/tickets (list, filters, create)
  -> /sts/tickets/[id] (timeline, SLA, update)
  -> /sts/reports (tables + CSV export)
  -> /sts/admin (components, SLA, KPIs, maintenance windows)

API (Next.js routes)
  -> /api/sts/tickets (list/create)
  -> /api/sts/tickets/[id] (detail/update)
  -> /api/sts/tickets/[id]/events (comments/response)
  -> /api/sts/components
  -> /api/sts/sla-policies
  -> /api/sts/kpi-policies
  -> /api/sts/kpi-measurements
  -> /api/sts/maintenance-windows
  -> /api/sts/reports/tickets (CSV)

DB (PostgreSQL)
  -> sts_component
  -> sts_ticket
  -> sts_ticket_event
  -> sts_sla_policy
  -> sts_kpi_policy
  -> sts_kpi_measurement
  -> sts_maintenance_window
  -> sts_audit_log

## Data Model Notes
- sts_component: catalog of STS elements
- sts_ticket: incident core with SLA fields and status
- sts_ticket_event: immutable timeline (status changes, comments, assignments)
- sts_sla_policy: per component + severity time limits + pause rules
- sts_kpi_policy: per component + metric + periodicity thresholds
- sts_kpi_measurement: actual KPI values by period
- sts_maintenance_window: excluded windows for resolution SLA
- sts_audit_log: audit trail for changes

## SLA Logic
- response_time = first_response_at - opened_at
- resolution_time = (resolved/closed) - opened_at
- pause statuses excluded (default: WAITING_VENDOR)
- maintenance windows excluded from resolution_time
- breach_response and breach_resolution stored in ticket
- alerts in UI when progress >= 80%

## KPI Logic
- KPI thresholds are per component + metric + periodicity
- Measurements are stored by period

## Assumptions
- SLA response does not pause by status
- SLA resolution excludes pause statuses + maintenance windows
- Timezone: store UTC; display local in UI
- XLSX export not implemented; CSV available
