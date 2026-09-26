# Chrome Web Store MV3 上架前修改与测试清单

> 适用分支：`chrome-v3`
>
> 目标：在**尽量不牺牲现有功能**的前提下，使扩展满足 Chrome Web Store Manifest V3 审核要求，并形成可重复的发布/回归流程。
>
> 本清单用于交给 Codex 实施。请按阶段修改，每一阶段完成后先运行对应测试，不要一次性重构全部模块。

---

## 0. 修改原则

### 必须保持

除本清单明确说明的行为变化外，不应主动删除或弱化以下功能：

- DRRR 首页、Lounge、Room 的现有功能。
- BotScript / Lambda / `RL.Machine` 脚本语言和执行能力。
- 用户自己编写 BotScript。
- Event / Timer / 自动回复等脚本行为。
- 用户自定义 JavaScript 插件。
- URL JavaScript 插件（继续通过 Chrome `userScripts` API）。
- RoomKeeper 断线恢复。
- Telegram Bot 转发。
- 音乐、GIF、LINE Sticker 等可选功能。
- P2P / PeerJS / Room Chat。
- 通知功能。
- 当前 popup / settings 的主要使用方式。

### 修改约束

1. 不要修改 `dev` 或 `zen-firefox` 分支。
2. 不要为了通过审核直接删除核心功能；优先改实现方式。
3. 不要重新引入 Manifest V2 的远程 `<script src=https://...>`、`eval(remoteText)` 等路径。
4. 每个阶段应保持 git diff 可读，最好分开 commit。
5. 不要在没有测试的情况下大规模重写 `RL.Machine`。
6. 修改权限后必须重新检查所有相关功能，不能只以 manifest 可加载为验收标准。

---

# P0：上架前必须解决

## 1. BotScript Packages 远程代码执行

### 当前问题

目前 Packages 可以从 GitHub / Gitee 的 `bs-pkgs` 拉取脚本，例如：

```text
GitHub / Gitee
    ↓ fetch
bs-pkgs/game/*.js
    ↓
chrome.storage
    ↓
RL.Machine / RL.interact(...)
    ↓
执行
```

Manifest V3 Chrome Web Store 政策明确禁止：

- 从远程来源获取代码后执行；
- 从远程来源获取“复杂指令”，再交给扩展内自定义解释器执行。

当前 `RL.Machine + remote bs-pkgs` 正好落入这一类。

官方政策：

- https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

### 目标

**保留 GitHub Packages 在线更新能力，但把远程 BotScript 放到无法访问 Extension API 的隔离环境中运行。**

优先验证以下架构：

```text
GitHub bs-pkgs
      ↓
获取 BotScript 文本
      ↓
┌─────────────────────────┐
│ Sandbox execution page  │
│                         │
│ RL.Machine              │
│ BotScript               │
│                         │
│ drrr.* proxy API        │
└────────────┬────────────┘
             │ postMessage / RPC
             ↓
┌─────────────────────────┐
│ Extension privileged    │
│ bridge                   │
│                         │
│ 固定白名单动作           │
│ print / dm / kick / ... │
└─────────────────────────┘
```

Chrome MV3 政策允许在**与 Extension API 隔离的 iframe / sandboxed page** 中执行远程逻辑，但审核人员仍必须能从扩展代码理解扩展能够做什么。

### 实施要求

#### 1.1 建立 sandbox runner

建议新增独立目录，例如：

```text
sandbox/
  botscript.html
  botscript-runner.js
  botscript-bridge.js
```

在 manifest 中声明 sandbox 页面。

Sandbox 中：

- 加载打包在扩展内的 `RL.Machine` / lexer / parser / runtime。
- 接收 BotScript 文本。
- 在 sandbox 中解析和运行脚本。
- **不能直接访问 `chrome.*`。**
- 不直接拿 extension DOM。
- 与扩展本体只通过结构化消息通信。

#### 1.2 建立严格 RPC Bridge

不要做：

```js
postMessage({ action: "eval", code: "..." })
```

也不要提供类似：

```text
executeJavaScript
rawChromeApi
arbitraryExtensionFunction
```

Bridge 只能暴露审核时能够明确理解的白名单动作，例如：

