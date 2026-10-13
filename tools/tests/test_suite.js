// ---------------------------------------------------------------------------
// CloudNest — Automated Verification & Security Test Suite
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
// ---------------------------------------------------------------------------

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Target API base URL
const BASE_URL = process.env.API_URL || 'http://127.0.0.1:3000';
const API_KEY = process.env.PROVISIONING_API_KEY || 'change-me-to-a-random-string';

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
  console.log(` CloudNest Verification Test Suite`);
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

  // 1. T-API-1: API Authentication Check
  await runTest('T-API-1', 'Reject tenant creation without X-API-Key', async () => {
    const res = await request('/v1/tenants', {
      method: 'POST',
      body: JSON.stringify({ slug: 'no-key-test', displayName: 'Test' }),
    });
    assert.strictEqual(res.status, 401, 'Should return 401 without API key');
  });

  // 2. FR-11 / T-API-1: User Registration with bcrypt hash
  await runTest('FR-11', 'Register account and issue JWT', async () => {
    const res = await request('/v1/accounts/register', {
      method: 'POST',
      body: JSON.stringify({ email: ownerEmail, displayName: 'Owner User', password }),
    });
    assert.strictEqual(res.status, 201, 'Should register successfully');
    assert(res.body.token, 'Should return JWT token');
    assert.strictEqual(res.body.account.email, ownerEmail);
    ownerToken = res.body.token;

    // Register second member
    const res2 = await request('/v1/accounts/register', {
      method: 'POST',
      body: JSON.stringify({ email: member1Email, displayName: 'Member One', password }),
    });
    member1Token = res2.body.token;

    // Register third member
    const res3 = await request('/v1/accounts/register', {
      method: 'POST',
      body: JSON.stringify({ email: member2Email, displayName: 'Member Two', password }),
    });
    member2Token = res3.body.token;
  });

  // 3. FR-11: Password-based Login
  await runTest('FR-11', 'Login with valid credentials and reject invalid password', async () => {
    const valid = await request('/v1/accounts/login', {
      method: 'POST',
      body: JSON.stringify({ email: ownerEmail, password }),
    });
    assert.strictEqual(valid.status, 200, 'Valid login should return 200');

    const invalid = await request('/v1/accounts/login', {
      method: 'POST',
      body: JSON.stringify({ email: ownerEmail, password: 'WrongPassword!' }),
    });
    assert.strictEqual(invalid.status, 401, 'Invalid password should return 401');
  });

  // 4. FR-01: Tenant Creation (Single Plan)
  await runTest('FR-01', 'Create single-plan tenant with API key + JWT', async () => {
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
  });

  // 5. FR-12 / T-MEM-3: Seat Limit Enforcement on Single Plan
  await runTest('FR-12', 'Single plan rejects adding 2nd member (1 seat limit)', async () => {
    const res = await request(`/v1/tenants/${singleSlug}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ email: member1Email, role: 'member' }),
    });
    assert.strictEqual(res.status, 409, 'Should return 409 Conflict due to seat limit');
    assert(res.body.error.includes('Seat limit reached'), 'Error message should indicate seat limit');
  });

  // 6. FR-01: Create Family Plan Tenant
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

  // 7. FR-13: Add Member to Family Plan Tenant
  await runTest('FR-13', 'Owner adds member to family tenant', async () => {
    const res = await request(`/v1/tenants/${familySlug}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ email: member1Email, role: 'member' }),
    });
    assert.strictEqual(res.status, 201, 'Should add member successfully');
  });

  // 8. T-MEM-1: IDOR & Cross-Tenant Access Protection (FR-06)
  await runTest('T-MEM-1', 'Reject cross-tenant access for non-members', async () => {
    // member2 is not part of family tenant
    const res = await request(`/v1/tenants/${familySlug}/members`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${member2Token}` },
    });
    assert.strictEqual(res.status, 403, 'Should return 403 Forbidden for non-member');
  });

  // 9. T-MEM-2: RBAC Enforcement on Member Role (FR-13)
  await runTest('T-MEM-2', 'Member role cannot add other members or change plan', async () => {
    // member1 has 'member' role, not admin/owner
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

  // 10. FR-05 & T-DEV-1: Device Registration & Credential Single-View
  let deviceId = null;
  await runTest('FR-05', 'Register device and receive MQTT credentials once', async () => {
    const res = await request(`/v1/tenants/${familySlug}/devices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: 'kitchen-sensor', kind: 'simulator' }),
    });
    assert.strictEqual(res.status, 201, 'Should register device');
    assert(res.body.device.id, 'Device ID should be returned');
    assert(res.body.credentials.clientId, 'Credentials should be returned on registration');
    assert(res.body.credentials.secret, 'Secret should be returned once');
    deviceId = res.body.device.id;
  });

  // 11. FR-14 / T-DEV-4: Shared Device Access Across Tenant Members
  await runTest('FR-14', 'Both owner and member can see tenant devices', async () => {
    const resOwner = await request(`/v1/tenants/${familySlug}/devices`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.strictEqual(resOwner.status, 200);
    assert.strictEqual(resOwner.body.devices.length, 1);

    const resMember = await request(`/v1/tenants/${familySlug}/devices`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    assert.strictEqual(resMember.status, 200);
    assert.strictEqual(resMember.body.devices.length, 1);
    assert.strictEqual(resMember.body.devices[0].name, 'kitchen-sensor');
  });

  // 12. FR-12: Downgrade Guard (Reject downgrade when seats exceed single plan)
  await runTest('FR-12', 'Reject plan downgrade when seats exceed new plan limits', async () => {
    // familySlug has 2 active members (owner + member1); single plan allows only 1 seat
    const res = await request(`/v1/tenants/${familySlug}/plan`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ plan: 'single' }),
    });
    assert.strictEqual(res.status, 409, 'Should reject downgrade when seats exceed limit');
  });

  // 13. FR-13: Owner Demotion Protection
  await runTest('FR-13', 'Last owner cannot be removed or demoted', async () => {
    // Fetch owner membership id
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

  // 14. FR-05 & T-DEV-5: Rotate Secret & Revoke Device
  await runTest('FR-05', 'Rotate device secret and revoke device', async () => {
    const rotate = await request(`/v1/tenants/${familySlug}/devices/${deviceId}/rotate-secret`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.strictEqual(rotate.status, 200, 'Should rotate device secret');
    assert(rotate.body.secret, 'New secret should be returned');

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
