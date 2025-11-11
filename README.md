## transformer-data

将包含 JSON 负载的 `.txt` 文件解析为 CSV（支持多文件合并）。

### 功能
- 多文件选择，合并为单个 CSV 输出
- 智能提取产品与 SKU 字段并去重（优先 `upcode`，其次关键字段拼接）
- Windows 图形化文件选择与保存对话框（PowerShell + WinForms）
- 打包为独立可执行文件（Windows）

### 运行环境
- Node.js 18+（若使用源码运行）
- Windows 10/11（图形化对话框）

### 快速开始（源码运行）
```bash
# 安装依赖（仅用于打包；直接运行无需依赖）
npm install

# 直接运行（弹出选择 .txt 文件对话框，支持多选）
node parse_txt_to_csv.js

# 或通过命令行传入文件列表（以空格分隔多个文件）
node parse_txt_to_csv.js "D:\path\a.txt" "D:\path\b.txt"

# 若需在 CSV 中包含图片列，追加参数 --with-image（或 --image）
node parse_txt_to_csv.js --with-image "D:\path\a.txt" "D:\path\b.txt"
```

运行结束后会弹出保存 CSV 的对话框；若未选择，将默认保存到当前目录 `output_<timestamp>.csv`。

### 打包为 EXE
```bash
npm run build:win
```
生成的可执行文件位于 `dist/transformer-data.exe`。

### 数据抽取与去重逻辑概览
- 自动兼容多种可能的字段结构：`response.data.products`、`products`、`product_spu_list` 等
- SKU 优先：若存在 `skus`/`sku_list` 列表，逐个展开；否则使用产品本身数据
- 去重策略：
  - 若存在 `upcode`，按 `upcode` 去重
  - 否则按 `品种名称 + 售价 + 原价 + 活动方式` 组合键去重

### 常见问题
- 选择了多个文件却只处理一个：
  - 现已修复（统一强制 PowerShell UTF-8 输出并按 `\r?\n` 分割）
- 文本文件不是纯 JSON：
  - 程序会自动从首个 `{` 或 `[` 开始截取并解析

### 许可证
MIT License，详见 `LICENSE`。 


