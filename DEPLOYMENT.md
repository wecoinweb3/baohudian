# 保护垫在线设计器部署文档

## 1. 当前项目是否用到后端？

当前项目 **有用到后端**，不是纯前端项目。

目前项目由三部分组成：

1. **前端 Web 应用**
   - 技术栈：React + Vite + TypeScript + Tailwind CSS
   - 构建产物目录：`dist/`
   - 主要页面：工作台画布编辑器

2. **Node.js 后端 API 服务**
   - 技术栈：Express
   - 本地启动入口：`api/server.ts`
   - Vercel Serverless 入口：`api/index.ts`
   - 默认监听端口：`3001`

3. **SQLite 文件数据库**
   - 数据库文件：`data/design-projects.sqlite`
   - 主要用于保存历史设计项目、画布尺寸、画布元素、背景色等项目数据

因此部署到云服务器时，建议按“前端静态站点 + Node 后端 API + SQLite 持久化文件”的方式部署。

---

## 2. 当前前后端关系

前端接口统一请求：

```ts
const BASE_URL = '/api';
```

也就是说，浏览器访问接口时会请求当前域名下的 `/api/*`。

例如：

```txt
GET    /api/projects
POST   /api/projects
PUT    /api/projects/:id
DELETE /api/projects/:id
```

本地开发时，Vite 通过 `vite.config.ts` 把 `/api` 代理到后端：

```ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3001'
    }
  }
}
```

线上部署时，需要用 Nginx 或其他网关把：

- `/` 指向前端 `dist/`
- `/api/` 反向代理到 Node.js 后端服务 `http://127.0.0.1:3001`
- `/uploads/` 反向代理或静态映射到后端上传目录

---

## 3. SQLite 使用说明

当前项目的历史项目保存功能依赖 SQLite。

代码位置：

```txt
api/routes/projects.ts
```

数据库文件路径：

```txt
data/design-projects.sqlite
```

后端会在启动时自动创建数据目录和表：

```ts
CREATE TABLE IF NOT EXISTS projects (...)
```

但当前实现是通过系统命令调用 `sqlite3`：

```ts
execFileSync('sqlite3', [dbPath, sql])
```

所以云服务器必须安装 `sqlite3` 命令行工具。

### Ubuntu / Debian 安装 SQLite

```bash
sudo apt update
sudo apt install -y sqlite3
sqlite3 --version
```

### 数据持久化注意事项

`data/design-projects.sqlite` 是业务数据文件，部署时必须注意：

- 不要在每次发布时覆盖 `data/` 目录
- 建议定期备份 `data/design-projects.sqlite`
- 如果使用 Docker，必须把 `data/` 挂载为 volume
- 如果使用 Vercel 等 Serverless 平台，不建议继续使用本地 SQLite 文件保存生产数据，因为 Serverless 文件系统通常不可持久化

---

## 4. 推荐云服务器部署方案

推荐使用普通 Linux 云服务器部署，例如：

- 阿里云 ECS
- 腾讯云 CVM
- 华为云 ECS
- AWS EC2
- 任意 Ubuntu 服务器

推荐架构：

```txt
用户浏览器
   |
   | HTTPS
   v
Nginx
   |-- /        -> 前端 dist 静态文件
   |-- /api/    -> Node.js Express 后端 127.0.0.1:3001
   |-- /uploads/-> Node.js Express 后端或静态上传目录
   |
Node.js 后端
   |
SQLite 文件 data/design-projects.sqlite
```

---

## 5. 服务器环境要求

建议版本：

- Node.js：`>= 20`
- npm：随 Node 安装
- sqlite3：系统命令行工具
- Nginx：用于静态文件托管和反向代理
- PM2：用于后台运行 Node.js 服务

安装示例：

```bash
sudo apt update
sudo apt install -y nginx sqlite3 git curl

# 安装 Node.js 20，以 NodeSource 为例
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 PM2
sudo npm install -g pm2
```

检查版本：

```bash
node -v
npm -v
sqlite3 --version
nginx -v
pm2 -v
```

---

## 6. 拉取项目代码

示例部署目录：

```bash
sudo mkdir -p /var/www/baohudian
sudo chown -R $USER:$USER /var/www/baohudian
cd /var/www/baohudian
```

拉取代码：

