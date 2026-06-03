"""
使用 Playwright + WPS JSAPI (异步) 获取金山云文档Excel数据 - 完整列版
提取全部列（不限制30列），确保回款相关字段完整
"""
import csv
import json
import time
import sys
import os

# 安全导入 playwright：打包模式下通过 importlib 加载脚本时，
# 若 stdout/stderr 被重定向为 StringIO，import 可能静默失败，
# 因此用 try/except 显式捕获并给出友好提示
try:
    from playwright.sync_api import sync_playwright
except ImportError as _e:
    sync_playwright = None
    _playwright_import_error = str(_e)
else:
    _playwright_import_error = None

# 安全输出函数：--noconsole 打包模式下 sys.stdout 可能为 NullWriter，
# print() 虽不报错但输出丢失，因此同时写入 stderr 和日志
_output_lines = []
def _print(msg):
    """安全打印：输出到 stdout + 内部缓冲区"""
    _output_lines.append(msg)
    try:
        if sys.stdout:
            print(msg)
    except Exception:
        pass

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

DEFAULT_URL = "https://yundocs.qianxin-inc.cn/weboffice/l/sRs8GgCmE2ygb"
URL = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
# PyInstaller 打包后，__file__ 指向 _MEIPASS 临时目录，数据文件在 exe 目录
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "yundocs_data")

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    try:
        _run_fetch()
    except Exception as e:
        err_msg = str(e)
        # 识别 Playwright 浏览器未安装的特殊错误
        if any(kw in err_msg.lower() for kw in ['not found', 'no executable', 'install chromium', 'executable doesn\'t exist', '未找到可用浏览器']):
            _print("[ERROR] 未找到可用浏览器！请安装 Google Chrome 或确认 Microsoft Edge 可用后重试")
        else:
            _print(f"[ERROR] 数据提取异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

def _run_fetch():
    """核心提取逻辑"""
    if sync_playwright is None:
        err_detail = f": {_playwright_import_error}" if _playwright_import_error else ""
        raise RuntimeError(f"Playwright 库加载失败{err_detail}，请确认程序打包完整或已安装 playwright")
    with sync_playwright() as p:
        # 浏览器启动策略：Chrome → Edge → Playwright自带Chromium，逐级回退
        # Windows 10/11 自带 Edge，因此大多数用户无需安装额外浏览器
        browser = None
        browser_name = ''
        browsers_to_try = [
            ('chrome', 'Google Chrome'),
            ('msedge', 'Microsoft Edge'),
        ]
        for channel, name in browsers_to_try:
            try:
                browser = p.chromium.launch(headless=True, channel=channel)
                browser_name = name
                _print(f"[INFO] 使用 {name} 浏览器进行数据提取")
                break
            except Exception as e:
                if 'not found' in str(e).lower() or 'no executable' in str(e).lower():
                    _print(f"[INFO] 未检测到 {name}，尝试下一个浏览器...")
                else:
                    _print(f"[WARN] {name} 启动异常: {e}")
        
        if browser is None:
            try:
                browser = p.chromium.launch(headless=True)
                browser_name = 'Playwright Chromium'
                _print("[INFO] 使用 Playwright 自带 Chromium 浏览器")
            except Exception as e:
                _print(f"[ERROR] 所有浏览器均不可用: {e}")
                raise RuntimeError("未找到可用浏览器！请安装 Google Chrome 或确认 Microsoft Edge 可用后重试")
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        _print(f"[INFO] 正在打开云文档: {URL}")
        page.goto(URL, wait_until="domcontentloaded", timeout=120000)
        
        _print("[INFO] 等待文档加载...")
        time.sleep(10)
        
        # 等待 WPSOpenApi 出现（轮询，超时120秒）
        _print("[INFO] 等待WPS API就绪（最长120秒）...")
        try:
            page.wait_for_function(
                "() => typeof window.WPSOpenApi !== 'undefined'",
                timeout=120000
            )
            _print("[INFO] WPSOpenApi 已加载")
        except Exception as e:
            # API 未就绪，保存截图便于排查
            screenshot_path = os.path.join(OUTPUT_DIR, "screenshot_api_timeout.png")
            try:
                page.screenshot(path=screenshot_path, full_page=True)
                _print(f"[ERROR] WPSOpenApi 等待超时，截图已保存: {screenshot_path}")
            except:
                _print("[ERROR] WPSOpenApi 等待超时，截图保存失败")
            raise RuntimeError(f"WPSOpenApi 120秒内未加载，可能原因：1)未登录 2)网络不通 3)headless被检测。详见截图: {screenshot_path}")
        
        # 等待并真正 await documentReadyPromise（Promise resolve 后 Application 才可用）
        _print("[INFO] 等待文档就绪(等待 documentReadyPromise resolve)...")
        page.set_default_timeout(120000)
        try:
            page.evaluate("""async () => {
                if (window.WPSOpenApi && window.WPSOpenApi.documentReadyPromise) {
                    await window.WPSOpenApi.documentReadyPromise;
                } else {
                    throw new Error("WPSOpenApi or documentReadyPromise not available");
                }
            }""")
            _print("[INFO] documentReadyPromise 已 resolve")
        except Exception as e:
            screenshot_path = os.path.join(OUTPUT_DIR, "screenshot_doc_timeout.png")
            try:
                page.screenshot(path=screenshot_path, full_page=True, timeout=10000)
            except:
                pass
            raise RuntimeError(f"documentReadyPromise 未 resolve: {e}，截图: {screenshot_path}")
        
        # 等待 ActiveWorkbook 就绪（显式轮询，含调试信息）
        # 注意：不单独等待 Application，因为 Application 可能是异步 getter/Proxy，
        # 同步检查 !== undefined 不可靠，直接在 evaluate 中 async await 即可
        _print("[INFO] 等待 ActiveWorkbook 就绪...")
        max_wait = 120  # 秒
        start_time = time.time()
        wb_ready = False
        last_print_time = -10  # 确保首次也打印
        while time.time() - start_time < max_wait:
            try:
                # 关键：Application 是异步 getter，必须 await
                wb_info = page.evaluate("""async () => {
                    try {
                        let app = await window.WPSOpenApi.Application;
                        if (!app) return { ok: false, error: "Application is null" };
                        let wb = await app.ActiveWorkbook;
                        if (!wb) return { ok: false, error: "ActiveWorkbook is null" };
                        let sheets = await wb.Sheets;
                        let count = await sheets.Count;
                        return { ok: true, count: count };
                    } catch(e) {
                        return { ok: false, error: e.message };
                    }
                }""")
                elapsed = int(time.time() - start_time)
                if wb_info.get("ok") and wb_info.get("count", 0) > 0:
                    _print(f"[INFO] ActiveWorkbook 已就绪 ({elapsed}秒), Sheets: {wb_info['count']}")
                    wb_ready = True
                    break
                else:
                    if elapsed - last_print_time >= 10:
                        _print(f"[INFO] 仍在等待 ActiveWorkbook... ({elapsed}秒) 状态: {wb_info}")
                        last_print_time = elapsed
            except Exception as poll_err:
                elapsed = int(time.time() - start_time)
                if elapsed - last_print_time >= 10:
                    _print(f"[INFO] 轮询异常 ({elapsed}秒): {poll_err}")
                    last_print_time = elapsed
            time.sleep(3)
        
        if not wb_ready:
            # 保存截图用于排查
            debug_screenshot = os.path.join(OUTPUT_DIR, "screenshot_workbook_timeout.png")
            try:
                page.screenshot(path=debug_screenshot, timeout=10000)
            except:
                pass
            raise RuntimeError(f"ActiveWorkbook {max_wait}秒内未就绪（Sheet数为0），可能文档未完全加载。截图: {debug_screenshot}")
        
        # 获取Sheet列表（含可见性）
        _print("\n[INFO] === 获取Sheet列表 ===")
        sheet_names_result = page.evaluate("""async () => {
            try {
                let app = await window.WPSOpenApi.Application;
                let wb = await app.ActiveWorkbook;
                let sheets = await wb.Sheets;
                let count = await sheets.Count;
                let sheetNames = [];
                for (let i = 1; i <= count; i++) {
                    try {
                        let sheet = await sheets.Item(i);
                        let name = await sheet.Name;
                        let visible = await sheet.Visible;
                        // Visible: 0=Hidden, 1=Visible, 2=VeryHidden (xlSheetHidden/xlSheetVisible/xlSheetVeryHidden)
                        sheetNames.push({ index: i, name: name, visible: visible });
                    } catch(e) {
                        sheetNames.push({ index: i, error: e.message, visible: -1 });
                    }
                }
                return { count: count, sheets: sheetNames };
            } catch(e) {
                return { error: e.message };
            }
        }""")
        total_count = sheet_names_result.get('count', 0)
        # WPS JSAPI Visible 属性可能是布尔值(True/False)或数值(0/1/2)
        # True / 1 / xlSheetVisible(1) 表示可见，False / 0 / 2 表示隐藏
        visible_sheets = [s for s in sheet_names_result.get('sheets', []) if s.get('visible') in (True, 1)]
        hidden_count = total_count - len(visible_sheets)
        _print(f"[INFO] 共 {total_count} 个Sheet，其中 {len(visible_sheets)} 个可见，{hidden_count} 个隐藏")
        
        with open(f"{OUTPUT_DIR}/sheet_list.json", "w", encoding="utf-8") as f:
            json.dump(sheet_names_result, f, ensure_ascii=False, indent=2)
        
        # 逐Sheet提取数据 - 不限制列数
        all_data = {}
        
        if not sheet_names_result.get("error") and sheet_names_result.get("sheets"):
            for sheet_item in sheet_names_result["sheets"]:
                idx = sheet_item.get("index", 0)
                name = sheet_item.get("name", f"Sheet{idx}")
                if sheet_item.get("error"):
                    _print(f"[WARN] Sheet {idx} 有错误: {sheet_item['error']}，跳过")
                    continue
                # 跳过隐藏Sheet（Visible: True/1=可见, False/0/2=隐藏）
                if sheet_item.get("visible") not in (True, 1):
                    _print(f"[INFO] Sheet '{name}' (index={idx}) 为隐藏状态(visible={sheet_item.get('visible', '?')})，跳过")
                    continue
                
                _print(f"\n[INFO] --- 提取Sheet: {name} (index={idx}) ---")
                
                # 激活Sheet并提取数据
                sheet_data = page.evaluate(f"""async () => {{
                    try {{
                        let app = await window.WPSOpenApi.Application;
                        let wb = await app.ActiveWorkbook;
                        let sheets = await wb.Sheets;
                        let sheet = await sheets.Item({idx});
                        
                        // 激活
                        try {{ await sheet.Activate(); }} catch(e) {{}}
                        
                        let usedRange = await sheet.UsedRange;
                        let startRow = await usedRange.Row;
                        let startCol = await usedRange.Column;
                        let rows = await usedRange.Rows;
                        let cols = await usedRange.Columns;
                        let rowCount = await rows.Count;
                        let colCount = await cols.Count;
                        
                        // 不限制列数和行数，读取全部数据
                        let maxRows = rowCount;
                        let maxCols = colCount;  // 全部列
                        
                        // 读取Value2
                        let values = [];
                        try {{
                            let allVals = await usedRange.Value2;
                            if (allVals && Array.isArray(allVals)) {{
                                for (let r = 0; r < Math.min(allVals.length, maxRows); r++) {{
                                    let row = [];
                                    if (Array.isArray(allVals[r])) {{
                                        for (let c = 0; c < Math.min(allVals[r].length, maxCols); c++) {{
                                            let v = allVals[r][c];
                                            row.push(v !== null && v !== undefined ? String(v) : '');
                                        }}
                                    }} else {{
                                        row.push(allVals[r] !== null && allVals[r] !== undefined ? String(allVals[r]) : '');
                                    }}
                                    values.push(row);
                                }}
                            }} else if (allVals !== null && allVals !== undefined) {{
                                values.push([String(allVals)]);
                            }}
                        }} catch(e) {{
                            return {{ error: "Value2 failed: " + e.message, rowCount, colCount }};
                        }}
                        
                        return {{
                            name: "{name}",
                            startRow, startCol, rowCount, colCount,
                            extractedRows: values.length,
                            extractedCols: maxCols,
                            data: values
                        }};
                    }} catch(e) {{
                        return {{ error: e.message }};
                    }}
                }}""")
                
                if sheet_data.get("error"):
                    _print(f"  [ERROR] Value2失败: {sheet_data['error']}")
                    _print(f"  [INFO] 尝试逐单元格读取(异步)...")
                    # 对于大范围数据，逐单元格读取太慢，先尝试分块读取Value2
                    sheet_data = page.evaluate(f"""async () => {{
                        try {{
                            let app = await window.WPSOpenApi.Application;
                            let wb = await app.ActiveWorkbook;
                            let sheets = await wb.Sheets;
                            let sheet = await sheets.Item({idx});
                            let usedRange = await sheet.UsedRange;
                            
                            let startRow = await usedRange.Row;
                            let startCol = await usedRange.Column;
                            let rows = await usedRange.Rows;
                            let cols = await usedRange.Columns;
                            let rowCount = await rows.Count;
                            let colCount = await cols.Count;
                            
                            // 分块读取：每次读50行
                            let maxRows = rowCount;
                            let maxCols = Math.min(colCount, 50);
                            let values = [];
                            
                            for (let rStart = startRow; rStart < startRow + maxRows; rStart += 50) {{
                                let rEnd = Math.min(rStart + 49, startRow + maxRows - 1);
                                try {{
                                    let range = await sheet.Range(sheet.Cells(rStart, startCol), sheet.Cells(rEnd, startCol + maxCols - 1));
                                    let blockVals = await range.Value2;
                                    if (blockVals && Array.isArray(blockVals)) {{
                                        for (let r = 0; r < blockVals.length; r++) {{
                                            let row = [];
                                            if (Array.isArray(blockVals[r])) {{
                                                for (let c = 0; c < blockVals[r].length; c++) {{
                                                    let v = blockVals[r][c];
                                                    row.push(v !== null && v !== undefined ? String(v) : '');
                                                }}
                                            }} else {{
                                                row.push(blockVals[r] !== null && blockVals[r] !== undefined ? String(blockVals[r]) : '');
                                            }}
                                            values.push(row);
                                        }}
                                    }}
                                }} catch(e) {{
                                    // 如果分块也失败，用逐单元格读取这一块
                                    for (let r = rStart; r <= rEnd; r++) {{
                                        let row = [];
                                        let hasData = false;
                                        for (let c = startCol; c < startCol + maxCols; c++) {{
                                            let val = '';
                                            try {{
                                                let cell = await sheet.Cells(r, c);
                                                let v2 = await cell.Value2;
                                                val = (v2 !== null && v2 !== undefined) ? String(v2) : '';
                                                if (val) hasData = true;
                                            }} catch(e2) {{
                                                val = '';
                                            }}
                                            row.push(val);
                                        }}
                                        values.push(row);
                                    }}
                                }}
                            }}
                            
                            return {{
                                name: "{name}",
                                startRow, startCol, rowCount, colCount,
                                extractedRows: values.length,
                                extractedCols: maxCols,
                                data: values,
                                method: "chunked_or_cell"
                            }};
                        }} catch(e) {{
                            return {{ error: e.message }};
                        }}
                    }}""")
                
                if sheet_data.get("error"):
                    _print(f"  [ERROR] 提取失败: {sheet_data['error']}")
                    continue
                
                # 保存数据
                safe_name = "".join(c if c.isalnum() or c in "._- " else "_" for c in name)
                with open(f"{OUTPUT_DIR}/sheet_{safe_name}.json", "w", encoding="utf-8") as f:
                    json.dump(sheet_data, f, ensure_ascii=False, indent=2)
                
                # 保存CSV（使用标准逗号分隔符，csv.writer自动处理含逗号/换行/引号的字段 quoting）
                if sheet_data.get("data"):
                    with open(f"{OUTPUT_DIR}/sheet_{safe_name}.csv", "w", encoding="utf-8-sig", newline='') as f:
                        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
                        for row in sheet_data["data"]:
                            # null/undefined 输入：空值统一转为空字符串；换行符替换为空格避免行拆分
                            cleaned = [str(c).replace('\r\n', ' ').replace('\n', ' ').replace('\r', ' ') if c is not None else '' for c in row]
                            writer.writerow(cleaned)
                
                all_data[name] = sheet_data.get("data", [])
                
                rows = sheet_data.get("extractedRows", 0)
                cols = sheet_data.get("extractedCols", 0)
                total_cols = sheet_data.get("colCount", 0)
                method = sheet_data.get("method", "Value2")
                _print(f"  [OK] {rows}行 x {cols}列 (实际总列数: {total_cols}, 方法: {method})")
                
                # 打印表头（第一行）用于字段分析
                if sheet_data.get("data") and len(sheet_data["data"]) > 0:
                    header = sheet_data["data"][0]
                    non_empty_headers = [(i, h) for i, h in enumerate(header) if h and h.strip()]
                    _print(f"  [表头] 共{len(non_empty_headers)}个非空字段:")
                    for i, h in non_empty_headers[:20]:
                        _print(f"    列{i}: {h[:50]}")
                    if len(non_empty_headers) > 20:
                        _print(f"    ... 还有{len(non_empty_headers)-20}个字段")
                        for i, h in non_empty_headers[20:]:
                            _print(f"    列{i}: {h[:50]}")
                
                time.sleep(1)
        
        # 保存全部数据
        with open(f"{OUTPUT_DIR}/all_sheets_data.json", "w", encoding="utf-8") as f:
            json.dump(all_data, f, ensure_ascii=False, indent=2)
        _print(f"\n[INFO] 所有数据已保存到 {OUTPUT_DIR}/all_sheets_data.json")
        
        # 截图（不阻塞主流程，超时或失败仅打印警告）
        try:
            page.screenshot(path=f"{OUTPUT_DIR}/screenshot_final.png", full_page=True, timeout=60000)
        except Exception as e:
            _print(f"[WARN] 最终截图失败: {e}")
        
        _print("\n[INFO] 数据提取完成，关闭浏览器...")
        browser.close()

if __name__ == "__main__":
    main()