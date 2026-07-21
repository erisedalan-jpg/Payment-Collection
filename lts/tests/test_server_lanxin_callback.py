"""回调端点的回归(LTS,移植自 master)—— 重点是两条承重设计:验签先于存证、
解析失败仍回 errCode 0。LTS 无跟进域,不做归入,故本文件删除了 master 版里
读 frontend/src/lib/riskRows.ts 的 lanxin_risk_key 契约测试,以及围绕
_LANXIN_HANDLE_TARGETS/_lanxin_write_followup/_lanxin_append_reply 的全部用例
(这些符号在 LTS 不存在)。inbox/handle 改为验证降级版:仅标记已处理,无归入。

绝大多数用例打纯函数与模块级常量。末尾几条【必须起真实 HTTP 服务】——
「验签先于存证」与「解析失败仍回 errCode 0」是 handler 内部的【执行顺序】与
【返回码】,纯函数层根本触碰不到,只有真发一次请求才能证明它们没被重构掉。
"""
import base64
import hashlib
import http.client
import json
import os
import threading
import time

import pytest

import auth
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


def test_record_sent_populates_identity_lookup(tmp_path, monkeypatch):
    """dispatch 的 sentLog 是回调侧反查 staffId↔工号/姓名的【唯一依据】。
    不落台账,收件箱里每个人都只会显示一串 524288-xxx 和「未知」,且不报任何错。
    键名对齐一旦断掉就是静默失效,故用一次真实读写盘把它钉住。"""
    import lanxin_inbox
    monkeypatch.setattr(server, 'LANXIN_INBOX_FILE', str(tmp_path / 'lanxin_inbox.json'))
    server._lanxin_record_sent([{"staffId": "524288-aaa", "employId": "A000701",
                                 "name": "张三", "routeKey": "project",
                                 "projectIds": ["P0001"], "msgId": "m1"}],
                               '2026-07-20 10:00:00')
    store = server._load_lanxin_inbox()
    assert lanxin_inbox.resolve_identity(store, "524288-aaa")["employId"] == "A000701"


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


# ── 以下几条起真实 HTTP 服务 ──────────────────────────────────────────────
#
# 为什么非用 HTTP 不可:这几条护栏守的是 handle_lanxin_callback 内部的
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
    server._lanxin_rejected.update({"count": 0, "lastAt": "", "lastFrom": "", "lastReason": ""})

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


def _now_ts():
    """当前 epoch 秒。回调带新鲜度窗口后,写死的历史时间戳一律会被判重放,
    故所有用例的 timestamp 都必须现算。"""
    return str(int(time.time()))


def _post_callback(port, body, timestamp=None, nonce="n1", signature=""):
    timestamp = _now_ts() if timestamp is None else timestamp
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
    ts = _now_ts()
    sig = _sign("tok-abc", ts, "n1", _FAKE_CIPHER)

    status, payload = _post_callback(lanxin_srv, body, timestamp=ts, signature=sig)

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


def test_timestamp_freshness_pure():
    """纯函数:窗口内为真,窗口外为假,垃圾入参一律为假。"""
    now = 1_700_000_000
    assert server.lanxin_timestamp_fresh(str(now), now) is True
    assert server.lanxin_timestamp_fresh(str(now - 299), now) is True
    assert server.lanxin_timestamp_fresh(str(now + 299), now) is True
    assert server.lanxin_timestamp_fresh(str(now - 301), now) is False
    assert server.lanxin_timestamp_fresh(str(now + 301), now) is False
    # 13 位毫秒口径也认(蓝信文档给的是秒,但两种都容错)
    assert server.lanxin_timestamp_fresh(str(now * 1000), now) is True
    assert server.lanxin_timestamp_fresh(str((now - 3600) * 1000), now) is False
    # 缺参/垃圾参:必然验不过,不给放行
    for bad in ("", None, "abc", "17e9", " ", "1.5"):
        assert server.lanxin_timestamp_fresh(bad, now) is False


def test_replayed_signature_is_rejected_and_writes_nothing(lanxin_srv):
    """核心:签名合法但时间戳过期 = 重放,必须在【存证之前】拦掉。

    不拦的话:签名是对的(验签计数不涨)、事件去重在存证【之后】(收件箱毫无变化),
    每次却都往纯 append 的 jsonl 追加一行 —— 无任何告警,直到磁盘写满、
    全平台原子写失败。
    """
    stale = str(int(time.time()) - 86400)                # 一天前的合法签名
    body = json.dumps({"dataEncrypt": _FAKE_CIPHER})
    sig = _sign("tok-abc", stale, "n1", _FAKE_CIPHER)    # 签名本身完全正确
    before = server._lanxin_rejected["count"]

    status, payload = _post_callback(lanxin_srv, body, timestamp=stale, signature=sig)

    assert status == 200
    assert payload["errCode"] == -2                       # ① 明确拒绝
    assert not os.path.exists(server.LANXIN_RAW_FILE)     # ② 一个字节都没落盘
    assert server._lanxin_rejected["count"] == before + 1  # ③ 计数器能让超管看见


