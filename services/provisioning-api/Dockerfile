FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

FROM node:20-alpine

WORKDIR /app

# Install curl, kubectl, and helm for cluster operations
RUN apk add --no-cache curl bash \
    && curl -LO "https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl" \
    && chmod +x kubectl \
    && mv kubectl /usr/local/bin/ \
    && curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 \
    && chmod 700 get_helm.sh \
    && ./get_helm.sh \
    && rm get_helm.sh

COPY --from=builder /app /app

EXPOSE 3000

ENV NODE_ENV=production
ENV DB_PATH=/data/cloudnest.db

VOLUME ["/data"]

CMD ["node", "src/index.js"]
