# The-SIFT: Pre-AWS Deployment Audit, Optimizations & Microservices Refactor Plan

This document outlines the structural bugs, AWS/K3s pre-deployment optimizations, and the target microservice architecture (`min: 2, max: 5` auto-scaling) to be executed across the repository.

---

## 1. Structural Bugs Visible in the Repository Tree

* **Incomplete `iot-broker-service` Microservice (`services/iot-broker-service/`):**
  * Currently only contains `package.json`, `src/config.js`, `src/db.js`, and `src/services/magistrala.js`.
  * **Missing:** `src/index.js` (the Express/server entry point), `src/routes/` (e.g., `devices.js`), a `Dockerfile`, and `package-lock.json`.
* **Broken Docker Build Contexts & Missing Workspace Root for `sift-common`:**
  * Shared package exists at `packages/sift-common/` (`auth.js`, `db.js`, `events.js`, `http.js`, `logger.js`), alongside `services/identity-service/` and `services/provisioning-api/`.
  * **No root `package.json`:** There is no `package.json` at the repository root to define npm workspaces.
  * **Missing lockfiles:** `services/identity-service/` has a `Dockerfile` and `package.json`, but is missing `package-lock.json` (unlike `provisioning-api` and `tb-bridge`, which both have `package-lock.json`). If `services/identity-service/Dockerfile` runs `npm ci`, the build will fail immediately.
  * **Docker context mismatch:** If `services/identity-service/Dockerfile` or `services/provisioning-api/Dockerfile` is built using `./services/<service-name>` as the Docker build context instead of the repo root, Docker cannot access `../../packages/sift-common`.
* **Missing Kubernetes Manifests for the New Microservices:**
  * Under `deploy/`, manifests exist for `ha-tenant/`, `magistrala/`, `provisioning/`, `tb-bridge/`, and `thingsboard/`, but there are **no Kubernetes `deployment.yaml`, `service.yaml`, or `hpa.yaml` manifests for `identity-service` or `iot-broker-service`**.
  * Furthermore, `deploy/aws/` currently only contains `.gitkeep`.
* **Duplicate / Uncleaned Monolith Code:**
  * Both `services/identity-service/` and `services/provisioning-api/` contain `src/routes/accounts.js` and `src/services/email.js`.
  * Both `services/iot-broker-service/` and `services/provisioning-api/` contain `src/services/magistrala.js`.
  * Running both without cutting over Ingress routes and removing duplicate routes from `provisioning-api` will cause split-brain behavior if schemas or JWT secrets drift.
* **Bundled Simulator & Duplicate Assets in `public/`:**
  * `one-device.js` is duplicated in both `services/provisioning-api/public/tools/one-device.js` and `tools/simulator/one-device.js`. Exposing backend/CLI simulator scripts inside `public/tools/` makes them publicly downloadable from the web portal.
  * Additionally, `public/favicon.jpg` and `public/logo.jpg` are identical full-size images (~40+ KB each).

---

## 2. Critical Pre-Deployment Checks & Optimizations for AWS + K3s

### 1. `tb-bridge` Duplicate Telemetry Bug Under Scaling (`services/tb-bridge/src/index.js`)
* **Issue:** When `tb-bridge` subscribes to Magistrala MQTT wildcard topics to forward telemetry to ThingsBoard and Home Assistant, running more than 1 replica with a standard MQTT subscription causes every replica to receive and forward the same message, duplicating telemetry and MQTT discovery payloads.
* **Fix:** Either pin `deploy/tb-bridge/deployment.yaml` to `replicas: 1` (with `strategy.type: Recreate`), or use **MQTT v5 Shared Subscriptions** (`$share/tb-bridge-group/channels/#`) so the broker load-balances messages across replicas.

