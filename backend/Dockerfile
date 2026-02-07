# 使用轻量级的 Node.js 镜像
FROM node:22-alpine

# 安装 pnpm
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

# 复制依赖定义文件
COPY package.json pnpm-lock.yaml* ./
# 复制 Prisma Schema 以便生成 Client
COPY prisma ./prisma/

# 安装依赖
RUN pnpm install --frozen-lockfile || pnpm install

# 生成 Prisma Client
RUN npx prisma generate

# 复制所有源代码
COPY . .

# 执行编译（将 ts 转换为 dist 目录下的 js）
RUN pnpm build

# 暴露端口（游戏服 3001，认证服 3002）
EXPOSE 3001 3002

# 使用 Shell 脚本逻辑根据 SERVICE_NAME 启动对应的服务
# 1. 运行 prisma db push 确保数据库结构同步
# 2. 根据环境变量判断启动游戏主服、认证服或 Worker
CMD ["sh", "-c", "npx prisma db push && \
    if [ \"$SERVICE_NAME\" = \"worker-logs\" ]; then \
        node dist/worker-logs.js; \
    elif [ \"$SERVICE_NAME\" = \"worker-sync\" ]; then \
        node dist/worker-sync.js; \
    else \
        node dist/index.js; \
    fi"]