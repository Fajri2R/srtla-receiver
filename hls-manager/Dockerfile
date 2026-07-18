FROM node:20-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install Node dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy application
COPY index.js ./

# HLS output directory
RUN mkdir -p /hls

ENTRYPOINT ["node", "--input-type=module", "index.js"]
