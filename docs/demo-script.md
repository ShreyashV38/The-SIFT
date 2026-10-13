# CloudNest — Live Evaluation & Viva Demo Script
Duration: 6–8 minutes  
Platform: Local 2-Node K3s Cluster  
Target BRD Version: 3.1 (15 Committed Functional Requirements)

---

## 0. Pre-Flight Check & Architecture Recap (1 min)

Demonstrate the 2-node cluster with labeled roles (identity on server, workloads on worker):

```powershell
# Show Ready nodes and role labels
kubectl get nodes -o wide --show-labels

# Show baseline namespaces (platform, observability, provisioning)
kubectl get namespaces -l app.kubernetes.io/part-of=cloudnest
kubectl get priorityclass identity-critical
```

Explain:
- **Identity node** (server): Runs K3s server, Traefik ingress, and Magistrala (Atom IAM, FluxMQ broker, Postgres, NATS).
- **Worker node** (agent): Runs ThingsBoard CE, tb-bridge, Provisioning API, and isolated per-tenant Home Assistant pods.

---

## 1. Register Platform Accounts (FR-11) (30 sec)

Demonstrate user account creation with salted bcrypt password hashing:

```powershell
# Register Owner account
curl.exe -s -X POST http://localhost:3000/v1/accounts/register `
  -H "Content-Type: application/json" `
  -d '{"email":"owner@cloudnest.local","displayName":"Alice Smith","password":"Password123!"}'

# Register Second Family Member account
curl.exe -s -X POST http://localhost:3000/v1/accounts/register `
  -H "Content-Type: application/json" `
  -d '{"email":"bob@cloudnest.local","displayName":"Bob Smith","password":"Password123!"}'

# Log in as Owner to obtain JWT
$loginRes = curl.exe -s -X POST http://localhost:3000/v1/accounts/login `
  -H "Content-Type: application/json" `
  -d '{"email":"owner@cloudnest.local","password":"Password123!"}' | ConvertFrom-Json
$ownerToken = $loginRes.token
Write-Host "Owner Token acquired: $ownerToken"
```

---

## 2. Automated Tenant Provisioning (FR-01, FR-02, FR-03) (1.5 min)

Provision a new household tenant on the `family` plan in a single API call:

```powershell
curl.exe -s -X POST http://localhost:3000/v1/tenants `
  -H "Content-Type: application/json" `
  -H "X-API-Key: change-me-to-a-random-string" `
  -H "Authorization: Bearer $ownerToken" `
  -d '{"slug":"smith-house","displayName":"Smith Household","plan":"family"}'
```

Verify the automated provisioning outcomes:
1. **Magistrala workspace & channels** created (`FR-02`).
2. **Dedicated Kubernetes namespace** created with baseline Pod Security Standard (`FR-03`).
3. **Full isolation stack** deployed: default-deny NetworkPolicy, ResourceQuota, LimitRange, restricted ServiceAccount.

```powershell
# Inspect the tenant namespace and pods
kubectl get all,netpol,resourcequota -n tenant-smith-house
```

---

## 3. Multi-User Households & Seat Limits (FR-12, FR-13) (1 min)

Add Bob directly to the family tenant (BRD v3.1 API workflow):

```powershell
# Add Bob as a member
curl.exe -s -X POST http://localhost:3000/v1/tenants/smith-house/members `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $ownerToken" `
  -d '{"email":"bob@cloudnest.local","role":"member"}'

# List tenant members
curl.exe -s -X GET http://localhost:3000/v1/tenants/smith-house/members `
  -H "Authorization: Bearer $ownerToken"
```

**Demonstrate Plan Enforcement (FR-12)**:
- On a `single` plan, adding a 2nd member returns `409 Conflict: Seat limit reached`.
- On a `family` plan, up to 6 members are permitted.
- Downgrading from `family` to `single` is rejected while member count > 1.

---

## 4. Device Registration & Credential Security (FR-05, FR-14) (1 min)

Register a new simulated IoT sensor:

```powershell
# Register living-room sensor (credentials shown ONCE)
$devRes = curl.exe -s -X POST http://localhost:3000/v1/tenants/smith-house/devices `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $ownerToken" `
  -d '{"name":"living-room-sensor","kind":"simulator"}'
$devRes
```

**Demonstrate Shared Devices (FR-14)**:
- Log in as Bob (the member):
```powershell
$bobLogin = curl.exe -s -X POST http://localhost:3000/v1/accounts/login `
  -H "Content-Type: application/json" `
  -d '{"email":"bob@cloudnest.local","password":"Password123!"}' | ConvertFrom-Json
$bobToken = $bobLogin.token

# Bob lists devices and sees the living-room sensor
curl.exe -s -X GET http://localhost:3000/v1/tenants/smith-house/devices `
  -H "Authorization: Bearer $bobToken"
```

---

## 5. End-to-End Telemetry & ThingsBoard Visualization (FR-04, FR-07) (1.5 min)

Run the load simulator to publish live telemetry:

```powershell
# Run steady-state telemetry simulation (Scenario S1)
node tools/simulator/simulator.js --scenario=s1 --tenants=1 --devices=5 --duration=15
```

Show telemetry pipeline:
1. Sensor publishes to Magistrala MQTT broker (:1883).
2. Telemetry delivers to tenant's Home Assistant instance.
3. `tb-bridge` forwards telemetry to ThingsBoard CE Gateway API.
4. Admin opens `http://tb.localtest.me` (or `http://localhost:8080`) to view live fleet metrics.

---

## 6. Security & Negative Controls (FR-08, FR-15, FR-06) (1 min)

Demonstrate security and isolation protections:

1. **Invalid credentials rejected (FR-08)**:
```powershell
# Run auth rejection test (Scenario S4)
node tools/simulator/simulator.js --scenario=s4 --duration=10
```
*Expected: 100% of invalid devices are rejected by Magistrala; 0 unauthorized messages delivered.*

2. **Command channel isolation (FR-15)**:
```powershell
# Run downlink command round-trip test (Scenario S5)
node tools/simulator/simulator.js --scenario=s5 --duration=10
```
*Expected: Downlink commands reach only the devices subscribed to that tenant's command channel.*

3. **Run complete automated test suite**:
```powershell
node tools/tests/test_suite.js
```
*Expected: 14/14 tests PASS (T-API-1, T-MEM-1..3, T-DEV-1..5, etc.).*

---

## 7. Node-Failure & Sizing Recap (FR-09, Section 9) (1 min)

Explain resilience behavior honestly:
- **Stateless pods** (tenant Home Assistant instances): If the worker node fails, pods reschedule to the surviving identity node provided memory capacity exists.
- **Stateful services** (PostgreSQL, ThingsBoard PVCs): Bound to local-path volumes on their node; documented as single point of failure (not claiming multi-node HA).
- **AWS Cost Model**: $72.84/month for 2 x t3.medium with K3s ServiceLB (saves $73/mo EKS control plane fee and $55/mo ALB fee).
