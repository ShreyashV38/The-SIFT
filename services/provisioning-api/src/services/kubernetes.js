// ---------------------------------------------------------------------------
// CloudNest — Kubernetes Deployment Service
// ---------------------------------------------------------------------------
// Deploys per-tenant Home Assistant instances using kubectl/helm with Docker fallback.
// FR-03: isolated HA instance per tenant in a dedicated namespace
// with NetworkPolicy, ResourceQuota, LimitRange, restricted SA, PSS.
// ---------------------------------------------------------------------------

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const config = require('../config');
const logger = require('../logger');

const defaultChartPath = path.resolve(__dirname, '../../../../deploy/ha-tenant');
const HELM_CHART_PATH = process.env.HA_HELM_CHART_PATH || (fs.existsSync('/app/charts/ha-tenant') ? '/app/charts/ha-tenant' : defaultChartPath);

// Active port-forwards map (slug -> ChildProcess)
const activePortForwards = new Map();

// Fast cluster reachability check (cached)
let k8sReachable = null;
function checkK8s() {
  if (k8sReachable !== null) return k8sReachable;
  try {
    execSync('kubectl cluster-info', { stdio: 'ignore', timeout: 1500 });
    k8sReachable = true;
  } catch {
    k8sReachable = false;
  }
  return k8sReachable;
}

// Helper to launch background kubectl port-forward for a tenant
function startPortForward(slug, namespace, localPort = 8123) {
  try {
    if (activePortForwards.has(slug)) {
      try { activePortForwards.get(slug).kill(); } catch (_) {}
      activePortForwards.delete(slug);
    }

    const pf = spawn('kubectl', ['port-forward', '-n', namespace, 'svc/ha', `${localPort}:8123`], {
      detached: true,
      stdio: 'ignore',
    });
    pf.unref();
    activePortForwards.set(slug, pf);
    logger.info('Automatic HA port-forward established', { slug, namespace, localPort });
  } catch (err) {
    logger.warn('Failed to establish automatic HA port-forward', { slug, error: err.message });
  }
}

// Deploy a Home Assistant instance for a tenant (FR-03)
function deployTenant(slug, mqttCredentials) {
  const namespace = `tenant-${slug}`;
  const releaseName = `ha-${slug}`;
  const tenantHaPassword = config.getTenantHaPassword(slug);

  // 1. Precompute bcrypt hash of HA password (base64-encoded for HA auth provider)
  const haPasswordHash = Buffer.from(bcrypt.hashSync(tenantHaPassword, 12)).toString('base64');

  if (!checkK8s()) {
    logger.info('Kubernetes cluster not reachable, returning simulated HA instance config', { slug });
    return {
      namespace,
      releaseName,
      url: `http://${slug}.${config.domain}:8123`,
      haCredentials: {
        username: config.haUsername,
        password: tenantHaPassword,
      },
    };
  }

  try {
    // 2. Create namespace with Pod Security Standard label
    execSafe(`kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`);
    execSafe(`kubectl label namespace ${namespace} pod-security.kubernetes.io/enforce=baseline --overwrite`);
    execSafe(`kubectl label namespace ${namespace} app.kubernetes.io/part-of=cloudnest --overwrite`);

    // 3. Deploy via Helm with tenant-specific values
    const helmArgs = [
      `helm upgrade --install ${releaseName} "${HELM_CHART_PATH}"`,
      `--namespace ${namespace}`,
      `--set tenant.slug=${slug}`,
      `--set tenant.domain=${config.domain}`,
      `--set homeAssistant.image.tag=${config.haImageTag}`,
      `--set mqtt.host=magistrala-mqtt.platform.svc.cluster.local`,
      `--set mqtt.port=1883`,
      `--set haAuth.username=${config.haUsername}`,
      `--set haAuth.password="${tenantHaPassword}"`,
      `--set haAuth.passwordHash="${haPasswordHash}"`,
      mqttCredentials.clientId ? `--set mqtt.clientId=${mqttCredentials.clientId}` : '',
      mqttCredentials.secret ? `--set mqtt.secret=${mqttCredentials.secret}` : '',
      mqttCredentials.telemetryChannel ? `--set mqtt.telemetryChannel=${mqttCredentials.telemetryChannel}` : '',
      mqttCredentials.commandChannel ? `--set mqtt.commandChannel=${mqttCredentials.commandChannel}` : '',
      '--wait --timeout 120s',
    ].filter(Boolean).join(' ');

    execSafe(helmArgs);

    // 4. Automatic HA Port-Forward
    startPortForward(slug, namespace, 8123);

    logger.info('Tenant HA deployed via Helm', { slug, namespace, releaseName });

    return {
      namespace,
      releaseName,
      url: `http://${slug}.${config.domain}:8123`,
      haCredentials: {
        username: config.haUsername,
        password: tenantHaPassword,
      },
    };
  } catch (err) {
    logger.warn('Kubernetes/Helm deployment failed, trying Docker fallback', { slug, error: err.message });
    return deployTenantDockerFallback(slug, haPasswordHash, tenantHaPassword);
  }
}

