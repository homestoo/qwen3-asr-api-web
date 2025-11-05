# 使用官方Node.js运行时作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制所有项目文件
COPY . .

# 创建uploads目录用于文件上传
RUN mkdir -p uploads

# 暴露端口
EXPOSE 8888

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=8888

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8888/healthz', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# 启动应用
CMD ["npm", "start"]