### 2. Helm Chart / Template Access Inside `provisioning-api` Container
* **Issue:** Tenant provisioning logic (`services/provisioning-api/src/services/kubernetes.js`) provisions resources modeled in `deploy/ha-tenant/` and `cluster/netpol-tenant-template.yaml`.
* **Fix:** Ensure that if `kubernetes.js` reads YAML templates or invokes Helm from disk, those files (`deploy/ha-tenant/` and `cluster/`) are explicitly `COPY`-ed into the `provisioning-api` Docker image in `services/provisioning-api/Dockerfile` (using the repo root as build context).

### 3. PostgreSQL Connection Pool Exhaustion (`db.js` across services)
* **Issue:** With `sift-common/src/db.js`, `identity-service/src/db.js`, `iot-broker-service/src/db.js`, `provisioning-api/src/db.js`, Magistrala, and ThingsBoard all connecting to PostgreSQL, default `pg.Pool` sizes (`10`–`20` connections per Node.js process) multiplied across auto-scaled replicas (`2`–`5` pods per service) will quickly hit Postgres's default `max_connections = 100`.
* **Fix:** Set `max: 5` (and `idleTimeoutMillis: 30000`) per microservice pod in `sift-common/src/db.js`, or deploy **PgBouncer** in front of PostgreSQL.

### 4. Least-Privilege Kubernetes RBAC (`deploy/provisioning/rbac.yaml`)
* **Issue:** Mounting cluster/namespace provisioning permissions across all API pods increases blast radius.
* **Fix:** Only the service that actually talks to the K8s API (`services/provisioning-api/src/services/kubernetes.js`) should mount the ServiceAccount linked to `deploy/provisioning/rbac.yaml`. Set `automountServiceAccountToken: false` on `identity-service` and `iot-broker-service` pods.

---

## 3. Microservice Split & Auto-Scaling Architecture (`min: 2, max: 5`)

**Short Verdict:** Split `provisioning-api` into **3 focused microservices** (`identity-service`, `iot-broker-service`, and `tenant-provisioning-service`) and scale each between **2 and 5 instances** using **Kubernetes HPA (HorizontalPodAutoscaler)** on top of a single shared EC2 Worker Auto Scaling Group (ASG), rather than separate EC2 ASGs/MIGs per microservice.

### Why Pod HPA Beats Per-Microservice MIGs (EC2 ASGs) on AWS

| Approach | How It Works | Cost & Resource Impact | Scaling Speed |
| :--- | :--- | :--- | :--- |
| **Option A: Separate EC2 ASG/MIG per Microservice (`min: 2, max: 5` VMs each)** | $3 \text{ microservices} \times \text{min } 2 \text{ VMs} = 6 \text{ to } 15$ dedicated EC2 instances just for lightweight Node.js APIs, plus separate Application Load Balancers. | **Very Expensive ($\$250\text{--}\$450\text{+/mo}$ extra).** Huge CPU/RAM waste since control-plane APIs sit idle $95\%$ of the time. | **Slow ($2\text{--}4\text{ minutes}$)** to boot new EC2 instances during traffic spikes. |
| **Option B: K3s HPA per Microservice (`min: 2, max: 5` Pods) + 1 Shared Worker ASG (Recommended)** | Each microservice is a K8s `Deployment` with a `HorizontalPodAutoscaler` (`minReplicas: 2`, `maxReplicas: 5`). Underlying EC2 worker nodes sit in **one** shared ASG (`min: 2, max: 5` nodes). | **Cost-Optimal (fits target budget).** 6 Node.js pods only consume $\sim 350\text{ MB}$ RAM total across existing K3s worker nodes. | **Instant ($2\text{--}5\text{ seconds}$)** to spin up a new Node.js container under JMeter/Locust load. |

### How to Architect the 3 Microservices Cleanly

