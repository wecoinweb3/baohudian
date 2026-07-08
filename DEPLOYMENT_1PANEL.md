# 保护垫在线设计器 1Panel 部署说明

> 适用场景：**前端已经部署完成**，现在只需要继续部署 **后端 API + SQLite 数据文件**。

---

## 1. 先说结论：你现在要部署什么？

当前项目不是纯前端项目，而是：

```txt
前端 React 页面
 +
Node.js Express 后端
 +
SQLite 文件数据库
```

其中：

- 前端：你已经部署好了
- 后端：需要在 1Panel 里新增一个 Node.js 运行环境
- 数据库：不是单独的 MySQL / PostgreSQL 服务，而是一个 SQLite 文件

数据库文件路径是：

```txt
data/design-projects.sqlite
```

所以你现在的重点不是“安装数据库服务”，而是：

1. 把 **后端跑起来**
2. 让 **SQLite 文件可读可写且不丢失**
3. 让前端域名的 **`/api` 代理到后端**

---

## 2. 你当前必须知道的事实

### 2.1 前端已经好，不代表项目已经可用

因为前端会请求：

```txt
/api/projects
```

这些接口来自后端：

```txt
api/server.ts
api/app.ts
api/routes/projects.ts
```

如果只部署前端，不部署后端，会出现：

- 历史项目加载失败
- 新建项目失败
- 保存项目失败
- 删除项目失败

### 2.2 当前数据库不是独立服务

当前项目保存历史项目使用的是本地 SQLite 文件，不需要在 1Panel 里再建一个 MySQL 实例。

它更像是：

```txt
Node.js 后端 + 本地数据文件
```

---

## 3. 从 GitHub 拉取完整源码到服务器

如果你服务器上现在只有前端 `dist/`，那还不够。

因为后端运行需要 `api/`、`package.json`、`data/` 等文件，所以你需要在服务器上从 GitHub 拉取**完整项目源码**。

建议把代码放到一个固定目录，例如：

```txt
/opt/1panel/www/baohudian
```

### 3.1 在 1Panel 哪里操作？

可以用下面任意一种方式：

#### 方式 A：1Panel 终端

进入：

```txt
主机 / 系统 -> 终端
```

然后执行下面的 Git 命令。

#### 方式 B：SSH 登录服务器

如果你习惯用 SSH，也可以本地终端登录服务器后执行：

```bash
ssh root@你的服务器IP
```

---

### 3.2 首次拉取代码

先创建目录：

```bash
mkdir -p /opt/1panel/www/baohudian
cd /opt/1panel/www/baohudian
```

如果目录是空的，直接 clone：

```bash
git clone 你的GitHub仓库地址 .
```

例如：

```bash
git clone https://github.com/你的用户名/你的仓库名.git .
```

注意最后有一个点 `.`，表示把仓库内容拉到当前目录，而不是再创建一层子目录。

---

### 3.3 如果目录不是空的怎么办？

如果 `/opt/1panel/www/baohudian` 里面已经有文件，`git clone ... .` 可能会失败。

这种情况下可以新建一个后端源码目录，例如：

```bash
mkdir -p /opt/1panel/www/baohudian-api
cd /opt/1panel/www/baohudian-api
git clone 你的GitHub仓库地址 .
```

然后 1Panel 的 Node.js 运行环境源码目录就选择：

```txt
/opt/1panel/www/baohudian-api
```

前端站点仍然可以继续使用原来的前端目录，不冲突。

---

### 3.4 拉取后确认文件是否完整

进入项目目录后执行：

```bash
ls
```

应该能看到：

这个目录下至少应包含：

```txt
package.json
package-lock.json
api/
src/
dist/
data/
```

重点是下面这些必须存在：

```txt
package.json
api/server.ts
api/app.ts
api/routes/projects.ts
data/
```

> 注意：前端站点部署可以只用 `dist/`，但后端运行环境不能只靠 `dist/`。

---

### 3.5 安装依赖

源码拉下来后，在项目根目录执行：

```bash
npm install
```

如果服务器访问 npm 比较慢，可以临时使用国内源：

```bash
npm install --registry=https://registry.npmmirror.com
```

---

### 3.6 后续更新代码

以后代码更新到 GitHub 后，服务器上进入项目目录执行：

```bash
cd /opt/1panel/www/baohudian
git pull
npm install
```

然后到 1Panel 里重启 Node.js 运行环境即可。

如果你的后端源码目录是：

```txt
/opt/1panel/www/baohudian-api
```

那就执行：

```bash
cd /opt/1panel/www/baohudian-api
git pull
npm install
```

---

### 3.7 如果 GitHub 是私有仓库

如果仓库是私有的，服务器直接 `git clone` 可能会提示没有权限。

常见处理方式有两种：

