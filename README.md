# News Radar

每日多源新闻情报站。本地拉取数十个 RSS 源，调用 LLM 生成结构化日报，渲染为静态站点供局域网或 GitHub Pages 访问。

线上访问：<https://duanyifangod.github.io/news_radar/>

![News Radar 主界面](docs/images/newsradar.png)

## 功能

- 6 大板块：经济、社会、军事、科技、体育、娱乐
- 中英双语：每篇日报同时输出 zh / en 两版
- 结构化产出：`news-data.json`、`highlights.json`、`news-*.md`
- 本地优先：所有数据生成与浏览均可离线在本机/局域网完成
- 静态部署：无服务端代码，可直接发布到 GitHub Pages、对象存储或任何静态托管
- 自动化：GitHub Actions 每天 09:00 (Asia/Shanghai) 自动跑日报并 push

![新闻抓取与板块呈现](docs/images/obtainandhearingnews.png)

## 数据流

```
RSS 源 (config.yml)
    │
    ▼
src/collectors/news.ts   ──>   规整化抓取
    │
    ▼
src/reports/*  + LLM     ──>  分版块摘要 / highlights
    │
    ▼
digests/YYYY-MM-DD/
  ├─ news-data.json        前端读取
  ├─ highlights.json
  └─ news-*.md             Markdown 报告
    │
    ▼
src/cli/generate-manifest.ts ──> manifest.json
    │
    ▼
浏览器加载 index.html
  └─ 读 manifest.json + digests/<date>/news-data.json
```

## 目录结构

```
.
├─ index.html              静态外壳
├─ assets/
│   ├─ css/                样式
│   ├─ js/                 前端脚本（app/data-loader/renderer/...）
│   └─ vendor/             第三方浏览器构建（marked / DOMPurify）
├─ digests/<YYYY-MM-DD>/   每日产物
├─ manifest.json           可用日期清单
├─ feed.xml                RSS 输出
├─ src/
│   ├─ cli/                可执行入口（news-index / generate-manifest）
│   ├─ collectors/         RSS 抓取与归一化
│   ├─ reports/            提示词与报告生成
│   ├─ providers/          LLM provider 工厂（openai / openrouter / deepseek）
│   ├─ shared/             日期、i18n 工具
│   └─ __tests__/          Vitest 测试
├─ config.yml              新闻源、CLI 仓库、聚焦项目配置
└─ .github/workflows/      GitHub Actions
```

## 本地运行

需要 Node.js 20+ 与 pnpm 9。

```powershell
pnpm install
copy .env.example .env       # 然后编辑 .env 填入 LLM key
pnpm daily                   # 抓新闻 + 生成 manifest
pnpm serve                   # 在 0.0.0.0:3000 启动静态服务器
```

打开 `http://localhost:3000/` 或同局域网设备的 `http://<host-ip>:3000/`。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `LLM_PROVIDER` | 否 | `openai` (默认) / `openrouter` / `deepseek` |
| `OPENAI_API_KEY` | provider=openai 时必填 | OpenAI 兼容协议的 key |
| `OPENAI_BASE_URL` | 否 | 自托管或第三方 OpenAI 兼容端点 (例：`https://api.deepseek.com`) |
| `OPENAI_MODEL` | 否 | 默认 `gpt-4o` |
| `OPENROUTER_API_KEY` | provider=openrouter 时必填 | |
| `OPENROUTER_MODEL` | 否 | 默认 `openai/gpt-4o-mini` |
| `DEEPSEEK_API_KEY` | provider=deepseek 时必填 | |
| `DEEPSEEK_MODEL` | 否 | |
| `NEWS_WINDOW_HOURS` | 否 | 抓取最近 N 小时，默认 24 |

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm daily` | 生成今日 digest + manifest |
| `pnpm manifest` | 仅重建 `manifest.json` |
| `pnpm serve` | 局域网静态服务器（端口 3000） |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | Vitest 测试 |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` | Prettier 格式化 |

## 自动化（GitHub Actions）

`.github/workflows/daily.yml` 每天 01:00 UTC（北京 09:00）跑 `pnpm daily` 并 push 回 `main`。GitHub Pages 监听 `main` 分支后自动重新发布。

![GitHub Actions 自动部署流程](docs/images/auto_deploy.png)

仓库需要在 **Settings → Secrets and variables → Actions** 配置：

- Secrets：`OPENAI_API_KEY`（必填）
- Variables：`LLM_PROVIDER`、`OPENAI_BASE_URL`、`OPENAI_MODEL`（按需）

工作流也可在 Actions 页手动触发（Run workflow）。

## 自定义新闻源

编辑 `config.yml` 中的 `news_sources`。每条条目需要：

```yaml
- id: tech-techcrunch          # 唯一 ID
  name: TechCrunch              # 显示名
  url: https://techcrunch.com/feed/
  section: tech                 # economy | society | military | tech | sports | entertainment
  subcategory: 科技产品
  region: Global
  lang: en
  limit: 10
```

下次跑 `pnpm daily` 即生效。

## 部署

### GitHub Pages（默认）

仓库 Settings → Pages → Source 选 `Deploy from a branch`，Branch 选 `main`，Folder `/ (root)`。

### 任意静态托管

打包 = 直接把整个仓库（除 `node_modules/`、`.env`）上传：Cloudflare Pages、Netlify、Vercel、对象存储 + CDN 等都可。

### 局域网

`pnpm serve` 监听 `0.0.0.0:3000`。同 LAN 设备访问 `http://<host-ip>:3000/` 即可。Windows 防火墙需放行 TCP 3000。

## 许可

MIT
