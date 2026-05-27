# Base alpine image with Node.js 20
FROM node:20-alpine

# Set non-interactive and production environments
ENV NODE_ENV=production
WORKDIR /app

# Copy dependency configs
COPY package*.json ./

# Install ALL dependencies (including devDependencies like tsx to execute typescript server natively)
RUN npm ci --include=dev

# Copy server files and local Typescript types
COPY server/ ./server/
COPY src/types/ ./src/types/
COPY tsconfig.json ./

# Expose HTTP & Socket.IO signaling port (3001)
EXPOSE 3001

# Run the Node.js TypeScript server directly using high-performance tsx
CMD ["npx", "tsx", "server/index.ts"]