// Fallback to local Docker container when Kubernetes/Helm is not running
function deployTenantDockerFallback(slug, haPasswordHash, tenantHaPassword = config.getTenantHaPassword(slug)) {
  const containerName = `ha-${slug}`;
  const localPort = 8123;

  try {
    execSync('docker --version', { stdio: 'ignore' });

    // Clean up any stale container with the same name
    try { execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' }); } catch (_) {}

    // Start Home Assistant container via Docker
    execSync(`docker run -d --name ${containerName} -p ${localPort}:8123 -e TZ=UTC ghcr.io/home-assistant/home-assistant:${config.haImageTag}`, {
      stdio: 'ignore',
      timeout: 30000,
    });

    logger.info('Tenant HA deployed via Docker fallback', { slug, containerName, port: localPort });

    return {
      namespace: `docker-${slug}`,
      releaseName: containerName,
      url: `http://localhost:${localPort}`,
      haCredentials: {
        username: config.haUsername,
        password: tenantHaPassword,
      },
    };
  } catch (dockerErr) {
    logger.error('Docker fallback also failed', { slug, error: dockerErr.message });
    return {
      namespace: `tenant-${slug}`,
      releaseName: `ha-${slug}`,
      url: `http://${slug}.${config.domain}:8123`,
      status: 'deployment_pending',
      haCredentials: {
        username: config.haUsername,
        password: tenantHaPassword,
      },
    };
  }
}

// Delete a tenant's HA deployment and namespace
function deleteTenant(slug) {
  const namespace = `tenant-${slug}`;
  const releaseName = `ha-${slug}`;

  // Terminate port forward if running
  if (activePortForwards.has(slug)) {
    try { activePortForwards.get(slug).kill(); } catch (_) {}
    activePortForwards.delete(slug);
  }

  // Remove Docker container if deployed via fallback
  try { execSync(`docker rm -f ha-${slug}`, { stdio: 'ignore' }); } catch (_) {}

  try {
    execSafe(`helm uninstall ${releaseName} --namespace ${namespace}`);
    execSafe(`kubectl delete namespace ${namespace}`);
    logger.info('Tenant HA deleted', { slug, namespace });
  } catch (err) {
    logger.warn('Failed to delete tenant via Helm/K8s (may have been Docker fallback)', { slug, error: err.message });
  }
}

// Safe exec wrapper with logging
function execSafe(cmd) {
  logger.info('Executing', { cmd: cmd.replace(/secret=[^\s]+/g, 'secret=[REDACTED]') });
  try {
    const output = execSync(cmd, { encoding: 'utf8', timeout: 180000 });
    return output.trim();
  } catch (err) {
    logger.error('Command failed', { cmd: cmd.replace(/secret=[^\s]+/g, 'secret=[REDACTED]'), stderr: err.stderr });
    throw new Error(`kubectl/helm command failed: ${err.stderr || err.message}`);
  }
}

module.exports = { deployTenant, deleteTenant };
