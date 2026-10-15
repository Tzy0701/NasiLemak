# 继续使用 Cloudflare 免费版

核对日期：2026-10-15。默认使用 **Cloudflare Workers Static Assets + SQLite Durable Objects**，页面、图片、API 和联机房间都留在 Cloudflare。不需要 Render、D1 或另一家数据库。

## 部署现有 Worker

仓库：`Tzy0701/NasiLemak`；分支：`claude/nasi-lemak-online-game-k1qte5`。

1. 在 Cloudflare 控制台确认使用 Workers Free，目标账号为 `a8265c7cf48c59f625939c3b1ab3f714`，Worker 为 `nasi-lemak-online`。不要升级付费方案。
2. Workers 的 Git 构建设置使用上述分支，构建命令 `npm run build`，部署命令 `npx wrangler deploy --config wrangler.jsonc`。若平台要求安装命令，使用 `npm ci --include=dev`。
3. 也可以在本地执行 `npx wrangler login`，再执行 `npm run check:deploy` 和 `npm run deploy`。前者只检查构建和打包，后者才发布。
4. `VITE_API_URL` 保持为空；页面和 API 同域。生产环境不要配置 `FAST_TIMERS`。额外域名可在 Worker 的 Domains & Routes 配置。
5. 上线后检查 `/api/health` 返回 `backend: "cloudflare"`，并用两名玩家实际开房、选牌、断线重连和完成对局。提交代码或本地测试通过都不能代替上线验证。

配置保留原 Worker 名、`ROOMS` 绑定、`GameRoom` 类和 `v1` SQLite 迁移，不创建替代存储，也不删除旧房间。更新时保留现有账号和域名；不要新建另一个同名 Worker 来绕过账号授权问题。新版本可读取旧房间的可选字段，表情贴纸、小偷选牌等新增功能也保留。

一个 Worker 即可完成部署。Cloudflare Pages 只能独立托管静态前端；多人房间仍需要后端。仅搬到 Pages 不会取消 Durable Objects 的用量或额度，因此本项目不需要额外拆分 Pages。

## 免费额度和修复范围

根据 [Durable Objects 官方计费说明](https://developers.cloudflare.com/durable-objects/platform/pricing/)，Free 计划当前包括每日 100,000 个计费请求、13,000 GB-s 运行时长、500 万行读取、100,000 行写入和总计 5 GB 存储。HTTP/RPC、定时唤醒和传入 WebSocket 消息都可能计入请求；传入 WebSocket 消息按官方 20:1 比率折算。用量图里的原始事件数不一定等于计费请求数。

超过免费限额会返回错误，日额度在 UTC 00:00 重置（马来西亚 08:00）。Workers 自身也有[免费计划限制](https://developers.cloudflare.com/workers/platform/limits/)。不承诺免费无限使用，不自动开通付费方案。

本版本降低浪费的措施：

- 最后一位真人断线后暂停机器人、出牌、交易和选牌计时，保留 30 分钟返回窗口；空房间只安排认证清理或最终到期清理。
- 没有在线接任者时不安排已经过期的房主转移计时，避免反复立即唤醒。
- 后台自动行动不延长真人活跃时间。
- 使用 [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)，心跳自动回复，不唤醒房间处理。自动回复节省运行时长，不代表所有传入消息都不计量。
- 正常休眠唤醒只读取保存状态，不重写状态或重置已有定时器。
- 表情和固定短句不写入游戏存储；限流与最近去重确认保存在可跨休眠保留的连接附件中，并按玩家合并多个页面的频率。
- 开房前过滤无效输入，接口和 WebSocket 均限流；日志设置为 10% 采样。日志采样只减少日志量，不减少实际请求。

之前发现并修复的空房间计时循环是代码层面的确认结果。过去超限那一天的请求来源、旧版本是否已修复以及每类请求比例，仍需正确账号下的线上日志确认，不能从本地测试反推。

## 账号读取与上线状态

此前工具可访问的账号与控制台链接中的账号 ID 不同，对目标账号返回 Authentication error。相同邮箱可以涉及不同账号；需要目标账号的读取／部署权限。遇到此错误应核对授权范围，不要把配置改成另一个账号。

本地 Worker 测试和打包不需要 Cloudflare 登录。部署与线上验证需要账号权限；本文件不表示已经发布新版本，也不表示已经读到此前的线上请求明细。
