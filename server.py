"""
本地服务：提供静态文件服务 + 数据同步API
启动方式: python server.py
访问地址: http://localhost:8080
"""
import http.server
import sys
# --noconsole 模式下 sys.stdout/stderr 为 None，需安全处理
try:
    if sys.stdout is not None: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass
try:
    if sys.stderr is not None: sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass
import csv
import json
import os
import subprocess
import threading
import time
import functools
import logging
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler
from urllib.parse import urlparse, parse_qs

# ── Playwright 依赖预导入（确保 PyInstaller 打包时追踪完整依赖链） ──
if getattr(sys, 'frozen', False):
    # 打包模式：playwright 必须存在，否则同步功能无法使用
    from playwright.sync_api import sync_playwright  # noqa: F401
else:
    # 开发模式：未安装时忽略，不影响启动
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
    except ImportError:
        pass

# ── 打包模式下 Playwright 环境配置 ──
if getattr(sys, 'frozen', False):
    # 使用系统已安装的 Chrome，不需要 Playwright 自带 Chromium
    os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '0')

PORT = 8080
# PyInstaller 打包后，BASE_DIR 应为 exe 所在目录而非临时解压目录
# STATIC_DIR 为静态Web文件目录（打包后从 _MEIPASS 临时目录读取）
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    STATIC_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    STATIC_DIR = BASE_DIR
PARENT_DIR = os.path.dirname(BASE_DIR)

# ─── 日志配置 ───────────────────────────────────────────────
LOG_DIR = os.path.join(BASE_DIR, 'log')
os.makedirs(LOG_DIR, exist_ok=True)

logger = logging.getLogger('payment_review')
logger.setLevel(logging.DEBUG)

