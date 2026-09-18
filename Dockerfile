FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for prisma)
RUN npm install

# Copy source code and prisma schema
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Final production image
FROM node:20-alpine

WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

COPY package*.json ./
# Install production dependencies only
RUN npm ci --omit=dev

# Copy generated prisma client
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy app source code and prisma directory (for migrations)
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma

# Expose port
EXPOSE 3001

# Start command
CMD ["npm", "start"]