```text
drrr.print
drrr.low
drrr.dm
drrr.title
drrr.descr
drrr.music
drrr.dj
drrr.chown
drrr.kick
drrr.ban
drrr.report
drrr.unban
drrr.leave
drrr.join
drrr.create
drrr.player
drrr.alive
drrr.getProfile
drrr.getLoc
drrr.getLounge
```

实际白名单以当前 `setting/script/drrr.js` 的用户可用 API 为基准逐项整理。

每个 RPC 请求至少校验：

- message source；
- message type；
- action 是否在白名单；
- 参数类型；
- 必需参数数量；
- 不允许传函数 / executable strings；
- 不允许任意调用 `chrome.*`。

#### 1.3 不提供通用“特权 fetch”桥

不要为了兼容脚本加入：

```text
sandbox -> extension -> fetch(any URL)
```

否则远程脚本可以间接获得扩展的 host permissions。

如果 BotScript 确实需要网络能力：

- 首选让 sandbox 自己执行普通 Web fetch，并遵循浏览器/CORS；
- 或为已有明确功能实现有限的、固定 API bridge；
- 每个网络能力必须能在审核材料里明确解释。

#### 1.4 兼容当前 Packages

当前扫描到 `bs-pkgs` 中绝大多数脚本主要调用 `drrr.*`，这是迁移 sandbox 的有利条件。

已发现需要单独处理的脚本包括但不限于：

- `utility/hook.js`：直接使用 `chrome.runtime`
- `utility/ai_talk.js`：直接使用 `chrome.permissions` / fetch
- `media/waifu.js`：使用 fetch
- 其他包含 `document` / browser global 的脚本

Codex 必须完整扫描整个 `bs-pkgs`，列出所有超出 sandbox API 的脚本，而不是只处理上述几个。

### 禁止的“伪修复”

以下方案不要采用：

- 远程 BotScript 下载后仍然在 extension page / service worker 中调用 `RL.interact()`。
- 把 BotScript Base64 / JSON 包起来再执行。
- 把远程 BotScript 转成 JS 字符串后通过普通 `eval/new Function` 执行。
- 用 `userScripts` 注入一个包装器，再回到 extension context 调 `RL.Machine` 执行远程 BotScript。
- 把 GitHub URL 改成另一个 CDN 后继续原逻辑。

### P0-1 验收测试

至少测试：

- [ ] Packages 可以从 GitHub 更新索引。
- [ ] 安装一个简单 package。
- [ ] 启用 package。
- [ ] package 可以正常接收 DRRR event。
- [ ] `drrr.print()` 正常。
- [ ] `drrr.dm()` 正常。
- [ ] Timer 正常。
- [ ] Event listener 正常。
- [ ] Package 环境/变量持久逻辑与旧版一致，或记录必要差异。
- [ ] 更新 GitHub package 后，不更新扩展版本也能获得新脚本。
- [ ] 远程 BotScript 无法直接访问 `chrome.cookies`。
- [ ] 远程 BotScript 无法直接访问 `chrome.tabs`。
- [ ] 远程 BotScript 无法调用任意 extension function。
- [ ] 伪造的 RPC action 被拒绝。
- [ ] 错误 BotScript 不会让 service worker / room 页面整体崩溃。
- [ ] Sandbox 崩溃后可以恢复或给出明确错误。

---

## 2. DRRR Session / 多账号切换存储

### 当前问题

现有多账号功能会读取：

```text
drrr-session-1
```

并把 Cookie 内容保存在：

```js
chrome.storage.sync
```

`storage.sync` 会在开启 Chrome Sync 时跨设备同步。

Chrome Storage 文档明确建议：

> sensitive user data 应优先使用 storage.session，而不是 storage.sync。

官方文档：

- https://developer.chrome.com/docs/extensions/reference/api/storage

### 目标行为

这个功能目前使用人数少，可以接受轻微行为调整。

推荐改为：

- **不再将任何 DRRR session token / Cookie value 写入 `storage.sync`。**
- 当前浏览器运行期间需要临时保存的账号 Session 放入 `chrome.storage.session`。
- 浏览器重启、扩展更新/重载后，临时保存的 Session 可以被清空。
- 普通 DRRR 登录状态继续以浏览器自己的 Cookie 为准。
- Profile 名称、UI 偏好等非敏感元数据可以继续使用 `storage.sync` / `storage.local`。
- 导入 Session Token 后，只保留在 Cookie + session storage 所需范围内。
- 导出 Session 仍可保留，但 UI 必须明确这是敏感登录凭据。

