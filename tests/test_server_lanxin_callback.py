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
import re
import threading
import time

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


def _now_ts():
    """当前 epoch 秒。回调带新鲜度窗口(I-2)后,写死的历史时间戳一律会被判重放,
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


# ── C-1 回归:risk 域的 store key 是复合键,不是裸 projectId ───────────────────
#
# 为什么这一组必须打【真实 store】并断言【具体的键】:
# 既有的 test_handle_target_fields_are_accepted_by_their_engines 只验字段名 ∈
# PROGRESS_FIELDS —— 写进 current['P0001'] 还是 current['P0001::R-7'] 它一概看不见,
# 这正是本 bug 漏网的原因。只断言「写成功不报错」抓不到静默写错位置。

_RISK_PMIS = {
    "P0001": {
        "projectName": "示例项目",
        "riskRecords": [
            {"风险编码": "R-7", "风险名称": "验收延期", "风险等级": "高", "风险状态": "未关闭"},
            {"风险编码": "R-8", "风险名称": "预算超支", "风险等级": "中", "风险状态": "未关闭"},
        ],
    },
    "P0002": {"projectName": "无风险项目", "riskRecords": []},
}


@pytest.fixture
def risk_writer(tmp_path, monkeypatch):
    """把 risk 跟进库指向 tmp,返回一个直接调用真实写入路径的闭包。

    走的是 server 自己的 _lanxin_write_followup → risk_followup.apply_update →
    真实原子写盘,没有任何替身:键写错了这里就会如实写错。
    """
    monkeypatch.setattr(server, "RISK_FOLLOWUP_FILE", str(tmp_path / "risk_followup.json"))
    handler = object.__new__(server.CustomHandler)      # 不跑 __init__,只借实例方法

    def _write(project_id, risk_code, text="收到,已在处理"):
        ok, res = handler._lanxin_write_followup(
            "risk", "followAction", project_id, "", risk_code,
            "张三", "2026-07-20 10:00:00", text, "super", "2026-07-20 10:00:01")
        assert ok, res
        return server._load_risk_followup()

    return _write


def test_risk_handle_writes_the_composite_key_frontend_reads(risk_writer):
    """C-1 核心:写入的 key 必须与前端 riskRows.ts 读取的 key 逐字相同。

    frontend/src/lib/riskRows.ts 读的是 current[`${projectId}::${riskCode}`],
    且【没有】回退到裸 projectId 的分支。写成裸 projectId 不会报任何错,但前端
    永远读不到,而条目已被标 handled、canHandle 转 false —— 没有任何途径重新归入,
    员工的回复就此蒸发,全程零报错。
    """
    store = risk_writer("P0001", "R-7")

    assert "P0001::R-7" in store["current"]             # ① 复合键:前端真正会读的那个
    assert "P0001" not in store["current"]              # ② 裸 projectId 必须【不存在】
    assert "收到,已在处理" in store["current"]["P0001::R-7"]["followAction"]


def test_risk_composite_key_format_matches_frontend_source():
    """契约测试:直接读前端源码,确认拼法没有单方面漂移。

    两端各写一份字符串模板,任何一端改了格式,另一端不会有任何编译或测试报错 ——
    这条断言是唯一能在 CI 里发现两端漂移的东西。
    """
    ts_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "frontend", "src", "lib", "riskRows.ts")
    with open(ts_path, "r", encoding="utf-8") as f:
        src = f.read()
    # riskRows.ts 里的 `${p.projectId}::${riskCode}`
    assert re.search(r"\$\{p\.projectId\}::\$\{riskCode\}", src), \
        "riskRows.ts 的 riskKey 拼法变了,server.lanxin_risk_key 必须同步"
    assert server.lanxin_risk_key("P0001", "R-7") == "P0001::R-7"


def test_risk_writes_are_isolated_per_risk_record(risk_writer):
    """同一项目的两条风险记录各自独立:归入 R-7 绝不能污染 R-8。
    若 key 退化成 projectId,两条会写到同一格,第二条把第一条挤掉。"""
    risk_writer("P0001", "R-7", "关于 R-7 的说明")
    store = risk_writer("P0001", "R-8", "关于 R-8 的说明")

    assert "关于 R-7 的说明" in store["current"]["P0001::R-7"]["followAction"]
    assert "关于 R-8 的说明" in store["current"]["P0001::R-8"]["followAction"]
    assert "R-8" not in store["current"]["P0001::R-7"]["followAction"]


def test_risk_append_does_not_overwrite_existing(risk_writer):
    """承重墙③:归入是【追加】不是覆盖 —— 复合键路径同样要守住。"""
    risk_writer("P0001", "R-7", "第一条回复")
    store = risk_writer("P0001", "R-7", "第二条回复")

    content = store["current"]["P0001::R-7"]["followAction"]
    assert "第一条回复" in content and "第二条回复" in content


def test_risk_target_declares_needs_risk_code():
    """四域里只有 risk 需要二级 riskCode。这条钉住「唯一复合键」这个事实,
    防止将来有人给别的域顺手加上、或把 risk 的标记删掉。"""
    assert server._LANXIN_HANDLE_TARGETS["risk"].get("needsRiskCode") is True
    for dom in ("payment_key", "temp", "progress"):
        assert not server._LANXIN_HANDLE_TARGETS[dom].get("needsRiskCode")


# ── I-2 回归:时间戳新鲜度(防重放) + 存证滚动归档 ────────────────────────────

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
    """I-2 核心:签名合法但时间戳过期 = 重放,必须在【存证之前】拦掉。

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


