FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json tsconfig.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY src ./src

# Build TypeScript code
RUN npm run build

# Expose port
EXPOSE 3002

# Start the server
CMD ["npm", "start"]
