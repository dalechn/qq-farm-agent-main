FROM node:22-alpine

# 安装 pnpm
RUN npm install -g pnpm

WORKDIR /app

# 复制依赖文件
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/

# 安装依赖
RUN pnpm install --frozen-lockfile || pnpm install

# 生成 Prisma Client
RUN npx prisma generate

# 复制源代码
COPY . .

# 构建
RUN pnpm build

# 暴露端口
EXPOSE 3001

# 启动命令
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
