"""回调端点的回归 —— 重点是三条承重设计。

绝大多数用例打纯函数与模块级常量(参照 tests/test_server_audit.py 的既有做法)。
末尾两条【必须起真实 HTTP 服务】(夹具比照 tests/test_server_authz.py):
「验签先于存证」与「解析失败仍回 errCode 0」是 handler 内部的【执行顺序】与
【返回码】,纯函数层根本触碰不到 —— 只有真发一次请求才能证明它们没被重构掉。
"""
import base64
import hashlib
import http.client
import json
import os
import threading

import pytest

import lanxin_config
import server


def test_callback_path_is_auth_exempt():
    """蓝信不会带我们的会话 cookie。这条断言防止将来有人「统一收紧鉴权」时误伤。"""
    assert server._path_needs_auth('/api/lanxin/callback') is False


def test_callback_path_is_not_super_only():
    """_SUPER_ONLY_PATHS 按 path 匹配、不分 method —— 进了就等于把蓝信挡在门外。"""
    assert '/api/lanxin/callback' not in server._SUPER_ONLY_PATHS


def test_inbox_paths_are_super_only():
    for p in ('/api/lanxin/inbox', '/api/lanxin/inbox/handle', '/api/lanxin/inbox/delete'):
        assert p in server._SUPER_ONLY_PATHS


def test_append_reply_keeps_existing_content():
    """归入必须【追加】。followup_store.apply_update 是覆盖写,
    直接调用会抹掉该项目已有的跟进内容。"""
    old = '原有跟进内容'
    out = server._lanxin_append_reply(old, '张三', '2026-07-20 10:00:00', '新回复')
    assert old in out
    assert '新回复' in out


def test_append_reply_on_empty_existing():
    out = server._lanxin_append_reply('', '张三', '2026-07-20 10:00:00', '新回复')
    assert '新回复' in out
    assert not out.startswith('<br>')


def test_append_reply_escapes_html():
    """回复是员工任意输入,跟进字段是富文本 → 不转义就是存储型 XSS。"""
    out = server._lanxin_append_reply('', '张三', '2026-07-20 10:00:00',
                                      '<script>alert(1)</script>')
    assert '<script>' not in out
    assert '&lt;script&gt;' in out


def test_append_reply_escapes_name_too():
    """姓名同样来自外部数据,一并转义。"""
    out = server._lanxin_append_reply('', '<img src=x onerror=1>', '2026-07-20 10:00:00', 'hi')
    assert '<img' not in out


def test_append_reply_uses_only_whitelisted_tags():
    """前端 richText 白名单是 B/STRONG/U/I/EM/S/STRIKE/DEL/BR/SPAN/FONT ——
    <p> 不在其中,用了会被读端拆解。换行只能用 <br>。"""
    out = server._lanxin_append_reply('旧', '张三', '2026-07-20 10:00:00', '第一行\n第二行')
    assert '<p>' not in out and '</p>' not in out
    assert '<br>' in out


def test_append_reply_marks_source():
    """归入的内容必须能看出来源,否则跟进记录里会出现无出处的文字。"""
    out = server._lanxin_append_reply('', '张三', '2026-07-20 10:00:00', '内容')
    assert '蓝信' in out and '张三' in out


def test_handle_domain_field_map_matches_real_domains():
    """四域首个进展字段已核实,不得臆测:
    risk/payment_key = followAction、temp/progress = weekProgress。"""
    assert server._LANXIN_HANDLE_TARGETS['risk']['field'] == 'followAction'
    assert server._LANXIN_HANDLE_TARGETS['payment_key']['field'] == 'followAction'
    assert server._LANXIN_HANDLE_TARGETS['temp']['field'] == 'weekProgress'
    assert server._LANXIN_HANDLE_TARGETS['progress']['field'] == 'weekProgress'


def test_handle_target_fields_are_accepted_by_their_engines():
    """字段名只对上字符串还不够 —— 各域引擎会对不在 PROGRESS_FIELDS 里的字段抛
    ValueError。把映射表与四个引擎的真实白名单对齐,防止「名字看着对、写进去就 500」。"""
    import risk_followup
    import payment_key_followup
    import temp_followup
    assert server._LANXIN_HANDLE_TARGETS['risk']['field'] in risk_followup.PROGRESS_FIELDS
    assert server._LANXIN_HANDLE_TARGETS['payment_key']['field'] in payment_key_followup.PROGRESS_FIELDS
    assert server._LANXIN_HANDLE_TARGETS['temp']['field'] in temp_followup.PROGRESS_FIELDS
    assert server._LANXIN_HANDLE_TARGETS['progress']['field'] in server.PROGRESS_FIELDS


