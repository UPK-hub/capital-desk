# STS API

Base path: `/api/sts`

## Components
- `GET /components`
- `POST /components`
  - body: `{ code, name, active? }`
- `PATCH /components/:id`
  - body: `{ name?, active? }`

## SLA Policies
- `GET /sla-policies`
- `PUT /sla-policies`
  - body: `[ { componentId, severity, responseMinutes, resolutionMinutes, pauseStatuses? } ]`

## KPI Policies
- `GET /kpi-policies`
- `PUT /kpi-policies`
  - body: `[ { componentId, metric, periodicity, threshold } ]`

## KPI Measurements
- `GET /kpi-measurements?metric=&periodicity=`
- `POST /kpi-measurements`
  - body: `{ componentId, metric, periodicity, periodStart, periodEnd, value, source? }`

## Maintenance Windows
- `GET /maintenance-windows`
- `POST /maintenance-windows`
  - body: `{ componentId?, startAt, endAt, reason? }`

## Tickets
- `GET /tickets?severity=&status=&componentId=&breach=`
- `POST /tickets`
  - body: `{ componentId, severity, channel, description, assignedToId? }`
- `GET /tickets/:id`
- `PATCH /tickets/:id`
  - body: `{ status?, assignedToId? }`
- `POST /tickets/:id/events`
  - body: `{ message, isResponse? }`

## Reports
- `GET /reports/tickets` (CSV)
- `GET /reports/tickets?format=xlsx` (Excel)
