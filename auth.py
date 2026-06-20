"""本地账号鉴权:PBKDF2 密码哈希 + 内存会话 + cookie 助手。纯标准库(SP-2)。
data/accounts.json 为本地敏感数据(gitignored);明文密码不落盘、不日志。"""
from __future__ import annotations

import os
import sys
import json
import time
import hmac
import hashlib
import secrets
import threading
from http.cookies import SimpleCookie

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ACCOUNTS_FILE = os.path.join(BASE_DIR, 'data', 'accounts.json')

PBKDF2_ITERS = 200_000
SESSION_TTL_SECONDS = 12 * 3600
COOKIE_NAME = 'pmp_session'

# 首次种子的超级管理员(用户提供 2 个明文;不臆造第 3 个,留 SP-5/手工补)
_SEED_SUPERS = [
    ('admin', 'wxtnb', '超级管理员'),
    ('wangxutong', 'niubi', 'wangxutong'),
]

_file_lock = threading.Lock()
_sessions: dict = {}            # token -> {'account': str, 'expiry': float}
_sessions_lock = threading.Lock()


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), PBKDF2_ITERS).hex()


def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password, salt), expected_hash)


def load_accounts() -> dict:
    if os.path.exists(ACCOUNTS_FILE):
        try:
            with open(ACCOUNTS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get('users'), dict):
                return data
        except Exception:
            pass
    return {'version': 1, 'users': {}}


def save_accounts(data: dict) -> None:
    with _file_lock:
        os.makedirs(os.path.dirname(ACCOUNTS_FILE), exist_ok=True)
        tmp = ACCOUNTS_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, ACCOUNTS_FILE)


def _make_user(password: str, display_name: str, is_super: bool = True,
               pages: list | None = None, l4: list | None = None) -> dict:
    salt = secrets.token_hex(16)
    return {
        'salt': salt,
        'hash': hash_password(password, salt),
        'isSuper': is_super,
        'allowedPages': pages if pages is not None else ['*'],
        'allowedL4': l4 if l4 is not None else ['*'],
        'displayName': display_name,
    }


def seed_default_accounts() -> bool:
    """文件不存在才种子 2 个超管;已存在不动,返回 False。"""
    if os.path.exists(ACCOUNTS_FILE):
        return False
    data: dict = {'version': 1, 'users': {}}
    for account, pw, name in _SEED_SUPERS:
        data['users'][account] = _make_user(pw, name, is_super=True)
    save_accounts(data)
    return True


def public_user(account: str, rec: dict) -> dict:
    return {
        'account': account,
        'displayName': rec.get('displayName', account),
        'isSuper': bool(rec.get('isSuper', False)),
        'allowedPages': rec.get('allowedPages', []),
        'allowedL4': rec.get('allowedL4', []),
    }


def authenticate(account: str, password: str) -> dict | None:
    rec = load_accounts().get('users', {}).get(account)
    if not rec:
        return None
    if not verify_password(password, rec.get('salt', ''), rec.get('hash', '')):
        return None
    return public_user(account, rec)


def create_session(account: str) -> str:
    token = secrets.token_hex(32)
    with _sessions_lock:
        _sessions[token] = {'account': account, 'expiry': time.time() + SESSION_TTL_SECONDS}
    return token


def validate_session(token: str | None) -> str | None:
    if not token:
        return None
    with _sessions_lock:
        sess = _sessions.get(token)
        if not sess:
            return None
        if sess['expiry'] < time.time():
            _sessions.pop(token, None)
            return None
        return sess['account']


def destroy_session(token: str | None) -> None:
    if not token:
        return
    with _sessions_lock:
        _sessions.pop(token, None)


def parse_cookie_token(cookie_header: str | None) -> str | None:
    if not cookie_header:
        return None
    try:
        c = SimpleCookie()
        c.load(cookie_header)
        morsel = c.get(COOKIE_NAME)
        return morsel.value if morsel else None
    except Exception:
        return None


def build_set_cookie(token: str) -> str:
    return f'{COOKIE_NAME}={token}; HttpOnly; SameSite=Lax; Path=/'


def build_clear_cookie() -> str:
    return f'{COOKIE_NAME}=; Max-Age=0; SameSite=Lax; Path=/'