### 迁移要求

必须处理旧用户已经存在的数据：

```text
storage.sync.cookie
storage.sync.bio_cookies
```

建议首次运行新版本时：

1. 检查旧字段。
2. 如果存在 Session Cookie：
   - 如需要维持当前浏览器会话，可迁移到 `storage.session`。
3. 从 `storage.sync` 删除 session token / Cookie value。
4. 不要把 token 打到 console。
5. 不要把 token 放进 notification。
6. 不要把 token 放进错误日志。

### 功能变化必须记录

修改后允许：

> 多账号临时保存/切换只在当前浏览器会话有效；浏览器重启后需要重新登录/重新导入。

如果 Codex 找到安全、简单且不新增外部服务的持久凭据方案，可以先写设计说明再实施，不要自行发明复杂加密系统。

### P0-2 验收测试

- [ ] 正常登录 DRRR 不受影响。
- [ ] 当前账号 profile 能正确显示。
- [ ] 新增临时账号正常。
- [ ] A → B 切换正常。
- [ ] B → A 切换正常。
- [ ] 删除账号正常。
- [ ] 导入 Session 正常。
- [ ] 导出 Session 正常。
- [ ] 浏览器重启后 session-only 数据确实消失。
- [ ] Chrome Sync 中不再出现 session token。
- [ ] `storage.sync.cookie` 被清理。
- [ ] `storage.sync.bio_cookies` 中不再保存 Cookie value。
- [ ] 旧版本升级后不会因为历史脏数据报错。
- [ ] 未登录状态 UI 正常。

---

## 3. 隐私政策重写

### 当前问题

`privacy_policy.html` 是 2020 年生成器模板。

它目前声明了很多代码实际没有做的事情，例如：

- 自动收集 IP / 浏览器版本 /设备 ID；
- Usage Data analytics；
- marketing；
- promotional campaigns；
- business transfers；
- affiliates / business partners；
- 大量泛化的 personal data 行为。

这会造成**隐私政策与真实行为不一致**。

Chrome Web Store 要求隐私政策准确、最新，并覆盖实际数据访问、使用和共享行为：

- https://developer.chrome.com/docs/webstore/program-policies/policies

### 目标

重写成面向本扩展实际功能的简洁 Privacy Policy。

至少覆盖：

#### 本地/浏览器内处理

- DRRR 页面内容。
- DRRR 用户/房间信息。
- Extension settings。
- 用户编写的 scripts / plugins。
- playlists / automation rules。
- 临时 Session 数据。
- 不做独立 analytics（如果代码确认确实没有）。

#### 用户主动启用后才会发送给第三方的内容

例如：

- Telegram Bot forwarding：
  - 只有用户配置 Bot Token / Chat ID 并启用后才发送。
  - 发送对象：Telegram API。
  - 内容可能包含聊天室消息/事件。

- 音乐 / GIF / Sticker / 自定义 API：
  - 根据用户主动调用功能，请求对应服务。

#### 明确不要写不存在的行为

如果没有：

- 不写广告追踪；
- 不写出售数据；
- 不写营销分析；
- 不写后台人工阅读用户聊天；
- 不写设备指纹。

### P0-3 验收

- [ ] Privacy Policy 与代码真实行为一致。
- [ ] 所有实际第三方数据传输都有说明。
- [ ] 不再出现无依据的 marketing / analytics / business transfer 模板文字。
- [ ] 联系方式仍然有效。
- [ ] Web Store 后台可以提供公开 URL。

---

## 4. Remote Hosted Code 全仓库扫描

### 已处理

`peerjs/simple.html` 原来引用：

```html
<script src="https://unpkg.com/peerjs@1.3.1/dist/peerjs.min.js"></script>
```

该文件没有任何实际入口引用，已经删除。

实际 P2P 页面继续使用本地：

```html
<script src="/js/peerjs.min.js"></script>
```

不会影响现有 P2P 功能。

### Codex 仍需重新完整扫描

检查：

- [ ] 所有 `<script src="http...">`
- [ ] `eval(...)`
- [ ] `new Function(...)`
- [ ] 动态创建 remote script tag。
- [ ] fetch 后把文本作为 JS/逻辑执行。
- [ ] CodeMirror 动态 mode loader 是否只加载本地资源。
- [ ] Worker / iframe 是否有远程 executable code。
- [ ] source map / demo / test HTML 是否被打进最终 ZIP。