def test_callback_audit_actions_registered():
    """审计埋点靠 _ACTION_MAP 查表,漏登记就是死埋点(V3.3.0 教训)。
    注:任务书写的是 audit.action_for,仓库里的真实函数名是 audit.map_action。"""
    import audit
    assert audit.map_action('POST', '/api/lanxin/inbox/handle') is not None
    assert audit.map_action('POST', '/api/lanxin/inbox/delete') is not None


def test_record_sent_populates_identity_lookup(tmp_path, monkeypatch):
    """dispatch 的 sentLog 是回调侧反查 staffId↔工号/姓名、推荐归入项目的【唯一依据】。
    不落台账,收件箱里每个人都只会显示一串 524288-xxx 和「未知」,且不报任何错。
    键名对齐一旦断掉就是静默失效,故用一次真实读写盘把它钉住。"""
    import lanxin_inbox
    monkeypatch.setattr(server, 'LANXIN_INBOX_FILE', str(tmp_path / 'lanxin_inbox.json'))
    server._lanxin_record_sent([{"staffId": "524288-aaa", "employId": "A000701",
                                 "name": "张三", "routeKey": "anomaly",
                                 "projectIds": ["P0001"], "msgId": "m1"}],
                               '2026-07-20 10:00:00')
    store = server._load_lanxin_inbox()
    assert lanxin_inbox.resolve_identity(store, "524288-aaa")["employId"] == "A000701"
    assert lanxin_inbox.candidate_projects(store, "524288-aaa") == ["P0001"]


def test_record_sent_never_raises_on_io_failure(tmp_path, monkeypatch):
    """消息已发出、不可撤销 —— 台账 IO 失败绝不能把一次成功的推送变成 500。"""
    monkeypatch.setattr(server, 'LANXIN_INBOX_FILE', str(tmp_path / 'lanxin_inbox.json'))

    def _boom(_store):
        raise OSError('磁盘满')

    monkeypatch.setattr(server, '_save_lanxin_inbox', _boom)
    server._lanxin_record_sent([{"staffId": "s", "employId": "e", "name": "n",
                                 "routeKey": "r", "projectIds": [], "msgId": ""}],
                               '2026-07-20 10:00:00')


def test_config_get_exposes_rejected_counter():
    """验签失败只记数不落报文体,这个计数器是超管判断「签名令牌填错了」的唯一线索;
    不下发它,配错了就是一片死寂。"""
    assert 'rejected' in server._lanxin_config_payload()


def test_config_payload_never_leaks_secrets():
    """三个密钥绝不下发。public_config 已抹,这条守住「将来有人图省事直接下发 cfg」。"""
    payload = server._lanxin_config_payload()
    cred = payload['config'].get('credentials') or {}
    for field in ('appSecret', 'callbackAesKey', 'callbackSignToken'):
        assert cred.get(field) == ''


# ── 以下两条起真实 HTTP 服务(夹具比照 tests/test_server_authz.py) ──────────────
#
# 为什么非用 HTTP 不可:这两条护栏守的是 handle_lanxin_callback 内部的
# 【闸门顺序】与【返回码】。顺序和返回码都不是任何纯函数的输出 ——
# 不真发一次请求,就没有任何东西能证明它们还在。

# 语法合法(43 字符 base64,补 "=" 后解出 32 字节)但【值不对】的回调密钥。
_WRONG_AES_KEY = "A" * 43
# 合法 base64、长度 32 字节(16 的整数倍,过得了长度校验)的假密文。
# 用错密钥解它,必然在 PKCS7 去填充或 JSON 解析处抛 ValueError —— 两条路都通向
# 「落 unparsed 条目」,正是本用例要观察的那条分支。
_FAKE_CIPHER = base64.b64encode(bytes(32)).decode()


