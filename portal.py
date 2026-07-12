"""首页门户/快捷入口(Launchpad)纯函数:配置校验 + 可见性过滤 + 文件名消毒 + 下载头。
纯标准库,不依赖 server(server 单向依赖 portal),便于 pytest。
data/portal_links.json 为本地配置;data/portal_files/ 存超管上传的可下载文件。"""
from __future__ import annotations

import re
import secrets
from urllib.parse import urlparse, quote

MAX_GROUPS = 50
MAX_ITEMS = 200
NAME_MAX = 60
EMOJI_MAX = 8
_ID_RE = re.compile(r'^pl_[A-Za-z0-9]{6,32}$')
_ILLEGAL_STORED = ('/', '\\', '..', '\x00')


def empty_config() -> dict:
    return {'version': 1, 'groups': [], 'items': []}


def new_file_token() -> str:
    """上传文件 storedName 的唯一前缀(与 item.id 无关)。"""
    return 'pf_' + secrets.token_hex(6)


def is_safe_url(url: str) -> bool:
    """仅 http/https 视为安全(挡 javascript:/data: 等点击 XSS)。"""
    try:
        return urlparse(url).scheme in ('http', 'https')
    except Exception:
        return False


def sanitize_stored_name(name: str) -> str:
    """取 basename + 去路径分隔/控制符;空则占位 'file'。用于 storedName 的原名部分。"""
    base = (name or '').replace('\\', '/').split('/')[-1]
    base = base.replace('\x00', '')
    base = re.sub(r'[\r\n\t]', '', base).strip()
    base = re.sub(r'\.{2,}', '.', base)
    return base or 'file'


def _valid_stored_name(name) -> bool:
    return bool(name) and isinstance(name, str) and not any(bad in name for bad in _ILLEGAL_STORED)


def item_visible_to(item: dict, account: str, is_super: bool = False) -> bool:
    if is_super:
        return True
    vis = item.get('visibility') or {}
    if vis.get('mode') == 'all':
        return True
    if vis.get('mode') == 'accounts':
        return account in (vis.get('accounts') or [])
    return False


def visible_for_account(config: dict, account: str) -> dict:
    """非超管视图:仅保留 visibility 命中该账号的 items,groups 收敛到仍有可见项的组。"""
    items = [it for it in config.get('items', []) if item_visible_to(it, account)]
    live = {it.get('group') for it in items}
    groups = [g for g in config.get('groups', []) if g in live]
    return {'version': config.get('version', 1), 'groups': groups, 'items': items}


def orphan_files(config: dict, existing_names: list) -> list:
    """existing_names 中不再被任何 file 项引用的文件名(可删)。"""
    ref = {(it.get('file') or {}).get('storedName')
           for it in config.get('items', []) if it.get('type') == 'file'}
    ref.discard(None)
    return [n for n in existing_names if n not in ref]


def content_disposition(filename: str) -> str:
    """RFC 5987:ascii 回退 filename= + UTF-8 filename*=,支持中文名下载。"""
    fallback = re.sub(r'[^A-Za-z0-9._-]', '_', filename) or 'download'
    return "attachment; filename=\"%s\"; filename*=UTF-8''%s" % (fallback, quote(filename, safe=''))


def _validate_visibility(vis) -> dict:
    if not isinstance(vis, dict):
        raise ValueError('visibility 须为对象')
    mode = vis.get('mode')
    if mode == 'all':
        return {'mode': 'all'}
    if mode == 'accounts':
        accounts = vis.get('accounts')
        if not isinstance(accounts, list) or not all(isinstance(a, str) for a in accounts):
            raise ValueError('visibility.accounts 须为字符串数组')
        return {'mode': 'accounts', 'accounts': list(dict.fromkeys(accounts))}
    raise ValueError('visibility.mode 须为 all 或 accounts')


def _validate_file(f) -> dict:
    if not isinstance(f, dict):
        raise ValueError('file 须为对象')
    stored, orig, size = f.get('storedName'), f.get('originalName'), f.get('size')
    if not _valid_stored_name(stored):
        raise ValueError('file.storedName 非法')
    if not isinstance(orig, str) or not orig:
        raise ValueError('file.originalName 须为非空字符串')
    if not isinstance(size, int) or isinstance(size, bool) or size < 0:
        raise ValueError('file.size 须为非负整数')
    return {'storedName': stored, 'originalName': orig, 'size': size}


def _validate_item(raw, groups) -> dict:
    if not isinstance(raw, dict):
        raise ValueError('item 须为对象')
    iid = raw.get('id')
    if not (isinstance(iid, str) and _ID_RE.match(iid)):
        raise ValueError('item.id 非法')
    typ = raw.get('type')
    if typ not in ('url', 'file'):
        raise ValueError('item.type 须为 url 或 file')
    name = raw.get('name')
    if not isinstance(name, str) or not (1 <= len(name) <= NAME_MAX):
        raise ValueError('item.name 须为 1-%d 字符' % NAME_MAX)
    if raw.get('group') not in groups:
        raise ValueError('item.group 不在 groups 内')
    emoji = raw.get('emoji', '')
    if not isinstance(emoji, str) or len(emoji) > EMOJI_MAX:
        raise ValueError('item.emoji 非法')
    out = {'id': iid, 'type': typ, 'name': name, 'group': raw['group'],
           'emoji': emoji, 'featured': bool(raw.get('featured', False)),
           'visibility': _validate_visibility(raw.get('visibility'))}
    if typ == 'url':
        url = raw.get('url', '')
        if not isinstance(url, str) or not is_safe_url(url):
            raise ValueError('item.url 须为 http/https')
        out['url'], out['file'] = url, None
    else:
        out['url'], out['file'] = '', _validate_file(raw.get('file'))
    return out


def validate_portal_config(raw) -> dict:
    """校验整份配置;非法抛 ValueError。返回规范化 {version:1, groups, items}。"""
    if not isinstance(raw, dict):
        raise ValueError('配置须为对象')
    groups_raw = raw.get('groups', [])
    if not isinstance(groups_raw, list) or not all(isinstance(g, str) and g for g in groups_raw):
        raise ValueError('groups 须为非空字符串数组')
    groups = list(dict.fromkeys(groups_raw))
    if len(groups) > MAX_GROUPS:
        raise ValueError('分组过多(上限 %d)' % MAX_GROUPS)
    items_raw = raw.get('items', [])
    if not isinstance(items_raw, list):
        raise ValueError('items 须为数组')
    if len(items_raw) > MAX_ITEMS:
        raise ValueError('门户项过多(上限 %d)' % MAX_ITEMS)
    seen, items = set(), []
    for r in items_raw:
        it = _validate_item(r, groups)
        if it['id'] in seen:
            raise ValueError('item.id 重复: %s' % it['id'])
        seen.add(it['id'])
        items.append(it)
    return {'version': 1, 'groups': groups, 'items': items}