```bash
git clone https://github.com/wecoinweb3/baohudian.git .
```

安装依赖：

```bash
npm install
```

---

## 7. 构建前端

执行：

```bash
npm run build
```

构建成功后会生成：

```txt
dist/
```

该目录用于 Nginx 静态托管。

---

## 8. 启动后端 API 服务

当前后端本地入口是：

```txt
api/server.ts
```

默认监听端口：

```txt
3001
```

### 使用 PM2 启动

因为项目使用 TypeScript 后端入口，可以直接用本地依赖中的 `tsx` 启动：

```bash
pm2 start "npx tsx api/server.ts" --name baohudian-api
```

查看状态：

```bash
pm2 status
pm2 logs baohudian-api
```

设置开机自启：

```bash
pm2 save
pm2 startup
```

根据 `pm2 startup` 输出的命令再执行一次即可。

### 验证后端

```bash
curl http://127.0.0.1:3001/api/health
```

预期返回：

```json
{
  "success": true,
  "message": "ok"
}
```

---

## 9. Nginx 配置

新增 Nginx 配置：

```bash
sudo nano /etc/nginx/sites-available/baohudian
```

示例配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/baohudian/dist;
    index index.html;

    client_max_body_size 20m;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/baohudian /etc/nginx/sites-enabled/baohudian
sudo nginx -t
sudo systemctl reload nginx
```

访问：

```txt
http://your-domain.com
```

---

## 10. HTTPS 配置

如果域名已经解析到服务器，可以使用 Certbot 申请免费证书：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

证书自动续期检查：

```bash
sudo certbot renew --dry-run
```

---

## 11. 发布更新流程

以后更新代码时，在服务器执行：

```bash
cd /var/www/baohudian
git pull
npm install
npm run build
pm2 restart baohudian-api
```

如果只改前端，也可以只执行：

```bash
git pull
npm install
npm run build
```

如果只改后端接口：

```bash
git pull
npm install
pm2 restart baohudian-api
```

---

## 12. 数据备份

建议定期备份 SQLite 文件：

```bash
mkdir -p /var/backups/baohudian
cp /var/www/baohudian/data/design-projects.sqlite /var/backups/baohudian/design-projects-$(date +%F-%H%M%S).sqlite
```

可以加入 crontab 每天备份一次：

```bash
crontab -e
```

加入：

```cron
0 2 * * * mkdir -p /var/backups/baohudian && cp /var/www/baohudian/data/design-projects.sqlite /var/backups/baohudian/design-projects-$(date +\%F-\%H\%M\%S).sqlite
```

---

## 13. 当前项目的部署结论

### 是否只有前端和数据库？

不是。

准确来说当前是：

```txt
前端 React 页面
  +
Node.js Express 后端 API
  +
SQLite 文件数据库
```

前端不能直接安全、稳定地操作服务器上的 SQLite 文件，因此历史项目的保存、读取、删除需要通过后端 API 完成。

### 为什么必须部署后端？

因为当前工作台会调用：

```txt
/api/projects
```

这些接口由 `api/routes/projects.ts` 提供，负责读写 `data/design-projects.sqlite`。

如果只部署 `dist/` 前端静态文件，不部署后端，则会出现：

- 历史项目加载失败
- 新建项目失败
- 保存项目失败
- 删除项目失败

### 当前最适合的部署方式

推荐：

```txt
云服务器 + Nginx + PM2 + Node.js + SQLite
```

暂不推荐把当前 SQLite 版本直接部署到纯 Serverless 平台作为正式生产环境，除非后续把数据库换成：

- 云数据库 PostgreSQL / MySQL
- Turso / LibSQL
- Supabase
- Neon
- 其他支持持久化的数据库服务

---

## 14. 后续优化建议

上线前建议处理以下事项：

1. `.env` 不应提交到 Git 仓库
2. `data/*.sqlite` 建议加入 `.gitignore`，生产数据通过服务器持久化保存
3. 后端 SQLite 当前通过拼接 SQL 实现，后续建议改成参数化查询，避免 SQL 注入风险
4. 删除项目等危险操作也建议使用自定义弹窗替代系统确认框
5. 如果多人同时编辑，SQLite 和当前接口需要增加并发和权限设计
6. 如果后期增加 AI 抠图，应把大模型接口放在后端，不要在前端暴露密钥
