FROM node:20-alpine AS builder

WORKDIR /app/services/provisioning-api

RUN apk add --no-cache python3 make g++

COPY packages/sift-common /app/packages/sift-common
RUN cd /app/packages/sift-common && npm install --omit=dev

COPY services/identity-service /app/services/identity-service
RUN cd /app/services/identity-service && npm install --omit=dev

COPY services/iot-broker-service /app/services/iot-broker-service
RUN cd /app/services/iot-broker-service && npm install --omit=dev

COPY services/provisioning-api/package*.json ./
RUN npm install --omit=dev

COPY services/provisioning-api/ ./

FROM node:20-alpine

WORKDIR /app/services/provisioning-api

# Install curl, bash, openssl, kubectl, and helm CLI binary in runtime stage
RUN apk add --no-cache curl bash openssl tar \
    && curl -fsSL "https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl" -o /usr/local/bin/kubectl \
    && chmod +x /usr/local/bin/kubectl \
    && curl -fsSL "https://get.helm.sh/helm-v3.15.4-linux-amd64.tar.gz" | tar -xzO linux-amd64/helm > /usr/local/bin/helm \
    && chmod +x /usr/local/bin/helm

COPY --from=builder /app /app
COPY deploy/ha-tenant /app/charts/ha-tenant
COPY cluster /app/cluster

EXPOSE 3000 8081

ENV NODE_ENV=production
ENV DB_PATH=/data/cloudnest.db
ENV HA_HELM_CHART_PATH=/app/charts/ha-tenant

VOLUME ["/data"]

HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD curl -sf http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