def _sign(sign_token, timestamp, nonce, data_encrypt):
    """按蓝信算法算签名:sha1(sort(token, timestamp, nonce, dataEncrypt))。"""
    return hashlib.sha1(
        "".join(sorted([sign_token, timestamp, nonce, data_encrypt])).encode("utf-8")
    ).hexdigest()


@pytest.fixture
def lanxin_srv(tmp_path, monkeypatch):
    """起一个真实 HTTP 服务,并把蓝信三个文件常量全部指到 tmp_path。

    存证/收件箱【绝不能】写进真实 data/ —— 那是现网运行数据。
    """
    monkeypatch.setattr(server, "LANXIN_CONFIG_FILE", str(tmp_path / "lanxin_config.json"))
    monkeypatch.setattr(server, "LANXIN_RAW_FILE", str(tmp_path / "raw.jsonl"))
    monkeypatch.setattr(server, "LANXIN_INBOX_FILE", str(tmp_path / "inbox.json"))
    # 计数器是模块级可变字典,用例之间会串 —— 每次归零,并在退出时还原。
    before = dict(server._lanxin_rejected)
    server._lanxin_rejected.update({"count": 0, "lastAt": "", "lastFrom": ""})

    cfg = lanxin_config.default_config()
    cfg["credentials"]["callbackSignToken"] = "tok-abc"
    cfg["credentials"]["callbackAesKey"] = _WRONG_AES_KEY
    with open(server.LANXIN_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False)

    srv = server.create_server(host="127.0.0.1", port=0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        yield srv.server_address[1]
    finally:
        srv.shutdown()
        srv.server_close()
        server._lanxin_rejected.update(before)


def _post_callback(port, body, timestamp="1700000000", nonce="n1", signature=""):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    path = "/api/lanxin/callback?timestamp=%s&nonce=%s&signature=%s" % (
        timestamp, nonce, signature)
    conn.request("POST", path, body, {"Content-Type": "application/json"})
    r = conn.getresponse()
    payload = json.loads(r.read().decode("utf-8"))
    conn.close()
    return r.status, payload


def test_bad_signature_writes_nothing_to_disk(lanxin_srv):
    """承重墙①:验签【必须先于】存证。

    这是全站唯一的免登录写入口。若先无条件落盘,同网段任何人都能 POST 垃圾
    把磁盘灌满 —— 验签只是一次 SHA1,成本极低,没有任何理由放到存证后面。
    """
    body = json.dumps({"dataEncrypt": _FAKE_CIPHER})
    before = server._lanxin_rejected["count"]

    status, payload = _post_callback(lanxin_srv, body, signature="deadbeef")

    assert status == 200
    assert payload["errCode"] == -2                      # ① 明确告知验签失败
    assert not os.path.exists(server.LANXIN_RAW_FILE)    # ② 一个字节都没落盘
    assert server._lanxin_rejected["count"] == before + 1  # ③ 只记数,不记 body


def test_decrypt_failure_still_returns_zero_and_keeps_evidence(lanxin_srv):
    """承重墙②:验签过了、解密失败,仍返回 errCode 0。

    存证一旦落盘,重推就毫无意义 —— 内容一模一样,我们会以同样方式再失败三次,
    白白烧掉蓝信的 3 次重试额度。「成功」的定义是「我已持久化」而非「我已理解」。
    同时不静默丢弃:看不懂的东西必须以 unparsed 的形态出现在收件箱里。
    """
    body = json.dumps({"dataEncrypt": _FAKE_CIPHER})
    sig = _sign("tok-abc", "1700000000", "n1", _FAKE_CIPHER)

    status, payload = _post_callback(lanxin_srv, body, signature=sig)

    assert status == 200
    assert payload["errCode"] == 0                       # ① 承重墙:绝不请求重推

    with open(server.LANXIN_RAW_FILE, "r", encoding="utf-8") as f:
        lines = [ln for ln in f.read().splitlines() if ln.strip()]
    assert len(lines) == 1                               # ② 存证确实多了一行
    assert json.loads(lines[0])["body"] == body

    with open(server.LANXIN_INBOX_FILE, "r", encoding="utf-8") as f:
        inbox = json.load(f)
    unparsed = [it for it in inbox["items"] if it.get("status") == "unparsed"]
    assert len(unparsed) == 1                            # ③ 不静默丢弃
    assert unparsed[0]["unparsedReason"]                 # 原因必须写明,不能是空串
