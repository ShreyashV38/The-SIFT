FROM node:20-alpine AS builder
WORKDIR /app/services/identity-service
RUN apk add --no-cache python3 make g++
COPY packages/sift-common /app/packages/sift-common
RUN cd /app/packages/sift-common && npm install --omit=dev
COPY services/identity-service/package*.json ./
RUN npm install --omit=dev
COPY services/identity-service/ ./

FROM node:20-alpine
WORKDIR /app/services/identity-service
RUN apk add --no-cache curl
COPY --from=builder /app /app
EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD curl -sf http://localhost:3001/health || exit 1
CMD ["node", "src/index.js"]