#### 方式 A：使用 GitHub Personal Access Token

clone 时使用：

```bash
git clone https://用户名:Token@github.com/用户名/仓库名.git .
```

注意：Token 不建议长期明文保存在命令历史里。

#### 方式 B：配置 SSH Key

在服务器生成 SSH Key：

```bash
ssh-keygen -t ed25519 -C "server-baohudian"
cat ~/.ssh/id_ed25519.pub
```

把输出的公钥添加到 GitHub 仓库或账号的 SSH Keys。

然后使用 SSH 地址拉取：

```bash
git clone git@github.com:用户名/仓库名.git .
```

---

## 4. 1Panel 中后端怎么创建

你现在的入口就是：

```txt
网站 -> 运行环境 -> Node.js -> 创建运行环境
```

下面按字段填写。

---

## 5. 创建运行环境时怎么填写

### 5.1 名称

建议填：

```txt
baohudian-api
```

---

### 5.2 应用

选择：

```txt
Node.js
```

---

### 5.3 版本

推荐：

```txt
20.x
```

如果没有 20，也优先选稳定版 22。

**不建议使用太新的版本**，比如截图里的 `25.x`。

---

### 5.4 源码目录

不要选根目录 `/`，应该选择你的项目根目录，例如：

```txt
/opt/1panel/www/baohudian
```

这个目录里应该能看到 `package.json`。

---

### 5.5 启动命令

建议打开：

```txt
自定义启动命令
```

优先填写：

```bash
npx tsx api/server.ts
```

如果依赖还没装，可以先进入终端手动执行：

```bash
npm install
```

然后启动命令只保留：

```bash
npx tsx api/server.ts
```

> 不建议把 `npm install && npx tsx api/server.ts` 作为长期启动命令，避免每次重启都重新装依赖。

---

### 5.6 应用端口

填写：

```txt
3001
```

因为当前项目后端代码写死使用：

```ts
const PORT = 3001;
```

文件位置：

```txt
api/server.ts
```

---

### 5.7 外部映射端口

建议填一个不冲突端口，比如：

```txt
13001
```

即：

- 应用端口：`3001`
- 外部映射端口：`13001`

---

### 5.8 端口外部访问

建议：

```txt
关闭
```

因为正常访问应该走你前端站点域名，再通过 `/api` 反向代理到后端。

不建议直接把后端端口暴露到公网。

---

### 5.9 包管理器

选择：

```txt
npm
```

---

### 5.10 容器名称

建议填：

```txt
baohudian-api
```

---

## 6. 创建后第一步：先装依赖

运行环境建好后，先进入终端，在项目根目录执行：

```bash
npm install
```

如果你已经安装过，也可以跳过。

建议再验证一下关键依赖：

```bash
npx tsx --version
```

---

## 7. 当前项目 SQLite 的关键坑

这是你部署时最容易踩坑的地方。

当前项目不是通过 Node 包直接连 SQLite，而是通过系统命令调用：

```ts
execFileSync('sqlite3', [dbPath, sql])
```

也就是说：

## 运行环境里必须能执行 `sqlite3`

否则后端虽然启动成功，但以下功能会失败：

- 新建项目
- 保存项目
- 获取历史项目
- 删除项目

---

## 8. 怎么检查 sqlite3 是否可用

进入 1Panel 运行环境终端，执行：

```bash
sqlite3 --version
```

### 情况 A：有版本号输出

说明环境正常，可以继续。

### 情况 B：提示命令不存在

说明当前 Node 运行环境镜像里没有 sqlite3，需要处理。

---

## 9. 如果 sqlite3 不存在怎么办

### 方案 1：在运行环境容器里安装 sqlite3

如果容器支持 `apt`：

```bash
apt update && apt install -y sqlite3
```

如果容器支持 `apk`：

```bash
apk add sqlite
```

装好后再次执行：

```bash
sqlite3 --version
```

> 注意：某些容器重建后，手工安装的软件会丢失。

### 方案 2：后续改代码，去掉对 sqlite3 命令的依赖

更稳妥的长期方案是，把项目改为使用 Node.js SQLite 库，例如：

- `better-sqlite3`
- `sqlite3`

这样就不需要容器里安装系统级 `sqlite3` 命令，更适合 1Panel / Docker 场景。

---

## 10. data 目录怎么处理

数据库文件保存在：

```txt
data/design-projects.sqlite
```

所以你必须保证项目目录下的 `data/`：

- 存在
- 有写权限
- 重启后不会丢失

建议在项目根目录执行：

```bash
mkdir -p data
chmod -R 755 data
```

如果运行环境启动后首次创建了：

```txt
data/design-projects.sqlite
```

说明数据库初始化成功了。

---

## 11. 如何验证后端是否启动成功

