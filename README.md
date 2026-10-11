# SIFT — Scalable Isolated Framework for Things

A multi-tenant IoT smart-home platform built on K3s, Magistrala, Home Assistant, and ThingsBoard.

## Quick Start

See [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) for the full living document.

## Architecture

- **Identity node**: K3s server, Traefik, Magistrala (device identity + MQTT)
- **Worker node**: ThingsBoard CE, per-tenant Home Assistant pods, Provisioning API, tb-bridge

## Repo Layout

```
sift/
  docs/               Living document, measurements, demo script
  cluster/            k3d config, namespaces, priority classes, network policies
  deploy/             Kubernetes manifests and Helm charts
    magistrala/       Magistrala values + notes
    thingsboard/      ThingsBoard manifests
    ha-tenant/        Home Assistant tenant Helm chart (custom)
    provisioning/     Provisioning API K8s manifests
    tb-bridge/        tb-bridge K8s manifests
    aws/              AWS deployment overlays
  services/           Application source code
    provisioning-api/ Node.js + Express + SQLite
    tb-bridge/        Node.js MQTT bridge
  tools/              Simulator, test scripts, ESP32 example
```

## Branch

All work is on the `build` branch.

## Status

See the status board in [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md#0-status-board).
