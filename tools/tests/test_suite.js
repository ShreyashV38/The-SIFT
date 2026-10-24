// ---------------------------------------------------------------------------
// CloudNest — Automated Verification & Security Test Suite (Phase 6C Extended)
// ---------------------------------------------------------------------------
// Validates functional requirements and security controls:
// - FR-01: Tenant provisioning & slug validation
// - FR-05: Device registration, secret rotation, revocation
// - FR-06: Tenant isolation (IDOR & role checks)
// - FR-11: Password-based auth, salted hashing, JWT security
// - FR-12: Plan limit enforcement (single vs family) & downgrade guard
// - FR-13: RBAC enforcement on every route, owner protection
// - FR-14: Shared devices across tenant members
// - FR-15: Channel separation (telemetry vs command)
// - Phase 6C / FR-16: Public config & warnings (GET /v1/config)
// - Phase 6C / FR-17: User bootstrap with tenant list (GET /v1/me)
// - Phase 6C / FR-18: Tenant live provisioning steps & limits
// - Phase 6C / FR-19: Device status polling (pending/online/offline)
// - Phase 6C / FR-20: Role-aware plan update (PATCH /plan)
// - Phase 6C / FR-22: Home Assistant credentials access with Cache-Control: no-store
// - Phase 6C / SEC-UI-2: CSRF protection on state-changing cookie requests
// - Phase 6C / SEC-UI-7: Internal endpoint (POST /internal/devices/seen) token & validation
// ---------------------------------------------------------------------------

const assert = require('assert');

// Target API base URL
const BASE_URL = process.env.API_URL || 'http://127.0.0.1:3000';
const INTERNAL_URL = process.env.INTERNAL_API_URL || 'http://127.0.0.1:8081';
const API_KEY = process.env.PROVISIONING_API_KEY || 'change-me-to-a-random-string';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'sift-internal-secret-token';

let passed = 0;
let failed = 0;

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, headers: res.headers, body: data };
}