注意：

- Live2D model JSON / 图片 / 普通数据不等同于 Remote Hosted Code。
- 但任何能改变扩展执行逻辑的远程数据都需要重点检查。

### P0-4 验收

- [ ] 最终 ZIP 内无非 sandbox/userScripts 例外的 Remote Hosted Code。
- [ ] 不存在未使用 demo 文件带远程 script。
- [ ] Web Store Remote Code 声明与最终实现一致。

---

# P1：强烈建议在上架前完成

## 5. 权限最小化

Chrome Web Store 要求使用满足功能所需的最窄权限。

官方：

- https://developer.chrome.com/docs/webstore/program-policies/permissions
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy

### 已处理

已经从 manifest 删除不必要的：

```json
"tabs"
```

原因：

当前代码没有读取任意标签页的 URL / title / favicon 等敏感属性；打开、更新、reload、query 已知 DRRR 页面等场景不需要额外 `tabs` 权限。

### 当前 permissions

```text
storage
cookies
notifications
userScripts
```

原则上都有真实功能用途。

Codex 不要随意删除，先确认使用链。

### host_permissions 逐项检查

当前包括：

```text
drrr.com
tinyurl.com
keeper-cat.fly.dev
link.hhtjim.com
music.163.com
store.line.me
api.telegram.org
api.tenor.com
api.giphy.com
github.com
gitee.com
script.google.com
music.liuzhijin.cn
```

要求：

- [ ] 每一个 host 都能对应到仍然存在的功能。
- [ ] 已失效服务删除对应 host permission。
- [ ] 能使用 HTTPS 的不要保留 HTTP。
- [ ] BotScript sandbox 改造完成后，重新判断 `github.com` / `gitee.com` 是否仍需 extension host permission。
- [ ] 不为了未来功能保留权限。

### optional_host_permissions

当前：

```json
"http://*/*",
"https://*/*"
```

用途是：

- 用户自定义 API；
- 用户指定 URL JavaScript plugin；
- 在用户点击操作后调用 `chrome.permissions.request()` 请求具体 origin。

这两个 broad optional host permissions 可以暂时保留，但必须确认：

- 安装时不直接授予；
- 只有用户主动操作才请求；
- 实际请求精确 origin；
- Store 审核说明中明确用途。

---

## 6. User Scripts API 回归

当前用户 JavaScript 插件已经迁移到：

```js
chrome.userScripts
```

这是 Chrome MV3 明确允许的远程/用户提供代码执行路径。

要求：

- [ ] 本地 code plugin 正常。
- [ ] URL plugin 正常。
- [ ] URL plugin 必须先请求其来源 origin。
- [ ] 拒绝 host permission 后不能偷偷继续加载。
- [ ] 删除/禁用 plugin 后对应 userScript 注销。
- [ ] service worker 重启后能够恢复已启用 plugin。
- [ ] Chrome 138+ “Allow User Scripts” 未开启时有清晰提示。
- [ ] 开启后能自动恢复或提示重新打开 popup。
- [ ] 用户插件与 BotScript sandbox 两套执行路径不要混淆。

---

## 7. 旧/失效功能清理

### manifest 非标准字段

当前有：

```json
"current_locale": "zh"
```

检查代码是否依赖它。

如果没有依赖，删除该非标准 manifest 字段。

### 旧 ChatGPT URL

当前 content script 匹配：

```text
https://chat.openai.com/chat
```

该地址属于旧 ChatGPT 页面路径。

要求：

- 检查该功能现在是否仍然有效。
- 如果已失效且没有用户使用，删除 content script 和相关 UI。
- 如果仍要保留，更新到当前真实页面结构并完整测试。
- 不要在商店描述中宣传一个已经坏掉的功能。

Chrome Web Store 不允许明显 broken functionality。

---

## 8. 老旧 HTTP / 第三方服务检查

检查：

```text
http://music.163.com
http://api.giphy.com
link.hhtjim.com
keeper-cat.fly.dev
music.liuzhijin.cn
script.google.com endpoints
Tenor API
LINE Store
```

逐个测试：

- 服务是否还在线；
- 是否支持 HTTPS；
- API 是否已经废弃；
- 返回结构是否仍兼容；
- 是否包含硬编码失效 key；
- 失败是否只影响该可选功能，而不会拖垮 popup/service worker。