运行环境启动成功后，先看日志，正常会出现类似：

```txt
Server ready on port 3001
```

然后进入终端执行：

```bash
curl http://127.0.0.1:3001/api/health
```

预期返回：

```json
{"success":true,"message":"ok"}
```

再测试项目接口：

```bash
curl http://127.0.0.1:3001/api/projects
```

如果返回：

```json
{"projects":[]}
```

或已有项目列表，就说明后端与 SQLite 已经通了。

---

## 12. 前端已经部署好了，接下来要配反向代理

这一步非常关键。

因为前端代码里接口地址写的是：

```ts
const BASE_URL = '/api';
```

所以浏览器会请求：

```txt
https://你的域名/api/projects
```

你必须让前端站点把 `/api` 转发到后端运行环境。

---

## 13. 1Panel 站点里如何配置 `/api` 代理

进入：

```txt
网站 -> 你的前端站点 -> 反向代理
```

新增一条代理。

### 代理 1：API

- 代理目录：

```txt
/api
```

- 目标地址：

如果你映射端口是 `13001`，则填写：

```txt
http://127.0.0.1:13001
```

不要写成 `/api/projects`，就写 `/api` 即可。

这样这些接口都会自动转发：

- `/api/projects`
- `/api/materials`
- `/api/prompts`
- `/api/generate`

---

### 代理 2：上传文件（建议一起配）

因为项目里还有上传资源访问路径，建议再加一条：

- 代理目录：

```txt
/uploads
```

- 目标地址：

```txt
http://127.0.0.1:13001
```

---

## 14. 你现在最推荐的操作顺序

### 第一步：从 GitHub 拉取完整源码

确保后端运行环境使用的是完整项目目录，而不是只有前端 `dist/`。

示例：

```bash
mkdir -p /opt/1panel/www/baohudian-api
cd /opt/1panel/www/baohudian-api
git clone 你的GitHub仓库地址 .
npm install
```

### 第二步：创建 Node.js 运行环境

建议参数：

- 名称：`baohudian-api`
- Node 版本：`20.x`
- 源码目录：项目根目录
- 启动命令：`npx tsx api/server.ts`
- 应用端口：`3001`
- 外部映射端口：`13001`
- 端口外部访问：关闭

### 第三步：在终端执行依赖安装

```bash
npm install
```

### 第四步：检查 sqlite3

```bash
sqlite3 --version
```

### 第五步：检查健康接口

```bash
curl http://127.0.0.1:3001/api/health
```

### 第六步：站点配置反向代理

- `/api` -> `http://127.0.0.1:13001`
- `/uploads` -> `http://127.0.0.1:13001`

### 第七步：浏览器验证

打开前端站点后，测试：

- 新建项目
- 保存项目
- 切换历史项目
- 删除项目

只要这些功能正常，就说明后端和数据库都已经部署成功。

---

## 15. 常见问题排查

### 问题 1：前端能打开，但保存项目报错

优先检查：

1. `/api` 反向代理是否配置正确
2. 后端运行环境是否成功启动
3. `sqlite3 --version` 是否可用
4. `data/` 是否存在且可写

---

### 问题 2：接口 404

通常原因：

- 后端没启动
- 前端站点没配置 `/api` 代理
- 代理目标地址端口写错

---

### 问题 3：项目列表读取失败

优先检查：

- `data/design-projects.sqlite` 是否生成
- 容器里是否有 `sqlite3`
- 后端日志中是否有数据库报错

---

### 问题 4：重启后历史项目丢失

通常原因：

- `data/` 目录没有持久化
- 项目目录被重新覆盖
- 容器重建后数据没保留

---

## 16. 当前最适合你的理解方式

如果用 1Panel，你可以把当前项目理解成：

### 前端

已经完成部署。

### 后端

在 1Panel 里新建一个 Node.js 运行环境，跑：

```bash
npx tsx api/server.ts
```

### 数据库

不需要单独建数据库实例，保住这个文件就行：

```txt
data/design-projects.sqlite
```

### 联通方式

前端域名通过反向代理把：

```txt
/api
/uploads
```

转给后端运行环境。

---

## 17. 我给你的建议

如果你接下来真的准备在 1Panel 上一步步操作，我建议你按下面顺序来：

1. 先创建 Node.js 运行环境
2. 先不要急着配站点代理
3. 先在运行环境终端里验证：
   - `npm install`
   - `sqlite3 --version`
   - `curl http://127.0.0.1:3001/api/health`
4. 确认后端没问题后，再回前端站点配 `/api`

这样排错最简单。

如果你愿意，下一步你可以把 **1Panel 运行环境创建完成后的截图**、**启动日志** 或者 **反向代理配置截图** 发我，我可以继续帮你逐项核对。 
