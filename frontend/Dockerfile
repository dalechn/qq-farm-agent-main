# 使用 node 22-alpine 作为基础镜像
FROM node:22-alpine AS builder

# 安装 pnpm
RUN npm install -g pnpm

WORKDIR /app

# 复制依赖定义文件
COPY package.json pnpm-lock.yaml* ./

# 关键修正：必须在安装依赖前复制 patches 目录，否则 pnpm 会因找不到补丁文件而报错
COPY patches ./patches

# 安装依赖
# 如果 frozen-lockfile 失败，则尝试普通安装
RUN pnpm install --frozen-lockfile || pnpm install

# 复制所有源代码
COPY . .

# ==================== 新增部分开始 ====================
# 声明构建参数（接收来自 docker-compose 的 args）
ARG VITE_API_URL
# 将其设置为环境变量，以便 vite build 能读取到
ENV VITE_API_URL=$VITE_API_URL
# ==================== 新增部分结束 ====================

# 执行构建脚本
RUN pnpm build

# 生产环境镜像
FROM node:22-alpine

# 在生产镜像中也安装 pnpm（如果运行时需要）
RUN npm install -g pnpm

WORKDIR /app

# 从构建阶段复制构建产物和必要的依赖
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# 暴露应用端口
EXPOSE 3000

# 启动应用
CMD ["node", "dist/index.js"]