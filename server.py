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
import auth
import config
import data_history
import data_scope
import manual_import
import manual_history

# ── PMIS 上传白名单（防目录穿越/任意写） ──
_PMIS_UPLOAD_NAMES = set(config.PMIS_ALL_FILENAMES)


def is_valid_pmis_name(name: str) -> bool:
    """仅允许 9 个 PMIS 固定文件名(七表+里程碑两表;防目录穿越/任意写)。"""
    return bool(name) and name in _PMIS_UPLOAD_NAMES


# ── 项目主域上传白名单（防目录穿越/任意写） ──
_INPUT_UPLOAD_NAMES = set(config.INPUT_UPLOAD_NAMES)


def is_valid_input_name(name: str) -> bool:
    """仅允许项目主域固定文件名(防目录穿越/任意写)。"""
    return bool(name) and name in _INPUT_UPLOAD_NAMES


def merged_pmis_links(saved):
    """链接读取:默认直链兜底——仅补未保存的键,已保存键(含显式空串)胜出。"""
    return {**config.DEFAULT_LINKS, **(saved or {})}


def _mtime_str(path: str):
    try:
        return datetime.fromtimestamp(os.path.getmtime(path)).strftime('%Y-%m-%d %H:%M')
    except OSError:
        return None


def collect_file_status(base_dir: str):
    """已知数据文件 → 最近修改时间(显示用);固定名单防任意路径,缺失为 None。"""
    out = {}
    pmis_dir = os.path.join(base_dir, 'input', config.PMIS_DIRNAME)
    for name in config.PMIS_ALL_FILENAMES:
        out[name] = _mtime_str(os.path.join(pmis_dir, name))
    for name in config.INPUT_UPLOAD_NAMES:
        out[name] = _mtime_str(os.path.join(base_dir, 'input', name))
    return out


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
HOST = "127.0.0.1"  # 仅绑定本地回环，避免局域网无认证访问
# PyInstaller 打包后，BASE_DIR 应为 exe 所在目录而非临时解压目录
# STATIC_DIR 为静态Web文件目录（打包后从 _MEIPASS 临时目录读取）
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    STATIC_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    STATIC_DIR = BASE_DIR
PARENT_DIR = os.path.dirname(BASE_DIR)

# 前端 Web 根:打包态用内置 dist,开发态用 frontend/dist
if getattr(sys, 'frozen', False):
    WEB_ROOT = os.path.join(STATIC_DIR, 'dist')
else:
    WEB_ROOT = os.path.join(BASE_DIR, 'frontend', 'dist')

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
# PMIS 下载状态
pmis_state = {"running": False, "progress": 0, "message": ""}
# 重新预处理状态（独立更新数据，不抓取）
reprocess_state = {"running": False, "progress": 0, "message": ""}

# 子进程引用（用于停止同步/导入时终止）
active_process = None

# ── 跟进记录相关 ──
FOLLOWUP_FILE = os.path.join(BASE_DIR, 'data', 'followup_records.json')
FOLLOWUP_TYPES = ['电话沟通', '邮件推动', '现场拜访', '内部协调', '合同确认', '里程碑跟进', '回款确认', '其他']
FOLLOWUP_STATUSES = ['跟进中', '已解决', '暂停跟进', '需升级处理', '已取消']

# ── 统一错误响应 ──
ERR_VALIDATION = "validation_error"   # 字段校验失败
ERR_BUSY = "busy"                     # 同步/导入互斥冲突
ERR_PARSE = "parse_error"             # 请求体解析失败
ERR_NOT_FOUND = "not_found"           # 记录不存在
ERR_INTERNAL = "internal_error"       # 其它内部错误
ERR_AUTH = "auth_failed"              # 登录鉴权失败
ERR_FORBIDDEN = "forbidden"           # 权限不足(非超管)

_AUTH_EXEMPT = ('/api/login', '/api/logout', '/api/auth/me')


def _path_needs_auth(path):
    """纯函数：判断路径是否需要登录鉴权。
    豁免：/api/login、/api/logout、/api/auth/me 及非受保护路径。
    拦截：/api/* /data/* /input/* /yundocs_data/* /report/* /log/* 路径。"""
    if path in _AUTH_EXEMPT:
        return False
    return path.startswith(('/api/', '/data/', '/input/', '/yundocs_data/', '/report/', '/log/'))


# 仅超管可访问的写/运维端点(数据更新/导入/清空/回滚/停服/原始文件下载/数据历史/文件状态等);
# 内容端点(followup/tags)与状态轮询(sync-status/import-status)不在此列,普通管理员可用。
_SUPER_ONLY_PATHS = frozenset({
    '/api/sync', '/api/clear-data', '/api/reprocess',
    '/api/stop', '/api/stop-sync', '/api/stop-import',
    '/api/data-history', '/api/manual/backups',
    '/api/files/status', '/api/pmis/links', '/api/pmis/download',
    '/api/import', '/api/pmis/upload', '/api/inputs/upload',
    '/api/data-history/rollback', '/api/data-history/undo-rollback',
    '/api/manual/import', '/api/manual/rollback',
})


def _is_protected_data_path(path):
    """原始数据文件路径:仅超管可直读(含 accounts.json 口令哈希 / 原始 CSV / events.json 等)。
    /data/analysis_data.json 例外——经 handle_data_json 按账号 allowedL4 过滤后下发。
    P0-1:堵住非超管经静态文件直链绕过 L4 隔离、下载全量未脱敏原始数据。"""
    if path == '/data/analysis_data.json':
        return False
    return path.startswith(('/data/', '/input/', '/yundocs_data/', '/report/', '/log/'))


_history_lock = threading.Lock()
history_state = {"running": False}   # 回滚/撤销进行中标志,供 sync/import/pmis/reprocess 反向互斥


def _error_payload(code, message):
    """统一错误响应体：{success: False, code, message}。"""
    return {"success": False, "code": code, "message": message}


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

