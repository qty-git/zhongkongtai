# 中控台

面向中控的本地商品资料工作流工具。第一版目标是先跑通本地资料准备：粘贴款号，读取商品资料 Excel，提取商品图和尺码/SKU 信息，导出一个可审核的总表。

## MVP 能力

- 粘贴一批款号，自动去重并保持输入顺序。
- 选择资料文件夹，自动递归扫描 `.xlsx` / `.xlsm` 商品资料；也可以额外手动选择一个或多个 Excel。
- 解析 `手卡资料` 商品块，读取供应商、品牌、系统类目、颜色、价格、面料、SKU 和尺码表。
- 提取 Excel 内嵌产品图，保存为 `款号.png`。
- 写入尺码表中的建议体重，并同步到 SKU 备注。
- 将解析出的尺码表保存为 `size-charts/款号_尺码表.png`，后续可用于抖店 AI 尺码识别。
- 如果尺码表里某个尺码只有表头或身高体型、没有建议体重和尺寸值，会视为无效尺码并跳过。
- 显示扫描、解析、提图、生成尺码图、导出的处理进度。
- 生成本次处理日志，方便定位异常款号或异常 Excel。
- 导出最终 `.xlsx`，包含 `商品总表`、`上架任务表`、`SKU明细`、`尺码表` 和 `异常记录`。

## 中控使用流程

1. 打开中控台桌面应用。
2. 粘贴一串款号，每行一个或用空格、逗号分隔都可以。
3. 点击“资料文件夹”，选择本地保存商品资料 Excel 的文件夹。
4. 如有零散 Excel，可点击“手动 Excel”补充选择。
5. 点击“输出目录”，选择本次结果保存位置。
6. 点击“开始处理”，等待进度完成。
7. 在输出目录检查总表、图片、尺码表图片和日志。

输出目录会生成：

- `images/款号.png`：从商品资料 Excel 内嵌图提取出的商品图。
- `size-charts/款号_尺码表.png`：由尺码表数据渲染出的图片。
- `logs/中控台日志_时间.txt`：本次扫描、解析、异常和导出日志。
- `中控台导出_时间.xlsx`：合并后的总表。

`上架任务表` 是后续抖店自动化优先读取的表：一行一个款号，里面包含商品图路径、尺码表图片路径、颜色、尺码、SKU 数量和 `SKU明细JSON`。`SKU明细` 与 `尺码表` 仍保留为人工核对和明细追溯使用。

## 本地开发

```bash
npm install
npm run dev
```

开发应用启动后，在窗口里选择商品资料文件夹和输出目录，再粘贴款号开始处理。

## Windows 打包

在 Windows 电脑上运行：

```bash
npm ci
npm run dist:win
```

打包完成后，产物会出现在 `release/` 目录：

- `中控台-Setup-0.2.1-x64.exe`：安装包，适合固定中控电脑使用。
- `中控台-Portable-0.2.1-x64.exe`：便携包，适合拷贝到其他设备试用。

如果不想在本地打包，可以进入 GitHub 仓库的 `Actions` 页面，手动运行 `Build Windows App`。运行完成后，在该次 workflow 的 `Artifacts` 中下载 `zhongkongtai-windows`。

国内网络如果下载 Electron 失败，可以在 PowerShell 里先设置镜像后再安装/打包：

```powershell
$env:npm_config_electron_mirror="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm ci
npm run dist:win
```

`dist:win` 只负责生成本地安装包和便携包，不会自动发布 GitHub Release；GitHub Actions 会把 `release/*.exe` 上传为 artifact。

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