def test_freshness_check_runs_after_signature_not_before(lanxin_srv):
    """承重墙①不能被新鲜度检查破坏:验签仍须【先于】一切。

    时间戳新鲜但签名错 → 必须报验签失败(-2)且不落盘;若把新鲜度提到验签之前,
    未验签的请求就有了一条能改变服务端行为的路径。
    """
    body = json.dumps({"dataEncrypt": _FAKE_CIPHER})
    status, payload = _post_callback(lanxin_srv, body, signature="deadbeef")

    assert payload["errCode"] == -2
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


# ── M-2 / M-3 回归:后端自己的守卫 ───────────────────────────────────────────

@pytest.fixture
def handle_srv(tmp_path, monkeypatch):
    """真实 HTTP + 超管会话 + 真实跟进库,用来打 /api/lanxin/inbox/handle。

    前端守卫【不算数】—— 这组用例全部绕过前端直接打 API,验的正是后端自己的守卫。
    """
    import auth
    import lanxin_inbox

    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {
        "super": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": True,
                  "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "超管"}}})

    monkeypatch.setattr(server, "LANXIN_INBOX_FILE", str(tmp_path / "inbox.json"))
    monkeypatch.setattr(server, "RISK_FOLLOWUP_FILE", str(tmp_path / "risk_followup.json"))
    monkeypatch.setattr(server, "_load_analysis_cached", lambda: {"projectPmis": _RISK_PMIS})

    store = lanxin_inbox.new_store()
    for iid, status, text in (("ok1", "parsed", "收到,已在处理"),
                              ("ok2", "parsed", "第二条"),
                              ("bad1", "unparsed", "")):
        lanxin_inbox.add_item(store, {
            "id": iid, "status": status, "text": text, "handled": False,
            "receivedAt": "2026-07-20 10:00:00", "name": "张三", "staffId": "s1"})
    server._save_lanxin_inbox(store)

    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": "super", "password": "p"}),
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


def test_handle_risk_end_to_end_writes_composite_key(handle_srv):
    """C-1 端到端:走完整 HTTP 归入后,风险跟进库里必须是复合键。

    这是最贴近生产的一条 —— 前端传 riskCode、后端拼 key、真实引擎落盘。
    """
    status, payload = handle_srv(itemId="ok1", domain="risk",
                                 projectId="P0001", riskCode="R-7")
    assert status == 200, payload
    assert payload["success"] is True

    store = server._load_risk_followup()
    assert "P0001::R-7" in store["current"]      # 前端 riskRows.ts 真正会读的键
    assert "P0001" not in store["current"]       # 裸 projectId 必须不存在
    assert "收到,已在处理" in store["current"]["P0001::R-7"]["followAction"]


def test_handle_risk_without_risk_code_is_rejected(handle_srv):
    """漏传 riskCode 时必须【拒绝】,绝不能退化成写裸 projectId ——
    那正是 C-1 的静默数据丢失形态。"""
    status, payload = handle_srv(itemId="ok1", domain="risk", projectId="P0001")
    assert status == 400, payload
    assert not os.path.exists(server.RISK_FOLLOWUP_FILE), "被拒的请求不许留下任何写入"


def test_handle_risk_code_from_another_project_is_rejected(handle_srv):
    """风险编码必须属于该项目,否则能在 store 里造出幽灵复合键。"""
    status, _ = handle_srv(itemId="ok1", domain="risk",
                           projectId="P0001", riskCode="R-999")
    assert status == 400


def test_handle_risk_on_project_without_risk_records_is_rejected(handle_srv):
    """项目一条风险记录都没有 → 明确拒绝并说明原因,不静默写进去。"""
    status, payload = handle_srv(itemId="ok1", domain="risk",
                                 projectId="P0002", riskCode="R-7")
    assert status == 400
    assert "无风险记录" in json.dumps(payload, ensure_ascii=False)


def test_handle_rejects_unknown_project(handle_srv):
    """M-2:projectId 必须真实存在。前端 el-select 只给现有项目,但直接打 API
    可以传任意字符串,在跟进 store 里造出永远无人读取的幽灵 key。"""
    status, _ = handle_srv(itemId="ok1", domain="progress", projectId="不存在的项目号")
    assert status == 400


def test_handle_rejects_unparsed_item(handle_srv):
    """M-2:未解析条目 text 恒为空串,归入等于往业务数据里写一条空回复。
    前端 canHandle 已挡,但【前端有守卫不等于后端可以没有】。"""
    status, payload = handle_srv(itemId="bad1", domain="progress", projectId="P0001")
    assert status == 400
    assert "未解析" in json.dumps(payload, ensure_ascii=False)


def test_handle_marks_item_handled(handle_srv):
    """归入成功后条目必须被标 handled,且 handledInfo 带上 riskCode(便于人工核对去向)。"""
    status, payload = handle_srv(itemId="ok1", domain="risk",
                                 projectId="P0001", riskCode="R-7")
    assert status == 200
    assert payload["handledInfo"]["riskCode"] == "R-7"

    store = server._load_lanxin_inbox()
    item = next(x for x in store["items"] if x["id"] == "ok1")
    assert item["handled"] is True
    # 已归入的不可重复归入(重复追加防线)
    status2, _ = handle_srv(itemId="ok1", domain="risk", projectId="P0001", riskCode="R-7")
    assert status2 == 400


def test_handle_reports_failure_when_marking_fails(handle_srv, monkeypatch):
    """M-3:标记失败必须明确告知。此刻跟进内容【已写入】,而条目仍显示「未归入」——
    超管再点一次就会把同一条回复重复追加进跟进字段,且没有任何提示。"""
    import lanxin_inbox
    monkeypatch.setattr(lanxin_inbox, "mark_handled", lambda *_a, **_k: False)

    status, payload = handle_srv(itemId="ok2", domain="risk",
                                 projectId="P0001", riskCode="R-8")

    assert status == 500, payload
    assert "标记失败" in json.dumps(payload, ensure_ascii=False)
    # 跟进内容确实已落盘 —— 提示语必须让超管知道「别再点一次」
    store = server._load_risk_followup()
    assert "P0001::R-8" in store["current"]


def test_mark_handled_returns_false_for_missing_item():
    """M-3:mark_handled 找不到条目会返回 False。返回值被丢弃的话,
    跟进内容已写入而条目仍显示「未归入」,超管再点一次就【重复追加】。"""
    import lanxin_inbox
    store = lanxin_inbox.new_store()
    assert lanxin_inbox.mark_handled(store, "nope", {"domain": "risk"}) is False
    lanxin_inbox.add_item(store, {"id": "i1", "handled": False})
    assert lanxin_inbox.mark_handled(store, "i1", {"domain": "risk"}) is True
