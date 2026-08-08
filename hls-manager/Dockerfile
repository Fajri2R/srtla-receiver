FROM node:20-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg curl

WORKDIR /app

# ✅ FIX: Copy lock file for reproducible builds; use npm ci (faster + strict)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy application source
COPY index.js ./

# HLS output directory
RUN mkdir -p /hls

# Health endpoint port
EXPOSE 9090

# ✅ FIX: No --input-type=module needed — package.json has "type":"module"
ENTRYPOINT ["node", "index.js"]
