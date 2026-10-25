FROM node:20-alpine

WORKDIR /app

# Support building from either the repo root context (-f services/tb-bridge/Dockerfile .)
# or the service directory context (services/tb-bridge)
COPY . /ctx
RUN if [ -f /ctx/services/tb-bridge/package.json ]; then \
      cp -r /ctx/services/tb-bridge/* /app/ && rm -rf /app/node_modules; \
    else \
      cp -r /ctx/* /app/ && rm -rf /app/node_modules; \
    fi \
    && rm -rf /ctx \
    && npm install --omit=dev --workspaces=false

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
