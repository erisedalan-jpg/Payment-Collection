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
               pages: list | None = None, l4: list | None = None,
               staff: list | None = None,
               page_scopes: dict | None = None, must_change: bool = False) -> dict:
    salt = secrets.token_hex(16)
    return {
        'salt': salt,
        'hash': hash_password(password, salt),
        'isSuper': is_super,
        'allowedPages': pages if pages is not None else ['*'],
        'allowedL4': l4 if l4 is not None else ['*'],
        'allowedStaff': staff if staff is not None else [],
        'pageScopes': page_scopes if page_scopes is not None else {},
        'displayName': display_name,
        'mustChangePassword': bool(must_change),
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
        'allowedStaff': rec.get('allowedStaff', []),
        'pageScopes': rec.get('pageScopes', {}),
        'mustChangePassword': bool(rec.get('mustChangePassword', False)),
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


def _validate_str_list(values, field: str, cap: int = 100) -> list:
    if not isinstance(values, list):
        raise ValueError(f'{field} 须为数组')
    out: list = []
    for v in values:
        if not isinstance(v, str) or not (1 <= len(v) <= 64):
            raise ValueError(f'{field} 各项须为 1-64 位字符串')
        if v not in out:
            out.append(v)
    if len(out) > cap:
        raise ValueError(f'{field} 项数过多')
    return out


def effective_scope(rec: dict, page_key: str | None = None) -> tuple:
    """(l4, staff) 两层解析:pageScopes[page_key] ?? 默认范围(allowedL4/allowedStaff)。
    page_key=None → 直接取默认。显式空覆盖返回空(≠缺省回退)。
    V4.5.2:域层已删除,原三层的中间一跳不复存在。"""
    if page_key is not None:
        ps = (rec.get('pageScopes') or {}).get(page_key)
        if isinstance(ps, dict):
            return list(ps.get('l4', []) or []), list(ps.get('staff', []) or [])
    return list(rec.get('allowedL4', []) or []), list(rec.get('allowedStaff', []) or [])


def domain_union_scope(rec: dict, domain: str, page_keys) -> tuple:
    """对 page_keys 求 effective_scope 并集。任一 l4 含 '*' → (['*'], [])。
    **空 page_keys → 空范围 ([], [])(fail-closed)**。

    V4.5.2:`domain` 参数已不参与解析(两层模型无域层),保留仅为调用点兼容 ——
    server.py 6 处调用点属服务端裁剪链路(安全边界),本期承诺不触碰其签名。

    ── 2026-08-03 fail-closed 修正(原为「空 page_keys → 回退默认范围」)──
    调用点一律传「该域全部页 ∩ 账号可访问页」,所以空 page_keys 的语义是明确的:
    **该账号在本域一页都进不去**。此时唯一正确的数据范围是「什么都看不到」。

    旧的回退默认是可实际利用的越权:`_make_user` 的 `allowedL4` 缺省是 `['*']`,
    于是「该域零可访问页 + 建号时没收窄默认范围」的普通账号,回退后拿到 `['*']`,
    命中 server.py `handle_data_json` 的 `'*' in allowed` 分支直接下发**未切分全量**
    (`handle_yitian_data` / `handle_opportunities_get` 同构)。该账号页面上一个入口
    都没有,却能 curl `/data/analysis_data.json` 取走全部项目数据。

    顺带堵住 `migrate_domain_scopes` 文档记的「已知缺口」(PROGRESS backlog L-35):
    域覆盖物化时若该域零可访问页则无处可落,旧代码回退默认反而**比原域覆盖更宽**;
    fail-closed 后这条支线也收敛到空范围,方向永远是收窄、不会放大。

    注意:超管不受影响 —— 6 处调用点都在用本函数结果前先判 `rec.get('isSuper')`,
    且超管 `allowedPages` 为 `['*']` 时 page_keys 本就非空。"""
    keys = list(page_keys or [])
    if not keys:
        return [], []
    l4set: set = set()
    staffset: set = set()
    for pk in keys:
        l4, staff = effective_scope(rec, pk)
        if '*' in l4:
            return ['*'], []
        l4set.update(l4)
        staffset.update(staff)
    return list(l4set), list(staffset)


def _validate_page_scopes(value) -> dict:
    """校验 pageScopes:{pageKey: {l4,staff}}。未知 pageKey/非 dict 值 → ValueError。
    商机域页 staff 恒清空。None → {}。"""
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError('pageScopes 须为对象')
    import config
    out: dict = {}
    for k, v in value.items():
        dom = config.PAGE_DOMAINS.get(k)
        if dom is None:
            raise ValueError(f'pageScopes 含未知或无数据域页面: {k}')
        if not isinstance(v, dict):
            raise ValueError(f'pageScopes.{k} 须为对象')
        l4 = _validate_str_list(v.get('l4', []), f'pageScopes.{k}.l4')
        staff = _validate_str_list(v.get('staff', []), f'pageScopes.{k}.staff', cap=1000)
        if dom == 'opportunity':
            staff = []
        out[k] = {'l4': l4, 'staff': staff}
    return out


def migrate_domain_scopes(accounts: dict) -> tuple:
    """把 domainScopes 物化进 pageScopes 后删除该字段(V4.5.2 两层收敛)。
    返回 (新 accounts, 改动账号数)。幂等;不改入参。

    为什么要物化而非直接忽略:域覆盖的典型用途是【收窄】(默认 ['*']、某域限某 L4)。
    若代码删了域分支而数据里仍躺着非空 domainScopes,该域会回退到【更宽的默认】——
    服务端将下发越权数据,即权限放大。物化把域层语义搬到优先级更高的页层,堵住这条路径。
    生产虽全空,但备份回滚/其它部署副本/lts 变体都可能带非空数据进来。

    原「已知缺口」(PROGRESS backlog L-35)已于 2026-08-03 关闭,记录于此以免再被当成开口:
    下方只把域范围写进【该账号能访问的页】(`if not (star or pk in pages): continue`)。
    若某账号在该域**一页都进不去**,迁移对该域什么都不写;旧版 domain_union_scope 在
    page_keys 为空时会绕过 pageScopes 回退默认范围,于是这条支线的实际范围可能比原域
    覆盖【更宽】(domainScopes 典型用于收窄,回退默认即变宽)。现在 domain_union_scope
    的空 page_keys 分支已改为 fail-closed(返回空范围),这条支线只会更严、不会更宽,
    因此本函数「零可访问页时不物化」不再构成权限放大。unmaterialized 计数仍保留 ——
    它报告的是「域范围没能落地」这一事实,对排查配置仍有意义。

    物化目标是最高优先级层,因此升级后的数据拿回旧版程序跑行为在主路径下也一致
    (双向兼容,限主路径;零可访问页的支线在旧版上会更宽,这正是上面那条修正的理由)。"""
    import config
    users = accounts.get('users', {})
    new_users: dict = {}
    changed = 0
    for acc, rec in users.items():
        if 'domainScopes' not in rec:
            new_users[acc] = rec
            continue
        new_rec = dict(rec)
        ds = new_rec.pop('domainScopes')
        if isinstance(ds, dict) and ds and not rec.get('isSuper'):
            pages = rec.get('allowedPages') or []
            star = '*' in pages
            ps = dict(new_rec.get('pageScopes') or {})
            for dom, scope in ds.items():
                if not isinstance(scope, dict):
                    continue
                for pk in config.DOMAIN_PAGES.get(dom, []):
                    if pk in ps:                        # 页层本就优先,绝不覆写
                        continue
                    if not (star or pk in pages):       # 账号进不去的页不必落
                        continue
                    ps[pk] = {'l4': list(scope.get('l4') or []),
                              'staff': list(scope.get('staff') or [])}
            new_rec['pageScopes'] = ps
        new_users[acc] = new_rec
        changed += 1
    out = dict(accounts)
    out['users'] = new_users
    return out, changed


def migrate_accounts_file() -> tuple:
    """读 accounts.json → 迁移 → 有改动则先备份再写回。
    返回 (changed, materialized, unmaterialized) 三元组:
    - changed:字段被删除的账号数(原记录带 domainScopes 键即计入,含空字典/超管等
      未触发物化的情形)。**绝大多数只是删了个空字段、什么都没物化**,不能当「域范围
      已生效」的证据汇报。
    - materialized:非超管且 domainScopes 非空的账号中,迁移后 pageScopes 条目数
      确实比迁移前多的账号数(域范围真的写进了 pageScopes)。
    - unmaterialized:非超管且 domainScopes 非空的账号中,迁移后 pageScopes 条目数
      未增加的账号数——域范围一条都没能落地(典型原因见 migrate_domain_scopes
      文档「已知缺口」:该域零可访问页时无处可落,PROGRESS backlog L-35)。
    备份名 accounts.json.bak-YYYYMMDD,同日重复运行不覆盖已有备份。"""
    with _accounts_mutate_lock:
        data = load_accounts()
        out, changed = migrate_domain_scopes(data)
        materialized = 0
        unmaterialized = 0

        def _ps_count(rec: dict) -> int:
            ps = rec.get('pageScopes')
            return len(ps) if isinstance(ps, dict) else 0

        if changed:
            for acc, rec in data.get('users', {}).items():
                ds = rec.get('domainScopes')
                if rec.get('isSuper') or not (isinstance(ds, dict) and ds):
                    continue
                if _ps_count(out['users'][acc]) > _ps_count(rec):
                    materialized += 1
                else:
                    unmaterialized += 1
            import shutil
            stamp = time.strftime('%Y%m%d')
            bak = f'{ACCOUNTS_FILE}.bak-{stamp}'
            if os.path.exists(ACCOUNTS_FILE) and not os.path.exists(bak):
                shutil.copy2(ACCOUNTS_FILE, bak)
            save_accounts(out)
        return changed, materialized, unmaterialized


def create_account(accounts: dict, account: str, password: str, display_name: str,
                   pages: list, l4: list, staff: list | None = None,
                   page_scopes: dict | None = None) -> dict:
    name = _validate_account_name(account)
    _validate_password(password)
    _validate_display_name(display_name)
    users = accounts.get('users', {})
    if name in users:
        raise ValueError(f'账号 {name} 已存在')
    pages = _validate_str_list(pages, 'allowedPages')
    l4 = _validate_str_list(l4, 'allowedL4')
    staff = _validate_str_list(staff or [], 'allowedStaff', cap=1000)
    page_scopes = _validate_page_scopes(page_scopes)
    new_users = dict(users)
    new_users[name] = _make_user(password, (display_name or name)[:64],
                                 is_super=False, pages=pages, l4=l4, staff=staff,
                                 page_scopes=page_scopes,
                                 must_change=True)
    out = dict(accounts)
    out['users'] = new_users
    return out


def update_account(accounts: dict, account: str, *, display_name=None, pages=None,
                   l4=None, staff=None, page_scopes=None,
                   password=None) -> dict:
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
    if staff is not None:
        rec['allowedStaff'] = _validate_str_list(staff, 'allowedStaff', cap=1000)
    if page_scopes is not None:
        rec['pageScopes'] = _validate_page_scopes(page_scopes)
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


def add_account(account: str, password: str, display_name: str, pages: list, l4: list,
                staff: list | None = None,
                page_scopes: dict | None = None) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = create_account(data, account, password, display_name, pages, l4, staff,
                              page_scopes)
        save_accounts(data)
        name = _validate_account_name(account)
        return public_user(name, data['users'][name])


def edit_account(account: str, *, display_name=None, pages=None, l4=None, staff=None,
                 page_scopes=None, password=None) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = update_account(data, account, display_name=display_name, pages=pages,
                              l4=l4, staff=staff,
                              page_scopes=page_scopes, password=password)
        save_accounts(data)
        return public_user(account, data['users'][account])


def remove_account(account: str) -> None:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = delete_account(data, account)
        save_accounts(data)
    destroy_sessions_for_account(account)


def change_own_password_dict(accounts: dict, account: str, old_password: str,
                             new_password: str) -> dict:
    """自助改密(纯函数):验旧密码→校验新密码(1-256 且≠旧)→换 salt/hash 并清 mustChangePassword。
    账号不存在抛 KeyError;原密码错抛 ValueError('原密码错误');新密码非法/同旧抛 ValueError。不改入参。"""
    if not isinstance(account, str):
        raise ValueError('账号名须为字符串')
    users = accounts.get('users', {})
    if account not in users:
        raise KeyError(account)
    rec = users[account]
    if not verify_password(old_password, rec.get('salt', ''), rec.get('hash', '')):
        raise ValueError('原密码错误')
    _validate_password(new_password)
    if new_password == old_password:
        raise ValueError('新密码不能与原密码相同')
    salt = secrets.token_hex(16)
    new_rec = dict(rec)
    new_rec['salt'] = salt
    new_rec['hash'] = hash_password(new_password, salt)
    new_rec['mustChangePassword'] = False
    new_users = dict(users)
    new_users[account] = new_rec
    out = dict(accounts)
    out['users'] = new_users
    return out


def change_own_password(account: str, old_password: str, new_password: str) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = change_own_password_dict(data, account, old_password, new_password)
        save_accounts(data)
        return public_user(account, data['users'][account])
