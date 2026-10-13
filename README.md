# CloudNest (SIFT) — Scalable Isolated Framework for Things

Multi-tenant IoT smart-home platform built on a 2-node Kubernetes cluster (K3s), featuring per-tenant Home Assistant instances, Magistrala (Atom IAM + FluxMQ MQTT), and ThingsBoard CE.

---

## 1. Compliance with BRD v3.1

All features strictly adhere to **`CloudNest_BRD_v3.md`** (Version 3.1):

| ID | Requirement | Implementation |
| :--- | :--- | :--- |
| **FR-01** | Provisioning API accepts authenticated tenant onboarding | `services/provisioning-api/src/routes/tenants.js` |
| **FR-02** | Auto-creates Magistrala workspace, telemetry & command channels | `services/provisioning-api/src/services/magistrala.js` |
| **FR-03** | Auto-deploys isolated HA instance with full isolation stack | `deploy/ha-tenant` (Helm chart: netpol, quota, SA, PSS) |
| **FR-04** | Telemetry routes through Magistrala MQTT to HA and ThingsBoard | `services/tb-bridge/src/index.js` |
| **FR-05** | Device registration, single credential issuance, secret rotation | `services/provisioning-api/src/routes/devices.js` |
| **FR-06** | Zero-trust tenant isolation (network, data, devices) | `cluster/netpol-tenant-template.yaml`, RBAC middleware |
| **FR-07** | Admin fleet monitoring in ThingsBoard | `deploy/thingsboard/deployment.yaml`, `services/tb-bridge` |
| **FR-08** | Invalid device credentials rejected | Magistrala FluxMQ auth, verified in `tools/simulator` (S4) |
| **FR-09** | Documented node failure & restart behavior | Documented in `docs/HOW_IT_WORKS.md` section 5.4 & 10 |
| **FR-10** | Load testing with recorded latency percentiles & metrics | `tools/simulator/simulator.js` (Scenarios S1–S5) |
| **FR-11** | User accounts & password login (bcrypt salted hashes, JWT) | `services/provisioning-api/src/routes/accounts.js` |
| **FR-12** | Plans (single: 1 seat, family: 6 seats) & limit enforcement | `services/provisioning-api/src/routes/tenants.js` & `members.js` |
| **FR-13** | Member roles (owner, admin, member), caller role check, owner guard | `services/provisioning-api/src/middleware/rbac.js` |
| **FR-14** | Shared devices across all household members | `services/provisioning-api/src/routes/devices.js` |
| **FR-15** | Isolated downlink command channel | Magistrala command channel & `tools/esp32-example` |

---

## 2. Repository Layout

```
├── cluster/                     k3d config, namespaces, priority classes, network policies
├── deploy/
│   ├── ha-tenant/               Helm chart for per-tenant isolated Home Assistant
│   ├── magistrala/              Magistrala manifests (Postgres, NATS, MQTT)
│   ├── thingsboard/             ThingsBoard CE StatefulSet & Ingress
│   ├── provisioning/            Provisioning API Kubernetes manifests & RBAC
│   └── tb-bridge/               tb-bridge Kubernetes manifests
├── services/
│   ├── provisioning-api/        Node.js + Express + SQLite (accounts, plans, members, devices)
│   └── tb-bridge/               Node.js MQTT telemetry forwarder to ThingsBoard
├── tools/
│   ├── simulator/               IoT device load tester (Scenarios S1 to S5)
│   ├── tests/                   Automated verification & security test suite
│   ├── esp32-example/           ESP32 Arduino sketch for hardware verification
│   └── collect-metrics.ps1      kubectl top resource sampler
├── docs/
│   ├── HOW_IT_WORKS.md          Living architectural documentation
│   ├── demo-script.md           Step-by-step viva presentation script
│   └── measurements/            CSV performance and latency logs
├── CloudNest_BRD_v3.md          Official Business Requirements Document (v3.1)
└── CloudNest_BRD_Simple.md      Simplified BRD summary
```

---

## 3. Quick Start & Verification

### Running the Automated Test Suite

```powershell
# In services/provisioning-api:
cd services/provisioning-api
npm install
npm start

# In a separate terminal, run the test suite:
node tools/tests/test_suite.js
```

### Running the Load Simulator

```powershell
# Run steady-state telemetry test (Scenario S1)
node tools/simulator/simulator.js --scenario=s1 --tenants=3 --devices=10 --duration=30

# Run auth storm rejection test (Scenario S4)
node tools/simulator/simulator.js --scenario=s4 --duration=10

# Run downlink command round-trip test (Scenario S5)
node tools/simulator/simulator.js --scenario=s5 --duration=10
```

### Step-by-Step Viva Demo

Refer to [`docs/demo-script.md`](docs/demo-script.md) for the 6–8 minute live evaluation walkthrough.