# ── 项目标签库（2C，本地 JSON store，首次按 analysis_data.json 的 tagSeed 播种，此后本地为准、不回写云） ──
PROJECT_TAGS_FILE = os.path.join(BASE_DIR, 'data', 'project_tags.json')
ANALYSIS_FILE = os.path.join(BASE_DIR, 'data', 'analysis_data.json')

_analysis_cache = {'mtime': None, 'data': None}
_analysis_cache_lock = threading.Lock()


def _load_analysis_cached():
    try:
        mtime = os.path.getmtime(ANALYSIS_FILE)
    except OSError:
        return None
    with _analysis_cache_lock:
        if _analysis_cache['mtime'] != mtime:
            try:
                with open(ANALYSIS_FILE, 'r', encoding='utf-8') as f:
                    _analysis_cache['data'] = json.load(f)
                _analysis_cache['mtime'] = mtime
            except Exception:
                return None
        return _analysis_cache['data']


_tags_lock = threading.Lock()


def _build_initial_tags():
    """首次播种：读 analysis_data.json 的 tagSeed，标签库=实际出现的白名单项(按白名单序)。"""
    seed = {}
    try:
        with open(ANALYSIS_FILE, 'r', encoding='utf-8') as f:
            seed = json.load(f).get('tagSeed', {}) or {}
    except Exception:
        seed = {}
    appeared = set()
    for tags in seed.values():
        appeared.update(tags)
    vocab = [{"name": n} for n in config.TAG_SEED_WHITELIST if n in appeared]
    return {"version": 1, "tags": vocab, "assignments": seed}


