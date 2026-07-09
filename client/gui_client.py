#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
奇安信看板平台 Cookie 工具 + 操作（tkinter GUI，客户端）

职责：
  - 获取 PMIS / 倚天 Cookie（纯 requests 静默，依赖本机零信任已登录）
  - 登录看板平台（http://10.248.105.95/pm），把 PMIS Cookie 推送到 /pm/api/pmis/cookie
  - 触发看板平台的「下载数据 / 更新数据」操作（流式进度实时显示）

界面五区：
  ① 服务器接口配置：平台地址 + 账号/密码 + 记住 + 登录/测试 + 状态
  ② PMIS Cookie：获取 + 推送 + 复制 + 完整显示
  ③ 倚天 Cookie：获取 + 复制 + 完整显示（暂不推送）
  ④ 操作：下载数据 / 更新数据 / 下载&更新
  ⑤ 运行日志（固定 10 行，多余滚动）

依赖：tkinter（标准库）、requests
启动：python gui_client.py
"""

import os
import sys
import json
import queue
import threading
from datetime import datetime
from tkinter import (Tk, ttk, StringVar, BooleanVar, Text, END, WORD, messagebox)

import requests

# PyInstaller 打包后定位 exe 同目录
if getattr(sys, 'frozen', False):
    SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

SETTINGS_FILE = os.path.join(SCRIPT_DIR, "gui_settings.json")
CONFIG_JSON = os.path.join(SCRIPT_DIR, "config.json")  # 倚天 cookie 落地（兼容旧脚本）

DEFAULT_PLATFORM = "http://10.248.105.95/pm/data"
PMIS_TARGET = "https://pmis.qianxin-inc.cn"
YITIAN_TARGET = "https://yitian.b.qianxin-inc.cn/maintenance_work_orders"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0")

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass


def load_settings():
    defaults = {"platform": DEFAULT_PLATFORM, "account": "", "password": "",
                 "remember": False, "logged_in": False}
    try:
        if os.path.isfile(SETTINGS_FILE):
            d = json.load(open(SETTINGS_FILE, encoding="utf-8"))
            for k in defaults:
                if k in d:
                    defaults[k] = d[k]
    except Exception:
        pass
    return defaults


def save_settings(d):
    try:
        json.dump(d, open(SETTINGS_FILE, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
    except Exception:
        pass


# ============================================================
# 静默获取 Cookie（纯 requests，零信任自动认证）
# ============================================================
def _silent_fetch(target_url, log, login_markers=("zerotrust", "单点登录", "OA登录", "login")):
    """通用纯 requests 静默获取：访问 target_url，零信任自动认证，
    收集 Session 所有 cookie 拼成整行 Cookie 头。返回 (cookie, session) 或 (None, None)。
    重要：必须禁用系统代理（trust_env=False）。零信任把内网域名劫持到 198.18.x.x 虚拟 IP，
    若本机装了 Clash/代理（如 127.0.0.1:7890），requests 默认会走代理，导致连接被重置 10054。
    禁用后直连虚拟 IP，由零信任客户端代理转发，才能正确拿到 cookie。"""
    session = requests.Session()
    session.trust_env = False  # 不读系统代理/环境变量代理
    session.headers.update({"User-Agent": UA})
    # 双保险：显式空代理
    session.proxies = {"http": None, "https": None}
    try:
        r = session.get(target_url, timeout=30, allow_redirects=True)
    except Exception as e:
        log(f"  ❌ 访问失败: {e}")
        log("  请确认零信任客户端已在本机登录并正常运行。")
        return None, None

    final_url = r.url or ""
    if "zerotrust" in final_url or "/sso" in final_url or "login" in final_url.lower():
        log(f"  ⚠ 被重定向到登录页: {final_url}")
        log("  请确认零信任客户端已登录。")
        return None, None
    if "html" in r.headers.get("Content-Type", "").lower():
        head = r.text[:2000]
        if any(m in head for m in login_markers):
            log("  ⚠ 页面内容为登录页，零信任未认证。")
            return None, None

    if not session.cookies:
        log("  ⚠ 未获取到任何 Cookie。")
        return None, None

    parts = [f"{c.name}={c.value}" for c in session.cookies]
    cookie = "; ".join(parts)
    return cookie, session


def fetch_pmis_cookie(log):
    log(f"  访问 {PMIS_TARGET} ...")
    cookie, session = _silent_fetch(PMIS_TARGET, log)
    if cookie and session:
        names = [c.name for c in session.cookies]
        has_session = "SESSION" in names
        log(f"  ✓ PMIS Cookie 获取成功，共 {len(names)} 个：{', '.join(names)}"
            + ("" if has_session else " （⚠ 未发现 SESSION，请确认已登录 PMIS）"))
    return cookie


def fetch_yitian_cookie(log):
    log(f"  访问 {YITIAN_TARGET} ...")
    cookie, session = _silent_fetch(YITIAN_TARGET, log)
    if cookie and session:
        names = [c.name for c in session.cookies]
        log(f"  ✓ 倚天 Cookie 获取成功，共 {len(names)} 个：{', '.join(names)}")
        try:
            cfg = {}
            if os.path.isfile(CONFIG_JSON):
                cfg = json.load(open(CONFIG_JSON, encoding="utf-8"))
            cfg["session_cookie"] = cookie
            json.dump(cfg, open(CONFIG_JSON, "w", encoding="utf-8"),
                      ensure_ascii=False, indent=2)
        except Exception:
            pass
    return cookie


# ============================================================
# 看板平台交互（登录 + 推送 cookie + 下载数据/更新数据）
# 接口真实路径前缀 /pm/，靠登录 session 鉴权（无 token）
# ============================================================
class PlatformClient:
    """看板平台会话客户端。登录后复用 session 调所有接口。
    地址支持 http://host/pm/data 这种带路径的形式，自动提取 /pm 前缀。"""

    def __init__(self, base_url, log):
        self.log = log
        self.base_url, self.prefix = self._parse_addr(base_url)
        self.session = requests.Session()
        self.session.trust_env = False  # 内网平台不走系统代理
        self.session.proxies = {"http": None, "https": None}
        self.session.headers.update({"User-Agent": UA})
        self.user = None

    @staticmethod
    def _parse_addr(addr):
        """从用户填的地址提取 (scheme://host, /pm前缀)。
        http://10.248.105.95/pm/data -> ('http://10.248.105.95', '/pm')
        http://10.248.105.95         -> ('http://10.248.105.95', '')
        """
        from urllib.parse import urlparse
        p = urlparse(addr.strip())
        base = f"{p.scheme}://{p.netloc}"
        path = p.path.rstrip("/")
        prefix = "/pm" if path.startswith("/pm") else ""
        return base, prefix

    def _api(self, path):
        """path 形如 /api/pmis/cookie，自动加上 /pm 前缀。"""
        return self.base_url + self.prefix + path

    def login(self, account, password):
        """登录 /pm/api/login。成功返回 True。"""
        url = self._api("/api/login")
        self.log(f"  登录: POST {url}")
        try:
            r = self.session.post(url, json={"account": account, "password": password},
                                  timeout=15)
            d = r.json() if r.headers.get("Content-Type", "").startswith("application/json") else {}
            if r.ok and d.get("success"):
                self.user = d.get("user") or {}
                name = self.user.get("account") or self.user.get("name") or "未知"
                self.log(f"  ✓ 登录成功（用户：{name}）")
                return True
            msg = d.get("message") or f"HTTP {r.status_code}"
            self.log(f"  ❌ 登录失败: {msg}")
            return False
        except Exception as e:
            self.log(f"  ❌ 登录出错: {e}")
            return False

    def check_auth(self):
        """GET /pm/api/auth/me 验证当前 session 是否已登录。"""
        try:
            r = self.session.get(self._api("/api/auth/me"), timeout=10)
            if not r.ok:
                return None
            d = r.json()
            if d.get("success"):
                return d.get("user")
            return None
        except Exception:
            return None

    def get_pmis_cookie_status(self):
        """GET /pm/api/pmis/cookie 查询当前已存 cookie。返回 dict 或 None。"""
        try:
            r = self.session.get(self._api("/api/pmis/cookie"), timeout=10)
            if r.status_code == 401:
                return {"_auth": False}
            if not r.ok:
                return None
            return r.json()
        except Exception:
            return None

    def push_pmis_cookie(self, cookie):
        """POST /pm/api/pmis/cookie 提交 cookie。"""
        url = self._api("/api/pmis/cookie")
        self.log(f"  推送 PMIS Cookie: POST {url}")
        try:
            r = self.session.post(url, json={"cookie": cookie}, timeout=30)
            if r.status_code == 401:
                self.log("  ❌ 未登录或会话已过期，请重新登录")
                return False
            d = r.json() if r.headers.get("Content-Type", "").startswith("application/json") else {}
            if r.ok and d.get("success", True) is not False:
                preview = d.get("sessionPreview", "")
                upd = d.get("updatedAt", "")
                self.log(f"  ✓ 推送成功{('，session: '+preview[:24]+'…') if preview else ''}"
                         + (f"（更新于 {upd}）" if upd else ""))
                return True
            self.log(f"  ❌ 推送失败: {d.get('message') or r.status_code}")
            return False
        except Exception as e:
            self.log(f"  ❌ 推送出错: {e}")
            return False

    def run_stream(self, path, label):
        """GET 流式接口（/pm/api/pmis/download 或 /pm/api/reprocess），
        边读边把进度行喂进日志。返回 True/False。"""
        url = self._api(path)
        self.log(f"  [{label}] 请求: GET {url}")
        try:
            r = self.session.get(url, stream=True, timeout=600)
        except Exception as e:
            self.log(f"  ❌ [{label}] 请求出错: {e}")
            return False
        if r.status_code == 401:
            self.log(f"  ❌ [{label}] 未登录或会话已过期，请重新登录")
            r.close()
            return False
        if not r.ok:
            self.log(f"  ❌ [{label}] HTTP {r.status_code}")
            r.close()
            return False
        ok = True
        try:
            for raw in r.iter_lines(decode_unicode=True):
                if raw is None:
                    continue
                line = raw.strip() if isinstance(raw, str) else str(raw)
                if not line:
                    continue
                # 流式响应一般是进度文本行（百分比/消息）
                self.log(f"    {line}")
        except Exception as e:
            self.log(f"  ⚠ [{label}] 读取中断: {e}")
            ok = False
        finally:
            r.close()
        self.log(f"  ✓ [{label}] 完成" if ok else f"  ❌ [{label}] 未正常结束")
        return ok


