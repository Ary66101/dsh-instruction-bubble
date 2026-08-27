# dsh-instruction-bubble

DSH Web GUI 客户端插件：在会话顶部（对话区视口上沿）悬浮一条长气泡，显示**最近一条已经滚出视野顶部的用户指令**；随滚动逐条切换为上一条指令。

## 行为

- 指令 = 普通用户消息（`user`）+ 中途插话（`steering`）；不含 `/命令` 与系统注入上下文。
- 最新指令仍在视野内 → 显示上一条指令；被推出视野顶部后 → 显示最新指令；继续上翻逐条切换。
- 没有任何指令被推出视野时显示视野内最靠上的指令（须存在对应 DOM 行）；空白会话不显示。
- 纯展示：`pointer-events: none`，不拦截任何鼠标操作。
- 与主题联动：使用 `--dsw-alias-*` 主题令牌（暗/亮自适应，均带兜底值）、背景模糊、≤2 行截断、小字号。
- 气泡始终悬浮在对话区视口上沿并随对话区中轴居中；若安装了 dsh-better-sidebar，气泡会跟随右侧面板的开合平滑滑动。

## 兼容性

| 维度 | 要求 / 说明 |
|---|---|
| DSH 版本 | 需要 **DSH ≥ 0.1.0-rc.6** 的 **web 客户端**（`shell.overlay` 插槽要求注册带 `options.id`）；已在 `0.1.1-rc.2` 实测 |
| 浏览器 | Chromium 系（Chrome / Edge）；仅使用标准 API（ResizeObserver / requestAnimationFrame / getBoundingClientRect）+ React ≥18 的 `useSyncExternalStore`（react 由宿主模块表提供，本插件**零 npm 依赖**） |
| 平台 | 无平台依赖（浏览器端纯 JS）；仅安装说明中的"junction 备选方案"是 Windows 特例 |
| 核心 UI 属性 | 依赖 DSH web 的 3 个 DOM 属性：`[data-conversation-scroll]`、`[data-chat-flow-kind]`、`[data-chat-flow-key]`。它们当前版本内稳定，但属内部实现——若未来 DSH 改名，插件会**静默不显示**（不会报错或破坏 GUI） |
| 右侧面板 | `[data-dsh-panel]`（dsh-better-sidebar）用于"跟面板滑动"的增强动画；**未安装 better-sidebar 时优雅降级**：气泡仍正常工作（按对话区居中），只是没有随面板滑动 |
| 其他插件 | 无冲突设计：`shell.overlay` 为追加式插槽，气泡 `pointer-events: none`，z-index 60 |

## 安装

在 DSH web profile 目录（`~/.dsh/profiles/web`）执行：

```bash
# 方式 A：从 git 仓库安装（推荐）
pnpm add <本仓库 git URL>

# 方式 B：本地路径安装
pnpm add file:<本插件目录的绝对路径>
```

然后**关键一步**：编辑 profile 的 `package.json`，把 `"dsh-instruction-bubble"` 追加进 `dsh.profile.bundles` 数组 —— boot 图只由 `dsh.profile.bundles` 栈组成，不添加则插件不会加载（不是扫描 node_modules）。

最后重启 `dsh web`（boot 图在启动时组成并缓存），浏览器硬刷新（Ctrl+Shift+R）。

### 备选：pnpm 11 供应链策略拦路时

如果 `pnpm add` 因 `minimumReleaseAge` 策略拦截 lockfile 校验（registry 条目发布不足 24h；项目级 `.npmrc` 设 `minimumReleaseAge=0` 实测无效），改用确定性手工安装：

```powershell
# Windows：在 profile 的 node_modules 建 junction 指向本插件目录
New-Item -ItemType Junction -Path "$HOME\.dsh\profiles\web\node_modules\dsh-instruction-bubble" -Target "<本插件源码目录的绝对路径>"

# package.json 的 dependencies 记录：  "dsh-instruction-bubble": "link:<本插件源码目录的绝对路径>"
# 再追加 dsh.profile.bundles 条目（同上），重启 dsh web + 硬刷新
```

macOS / Linux 下把 junction 换成 `ln -s` 即可。git 依赖通常不受该策略影响，优先走方式 A。

## 卸载

1. 从 `dsh.profile.bundles` 移除 `dsh-instruction-bubble`；
2. 移除依赖（profile 目录执行 `pnpm remove dsh-instruction-bubble`，或删除 junction 与 dependencies 条目）；
3. 重启 `dsh web`，硬刷新。

## 开发

```bash
npm test                  # node:test 单测（rule.js 纯逻辑；10/10）
node scripts/build.mjs    # 生成 lib/client.js（__ModuleLoader__.load 注册；字节确定性）
```

产物 `lib/client.js` 提交入库；改动 `src/client/*` 后重新构建即可。

## 原理

- 挂载：`shell.overlay` 插槽（追加式浮层，list 型插槽注册必须带 `options.id`——DSH ≥ 0.1.0-rc.6 的 SlotCore 缺 id 会在加载期抛错）+ `position: fixed` 锚定 `[data-conversation-scroll]` 顶边。
- 数据：`useSessions((s) => s.current)` 取当前会话，经 `ctx.sessions.binding(id).session`（`ConversationSnapshot`）→ `chat.order`/`chat.nodes` 筛出 user/steering。
- 定位：`[data-chat-flow-kind="user"|"steering"]` 消息框 `getBoundingClientRect().bottom ≤ 视口顶边 + 4px` 视为已滚出。
- 居中：以"对话区可见右边界"计算中轴——右侧面板（`[data-dsh-panel]`）存在且可见时取其左缘逐帧跟随，否则取滚动区右缘；跟随期间内联关闭 CSS 过渡（逐帧本身就是动画），静止后恢复 0.2s 平滑过渡。
- 节奏：滚动/窗口缩放/`visibilitychange`/快照发布/面板滑动 → rAF 节流重算 + 500ms 轮询兜底；几何去重（`frameRef`）避免无谓重渲染。

## 文件结构

```
src/client/rule.js    纯逻辑（文本提取/指令列表/选择规则，可单测）
src/client/index.js   浏览器入口（组件 + DOM 接线 + 样式注入）
scripts/build.mjs     零依赖迷你打包器（ESM → __ModuleLoader__.load 工厂）
test/rule.test.mjs    node:test 单测
lib/client.js         构建产物（提交入库）
```

## 许可证

[MIT](./LICENSE)