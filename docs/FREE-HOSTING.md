# 完全免费部署与迁移

核对日期：2026-10-15。当前版本使用普通 Node.js + WebSocket 房间服务，前端为 React 静态文件；不需要 Cloudflare Durable Objects、D1 或任何付费数据库。

## 推荐：一个 Render Free 服务

仓库根目录的 `render.yaml` 已固定 `plan: free`，同一个服务同时提供页面、图片和房间后端。无需先配置 Cloudflare，也无需单独购买域名。

1. 使用你的 Render 账号连接 GitHub，选择 `Tzy0701/NasiLemak`，分支为 `claude/nasi-lemak-online-game-k1qte5`。
2. 使用 Blueprint 导入根目录 `render.yaml`；也可以手动创建 **Web Service / Node / Free**。
3. 构建命令：`npm ci --include=dev && npm run build`。
4. 启动命令：`npm start`。健康检查：`/api/health`。端口使用平台提供的 `PORT`。
5. 同域部署时 `ALLOWED_ORIGINS` 留空，`VITE_API_URL` 也留空。
6. 使用 Render 分配的免费 `https://…onrender.com` 地址开房，分享新的房间链接。

Render 连接可用于检查部署和配置；首次连接服务与 GitHub 仓库的授权需要由账号持有人完成。仓库中的部署配置不代表服务已经上线。

## 免费边界

- Render Free 在 15 分钟没有入站 HTTP 或 WebSocket 消息后休眠，下一次连接通常需要约一分钟唤醒。
- 平台重启、休眠或重新部署会丢失临时文件。**房间、进行中的手牌、待选小偷和本桌战绩可能随之消失，需要重新开局。** 不提供永久存档承诺。
- 游戏自身在全体真人离线后暂停，最多保留 30 分钟；平台休眠或重启可能让这段时间提前结束。服务器仍在线且文件保留时，短暂断线、刷新和普通进程重启可以恢复原座位、手牌和待选项。
- 每个工作区每月共享 750 个免费实例小时，另有带宽和构建额度。不要为本项目附加付费磁盘、数据库、额外实例或付费套餐。
- 为严格保持零费用，使用没有付款方式的免费工作区；官方文档说明，相关额度耗尽时将暂停服务或构建。已有付款方式的工作区可能对额外带宽或构建收费，应先检查其计费设置，不能仅凭 `plan: free` 就承诺账号账单为零。
- 不设置自动保活或周期性唤醒任务；游戏无人时允许服务休眠。

来源：[Render Free](https://render.com/docs/free)、[Render WebSocket](https://render.com/docs/websocket)。这些是托管平台规则，不是本地测试能够验证的上线结果。

## 可选：Cloudflare Pages 托管静态前端

前端可以单独使用 Pages Free，让图片由其分发；房间服务仍使用上述 Render Free 服务。

1. Pages 的构建命令用 `npm ci --include=dev && npm run build`，输出目录 `dist/client`，无需 Pages Functions 或 DO 绑定。
2. Pages 构建环境设置 `VITE_API_URL=https://你的后端.onrender.com`，值仅为后端网址，不包含 `/api`；这是公开地址，不是密钥。
3. Render 服务设置 `ALLOWED_ORIGINS=https://你的前端.pages.dev`。多个来源以逗号分隔，必须填写准确来源，不包含路径。
4. `public/_redirects` 会让 `/r/房间号` 返回应用。二维码与邀请链接会使用当前前端网址。
5. 换后端地址后需要重新构建前端。原 Cloudflare Worker 的正在进行房间不会自动迁移到 Node.js，新入口需要重新开房。

来源：[Pages Free 限制](https://developers.cloudflare.com/pages/platform/limits/)。仅使用静态托管；本项目未部署 Pages Functions。

## 本地运行与存储

```sh
npm ci
npm run dev
```

开发界面在 `http://localhost:5173`，代理到本机 `8790` 的房间服务。

```sh
npm run build
npm start
```

生产构建本地在 `http://localhost:8790`。房间默认存于 `.room-data`，每个房间一个原子替换的 JSON 文件；包含服务器私有手牌与 token 哈希，不应放到静态目录、上传 Git 或公开分享。`ROOM_STORE_PATH` 可指定目录，`:memory:` 则仅在内存保存。

本实现使用单个进程，每个房间串行处理消息，只有一个下一事件计时器。无需数据库计量，也不代表资源无限；默认同时最多 300 个保留房间，并有连接数、请求大小和消息频率限制。

## 上线核对与回退

1. 新地址的 `/api/health` 应显示 `backend: node`。
2. 用两台实际设备进入同一新房间，验证开局、中文、表情、背面选牌、刷新与重连。
3. 在新局运行时观察 Render 日志与资源；旧 Worker 的日志不能用来判断新服务请求。
4. 先让旧局结束，再决定是否停用旧 Worker。删除或修改 Cloudflare 资源不属于本地迁移脚本的行为。
5. Render 回退代码也会重启实例，免费服务上的房间可能丢失；先通知正在游玩的朋友。