# ============================================================
# GUI
# ============================================================
class App:
    def __init__(self, root):
        self.root = root
        root.title("奇安信看板 Cookie 工具（客户端）")
        root.geometry("960x620")
        root.minsize(880, 560)

        self.settings = load_settings()
        self.log_queue = queue.Queue()
        self.running = False
        self.platform = None  # PlatformClient，登录后赋值

        self.platform_var = StringVar(value=self.settings["platform"])
        self.account_var = StringVar(value=self.settings["account"])
        self.password_var = StringVar(value=self.settings["password"])
        self.remember_var = BooleanVar(value=self.settings["remember"])
        self.logged_in_var = BooleanVar(value=self.settings.get("logged_in", False))
        self.pmis_cookie = ""
        self.yitian_cookie = ""

        self._build_ui()
        self.root.after(100, self._drain_log_queue)
        self._log("提示：本工具获取 PMIS/倚天 Cookie 并推送到看板平台，附带下载数据/更新数据操作。")
        self._log("")
        # 启动时若已记住「平台已登录」，主动查内存 session 权限，据此设置 ④ 区按钮
        if self.logged_in_var.get():
            self.root.after(150, self._on_logged_in_toggle)

    # ---------- UI ----------
    def _build_ui(self):
        pad = {"padx": 6, "pady": 4}

        # ── ① 服务器接口配置 ──
        f1 = ttk.LabelFrame(self.root, text="① 看板平台接口配置")
        f1.pack(fill="x", padx=8, pady=(8, 4))
        ttk.Label(f1, text="平台地址:").grid(row=0, column=0, sticky="w", **pad)
        ttk.Entry(f1, textvariable=self.platform_var, width=30).grid(row=0, column=1, sticky="we", **pad)
        # 平台已登录：勾上=用客户端内存 session（之前登录过），账号密码框置灰
        ttk.Checkbutton(f1, text="平台已登录", variable=self.logged_in_var,
                        command=self._on_logged_in_toggle).grid(row=0, column=2, padx=4)
        ttk.Label(f1, text="账号:").grid(row=0, column=3, sticky="w", **pad)
        self.account_entry = ttk.Entry(f1, textvariable=self.account_var, width=14)
        self.account_entry.grid(row=0, column=4, sticky="we", **pad)
        ttk.Label(f1, text="密码:").grid(row=0, column=5, sticky="w", **pad)
        self.password_entry = ttk.Entry(f1, textvariable=self.password_var, width=14, show="*")
        self.password_entry.grid(row=0, column=6, sticky="we", **pad)
        ttk.Checkbutton(f1, text="记住", variable=self.remember_var).grid(row=0, column=7, padx=4)
        ttk.Button(f1, text="登录", command=self._on_login).grid(row=0, column=8, padx=4)
        ttk.Button(f1, text="测试连接", command=self._on_test).grid(row=0, column=9, padx=2)
        f1.columnconfigure(1, weight=2)
        f1.columnconfigure(4, weight=1)
        f1.columnconfigure(6, weight=1)
        self.status_label = ttk.Label(f1, text="请登录或勾选「平台已登录」", foreground="#888",
                                      wraplength=960, justify="left")
        self.status_label.grid(row=1, column=0, columnspan=10, sticky="w", padx=6, pady=4)
        # 初始按勾选状态置灰账号密码框
        self._apply_logged_in_state()

        # ── ② PMIS Cookie ──
        f2 = ttk.LabelFrame(self.root, text="② PMIS Cookie（推送到看板平台）")
        f2.pack(fill="x", padx=8, pady=4)
        bf2 = ttk.Frame(f2); bf2.pack(fill="x", padx=4, pady=2)
        ttk.Button(bf2, text="获取cookie", command=self._on_get_pmis).pack(side="left", padx=4)
        ttk.Button(bf2, text="推送到平台", command=self._on_push_pmis).pack(side="left", padx=4)
        ttk.Button(bf2, text="复制Cookie", command=lambda: self._on_copy("pmis")).pack(side="left", padx=4)
        self.pmis_text = self._make_cookie_text(f2)

        # ── ③ 倚天 Cookie ──
        f3 = ttk.LabelFrame(self.root, text="③ 倚天 Cookie（仅获取/复制，暂不推送）")
        f3.pack(fill="x", padx=8, pady=4)
        bf3 = ttk.Frame(f3); bf3.pack(fill="x", padx=4, pady=2)
        ttk.Button(bf3, text="获取cookie", command=self._on_get_yitian).pack(side="left", padx=4)
        ttk.Button(bf3, text="复制Cookie", command=lambda: self._on_copy("yitian")).pack(side="left", padx=4)
        self.yitian_text = self._make_cookie_text(f3)

        # ── ④ 操作 ──
        f4 = ttk.LabelFrame(self.root, text="④ 平台操作（下载数据 / 更新数据）")
        f4.pack(fill="x", padx=8, pady=4)
        bf4 = ttk.Frame(f4); bf4.pack(fill="x", padx=4, pady=2)
        self.btn_download = ttk.Button(bf4, text="下载数据", command=lambda: self._on_action("download"))
        self.btn_download.pack(side="left", padx=4)
        self.btn_reprocess = ttk.Button(bf4, text="更新数据", command=lambda: self._on_action("reprocess"))
        self.btn_reprocess.pack(side="left", padx=4)
        self.btn_both = ttk.Button(bf4, text="下载&更新", command=lambda: self._on_action("both"))
        self.btn_both.pack(side="left", padx=4)
        self.op_hint_label = ttk.Label(bf4, text="", foreground="#c33")
        self.op_hint_label.pack(side="left", padx=8)
        # 初始：未登录，操作按钮置灰
        self._apply_super_permission(None)

        # ── ⑤ 运行日志 ──
        f5 = ttk.LabelFrame(self.root, text="⑤ 运行日志")
        f5.pack(fill="x", padx=8, pady=4)
        df5 = ttk.Frame(f5); df5.pack(fill="x", padx=4, pady=2)
        self.log_text = Text(df5, height=10, wrap=WORD, font=("Consolas", 9))
        self.log_text.pack(side="left", fill="x", expand=True)
        sb5 = ttk.Scrollbar(df5, command=self.log_text.yview, orient="vertical")
        sb5.pack(side="right", fill="y")
        self.log_text.config(yscrollcommand=sb5.set, state="disabled")

        bf5 = ttk.Frame(self.root); bf5.pack(fill="x", padx=8, pady=(0, 8))
        ttk.Button(bf5, text="清空日志", command=self._clear_log).pack(side="right")
        self.running_label = ttk.Label(bf5, text="", foreground="#0a7")
        self.running_label.pack(side="left")

    def _make_cookie_text(self, parent):
        df = ttk.Frame(parent); df.pack(fill="x", padx=4, pady=(0, 4))
        t = Text(df, height=4, wrap=WORD, font=("Consolas", 9))
        t.pack(side="left", fill="x", expand=True)
        sb = ttk.Scrollbar(df, command=t.yview, orient="vertical")
        sb.pack(side="right", fill="y")
        t.config(yscrollcommand=sb.set, state="disabled")
        return t

    def _set_cookie_text(self, widget, cookie):
        widget.config(state="normal")
        widget.delete("1.0", END)
        if cookie:
            widget.insert("1.0", cookie)
        widget.config(state="disabled")

    def _refresh_cookie_displays(self):
        self._set_cookie_text(self.pmis_text, self.pmis_cookie)
        self._set_cookie_text(self.yitian_text, self.yitian_cookie)

    # ---------- 日志 ----------
    def _log(self, msg):
        self.log_queue.put(str(msg))

    def _drain_log_queue(self):
        try:
            while True:
                msg = self.log_queue.get_nowait()
                ts = datetime.now().strftime("%H:%M:%S")
                self.log_text.config(state="normal")
                self.log_text.insert(END, f"[{ts}] {msg}\n")
                self.log_text.see(END)
                self.log_text.config(state="disabled")
        except queue.Empty:
            pass
        self.root.after(100, self._drain_log_queue)

    def _clear_log(self):
        self.log_text.config(state="normal")
        self.log_text.delete("1.0", END)
        self.log_text.config(state="disabled")

    # ---------- 通用 ----------
    def _guard(self):
        if self.running:
            messagebox.showinfo("提示", "有任务正在运行，请稍候。")
            return True
        return False

    def _set_running(self, running, what=""):
        self.running = running
        self.running_label.config(text=("运行中：" + what) if running else "")

    def _apply_super_permission(self, user):
        """根据登录用户是否超管，启用/置灰 ④ 区操作按钮。
        user 为 None（未登录）或非超管 → 置灰；超管 → 启用。"""
        is_super = bool(user and user.get("isSuper"))
        state = "normal" if is_super else "disabled"
        self.btn_download.config(state=state)
        self.btn_reprocess.config(state=state)
        self.btn_both.config(state=state)
        if user is None:
            self.op_hint_label.config(text="未登录", foreground="#888")
        elif is_super:
            self.op_hint_label.config(text="超级管理员，可操作", foreground="#0a7")
        else:
            name = user.get("account") or user.get("name") or ""
            self.op_hint_label.config(text=f"非超级管理员（{name}），操作受限", foreground="#c33")

    def _set_status(self, text, color="#555"):
        self.status_label.config(text=text, foreground=color)

    def _on_logged_in_toggle(self):
        """「平台已登录」勾选变化。
        勾上：账号密码框置灰，自动调 /pm/api/auth/me 查内存 session 权限，
              超管→④区按钮可点；普通用户/无效 session→按钮置灰。
        取消：恢复账号密码框，④区按钮置灰。"""
        self._apply_logged_in_state()
        if self.logged_in_var.get():
            self._set_status("平台已登录模式：正在检查内存 session 权限…", "#0a7")
            self._log("已勾选「平台已登录」：检查客户端内存 session 权限…")
            pc = self._ensure_platform()
            if pc is None:
                self._apply_super_permission(None)
                return
            def work():
                user = pc.check_auth()
                if user:
                    pc.user = user
                    name = user.get("account") or user.get("name") or "未知"
                    self._log(f"  ✓ 内存 session 有效（用户：{name}）")
                    self.root.after(0, lambda: self._set_status(f"已登录：{name}", "#0a7"))
                else:
                    self._log("  ❌ 内存 session 无效或已过期，请取消勾选后用账号密码登录。")
                    self.root.after(0, lambda: self._set_status("内存 session 无效", "#c33"))
                self.root.after(0, lambda: self._apply_super_permission(user))
            threading.Thread(target=work, daemon=True).start()
        else:
            self._set_status("请输入账号密码登录", "#888")
            self._log("已取消「平台已登录」：需输入账号密码点「登录」。")
            self._apply_super_permission(None)

    def _apply_logged_in_state(self):
        """按勾选状态置灰/启用账号、密码、记住框。"""
        state = "disabled" if self.logged_in_var.get() else "normal"
        self.account_entry.config(state=state)
        self.password_entry.config(state=state)

    def _save_settings(self):
        d = {
            "platform": self.platform_var.get().strip(),
            "logged_in": bool(self.logged_in_var.get()),
            "remember": bool(self.remember_var.get()),
        }
        if self.remember_var.get() and not self.logged_in_var.get():
            d["account"] = self.account_var.get().strip()
            d["password"] = self.password_var.get()
        else:
            d["account"] = ""
            d["password"] = ""
        save_settings(d)

    def _ensure_platform(self):
        """构造/复用 PlatformClient。地址（解析后 base+prefix）变化时才新建，
        避免登录后因比较原始地址不等而丢失已登录的 session。"""
        base = self.platform_var.get().strip()
        if not base:
            messagebox.showinfo("提示", "请先填写平台地址。")
            return None
        # 用解析后的 (base_url, prefix) 判断是否变化
        new_base, new_prefix = PlatformClient._parse_addr(base)
        if self.platform is None or self.platform.base_url != new_base \
                or self.platform.prefix != new_prefix:
            self.platform = PlatformClient(base, self._log)
        return self.platform

    # ---------- ① 登录 / 测试 ----------
    def _on_login(self):
        if self._guard():
            return
        base = self.platform_var.get().strip()
        if not base:
            messagebox.showinfo("提示", "请填写平台地址。")
            return
        self._save_settings()
        # 勾选「平台已登录」：用内存 session 直接验证，不走账号密码登录
        if self.logged_in_var.get():
            self._ensure_platform()
            self._set_running(True, "验证内存 session")
            self._log("─" * 50)
            self._log("已勾选「平台已登录」，验证客户端内存 session ...")
            def work_verify():
                user = self.platform.check_auth()
                self.root.after(0, lambda: self._set_running(False))
                if user:
                    self.platform.user = user
                    name = user.get("account") or user.get("name") or "未知"
                    self._log(f"  ✓ 内存 session 有效（用户：{name}）")
                    self.root.after(0, lambda: self._set_status(f"已登录：{name}", "#0a7"))
                    self.root.after(0, lambda: self._apply_super_permission(user))
                    self.root.after(0, self._refresh_cookie_status)
                else:
                    self._log("  ❌ 内存 session 无效或已过期，请取消勾选后用账号密码登录。")
                    self.root.after(0, lambda: self._set_status("内存 session 无效", "#c33"))
                    self.root.after(0, lambda: self._apply_super_permission(None))
            threading.Thread(target=work_verify, daemon=True).start()
            return
        # 未勾选：账号密码登录
        acc = self.account_var.get().strip()
        pwd = self.password_var.get()
        if not (acc and pwd):
            messagebox.showinfo("提示", "请填写账号、密码，或勾选「平台已登录」。")
            return
        self.platform = PlatformClient(base, self._log)
        self._set_running(True, "登录中")
        self._log("─" * 50)
        def work():
            ok = self.platform.login(acc, pwd)
            self.root.after(0, lambda: self._set_running(False))
            if ok:
                user = self.platform.user or {}
                name = user.get("account") or user.get("name") or "未知"
                self.root.after(0, lambda: self._set_status(f"已登录：{name}", "#0a7"))
                self.root.after(0, lambda: self._apply_super_permission(user))
                self.root.after(0, self._refresh_cookie_status)
            else:
                self.root.after(0, lambda: self._set_status("登录失败", "#c33"))
                self.root.after(0, lambda: self._apply_super_permission(None))
        threading.Thread(target=work, daemon=True).start()

    def _on_test(self):
        """测试连接：用现有 session 调 /pm/api/auth/me，验证内存 session 是否有效。
        勾选「平台已登录」时专门测内存 session。"""
        if self._guard():
            return
        pc = self._ensure_platform()
        if pc is None:
            return
        self._set_running(True, "测试连接")
        self._log("─" * 50)
        logged_in = self.logged_in_var.get()
        if logged_in:
            self._log("已勾选「平台已登录」，验证客户端内存 session ...")
        def work():
            user = pc.check_auth()
            self.root.after(0, lambda: self._set_running(False))
            if user:
                name = user.get("account") or user.get("name") or "未知"
                pc.user = user
                self._log(f"  ✓ 内存 session 有效（用户：{name}）")
                self.root.after(0, lambda: self._set_status(f"已登录：{name}", "#0a7"))
                self.root.after(0, lambda: self._apply_super_permission(user))
                self.root.after(0, self._refresh_cookie_status)
            else:
                self._log("  ❌ 内存 session 无效或已过期（服务端返回 401）")
                if logged_in:
                    self._log("  → 本次会话尚未登录或 session 已失效，请取消勾选「平台已登录」，用账号密码重新登录。")
                    self.root.after(0, lambda: self._set_status("内存 session 无效，请用账号密码登录", "#c33"))
                else:
                    self._log("  → 请点「登录」登录看板平台。")
                    self.root.after(0, lambda: self._set_status("未登录，请先登录", "#c33"))
        threading.Thread(target=work, daemon=True).start()

    def _refresh_cookie_status(self):
        """登录/测试成功后，查询平台当前 PMIS cookie 状态显示。"""
        if self.platform is None:
            return
        def work():
            d = self.platform.get_pmis_cookie_status()
            if d is None:
                self._log("  （无法查询平台 cookie 状态）")
                return
            if d.get("_auth"):
                self._log("  ⚠ 查询 cookie 状态：未登录")
                return
            preview = d.get("sessionPreview", "")
            upd = d.get("updatedAt", "")
            if preview:
                self._log(f"  平台当前 PMIS Cookie: {str(preview)[:24]}…（更新于 {upd}）")
            else:
                self._log(f"  平台当前 PMIS Cookie: 无（更新于 {upd}）")
        threading.Thread(target=work, daemon=True).start()

    def _require_login(self):
        """操作前检查登录态。返回 PlatformClient 或 None。
        勾选「平台已登录」时用内存 session；否则需先点「登录」。"""
        pc = self._ensure_platform()
        if pc is None:
            return None
        if pc.user is None:
            # 内存里没有 user：若勾选了「平台已登录」，提示先点登录验证 session；
            # 否则提示登录。不在主线程做网络请求，避免卡 UI。
            if self.logged_in_var.get():
                messagebox.showinfo("提示", "内存 session 尚未验证，请先点「登录」验证。")
            else:
                messagebox.showinfo("提示", "请先点「登录」登录看板平台。")
            return None
        return pc

    # ---------- ② PMIS 获取 / 推送 ----------
    def _on_get_pmis(self):
        if self._guard():
            return
        self._save_settings()
        self._set_running(True, "PMIS 获取cookie")
        self._log("─" * 50)
        self._log("【PMIS】获取cookie（纯 requests 静默，需零信任已登录）...")
        def work():
            cookie = fetch_pmis_cookie(self._log)
            self.pmis_cookie = cookie or ""
            self.root.after(0, self._refresh_cookie_displays)
            self.root.after(0, lambda: self._set_running(False))
            if cookie:
                self._log("  ✓ PMIS Cookie 就绪，可点「推送到平台」或「复制Cookie」。")
        threading.Thread(target=work, daemon=True).start()

    def _on_push_pmis(self):
        if self._guard():
            return
        pc = self._require_login()
        if pc is None:
            return
        if not self.pmis_cookie:
            messagebox.showinfo("提示", "未获取 PMIS Cookie，请先获取。")
            return
        self._save_settings()
        self._set_running(True, "推送 PMIS Cookie")
        self._log("─" * 50)
        def work():
            ok = pc.push_pmis_cookie(self.pmis_cookie)
            self.root.after(0, lambda: self._set_running(False))
            if ok:
                self.root.after(0, self._refresh_cookie_status)
        threading.Thread(target=work, daemon=True).start()

    # ---------- ③ 倚天 获取 ----------
    def _on_get_yitian(self):
        if self._guard():
            return
        self._save_settings()
        self._set_running(True, "倚天 获取cookie")
        self._log("─" * 50)
        self._log("【倚天】获取cookie（纯 requests 静默，需零信任已登录）...")
        def work():
            cookie = fetch_yitian_cookie(self._log)
            self.yitian_cookie = cookie or ""
            self.root.after(0, self._refresh_cookie_displays)
            self.root.after(0, lambda: self._set_running(False))
            if cookie:
                self._log("  ✓ 倚天 Cookie 就绪，可点「复制Cookie」。")
        threading.Thread(target=work, daemon=True).start()

    def _on_copy(self, platform):
        cookie = self.pmis_cookie if platform == "pmis" else self.yitian_cookie
        title = "PMIS" if platform == "pmis" else "倚天"
        if not cookie:
            messagebox.showinfo("提示", f"未获取 {title} Cookie。")
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(cookie)
        self._log(f"✓ {title} Cookie 已复制到剪贴板（{len(cookie)}字符）")

    # ---------- ④ 操作 ----------
    def _on_action(self, action):
        if self._guard():
            return
        pc = self._require_login()
        if pc is None:
            return
        # 权限校验：仅超级管理员可执行下载/更新
        if not (pc.user and pc.user.get("isSuper")):
            messagebox.showwarning("权限不足", "仅超级管理员可执行下载/更新数据操作。")
            self._log(f"  ❌ 权限不足：用户 {pc.user.get('account','?') if pc.user else '?'} 非超级管理员，操作被拒。")
            return
        self._set_running(True, {"download": "下载数据", "reprocess": "更新数据",
                                 "both": "下载&更新"}[action])
        self._log("─" * 50)

        def work():
            if action in ("download", "both"):
                pc.run_stream("/api/pmis/download", "下载数据")
            if action in ("reprocess", "both"):
                pc.run_stream("/api/reprocess", "更新数据")
            self.root.after(0, lambda: self._set_running(False))
        threading.Thread(target=work, daemon=True).start()


def main():
    root = Tk()
    try:
        ttk.Style().theme_use("vista" if sys.platform == "win32" else "clam")
    except Exception:
        pass
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
