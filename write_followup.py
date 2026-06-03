"""
写入跟进记录到云文档 - 使用 Playwright + WPS JSAPI
将用户在前端填写的跟进记录异步写入云文档的「项目回款跟进记录」Sheet
"""
import json
import time
import sys
import os

try:
    from playwright.sync_api import sync_playwright
except ImportError as _e:
    sync_playwright = None
    _playwright_import_error = str(_e)
else:
    _playwright_import_error = None

_output_lines = []
def _print(msg):
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

SHEET_NAME = '项目回款跟进记录'
HEADERS = ['记录编号', '项目编号', '项目名称',
           '节点动作完成时间', '跟进时间', '跟进人',
           '跟进类型', '跟进内容', '下次跟进计划日期', '跟进状态']

# PyInstaller 打包后路径处理
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

FOLLOWUP_FILE = os.path.join(BASE_DIR, 'data', 'followup_records.json')


def load_followup_records():
    """加载本地跟进记录"""
    if os.path.exists(FOLLOWUP_FILE):
        try:
            with open(FOLLOWUP_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_followup_records(records):
    """保存本地跟进记录"""
    os.makedirs(os.path.dirname(FOLLOWUP_FILE), exist_ok=True)
    with open(FOLLOWUP_FILE, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def write_record_to_cloud(record, cloud_url):
    """
    写入一条跟进记录到云文档的「项目回款跟进记录」Sheet
    record: dict，包含11个字段
    cloud_url: 云文档URL
    返回: (success: bool, message: str)
    """
    if sync_playwright is None:
        err_detail = f": {_playwright_import_error}" if _playwright_import_error else ""
        return False, f"Playwright 库加载失败{err_detail}"

    with sync_playwright() as p:
        browser = None
        # 浏览器启动策略：Chrome → Edge → Playwright自带Chromium
        browsers_to_try = [
            ('chrome', 'Google Chrome'),
            ('msedge', 'Microsoft Edge'),
        ]
        for channel, name in browsers_to_try:
            try:
                browser = p.chromium.launch(headless=True, channel=channel)
                _print(f"[INFO] 使用 {name} 浏览器")
                break
            except Exception:
                continue

        if browser is None:
            try:
                browser = p.chromium.launch(headless=True)
            except Exception as e:
                return False, f"未找到可用浏览器: {e}"

        try:
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            )
            page = context.new_page()

            # 打开云文档
            _print(f"[INFO] 正在打开云文档: {cloud_url}")
            page.goto(cloud_url, wait_until="domcontentloaded", timeout=120000)
            time.sleep(10)

            # 等待WPS API就绪
            _print("[INFO] 等待WPS API就绪...")
            page.wait_for_function(
                "() => typeof window.WPSOpenApi !== 'undefined'",
                timeout=120000
            )
            _print("[INFO] WPSOpenApi 已加载")

            # 等待文档就绪
            page.set_default_timeout(120000)
            page.evaluate("""async () => {
                if (window.WPSOpenApi && window.WPSOpenApi.documentReadyPromise) {
                    await window.WPSOpenApi.documentReadyPromise;
                }
            }""")
            _print("[INFO] 文档已就绪")

            # 等待ActiveWorkbook就绪
            max_wait = 120
            start_time = time.time()
            wb_ready = False
            while time.time() - start_time < max_wait:
                try:
                    wb_info = page.evaluate("""async () => {
                        try {
                            let app = await window.WPSOpenApi.Application;
                            let wb = await app.ActiveWorkbook;
                            if (!wb) return { ok: false };
                            let sheets = await wb.Sheets;
                            let count = await sheets.Count;
                            return { ok: true, count: count };
                        } catch(e) {
                            return { ok: false, error: e.message };
                        }
                    }""")
                    if wb_info.get("ok") and wb_info.get("count", 0) > 0:
                        wb_ready = True
                        break
                except Exception:
                    pass
                time.sleep(3)

            if not wb_ready:
                return False, "ActiveWorkbook 未就绪"

            # 查找或创建「项目回款跟进记录」Sheet
            sheet_info = page.evaluate(f"""async () => {{
                try {{
                    let app = await window.WPSOpenApi.Application;
                    let wb = await app.ActiveWorkbook;
                    let sheets = await wb.Sheets;
                    let count = await sheets.Count;
                    
                    for (let i = 1; i <= count; i++) {{
                        let sheet = await sheets.Item(i);
                        let name = await sheet.Name;
                        if (name === '{SHEET_NAME}') {{
                            await sheet.Activate();
                            let usedRange = await sheet.UsedRange;
                            let rows = await usedRange.Rows;
                            let rowCount = await rows.Count;
                            return {{ found: true, index: i, rowCount: rowCount }};
                        }}
                    }}
                    return {{ found: false }};
                }} catch(e) {{
                    return {{ found: false, error: e.message }};
                }}
            }}""")

            if not sheet_info.get("found"):
                return False, f"云文档中未找到Sheet '{SHEET_NAME}'，请先手动创建该Sheet页"
            else:
                next_row = sheet_info["rowCount"] + 1
                sheet_index = sheet_info["index"]
                _print(f"[INFO] 找到Sheet '{SHEET_NAME}'，当前 {sheet_info['rowCount']} 行，追加到第 {next_row} 行")

            # 写入记录数据
            _print(f"[INFO] 正在写入第 {next_row} 行...")
            data_values = [
                record.get('记录编号', ''),
                record.get('项目编号', ''),
                record.get('项目名称', ''),
                record.get('节点动作完成时间', ''),
                record.get('跟进时间', ''),
                record.get('跟进人', ''),
                record.get('跟进类型', ''),
                record.get('跟进内容', '').replace("'", "\\'").replace('\n', ' '),
                record.get('下次跟进计划日期', ''),
                record.get('跟进状态', ''),
            ]

            write_result = page.evaluate(f"""async () => {{
                try {{
                    let app = await window.WPSOpenApi.Application;
                    let wb = await app.ActiveWorkbook;
                    let sheets = await wb.Sheets;
                    
                    // 重新查找Sheet（如果刚创建的话）
                    let sheet = null;
                    let count = await sheets.Count;
                    for (let i = 1; i <= count; i++) {{
                        let s = await sheets.Item(i);
                        let n = await s.Name;
                        if (n === '{SHEET_NAME}') {{
                            sheet = s;
                            break;
                        }}
                    }}
                    if (!sheet) return {{ ok: false, error: 'Sheet not found' }};
                    
                    let data = {json.dumps(data_values)};
                    let row = {next_row};
                    
                    for (let c = 1; c <= data.length; c++) {{
                        let cell = await sheet.Cells(row, c);
                        cell.Value2 = data[c-1];
                    }}

                    return {{ ok: true }};
                }} catch(e) {{
                    return {{ ok: false, error: e.message }};
                }}
            }}""")

            if not write_result.get("ok"):
                return False, f"写入数据失败: {write_result.get('error', '未知错误')}"

            # 保存文档
            _print("[INFO] 正在保存文档...")
            try:
                page.evaluate("""async () => {
                    let app = await window.WPSOpenApi.Application;
                    let wb = await app.ActiveWorkbook;
                    await wb.Save();
                }""")
                _print("[INFO] 文档保存成功")
            except Exception as e:
                _print(f"[WARN] 保存文档失败: {e}")

            browser.close()
            _print(f"[OK] 跟进记录 {record.get('记录编号', '')} 写入云文档成功")
            return True, "写入成功"

        except Exception as e:
            try:
                browser.close()
            except Exception:
                pass
            _print(f"[ERROR] 写入云文档异常: {e}")
            return False, str(e)


def delete_record_from_cloud(record_id, cloud_url):
    """
    根据记录编号在云文档「项目回款跟进记录」Sheet中删除对应行
    record_id: 要删除的记录编号（如 FU-20260601-0001）
    cloud_url: 云文档URL
    返回: (success: bool, message: str)
    """
    if sync_playwright is None:
        err_detail = f": {_playwright_import_error}" if _playwright_import_error else ""
        return False, f"Playwright 库加载失败{err_detail}"

    with sync_playwright() as p:
        browser = None
        browsers_to_try = [
            ('chrome', 'Google Chrome'),
            ('msedge', 'Microsoft Edge'),
        ]
        for channel, name in browsers_to_try:
            try:
                browser = p.chromium.launch(headless=True, channel=channel)
                _print(f"[INFO] 使用 {name} 浏览器")
                break
            except Exception:
                continue

        if browser is None:
            try:
                browser = p.chromium.launch(headless=True)
            except Exception as e:
                return False, f"未找到可用浏览器: {e}"

        try:
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            )
            page = context.new_page()

            _print(f"[INFO] 正在打开云文档: {cloud_url}")
            page.goto(cloud_url, wait_until="domcontentloaded", timeout=120000)
            time.sleep(10)

            _print("[INFO] 等待WPS API就绪...")
            page.wait_for_function(
                "() => typeof window.WPSOpenApi !== 'undefined'",
                timeout=120000
            )
            _print("[INFO] WPSOpenApi 已加载")

            page.set_default_timeout(120000)
            page.evaluate("""async () => {
                if (window.WPSOpenApi && window.WPSOpenApi.documentReadyPromise) {
                    await window.WPSOpenApi.documentReadyPromise;
                }
            }""")
            _print("[INFO] 文档已就绪")

            # 等待ActiveWorkbook就绪
            max_wait = 120
            start_time = time.time()
            wb_ready = False
            while time.time() - start_time < max_wait:
                try:
                    wb_info = page.evaluate("""async () => {
                        try {
                            let app = await window.WPSOpenApi.Application;
                            let wb = await app.ActiveWorkbook;
                            if (!wb) return { ok: false };
                            let sheets = await wb.Sheets;
                            let count = await sheets.Count;
                            return { ok: true, count: count };
                        } catch(e) {
                            return { ok: false, error: e.message };
                        }
                    }""")
                    if wb_info.get("ok") and wb_info.get("count", 0) > 0:
                        wb_ready = True
                        break
                except Exception:
                    pass
                time.sleep(3)

            if not wb_ready:
                return False, "ActiveWorkbook 未就绪"

            # 查找目标行并删除
            delete_result = page.evaluate(f"""async () => {{
                try {{
                    let app = await window.WPSOpenApi.Application;
                    let wb = await app.ActiveWorkbook;
                    let sheets = await wb.Sheets;
                    let count = await sheets.Count;

                    // 查找「项目回款跟进记录」Sheet
                    let sheet = null;
                    for (let i = 1; i <= count; i++) {{
                        let s = await sheets.Item(i);
                        let n = await s.Name;
                        if (n === '{SHEET_NAME}') {{
                            sheet = s;
                            break;
                        }}
                    }}
                    if (!sheet) return {{ ok: false, error: '云文档中未找到Sheet: {SHEET_NAME}' }};

                    // 获取已使用行数
                    let usedRange = await sheet.UsedRange;
                    let rows = await usedRange.Rows;
                    let rowCount = await rows.Count;

                    // 从第2行开始搜索（第1行是表头）
                    let targetRow = -1;
                    for (let r = 2; r <= rowCount; r++) {{
                        let cell = await sheet.Cells(r, 1);
                        let v = await cell.Value2;
                        if (v && String(v).trim() === '{record_id}') {{
                            targetRow = r;
                            break;
                        }}
                    }}

                    if (targetRow === -1) return {{ ok: false, error: '云文档中未找到记录: {record_id}' }};

                    // 删除该行（整行上移）
                    let rowRange = await sheet.Rows(targetRow);
                    await rowRange.Delete();
                    return {{ ok: true, row: targetRow }};
                }} catch(e) {{
                    return {{ ok: false, error: e.message }};
                }}
            }}""")

            if not delete_result.get("ok"):
                return False, f"删除失败: {delete_result.get('error', '未知错误')}"

            _print(f"[INFO] 已删除第 {delete_result.get('row')} 行，记录: {record_id}")

            # 保存文档
            _print("[INFO] 正在保存文档...")
            try:
                page.evaluate("""async () => {
                    let app = await window.WPSOpenApi.Application;
                    let wb = await app.ActiveWorkbook;
                    await wb.Save();
                }""")
                _print("[INFO] 文档保存成功")
            except Exception as e:
                _print(f"[WARN] 保存文档失败: {e}")

            browser.close()
            return True, f"记录 {record_id} 已从云文档删除"

        except Exception as e:
            try:
                browser.close()
            except Exception:
                pass
            return False, str(e)