能删除的废弃功能再删除对应权限。

---

# P2：发布工程与商店材料

## 9. Manifest 最终检查

上架前：

- [ ] `manifest_version = 3`
- [ ] version > `1.843`
- [ ] `minimum_chrome_version` 与实际 API 要求一致。
- [ ] 所有 permissions 确实使用。
- [ ] 所有 host_permissions 确实使用。
- [ ] CSP 与最终 sandbox / userScripts 架构一致。
- [ ] `web_accessible_resources` 尽量缩小。
- [ ] 没有非必要 `<all_urls>`。
- [ ] icon 路径正确。
- [ ] service worker 可正常启动。

---

## 10. MV3 Worker 重新生成

每次正式打包前执行：

```bash
node scripts/build-mv3-worker.mjs
```

然后：

- [ ] git diff 检查 generated worker 是否与源代码一致。
- [ ] 不允许生成后还有忘记提交的 worker 变化。
- [ ] service worker 启动无语法错误。

---

## 11. Store 审核说明

项目已有：

```text
CHROMEWEBSTORE.md
```

在代码修改完成后更新此文件。

至少包含：

### Single purpose

建议方向：

> Provide user-controlled automation and productivity tools for drrr.com chat rooms, including room actions, notifications, media helpers, and optional user-authored scripts.

### Permission justification

分别说明：

- storage
- cookies
- notifications
- userScripts
- 所有 required host permissions
- optional host permissions

### Remote Code

必须按照最终真实实现填写。

如果完成 sandbox 方案，应明确：

- Developer-controlled extension code全部随包提交。
- Remote BotScript Packages 只在隔离于 Extension API 的 sandbox 环境执行。
- Sandbox 只能通过固定白名单 RPC 与扩展本体通信。
- User JavaScript plugins 通过 Chrome `userScripts` API 执行。

---

## 12. 商店素材

准备：

- [ ] 128×128 extension icon。
- [ ] Store listing icon。
- [ ] 至少一组真实功能截图。
- [ ] 简短 description。
- [ ] Detailed description。
- [ ] Privacy Policy 公网 URL。
- [ ] Support / homepage URL。
- [ ] Developer contact email。
- [ ] Reviewer testing instructions。

截图不要展示真实 Session Token、Telegram Bot Token 或其他凭据。

---

# 完整回归测试

## A. 安装 / 更新

- [ ] 从 unpacked extension 全新安装。
- [ ] 没有 manifest warning。
- [ ] service worker 无启动错误。
- [ ] 从旧 chrome-v3 数据升级。
- [ ] 旧 storage 数据迁移正常。
- [ ] 扩展 reload 后正常。
- [ ] Chrome 重启后正常。

## B. DRRR 基础

- [ ] 打开 drrr.com 首页。
- [ ] Lounge 正常。
- [ ] 进入 Room 正常。
- [ ] profile 正常读取。
- [ ] room users 正常读取。
- [ ] 发送消息正常。
- [ ] DM 正常。
- [ ] /me 正常。
- [ ] low voice 正常。

## C. RoomKeeper

- [ ] 关闭时没有额外保活行为。
- [ ] 开启时正常监听连接。
- [ ] 短暂断线由 DRRR 自身恢复时不 reload。
- [ ] 持续断线触发 reload。
- [ ] retry 次数正确。
- [ ] cooldown 正确。
- [ ] 不再给自己发送 keep/unkeep 消息。

## D. BotScript

- [ ] 编辑器正常。
- [ ] 直接运行本地脚本正常。
- [ ] event 正常。
- [ ] timer 正常。
- [ ] 环境变量正常。
- [ ] preload module 正常。
- [ ] `drrr.print`。
- [ ] `drrr.dm`。
- [ ] `drrr.kick`。
- [ ] `drrr.ban`。
- [ ] `drrr.music`。
- [ ] `drrr.create`。
- [ ] `drrr.join`。
- [ ] script error 有可理解日志。

## E. Packages / Sandbox

- [ ] GitHub index。
- [ ] GitHub package download。
- [ ] Gitee（如保留）。
- [ ] install。
- [ ] remove。
- [ ] update。
- [ ] enable/disable。
- [ ] sandbox RPC。
- [ ] 非法 RPC 拒绝。
- [ ] sandbox 无 `chrome.*`。
- [ ] GitHub 修改 package 后无需 extension update 即可更新。

