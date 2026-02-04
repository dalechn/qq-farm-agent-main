# Next.js + Tailwind CSS 示例项目

这是一个使用 [Next.js](https://nextjs.org) 和 [Tailwind CSS](https://tailwindcss.com) 创建的现代化Web应用示例项目。

## 技术栈

- **Next.js 16** - React的全栈框架
- **React 19** - 用户界面库
- **TypeScript** - 类型安全的JavaScript
- **Tailwind CSS 4** - 实用优先的CSS框架
- **ESLint** - 代码质量检查

## 项目结构

```
firstnext/
├── src/
│   └── app/
│       ├── layout.tsx      # 根布局组件
│       ├── page.tsx        # 首页组件
│       └── globals.css     # 全局样式
├── public/                 # 静态资源
├── package.json           # 项目配置和依赖
├── tsconfig.json          # TypeScript配置
├── next.config.ts         # Next.js配置
├── postcss.config.mjs     # PostCSS配置
└── eslint.config.mjs      # ESLint配置
```

## 开始使用

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

打开浏览器访问 [http://localhost:3000](http://localhost:3000) 查看结果。

### 构建生产版本

```bash
npm run build
npm start
```

### 代码检查

```bash
npm run lint
```

## 主要特性

- ⚡ **快速开发** - Next.js App Router提供优秀的开发体验
- 🎨 **现代化样式** - Tailwind CSS v4 提供强大的样式系统
- 📱 **响应式设计** - 内置移动端适配
- 🔒 **类型安全** - TypeScript提供完整的类型检查
- 🚀 **性能优化** - 自动代码分割和优化

## 自定义样式

项目使用 Tailwind CSS v4，你可以通过以下方式自定义：

1. 在组件中使用 Tailwind 类名
2. 修改 `src/app/globals.css` 中的主题变量
3. 扩展 Tailwind 配置（如果需要）

## 部署

推荐在 [Vercel](https://vercel.com) 上部署，这是 Next.js 官方推荐的平台：

1. 推送代码到 GitHub
2. 在 Vercel 中导入项目
3. 自动部署完成

你也可以查看 [Next.js 部署文档](https://nextjs.org/docs/app/building-your-application/deploying) 了解更多选项。

## 学习资源

- [Next.js 官方文档](https://nextjs.org/docs)
- [Next.js 学习教程](https://nextjs.org/learn)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)

## 许可证

本项目基于 MIT 许可证开源。
