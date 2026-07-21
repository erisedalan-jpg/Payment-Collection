"""蓝信推送(LTS):端点注册的接线测试(不起 HTTP,只查表)。

LTS 无跟进域,不做归入 —— 与 master 版 test_lanxin_wiring.py 不同,本文件不断言
_LANXIN_HANDLE_TARGETS/审计 _ACTION_MAP(LTS 的 audit.py 未登记蓝信端点,超出本任务范围)。
只锁两件事:6 个蓝信模块能 import、8 个端点已挂且鉴权闸门正确(callback 免登录且不进
超管闸,其余 7 个进超管闸)。
"""
import server


def test_lanxin_modules_importable():
    """6 个蓝信自包含模块须能被 server.py import(Task 1~4 产物)。"""
    assert server.lanxin
    assert server.lanxin_callback
    assert server.lanxin_config
    assert server.lanxin_crypto
    assert server.lanxin_inbox
    assert server.lanxin_recipients


def test_eight_lanxin_endpoints_are_wired():
    """8 个端点须能在 handler 上找到对应方法(挂载于 _dispatch_get/_dispatch_post)。"""
    handler_names = [
        "handle_lanxin_config_get", "handle_lanxin_config_save",
        "handle_lanxin_selftest", "handle_lanxin_preview", "handle_lanxin_send",
        "handle_lanxin_callback", "handle_lanxin_inbox_get",
        "handle_lanxin_inbox_handle", "handle_lanxin_inbox_delete",
    ]
    for name in handler_names:
        assert hasattr(server.CustomHandler, name), "缺少 handler: %s" % name


def test_callback_is_auth_exempt_and_not_super_only():
    """/api/lanxin/callback 免登录(蓝信不带会话 cookie),且绝不能进超管闸
    (那个闸按 path 匹配、不分 method,进了就等于把蓝信挡在门外)。"""
    assert '/api/lanxin/callback' in server._AUTH_EXEMPT
    assert server._path_needs_auth('/api/lanxin/callback') is False
    assert '/api/lanxin/callback' not in server._SUPER_ONLY_PATHS


def test_other_seven_lanxin_endpoints_are_super_only():
    for p in ('/api/lanxin/config', '/api/lanxin/selftest',
              '/api/lanxin/preview', '/api/lanxin/send',
              '/api/lanxin/inbox', '/api/lanxin/inbox/handle',
              '/api/lanxin/inbox/delete'):
        assert p in server._SUPER_ONLY_PATHS, "%s 未进超管闸" % p
