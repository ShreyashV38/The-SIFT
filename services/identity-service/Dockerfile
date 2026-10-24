FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY packages/sift-common /packages/sift-common
COPY services/identity-service/package.json ./
RUN npm install --omit=dev
COPY services/identity-service/ ./

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY --from=builder /app /app
COPY --from=builder /packages/sift-common /packages/sift-common
EXPOSE 3001
ENV NODE_ENV=production
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD curl -sf http://localhost:3001/health || exit 1
CMD ["node", "src/index.js"]
