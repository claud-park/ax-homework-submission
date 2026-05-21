# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Builder
# ============================================
FROM oven/bun:1 AS builder
WORKDIR /app

# 빌드 타임 ARG (NEXT_PUBLIC_*만 빌드 시점 치환됨)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# 의존성 (lockfile 먼저 → 캐시 적중률 ↑)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 소스 + 빌드 (standalone 출력)
COPY . .
# public 디렉터리가 없으면 Docker COPY 오류 방지
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun --bun next build

# ============================================
# Stage 2: Runner (slim)
# ============================================
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone 산출물 + static + public 복사
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

# standalone server.js는 PORT/HOSTNAME env 인식
CMD ["bun", "server.js"]
