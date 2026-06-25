"""pmisdata/config.json 的 session_cookie 读写(独立纯函数,供 server 端点与测试复用)。"""
import json
import os
import re
import time

_SESSION_RE = re.compile(r'SESSION=([^;]+)')


def session_preview(cookie):
    """取 cookie 串里 SESSION 值前 8 位;无则空串。"""
    m = _SESSION_RE.search(cookie or '')
    return m.group(1)[:8] if m else ''


def write_session_cookie(config_path, cookie):
    """把 session_cookie 写回 config.json,保留其余键,原子替换。
    cookie 必须非空且含 'SESSION='。返回 SESSION 前 8 位预览。"""
    cookie = (cookie or '').strip()
    if not cookie or 'SESSION=' not in cookie:
        raise ValueError('cookie 为空或缺少 SESSION')
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    config['session_cookie'] = cookie
    tmp = config_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    os.replace(tmp, config_path)
    return session_preview(cookie)


def read_session_status(config_path):
    """返回 {sessionPreview, updatedAt}。文件不存在/坏 JSON 返回空串。"""
    try:
        mtime = os.path.getmtime(config_path)
        with open(config_path, 'r', encoding='utf-8') as f:
            cookie = json.load(f).get('session_cookie', '')
    except (OSError, ValueError):
        return {'sessionPreview': '', 'updatedAt': ''}
    return {
        'sessionPreview': session_preview(cookie),
        'updatedAt': time.strftime('%Y-%m-%d %H:%M', time.localtime(mtime)),
    }