1. **The 3 Microservice Boundaries:**
   * **`identity-service`** (`/api/v1/accounts`, `/api/v1/members`, `/api/v1/auth`):
     * Handles registration, login, JWT issuance, email invites (`email.js`), and household membership.
     * Stateless and CPU-bound (`bcrypt` password hashing), making it ideal for HPA scaling under load tests.
   * **`tenant-provisioning-service`** (slimmed-down `provisioning-api` handling `/api/v1/tenants`):
     * Handles K8s namespace creation, `ha-tenant` Helm/template deployment, ResourceQuotas, and NetworkPolicies (`kubernetes.js`).
     * Only this service gets the `deploy/provisioning/rbac.yaml` ServiceAccount.
   * **`iot-broker-service`** (`/api/v1/devices`):
     * Handles Magistrala thing/channel provisioning (`magistrala.js`) and ThingsBoard device synchronization (`thingsboard.js`).

2. **Preventing Race Conditions Across 2–5 Replicas:**
   * When running 2 to 5 replicas of `tenant-provisioning-service` or `iot-broker-service`, two concurrent requests from the same user can trigger duplicate K8s namespace creation or duplicate Magistrala device creation.
   * Enforce `UNIQUE` constraints on Postgres `tenants` and `devices` tables and use atomic `INSERT ... ON CONFLICT DO NOTHING RETURNING *` queries before calling the Kubernetes or Magistrala APIs so only one replica wins the provisioning lock.

3. **Decouple the Frontend (`services/provisioning-api/public/`):**
   * Serve `public/` from a lightweight `nginx:alpine` deployment (or AWS S3 + CloudFront) or dedicated static route.
   * Configure K3s Ingress (Traefik / AWS ALB) path-based routing:
     * `/api/accounts` & `/api/members` $\rightarrow$ `identity-service`
     * `/api/tenants` $\rightarrow$ `tenant-provisioning-service`
     * `/api/devices` $\rightarrow$ `iot-broker-service`
     * `/` $\rightarrow$ Frontend UI

---

## 4. Actionable Task List for Antigravity

- [x] **Task 1: Configure Root Workspace & Dockerfiles**
  - Create a root `package.json` with npm `workspaces: ["packages/*", "services/*"]` and generate a unified lockfile (or ensure `sift-common` is properly copied in multi-stage Docker builds using the repo root context).
- [x] **Task 2: Complete `services/iot-broker-service`**
  - Add `src/index.js`, migrate `src/routes/devices.js` and `src/services/thingsboard.js` from `provisioning-api`, and create `services/iot-broker-service/Dockerfile`.
- [x] **Task 3: Complete `services/identity-service` & Slim Down `services/provisioning-api`**
  - Migrate `src/routes/members.js` into `identity-service` alongside `accounts.js`.
  - Remove migrated routes (`accounts.js`, `members.js`, `devices.js`) from `provisioning-api` so it strictly acts as the K8s tenant provisioning service (or API gateway if desired).
- [x] **Task 4: Harden Database Pool & Concurrency**
  - Update `packages/sift-common/src/db.js` to cap `max: 5` connections per pod.
  - Add idempotency guards (`ON CONFLICT DO NOTHING`) around tenant and device creation.
- [x] **Task 5: Fix `tb-bridge` Scaling Behavior**
  - Update `services/tb-bridge/src/index.js` to use MQTT shared subscriptions (`$share/sift-bridge/...`) or lock `deploy/tb-bridge/deployment.yaml` to `replicas: 1`.
- [x] **Task 6: Create K8s Deployment, Service, Ingress & HPA Manifests**
  - Add `deployment.yaml`, `service.yaml`, and `HorizontalPodAutoscaler` (`minReplicas: 2`, `maxReplicas: 5`, target CPU `70%`) for `identity-service`, `iot-broker-service`, and `provisioning-api` under `deploy/`.
  - Set `automountServiceAccountToken: false` on `identity-service` and `iot-broker-service`.
- [x] **Task 7: Clean Up Static Assets**
  - Remove `services/provisioning-api/public/tools/one-device.js` from public static hosting.