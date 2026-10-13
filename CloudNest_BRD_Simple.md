**Business Requirements Document**  
CloudNest — Multi-Tenant IoT Home Automation Platform

Prepared by: Shreyash Vaigankar, Sam [Surname]   |   Date: 10 August 2026   |   Version: 3.1 (Revised 13 October 2026)

# 1. Purpose

This document defines the objectives, scope, and requirements of CloudNest, a multi-tenant IoT home automation platform built as a Cloud Computing project.

# 2. Project Overview

CloudNest automatically provisions an isolated smart-home environment for each registered tenant, connects their IoT devices via MQTT, and provides centralized monitoring across all tenants. A tenant subscribes to a plan (single user or family), and the people in that household share the same set of devices. The project demonstrates multi-tenancy, automated provisioning, containerization, orchestration, tenant isolation, and cost-aware design on a 2-node Kubernetes cluster.

# 3. Objectives

- Demonstrate a multi-tenant cloud architecture with strict tenant isolation (namespace, NetworkPolicy, ResourceQuota, Pod Security).

- Automate tenant onboarding end-to-end via a Provisioning API.

- Provide secure IoT device provisioning and MQTT authentication using Magistrala (formerly Mainflux).

- Support households with more than one user: accounts, plans, member roles, and shared devices.

- Provide centralized platform-wide monitoring via ThingsBoard CE.

- Demonstrate scalability and resilience through load testing and node-failure experiments.

# 4. Scope

In Scope:

- Automated tenant provisioning (API-driven)

- Per-tenant Home Assistant instance with isolated namespace

- Magistrala v1.0.0 LTS as IoT control plane (device identity, MQTT authentication via Atom + FluxMQ)

- ThingsBoard CE for platform-wide monitoring and telemetry visualization

- Kubernetes (K3s) for container orchestration on a 2-node cluster

- ESP32-compatible virtual IoT device simulator

- Tenant isolation (namespace, NetworkPolicy, ResourceQuota, LimitRange, ServiceAccount restrictions, Pod Security Standards)

- Accounts with password-based login, plans (single, family), and member roles (owner, admin, member)

- Members added directly by owners/admins via the API

- tb-bridge service forwarding device telemetry from Magistrala to ThingsBoard

- Load testing with simulated devices

- Security and isolation test suite

Out of Scope:

- Production-grade high availability (single control plane = acknowledged SPOF)

- Billing / payments

- Mobile apps

- Non-MQTT device protocols (HTTP, CoAP, WebSocket adapters disabled)

- User registration UI (API-only for the demo)

- Per-member Home Assistant logins (shared tenant login used)

- Invitation link workflow (members added directly)

- Audit log (future work)

# 5. Stakeholders

| Role | Responsibility |
| :---- | :---- |
| Project Members (Shreyash Vaigankar, Sam [Surname]) | Development, architecture, documentation |
| Instructor / Evaluator | Requirements approval, grading |
| End User (simulated) | Uses smart-home features via Home Assistant |
| Administrator (simulated) | Monitors fleet via ThingsBoard |

# 6. Architecture Overview

| Component | Responsibility |
| :---- | :---- |
| Magistrala (Atom + FluxMQ) | Device identity, workspace management, MQTT authentication and messaging |
| Home Assistant | Per-tenant smart-home automation and dashboard (one instance per tenant) |
| ThingsBoard CE | Platform-wide telemetry visualization, monitoring, admin dashboards |
| Kubernetes (K3s) | Orchestration, scheduling, failure recovery, tenant namespace isolation |
| Provisioning API | Custom Node.js service automating tenant onboarding, accounts, members, and device registration |
| tb-bridge | Forwards MQTT telemetry from Magistrala channels to ThingsBoard |
| Simulator | Virtual IoT devices for load testing |

### Node Layout

| Node | Role | Components |
| :---- | :---- | :---- |
| Identity node (K3s server) | Control plane + MQTT | K3s server, Traefik ingress, Magistrala (Atom, FluxMQ, PostgreSQL) |
| Worker node (K3s agent) | Workloads | ThingsBoard CE, Home Assistant pods, Provisioning API, tb-bridge |

### Traffic Flows

