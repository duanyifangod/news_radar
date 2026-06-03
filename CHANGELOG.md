# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-06-03

首个公开发布版本。

### 功能

- 多源 RSS 抓取：经济、社会、军事、科技、体育、娱乐 6 大板块，覆盖 50+ 新闻源（详见 `config.yml`）
- LLM 板块摘要：每板块同时输出中文与英文报告（`news-<section>.md` / `news-<section>-en.md`）
- 双语 Highlights：`highlights.json` 包含 zh / en 两套精选要点
- 结构化产出：`news-data.json` 提供前端直接消费的统一数据
- 静态前端：`index.html` + `assets/` 纯静态实现，加载 `manifest.json` 自动列出所有可用日期
- 主题与语言切换：浅/深色主题，中英切换，板块展开/收起，全文搜索
- 可插拔 LLM provider：`openai` / `openrouter` / `deepseek`，OpenAI 兼容协议可对接 DeepSeek、Qwen 等
- 局域网模式：`pnpm serve` 监听 `0.0.0.0:3000`，同 LAN 设备直接访问

### 部署

- GitHub Pages：项目页 `https://duanyifangod.github.io/news_radar/` 一键部署
- 前端资源全部使用相对路径（基于 `document.baseURI`），同时兼容根路径与 `/news_radar/` 子路径
- 内置 `.nojekyll` 防止 Jekyll 干扰

### 自动化

- 新增 `.github/workflows/daily.yml`：每日 01:00 UTC（北京 09:00）自动执行 `pnpm daily`，提交并 push 回 `main`，触发 GitHub Pages 重新发布
- 支持通过 Secrets 与 Variables 灵活配置 LLM provider 与端点
- 支持 Actions 页面手动触发（`workflow_dispatch`）
- 加入 `concurrency` 防止重复运行，加入 `[skip ci]` 防止递归触发

### 工程

- TypeScript 严格模式 + Vitest 单元测试
- ESLint + Prettier + Husky 预提交校验
- pnpm 锁定版本 9.15.9
- 模块化 src 结构：`cli` / `collectors` / `reports` / `providers` / `shared`

### 已知限制

- GitHub Actions 定时任务存在 5–30 分钟级别的不可控延迟，9:00 触发实际可能在 9:05–9:30 之间完成
- 公共 RSS 源偶有 503/超时，单源失败会跳过但不阻断整体流程
- LLM 调用失败时该板块降级为空摘要，不影响其他板块产出

[1.0.0]: https://github.com/duanyifangod/news_radar/releases/tag/v1.0.0
