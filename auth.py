"""本地账号鉴权:PBKDF2 密码哈希 + 内存会话 + cookie 助手。纯标准库(SP-2)。
data/accounts.json 为本地敏感数据(gitignored);明文密码不落盘、不日志。"""
from __future__ import annotations

import os
import re
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

# 首次种子的超级管理员(离线内网工具的初始凭据来源;新增超管在此追加,随后对已存在的 accounts.json 另行补齐)
_SEED_SUPERS = [
    ('admin', 'wxtnb', '超级管理员'),
    ('wangxutong', 'niubi', 'wangxutong'),
    ('zhangyingzhe', 'venus600', 'zhangyingzhe'),
]

_file_lock = threading.Lock()
_sessions: dict = {}            # token -> {'account': str, 'expiry': float}
_sessions_lock = threading.Lock()


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), PBKDF2_ITERS).hex()


def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password, salt), expected_hash)


def load_accounts() -> dict:
    with _file_lock:
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
    """确保 _SEED_SUPERS 的超管都存在:文件缺失则新建;已存在则补齐缺失的种子超管(不动既有账号/密码/权限)。
    有新增返回 True,无改动返回 False。这样新增配置超管只需改 _SEED_SUPERS + 重启即生效。"""
    data: dict = load_accounts() if os.path.exists(ACCOUNTS_FILE) else {'version': 1, 'users': {}}
    users = data.setdefault('users', {})
    added = False
    for account, pw, name in _SEED_SUPERS:
        if account not in users:
            users[account] = _make_user(pw, name, is_super=True)
            added = True
    if added:
        save_accounts(data)
    return added


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
    return f'{COOKIE_NAME}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/'


# -- SP-5 账号管理 --
_ACCOUNT_RE = re.compile(r'^[A-Za-z0-9_.-]{1,64}$')
_accounts_mutate_lock = threading.Lock()


def _validate_account_name(account: str) -> str:
    if not isinstance(account, str):
        raise ValueError('账号名须为字符串')
    name = account.strip()
    if not _ACCOUNT_RE.match(name):
        raise ValueError('账号名须为 1-64 位字母/数字/下划线/点/连字符')
    return name


def _validate_password(password: str) -> None:
    if not isinstance(password, str) or not (1 <= len(password) <= 256):
        raise ValueError('密码长度须为 1-256')


def _validate_display_name(display_name) -> None:
    if display_name is not None and not isinstance(display_name, str):
        raise ValueError('显示名须为字符串')


def _validate_str_list(values, field: str) -> list:
    if not isinstance(values, list):
        raise ValueError(f'{field} 须为数组')
    out: list = []
    for v in values:
        if not isinstance(v, str) or not (1 <= len(v) <= 64):
            raise ValueError(f'{field} 各项须为 1-64 位字符串')
        if v not in out:
            out.append(v)
    if len(out) > 100:
        raise ValueError(f'{field} 项数过多')
    return out


def create_account(accounts: dict, account: str, password: str, display_name: str,
                   pages: list, l4: list) -> dict:
    name = _validate_account_name(account)
    _validate_password(password)
    _validate_display_name(display_name)
    users = accounts.get('users', {})
    if name in users:
        raise ValueError(f'账号 {name} 已存在')
    pages = _validate_str_list(pages, 'allowedPages')
    l4 = _validate_str_list(l4, 'allowedL4')
    new_users = dict(users)
    new_users[name] = _make_user(password, (display_name or name)[:64],
                                 is_super=False, pages=pages, l4=l4)
    out = dict(accounts)
    out['users'] = new_users
    return out


def update_account(accounts: dict, account: str, *, display_name=None, pages=None,
                   l4=None, password=None) -> dict:
    if not isinstance(account, str):
        raise ValueError('账号名须为字符串')
    _validate_display_name(display_name)
    users = accounts.get('users', {})
    if account not in users:
        raise KeyError(account)
    if users[account].get('isSuper'):
        raise ValueError('不可经界面修改超级管理员')
    rec = dict(users[account])
    if display_name is not None:
        rec['displayName'] = (display_name or account)[:64]
    if pages is not None:
        rec['allowedPages'] = _validate_str_list(pages, 'allowedPages')
    if l4 is not None:
        rec['allowedL4'] = _validate_str_list(l4, 'allowedL4')
    if password is not None:
        _validate_password(password)
        salt = secrets.token_hex(16)
        rec['salt'] = salt
        rec['hash'] = hash_password(password, salt)
    new_users = dict(users)
    new_users[account] = rec
    out = dict(accounts)
    out['users'] = new_users
    return out


def delete_account(accounts: dict, account: str) -> dict:
    if not isinstance(account, str):
        raise ValueError('账号名须为字符串')
    users = accounts.get('users', {})
    if account not in users:
        raise KeyError(account)
    if users[account].get('isSuper'):
        raise ValueError('不可经界面删除超级管理员')
    new_users = dict(users)
    del new_users[account]
    out = dict(accounts)
    out['users'] = new_users
    return out


def destroy_sessions_for_account(account: str) -> None:
    with _sessions_lock:
        for tok in [t for t, s in _sessions.items() if s.get('account') == account]:
            _sessions.pop(tok, None)


def list_public_accounts() -> list:
    users = load_accounts().get('users', {})
    return [public_user(acc, users[acc]) for acc in sorted(users)]


def add_account(account: str, password: str, display_name: str, pages: list, l4: list) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = create_account(data, account, password, display_name, pages, l4)
        save_accounts(data)
        name = _validate_account_name(account)
        return public_user(name, data['users'][name])


def edit_account(account: str, *, display_name=None, pages=None, l4=None, password=None) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = update_account(data, account, display_name=display_name, pages=pages,
                              l4=l4, password=password)
        save_accounts(data)
        return public_user(account, data['users'][account])


def remove_account(account: str) -> None:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = delete_account(data, account)
        save_accounts(data)
    destroy_sessions_for_account(account)
