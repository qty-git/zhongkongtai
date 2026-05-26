# 中控台

面向中控的本地商品资料工作流工具。第一版目标是先跑通本地资料准备：粘贴款号，读取商品资料 Excel，提取商品图和尺码/SKU 信息，导出一个可审核的总表。

## MVP 能力

- 粘贴一批款号，自动去重并保持输入顺序。
- 选择一个或多个本地商品资料 Excel。
- 解析 `手卡资料` 商品块，读取供应商、品牌、系统类目、颜色、价格、面料、SKU 和尺码表。
- 提取 Excel 内嵌产品图，保存为 `款号.png`。
- 写入尺码表中的建议体重，并同步到 SKU 备注。
- 导出最终 `.xlsx`，包含 `商品总表`、`SKU明细`、`尺码表` 和 `异常记录`。

## 本地开发

```bash
npm install
npm run dev
```

开发应用启动后，在窗口里选择商品资料 Excel 和输出目录，再粘贴款号开始处理。

## Windows 打包

在 Windows 电脑上运行：

```bash
npm ci
npm run dist:win
```

打包完成后，产物会出现在 `release/` 目录：

- `中控台-Setup-0.1.0-x64.exe`：安装包，适合固定中控电脑使用。
- `中控台-Portable-0.1.0-x64.exe`：便携包，适合拷贝到其他设备试用。

如果不想在本地打包，可以进入 GitHub 仓库的 `Actions` 页面，手动运行 `Build Windows App`。运行完成后，在该次 workflow 的 `Artifacts` 中下载 `zhongkongtai-windows`。

国内网络如果下载 Electron 失败，可以在 PowerShell 里先设置镜像后再安装/打包：

```powershell
$env:npm_config_electron_mirror="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm ci
npm run dist:win
```

## 测试

解析测试需要本地样例工作簿。把样例 Excel 复制到测试目录：

```bash
cp "/Users/qiyiyi/Downloads/5月手卡资料5.11-5.21.xlsx" tests/fixtures/handcard-sample.xlsx
```

运行验证：

```bash
npm run typecheck
npm run test
npm run build
```

`tests/fixtures/handcard-sample.xlsx` 已加入忽略列表，不会提交到仓库。

## 第一版边界

第一版不登录抖店、不创建商品链接、不自动上架。后续阶段会在本地流程稳定后，再接入 AI 生成和抖店自动化；自动化目标是创建到下架目录或待上架列表，由中控人工审核确认上架。

## Windows 使用方向

最终交付会优先面向 Windows：打包成可直接打开的桌面应用，资料从本机文件夹选择或扫描，数据只保存在本地，不做多店铺共享。
