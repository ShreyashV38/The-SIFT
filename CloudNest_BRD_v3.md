**Business Requirements Document**
CloudNest — Multi-Tenant IoT Home Automation Platform

Prepared by: Shreyash Vaigankar, Sam [Surname]   |   Date: 10 August 2026   |   Version: 3.1 (Revised 13 October 2026)

| Version | Date | Change |
| :---- | :---- | :---- |
| 1.0 | 10 Aug 2026 | Initial draft |
| 2.0 | 13 Oct 2026 | Magistrala v1.0.0, tb-bridge, isolation stack, 2-node K3s |
| 3.0 | 13 Oct 2026 | Added multi-user households (accounts, plans, members, shared devices, commands), cost estimate, requirements traceability matrix |
| 3.1 | 13 Oct 2026 | Scope review: removed invitation links, per-member HA logins, and audit log (moved to future work); owners/admins add members directly; simplified to 15 committed functional requirements |

# 1. Purpose

This document defines the objectives, scope, and requirements of CloudNest, a multi-tenant IoT home automation platform built as a Cloud Computing project. Every requirement in sections 7 and 8 is committed: it will be implemented and verified, and section 12 shows how. Anything we are not committing to is listed in section 4.2 or 4.3.

# 2. Project Overview

CloudNest automatically provisions an isolated smart-home environment for each registered household (tenant), connects their IoT devices via MQTT, and provides centralized monitoring across all tenants. A tenant subscribes to a plan (single user or family), and the people in that household share the same set of devices. The project demonstrates multi-tenancy, automated provisioning, containerization, orchestration, tenant isolation, and cost-aware design on a 2-node Kubernetes cluster.

Deployment: the committed deliverable runs on a local 2-node K3s cluster (k3d on Docker Desktop). Cloud cost for the same design is estimated for AWS in section 9.

# 3. Objectives

- O1. Demonstrate a multi-tenant cloud architecture with strict tenant isolation (namespace, NetworkPolicy, ResourceQuota, LimitRange, ServiceAccount restrictions, Pod Security Standards).
- O2. Automate tenant onboarding end-to-end via a Provisioning API.
- O3. Provide secure IoT device provisioning and MQTT authentication using Magistrala (formerly Mainflux).
- O4. Support households with more than one user: accounts, single and family plans, member roles, and devices shared by all members of a tenant.
- O5. Provide centralized platform-wide monitoring via ThingsBoard CE.
- O6. Demonstrate scalability and resilience through load testing and node-failure experiments, with honestly documented results.
- O7. Document the cost of the design on AWS and the optimizations chosen to reduce it.

# 4. Scope

## 4.1 In Scope (committed)

- Automated tenant provisioning (API-driven)
- Per-tenant Home Assistant instance with an isolated namespace
- Magistrala v1.0.0 as the IoT control plane (device identity, MQTT authentication via Atom + FluxMQ)
- ThingsBoard CE for platform-wide monitoring and telemetry visualization
- Kubernetes (K3s) on a 2-node cluster for orchestration
- Tenant isolation: namespace, NetworkPolicy, ResourceQuota, LimitRange, ServiceAccount restrictions, Pod Security Standards
- Accounts with password-based login, plans (single, family), and member roles (owner, admin, member)
- Members added directly by owners/admins via the API (no invitation link workflow)
- Device registry per tenant (register, rotate secret, revoke) with a telemetry channel and a command channel
- tb-bridge service forwarding device telemetry from Magistrala to ThingsBoard
- ESP32-compatible virtual device simulator (telemetry and command handling) and an example ESP32 sketch
- Load testing with simulated devices
- Security and isolation test suite
- Living technical document (HOW_IT_WORKS.md) updated with every implementation step
- AWS cost estimate and optimization analysis (section 9)

## 4.2 Out of Scope (explicitly excluded)