def test_rejected_last_reason_distinguishes_signature_from_stale(lanxin_srv):
    """验签失败与新鲜度失败此前共用同一个 _lanxin_rejected 计数器,没有原因字段——
    超管只看到拒绝计数在涨,分不清该查 signToken 还是查时间戳格式/两端时钟。
    lastReason 必须能区分这两种情况,文案上一个指向"签名填错了",
    一个指向"时间戳/时钟对不上"。
    """
    body = json.dumps({"dataEncrypt": _FAKE_CIPHER})

    status, payload = _post_callback(lanxin_srv, body, signature="deadbeef")
    assert payload["errCode"] == -2
    assert server._lanxin_rejected["lastReason"] == "signature"

    stale = str(int(time.time()) - 86400)
    sig = _sign("tok-abc", stale, "n1", _FAKE_CIPHER)     # 签名本身完全正确
    status, payload = _post_callback(lanxin_srv, body, timestamp=stale, signature=sig)
    assert payload["errCode"] == -2
    assert server._lanxin_rejected["lastReason"] == "stale"


def test_freshness_check_runs_after_signature_not_before(lanxin_srv):
    """承重墙①不能被新鲜度检查破坏:验签仍须【先于】一切。

    时间戳新鲜但签名错 → 必须报验签失败(-2)且不落盘。但这个输入在【两种顺序下
    结果完全相同】(都返回 -2、都不落盘)——抓不到顺序被调换,把新鲜度检查整段挪到
    验签之前,这条断言一条都不会红。

    唯一能区分顺序的输入是【时间戳过期 且 签名错】:正确顺序(验签先行)下,走不到
    新鲜度检查,必须报的是【签名】错误;若新鲜度被错误地提到验签之前,过期的时间戳
    会先被拦下,报出的会变成「时间戳超出有效窗口」——下面这条断言就是靠这一点分辨。
    """
    body = json.dumps({"dataEncrypt": _FAKE_CIPHER})
    status, payload = _post_callback(lanxin_srv, body, signature="deadbeef")

    assert payload["errCode"] == -2
    assert not os.path.exists(server.LANXIN_RAW_FILE)

    stale = str(int(time.time()) - 86400)
    status, payload = _post_callback(lanxin_srv, body, timestamp=stale, signature="deadbeef")
    assert status == 200
    assert "签名" in payload["errMsg"]     # 顺序若反,这里会变成「时间戳超出有效窗口」
    assert not os.path.exists(server.LANXIN_RAW_FILE)


def test_raw_evidence_rotates_when_oversized(tmp_path, monkeypatch):
    """存证文件超上限 → 整份挪进归档目录,活动文件重新从 0 开始。
    不滚动的话这个纯 append 的 jsonl 只增不减,正常流量下也会撑满磁盘。"""
    raw = tmp_path / "raw.jsonl"
    monkeypatch.setattr(server, "LANXIN_RAW_FILE", str(raw))
    monkeypatch.setattr(server, "LANXIN_RAW_ARCHIVE_DIR", str(tmp_path / "arch"))
    monkeypatch.setattr(server, "LANXIN_RAW_MAX_BYTES", 200)

    raw.write_text("x" * 500, encoding="utf-8")
    server._lanxin_rotate_raw()

    assert not raw.exists(), "超限的活动文件应已被挪走"
    archived = sorted(os.listdir(str(tmp_path / "arch")))
    assert len(archived) == 1
    # 存证是「原样留证」,滚动过程中一个字节都不许改
    with open(os.path.join(str(tmp_path / "arch"), archived[0]), encoding="utf-8") as f:
        assert f.read() == "x" * 500


def test_raw_evidence_not_rotated_below_threshold(tmp_path, monkeypatch):
    """未超限不许动 —— 每次回调都滚动会把存证切成无数碎片。"""
    raw = tmp_path / "raw.jsonl"
    monkeypatch.setattr(server, "LANXIN_RAW_FILE", str(raw))
    monkeypatch.setattr(server, "LANXIN_RAW_ARCHIVE_DIR", str(tmp_path / "arch"))
    monkeypatch.setattr(server, "LANXIN_RAW_MAX_BYTES", 1000)

    raw.write_text("x" * 10, encoding="utf-8")
    server._lanxin_rotate_raw()

    assert raw.exists() and raw.read_text(encoding="utf-8") == "x" * 10
    assert not os.path.exists(str(tmp_path / "arch"))


