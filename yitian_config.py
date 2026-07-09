"""data/yitian_config.json 的 session_cookie 读写(独立纯函数,供 server 端点与测试复用)。
仿 pmis_config.py,但倚天 cookie 无固定 SESSION 键,故只校验非空。不依赖 server。"""
import json
import os
import time


def session_preview(cookie):
    """取 cookie 串前 8 位;空则空串(倚天无固定 SESSION 键)。"""
    return (cookie or '').strip()[:8]


def write_session_cookie(config_path, cookie):
    """把 session_cookie 写 config.json(不存在则新建,保留其余键),原子替换。
    cookie 必须非空。返回前 8 位预览。"""
    cookie = (cookie or '').strip()
    if not cookie:
        raise ValueError('cookie 为空')
    config = {}
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except (OSError, ValueError):
            config = {}
    config['session_cookie'] = cookie
    os.makedirs(os.path.dirname(config_path) or '.', exist_ok=True)
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