def update_record_in_cloud(record, cloud_url):
    """
    根据记录编号在云文档中找到对应行，原地更新该行数据
    record: dict，必须包含 '记录编号'
    cloud_url: 云文档URL
    返回: (success: bool, message: str)
    """
    record_id = record.get('记录编号', '')
    if not record_id:
        return False, "缺少记录编号"

    if sync_playwright is None:
        err_detail = f": {_playwright_import_error}" if _playwright_import_error else ""
        return False, f"Playwright 库加载失败{err_detail}"

    with sync_playwright() as p:
        browser = None
        browsers_to_try = [
            ('chrome', 'Google Chrome'),
            ('msedge', 'Microsoft Edge'),
        ]
        for channel, name in browsers_to_try:
            try:
                browser = p.chromium.launch(headless=True, channel=channel)
                break
            except Exception:
                continue

        if browser is None:
            try:
                browser = p.chromium.launch(headless=True)
            except Exception as e:
                return False, f"未找到可用浏览器: {e}"

        try:
            context = browser.new_context(viewport={"width": 1920, "height": 1080})
            page = context.new_page()

            _print(f"[INFO] 正在打开云文档: {cloud_url}")
            page.goto(cloud_url, wait_until="domcontentloaded", timeout=120000)
            time.sleep(10)

            page.wait_for_function("() => typeof window.WPSOpenApi !== 'undefined'", timeout=120000)
            page.evaluate("""async () => {
                if (window.WPSOpenApi && window.WPSOpenApi.documentReadyPromise) {
                    await window.WPSOpenApi.documentReadyPromise;
                }
            }""")

            max_wait, start = 120, time.time()
            wb_ready = False
            while time.time() - start < max_wait:
                try:
                    wb_info = page.evaluate("""async () => {
                        try {
                            let app = await window.WPSOpenApi.Application;
                            let wb = await app.ActiveWorkbook;
                            if (!wb) return { ok: false };
                            let sheets = await wb.Sheets;
                            let count = await sheets.Count;
                            return { ok: true, count: count };
                        } catch(e) { return { ok: false, error: e.message }; }
                    }""")
                    if wb_info.get("ok") and wb_info.get("count", 0) > 0:
                        wb_ready = True
                        break
                except Exception:
                    pass
                time.sleep(3)

            if not wb_ready:
                return False, "ActiveWorkbook 未就绪"

            data_values = [
                record.get('记录编号', ''),
                record.get('项目编号', ''),
                record.get('项目名称', ''),
                record.get('节点动作完成时间', ''),
                record.get('跟进时间', ''),
                record.get('跟进人', ''),
                record.get('跟进类型', ''),
                record.get('跟进内容', '').replace("'", "\\'").replace('\n', ' '),
                record.get('下次跟进计划日期', ''),
                record.get('跟进状态', ''),
            ]

            update_result = page.evaluate(f"""async () => {{
                try {{
                    let app = await window.WPSOpenApi.Application;
                    let wb = await app.ActiveWorkbook;
                    let sheets = await wb.Sheets;
                    let count = await sheets.Count;

                    let sheet = null;
                    for (let i = 1; i <= count; i++) {{
                        let s = await sheets.Item(i);
                        let n = await s.Name;
                        if (n === '{SHEET_NAME}') {{ sheet = s; break; }}
                    }}
                    if (!sheet) return {{ ok: false, error: 'Sheet not found' }};

                    let usedRange = await sheet.UsedRange;
                    let rows = await usedRange.Rows;
                    let rowCount = await rows.Count;

                    // 搜索记录编号所在行
                    let targetRow = -1;
                    for (let r = 2; r <= rowCount; r++) {{
                        let cell = await sheet.Cells(r, 1);
                        let v = await cell.Value2;
                        if (v && String(v).trim() === '{record_id}') {{
                            targetRow = r;
                            break;
                        }}
                    }}

                    if (targetRow === -1) {{
                        // 未找到：降级为追加新行
                        targetRow = rowCount + 1;
                    }}

                    let data = {json.dumps(data_values)};
                    for (let c = 1; c <= data.length; c++) {{
                        let cell = await sheet.Cells(targetRow, c);
                        cell.Value2 = data[c-1];
                    }}

                    return {{ ok: true, row: targetRow, isUpdate: targetRow <= rowCount }};
                }} catch(e) {{
                    return {{ ok: false, error: e.message }};
                }}
            }}""")

            if not update_result.get("ok"):
                return False, f"更新失败: {update_result.get('error', '未知错误')}"

            mode = "更新" if update_result.get("isUpdate") else "追加"
            _print(f"[INFO] 已{mode}第 {update_result.get('row')} 行，记录: {record_id}")

            try:
                page.evaluate("""async () => {
                    let app = await window.WPSOpenApi.Application;
                    let wb = await app.ActiveWorkbook;
                    await wb.Save();
                }""")
                _print("[INFO] 文档保存成功")
            except Exception as e:
                _print(f"[WARN] 保存文档失败: {e}")

            browser.close()
            return True, f"记录 {record_id} 已{mode}到云文档"

        except Exception as e:
            try:
                browser.close()
            except Exception:
                pass
            return False, str(e)