# 文件处理器：每天轮转，保留7天
file_handler = TimedRotatingFileHandler(
    filename=os.path.join(LOG_DIR, 'server.log'),
    when='midnight',
    interval=1,
    backupCount=7,
    encoding='utf-8'
)
file_handler.suffix = '%Y-%m-%d'
file_handler.setLevel(logging.DEBUG)
file_formatter = logging.Formatter('%(asctime)s %(levelname)-5s %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)

# 控制台处理器：仅在 stdout 可用时添加（python 下可见，pythonw 下无）
if sys.stdout:
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(file_formatter)
    logger.addHandler(console_handler)

# 同步状态
sync_state = {"running": False, "progress": 0, "message": ""}
sync_url = ""
# 导入状态（与同步互斥）
import_state = {"running": False, "progress": 0, "message": ""}
followup_sync_state = {}  # key: 记录编号, value: {status:'syncing'|'success'|'failed', message:''}
# 子进程引用（用于停止同步/导入时终止）
active_process = None

# ── 跟进记录相关 ──
FOLLOWUP_FILE = os.path.join(BASE_DIR, 'data', 'followup_records.json')
FOLLOWUP_TYPES = ['电话沟通', '邮件推动', '现场拜访', '内部协调', '合同确认', '里程碑跟进', '回款确认', '其他']
FOLLOWUP_STATUSES = ['跟进中', '已解决', '暂停跟进', '需升级处理', '已取消']

def _load_followup_records():
    """加载本地跟进记录"""
    if os.path.exists(FOLLOWUP_FILE):
        try:
            with open(FOLLOWUP_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []
    return []

def _save_followup_records(records):
    """保存本地跟进记录"""
    os.makedirs(os.path.dirname(FOLLOWUP_FILE), exist_ok=True)
    with open(FOLLOWUP_FILE, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

def _get_next_record_num(today_str):
    """获取当日下一个记录序号"""
    records = _load_followup_records()
    prefix = f'FU-{today_str}-'
    max_num = 0
    for r in records:
        rid = r.get('记录编号', '')
        if rid.startswith(prefix):
            try:
                num = int(rid.split('-')[-1])
                if num > max_num:
                    max_num = num
            except ValueError:
                pass
    return max_num + 1

def _get_node_action_date(project_id):
    """从analysis_data.js中读取项目的节点动作完成时间"""
    data_file = os.path.join(BASE_DIR, 'data', 'analysis_data.js')
    if not os.path.exists(data_file):
        return ''
    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            content = f.read()
        # 尝试从JS中提取项目数据
        import re
        # 查找包含该项目编号的节点数据
        pattern = rf'projectId\s*:\s*["\']?{re.escape(project_id)}["\']?'
        if re.search(pattern, content):
            # 尝试提取 nextActionDate 或类似字段
            # 在preprocess_data.py输出中查找
            action_pattern = rf'projectId\s*:\s*["\']?{re.escape(project_id)}["\']?[^}}]*?nextActionDate\s*:\s*["\']([^"\']+)["\']'
            m = re.search(action_pattern, content, re.DOTALL)
            if m:
                return m.group(1)
        return ''
    except Exception:
        return ''

def _write_followup_async(record, cloud_url):
    """异步写入跟进记录到云文档（含进度追踪）"""
    record_id = record.get('记录编号', '')
    global followup_sync_state
    try:
        # 初始化同步状态追踪
        followup_sync_state[record_id] = {"status": "syncing", "message": "正在连接云文档..."}
        logger.info(f"[followup-sync] {record_id} 开始同步到云文档")

        write_script, write_cwd = _find_script("write_followup.py")
        if not write_script:
            logger.error("写入脚本 write_followup.py 不存在")
            followup_sync_state[record_id] = {"status": "failed", "message": "写入脚本不存在，同步失败"}
            _update_followup_sync_status(record_id, '同步失败')
            return
        if getattr(sys, 'frozen', False):
            # 打包模式：直接导入运行
            followup_sync_state[record_id] = {"status": "syncing", "message": "正在写入云文档..."}
            old_argv = sys.argv[:]
            sys.argv = [write_script, cloud_url, json.dumps(record, ensure_ascii=False)]
            try:
                _run_script_direct(write_script, 'write_followup', write_cwd)
                followup_sync_state[record_id] = {"status": "success", "message": "✅ 已同步到云文档"}
                logger.info(f"跟进记录 {record_id} 写入云文档成功")
                _update_followup_sync_status(record_id, '已同步')
            except Exception as e:
                logger.error(f"异步写入云文档失败: {e}")
                followup_sync_state[record_id] = {"status": "failed", "message": f"同步失败: {str(e)[:80]}"}
                _update_followup_sync_status(record_id, '同步失败')
            finally:
                sys.argv = old_argv
        else:
            # 开发模式：subprocess
            followup_sync_state[record_id] = {"status": "syncing", "message": "正在写入云文档..."}
            cmd = [sys.executable, '-u', write_script, cloud_url,
                   json.dumps(record, ensure_ascii=False)]
            result = subprocess.run(cmd, capture_output=True, text=True,
                                   cwd=write_cwd, encoding='utf-8', errors='replace', timeout=300)
            if result.returncode == 0:
                followup_sync_state[record_id] = {"status": "success", "message": "✅ 已同步到云文档"}
                logger.info(f"跟进记录 {record_id} 写入云文档成功")
                _update_followup_sync_status(record_id, '已同步')
            else:
                err_msg = (result.stderr or result.stdout or '未知错误')[:100]
                followup_sync_state[record_id] = {"status": "failed", "message": f"✕ 同步失败: {err_msg}"}
                logger.error(f"跟进记录写入云文档失败: stderr={result.stderr[:200] if result.stderr else ''} stdout={result.stdout[:200] if result.stdout else ''}")
                _update_followup_sync_status(record_id, '同步失败')
    except Exception as e:
        logger.error(f"异步写入云文档异常: {e}", exc_info=True)
        followup_sync_state[record_id] = {"status": "failed", "message": f"✕ 同步异常: {str(e)[:80]}"}
        _update_followup_sync_status(record_id, '同步失败')

def _update_followup_sync_status(record_id, sync_status):
    """更新本地JSON中指定记录的syncStatus字段"""
    try:
        records = _load_followup_records()
        for r in records:
            if r.get('记录编号') == record_id:
                r['syncStatus'] = sync_status
                break
        _save_followup_records(records)
        logger.info(f"[followup-sync] {record_id} syncStatus 更新为: {sync_status}")
    except Exception as e:
        logger.error(f"[followup-sync] 更新syncStatus失败: {e}")

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # 默认使用 STATIC_DIR 服务静态文件（打包后从 _MEIPASS，开发时与 BASE_DIR 相同）
        super().__init__(*args, directory=STATIC_DIR, **kwargs)
    
    def translate_path(self, path):
        """重写路径转换：静态文件优先从 STATIC_DIR 查找，数据文件从 BASE_DIR 查找"""
        # 先按默认逻辑从 STATIC_DIR 解析
        static_path = super().translate_path(path)
        if os.path.exists(static_path):
            return static_path
        # 如果 STATIC_DIR 中找不到，尝试从 BASE_DIR 查找（data/, yundocs_data/ 等运行时数据）
        rel = os.path.relpath(static_path, STATIC_DIR)
        base_path = os.path.join(BASE_DIR, rel)
        if os.path.exists(base_path):
            return base_path
        return static_path  # 都找不到则返回默认路径（让404处理）
    
    def end_headers(self):
        # Disable caching for JS, CSS, and HTML files
        parsed_path = urlparse(self.path).path
        if parsed_path.endswith(('.js', '.css', '.html')) or '?' in self.path:
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()
    
    def parse_path(self):
        parsed = urlparse(self.path)
        return parse_qs(parsed.query)
    
    def do_GET(self):
        parsed = urlparse(self.path)
        
        # 拦截静态文件请求，强制添加 charset=utf-8
        if parsed.path.endswith(('.js', '.css', '.html')):
            self._serve_static_with_charset()
            return
        
        if parsed.path == '/api/sync':
            self.handle_sync()
        elif parsed.path == '/api/sync-status':
            self.handle_sync_status()
        elif parsed.path == '/api/clear-data':
            self.handle_clear_data()
        elif parsed.path == '/api/stop-sync':
            self.handle_stop_sync()
        elif parsed.path == '/api/stop-import':
            self.handle_stop_import()
        elif parsed.path == '/api/import-status':
            self.handle_import_status()
        elif parsed.path == '/api/stop':
            self.handle_stop_server()
        elif parsed.path.startswith('/api/followup/list'):
            self.handle_followup_list()
        elif parsed.path == '/api/followup/types':
            self.handle_followup_types()
        elif parsed.path.startswith('/api/followup/sync-status'):
            self.handle_followup_sync_status()
        else:
            super().do_GET()
    
    def _serve_static_with_charset(self):
        """服务静态文件并强制添加 charset=utf-8"""
        try:
            path = self.translate_path(self.path)
            if os.path.isdir(path):
                self.send_error(403, "Cannot list directories")
                return
            # 获取文件MIME类型
            content_type = self.guess_type(path)
            # 强制添加 charset=utf-8
            if content_type and 'charset=' not in content_type:
                content_type = content_type + '; charset=utf-8'
            elif not content_type:
                content_type = 'application/octet-stream'
            
            # 读取文件
            with open(path, 'rb') as f:
                content = f.read()
            
            # 发送响应
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, str(e))
    
    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/import':
            self.handle_import()
        elif parsed.path == '/api/followup/add':
            self.handle_followup_add()
        elif parsed.path == '/api/followup/delete':
            self.handle_followup_delete()
        elif parsed.path == '/api/followup/update':
            self.handle_followup_update()
        else:
            self.send_response(404)
            self.end_headers()
    
    def handle_sync(self):
        global sync_state, sync_url
        # Parse URL parameter from query string
        qs = self.parse_path()
        url_vals = qs.get('url', [])
        sync_url = url_vals[0] if url_vals else ''
        # 互斥检查：导入进行中时禁止同步
        if import_state["running"]:
            self._json_response({"running": False, "progress": 0, "message": "导入正在进行中，请等待完成或停止导入后再同步"})
            return
        if sync_state["running"]:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(f"data: {json.dumps(sync_state)}\n\n".encode('utf-8'))
            return
        
        # Start sync in background thread
        sync_state = {"running": True, "progress": 0, "message": "启动同步..."}
        sync_thread = threading.Thread(target=run_sync, daemon=True)
        sync_thread.start()
        
        # SSE stream
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        while True:
            data = json.dumps(sync_state)
            self.wfile.write(f"data: {data}\n\n".encode('utf-8'))
            self.wfile.flush()
            if sync_state["progress"] >= 100 or not sync_state["running"]:
                break
            time.sleep(0.5)
    
    def handle_sync_status(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(sync_state).encode('utf-8'))
    
    def handle_clear_data(self):
        """删除业务数据文件 data/analysis_data.js 及原始提取数据目录 yundocs_data/"""
        data_file = os.path.join(BASE_DIR, 'data', 'analysis_data.js')
        yundocs_dir = os.path.join(BASE_DIR, 'yundocs_data')
        result = {"success": False, "message": ""}
        msgs = []
        # 删除分析数据文件
        if os.path.exists(data_file):
            try:
                os.remove(data_file)
                msgs.append("分析数据文件已删除")
            except Exception as e:
                msgs.append(f"分析数据文件删除失败: {str(e)}")
        else:
            msgs.append("分析数据文件不存在")
        # 删除原始提取数据目录
        if os.path.exists(yundocs_dir):
            try:
                import shutil
                shutil.rmtree(yundocs_dir)
                os.makedirs(yundocs_dir, exist_ok=True)
                msgs.append("原始数据目录已清空")
            except Exception as e:
                msgs.append(f"原始数据目录清空失败: {str(e)}")
        else:
            msgs.append("原始数据目录不存在")
            os.makedirs(yundocs_dir, exist_ok=True)
        result = {"success": True, "message": "；".join(msgs)}
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode('utf-8'))

    def do_OPTIONS(self):
        """CORS 预检请求处理"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def handle_import(self):
        """POST /api/import - 接收前端上传的Excel JSON数据"""
        global import_state
        # 互斥检查
        if sync_state["running"]:
            self._json_response({"success": False, "message": "同步正在进行中，请等待完成或停止同步后再导入"})
            return
        if import_state["running"]:
            self._json_response({"success": False, "message": "导入正在进行中，请等待完成或停止上传"})
            return
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
        except Exception as e:
            self._json_response({"success": False, "message": f"请求数据解析失败: {str(e)}"})
            return
        # 启动导入线程
        import_state = {"running": True, "progress": 5, "message": "正在保存数据..."}
        import_thread = threading.Thread(target=run_import, args=(data,), daemon=True)
        import_thread.start()
        self._json_response({"success": True, "message": "导入已开始"})
    
    def handle_stop_sync(self):
        """GET /api/stop-sync - 停止同步"""
        global sync_state, active_process
        if not sync_state["running"]:
            self._json_response({"success": True, "message": "同步未在运行"})
            return
        sync_state = {"running": False, "progress": 0, "message": "同步已停止"}
        logger.info("用户停止同步")
        # 终止子进程
        _terminate_active_process()
        self._json_response({"success": True, "message": "同步已停止"})
    
    def handle_stop_import(self):
        """GET /api/stop-import - 停止导入"""
        global import_state, active_process
        if not import_state["running"]:
            self._json_response({"success": True, "message": "导入未在运行"})
            return
        import_state = {"running": False, "progress": 0, "message": "导入已停止"}
        logger.info("用户停止导入")
        _terminate_active_process()
        self._json_response({"success": True, "message": "导入已停止"})
    
    def handle_import_status(self):
        """GET /api/import-status - 查询导入状态"""
        self._json_response(import_state)
    
    def handle_stop_server(self):
        """GET /api/stop - 停止服务（前端页面停止按钮调用）"""
        logger.info("收到停止服务请求，正在关闭服务...")
        self._json_response({"status": "stopping", "message": "服务正在停止..."})
        # 在新线程中延迟退出，确保响应先发送完成
        def _shutdown():
            time.sleep(0.5)
            logger.info("正在终止服务进程...")
            # 使用 taskkill 强制终止当前进程（最可靠的方式）
            pid = os.getpid()
            try:
                _stop_flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
                subprocess.Popen(
                    ['taskkill', '/f', '/pid', str(pid)],
                    creationflags=_stop_flags
                )
            except Exception:
                pass
            # 双保险：os._exit 强制退出
            os._exit(0)
        threading.Thread(target=_shutdown, daemon=False).start()
    
    def handle_followup_add(self):
        """POST /api/followup/add - 添加跟进记录"""
        global sync_url
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
        except Exception as e:
            self._json_response({"success": False, "message": f"请求数据解析失败: {str(e)}"})
            return
        
        # 校验必填字段
        required = ['项目编号', '项目名称', '跟进人', '跟进类型', '跟进内容', '跟进状态']
        for field in required:
            if not data.get(field):
                self._json_response({"success": False, "message": f"缺少必填字段: {field}"})
                return
        
        # 校验跟进内容长度
        if len(data.get('跟进内容', '')) > 500:
            self._json_response({"success": False, "message": "跟进内容不能超过500字"})
            return
        
        # 校验跟进人长度
        if len(data.get('跟进人', '')) > 20:
            self._json_response({"success": False, "message": "跟进人姓名不能超过20个字符"})
            return
        
        # 校验跟进类型
        if data.get('跟进类型') not in FOLLOWUP_TYPES:
            self._json_response({"success": False, "message": f"跟进类型无效，可选: {', '.join(FOLLOWUP_TYPES)}"})
            return
        
        # 校验跟进状态
        if data.get('跟进状态') not in FOLLOWUP_STATUSES:
            self._json_response({"success": False, "message": f"跟进状态无效，可选: {', '.join(FOLLOWUP_STATUSES)}"})
            return
        
        # 自动生成记录编号
        today_str = datetime.now().strftime('%Y%m%d')
        record_num = _get_next_record_num(today_str)
        data['记录编号'] = f'FU-{today_str}-{record_num:04d}'
        
        # 自动填充跟进时间
        data['跟进时间'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # 自动填充节点动作完成时间
        node_action_date = _get_node_action_date(data['项目编号'])
        data['节点动作完成时间'] = node_action_date or data.get('节点动作完成时间', '')
        
        # 下次跟进计划日期默认=节点动作完成时间
        if not data.get('下次跟进计划日期') and node_action_date:
            data['下次跟进计划日期'] = node_action_date
        
        # 标记同步状态
        data['syncStatus'] = '待同步'
        
        # 暂存本地JSON
        records = _load_followup_records()
        records.append(data)
        _save_followup_records(records)
        logger.info(f"跟进记录已暂存本地: {data['记录编号']}")
        
        # 异步写入云文档
        cloud_url = sync_url or data.get('cloudUrl', '')
        if cloud_url:
            threading.Thread(target=_write_followup_async, args=[data, cloud_url], daemon=True).start()
        else:
            logger.warning("未设置云文档URL，跟进记录仅保存在本地")
        
        self._json_response({
            "success": True,
            "记录编号": data['记录编号'],
            "message": "跟进记录已保存" + ("，正在同步到云文档" if cloud_url else "（仅本地保存）")
        })
    
    def handle_followup_delete(self):
        """POST /api/followup/delete - 删除跟进记录"""
        global sync_url
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
        except Exception as e:
            self._json_response({"success": False, "message": f"请求数据解析失败: {str(e)}"})
            return

        record_id = data.get('记录编号', '')
        if not record_id:
            self._json_response({"success": False, "message": "缺少记录编号"})
            return

        # 从本地JSON中删除指定记录
        records = _load_followup_records()
        original_count = len(records)
        records = [r for r in records if r.get('记录编号') != record_id]

        if len(records) == original_count:
            self._json_response({"success": False, "message": f"未找到记录: {record_id}"})
            return

        _save_followup_records(records)
        logger.info(f"跟进记录已删除: {record_id}")

        # 清理同步状态
        if record_id in followup_sync_state:
            del followup_sync_state[record_id]

        # 云文档同步：根据记录编号删除云文档中对应行
        cloud_url = sync_url or data.get('cloudUrl', '')
        if cloud_url:
            delete_record = {"__action__": "delete", "记录编号": record_id}
            threading.Thread(target=_write_followup_async, args=[delete_record, cloud_url], daemon=True).start()
            self._json_response({"success": True, "message": f"跟进记录 {record_id} 已删除，正在同步到云文档"})
        else:
            self._json_response({"success": True, "message": f"跟进记录 {record_id} 已删除（仅本地）"})
    
    def handle_followup_update(self):
        """POST /api/followup/update - 编辑跟进记录"""
        global sync_url
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
        except Exception as e:
            self._json_response({"success": False, "message": f"请求数据解析失败: {str(e)}"})
            return
        
        record_id = data.get('记录编号', '')
        if not record_id:
            self._json_response({"success": False, "message": "缺少记录编号"})
            return
        
        # 校验可编辑字段
        if data.get('跟进人') and len(data.get('跟进人', '')) > 20:
            self._json_response({"success": False, "message": "跟进人姓名不能超过20个字符"})
            return
        if data.get('跟进内容') and len(data.get('跟进内容', '')) > 500:
            self._json_response({"success": False, "message": "跟进内容不能超过500字"})
            return
        if data.get('跟进类型') and data.get('跟进类型') not in FOLLOWUP_TYPES:
            self._json_response({"success": False, "message": f"跟进类型无效，可选: {', '.join(FOLLOWUP_TYPES)}"})
            return
        if data.get('跟进状态') and data.get('跟进状态') not in FOLLOWUP_STATUSES:
            self._json_response({"success": False, "message": f"跟进状态无效，可选: {', '.join(FOLLOWUP_STATUSES)}"})
            return
        
        # 从本地JSON中查找并更新记录
        records = _load_followup_records()
        found = False
        for r in records:
            if r.get('记录编号') == record_id:
                # 仅更新允许编辑的字段
                editable_fields = ['跟进人', '跟进类型', '跟进内容', '跟进状态', '下次跟进计划日期']
                for field in editable_fields:
                    if field in data and data[field]:
                        r[field] = data[field]
                # 标记为待重新同步
                r['syncStatus'] = '待同步'
                found = True
                break
        
        if not found:
            self._json_response({"success": False, "message": f"未找到记录: {record_id}"})
            return
        
        _save_followup_records(records)
        logger.info(f"跟进记录已更新: {record_id}")
        
        # 异步重新写入云文档
        updated_record = None
        for r in records:
            if r.get('记录编号') == record_id:
                updated_record = r
                break
        
        cloud_url = sync_url or data.get('cloudUrl', '')
        if cloud_url and updated_record:
            # 清理旧同步状态
            if record_id in followup_sync_state:
                del followup_sync_state[record_id]
            updated_record['__action__'] = 'update'
            threading.Thread(target=_write_followup_async, args=[updated_record, cloud_url], daemon=True).start()
        else:
            logger.warning("未设置云文档URL，更新仅保存在本地")
        
        self._json_response({
            "success": True,
            "记录编号": record_id,
            "message": "跟进记录已更新" + ("，正在同步到云文档" if cloud_url else "（仅本地保存）")
        })
    
    def handle_followup_list(self):
        """GET /api/followup/list/<project_id>?limit=5 - 获取项目跟进记录"""
        parsed = urlparse(self.path)
        # 从路径提取项目编号: /api/followup/list/PRJ-001
        parts = parsed.path.split('/')
        project_id = parts[-1] if len(parts) > 3 else ''
        
        qs = self.parse_path()
        limit = int(qs.get('limit', [5])[0])
        
        # 合并本地记录和云文档同步的记录
        all_records = _load_followup_records()
        project_records = [r for r in all_records if r.get('项目编号') == project_id]
        
        # 按跟进时间降序排列，取最近N条
        project_records.sort(key=lambda r: r.get('跟进时间', ''), reverse=True)
        recent = project_records[:limit]
        
        # 移除内部字段
        for r in recent:
            r.pop('syncStatus', None)
        
        self._json_response({"success": True, "records": recent, "total": len(project_records)})
    
    def handle_followup_types(self):
        """GET /api/followup/types - 获取跟进类型和状态选项"""
        self._json_response({
            "success": True,
            "跟进类型": FOLLOWUP_TYPES,
            "跟进状态": FOLLOWUP_STATUSES
        })
    
    def handle_followup_sync_status(self):
        """GET /api/followup/sync-status?recordId=xxx - 查询跟进记录云同步状态"""
        qs = self.parse_path()
        record_id = qs.get('recordId', [''])[0]
        if not record_id:
            # 返回所有正在同步的状态
            self._json_response({"success": True, "states": followup_sync_state})
            return
        state = followup_sync_state.get(record_id, {"status": "unknown", "message": "未找到同步状态"})
        self._json_response({"success": True, "recordId": record_id, "state": state})
    
    def _json_response(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def log_message(self, format, *args):
        # API 请求记录到日志文件
        msg = format % args
        if '/api/' in str(args[0]):
            logger.debug(f"HTTP {msg}")
        else:
            logger.info(f"HTTP {msg}")
            # 同时输出到控制台（python 下）
            try:
                if sys.stdout:
                    sys.stderr.write(f"{msg}\n")
            except:
                pass

def _check_browser_available():
    """检测系统是否安装了可用浏览器（Chrome 或 Edge）
    返回 (可用: bool, 浏览器名称: str)
    """
    # Windows 下 Chrome 和 Edge 的常见安装路径
    chrome_paths = [
        os.path.join(os.environ.get('PROGRAMFILES', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(os.environ.get('PROGRAMFILES(X86)', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
    edge_paths = [
        os.path.join(os.environ.get('PROGRAMFILES', ''), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        os.path.join(os.environ.get('PROGRAMFILES(X86)'), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]
    for p in chrome_paths:
        if os.path.isfile(p):
            return True, 'Google Chrome'
    for p in edge_paths:
        if os.path.isfile(p):
            return True, 'Microsoft Edge'
    return False, ''

def _find_script(name):
    """查找脚本：优先STATIC_DIR（打包内嵌），其次BASE_DIR，再次PARENT_DIR"""
    # 打包模式下，.py 文件内嵌在 _MEIPASS 临时目录中
    if getattr(sys, 'frozen', False):
        static = os.path.join(STATIC_DIR, name)
        if os.path.exists(static):
            return static, BASE_DIR  # cwd 用 BASE_DIR，因为数据文件在那里
    local = os.path.join(BASE_DIR, name)
    if os.path.exists(local):
        return local, BASE_DIR
    parent = os.path.join(PARENT_DIR, name)
    if os.path.exists(parent):
        return parent, PARENT_DIR
    return None, BASE_DIR

def _run_script_direct(module_path, module_name, cwd=None):
    """在进程内模式直接调用并执行脚本模块（而非subprocess调用），
    将脚本的 _output_lines 和 stdout/stderr 输出捕获合并返回
    
    注：先加载模块（确保stdout/stderr可用），再运行main()。
    不再重定向stdout/stderr，以避免 playwright 等依赖库的 import 初始化
    在重定向环境下静默失败导致 sync_playwright 未定义 NameError。
    """
    import importlib.util
    import io
    old_cwd = os.getcwd()
    if cwd:
        os.chdir(cwd)
    mod = None
    try:
        # 确保 stdout/stderr 可用（PyInstaller --noconsole 下可能为 None/NullWriter）
        if sys.stdout is None:
            sys.stdout = io.StringIO()
        if sys.stderr is None:
            sys.stderr = io.StringIO()
        
        # 加载并执行模块（不重定向stdout/stderr，确保 playwright import 正常）
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        
        # 直接运行 main()，不再重定向 stdout/stderr
        # 之前重定向会导致 playwright 初始化静默失败（NameError: sync_playwright not defined）
        if hasattr(mod, 'main'):
            mod.main()
    finally:
        os.chdir(old_cwd)
        # 收集输出：优先使用脚本的 _output_lines 缓冲区，其次使用捕获的 stdout
        output_parts = []
        # 尝试获取脚本的 _output_lines（fetch_yundocs_full.py 中定义的安全输出缓冲区）
        if mod and hasattr(mod, '_output_lines') and mod._output_lines:
            output_parts.extend(mod._output_lines)
        # 注意：不再重定向stdout/stderr，输出直接写入日志和标准流
        # 将捕获的输出记录到日志
        for line in output_parts:
            if '[ERROR]' in line:
                logger.error(f"[fetch] {line}")
            elif '[WARN]' in line:
                logger.warning(f"[fetch] {line}")
            elif '[OK]' in line or '[INFO]' in line:
                logger.info(f"[fetch] {line}")
            else:
                logger.debug(f"[fetch] {line}")
    return '\n'.join(output_parts)


def run_sync():
    """执行数据同步：提取+预处理"""
    global sync_state, sync_url
    
    try:
        # Step 0: 预检查浏览器可用性（打包模式下 Playwright 需要 Chrome 或 Edge）
        if getattr(sys, 'frozen', False):
            browser_ok, browser_name = _check_browser_available()
            if not browser_ok:
                sync_state = {"running": False, "progress": 0, "message": "同步失败：未检测到Chrome浏览器，请安装Google Chrome或确认Microsoft Edge可用后重试"}
                logger.error("同步失败：未检测到可用浏览器（Chrome/Edge），中止同步")
                return
            logger.info(f"浏览器预检查通过: {browser_name}")
        
        # Step 1: Run data extraction (Playwright)
        sync_state = {"running": True, "progress": 5, "message": "正在启动浏览器..."}
        logger.info("同步开始：启动浏览器")
        time.sleep(1)
        
        sync_state = {"running": True, "progress": 10, "message": "正在连接WPS云文档..."}
        logger.info("同步：连接WPS云文档")
        
        # 查找提取脚本
        fetch_script, fetch_cwd = _find_script("fetch_yundocs_full.py")
        if not fetch_script:
            sync_state = {"running": True, "progress": 15, "message": "提取脚本不存在，使用缓存数据..."}
            logger.warning("提取脚本不存在，使用缓存数据")
            time.sleep(1)
        else:
            sync_state = {"running": True, "progress": 15, "message": "正在提取数据..."}
            logger.info(f"开始提取数据，脚本: {fetch_script}")
            
            if getattr(sys, 'frozen', False):
                # ── 打包模式：直接导入运行（目标机器无Python，无法subprocess） ──
                sync_state = {"running": True, "progress": 20, "message": "正在提取数据（直接模式）..."}
                fetch_output = ''
                try:
                    # 传递URL参数：临时修改sys.argv
                    old_argv = sys.argv[:]
                    sys.argv = [fetch_script]
                    if sync_url:
                        sys.argv.append(sync_url)
                    fetch_output = _run_script_direct(fetch_script, 'fetch_yundocs_full', fetch_cwd)
                    sync_state = {"running": True, "progress": 75, "message": "数据提取完成，开始预处理..."}
                    logger.info("数据提取完成（直接模式），开始预处理")
                except SystemExit as e:
                    # fetch脚本中sys.exit()会被捕获
                    if e.code and e.code != 0:
                        # 检测浏览器相关错误，给出友好提示
                        _browser_keywords = ['not found', 'no executable', 'install chromium',
                                             "executable doesn't exist", '浏览器未安装', '未找到可用浏览器']
                        output_lower = (fetch_output or '').lower()
                        if any(kw.lower() in output_lower for kw in _browser_keywords):
                            sync_state = {"running": False, "progress": 0,
                                          "message": "同步失败：未检测到Chrome浏览器，请安装Google Chrome或确认Microsoft Edge可用后重试"}
                            logger.error(f"数据提取失败（浏览器不可用），退出码: {e.code}，中止同步")
                            return
                        # 其他提取错误
                        err_lines = [l for l in (fetch_output or '').splitlines()
                                     if '[ERROR]' in l or 'Error' in l or 'Exception' in l]
                        err_summary = err_lines[-3:] if err_lines else [f"退出码: {e.code}"]
                        sync_state = {"running": False, "progress": 0,
                                      "message": f"数据提取失败: {'; '.join(err_summary)}"}
                        logger.error(f"数据提取失败，退出码: {e.code}，中止同步")
                        return
                    else:
                        sync_state = {"running": True, "progress": 75, "message": "数据提取完成，开始预处理..."}
                except Exception as e:
                    # 检测浏览器相关异常
                    err_str = str(e).lower()
                    _browser_keywords = ['not found', 'no executable', '浏览器', 'browser']
                    if any(kw in err_str for kw in _browser_keywords):
                        sync_state = {"running": False, "progress": 0,
                                      "message": "同步失败：未检测到Chrome浏览器，请安装Google Chrome或确认Microsoft Edge可用后重试"}
                        logger.error(f"数据提取异常（浏览器相关）: {e}，中止同步")
                        return
                    sync_state = {"running": False, "progress": 0,
                                  "message": f"数据提取异常: {str(e)[:100]}"}
                    logger.error(f"数据提取异常: {e}", exc_info=True)
                    return
                finally:
                    sys.argv = old_argv
            else:
                # ── 开发模式：使用subprocess运行（可解析进度输出） ──
                cmd = [sys.executable, '-u', fetch_script]
                if sync_url:
                    cmd.append(sync_url)
                
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    cwd=fetch_cwd, encoding='utf-8', errors='replace'
                )
                
                sheet_count = 0
                error_lines = []
                for line in process.stdout:
                    line = line.strip()
                    if not line:
                        continue
                    if '[OK]' in line:
                        sheet_count += 1
                        progress = 15 + int(sheet_count / 9 * 60)
                        sync_state = {"running": True, "progress": min(progress, 75), "message": f"提取Sheet数据 ({sheet_count}/9)..."}
                        logger.info(f"[fetch] {line}")
                    elif '[INFO]' in line:
                        sync_state = {"running": True, "progress": sync_state["progress"], "message": line.replace('[INFO] ', '')}
                        logger.info(f"[fetch] {line}")
                    elif '[WARN]' in line:
                        logger.warning(f"[fetch] {line}")
                        error_lines.append(line.replace('[WARN] ', ''))
                    elif '[ERROR]' in line:
                        logger.error(f"[fetch] {line}")
                        error_lines.append(line.replace('[ERROR] ', ''))
                    else:
                        logger.debug(f"[fetch] {line}")
                        if any(kw in line for kw in ['Error', 'Exception', 'Traceback', 'error', 'exception', 'traceback', 'Failed', 'failed']):
                            error_lines.append(line)
                
                process.wait()
                if process.returncode != 0:
                    err_summary = error_lines[-3:] if error_lines else ["详见日志"]
                    sync_state = {"running": True, "progress": 75, "message": f"数据提取有错误: {'; '.join(err_summary)}"}
                    logger.warning(f"数据提取完成但有错误，返回码: {process.returncode}，错误: {error_lines}")
                else:
                    sync_state = {"running": True, "progress": 75, "message": "数据提取完成，开始预处理..."}
                    logger.info("数据提取完成，开始预处理")
        
        time.sleep(0.5)
        
        # Step 2: Run preprocessing
        sync_state = {"running": True, "progress": 80, "message": "正在预处理数据..."}
        logger.info("开始预处理数据")
        preprocess_script, preprocess_cwd = _find_script("preprocess_data.py")
        
        if not preprocess_script:
            sync_state = {"running": False, "progress": 0, "message": "预处理脚本不存在，无法完成同步"}
            logger.error("预处理脚本不存在，同步失败")
            return
        
        if getattr(sys, 'frozen', False):
            # ── 打包模式：直接导入运行 ──
            try:
                old_argv = sys.argv[:]
                sys.argv = [preprocess_script]
                _run_script_direct(preprocess_script, 'preprocess_data', preprocess_cwd)
                logger.info("预处理完成（直接模式）")
            except SystemExit as e:
                if e.code and e.code != 0:
                    sync_state = {"running": False, "progress": 0, "message": f"预处理失败（退出码:{e.code}）"}
                    logger.error(f"预处理失败，退出码: {e.code}")
                    return
            except Exception as e:
                sync_state = {"running": False, "progress": 0, "message": f"预处理失败: {str(e)[:100]}"}
                logger.error(f"预处理失败: {e}", exc_info=True)
                return
            finally:
                sys.argv = old_argv
        else:
            # ── 开发模式：使用subprocess ──
            process = subprocess.Popen(
                [sys.executable, '-u', preprocess_script],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                cwd=preprocess_cwd, encoding='utf-8', errors='replace'
            )
            
            preprocess_errors = []
            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue
                if '[OK]' in line or '[INFO]' in line:
                    sync_state = {"running": True, "progress": min(sync_state["progress"] + 3, 95), "message": line.replace('[INFO] ', '').replace('[OK] ', '')}
                    logger.info(f"[preprocess] {line}")
                elif '[WARN]' in line:
                    logger.warning(f"[preprocess] {line}")
                elif '[ERROR]' in line:
                    logger.error(f"[preprocess] {line}")
                    preprocess_errors.append(line.replace('[ERROR] ', ''))
                else:
                    logger.debug(f"[preprocess] {line}")
                    if any(kw in line for kw in ['Error', 'Exception', 'Traceback', 'error', 'Failed']):
                        preprocess_errors.append(line)
            
            process.wait()
            if process.returncode != 0:
                err_summary = preprocess_errors[-3:] if preprocess_errors else ["详见日志"]
                sync_state = {"running": False, "progress": 0, "message": f"预处理失败: {'; '.join(err_summary)}"}
                logger.error(f"预处理失败，返回码: {process.returncode}，错误: {preprocess_errors}")
                return
        
        sync_state = {"running": True, "progress": 100, "message": "同步完成！"}
        logger.info("同步完成")
        
    except Exception as e:
        sync_state = {"running": False, "progress": 0, "message": f"同步失败: {str(e)}"}
        logger.error(f"同步失败: {str(e)}", exc_info=True)
    finally:
        # Keep the completion state for a few seconds
        time.sleep(3)
        sync_state["running"] = False

def _terminate_active_process():
    """终止当前活跃的子进程"""
    global active_process
    if active_process is not None:
        try:
            logger.info(f"终止子进程 PID={active_process.pid}")
            active_process.kill()
            active_process = None
        except Exception as e:
            logger.warning(f"终止子进程失败: {e}")
            active_process = None

def run_import(data):
    """执行离线导入：保存JSON → 运行预处理脚本"""
    global import_state, active_process
    
    try:
        yundocs_dir = os.path.join(BASE_DIR, 'yundocs_data')
        os.makedirs(yundocs_dir, exist_ok=True)
        
        import_state = {"running": True, "progress": 10, "message": "正在保存导入数据..."}
        logger.info("离线导入开始：保存数据")
        
        # 保存 all_sheets_data.json
        all_data = data.get('allSheets', {})
        with open(os.path.join(yundocs_dir, 'all_sheets_data.json'), 'w', encoding='utf-8') as f:
            json.dump(all_data, f, ensure_ascii=False, indent=2)
        
        # 保存 sheet_list.json 和分Sheet文件
        sheet_list = []
        for sheet_name, sheet_rows in all_data.items():
            col_count = len(sheet_rows[0]) if sheet_rows else 0
            sheet_list.append({"index": len(sheet_list) + 1, "name": sheet_name})
            # 保存分Sheet JSON（与 fetch_yundocs_full.py 格式一致）
            safe_name = "".join(c if c.isalnum() or c in "._- " else "_" for c in sheet_name)
            sheet_data = {
                "name": sheet_name,
                "startRow": 1, "startCol": 1,
                "rowCount": len(sheet_rows), "colCount": col_count,
                "extractedRows": len(sheet_rows),
                "extractedCols": col_count,
                "data": sheet_rows
            }
            with open(os.path.join(yundocs_dir, f'sheet_{safe_name}.json'), 'w', encoding='utf-8') as f:
                json.dump(sheet_data, f, ensure_ascii=False, indent=2)
            # 保存CSV（使用标准逗号分隔符，csv.writer自动处理含逗号/换行/引号的字段 quoting）
            with open(os.path.join(yundocs_dir, f'sheet_{safe_name}.csv'), 'w', encoding='utf-8-sig', newline='') as f:
                writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
                for row in sheet_rows:
                    # null/undefined 输入：空值统一转为空字符串；换行符替换为空格避免行拆分
                    cleaned = [str(c).replace('\r\n', ' ').replace('\n', ' ').replace('\r', ' ') if c is not None else '' for c in row]
                    writer.writerow(cleaned)
        
        sheet_list_data = {"count": len(sheet_list), "sheets": sheet_list}
        with open(os.path.join(yundocs_dir, 'sheet_list.json'), 'w', encoding='utf-8') as f:
            json.dump(sheet_list_data, f, ensure_ascii=False, indent=2)
        
        import_state = {"running": True, "progress": 50, "message": f"已保存 {len(sheet_list)} 个Sheet，开始预处理..."}
        logger.info(f"已保存 {len(sheet_list)} 个Sheet，开始预处理")
        time.sleep(0.5)
        
        # 运行预处理脚本
        preprocess_script, preprocess_cwd = _find_script("preprocess_data.py")
        if not preprocess_script:
            import_state = {"running": False, "progress": 0, "message": "预处理脚本不存在，导入失败"}
            logger.error("预处理脚本不存在，导入失败")
            return
        
        import_state = {"running": True, "progress": 55, "message": "正在预处理数据..."}
        logger.info("开始预处理导入数据")
        
        if getattr(sys, 'frozen', False):
            # ── 打包模式：直接导入运行 ──
            try:
                old_argv = sys.argv[:]
                sys.argv = [preprocess_script]
                _run_script_direct(preprocess_script, 'preprocess_data', preprocess_cwd)
                logger.info("导入预处理完成（直接模式）")
            except SystemExit as e:
                if e.code and e.code != 0:
                    import_state = {"running": False, "progress": 0, "message": f"预处理失败（退出码:{e.code}）"}
                    logger.error(f"导入预处理失败，退出码: {e.code}")
                    return
            except Exception as e:
                import_state = {"running": False, "progress": 0, "message": f"预处理失败: {str(e)[:100]}"}
                logger.error(f"导入预处理失败: {e}", exc_info=True)
                return
            finally:
                sys.argv = old_argv
        else:
            # ── 开发模式：使用subprocess ──
            active_process = subprocess.Popen(
                [sys.executable, '-u', preprocess_script],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                cwd=preprocess_cwd, encoding='utf-8', errors='replace'
            )
            
            preprocess_errors = []
            for line in active_process.stdout:
                line = line.strip()
                if not line:
                    continue
                if '[OK]' in line or '[INFO]' in line:
                    import_state = {"running": True, "progress": min(import_state["progress"] + 5, 95), "message": line.replace('[INFO] ', '').replace('[OK] ', '')}
                    logger.info(f"[import-preprocess] {line}")
                elif '[WARN]' in line:
                    logger.warning(f"[import-preprocess] {line}")
                elif '[ERROR]' in line:
                    logger.error(f"[import-preprocess] {line}")
                    preprocess_errors.append(line.replace('[ERROR] ', ''))
                else:
                    logger.debug(f"[import-preprocess] {line}")
                    if any(kw in line for kw in ['Error', 'Exception', 'Traceback', 'error', 'Failed']):
                        preprocess_errors.append(line)
            
            active_process.wait()
            if active_process.returncode != 0:
                err_summary = preprocess_errors[-3:] if preprocess_errors else ["详见日志"]
                import_state = {"running": False, "progress": 0, "message": f"预处理失败: {'; '.join(err_summary)}"}
                logger.error(f"导入预处理失败，返回码: {active_process.returncode}")
                return
        
        import_state = {"running": True, "progress": 100, "message": "导入完成！"}
        logger.info("离线导入完成")
        
    except Exception as e:
        import_state = {"running": False, "progress": 0, "message": f"导入失败: {str(e)}"}
        logger.error(f"离线导入失败: {str(e)}", exc_info=True)
    finally:
        active_process = None
        time.sleep(3)
        import_state["running"] = False

def _kill_port_process(port, exclude_self=True):
    """自动清理占用指定端口的进程（Windows）
    exclude_self: 是否跳过当前进程（防止启动时误杀自己）
    """
    try:
        my_pid = str(os.getpid()) if exclude_self else ''
        _subprocess_flags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        result = subprocess.run(
            ['netstat', '-ano'],
            capture_output=True, text=True, encoding='utf-8', errors='replace',
            creationflags=_subprocess_flags
        )
        killed = []
        for line in result.stdout.splitlines():
            if f':{port} ' in line and 'LISTENING' in line:
                parts = line.strip().split()
                pid = parts[-1] if parts else ''
                if pid.isdigit() and pid != my_pid:
                    logger.info(f"正在终止占用端口 {port} 的旧进程 (PID: {pid})")
                    subprocess.run(['taskkill', '/f', '/pid', pid],
                                   capture_output=True, text=True,
                                   creationflags=_subprocess_flags)
                    killed.append(pid)
        if killed:
            logger.info(f"已清理 {len(killed)} 个旧进程: {killed}")
        return len(killed)
    except Exception as e:
        logger.error(f"清理端口进程失败: {e}")
        return 0

def _create_desktop_shortcut():
    """首次启动时在桌面创建快捷方式（仅Windows）"""
    if sys.platform != 'win32':
        return
    try:
        import ctypes
        # 获取桌面路径
        desktop = ctypes.windll.user32.GetDesktopWindow()
        import ctypes.wintypes
        # 使用 CSIDL_DESKTOPDIRECTORY = 0x10
        buf = ctypes.create_unicode_buffer(ctypes.wintypes.MAX_PATH)
        ctypes.windll.shell32.SHGetFolderPathW(0, 0x10, 0, 0, buf)
        desktop_path = buf.value
        
        shortcut_path = os.path.join(desktop_path, '项目回款跟踪与管控平台.lnk')
        # 已存在则不重复创建
        if os.path.exists(shortcut_path):
            return
        
        # 获取 exe 路径（PyInstaller 打包后）或 python 脚本路径
        if getattr(sys, 'frozen', False):
            target = sys.executable
            icon_path = os.path.join(BASE_DIR, 'app_icon.ico')
            working_dir = BASE_DIR
        else:
            target = sys.executable
            # 使用 VBS 启动方式（无CMD窗口）
            vbs_path = os.path.join(BASE_DIR, '项目回款跟踪与管控平台_启动.vbs')
            if os.path.exists(vbs_path):
                target = 'wscript.exe'
                args = f'"{vbs_path}"'
            else:
                args = f'"{os.path.join(BASE_DIR, "server.py")}"'
            icon_path = os.path.join(BASE_DIR, 'app_icon.ico')
            working_dir = BASE_DIR
        
        # 使用 PowerShell 创建快捷方式
        import subprocess
        # 判断是否有参数
        if getattr(sys, 'frozen', False):
            ps_cmd = f'''
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut('{shortcut_path}')
$sc.TargetPath = '{target}'
$sc.Arguments = ''
$sc.WorkingDirectory = '{working_dir}'
$sc.Description = '项目回款跟踪与管控平台'
if (Test-Path '{icon_path}') {{ $sc.IconLocation = '{icon_path}' }}
$sc.Save()
'''
        else:
            if os.path.exists(os.path.join(BASE_DIR, '项目回款跟踪与管控平台_启动.vbs')):
                ps_cmd = f'''
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut('{shortcut_path}')
$sc.TargetPath = 'wscript.exe'
$sc.Arguments = '"{os.path.join(BASE_DIR, "项目回款跟踪与管控平台_启动.vbs")}"'
$sc.WorkingDirectory = '{working_dir}'
$sc.Description = '项目回款跟踪与管控平台'
if (Test-Path '{icon_path}') {{ $sc.IconLocation = '{icon_path}' }}
$sc.Save()
'''
            else:
                ps_cmd = f'''
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut('{shortcut_path}')
$sc.TargetPath = '{target}'
$sc.Arguments = '"{os.path.join(BASE_DIR, "server.py")}"'
$sc.WorkingDirectory = '{working_dir}'
$sc.Description = '项目回款跟踪与管控平台'
if (Test-Path '{icon_path}') {{ $sc.IconLocation = '{icon_path}' }}
$sc.Save()
'''
        _ps_flags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        result = subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-Command', ps_cmd],
            capture_output=True, text=True, timeout=10,
            creationflags=_ps_flags
        )
        if result.returncode == 0:
            logger.info(f"桌面快捷方式已创建: {shortcut_path}")
        else:
            logger.warning(f"创建桌面快捷方式失败: {result.stderr}")
    except Exception as e:
        logger.warning(f"创建桌面快捷方式异常: {e}")


def _open_browser():
    """启动后自动打开浏览器"""
    import webbrowser
    url = f'http://localhost:{PORT}'
    # 稍等片刻确保服务就绪
    import threading
    def _delayed_open():
        time.sleep(1.5)
        webbrowser.open(url)
        logger.info(f"已自动打开浏览器: {url}")
    threading.Thread(target=_delayed_open, daemon=True).start()


def main():
    logger.info("=" * 50)
    logger.info("项目回款跟踪与管控平台 - 本地服务启动")
    logger.info(f"目录: {BASE_DIR}")
    logger.info(f"日志: {os.path.join(LOG_DIR, 'server.log')}")
    logger.info(f"访问: http://localhost:{PORT}")
    logger.info(f"同步API: http://localhost:{PORT}/api/sync")
    
    # 首次启动创建桌面快捷方式
    _create_desktop_shortcut()
    
    # ── 启动前主动清理端口上的旧进程（防止多进程同时监听导致API路由失效）──
    _kill_port_process(PORT)
    # 等待旧进程完全退出、端口释放
    time.sleep(1)
    # 再次确认端口已释放
    _kill_port_process(PORT)
    time.sleep(1)
    
    handler = CustomHandler
    
    # 设置 allow_reuse_address 减少端口占用冲突（仅用于TIME_WAIT状态，不能解决多进程同时监听）
    http.server.HTTPServer.allow_reuse_address = True
    
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            with http.server.HTTPServer(("", PORT), handler) as httpd:
                logger.info(f"服务启动成功，监听端口 {PORT}")
                # 启动后自动打开浏览器
                _open_browser()
                try:
                    httpd.serve_forever()
                except KeyboardInterrupt:
                    logger.info("用户中断，服务已停止")
                return  # 正常退出
        except OSError as e:
            logger.warning(f"第 {attempt}/{max_retries} 次启动失败: {e}")
            if "10048" in str(e) or "Already in use" in str(e) or "只允许使用一次" in str(e):
                # 端口被占用，尝试自动清理
                logger.info("端口被占用，尝试自动清理旧进程...")
                _kill_port_process(PORT)
                if attempt < max_retries:
                    logger.info(f"等待 2 秒后重试...")
                    time.sleep(2)
            else:
                logger.error(f"服务启动异常: {e}", exc_info=True)
                return
        except Exception as e:
            logger.error(f"服务启动异常: {e}", exc_info=True)
            return
    
    logger.error(f"服务启动失败：已重试 {max_retries} 次，端口 {PORT} 仍被占用")

if __name__ == "__main__":
    # 支持 --stop 命令行参数：停止运行中的服务
    if '--stop' in sys.argv:
        logger.info("正在停止服务...")
        _kill_port_process(PORT, exclude_self=False)
        logger.info("服务已停止")
        sys.exit(0)
    main()