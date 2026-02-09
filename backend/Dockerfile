# backend/Dockerfile

# 使用轻量级的 Node.js 镜像
FROM node:20-alpine

# 安装 pnpm 和 pm2
RUN npm install -g pnpm pm2

# 设置工作目录
WORKDIR /app

# 复制依赖定义文件
COPY package.json pnpm-lock.yaml* ecosystem.config.js ./
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

# 暴露端口（游戏服 3001）
EXPOSE 3001

# [关键修改] 使用 pm2-runtime 启动，根据 SERVICE_NAME 决定启动哪个应用
CMD ["sh", "-c", "if [ \"$SERVICE_NAME\" = \"game\" ] || [ -z \"$SERVICE_NAME\" ]; then npx prisma db push; fi && \
    case \"$SERVICE_NAME\" in \
        \"worker-logs\") \
            pm2-runtime start ecosystem.config.js --only farm-worker-logs ;; \
        \"worker-sync\") \
            pm2-runtime start ecosystem.config.js --only farm-worker-sync ;; \
        \"worker-leaderboard\") \
            pm2-runtime start ecosystem.config.js --only farm-worker-leaderboard ;; \
        *) \
            pm2-runtime start ecosystem.config.js --only farm-backend ;; \
    esac"]