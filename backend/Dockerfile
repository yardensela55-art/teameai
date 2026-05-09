FROM node:20-alpine
WORKDIR /app

# OpenSSL is required by Prisma
RUN apk add --no-cache openssl

# Install all deps (dev deps needed for tsc)
COPY package*.json ./
RUN npm ci

# Generate Prisma client before build
COPY prisma ./prisma
RUN npx prisma generate

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 3001

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