## F. User JavaScript Plugins

- [ ] builtin plugin。
- [ ] local code plugin。
- [ ] URL plugin。
- [ ] host permission request。
- [ ] permission denied。
- [ ] enable/disable。
- [ ] edit。
- [ ] delete。
- [ ] service worker restart restore。

## G. Session / Accounts

- [ ] 当前账号。
- [ ] 临时保存账号。
- [ ] account switch。
- [ ] import session。
- [ ] export session。
- [ ] delete session。
- [ ] restart clears session-only secrets。
- [ ] sync storage 无 Cookie Token。

## H. Notifications

- [ ] room event notification。
- [ ] 点击 notification 行为。
- [ ] 关闭 notification。
- [ ] 配置提示 notification。

## I. Telegram

- [ ] Token 验证。
- [ ] Chat ID 选择。
- [ ] 开启后正常转发。
- [ ] 关闭后不发送。
- [ ] Token 不出现在日志/截图/通知正文。

## J. Media

逐项测试仍保留的 provider：

- [ ] NetEase。
- [ ] GIF / Tenor。
- [ ] Giphy。
- [ ] LINE Sticker。
- [ ] custom YouTube/API endpoint。
- [ ] playlist。
- [ ] play / next / loop。

## K. P2P

- [ ] `peerjs/p2p-chat.html`
- [ ] `peerjs/room-chat.html`
- [ ] `peerjs/hidden-lounge.html`
- [ ] 本地 `/js/peerjs.min.js` 正常加载。
- [ ] Peer connect。
- [ ] data message。
- [ ] disconnect / reconnect。

## L. UI

- [ ] Popup。
- [ ] settings。
- [ ] Script editor。
- [ ] Plugin editor。
- [ ] 中文。
- [ ] 英文。
- [ ] Manual links。
- [ ] 不存在死按钮/明显报错。

---

# 最终发布 Gate

只有以下全部满足后才制作 Web Store ZIP：

- [ ] P0 全部完成。
- [ ] BotScript 远程执行符合 MV3 policy。
- [ ] Session Token 不再进入 `storage.sync`。
- [ ] Privacy Policy 已按真实代码重写。
- [ ] Remote Hosted Code 全仓库扫描通过。
- [ ] Permission audit 完成。
- [ ] 核心回归测试通过。
- [ ] 可选功能至少确认不会影响核心功能。
- [ ] `node scripts/build-mv3-worker.mjs` 已执行。
- [ ] `git diff --check` 通过。
- [ ] manifest JSON 校验通过。
- [ ] 工作区没有遗漏的 generated changes。
- [ ] version 已递增。
- [ ] Store 审核说明已更新。
- [ ] Privacy 声明与代码一致。

---

# 给 Codex 的建议执行顺序

不要一次性全部改。

推荐顺序：

```text
Phase 1
  BotScript sandbox 最小技术验证
  ↓
  先跑 guess_number / dice 等简单 package

Phase 2
  完成 drrr.* RPC bridge
  ↓
  回归常用 Packages

Phase 3
  Session storage 重构 + 旧数据迁移
  ↓
  多账号功能测试

Phase 4
  Remote Hosted Code 全仓库清理
  ↓
  Permission / host_permission 精简

Phase 5
  老旧第三方 API 和 ChatGPT 功能检查
  ↓
  删除确认无效代码/权限

Phase 6
  Privacy Policy
  CHROMEWEBSTORE.md
  Store metadata

Phase 7
  完整回归
  build
  package
```

如果 Phase 1 证明 sandbox 架构无法完整承载现有 BotScript，不要直接删除在线 Packages。先记录失败原因，再重新评估 `userScripts` 或其他符合 Chrome 官方政策的架构。

---

# 官方依据

- MV3 Remote Hosted Code：
  https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- User Scripts API：
  https://developer.chrome.com/docs/extensions/reference/api/userScripts
- Storage：
  https://developer.chrome.com/docs/extensions/reference/api/storage
- Privacy / permission justification：
  https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome Web Store Program Policies：
  https://developer.chrome.com/docs/webstore/program-policies/policies
- Permission policy：
  https://developer.chrome.com/docs/webstore/program-policies/permissions