def test_raw_archive_keeps_only_recent_files(tmp_path, monkeypatch):
    """归档份数有上限,否则「滚动」只是把无限增长挪个目录。"""
    raw = tmp_path / "raw.jsonl"
    arch = tmp_path / "arch"
    arch.mkdir()
    monkeypatch.setattr(server, "LANXIN_RAW_FILE", str(raw))
    monkeypatch.setattr(server, "LANXIN_RAW_ARCHIVE_DIR", str(arch))
    monkeypatch.setattr(server, "LANXIN_RAW_MAX_BYTES", 100)
    monkeypatch.setattr(server, "LANXIN_RAW_ARCHIVE_KEEP", 2)

    for i in range(4):
        (arch / ("lanxin-callback-raw-2026010%d-000000.jsonl" % i)).write_text("old", encoding="utf-8")
    raw.write_text("y" * 200, encoding="utf-8")
    server._lanxin_rotate_raw()

    left = sorted(os.listdir(str(arch)))
    assert len(left) == 2, left          # 4 份旧 + 1 份新 → 只留最近 2 份


def test_rotate_failure_never_raises(tmp_path, monkeypatch):
    """滚动是维护动作。它失败绝不能让一次合法回调返回失败 ——
    承重墙②:唯一返回非 0 的分支是存证落盘本身失败。"""
    raw = tmp_path / "raw.jsonl"
    monkeypatch.setattr(server, "LANXIN_RAW_FILE", str(raw))
    monkeypatch.setattr(server, "LANXIN_RAW_ARCHIVE_DIR", str(tmp_path / "arch"))
    monkeypatch.setattr(server, "LANXIN_RAW_MAX_BYTES", 10)
    raw.write_text("z" * 100, encoding="utf-8")

    def _boom(*_a, **_k):
        raise OSError("磁盘满")

    monkeypatch.setattr(server.os, "replace", _boom)
    server._lanxin_rotate_raw()          # 不抛出即通过


# ── 降级版 inbox/handle:LTS 无跟进域,仅标记已处理,不做归入 ─────────────────

@pytest.fixture
def handle_srv(tmp_path, monkeypatch):
    """真实 HTTP + 超管会话 + 真实收件箱库,用来打 /api/lanxin/inbox/handle。"""
    import lanxin_inbox

    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    auth.seed_default_accounts()

    monkeypatch.setattr(server, "LANXIN_INBOX_FILE", str(tmp_path / "inbox.json"))

    store = lanxin_inbox.new_store()
    lanxin_inbox.add_item(store, {
        "id": "ok1", "status": "parsed", "text": "收到,已在处理", "handled": False,
        "receivedAt": "2026-07-20 10:00:00", "name": "张三", "staffId": "s1"})
    server._save_lanxin_inbox(store)

    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": "admin", "password": "admin123!"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = r.getheader("Set-Cookie").split(";")[0]
    r.read()

    def _handle(**payload):
        c = http.client.HTTPConnection("127.0.0.1", port)
        c.request("POST", "/api/lanxin/inbox/handle", json.dumps(payload),
                  {"Content-Type": "application/json", "Cookie": cookie})
        resp = c.getresponse()
        st, raw = resp.status, resp.read().decode("utf-8")
        c.close()
        return st, json.loads(raw)

    try:
        yield _handle
    finally:
        conn.close()
        srv.shutdown()
        srv.server_close()


def test_handle_marks_item_handled_with_by_and_at(handle_srv):
    """LTS 无归入去向 —— 只置 handled + handledInfo={by, at},供超管人工分诊。"""
    status, payload = handle_srv(itemId="ok1")
    assert status == 200, payload
    assert payload["success"] is True

    store = server._load_lanxin_inbox()
    item = next(x for x in store["items"] if x["id"] == "ok1")
    assert item["handled"] is True
    assert item["handledInfo"]["by"] == "admin"
    assert item["handledInfo"]["at"]


def test_handle_unknown_item_id_returns_404(handle_srv):
    """收件箱里不存在的 itemId 必须明确 404,不能静默成功。"""
    status, payload = handle_srv(itemId="不存在的条目")
    assert status == 404
    assert payload["success"] is False


def test_handle_missing_item_id_returns_400(handle_srv):
    status, payload = handle_srv(itemId="")
    assert status == 400
    assert payload["success"] is False