def write_pending_records(cloud_url):
    """
    批量写入所有待同步的跟进记录到云文档
    在数据同步时调用
    """
    records = load_followup_records()
    pending = [r for r in records if r.get('syncStatus') == '待同步']

    if not pending:
        _print("[INFO] 没有待同步的跟进记录")
        return True

    _print(f"[INFO] 发现 {len(pending)} 条待同步的跟进记录")

    success_count = 0
    for record in pending:
        ok, msg = write_record_to_cloud(record, cloud_url)
        if ok:
            # 更新本地记录状态
            for r in records:
                if r.get('记录编号') == record.get('记录编号'):
                    r['syncStatus'] = '已同步'
                    break
            success_count += 1
        else:
            _print(f"[ERROR] 记录 {record.get('记录编号')} 写入失败: {msg}")

    save_followup_records(records)
    _print(f"[OK] 批量写入完成: {success_count}/{len(pending)} 成功")
    return True


if __name__ == "__main__":
    # 命令行调用:
    #   python write_followup.py <cloud_url> [record_json]          → 写入单条
    #   python write_followup.py <cloud_url>                        → 批量写入待同步
    #   python write_followup.py <cloud_url> --delete <record_id>  → 删除指定记录
    if len(sys.argv) < 2:
        print("用法: python write_followup.py <cloud_url> [record_json] [--delete <record_id>]")
        sys.exit(1)

    url = sys.argv[1]

    if len(sys.argv) >= 4 and sys.argv[2] == '--delete':
        # 删除指定记录
        record_id = sys.argv[3]
        ok, msg = delete_record_from_cloud(record_id, url)
        if ok:
            print(f"[OK] {msg}")
            sys.exit(0)
        else:
            print(f"[ERROR] {msg}")
            sys.exit(1)
    elif len(sys.argv) >= 3:
        # 写入单条记录
        try:
            record = json.loads(sys.argv[2])
            if record.get('__action__') == 'delete':
                ok, msg = delete_record_from_cloud(record.get('记录编号', ''), url)
            elif record.get('__action__') == 'update':
                ok, msg = update_record_in_cloud(record, url)
            else:
                ok, msg = write_record_to_cloud(record, url)
            if ok:
                print(f"[OK] {msg}")
                sys.exit(0)
            else:
                print(f"[ERROR] {msg}", file=sys.stderr)
                print(f"[ERROR] {msg}")
                sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"[ERROR] JSON解析失败: {e}")
            sys.exit(1)
    else:
        # 批量写入待同步记录
        write_pending_records(url)