- Production-grade high availability (single control plane = acknowledged single point of failure)
- Billing / payments
- Mobile apps
- Web user interface for registration, login, and member management (all functions are exposed as APIs and demonstrated with scripted calls)
- Non-MQTT device protocols (HTTP, CoAP, WebSocket adapters are not deployed or tested)
- Sharing one physical device across two different tenants (people who need access are invited as members of the owning tenant instead)
- A read-only (viewer) role and per-user, per-device permissions inside a tenant (Home Assistant does not provide them; all members of a tenant can use all of that tenant's devices)
- Single sign-on between the platform and Home Assistant (each member has a platform login; Home Assistant uses a shared tenant login)
- TLS encryption of device MQTT traffic in the local environment
- Per-member individual Home Assistant logins (Home Assistant user management API is unreliable across versions; a shared tenant login is used instead)
- Invitation link workflow with expiry and revocation (members are added directly by owners/admins via the API)
- Audit log of member, device, and plan changes (planned for future work)

## 4.3 Future Work (not part of this submission and not evaluated)

- Deployment of the same design to two AWS EC2 instances (cost modelled in section 9; deployment depends on account plan limits, remaining credits, and time)
- Running more than 3 active tenants at once (limited by node memory, see section 8)
- TLS for device connections, a web UI, single sign-on, and a highly available control plane
- Per-member Home Assistant logins (requires stable HA user management API)
- Email-based invitation links with expiry, revocation, and acceptance flow
- Audit log of all member, device, and plan changes

# 5. Stakeholders

| Role | Responsibility |
| :---- | :---- |
| Project Members (Shreyash Vaigankar, Sam [Surname]) | Development, architecture, documentation |
| Instructor / Evaluator | Requirements approval, grading |
| End User (simulated) | Uses smart-home features via Home Assistant; household members |
| Tenant Owner / Admin (simulated) | Manages plan, members, and devices through the API |
| Platform Administrator (simulated) | Monitors the fleet via ThingsBoard |

# 6. Architecture Overview

| Component | Responsibility |
| :---- | :---- |
| Magistrala (Atom + FluxMQ) | Device identity, workspace management, MQTT authentication and messaging |
| Home Assistant | Per-tenant smart-home automation and dashboard (one instance per tenant) |
| ThingsBoard CE | Platform-wide telemetry visualization, monitoring, admin dashboards |
| Kubernetes (K3s) | Orchestration, scheduling, restart of failed containers, tenant namespace isolation |
| Provisioning API | Custom Node.js service: tenant onboarding, accounts, plans, members, device registry (SQLite database) |
| tb-bridge | Forwards MQTT telemetry from Magistrala channels to ThingsBoard |
| Simulator | Virtual IoT devices for load testing, including command handling |

### Node Layout

| Node | Role | Components |
| :---- | :---- | :---- |
| Identity node (K3s server) | Control plane + MQTT | K3s server, Traefik ingress, Magistrala (Atom, FluxMQ, PostgreSQL) |
| Worker node (K3s agent) | Workloads | ThingsBoard CE, Home Assistant pods, Provisioning API, tb-bridge |

### Tenant and User Model

A tenant is one household: one namespace (`tenant-<slug>`), one Home Assistant instance, one Magistrala workspace. People are platform accounts that join tenants as members.

| Plan | Seats (including owner) | Devices |
| :---- | :---- | :---- |
| single | 1 | 10 |
| family | 6 | 30 |

| Role | Can do | Home Assistant access |
| :---- | :---- | :---- |
| owner (exactly one per tenant) | Everything, including plan change, add/remove members, manage devices, tenant deletion | Shared tenant login |
| admin | Add and remove members, manage devices | Shared tenant login |
| member | Use the tenant's devices | Shared tenant login |

Plan limits are configuration values and may be tuned.

### Traffic Flows

1. **Humans** → `https://<slug>.<domain>` → Traefik → the tenant's Home Assistant pod (members log in with the shared tenant login).
2. **Devices (telemetry)** → MQTT :1883 → FluxMQ (Magistrala) → authenticated → delivered on the tenant's telemetry channel to the tenant's Home Assistant pod and to tb-bridge → ThingsBoard.
3. **Commands** → tenant's Home Assistant publishes on the tenant's command channel → delivered only to that tenant's devices.
4. **Management** → Provisioning API (authenticated account, role checked on every request) → tenants, members, devices.

### Provisioning Flow

Authenticated user calls the API → Provisioning API creates the Magistrala workspace, telemetry and command channels, and the tenant's service credentials → Kubernetes deploys a Home Assistant pod in an isolated namespace with the full isolation stack → the owner receives the shared Home Assistant login → the owner can add members and register devices → devices appear in ThingsBoard on first telemetry through tb-bridge.

# 7. Functional Requirements

| ID | Requirement |
| :---- | :---- |
| FR-01 | Provisioning API accepts an authenticated tenant-creation request (slug, display name, plan) and returns the tenant URL and credentials. |
| FR-02 | System auto-creates a Magistrala workspace, a telemetry channel, a command channel, and MQTT credentials per tenant. |
| FR-03 | System auto-deploys an isolated Home Assistant instance per tenant in a dedicated namespace with default-deny NetworkPolicy, ResourceQuota, LimitRange, restricted ServiceAccount, and Pod Security label. |
| FR-04 | Device telemetry routes through Magistrala MQTT to the tenant's Home Assistant and, via tb-bridge, to ThingsBoard. |
| FR-05 | Tenant owners and admins can register simulated or ESP32 devices via the API. Device credentials are shown once; secrets can be rotated and devices revoked. |
| FR-06 | No tenant can access another tenant's data, devices, or network. |
| FR-07 | Platform administrators can view platform-wide telemetry in ThingsBoard. |
| FR-08 | Invalid device credentials are rejected by Magistrala and no message from them is delivered. |
| FR-09 | Node-failure behaviour is tested and documented. Crashed pods are restarted automatically. When the worker node is lost, stateless tenant pods are rescheduled to the surviving node if it has capacity; stateful services (ThingsBoard, databases) are bound to their node and are documented as not failing over. |
| FR-10 | A load test with simulated devices records message delivery rate, latency percentiles, CPU and memory usage, and tenant provisioning time. |
| FR-11 | Users can register an account and log in through the API (email and password; passwords stored only as salted hashes). Platform login is separate from device authentication. |
| FR-12 | The platform offers a single plan (1 seat) and a family plan (up to 6 seats). Seat and device limits are enforced by the API. The owner can change plan; a downgrade is rejected while seats or devices exceed the new limits. |
| FR-13 | Members have a role (owner, admin, member). The API checks the caller's role on every request. A tenant always has exactly one owner, the last owner cannot be removed or demoted, and ownership can be transferred. |
| FR-14 | Devices belong to the tenant. All active members of a tenant can use all of its devices: at least two members of the same tenant see the same device's data and both can operate the same device. |
| FR-15 | Commands issued from a tenant's Home Assistant reach only that tenant's devices (separate command channel). |

# 8. Non-Functional Requirements

- Tenant isolation is enforced at namespace, network policy, resource quota, and MQTT credential/channel level.
- Demo scale: 3 active tenants and 100–1,000 simulated devices. The number of simultaneously active tenants is limited by node memory (about 512 MB per Home Assistant pod); the measured capacity is reported.
- Failed containers are restarted by Kubernetes (liveness and readiness probes). Node-failure behaviour is as stated in FR-09.
- Two separate credential types are used and never mixed: device ID and secret (Magistrala), and platform account login (Provisioning API). Home Assistant uses a shared tenant login.
- Secrets are kept in Kubernetes Secrets, never in the database or source control. Login attempts are rate-limited.
- All components run in containers within the K3s cluster.
- Single control plane is an acknowledged single point of failure (not HA); the system is never described as highly available.
- Implementation is documented in HOW_IT_WORKS.md, which explains every component and function and is updated with each step.

# 9. Cost Estimate

All figures are estimates: AWS us-east-1 on-demand prices, 730 hours per month. The committed local deployment costs $0 in cloud charges.

### 9.1 Design choices that reduce cost

| Choice | Saves | Trade-off accepted |
| :---- | :---- | :---- |
| K3s instead of managed EKS | $73/month control-plane fee | We operate the control plane ourselves |
| Databases as in-cluster StatefulSets instead of RDS | about $29/month for two small instances | We own backups and patching |
| Tenant pods on shared EC2 nodes instead of Fargate | about $10.63/month per tenant at 0.25 vCPU / 1 GB | We manage node capacity |
| Public subnet with K3s ServiceLB instead of ALB + NAT gateway | about $55/month | Security groups must be tightly restricted |

### 9.2 Demo deployment on AWS (2-node K3s) — about $72.84/month if run 24/7

| Item | Calculation | Monthly |
| :---- | :---- | :---- |
| 2 x EC2 t3.medium | 2 x $30.37 | $60.74 |
| EBS gp3, 2 x 30 GB | 60 GB x $0.08 | $4.80 |
| Public IPv4 addresses (2) | 2 x $3.65 | $7.30 |
| Data transfer out | first 100 GB/month free | $0 |
| **Total** | | **about $72.84** |

Instances can be stopped when idle; EBS and public IPv4 charges (about $12/month) continue while stopped. If measurements show the worker node needs 8 GB, a t3.large for that node adds about $30/month.

### 9.3 Production baseline: EKS, 10 tenants (reference only) — about $293/month

| Item | Monthly |
| :---- | :---- |
| EKS control plane | $73.00 |
| 2 x t3.large worker nodes | $121.47 |
| RDS PostgreSQL, 2 x db.t3.micro with 20 GB each (single-AZ) | $29.42 |
| Application Load Balancer (light traffic) + NAT gateway | $55.27 |
| Public IPv4 addresses (3) | $10.95 |
| Worker node root volumes, 2 x 20 GB | $3.20 |
| **Total** | **about $293** |

### 9.4 Enterprise scale: 1,000 tenants (reference only)

| Option | Monthly |
| :---- | :---- |
| Tenant pods on EC2 node pool (about 12 x m5.4xlarge, assuming about 600 MiB per tenant) plus EKS, core nodes, and database/network allowance | about $7,950 |
| Tenant pods on Fargate (1,000 x $10.63) plus the same other items | about $11,850 |

Assumptions: 1,000 tenants of one Home Assistant pod each; the database and network allowance is a placeholder. Fargate on EKS may round pod memory up, which would raise the Fargate figure further. Estimates will be re-checked against measured memory per tenant from our load tests.

# 10. Risks

| Risk | Mitigation |
| :---- | :---- |
| Magistrala v1.0.0 has major renames (Domains → Workspaces, Clients → Devices) | Pin v1.0.0; follow official docs only; record all naming in the decisions log |
| Magistrala v1.0.0 setup needs generated certificates and Atom service tokens and is documented mainly for Docker Compose | Follow the official setup exactly; time-box the deployment; convert Compose to Kubernetes manifests if no chart is available; record the result |
| Per-tenant Home Assistant provisioning is complex | Prototype early with a Helm chart; use templated deployment |
| Magistrala may not support separate publish and subscribe permissions per connection | Commands and telemetry use separate channels; any remaining weakness is documented |
| High resource usage per tenant (about 512 MB per Home Assistant pod) on small nodes | Demo capped at 3 active tenants; monitor with kubectl top; enforce ResourceQuota |
| ThingsBoard CE lacks built-in integrations | Build the custom tb-bridge service |
| Single control plane is a single point of failure | Document honestly; never claim HA; test and record failure behaviour |
| Time: deadline pressure and AWS free-period end date (2 Nov 2026) | Local environment is the committed deliverable; AWS deployment is future work (4.3) |

# 11. Success Criteria

- A new tenant gets a working, isolated smart-home environment via a single API call.
- At least one device sends telemetry end to end (device → Magistrala MQTT → Home Assistant and ThingsBoard).
- Invalid device credentials are rejected; cross-tenant access is blocked.
- Tenant isolation is demonstrated by an automated test suite (NetworkPolicy, ResourceQuota, MQTT channel separation, role and tenant checks on every API route).
- On a family tenant, the owner adds a second member via the API; both members can log into the platform and operate the same simulated device. On a single plan, adding a second member is refused by the API.
- A load test runs with recorded metrics (message delivery rate, latency, resource usage, provisioning time).
- Node-failure behaviour is tested and documented honestly.
- The cost estimate in section 9 is included and consistent with the measured resource usage.

# 12. Requirements Traceability

Each requirement is verified by a test or documented experiment. Results are recorded in HOW_IT_WORKS.md and the measurement files.

| Requirement | Verified by |
| :---- | :---- |
| FR-01 | API creation test with valid and invalid key/slug; demo script |
| FR-02 | Magistrala object check after provisioning (workspace, channels, credentials) |
| FR-03 | Isolation proofs T-ISO-1 to T-ISO-4; quota test T-RES-1 |
| FR-04 | Load scenario S1 (steady state), delivery check in Home Assistant and ThingsBoard |
| FR-05 | T-DEV-1, T-DEV-5 |
| FR-06 | T-ISO-1 to T-ISO-4, T-AUTH-2, T-AUTH-3, T-MEM-1, T-NET-2 |
| FR-07 | Telemetry visible in ThingsBoard during S1 |
| FR-08 | T-AUTH-1; load scenario S4 |
| FR-09 | Node-failure experiments (Phase 10) with results documented |
| FR-10 | Load scenarios S1 to S5; metric CSV files |
| FR-11 | T-API-1, T-API-2, T-MEM-1 |
| FR-12 | T-MEM-3 (seat limit enforcement on single vs family plan) |
| FR-13 | T-MEM-2 (role check on every request, owner protection) |
| FR-14 | T-DEV-4 (two members of same tenant operate same device) |
| FR-15 | T-DEV-3 (command channel isolation between tenants) |

# 13. Technology Stack

| Technology | Version | Purpose |
| :---- | :---- | :---- |
| K3s (via k3d) | v1.35.5+k3s1 | Kubernetes runtime |
| Magistrala | v1.0.0 | IoT identity + MQTT (Atom IAM + FluxMQ broker) |
| ThingsBoard CE | TBD (pinned at deployment) | Telemetry dashboards |
| Home Assistant | TBD (pinned at deployment) | Per-tenant smart-home UI |
| Traefik | Bundled with K3s | Ingress |
| Helm | TBD (pinned at deployment) | Tenant deployment templates |
| Node.js | v24.18.0 LTS | Provisioning API, tb-bridge, simulator |
| PostgreSQL | 16-alpine | Backing store for Magistrala Atom |
| SQLite | (bundled) | Provisioning API database (accounts, memberships, devices) |
| Docker Desktop | v29.7.2 | Container runtime (local dev) |

# 14. Open Questions (Resolved)

| Question | Resolution |
| :---- | :---- |
| Mainflux vs Magistrala? | Magistrala v1.0.0 (Mainflux was renamed) |
| Magistrala–Home Assistant integration method? | Home Assistant is an MQTT client subscribed to the tenant's Magistrala channel |
| Magistrala–ThingsBoard telemetry feed method? | Custom tb-bridge service (ThingsBoard CE has no built-in integrations) |
| Internal vs external MQTT broker? | FluxMQ (part of Magistrala) is the broker; authenticates via Atom |
| Kubernetes namespace-to-tenant mapping? | 1 tenant = 1 namespace (`tenant-<slug>`) with the full isolation stack |
| Database choice for provisioning service? | SQLite on PVC (zero extra RAM; Postgres for production) |
| Load-testing tool and methodology? | Custom Node.js simulator with an MQTT library |
| How can one device be used by several people? | Devices belong to the tenant; people join the tenant as members. Sharing across tenants is out of scope. |
| Single vs family users? | Two plans of the same tenant type, differing only in seat and device limits |
| How are members added? | Owners and admins add members directly via the API (email of existing account). No invitation link workflow. |