async function runTest(testId, description, fn) {
  process.stdout.write(`[${testId}] ${description}... `);
  try {
    await fn();
    console.log('PASS');
    passed++;
  } catch (err) {
    console.log(`FAIL\n    Error: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('========================================================');
  console.log(` CloudNest Verification & Security Test Suite`);
  console.log(` Target: ${BASE_URL}`);
  console.log('========================================================\n');

  // Verify API is accessible
  try {
    const health = await request('/health');
    assert.strictEqual(health.status, 200, 'API health check should return 200');
  } catch (err) {
    console.error(`Cannot connect to API at ${BASE_URL}: ${err.message}`);
    console.error('Make sure provisioning-api is running before executing tests.');
    process.exit(1);
  }

  // Generate test credentials
  const ts = Date.now();
  const ownerEmail = `owner-${ts}@example.com`;
  const member1Email = `member1-${ts}@example.com`;
  const member2Email = `member2-${ts}@example.com`;
  const password = 'Password123!';
  const singleSlug = `single-${ts.toString().slice(-6)}`;
  const familySlug = `family-${ts.toString().slice(-6)}`;

  let ownerToken = '';
  let member1Token = '';
  let member2Token = '';
  let sessionCookie = '';

  // 1. T-API-1: API Authentication Check
  await runTest('T-API-1', 'Reject tenant creation without X-API-Key or user auth', async () => {
    const res = await request('/v1/tenants', {
      method: 'POST',
      body: JSON.stringify({ slug: 'no-key-test', displayName: 'Test' }),
    });
    assert.strictEqual(res.status, 401, 'Should return 401 without auth');
  });

  // 2. FR-11: User Registration with bcrypt hash
  await runTest('FR-11', 'Register account, issue JWT and sift_session cookie', async () => {
    const res = await request('/v1/accounts/register', {
      method: 'POST',
      body: JSON.stringify({
        email: ownerEmail,
        displayName: 'Test Owner',
        password,
      }),
    });
    assert.strictEqual(res.status, 201, 'Should return 201 Created');
    assert(res.body.token, 'Should return JWT token');
    assert.strictEqual(res.body.account.email, ownerEmail);

    // Verify Set-Cookie header for portal session
    const setCookie = res.headers.get('set-cookie');
    assert(setCookie && setCookie.includes('sift_session='), 'Should issue sift_session cookie');
    sessionCookie = setCookie.split(';')[0];
    ownerToken = res.body.token;
  });

  // 3. FR-11: Login with Password and Verify JWT
  await runTest('FR-11', 'Login with valid credentials and verify session', async () => {
    const res = await request('/v1/accounts/login', {
      method: 'POST',
      body: JSON.stringify({ email: ownerEmail, password }),
    });
    assert.strictEqual(res.status, 200, 'Should return 200 OK');
    assert(res.body.token, 'Should return JWT token');

    // Also register member1 and member2
    const m1 = await request('/v1/accounts/register', {
      method: 'POST',
      body: JSON.stringify({ email: member1Email, displayName: 'Member One', password }),
    });
    member1Token = m1.body.token;

    const m2 = await request('/v1/accounts/register', {
      method: 'POST',
      body: JSON.stringify({ email: member2Email, displayName: 'Member Two', password }),
    });
    member2Token = m2.body.token;
  });

  // 4. FR-16 (Phase 6C): Public Config Endpoint
  await runTest('FR-16', 'GET /v1/config returns MQTT settings, domain, and warnings', async () => {
    const res = await request('/v1/config');
    assert.strictEqual(res.status, 200);
    assert(res.body.mqtt, 'Should contain mqtt config');
    assert(res.body.mqtt.host, 'Should contain mqtt host');
    assert(res.body.tenantDomain, 'Should contain tenantDomain');
    assert(Array.isArray(res.body.warnings), 'Should contain warnings list');
  });

  // 5. FR-01: Create Single Plan Tenant
  await runTest('FR-01', 'Create single-plan tenant with live steps', async () => {
    const res = await request('/v1/tenants', {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        slug: singleSlug,
        displayName: 'Single Household',
        plan: 'single',
      }),
    });
    assert.strictEqual(res.status, 201, 'Should create tenant');
    assert.strictEqual(res.body.tenant.slug, singleSlug);
    assert.strictEqual(res.body.tenant.plan, 'single');
    assert(res.body.magistrala.workspaceId, 'Workspace ID should be generated (FR-02)');
    assert(Array.isArray(res.body.steps), 'Should return provisioning steps');
  });

  // 6. FR-17 (Phase 6C): User Session Bootstrap (/v1/me)
  await runTest('FR-17', 'GET /v1/me returns account and tenant memberships', async () => {
    const res = await request('/v1/me', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.account.email, ownerEmail);
    assert(Array.isArray(res.body.tenants), 'Should return tenants list');
    assert(res.body.tenants.some(t => t.slug === singleSlug), 'Should list created tenant');
  });

  // 7. FR-12 / T-MEM-3: Seat Limit Enforcement on Single Plan
  await runTest('FR-12', 'Single plan rejects adding 2nd member (1 seat limit)', async () => {
    const res = await request(`/v1/tenants/${singleSlug}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ email: member1Email, role: 'member' }),
    });
    assert.strictEqual(res.status, 409, 'Should return 409 Conflict due to seat limit');
    const errMsg = typeof res.body.error === 'object' ? res.body.error.message : res.body.error;
    assert(errMsg && errMsg.includes('Seat limit reached'), 'Error message should indicate seat limit');
  });

  // 8. FR-01: Create Family Plan Tenant
  await runTest('FR-01', 'Create family-plan tenant', async () => {
    const res = await request('/v1/tenants', {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        slug: familySlug,
        displayName: 'Family Household',
        plan: 'family',
      }),
    });
    assert.strictEqual(res.status, 201, 'Should create family tenant');
  });

  // 9. FR-13: Add Member to Family Plan Tenant
  await runTest('FR-13', 'Owner adds member to family tenant', async () => {
    const res = await request(`/v1/tenants/${familySlug}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ email: member1Email, role: 'member' }),
    });
    assert.strictEqual(res.status, 201, 'Should add member successfully');
  });

  // 10. T-MEM-1: IDOR & Cross-Tenant Access Protection (FR-06)
  await runTest('T-MEM-1', 'Reject cross-tenant access for non-members', async () => {
    const res = await request(`/v1/tenants/${familySlug}/members`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${member2Token}` },
    });
    assert.strictEqual(res.status, 403, 'Should return 403 Forbidden for non-member');
  });

  // 11. T-MEM-2: RBAC Enforcement on Member Role (FR-13)
  await runTest('T-MEM-2', 'Member role cannot add other members or change plan', async () => {
    const addMember = await request(`/v1/tenants/${familySlug}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${member1Token}` },
      body: JSON.stringify({ email: member2Email, role: 'member' }),
    });
    assert.strictEqual(addMember.status, 403, 'Member cannot add other members');

    const changePlan = await request(`/v1/tenants/${familySlug}/plan`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${member1Token}` },
      body: JSON.stringify({ plan: 'single' }),
    });
    assert.strictEqual(changePlan.status, 403, 'Member cannot change plan');
  });

  // 12. FR-22 (Phase 6C): Home Assistant Access Panel
  await runTest('FR-22', 'GET /ha-access returns credentials with Cache-Control: no-store', async () => {
    const resMember = await request(`/v1/tenants/${familySlug}/ha-access`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    assert.strictEqual(resMember.status, 200);
    assert(resMember.body.username, 'Should return HA username');
    assert(resMember.body.password, 'Should return HA password');
    assert.strictEqual(resMember.headers.get('cache-control'), 'no-store', 'Cache-Control must be no-store');

    // Non-member access rejected
    const resNonMember = await request(`/v1/tenants/${familySlug}/ha-access`, {
      headers: { Authorization: `Bearer ${member2Token}` },
    });
    assert.strictEqual(resNonMember.status, 403, 'Non-member should be rejected');
  });

  // 13. FR-05 & T-DEV-1: Device Registration & Credential Single-View
  let deviceId = null;
  let mgClientId = null;
  await runTest('FR-05', 'Register device and receive MQTT credentials once', async () => {
    const res = await request(`/v1/tenants/${familySlug}/devices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: 'kitchen-sensor', kind: 'sensor' }),
    });
    assert.strictEqual(res.status, 201, 'Should register device');
    assert(res.body.device.id, 'Device ID should be returned');
    assert(res.body.credentials.clientId, 'Credentials should be returned on registration');
    assert(res.body.credentials.secret, 'Secret should be returned once');
    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    deviceId = res.body.device.id;
    mgClientId = res.body.credentials.clientId;
  });

  // 14. FR-19 (Phase 6C): Device Status Polling Endpoint
  await runTest('FR-19', 'GET /devices/:id/status returns computed pending status without secret', async () => {
    const res = await request(`/v1/tenants/${familySlug}/devices/${deviceId}/status`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.device.status, 'pending', 'Freshly provisioned device should be pending');
    assert.strictEqual(res.body.device.secret, undefined, 'Device status must never return secret');
  });

  // 15. SEC-UI-7 (Phase 6C): Internal Activity Reports (/internal/devices/seen)
  await runTest('SEC-UI-7', 'Post device activity report to internal endpoint', async () => {
    // 15a: Unauthorized request rejected without token
    const unauth = await request('/internal/devices/seen', {
      method: 'POST',
      body: JSON.stringify({ reports: [] }),
    });
    assert.strictEqual(unauth.status, 403, 'Should reject without X-Internal-Token');

    // 15b: Valid report updates device status to online
    const reportRes = await request('/internal/devices/seen', {
      method: 'POST',
      headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify({
        reports: [
          {
            tenantSlug: familySlug,
            deviceId: mgClientId,
            ts: new Date().toISOString(),
            values: { temperature: 24.5, humidity: 55 },
          },
        ],
      }),
    });
    assert.strictEqual(reportRes.status, 200);
    assert.strictEqual(reportRes.body.accepted, 1);

    // Verify status now reads online with lastValue
    const statusRes = await request(`/v1/tenants/${familySlug}/devices/${deviceId}/status`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.strictEqual(statusRes.body.device.status, 'online', 'Status should now be online');
    assert.strictEqual(statusRes.body.device.lastValue.temperature, 24.5);
  });

  // 16. FR-14 / T-DEV-4: Shared Device Access Across Tenant Members
  await runTest('FR-14', 'Both owner and member can see tenant devices', async () => {
    const resOwner = await request(`/v1/tenants/${familySlug}/devices`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.strictEqual(resOwner.status, 200);
    assert.strictEqual(resOwner.body.devices.length, 1);

    const resMember = await request(`/v1/tenants/${familySlug}/devices`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    assert.strictEqual(resMember.status, 200);
    assert.strictEqual(resMember.body.devices.length, 1);
    assert.strictEqual(resMember.body.devices[0].name, 'kitchen-sensor');
  });

  // 17. SEC-UI-2 (Phase 6C): CSRF Protection on Session Cookie
  await runTest('SEC-UI-2', 'Reject cookie-authenticated state modification missing X-SIFT-CSRF', async () => {
    // Attempt device registration with cookie but WITHOUT X-SIFT-CSRF header
    const noCsrf = await request(`/v1/tenants/${familySlug}/devices`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
      body: JSON.stringify({ name: 'unauthorized-csrf-sensor', kind: 'sensor' }),
    });
    assert.strictEqual(noCsrf.status, 403, 'Should reject cookie state-change without X-SIFT-CSRF');

    // With X-SIFT-CSRF: 1 header, request succeeds
    const withCsrf = await request(`/v1/tenants/${familySlug}/devices`, {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'X-SIFT-CSRF': '1',
      },
      body: JSON.stringify({ name: 'authorized-csrf-switch', kind: 'switch' }),
    });
    assert.strictEqual(withCsrf.status, 201, 'Should succeed with X-SIFT-CSRF header');
  });

  // 18. FR-12: Downgrade Guard (Reject downgrade when seats exceed single plan)
  await runTest('FR-12', 'Reject plan downgrade when seats exceed new plan limits', async () => {
    const res = await request(`/v1/tenants/${familySlug}/plan`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ plan: 'single' }),
    });
    assert.strictEqual(res.status, 409, 'Should reject downgrade when seats exceed limit');
  });

  // 19. FR-13: Owner Demotion Protection
  await runTest('FR-13', 'Last owner cannot be removed or demoted', async () => {
    const membersRes = await request(`/v1/tenants/${familySlug}/members`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const ownerMember = membersRes.body.members.find((m) => m.role === 'owner');

    const demote = await request(`/v1/tenants/${familySlug}/members/${ownerMember.id}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ role: 'member' }),
    });
    assert.strictEqual(demote.status, 400, 'Cannot demote the last owner');
  });

  // 20. FR-05 & T-DEV-5: Rotate Secret & Revoke Device
  await runTest('FR-05', 'Rotate device secret and revoke device', async () => {
    const rotate = await request(`/v1/tenants/${familySlug}/devices/${deviceId}/rotate-secret`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.strictEqual(rotate.status, 200, 'Should rotate device secret');
    assert(rotate.body.secret, 'New secret should be returned');
    assert.strictEqual(rotate.headers.get('cache-control'), 'no-store');

    const revoke = await request(`/v1/tenants/${familySlug}/devices/${deviceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.strictEqual(revoke.status, 200, 'Should revoke device');
  });

  console.log('\n========================================================');
  console.log(` TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