def _load_project_tags():
    """本地标签 store；不存在则按 tagSeed 首次播种并落盘，此后本地为准。
    种子为空(analysis 尚未处理/无 tagSeed)时只返回空 store 不落盘，避免空文件永久
    local-wins——否则首次启动早于"更新数据"会让标签永不播种。"""
    with _tags_lock:
        if os.path.exists(PROJECT_TAGS_FILE):
            try:
                with open(PROJECT_TAGS_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        store = _build_initial_tags()
    if store.get('tags') or store.get('assignments'):
        _save_project_tags(store)
    return store


def _save_project_tags(store):
    with _tags_lock:
        os.makedirs(os.path.dirname(PROJECT_TAGS_FILE), exist_ok=True)
        with open(PROJECT_TAGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(store, f, ensure_ascii=False, indent=2)


def _valid_project_ids():
    """从 analysis_data.json 读取有效项目编号集合（供人工导入校验）。"""
    try:
        with open(ANALYSIS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return {str(p.get('projectId')) for p in (data.get('projects') or []) if p.get('projectId')}
    except Exception:
        return set()


def _apply_manual_import(result, source_name):
    """写入前先快照，再按 result 替换写（仅含的类才写）。返回摘要。"""
    mf = manual_history.backup_manual(BASE_DIR, trigger='import', source_name=source_name)
    summary = {'backupId': mf['id']}
    if result.get('tags') is not None:
        _save_project_tags(result['tags'])
        summary['tags'] = {'projects': len(result['tags'].get('assignments', {})),
                           'tagsCount': len(result['tags'].get('tags', []))}
    if result.get('followup') is not None:
        _save_followup_records(result['followup'])
        summary['followup'] = {'count': len(result['followup'])}
    return summary

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

def should_spa_fallback(path: str) -> bool:
    """判断 GET 路径是否应回退到 dist/index.html(Vue Router history 模式)。
    /api/、/data/、/yundocs_data/ 子路径不回退(后端接口/数据文件);带文件扩展名的(静态资源)不回退;
    其余视为前端路由回退(注意 /data 本身是 Vue 路由"数据管理",需回退,故用带斜杠前缀区分)。"""
    if any(path.startswith(p) for p in ('/api/', '/data/', '/yundocs_data/')):
        return False
    last = path.rsplit('/', 1)[-1]
    if '.' in last:
        return False
    return True


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # 默认使用 WEB_ROOT 服务静态文件（打包后为 _MEIPASS/dist，开发时为 frontend/dist）
        super().__init__(*args, directory=WEB_ROOT, **kwargs)
    
    def translate_path(self, path):
        """重写路径转换：静态文件优先从 WEB_ROOT 查找，数据文件从 BASE_DIR 查找"""
        # 先按默认逻辑从 WEB_ROOT 解析（super 的 directory 即 WEB_ROOT）
        static_path = super().translate_path(path)
        if os.path.exists(static_path):
            return static_path
        # 如果 WEB_ROOT 中找不到，尝试从 BASE_DIR 查找（data/, yundocs_data/ 等运行时数据）
        rel = os.path.relpath(static_path, WEB_ROOT)
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
        if not self._auth_gate():
            return
        if not self._authz_gate():
            return

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
        elif parsed.path == '/api/data-history':
            self.handle_data_history()
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
        elif parsed.path == '/api/followup/all':
            self.handle_followup_all()
        elif parsed.path == '/api/followup/types':
            self.handle_followup_types()
        elif parsed.path == '/api/manual/backups':
            self.handle_manual_backups()
        elif parsed.path == '/api/tags':
            self.handle_tags_get()
        elif parsed.path == '/api/pmis/links':
            self.handle_pmis_links_get()
        elif parsed.path == '/api/files/status':
            self.handle_files_status()
        elif parsed.path == '/api/pmis/download':
            self.handle_pmis_download()
        elif parsed.path == '/api/reprocess':
            self.handle_reprocess()
        elif parsed.path == '/api/auth/me':
            self.handle_auth_me()
        elif parsed.path == '/api/admin/accounts':
            self.handle_admin_accounts_list()
        elif parsed.path == '/data/analysis_data.json':
            self.handle_data_json()
        else:
            translated = self.translate_path(parsed.path)
            if os.path.isfile(translated):
                super().do_GET()
                return
            if should_spa_fallback(parsed.path):
                self._serve_spa_index()
                return
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

    def _serve_spa_index(self):
        """回退到 Vue SPA 入口 dist/index.html，支持 Vue Router history 模式。"""
        index_path = os.path.join(WEB_ROOT, 'index.html')
        if not os.path.isfile(index_path):
            msg = '前端尚未构建。请运行: cd frontend && npm run build'
            body = msg.encode('utf-8')
            self.send_response(503)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        with open(index_path, 'rb') as f:
            content = f.read()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        parsed = urlparse(self.path)
        if not self._auth_gate():
            return
        if not self._authz_gate():
            return

        if parsed.path == '/api/import':
            self.handle_import()
        elif parsed.path == '/api/followup/add':
            self.handle_followup_add()
        elif parsed.path == '/api/followup/delete':
            self.handle_followup_delete()
        elif parsed.path == '/api/followup/update':
            self.handle_followup_update()
        elif parsed.path == '/api/tags':
            self.handle_tags_save()
        elif parsed.path == '/api/pmis/links':
            self.handle_pmis_links_post()
        elif parsed.path == '/api/pmis/upload':
            self.handle_pmis_upload()
        elif parsed.path == '/api/inputs/upload':
            self.handle_inputs_upload()
        elif parsed.path == '/api/data-history/rollback':
            self.handle_data_history_rollback()
        elif parsed.path == '/api/data-history/undo-rollback':
            self.handle_data_history_undo()
        elif parsed.path == '/api/manual/import':
            self.handle_manual_import()
        elif parsed.path == '/api/manual/rollback':
            self.handle_manual_rollback()
        elif parsed.path == '/api/login':
            self.handle_login()
        elif parsed.path == '/api/logout':
            self.handle_logout()
        elif parsed.path == '/api/admin/accounts/create':
            self.handle_admin_account_create()
        elif parsed.path == '/api/admin/accounts/update':
            self.handle_admin_account_update()
        elif parsed.path == '/api/admin/accounts/delete':
            self.handle_admin_account_delete()
        else:
            self.send_response(404)
            self.end_headers()
    
    def handle_sync(self):
        global sync_state, sync_url
        # Parse URL parameter from query string
        qs = self.parse_path()
        url_vals = qs.get('url', [])
        sync_url = url_vals[0] if url_vals else ''
        # 互斥检查：回滚/导入进行中时禁止同步
        if history_state.get("running"):
            self._json_response({"running": False, "progress": 0, "message": "数据回滚进行中，请稍后再同步"})
            return
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
        """删除业务数据文件 data/analysis_data.json 及原始提取数据目录 yundocs_data/"""
        data_file = os.path.join(BASE_DIR, 'data', 'analysis_data.json')
        legacy_js = os.path.join(BASE_DIR, 'data', 'analysis_data.js')
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
        # 清理可能遗留的旧版数据文件
        if os.path.exists(legacy_js):
            try:
                os.remove(legacy_js)
            except Exception:
                pass
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
        if history_state.get("running"):
            self._json_response(_error_payload(ERR_BUSY, "数据回滚进行中，请稍后再导入"))
            return
        if sync_state["running"]:
            self._json_response(_error_payload(ERR_BUSY, "同步正在进行中，请等待完成或停止同步后再导入"))
            return
        if import_state["running"]:
            self._json_response(_error_payload(ERR_BUSY, "导入正在进行中，请等待完成或停止上传"))
            return
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求数据解析失败: {str(e)}"))
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
        """POST /api/followup/add - 添加跟进记录（纯本地，不回写云）"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求数据解析失败: {str(e)}"))
            return

        # 校验必填字段
        required = ['项目编号', '项目名称', '跟进人', '跟进类型', '跟进内容', '跟进状态']
        for field in required:
            if not data.get(field):
                self._json_response(_error_payload(ERR_VALIDATION, f"缺少必填字段: {field}"))
                return

        # 校验跟进内容长度
        if len(data.get('跟进内容', '')) > 500:
            self._json_response(_error_payload(ERR_VALIDATION, "跟进内容不能超过500字"))
            return

        # 校验跟进人长度
        if len(data.get('跟进人', '')) > 20:
            self._json_response(_error_payload(ERR_VALIDATION, "跟进人姓名不能超过20个字符"))
            return

        # 校验跟进类型
        if data.get('跟进类型') not in FOLLOWUP_TYPES:
            self._json_response(_error_payload(ERR_VALIDATION, f"跟进类型无效，可选: {', '.join(FOLLOWUP_TYPES)}"))
            return

        # 校验跟进状态
        if data.get('跟进状态') not in FOLLOWUP_STATUSES:
            self._json_response(_error_payload(ERR_VALIDATION, f"跟进状态无效，可选: {', '.join(FOLLOWUP_STATUSES)}"))
            return
        
        # 自动生成记录编号
        today_str = datetime.now().strftime('%Y%m%d')
        record_num = _get_next_record_num(today_str)
        data['记录编号'] = f'FU-{today_str}-{record_num:04d}'
        
        # 自动填充跟进时间
        data['跟进时间'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # 3E-3 移除 nextActionDate 自动填充(collection_stages 无该字段,两字段改前端传入/留空)

        # 保存到本地JSON
        records = _load_followup_records()
        records.append(data)
        _save_followup_records(records)
        logger.info(f"跟进记录已保存本地: {data['记录编号']}")

        self._json_response({
            "success": True,
            "记录编号": data['记录编号'],
            "message": "已保存到本地"
        })
    
    def handle_followup_delete(self):
        """POST /api/followup/delete - 删除跟进记录（纯本地，不回写云）"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求数据解析失败: {str(e)}"))
            return

        record_id = data.get('记录编号', '')
        if not record_id:
            self._json_response(_error_payload(ERR_VALIDATION, "缺少记录编号"))
            return

        # 从本地JSON中删除指定记录
        records = _load_followup_records()
        original_count = len(records)
        records = [r for r in records if r.get('记录编号') != record_id]

        if len(records) == original_count:
            self._json_response(_error_payload(ERR_NOT_FOUND, f"未找到记录: {record_id}"))
            return

        _save_followup_records(records)
        logger.info(f"跟进记录已删除: {record_id}")

        self._json_response({"success": True, "message": f"跟进记录 {record_id} 已删除"})
    
    def handle_followup_update(self):
        """POST /api/followup/update - 编辑跟进记录（纯本地，不回写云）"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求数据解析失败: {str(e)}"))
            return

        record_id = data.get('记录编号', '')
        if not record_id:
            self._json_response(_error_payload(ERR_VALIDATION, "缺少记录编号"))
            return

        # 校验可编辑字段
        if data.get('跟进人') and len(data.get('跟进人', '')) > 20:
            self._json_response(_error_payload(ERR_VALIDATION, "跟进人姓名不能超过20个字符"))
            return
        if data.get('跟进内容') and len(data.get('跟进内容', '')) > 500:
            self._json_response(_error_payload(ERR_VALIDATION, "跟进内容不能超过500字"))
            return
        if data.get('跟进类型') and data.get('跟进类型') not in FOLLOWUP_TYPES:
            self._json_response(_error_payload(ERR_VALIDATION, f"跟进类型无效，可选: {', '.join(FOLLOWUP_TYPES)}"))
            return
        if data.get('跟进状态') and data.get('跟进状态') not in FOLLOWUP_STATUSES:
            self._json_response(_error_payload(ERR_VALIDATION, f"跟进状态无效，可选: {', '.join(FOLLOWUP_STATUSES)}"))
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
                found = True
                break

        if not found:
            self._json_response(_error_payload(ERR_NOT_FOUND, f"未找到记录: {record_id}"))
            return

        _save_followup_records(records)
        logger.info(f"跟进记录已更新: {record_id}")

        self._json_response({
            "success": True,
            "记录编号": record_id,
            "message": "已更新（本地）"
        })
    
    def handle_followup_list(self):
        """GET /api/followup/list/<project_id>?limit=5 - 获取项目跟进记录"""
        parsed = urlparse(self.path)
        # 从路径提取项目编号: /api/followup/list/PRJ-001
        parts = parsed.path.split('/')
        project_id = parts[-1] if len(parts) > 3 else ''
        
        qs = self.parse_path()
        limit = int(qs.get('limit', [5])[0])
        
        # 读取本地记录（纯本地，无云同步）
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

    def handle_followup_all(self):
        """GET /api/followup/all - 全部跟进记录（供导出）。"""
        recs = _load_followup_records()
        for r in recs:
            r.pop('syncStatus', None)
        self._json_response({"success": True, "records": recs, "total": len(recs)})

    def handle_manual_import(self):
        """POST /api/manual/import {sheets} - 校验→快照→替换写。"""
        if self._history_busy():
            self._json_response(_error_payload(ERR_BUSY, "其他数据操作进行中，请稍后再导入"))
            return
        try:
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求解析失败: {e}"))
            return
        sheets = body.get('sheets') or {}
        if not isinstance(sheets, dict) or not any(k in sheets for k in ('项目标签', '跟进记录')):
            self._json_response(_error_payload(ERR_VALIDATION, "未发现可导入的「项目标签」或「跟进记录」sheet"))
            return
        errors, result = manual_import.validate_and_build(
            sheets, _valid_project_ids(),
            datetime.now().strftime('%Y%m%d'), datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            FOLLOWUP_TYPES, FOLLOWUP_STATUSES)
        if errors:
            self._json_response({"success": False, "code": ERR_VALIDATION,
                                 "message": f"校验未通过，共 {len(errors)} 处错误", "errors": errors})
            return
        history_state["running"] = True
        try:
            with _history_lock:
                summary = _apply_manual_import(result, body.get('fileName', ''))
        except Exception as e:
            logger.error(f"人工数据导入写入失败: {e}", exc_info=True)
            self._json_response(_error_payload(ERR_INTERNAL, f"导入写入失败: {e}"))
            return
        finally:
            history_state["running"] = False
        self._json_response({"success": True, "message": "导入成功", **summary})

    def handle_manual_backups(self):
        """GET /api/manual/backups - 列出人工导入快照。"""
        try:
            self._json_response({"success": True, **manual_history.list_backups(BASE_DIR)})
        except Exception as e:
            logger.error(f"列出人工快照失败: {e}", exc_info=True)
            self._json_response(_error_payload(ERR_INTERNAL, f"列快照失败: {e}"))

    def handle_manual_rollback(self):
        """POST /api/manual/rollback {id} - 回滚到指定人工导入快照。"""
        if self._history_busy():
            self._json_response(_error_payload(ERR_BUSY, "其他数据操作进行中，请稍后再回滚"))
            return
        try:
            n = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求解析失败: {e}"))
            return
        vid = str(data.get('id') or '').strip()
        if not vid:
            self._json_response(_error_payload(ERR_VALIDATION, "缺少版本 id"))
            return
        history_state["running"] = True
        try:
            with _history_lock:
                res = manual_history.rollback_manual(BASE_DIR, vid)
        except FileNotFoundError as e:
            self._json_response(_error_payload(ERR_NOT_FOUND, str(e)))
            return
        except Exception as e:
            logger.error(f"人工快照回滚失败: {e}", exc_info=True)
            self._json_response(_error_payload(ERR_INTERNAL, f"回滚失败: {e}"))
            return
        finally:
            history_state["running"] = False
        self._json_response({"success": True, "message": f"已回滚到 {vid}", **res})

    def handle_tags_get(self):
        """GET /api/tags — 返回标签库与挂载（首次自动播种）。"""
        try:
            store = _load_project_tags()
            self._json_response({"success": True, "tags": store.get("tags", []),
                                 "assignments": store.get("assignments", {})})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"读取标签失败: {e}"))

    def handle_tags_save(self):
        """POST /api/tags — 整存标签库与挂载（不回写云）。"""
        try:
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求解析失败: {e}"))
            return
        tags = body.get("tags")
        assignments = body.get("assignments")
        if not isinstance(tags, list) or not isinstance(assignments, dict):
            self._json_response(_error_payload(ERR_VALIDATION, "tags 须为数组、assignments 须为对象"))
            return
        try:
            _save_project_tags({"version": 1, "tags": tags, "assignments": assignments})
            self._json_response({"success": True})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"保存标签失败: {e}"))

    def _pmis_links_path(self):
        """返回 pmis_links.json 的绝对路径"""
        return os.path.join(BASE_DIR, 'data', 'pmis_links.json')

    def handle_pmis_links_get(self):
        """GET /api/pmis/links - 读取已保存的 PMIS 链接"""
        path = self._pmis_links_path()
        links = {}
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    links = json.load(f).get('links', {})
            except Exception:
                links = {}
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"links": merged_pmis_links(links),
                                     "defaults": config.DEFAULT_LINKS},
                                    ensure_ascii=False).encode('utf-8'))

    def handle_files_status(self):
        """GET /api/files/status - 已知数据文件的最近修改时间(数据管理页行内展示)"""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"files": collect_file_status(BASE_DIR)},
                                    ensure_ascii=False).encode('utf-8'))

    def handle_pmis_links_post(self):
        """POST /api/pmis/links - 保存 PMIS 链接配置"""
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length else b'{}'
        try:
            payload = json.loads(body.decode('utf-8'))
            links = payload.get('links', {})
        except Exception as e:
            # 解析失败：返回错误，不覆盖已有配置文件（与 handle_followup_add 一致）
            self._json_response(_error_payload(ERR_PARSE, f"请求数据解析失败: {str(e)}"))
            return
        os.makedirs(os.path.join(BASE_DIR, 'data'), exist_ok=True)
        with open(self._pmis_links_path(), 'w', encoding='utf-8') as f:
            json.dump({"links": links}, f, ensure_ascii=False, indent=2)
        self._json_response({"ok": True})

    def handle_pmis_upload(self):
        """POST /api/pmis/upload?name=<文件名> - 接收原始字节，写入 input/pmis/"""
        qs = parse_qs(urlparse(self.path).query)
        name = (qs.get('name', [''])[0] or '').strip()
        if not is_valid_pmis_name(name):
            self.send_response(400)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "message": f"非法文件名: {name}"}, ensure_ascii=False).encode('utf-8'))
            return
        length = int(self.headers.get('Content-Length', 0))
        if length <= 0:
            # 空内容不落地,避免写出 0 字节坏文件却报成功
            self.send_response(400)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "message": "缺少文件内容"}, ensure_ascii=False).encode('utf-8'))
            return
        body = self.rfile.read(length)
        pmis_dir = os.path.join(BASE_DIR, 'input', config.PMIS_DIRNAME)
        os.makedirs(pmis_dir, exist_ok=True)
        with open(os.path.join(pmis_dir, name), 'wb') as f:
            f.write(body)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "name": name, "bytes": len(body)}, ensure_ascii=False).encode('utf-8'))

    def handle_inputs_upload(self):
        """POST /api/inputs/upload?name=<文件名> - 接收原始字节，写入 input/ 根（项目主域三文件）"""
        qs = parse_qs(urlparse(self.path).query)
        name = (qs.get('name', [''])[0] or '').strip()
        if not is_valid_input_name(name):
            self.send_response(400)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "message": f"非法文件名: {name}"}, ensure_ascii=False).encode('utf-8'))
            return
        length = int(self.headers.get('Content-Length', 0))
        if length <= 0:
            # 空内容不落地,避免写出 0 字节坏文件却报成功
            self.send_response(400)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "message": "缺少文件内容"}, ensure_ascii=False).encode('utf-8'))
            return
        body = self.rfile.read(length)
        input_dir = os.path.join(BASE_DIR, 'input')
        os.makedirs(input_dir, exist_ok=True)
        with open(os.path.join(input_dir, name), 'wb') as f:
            f.write(body)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "name": name, "bytes": len(body)}, ensure_ascii=False).encode('utf-8'))

    def handle_pmis_download(self):
        """GET /api/pmis/download - 启动 PMIS 下载，SSE 流式返回进度"""
        global pmis_state
        if history_state.get("running"):
            self._json_response({"running": False, "progress": 0, "message": "数据回滚进行中，请稍后再下载"})
            return
        if pmis_state.get("running"):
            self._json_response(pmis_state)
            return
        pmis_state = {"running": True, "progress": 0, "message": "启动 PMIS 下载..."}
        threading.Thread(target=run_pmis_download, daemon=True).start()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        while True:
            self.wfile.write(f"data: {json.dumps(pmis_state)}\n\n".encode('utf-8'))
            self.wfile.flush()
            if pmis_state["progress"] >= 100 or not pmis_state["running"]:
                break
            time.sleep(0.5)

    def handle_reprocess(self):
        """GET /api/reprocess - 仅重跑预处理，不抓取/下载，SSE 流式返回进度"""
        global reprocess_state
        if (sync_state.get("running") or import_state.get("running")
                or pmis_state.get("running") or history_state.get("running")):
            self._json_response({"running": False, "progress": 0, "message": "其他数据操作进行中,请稍后再更新"})
            return
        if reprocess_state.get("running"):
            self._json_response(reprocess_state)
            return
        reprocess_state = {"running": True, "progress": 0, "message": "启动更新..."}
        threading.Thread(target=run_reprocess, daemon=True).start()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        while True:
            self.wfile.write(f"data: {json.dumps(reprocess_state)}\n\n".encode('utf-8'))
            self.wfile.flush()
            if reprocess_state["progress"] >= 100 or not reprocess_state["running"]:
                break
            time.sleep(0.5)

    def _history_busy(self):
        return (sync_state.get("running") or import_state.get("running")
                or pmis_state.get("running") or reprocess_state.get("running"))

    def handle_data_history(self):
        """GET /api/data-history - 列出历史版本与 _pre_rollback。"""
        try:
            self._json_response(data_history.list_versions(BASE_DIR))
        except Exception as e:
            logger.error(f"列出历史版本失败: {e}", exc_info=True)
            self._json_response(_error_payload(ERR_INTERNAL, f"列出历史版本失败: {e}"))

    def handle_data_history_rollback(self):
        """POST /api/data-history/rollback {id} - 回滚到指定版本。"""
        if self._history_busy():
            self._json_response(_error_payload(ERR_BUSY, "其他数据操作进行中,请稍后再回滚"))
            return
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(content_length))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求数据解析失败: {str(e)}"))
            return
        vid = str(data.get("id") or "").strip()
        if not vid:
            self._json_response(_error_payload(ERR_VALIDATION, "缺少版本 id"))
            return
        history_state["running"] = True
        try:
            with _history_lock:
                res = data_history.rollback(BASE_DIR, vid)
        except FileNotFoundError as e:
            self._json_response(_error_payload(ERR_NOT_FOUND, str(e)))
            return
        except Exception as e:
            logger.error(f"回滚失败: {e}", exc_info=True)
            self._json_response(_error_payload(ERR_INTERNAL, f"回滚失败: {e}"))
            return
        finally:
            history_state["running"] = False
        self._json_response({"success": True, "message": f"已回滚到 {res['id']}", **res})

    def handle_data_history_undo(self):
        """POST /api/data-history/undo-rollback - 撤销上次回滚。"""
        if self._history_busy():
            self._json_response(_error_payload(ERR_BUSY, "其他数据操作进行中,请稍后再撤销"))
            return
        history_state["running"] = True
        try:
            with _history_lock:
                res = data_history.undo_rollback(BASE_DIR)
        except FileNotFoundError as e:
            self._json_response(_error_payload(ERR_NOT_FOUND, str(e)))
            return
        except Exception as e:
            logger.error(f"撤销回滚失败: {e}", exc_info=True)
            self._json_response(_error_payload(ERR_INTERNAL, f"撤销回滚失败: {e}"))
            return
        finally:
            history_state["running"] = False
        self._json_response({"success": True, "message": "已撤销上次回滚", **res})

    def _json_response(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def _send_json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        for k, v in (extra_headers or []):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _serve_raw_data_file(self):
        try:
            with open(ANALYSIS_FILE, 'rb') as f:
                body = f.read()
        except OSError:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, "数据文件不存在"))
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_data_json(self):
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token)
        rec = auth.load_accounts().get('users', {}).get(account) if account else None
        if not rec:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        allowed = rec.get('allowedL4', [])
        if rec.get('isSuper') or '*' in allowed:
            self._serve_raw_data_file()
            return
        data = _load_analysis_cached()
        if data is None:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, "数据文件不存在"))
            return
        self._send_json(200, data_scope.filter_analysis_data(data, allowed))

    def _auth_gate(self):
        """检查请求路径是否需要鉴权；需要且无有效会话则返回 False（已发 401），否则返回 True。"""
        path = urlparse(self.path).path
        if _path_needs_auth(path):
            token = auth.parse_cookie_token(self.headers.get('Cookie'))
            if not auth.validate_session(token):
                self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
                return False
        return True

    def _authz_gate(self):
        """二级授权(须在 _auth_gate 放行后调用):超管专属写/运维端点、/api/admin/*、
        原始数据文件 对非超管返回 403。放行返回 True;已发 403 返回 False。"""
        path = urlparse(self.path).path
        if path in _SUPER_ONLY_PATHS or path.startswith('/api/admin/') or _is_protected_data_path(path):
            if self._require_super() is None:
                return False
        return True

    def _require_super(self):
        """校验当前会话为超级管理员;否则发 403 并返回 None。返回超管 account。"""
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token)
        rec = auth.load_accounts().get('users', {}).get(account) if account else None
        if not rec or not rec.get('isSuper'):
            self._send_json(403, _error_payload(ERR_FORBIDDEN, "需要超级管理员权限"))
            return None
        return account

    def _read_json_body(self):
        """读 POST JSON body;失败返回 None(调用方负责报 400)。"""
        try:
            n = int(self.headers.get('Content-Length', 0))
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return None

    def handle_admin_accounts_list(self):
        if self._require_super() is None:
            return
        self._send_json(200, {"success": True, "accounts": auth.list_public_accounts()})

    def handle_admin_account_create(self):
        if self._require_super() is None:
            return
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        try:
            user = auth.add_account(
                data.get('account', ''), data.get('password', ''),
                data.get('displayName', ''), data.get('allowedPages', []),
                data.get('allowedL4', []))
        except ValueError as e:
            self._send_json(400, _error_payload(ERR_VALIDATION, str(e)))
            return
        self._send_json(200, {"success": True, "user": user})

    def handle_admin_account_update(self):
        if self._require_super() is None:
            return
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        account = data.get('account', '')
        try:
            user = auth.edit_account(
                account,
                display_name=data.get('displayName'),
                pages=data.get('allowedPages'),
                l4=data.get('allowedL4'),
                password=data.get('password'))
        except KeyError:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, f"账号不存在: {account}"))
            return
        except ValueError as e:
            self._send_json(400, _error_payload(ERR_VALIDATION, str(e)))
            return
        self._send_json(200, {"success": True, "user": user})

    def handle_admin_account_delete(self):
        super_account = self._require_super()
        if super_account is None:
            return
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        account = data.get('account', '')
        if account == super_account:
            self._send_json(400, _error_payload(ERR_VALIDATION, "不能删除自己"))
            return
        try:
            auth.remove_account(account)
        except KeyError:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, f"账号不存在: {account}"))
            return
        except ValueError as e:
            self._send_json(400, _error_payload(ERR_VALIDATION, str(e)))
            return
        self._send_json(200, {"success": True})

    def handle_login(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        account = (data.get('account') or '').strip()
        password = data.get('password') or ''
        if len(account) > 256 or len(password) > 256:
            self._send_json(401, _error_payload(ERR_AUTH, "账号或密码错误"))
            return
        user = auth.authenticate(account, password)
        if not user:
            self._send_json(401, _error_payload(ERR_AUTH, "账号或密码错误"))
            return
        token = auth.create_session(account)
        self._send_json(200, {"success": True, "user": user},
                        [('Set-Cookie', auth.build_set_cookie(token))])

    def handle_logout(self):
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        auth.destroy_session(token)
        self._send_json(200, {"success": True},
                        [('Set-Cookie', auth.build_clear_cookie())])

    def handle_auth_me(self):
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token)
        rec = auth.load_accounts().get('users', {}).get(account) if account else None
        if not account or not rec:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录"))
            return
        self._send_json(200, {"success": True, "user": auth.public_user(account, rec)})

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

def _browser_candidate_paths():
    """返回 (chrome 路径列表, edge 路径列表)。所有环境变量取值带 '' 默认，避免缺失时崩溃。"""
    pf = os.environ.get('PROGRAMFILES', '')
    pf86 = os.environ.get('PROGRAMFILES(X86)', '')
    local = os.environ.get('LOCALAPPDATA', '')
    chrome = [
        os.path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
    edge = [
        os.path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        os.path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]
    return chrome, edge


def _check_browser_available():
    """检测系统是否安装了可用浏览器（Chrome 或 Edge）
    返回 (可用: bool, 浏览器名称: str)
    """
    chrome_paths, edge_paths = _browser_candidate_paths()
    for p in chrome_paths:
        if p and os.path.isfile(p):
            return True, 'Google Chrome'
    for p in edge_paths:
        if p and os.path.isfile(p):
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


def classify_progress_line(line):
    """解析子脚本输出的一行，返回 (level, text) 或 None（空行）。
    level ∈ {'ok','info','warn','error','other'}。
    保持与既有关键字解析一致：info/warn/error 去掉级别前缀，ok/other 原样。
    """
    s = line.strip()
    if not s:
        return None
    if '[OK]' in s:
        return ('ok', s)
    if '[INFO]' in s:
        return ('info', s.replace('[INFO] ', ''))
    if '[WARN]' in s:
        return ('warn', s.replace('[WARN] ', ''))
    if '[ERROR]' in s:
        return ('error', s.replace('[ERROR] ', ''))
    return ('other', s)


def run_reprocess():
    """仅运行 preprocess_data.py(读 yundocs_data + input/pmis 重算 analysis_data)。
    不抓取、不下载。供"更新数据"按钮调用。"""
    global reprocess_state
    try:
        reprocess_state = {"running": True, "progress": 10, "message": "正在更新数据(预处理)..."}
        preprocess_script, pcwd = _find_script("preprocess_data.py")
        if not preprocess_script:
            reprocess_state = {"running": False, "progress": 0, "message": "预处理脚本不存在"}
            return
        if getattr(sys, 'frozen', False):
            try:
                old_argv = sys.argv[:]
                sys.argv = [preprocess_script]
                _run_script_direct(preprocess_script, 'preprocess_data', pcwd)
                logger.info("数据更新完成(直接模式)")
            except SystemExit as e:
                if e.code and e.code != 0:
                    reprocess_state = {"running": False, "progress": 0, "message": f"更新失败(退出码:{e.code})"}
                    return
            except Exception as e:
                reprocess_state = {"running": False, "progress": 0, "message": f"更新失败: {str(e)[:100]}"}
                logger.error(f"reprocess 失败: {e}", exc_info=True)
                return
            finally:
                sys.argv = old_argv
        else:
            process = subprocess.Popen(
                [sys.executable, '-u', preprocess_script],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                cwd=pcwd, encoding='utf-8', errors='replace')
            errs = []
            for raw in process.stdout:
                parsed = classify_progress_line(raw)
                if parsed is None:
                    continue
                level, text = parsed
                if level in ('ok', 'info'):
                    reprocess_state = {"running": True, "progress": min(reprocess_state["progress"] + 5, 95),
                                       "message": raw.strip().replace('[INFO] ', '').replace('[OK] ', '')}
                elif level == 'warn':
                    logger.warning(f"[reprocess] {raw.strip()}")
                elif level == 'error':
                    logger.error(f"[reprocess] {raw.strip()}")
                    errs.append(text)
            process.wait()
            if process.returncode != 0:
                reprocess_state = {"running": False, "progress": 0,
                                   "message": f"更新失败: {'; '.join(errs[-3:]) if errs else '详见日志'}"}
                return
        # 更新成功 → 自动存一份数据历史(失败只告警,不推翻"更新成功")
        try:
            mf = data_history.archive_version(BASE_DIR)
            logger.info(f"[history] 已存历史版本 {mf['id']}(项目 {mf['projectCount']},占用 {mf['sizeBytes']} 字节)")
        except Exception as e:
            logger.warning(f"[history] 存历史版本失败(不影响本次更新): {e}")
        reprocess_state = {"running": True, "progress": 100, "message": "数据更新完成"}
    except Exception as e:
        reprocess_state = {"running": False, "progress": 0, "message": f"更新失败: {str(e)}"}
        logger.error(f"reprocess 失败: {e}", exc_info=True)
    finally:
        time.sleep(3)
        reprocess_state["running"] = False


def run_sync():
    """执行数据同步：仅抓取 WPS 云文档到 yundocs_data(不预处理,处理由"更新数据"触发)"""
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
                for raw_line in process.stdout:
                    parsed = classify_progress_line(raw_line)
                    if parsed is None:
                        continue
                    level, text = parsed
                    full = raw_line.strip()
                    if level == 'ok':
                        sheet_count += 1
                        progress = 15 + int(sheet_count / 9 * 60)
                        sync_state = {"running": True, "progress": min(progress, 75), "message": f"提取Sheet数据 ({sheet_count}/9)..."}
                        logger.info(f"[fetch] {full}")
                    elif level == 'info':
                        sync_state = {"running": True, "progress": sync_state["progress"], "message": text}
                        logger.info(f"[fetch] {full}")
                    elif level == 'warn':
                        logger.warning(f"[fetch] {full}")
                        error_lines.append(text)
                    elif level == 'error':
                        logger.error(f"[fetch] {full}")
                        error_lines.append(text)
                    else:
                        logger.debug(f"[fetch] {full}")
                        if any(kw in full for kw in ['Error', 'Exception', 'Traceback', 'error', 'exception', 'traceback', 'Failed', 'failed']):
                            error_lines.append(full)
                
                process.wait()
                if process.returncode != 0:
                    err_summary = error_lines[-3:] if error_lines else ["详见日志"]
                    sync_state = {"running": True, "progress": 75, "message": f"数据提取有错误: {'; '.join(err_summary)}"}
                    logger.warning(f"数据提取完成但有错误，返回码: {process.returncode}，错误: {error_lines}")
                else:
                    sync_state = {"running": True, "progress": 75, "message": "数据提取完成，开始预处理..."}
                    logger.info("数据提取完成，开始预处理")
        
        time.sleep(0.5)

        # 同步只负责抓取到 yundocs_data;处理由"更新数据"按钮触发
        sync_state = {"running": True, "progress": 100, "message": "云同步完成,请点[更新数据]生效"}
        logger.info("云同步(仅抓取)完成")
        
    except Exception as e:
        sync_state = {"running": False, "progress": 0, "message": f"同步失败: {str(e)}"}
        logger.error(f"同步失败: {str(e)}", exc_info=True)
    finally:
        # Keep the completion state for a few seconds
        time.sleep(3)
        sync_state["running"] = False

def run_pmis_download():
    """执行 PMIS 数据下载到 input/pmis/(不预处理,处理由"更新数据"触发)。
    frozen/dev 双路径：打包模式进程内直接执行，开发模式 subprocess 解析进度。
    """
    global pmis_state, active_process
    try:
        pmis_state = {"running": True, "progress": 10, "message": "开始下载 PMIS 数据..."}
        script, cwd = _find_script("pmis_download.py")
        if not script:
            pmis_state = {"running": False, "progress": 0, "message": "pmis_download.py 不存在"}
            return
        if getattr(sys, 'frozen', False):
            # 打包模式：进程内直接执行
            _run_script_direct(script, 'pmis_download', cwd)
        else:
            # 开发模式：子进程，注册到 active_process 使其可被 _terminate_active_process 中断
            active_process = subprocess.Popen([sys.executable, script], cwd=cwd,
                                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                              text=True, encoding='utf-8', errors='replace')
            for line in active_process.stdout:
                parsed = classify_progress_line(line)
                if parsed:
                    _level, text = parsed
                    pmis_state = {"running": True,
                                  "progress": min(pmis_state["progress"] + 10, 90),
                                  "message": text}
            active_process.wait()
        pmis_state = {"running": False, "progress": 100, "message": "PMIS 下载完成,请点[更新数据]生效"}
    except Exception as e:
        logger.error(f"PMIS 下载失败: {e}")
        pmis_state = {"running": False, "progress": 0, "message": f"下载失败: {e}"}
    finally:
        active_process = None
        time.sleep(3)
        pmis_state["running"] = False


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
    """执行离线导入：仅保存上传的 sheets 到 yundocs_data(不预处理,处理由"更新数据"触发)"""
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
        
        # 导入只负责落地 yundocs_data;处理由"更新数据"按钮触发
        import_state = {"running": False, "progress": 100, "message": f"已导入 {len(sheet_list)} 个Sheet,请点[更新数据]生效"}
        logger.info("离线导入(仅落地)完成")
        return
        
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
    url = f'http://{HOST}:{PORT}'
    # 稍等片刻确保服务就绪
    import threading
    def _delayed_open():
        time.sleep(1.5)
        webbrowser.open(url)
        logger.info(f"已自动打开浏览器: {url}")
    threading.Thread(target=_delayed_open, daemon=True).start()


def create_server(host=HOST, port=PORT):
    """创建多线程 HTTP 服务并绑定指定主机（ThreadingHTTPServer 默认已启用 allow_reuse_address）。"""
    return http.server.ThreadingHTTPServer((host, port), CustomHandler)


def main():
    logger.info("=" * 50)
    logger.info("项目管理平台 - 本地服务启动")
    logger.info(f"目录: {BASE_DIR}")
    logger.info(f"日志: {os.path.join(LOG_DIR, 'server.log')}")
    logger.info(f"访问: http://localhost:{PORT}")
    logger.info(f"同步API: http://localhost:{PORT}/api/sync")
    
    # 首次启动：账号种子（仅文件不存在时生成两个超管）
    auth.seed_default_accounts()
    # 首次启动创建桌面快捷方式
    _create_desktop_shortcut()
    
    # ── 启动前主动清理端口上的旧进程（防止多进程同时监听导致API路由失效）──
    _kill_port_process(PORT)
    # 等待旧进程完全退出、端口释放
    time.sleep(1)
    # 再次确认端口已释放
    _kill_port_process(PORT)
    time.sleep(1)
    
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            with create_server() as httpd:
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