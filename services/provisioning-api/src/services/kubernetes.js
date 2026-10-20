// ---------------------------------------------------------------------------
// CloudNest — Kubernetes Deployment Service
// ---------------------------------------------------------------------------
// Deploys per-tenant Home Assistant instances using kubectl/helm.
// FR-03: isolated HA instance per tenant in a dedicated namespace
// with NetworkPolicy, ResourceQuota, LimitRange, restricted SA, PSS.
//
// In production this would use the K8s client library; for the demo we
// shell out to kubectl/helm which are available in the provisioning pod.
// ---------------------------------------------------------------------------

const { execSync } = require('child_process');
const path = require('path');
const bcrypt = require('bcrypt');
const config = require('../config');
const logger = require('../logger');

const HELM_CHART_PATH = process.env.HA_HELM_CHART_PATH || '/app/charts/ha-tenant';

// Deploy a Home Assistant instance for a tenant (FR-03)
function deployTenant(slug, mqttCredentials) {
  const namespace = `tenant-${slug}`;
  const releaseName = `ha-${slug}`;

  try {
    // 1. Create namespace with Pod Security Standard label
    execSafe(`kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`);
    execSafe(`kubectl label namespace ${namespace} pod-security.kubernetes.io/enforce=baseline --overwrite`);
    execSafe(`kubectl label namespace ${namespace} app.kubernetes.io/part-of=cloudnest --overwrite`);

    // 2. Precompute bcrypt hash of HA password for seeding Home Assistant auth
    const haPasswordHash = bcrypt.hashSync(config.haPassword, 10);

    // 3. Deploy via Helm with tenant-specific values
    const helmArgs = [
      `helm upgrade --install ${releaseName} ${HELM_CHART_PATH}`,
      `--namespace ${namespace}`,
      `--set tenant.slug=${slug}`,
      `--set tenant.domain=${config.domain}`,
      `--set homeAssistant.image.tag=${config.haImageTag}`,
      `--set mqtt.host=magistrala-mqtt.platform.svc.cluster.local`,
      `--set mqtt.port=1883`,
      `--set haAuth.username=${config.haUsername}`,
      `--set haAuth.password=${config.haPassword}`,
      `--set haAuth.passwordHash="${haPasswordHash}"`,
      mqttCredentials.clientId ? `--set mqtt.clientId=${mqttCredentials.clientId}` : '',
      mqttCredentials.secret ? `--set mqtt.secret=${mqttCredentials.secret}` : '',
      mqttCredentials.telemetryChannel ? `--set mqtt.telemetryChannel=${mqttCredentials.telemetryChannel}` : '',
      mqttCredentials.commandChannel ? `--set mqtt.commandChannel=${mqttCredentials.commandChannel}` : '',
      '--wait --timeout 120s',
    ].filter(Boolean).join(' ');

    execSafe(helmArgs);

    logger.info('Tenant HA deployed', { slug, namespace, releaseName });

    return {
      namespace,
      releaseName,
      url: `http://${slug}.${config.domain}:8123`,
      haCredentials: {
        username: config.haUsername,
        password: config.haPassword,
      },
    };
  } catch (err) {
    logger.error('Failed to deploy tenant', { slug, error: err.message });
    throw err;
  }
}

// Delete a tenant's HA deployment and namespace
function deleteTenant(slug) {
  const namespace = `tenant-${slug}`;
  const releaseName = `ha-${slug}`;

  try {
    execSafe(`helm uninstall ${releaseName} --namespace ${namespace}`);
    execSafe(`kubectl delete namespace ${namespace}`);
    logger.info('Tenant HA deleted', { slug, namespace });
  } catch (err) {
    logger.error('Failed to delete tenant', { slug, error: err.message });
    throw err;
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
