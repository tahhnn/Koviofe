# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package lock and configurations
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for Next.js build
# These need to be present at build time for client-side injection
ENV NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_CENTRIFUGO_URL=/centrifugo

RUN pnpm run build

# Stage 3: Runner stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV UPLOAD_DIR=/app/uploads

# Copy output files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Runtime uploads (persisted via docker volume)
RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["npm", "start"]
