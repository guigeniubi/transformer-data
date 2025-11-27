const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const os = require('os');

let rl = null;

// 使用PowerShell显示文件选择对话框
const showFileDialog = () => {
    try {
        // 创建临时PowerShell脚本
        const tempScript = path.join(os.tmpdir(), `temp_file_dialog_${Date.now()}.ps1`);
        const psScript = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = New-Object System.Text.UTF8Encoding
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "文本文件 (*.txt)|*.txt|所有文件 (*.*)|*.*"
$dialog.Multiselect = $true
$dialog.Title = "请选择要处理的.txt文件"
$result = $dialog.ShowDialog()
if ($result -eq 'OK') {
    $dialog.FileNames | ForEach-Object { Write-Output $_ }
}`;

        // 写入临时脚本文件
        fs.writeFileSync(tempScript, psScript, 'utf-8');

        // 执行PowerShell脚本
        const result = execSync(
            `powershell -NoProfile -STA -ExecutionPolicy Bypass -File "${tempScript}"`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );

        // 删除临时脚本
        try {
            fs.unlinkSync(tempScript);
        } catch (e) {
            // 忽略删除错误
        }

        const files = result.trim().split(/\r?\n/).filter(f => f.trim());
        return files.length > 0 ? files : null;
    } catch (error) {
        console.warn('无法显示文件选择对话框，将使用命令行输入方式');
        return null;
    }
};

// 检测文件来源（通过文件名前缀）
const detectSource = (filePath) => {
    const fileName = path.basename(filePath, '.txt').toLowerCase();
    if (fileName.startsWith('hcapi')) {
        return 'meituan';
    } else if (fileName.startsWith('venus')) {
        return 'eleme';
    }
    return 'unknown';
};

// 提取美团产品数据
const extractMeituanProductData = (data, storeName = '') => {
    const rows = [];

    // 调试：打印数据结构
    console.log('  数据结构检查:');
    console.log('    - 顶层keys:', Object.keys(data).slice(0, 5));

    // 检查是否有response字段
    const response = data.response || data;

    // 调试：检查response结构
    if (response.data) {
        console.log('    - response.data存在, keys:', Object.keys(response.data).slice(0, 5));
    }

    // 尝试从数据中提取店名（不再写入CSV，仅用于潜在逻辑扩展）
    let extractedStoreName = storeName || response.data?.poi_name || response.poi_name || response.data?.shop_name || response.shop_name || '';

    // 获取产品列表 - 尝试多种可能的路径
    let products = [];
    if (response.data && response.data.products) {
        products = response.data.products;
    } else if (response.products) {
        products = response.products;
    } else if (data.data && data.data.products) {
        products = data.data.products;
    } else if (data.products) {
        products = data.products;
    } else if (response.data && Array.isArray(response.data.product_spu_list)) {
        // 兼容 data.product_spu_list 结构
        products = response.data.product_spu_list;
    } else if (data.data && Array.isArray(data.data.product_spu_list)) {
        products = data.data.product_spu_list;
    }

    console.log(`    - 找到 ${products.length} 个产品`);

    // 遍历每个产品
    products.forEach(product => {
        const productName = product.name || product.show_name || product.spu_name || '';
        const monthSales = product.month_saled || product.monthly_sales || 0;
        const monthSalesContent = product.month_saled_content || product.monthly_sales_text || String(monthSales);
        const productImage = product.picture || product.image || product.image_url || product.pic_url || '';

        // 获取SKU列表
        const skus = product.skus || product.sku_list || [];

        // 如果没有SKU，使用产品本身的数据
        if (skus.length === 0) {
            rows.push({
                upcode: product.upccode || '',
                品种名称: productName,
                月销量: monthSalesContent,
                售价: product.price || product.min_price || product.min_sku_price || '',
                原价: product.origin_price || product.underline_price || product.original_price || '',
                活动方式: product.promotion_info || product.activity_tag || product.activity_act_text || product.promotion || '',
                库存: product.stock || product.real_stock || product.quantity || '',
                图片: productImage
            });
        } else {
            // 遍历每个SKU
            skus.forEach(sku => {
                const skuImage = sku.picture || sku.image || sku.image_url || sku.pic_url || productImage || '';
                rows.push({
                    upcode: sku.upccode || sku.upc || '',
                    品种名称: productName,
                    月销量: monthSalesContent,
                    售价: sku.price || sku.current_price || '',
                    原价: sku.origin_price || sku.original_price || '',
                    活动方式: sku.promotion_info ||
                        sku.activity_act_text ||
                        product.promotion_info ||
                        product.activity_tag ||
                        product.activity_act_text ||
                        product.promotion || '',
                    库存: sku.stock || sku.real_stock || sku.quantity || '',
                    图片: skuImage
                });
            });
        }
    });

    return rows;
};

// 提取饿了么产品数据
const extractElemeProductData = (data, storeName = '') => {
    const rows = [];

    console.log('  数据结构检查（饿了么）:');
    console.log('    - 顶层keys:', Object.keys(data).slice(0, 5));

    // 饿了么数据结构：data.data[0].foods
    let foods = [];
    if (data.data && data.data.data && Array.isArray(data.data.data) && data.data.data.length > 0) {
        // 遍历所有分类，收集所有foods
        data.data.data.forEach(category => {
            if (category.foods && Array.isArray(category.foods)) {
                foods.push(...category.foods);
            }
        });
    }

    console.log(`    - 找到 ${foods.length} 个产品`);

    // 遍历每个产品
    foods.forEach(food => {
        const item = food.item || food;
        if (!item) return;

        const productName = item.title || item.itemTitle || '';
        const monthSalesContent = item.monthSellFakeText || item.sellText || item.monthSellFake || item.monthSell || '';
        
        // 价格单位是分，需要转换为元
        const currentPrice = item.currentPrice?.price || item.currentPrice || 0;
        const originalPrice = item.originalPrice?.price || item.originalPrice || 0;
        const salePrice = currentPrice ? (currentPrice / 100).toFixed(2) : '';
        const origPrice = originalPrice ? (originalPrice / 100).toFixed(2) : '';

        // 活动信息
        const activities = item.itemActivities || [];
        const activityText = activities.length > 0 
            ? (activities[0].tagText || activities[0].tagDetailTextShort || activities[0].tagDetailText || '')
            : (item.itemLimitText || '');

        // 库存
        const stockModel = item.stockModel || {};
        const stock = stockModel.leftQuantity !== undefined ? stockModel.leftQuantity : (stockModel.quantity || '');

        // 图片
        const imageUrl = item.mainPictUrl || (item.imageList && item.imageList[0]) || '';

        // upcode
        const upcode = item.barcode || '';

        rows.push({
            upcode: upcode,
            品种名称: productName,
            月销量: monthSalesContent,
            售价: salePrice,
            原价: origPrice,
            活动方式: activityText,
            库存: stock,
            图片: imageUrl
        });
    });

    return rows;
};

// 提取产品数据的统一入口
const extractProductData = (data, storeName = '', source = 'meituan') => {
    if (source === 'eleme') {
        return extractElemeProductData(data, storeName);
    } else {
        return extractMeituanProductData(data, storeName);
    }
};

// 读取JSON文件，跳过URL和Request部分
const readJsonFile = (filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // 查找JSON响应的开始位置（第一个{或[）
        let jsonStart = -1;
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            if (char === '{' || char === '[') {
                jsonStart = i;
                break;
            }
        }

        if (jsonStart === -1) {
            console.error(`在文件中未找到JSON响应: ${filePath}`);
            return null;
        }

        // 提取JSON部分
        const jsonContent = content.substring(jsonStart);

        // 尝试解析JSON
        const data = JSON.parse(jsonContent);
        console.log(`  JSON解析成功，顶层keys: ${Object.keys(data).slice(0, 5).join(', ')}`);
        return data;
    } catch (error) {
        console.error(`读取文件失败 ${filePath}:`, error.message);
        console.error(`错误详情: ${error.stack}`);
        return null;
    }
};

// 将数据转换为CSV格式
const convertToCSV = (rows) => {
    if (rows.length === 0) return '';

    // CSV头部（包含图片列）
    const headers = ['upcode', '品种名称', '月销量', '售价', '原价', '活动方式', '库存', '图片'];

    // 转义CSV字段
    const escapeCSV = (field) => {
        if (field === null || field === undefined) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    // 生成CSV内容
    const csvRows = [
        headers.map(escapeCSV).join(','),
        ...rows.map(row =>
            headers.map(header => escapeCSV(row[header] || '')).join(',')
        )
    ];

    return csvRows.join('\n');
};

// 行去重：
// - 优先使用 upcode 去重；
// - 若无 upcode，使用 品种名称+售价+原价+活动方式 作为退化键；
const deduplicateRows = (rows) => {
    const seenKeys = new Set();
    const uniqueRows = [];

    rows.forEach(row => {
        const upcode = row.upcode ? String(row.upcode).trim() : '';
        const key = upcode
            ? `up:${upcode}`
            : `name:${String(row['品种名称'] || '').trim()}|price:${String(row['售价'] || '').trim()}|orig:${String(row['原价'] || '').trim()}|promo:${String(row['活动方式'] || '').trim()}`;

        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueRows.push(row);
        }
    });

    return uniqueRows;
};

// 使用PowerShell显示保存文件对话框
const showSaveDialog = (suggestedFileName) => {
    try {
        const tempScript = path.join(os.tmpdir(), `temp_save_dialog_${Date.now()}.ps1`);
        const psScript = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = New-Object System.Text.UTF8Encoding
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Filter = "CSV 文件 (*.csv)|*.csv|所有文件 (*.*)|*.*"
$dialog.Title = "请选择保存CSV的位置和文件名"
$dialog.InitialDirectory = [Environment]::CurrentDirectory
$dialog.FileName = "${suggestedFileName}"
$result = $dialog.ShowDialog()
if ($result -eq 'OK') {
    Write-Output $dialog.FileName
}`;
        fs.writeFileSync(tempScript, psScript, 'utf-8');
        const result = execSync(
            `powershell -NoProfile -STA -ExecutionPolicy Bypass -File "${tempScript}"`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        try { fs.unlinkSync(tempScript); } catch (e) {}
        const output = result.trim();
        return output ? output : null;
    } catch (error) {
        console.warn('无法显示保存对话框，将使用命令行输入或默认路径');
        return null;
    }
};

// 主函数
const main = async () => {
    let filePaths = [];

    // 检查命令行参数
    const args = process.argv.slice(2);

    if (args.length > 0) {
        // 使用命令行参数
        filePaths = args;
    } else {
        // 尝试显示文件选择对话框
        console.log('正在打开文件选择对话框...');
        const selectedFiles = showFileDialog();

        if (selectedFiles && selectedFiles.length > 0) {
            filePaths = selectedFiles;
            console.log(`已选择 ${filePaths.length} 个文件`);
        } else {
            // 如果对话框被取消或失败，使用交互式输入
            rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            console.log('请选择要处理的.txt文件（输入文件路径，多个文件用逗号分隔，或按回车使用默认文件）:');

            const input = await new Promise(resolve => {
                rl.question('', resolve);
            });

            if (input.trim()) {
                // 用户输入了文件路径
                filePaths = input.split(',').map(p => p.trim()).filter(p => p);
            } else {
                // 使用默认文件
                filePaths = [path.join('d:', 'Data', 'hcapi_20251111_013212_288.txt')];
            }
        }
    }

    // 验证文件是否存在
    const validFiles = filePaths.filter(filePath => {
        if (fs.existsSync(filePath)) {
            return true;
        } else {
            console.warn(`文件不存在: ${filePath}`);
            return false;
        }
    });

    if (validFiles.length === 0) {
        console.error('没有找到有效的文件！');
        if (rl) rl.close();
        return;
    }

    console.log(`\n开始处理 ${validFiles.length} 个文件...\n`);

    const allRows = [];

    // 处理每个文件
    validFiles.forEach((filePath, index) => {
        console.log(`处理文件 ${index + 1}/${validFiles.length}: ${path.basename(filePath)}`);

        // 检测文件来源
        const source = detectSource(filePath);
        console.log(`  来源: ${source === 'meituan' ? '美团' : source === 'eleme' ? '饿了么' : '未知'}`);

        // 从文件名提取店名（可选）
        const fileName = path.basename(filePath, '.txt');
        const storeName = fileName.split('_')[0] || '';

        // 读取JSON数据
        const data = readJsonFile(filePath);
        if (!data) {
            console.warn(`跳过文件: ${filePath}`);
            return;
        }

        // 根据来源提取数据
        const rows = extractProductData(data, storeName, source);
        console.log(`  提取了 ${rows.length} 条记录`);
        allRows.push(...rows);
    });

    if (allRows.length === 0) {
        console.error('没有提取到任何数据！');
        if (rl) rl.close();
        return;
    }

    // 去重
    const before = allRows.length;
    const dedupedRows = deduplicateRows(allRows);
    const after = dedupedRows.length;
    if (after !== before) {
        console.log(`\n去重完成：${before} -> ${after} 条（去除 ${before - after} 条重复）`);
    } else {
        console.log('\n未检测到重复记录');
    }

    // 生成CSV
    const csvContent = convertToCSV(dedupedRows);

    // 保存CSV文件（支持选择保存位置和名称）
    const defaultName = `output_${Date.now()}.csv`;
    let outputPath = showSaveDialog(defaultName);

    if (!outputPath) {
        // 不进行任何控制台输入，直接使用默认路径
        outputPath = path.join(process.cwd(), defaultName);
    }

    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    console.log(`\n成功！共提取 ${allRows.length} 条记录`);
    console.log(`CSV文件已保存到: ${outputPath}`);

    if (rl) rl.close();
};

// 运行主函数
main().catch(error => {
    console.error('发生错误:', error);
    if (rl) rl.close();
    process.exit(1);
});

