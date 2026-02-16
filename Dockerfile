FROM node:20-slim

WORKDIR /app

# Install dependencies for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source code and public assets
COPY src/ ./src/
COPY tsconfig.json ./
COPY public/ ./public/
COPY TECHNICAL_BLOG.html ./

# Create data directory for SQLite
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/forwardcheck.db
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
