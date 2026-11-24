# dsh-pdf-study

在 DeepSeek Harness 的右侧栏读 PDF，框选一块区域就直接提问。

## 安装

插件以 GitHub 仓库分发，装进某个 DSH profile（下面以 `web` 为例）：

```bash
cd ~/.dsh/profiles/web
pnpm add github:TACONailoong/dsh-pdf-study
```

再把 `dsh-pdf-study` 加进同一份 `package.json` 的 `dsh.profile.bundles` 数组：

```json
"dsh": {
  "profile": {
    "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-pdf-study"]
  }
}
```

重启 DSH 后刷新浏览器页面，输入框下方就会出现「PDF 精读」按钮。

## 用法

1. 打开右侧栏：对话页右上角的展开按钮，或输入框下方的「PDF 精读」按钮。
2. 「PDF 精读」页里点击/拖入一份 PDF。
3. 在页面上按住鼠标拖出一个框，框住插图、公式或任意段落。
4. 在下方输入问题（可留空，留空会请助手讲解这块内容），回车发送。

选区会作为一张图片连同问题进入当前对话，回答就是助手的普通回答；选区图片本身也会留在会话记录里，方便回看。

## 实现方式

- **Host 半**（`index.js`）注册 `/dsh-pdf-study` 前缀路由：`POST /open` 接收 PDF 字节、渲染第 1 页并返回页数与尺寸；`GET /page/<id>/<n>.png` 按需返回某一页的 PNG；`POST /close` 释放文档。
- 页面栅格化走 Host 的 Office 套件（`ctx.officeKit.renderImages`，PDFium），按 150 DPI 渲染，PNG 按文档缓存。
- **浏览器半**（`client.js`）在 `ctx.sidebarRightTabs` 注册页面类型 `pdf-study`，正文注册进 `sidebar.right.pane.tab`；选区在浏览器里用 canvas 裁切（长边最多 2000 px，过大时转 JPEG），再通过 `ctx.remote.session.prompt` 作为图片 prompt 发到当前会话。
- 路由只接受本机请求；写入还要求同源 `Origin`。上传的 PDF 仅保存在 Host 内存中。

## 限制

- 仅 Web GUI（浏览器里打开的 `http://127.0.0.1:3080` 页面）。Electron 的 `file://` 界面里相对路径取不到这两条路由。
- 需要 Host 已挂载 Office 渲染服务（`office-kit`，Web 版默认挂载）。缺少时页面会提示「当前环境没有可用的文档渲染服务」。
- 单份 PDF 上限 64 MB，Host 内存最多同时保留 6 份（超出按最久未用淘汰）；更换文件时释放旧的一份，关闭标签页后重新打开仍回到同一份 PDF。
- 大文件第一页需要几秒（渲染引擎首次启动）；相邻页会预取，翻页通常很快。
- 依赖当前会话模型支持图片输入。

## 许可

MIT
