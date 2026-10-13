# Global Currency Hub

一个纯静态的汇率小工具，打开 `index.html` 即可使用，不需要构建。

- **汇率差计算器**：输入金额和你想锁定的目标汇率，看现在换比目标多得还是少得多少。
- **全币种转换**：在任意一行输入金额，其他币种自动换算；可以添加、移除、拖动排序。
- 支持 160 多种货币，记住你的设置，汇率缓存在本地，断网也能用。

## 文件结构

```
index.html          页面结构
css/styles.css      样式（自动跟随系统深色模式）
js/config.js        数据来源和默认设置
js/rates.js         获取汇率、本地缓存、交叉汇率
js/currency.js      币种名称、国旗、数字格式化与输入解析
js/app.js           页面交互
worker/             可选：隐藏 API Key 的中转服务（Cloudflare Worker）
```

本地预览：因为用了 ES 模块，需要通过本地服务器打开，例如在项目目录运行 `python3 -m http.server 8000`，然后访问 http://localhost:8000 。

## 汇率数据

默认使用 [ExchangeRate-API](https://www.exchangerate-api.com) 的免 Key 接口，每天更新一次，页面底部保留了要求的署名链接。

**不要把 API Key 写进网页代码。** 网页对所有访客公开，Key 写在哪里都能被看到。想用自己的 Key，请部署 `worker/` 里的中转服务，见下文。

## 用自己的 API Key（Cloudflare Worker）

Key 保存在 Cloudflare 的加密变量里，网页只请求 Worker。Worker 会把结果缓存 1 小时，所以无论多少人使用，每天最多请求上游约 24 次。

1. 在 ExchangeRate-API 后台**重新生成一个 Key**（旧 Key 曾经公开在本仓库的历史记录里，应作废）。
2. 注册 / 登录 [Cloudflare](https://dash.cloudflare.com)，在电脑上安装 Node.js。
3. 在 `worker/` 目录运行：
   ```bash
   npx wrangler login
   npx wrangler secret put EXCHANGE_RATE_API_KEY   # 按提示粘贴新 Key
   npx wrangler deploy
   ```
   部署成功会显示 Worker 地址，例如 `https://rate-calculator-rates.xxx.workers.dev`。
4. 如果网站不在 `https://reece-95.github.io`，修改 `worker/wrangler.toml` 里的 `ALLOWED_ORIGINS` 后重新部署。
5. 修改 `js/config.js`：
   ```js
   export const RATES_URL = 'https://rate-calculator-rates.xxx.workers.dev';
   export const SHOW_ATTRIBUTION = false;
   ```

## 微信小程序版

`wechat/` 目录是功能相同的微信小程序，用微信云开发的云函数获取汇率。导入、部署和上架步骤见 [wechat/README.md](wechat/README.md)。