1. **Humans** → `https://<slug>.<domain>` → Traefik → tenant's Home Assistant pod
2. **Devices** → MQTT :1883 → FluxMQ (Magistrala) → authenticated → delivered to channel subscribers (tenant's HA pod + tb-bridge → ThingsBoard)

### Provisioning Flow

User calls API → Provisioning API creates Magistrala workspace + channels + device credentials → Kubernetes deploys Home Assistant pod in isolated namespace → ThingsBoard device created → tenant gets access.

# 7. Functional Requirements

| ID | Requirement |
| :---- | :---- |
| FR-01 | Provisioning API accepts tenant creation requests and returns credentials. |
| FR-02 | System auto-creates a Magistrala workspace and MQTT credentials per tenant. |
| FR-03 | System auto-deploys an isolated Home Assistant instance per tenant in a dedicated namespace. |
| FR-04 | Device telemetry routes through Magistrala MQTT to Home Assistant and ThingsBoard. |
| FR-05 | Tenants can register virtual (simulated) or ESP32 devices via the API. |
| FR-06 | No tenant can access another tenant's data, devices, or network. |
| FR-07 | Admins can view platform-wide telemetry in ThingsBoard. |
| FR-08 | Invalid device credentials are rejected by Magistrala. |
| FR-09 | System recovers tenant pods after worker node failure (with documented limitations). |
| FR-10 | Load test demonstrates platform scalability with recorded metrics. |
| FR-11 | Users can register an account and log in through the API (passwords stored as salted hashes). |
| FR-12 | The platform offers single (1 seat) and family (6 seats) plans with enforced limits. |
| FR-13 | Members have roles (owner, admin, member) with role checks on every request. |
| FR-14 | All active members of a tenant share all of that tenant's devices. |
| FR-15 | Commands issued from a tenant's Home Assistant reach only that tenant's devices. |

# 8. Non-Functional Requirements

- Tenant isolation enforced at namespace, network policy, resource quota, and MQTT credential level.

- Platform should support 3 tenants and 100–1,000 simulated devices for the demo.

- Failed tenant containers should be rescheduled by Kubernetes (with documented node-binding limitations for stateful services).

- Device authentication handled by Magistrala (device ID + secret); separate from platform API auth.

- All components run in containers within the K3s cluster.

- Single control plane is an acknowledged single point of failure (not HA).

# 9. Risks

| Risk | Mitigation |
| :---- | :---- |
| Magistrala v1.0.0 has major renames (Domains→Workspaces, Clients→Devices) | Pin v1.0.0 LTS; follow official docs only; record all naming in decisions log |
| Per-tenant Home Assistant provisioning is complex | Prototype early with Helm chart; use templated deployment |
| High resource usage per tenant (~512 MB per HA pod) | Cap demo scale; monitor with kubectl top; enforce ResourceQuota |
| ThingsBoard CE lacks built-in integrations | Build custom tb-bridge service to forward telemetry |
| Single control plane is SPOF | Document honestly; never claim HA; test and record failure behavior |

# 10. Success Criteria

- New tenant gets a working, isolated smart-home environment via a single API call.

- At least one device sends telemetry end-to-end (device → Magistrala MQTT → HA + ThingsBoard).

- Invalid device credentials are rejected; cross-tenant access is blocked.

- Tenant isolation demonstrated with automated test suite (NetworkPolicy, ResourceQuota, MQTT channel separation).

- On a family tenant, the owner adds a second member; both can operate the same device. On a single plan, adding a second member is refused.

- Load test runs with recorded metrics (message delivery rate, latency, resource usage).

- Node failure behavior tested and documented honestly.

# 11. Technology Stack

| Technology | Version | Purpose |
| :---- | :---- | :---- |
| K3s (via k3d) | v1.35.5+k3s1 | Kubernetes runtime |
| Magistrala | v1.0.0 LTS | IoT identity + MQTT (Atom IAM + FluxMQ broker) |
| ThingsBoard CE | TBD (pinned at deployment) | Telemetry dashboards |
| Home Assistant | TBD (pinned at deployment) | Per-tenant smart-home UI |
| Node.js | v24.18.0 LTS | Provisioning API, tb-bridge, simulator |
| PostgreSQL | 16-alpine | Backing store for Magistrala Atom |
| SQLite | (bundled) | Provisioning API database |
| Docker Desktop | v29.7.2 | Container runtime (local dev) |

# 12. Open Questions (Resolved)

| Question | Resolution |
| :---- | :---- |
| Mainflux vs Magistrala? | Magistrala v1.0.0 LTS (Mainflux was renamed) |
| Magistrala–Home Assistant integration method? | HA is an MQTT client subscribed to tenant's Magistrala channel |
| Magistrala–ThingsBoard telemetry feed method? | Custom tb-bridge service (TB CE has no built-in integrations) |
| Internal vs external MQTT broker? | FluxMQ (part of Magistrala) is the broker; authenticates via Atom |
| Kubernetes namespace-to-tenant mapping? | 1 tenant = 1 namespace (`tenant-<slug>`) with full isolation stack |
| Database choice for provisioning service? | SQLite on PVC (zero extra RAM; Postgres for production) |
| Load-testing tool and methodology? | Custom Node.js simulator with MQTT library |
| How are members added? | Owners/admins add members directly via the API (no invitation links) |