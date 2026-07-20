# V4.0.5 蓝信双向闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让员工在蓝信里对推送卡片的回复，经回调回流到本系统，落入超管可见的收件箱，并可归入业务跟进域。

**Architecture:** 新增三个零依赖 Python 模块（`lanxin_crypto` 解密验签 / `lanxin_inbox` 存储 / `lanxin_callback` 编排），`server.py` 增一个免登录入站端点与一组超管收件箱端点，`/data` 增第四签。发送侧支持应用号与智能机器人两种身份。

**Tech Stack:** Python 3.8+ 标准库（无新增三方依赖）；Vue3 + TS + Element Plus；pytest / vitest。

**Spec:** `docs/superpowers/specs/2026-07-20-lanxin-bidirectional-callback-design.md`

---

## Global Constraints

以下为全局约束，**每个任务的要求都隐含包含本节**：

- **不使用任何 emoji**。需要符号时用 `→ ↓ ❌ ✕ ▾`
- 交流与注释一律**简体中文**；代码、命令、文件名保持原文
- **绝不记密钥**：`appSecret` / `callbackAesKey` / `callbackSignToken` / `app_token` 绝不进日志、审计、异常消息、前端下发。读取接口一律脱敏
- **严禁修改 `followup_store.py`**（temp/risk/opportunity/payment_key 四域共用引擎）
- **不动 `lts/`** 目录
- **后端不接受前端传来的 `staffId`**，只认 `projectId` / `employId`
- **不静默丢弃**：未解析、被截断、失败的条目一律显式暴露
- 新增第三方依赖：**零**。标准库以外一律不引入
- 版本号写入 `frontend/src/version.ts`，值为 `V4.0.5`（**单一来源，只改此处**）
- 打包(frozen)与开发两套代码路径若涉及则同时维护（`if getattr(sys, 'frozen', False)`）
- 完成定义：代码改完 **且** `bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新
- 每条护栏须做**变异验证**（故意改坏，确认测试变红），并在任务报告中写明

### 回调协议常量（来自蓝信官方文档，不得臆改）

- 验签：`sha1(''.join(sorted([signToken, dataEncrypt, timestamp, nonce])))`，小写十六进制
- 解密：`key = base64_decode(aesKey + "=")`（32 字节）；**AES-256-CBC**；**IV = key[:16]**；PKCS7 去填充
- 响应：HTTP 200 + `{"errCode":0,"errMsg":"ok"}`，须 3 秒内
- 错误码：`0` 正常 / `-1` 解密失败 / `-2` 验签失败 / `-3` 反序列化失败 / `-4` 其他
- 事件类型：`account_message`、`bot_private_message`、`bot_group_message`
- 键名**两套都认**：`type`/`eventType`、`app_id`/`appId`、`org_id`/`orgId`、`len`/`length`

### 承重设计（三条，不得在实现中被"简化"掉）

1. **验签必须先于存证** —— 免登录写入口若先无条件落盘，同网段任何人可灌满磁盘
2. **解密/解析失败仍返回 `errCode 0`** —— 存证已落盘后重推毫无意义，只会烧掉蓝信 3 次重试额度。「成功」定义为「我已持久化」而非「我已理解」。**唯一**返回非 0 的分支是存证落盘失败
3. **归入必须追加 + 转义** —— `followup_store.py:71` 是覆盖写；回复是员工任意输入而跟进字段是富文本

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `lanxin_crypto.py` | 新建 | AES-256-CBC 解密 + SHA1 验签。纯函数，零依赖，无状态 |
| `lanxin_inbox.py` | 新建 | 收件箱 + 发送台账的纯数据操作（不碰文件 IO 以外的业务） |
| `lanxin_callback.py` | 新建 | 回调编排：验签 → 解密 → 解析 → 去重。纯函数，不做文件 IO |
| `lanxin.py` | 改 | 抽 `_send` 共用；新增 `send_bot_message`；`dispatch` 按 `sendAs` 选并回传台账 |
| `lanxin_config.py` | 改 | 新增 `callbackAesKey` / `callbackSignToken` / `sendAs` 及校验与脱敏 |
| `lanxin_recipients.py` | 改 | 卡片底部回复引导语 |
| `server.py` | 改 | `/api/lanxin/callback`（免登录）+ `/api/lanxin/inbox*`（超管） |
| `frontend/src/components/LanxinConfigCard.vue` | 改 | 发送身份 / 两个回调凭证 / 回调地址复制 / 拒绝计数 |
| `frontend/src/components/LanxinInboxCard.vue` | 新建 | 收件箱表格 + 归入抽屉 |
| `frontend/src/views/DataView.vue` | 改 | 新增第四签「蓝信回复」 |
| `frontend/src/lib/lanxinInbox.ts` | 新建 | 收件箱前端类型与 API |

### 执行波次（任务间文件不相交，同波可并行）

- **波 A（可 4 并行）**：Task 1、Task 2、Task 3、Task 4
- **波 B（可 2 并行）**：Task 5、Task 7
- **波 C**：Task 6（独占 `server.py`）
- **波 D**：Task 8
- **波 E**：Task 9

Task 6 与 Task 8 分别独占 `server.py` 与前端新签，**不可与同波其他任务并行**。

---

### Task 1: `lanxin_crypto.py` —— 验签与解密

**Files:**
- Create: `lanxin_crypto.py`
- Test: `tests/test_lanxin_crypto.py`

**Interfaces:**
- Consumes: 无（零依赖）
- Produces:
  - `verify_signature(sign_token: str, timestamp: str, nonce: str, data_encrypt: str, signature: str) -> bool`
  - `decrypt(aes_key: str, data_encrypt: str) -> str`（失败抛 `ValueError`）

**为什么自己实现 AES：** 服务端仅用标准库，而标准库没有 AES。回调是单向入站，**只需解密、不需加密**，故只实现 CBC 解密路径。正确性不靠自证 —— 用蓝信官方文档给出的测试向量做断言。

- [ ] **Step 1: 写失败测试**

创建 `tests/test_lanxin_crypto.py`：

```python
"""lanxin_crypto 的回归。

断言用的是【蓝信官方文档给出的测试向量】,不是自造 fixture ——
这是本功能里唯一能在无凭证情况下做真实回归的部分,必须做实。
"""
import json

import pytest

import lanxin_crypto as C

# 官方文档「消息加解密说明」给出的密钥与密文
DOC_AES_KEY = "RDNBMkZCNkFDMThERjFDNkNFMjVFRDBEMjc4NkRERjM"
DOC_CIPHER = (
    "5A/cI322pghOwnRCBoMZmOPjhzpZIdNmtW1Q05oG4z8L8lwIca2kIjrrwfGxlhJOk2LmLsdSLGRNQekNp8icYvd0"
    "W7vu7/hqL18wpYRgng0hvjUyUOBtpytU1qWwqyOaAIt9NwzJGq3emSlWhFMle/GnJqNer3vwyZ/IftfJ5mdG3qX0"
    "2OLXV6cLEz3FhuhJLfLRUjmn2ZhCLv6+v3S+agdsYIU700sivpYW2bleG7AfaMz6uCyo0/EtXOjo+Ba3NnNuPd/m"
    "nwUo5raTOynj6SaLnpLJLCqZ56wtQeFuxYIetooOcv122DGM8t6Dg9oy8+1H7ZKGAzHjw9sBjg+2v5QEPodpgNl7"
    "bhBqbtNCxRUokkcLwbM7jawm9pVBkErj9Hh59zXtFCkka6ExCPo9/p/AA8+Tda/4r1KNnGDjw/pGsCt5m5AC1R+u"
    "b2Z35FyENXHP7tb9z5qn5eqthCUVg512PGCrE1GAEK8Gp7S4aTCrU7fQPh9QTXTxnpLiDFIrQUO6pTXaEmWhGz+K"
    "ISOC5A=="
)

# 官方文档「签名算法示例」给出的四个入参
DOC_TOKEN = "31a4a1aa-cffc-4aca-9ef6-0497edf7fbed"
DOC_TIMESTAMP = "1646790230854428120"
DOC_NONCE = "Rzem0rlz19e6GZuZuFKyDzaxiS4baaqn8uvxVnntXKS"
DOC_SIGN_INPUT = "abcdefg"
# 按文档算法(sha1(sort(token,timestamp,nonce,dataEncrypt)))对上述入参算出的结果
DOC_SIGNATURE = "e644ea4239027df040beeb573bb83e1268477c94"


def test_decrypt_official_vector():
    """官方密文必须解出可解析的 JSON,且字段与官方样本逐一相符。"""
    plain = C.decrypt(DOC_AES_KEY, DOC_CIPHER)
    obj = json.loads(plain)
    assert obj["app_id"] == "12313"
    assert obj["org_id"] == "2131"
    assert obj["len"] == "249"
    assert len(obj["events"]) == 2
    assert obj["events"][0]["id"] == "1534385729680344039"
    assert obj["events"][0]["type"] == "account_message"
    assert obj["events"][0]["data"]["msg_text"] == "this is a test"
    assert obj["events"][0]["data"]["staff_id"] == "524288-aavcceee"


def test_verify_signature_official_vector():
    assert C.verify_signature(DOC_TOKEN, DOC_TIMESTAMP, DOC_NONCE,
                              DOC_SIGN_INPUT, DOC_SIGNATURE) is True


def test_verify_signature_is_case_insensitive_on_input():
    """蓝信侧大小写不保证;我方比较前统一小写。"""
    assert C.verify_signature(DOC_TOKEN, DOC_TIMESTAMP, DOC_NONCE,
                              DOC_SIGN_INPUT, DOC_SIGNATURE.upper()) is True


@pytest.mark.parametrize("bad", [
    "", "  ", "deadbeef", DOC_SIGNATURE[:-1] + "0",
])
def test_verify_signature_rejects_wrong(bad):
    assert C.verify_signature(DOC_TOKEN, DOC_TIMESTAMP, DOC_NONCE,
                              DOC_SIGN_INPUT, bad) is False


def test_verify_signature_rejects_tampered_payload():
    """报文被改动 → 签名必须不匹配。"""
    assert C.verify_signature(DOC_TOKEN, DOC_TIMESTAMP, DOC_NONCE,
                              DOC_SIGN_INPUT + "x", DOC_SIGNATURE) is False


@pytest.mark.parametrize("bad_cipher", [
    "",                    # 空
    "!!!not base64!!!",    # 非 base64
    "YWJj",                # base64 合法但长度不足一个块
])
def test_decrypt_raises_on_bad_cipher(bad_cipher):
    with pytest.raises(ValueError):
        C.decrypt(DOC_AES_KEY, bad_cipher)


def test_decrypt_raises_on_wrong_key():
    """错误密钥不得静默返回乱码 —— 必须抛错,交由上层落「未解析」。"""
    wrong = "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU"
    with pytest.raises(ValueError):
        C.decrypt(wrong, DOC_CIPHER)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_lanxin_crypto.py -q`
Expected: FAIL，`ModuleNotFoundError: No module named 'lanxin_crypto'`

- [ ] **Step 3: 实现 `lanxin_crypto.py`**

```python
# lanxin_crypto.py
"""蓝信回调报文的验签与解密。纯标准库,零依赖。

为什么自己实现 AES:本项目服务端仅用标准库,而标准库没有 AES。
回调是单向入站,【只需解密、不需加密】,故只实现 CBC 解密路径(约 100 行)。
引入 pycryptodome 会带来 C 扩展与 PyInstaller 打包风险,不值得。

正确性不靠自证:tests/test_lanxin_crypto.py 用蓝信官方文档给出的
测试向量(aesKey + 密文 + 签名入参)做断言,不是自造 fixture 自己验自己。
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
from typing import List

__all__ = ["verify_signature", "decrypt"]

_SBOX = bytes.fromhex(
    "637c777bf26b6fc53001672bfed7ab76ca82c97dfa5947f0add4a2af9ca472c0"
    "b7fd9326363ff7cc34a5e5f171d8311504c723c31896059a071280e2eb27b275"
    "09832c1a1b6e5aa0523bd6b329e32f8453d100ed20fcb15b6acbbe394a4c58cf"
    "d0efaafb434d338545f9027f503c9fa851a3408f929d38f5bcb6da2110fff3d2"
    "cd0c13ec5f974417c4a77e3d645d197360814fdc222a908846eeb814de5e0bdb"
    "e0323a0a4906245cc2d3ac629195e479e7c8376d8dd54ea96c56f4ea657aae08"
    "ba78252e1ca6b4c6e8dd741f4bbd8b8a703eb5664803f60e613557b986c11d9e"
    "e1f8981169d98e949b1e87e9ce5528df8ca1890dbfe6426841992d0fb054bb16"
)
_INV_SBOX = bytearray(256)
for _i, _v in enumerate(_SBOX):
    _INV_SBOX[_v] = _i
_RCON = (0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80,
         0x1B, 0x36, 0x6C, 0xD8, 0xAB, 0x4D)


def _xtime(a: int) -> int:
    a <<= 1
    return (a ^ 0x1B) & 0xFF if a & 0x100 else a


def _mul(a: int, b: int) -> int:
    """GF(2^8) 乘法。"""
    r = 0
    while b:
        if b & 1:
            r ^= a
        a = _xtime(a)
        b >>= 1
    return r


def _expand_key(key: bytes):
    """AES 密钥扩展。返回 (轮密钥字列表, 轮数)。"""
    nk = len(key) // 4
    nr = nk + 6
    w: List[List[int]] = [list(key[4 * i:4 * i + 4]) for i in range(nk)]
    for i in range(nk, 4 * (nr + 1)):
        t = list(w[i - 1])
        if i % nk == 0:
            t = t[1:] + t[:1]
            t = [_SBOX[b] for b in t]
            t[0] ^= _RCON[i // nk - 1]
        elif nk > 6 and i % nk == 4:
            t = [_SBOX[b] for b in t]
        w.append([w[i - nk][j] ^ t[j] for j in range(4)])
    return w, nr


def _decrypt_block(blk: bytes, w, nr: int) -> bytes:
    s = [list(blk[r::4]) for r in range(4)]

    def add_round_key(rnd: int) -> None:
        for c in range(4):
            for r in range(4):
                s[r][c] ^= w[rnd * 4 + c][r]

    add_round_key(nr)
    for rnd in range(nr - 1, -1, -1):
        for r in range(1, 4):                       # InvShiftRows
            s[r] = s[r][-r:] + s[r][:-r]
        for r in range(4):                          # InvSubBytes
            for c in range(4):
                s[r][c] = _INV_SBOX[s[r][c]]
        add_round_key(rnd)
        if rnd > 0:                                 # InvMixColumns
            for c in range(4):
                a0, a1, a2, a3 = (s[0][c], s[1][c], s[2][c], s[3][c])
                s[0][c] = _mul(a0, 14) ^ _mul(a1, 11) ^ _mul(a2, 13) ^ _mul(a3, 9)
                s[1][c] = _mul(a0, 9) ^ _mul(a1, 14) ^ _mul(a2, 11) ^ _mul(a3, 13)
                s[2][c] = _mul(a0, 13) ^ _mul(a1, 9) ^ _mul(a2, 14) ^ _mul(a3, 11)
                s[3][c] = _mul(a0, 11) ^ _mul(a1, 13) ^ _mul(a2, 9) ^ _mul(a3, 14)
    return bytes(s[r][c] for c in range(4) for r in range(4))


def verify_signature(sign_token: str, timestamp: str, nonce: str,
                     data_encrypt: str, signature: str) -> bool:
    """按蓝信算法验签:sha1(sort(token, timestamp, nonce, dataEncrypt))。

    用 hmac.compare_digest 做定长时间比较,避免按字节提前返回泄露信息。
    任一入参为 None 视作空串 —— 缺参必然验不过,不额外抛错。
    """
    parts = sorted([sign_token or "", timestamp or "", nonce or "", data_encrypt or ""])
    expect = hashlib.sha1("".join(parts).encode("utf-8")).hexdigest()
    return hmac.compare_digest(expect, (signature or "").strip().lower())


def decrypt(aes_key: str, data_encrypt: str) -> str:
    """AES-256-CBC 解密回调报文体。失败一律抛 ValueError,绝不返回乱码。

    密钥推导按蓝信文档:base64_decode(aesKey + "=") 得 32 字节,IV 取其前 16 字节。
    """
    try:
        key = base64.b64decode((aes_key or "") + "=")
    except (binascii.Error, ValueError) as e:
        raise ValueError("aesKey 不是合法 base64: %s" % e)
    if len(key) not in (16, 24, 32):
        raise ValueError("aesKey 解出 %d 字节,应为 16/24/32" % len(key))

    try:
        cipher = base64.b64decode(data_encrypt or "", validate=True)
    except (binascii.Error, ValueError) as e:
        raise ValueError("dataEncrypt 不是合法 base64: %s" % e)
    if not cipher or len(cipher) % 16 != 0:
        raise ValueError("密文长度 %d 不是 16 的整数倍" % len(cipher))

    w, nr = _expand_key(key)
    out = bytearray()
    prev = key[:16]
    for i in range(0, len(cipher), 16):
        blk = cipher[i:i + 16]
        dec = _decrypt_block(blk, w, nr)
        out.extend(x ^ y for x, y in zip(dec, prev))
        prev = blk

    pad = out[-1]
    if pad < 1 or pad > 16 or len(out) < pad:
        raise ValueError("PKCS7 填充非法(pad=%d)" % pad)
    if any(b != pad for b in out[-pad:]):
        raise ValueError("PKCS7 填充字节不一致")
    try:
        return bytes(out[:-pad]).decode("utf-8")
    except UnicodeDecodeError as e:
        raise ValueError("明文不是合法 UTF-8: %s" % e)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_lanxin_crypto.py -q`
Expected: PASS，13 passed

- [ ] **Step 5: 变异验证（必做）**

依次做以下三处改动，每处确认测试变红后**立即改回**：

1. 把 `decrypt` 里的 `prev = key[:16]` 改成 `prev = b"\x00" * 16`（IV 取错）
   Expected: `test_decrypt_official_vector` 红
2. 把 `verify_signature` 里的 `sorted([...])` 去掉排序，直接按 token/timestamp/nonce/data 顺序拼
   Expected: `test_verify_signature_official_vector` 红
3. 把 PKCS7 校验的 `raise ValueError` 改为 `return bytes(out).decode("utf-8", "ignore")`
   Expected: `test_decrypt_raises_on_wrong_key` 红

在任务报告中写明三处变异各自的红色输出。

- [ ] **Step 6: 提交**

```bash
git add lanxin_crypto.py tests/test_lanxin_crypto.py
git commit -m "feat(lanxin): 零依赖 AES-256-CBC 解密与 SHA1 验签(官方向量回归)"
```

---

### Task 2: `lanxin_inbox.py` —— 收件箱与发送台账存储

**Files:**
- Create: `lanxin_inbox.py`
- Test: `tests/test_lanxin_inbox.py`

**Interfaces:**
- Consumes: 无
- Produces:
  - `new_store() -> Dict[str, Any]`
  - `migrate(store: Any) -> Dict[str, Any]`
  - `record_sent(store, entries: List[Dict], now: str) -> None`
  - `is_seen(store, event_id: str) -> bool`
  - `mark_seen(store, event_id: str, now: str) -> None`
  - `add_item(store, item: Dict) -> Dict`
  - `resolve_identity(store, staff_id: str) -> Dict[str, Any]`（返回 `{"employId":..,"name":..}`，查不到为 `{"employId": None, "name": None}`）
  - `candidate_projects(store, staff_id: str, days: int = 30) -> List[str]`
  - `mark_handled(store, item_id: str, info: Dict) -> bool`
  - `prune(store, now: str) -> None`
  - 常量 `SEEN_RETENTION_DAYS = 7`、`SENT_RETENTION_DAYS = 90`、`STORE_VERSION = 1`

**注意：** 本模块**只做纯数据操作，不碰文件 IO**。文件读写由 `server.py` 用既有的 `_atomic_write_json` 与 `_followup_txn` 完成，与其他域一致。

- [ ] **Step 1: 写失败测试**

创建 `tests/test_lanxin_inbox.py`：

```python
"""lanxin_inbox 纯数据操作的回归。"""
import lanxin_inbox as I

NOW = "2026-07-20 10:00:00"


def _store_with_sent():
    s = I.new_store()
    I.record_sent(s, [
        {"staffId": "524288-aaa", "employId": "A000701", "name": "张三",
         "routeKey": "project", "projectIds": ["P001", "P002"], "msgId": "m1"},
        {"staffId": "524288-bbb", "employId": "A000702", "name": "李四",
         "routeKey": "timesheet", "projectIds": [], "msgId": "m2"},
    ], NOW)
    return s


def test_new_store_shape():
    s = I.new_store()
    assert s["version"] == I.STORE_VERSION
    assert s["sent"] == [] and s["items"] == [] and s["seenEventIds"] == []


def test_migrate_accepts_garbage():
    """读到损坏内容不得抛错 —— 返回全新 store,由调用方决定是否落盘。"""
    for bad in [None, [], "x", 42]:
        assert I.migrate(bad)["version"] == I.STORE_VERSION


def test_migrate_preserves_existing():
    s = _store_with_sent()
    assert len(I.migrate(s)["sent"]) == 2


def test_resolve_identity_from_sent_log():
    """回调只给 staffId,身份必须靠发送台账反查。"""
    s = _store_with_sent()
    assert I.resolve_identity(s, "524288-aaa") == {"employId": "A000701", "name": "张三"}


def test_resolve_identity_unknown_returns_nulls():
    """查不到不得编造,也不得抛错 —— 收件箱要如实显示「未知」。"""
    s = _store_with_sent()
    assert I.resolve_identity(s, "524288-zzz") == {"employId": None, "name": None}


def test_candidate_projects_from_recent_sends():
    s = _store_with_sent()
    assert I.candidate_projects(s, "524288-aaa", days=30) == ["P001", "P002"]


def test_candidate_projects_excludes_other_people():
    s = _store_with_sent()
    assert I.candidate_projects(s, "524288-bbb", days=30) == []


def test_candidate_projects_ignores_stale_sends():
    """超出窗口的推送不再作为归因候选。"""
    s = I.new_store()
    I.record_sent(s, [{"staffId": "524288-aaa", "employId": "A000701", "name": "张三",
                       "routeKey": "project", "projectIds": ["P009"], "msgId": "m9"}],
                  "2026-01-01 10:00:00")
    assert I.candidate_projects(s, "524288-aaa", days=30) == []


def test_seen_dedup():
    s = I.new_store()
    assert I.is_seen(s, "e1") is False
    I.mark_seen(s, "e1", NOW)
    assert I.is_seen(s, "e1") is True


def test_add_item_returns_stored_copy():
    s = I.new_store()
    it = I.add_item(s, {"id": "evt-1", "text": "hi"})
    assert s["items"][0]["id"] == "evt-1"
    assert it["id"] == "evt-1"


def test_add_item_puts_newest_first():
    """收件箱是给人读的,最新的必须在最前。"""
    s = I.new_store()
    I.add_item(s, {"id": "evt-1"})
    I.add_item(s, {"id": "evt-2"})
    assert [x["id"] for x in s["items"]] == ["evt-2", "evt-1"]


def test_mark_handled():
    s = I.new_store()
    I.add_item(s, {"id": "evt-1", "handled": False})
    assert I.mark_handled(s, "evt-1", {"domain": "risk", "projectId": "P001"}) is True
    assert s["items"][0]["handled"] is True
    assert s["items"][0]["handledInfo"]["domain"] == "risk"


def test_mark_handled_missing_id_returns_false():
    s = I.new_store()
    assert I.mark_handled(s, "nope", {"domain": "risk"}) is False


def test_prune_drops_stale_seen_and_sent_but_keeps_items():
    """items 永不自动删 —— 收件箱是人要读的,自动删会让人错过。"""
    s = I.new_store()
    I.mark_seen(s, "old", "2026-01-01 10:00:00")
    I.record_sent(s, [{"staffId": "x", "employId": "e", "name": "n",
                       "routeKey": "project", "projectIds": [], "msgId": "m"}],
                  "2026-01-01 10:00:00")
    I.add_item(s, {"id": "evt-old", "receivedAt": "2026-01-01 10:00:00"})
    I.prune(s, NOW)
    assert s["seenEventIds"] == []
    assert s["sent"] == []
    assert len(s["items"]) == 1
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_lanxin_inbox.py -q`
Expected: FAIL，`ModuleNotFoundError: No module named 'lanxin_inbox'`

- [ ] **Step 3: 实现 `lanxin_inbox.py`**

```python
# lanxin_inbox.py
"""蓝信收件箱与发送台账的纯数据操作。

为什么把「发送台账」和「收件箱」放同一个 store:它们是同一场对话的两端。
台账一物两用 ——
① 反查身份:回调只给 staffId,而发送时做过 employId → staffId 的 id_mapping,
   不留台账就只能拿一串 524288-xxx 给超管看;
② 归因候选:按 staffId 找最近推给他的卡片,取其中项目作归入下拉的默认值。
   注意这只是【推测】—— 蓝信回调不带任何原卡标识,referenceMsg 连 msgId 都没有。

本模块【不做文件 IO】。读写由 server.py 用既有的 _atomic_write_json /
_followup_txn 完成,与其它域保持一致。
"""
from __future__ import annotations

import copy
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

STORE_VERSION = 1
SEEN_RETENTION_DAYS = 7      # 蓝信最长重推间隔 6 小时,7 天绰绰有余
SENT_RETENTION_DAYS = 90

_TS_FMT = "%Y-%m-%d %H:%M:%S"


def new_store() -> Dict[str, Any]:
    return {"version": STORE_VERSION, "sent": [], "items": [], "seenEventIds": []}


def migrate(store: Any) -> Dict[str, Any]:
    """把任意读到的内容规整成合法 store。绝不抛错 —— 读到损坏内容时
    上层需要一个能用的默认值,而不是 500。"""
    if not isinstance(store, dict):
        return new_store()
    out = new_store()
    for key in ("sent", "items", "seenEventIds"):
        val = store.get(key)
        if isinstance(val, list):
            out[key] = copy.deepcopy(val)
    return out


def _parse(ts: Any) -> Optional[datetime]:
    try:
        return datetime.strptime(str(ts), _TS_FMT)
    except (TypeError, ValueError):
        return None


def record_sent(store: Dict[str, Any], entries: List[Dict[str, Any]], now: str) -> None:
    """记录一批推送。sentAt 统一由调用方传入的 now 盖章,便于测试与批次一致。"""
    for e in entries or []:
        store.setdefault("sent", []).append({
            "staffId": e.get("staffId") or "",
            "employId": e.get("employId") or "",
            "name": e.get("name") or "",
            "routeKey": e.get("routeKey") or "",
            "projectIds": list(e.get("projectIds") or []),
            "msgId": e.get("msgId") or "",
            "sentAt": now,
        })


def is_seen(store: Dict[str, Any], event_id: str) -> bool:
    return any(x.get("id") == event_id for x in store.get("seenEventIds") or [])


def mark_seen(store: Dict[str, Any], event_id: str, now: str) -> None:
    store.setdefault("seenEventIds", []).append({"id": event_id, "ts": now})


def add_item(store: Dict[str, Any], item: Dict[str, Any]) -> Dict[str, Any]:
    """最新的排最前 —— 收件箱是给人读的。"""
    rec = copy.deepcopy(item)
    store.setdefault("items", []).insert(0, rec)
    return rec


def resolve_identity(store: Dict[str, Any], staff_id: str) -> Dict[str, Any]:
    """按 staffId 反查工号与姓名。查不到返回 None,【绝不编造】——
    收件箱要如实显示「未知」,让超管知道这人不在我们推送过的名单里。"""
    for e in reversed(store.get("sent") or []):
        if e.get("staffId") == staff_id:
            return {"employId": e.get("employId") or None, "name": e.get("name") or None}
    return {"employId": None, "name": None}


def candidate_projects(store: Dict[str, Any], staff_id: str, days: int = 30) -> List[str]:
    """归因候选:窗口内推给此人的卡片涉及的项目,按首次出现顺序去重。
    这是【建议不是结论】,调用方须在 UI 上标明。"""
    cutoff = datetime.now() - timedelta(days=days)
    out: List[str] = []
    for e in store.get("sent") or []:
        if e.get("staffId") != staff_id:
            continue
        ts = _parse(e.get("sentAt"))
        if ts is None or ts < cutoff:
            continue
        for pid in e.get("projectIds") or []:
            if pid not in out:
                out.append(pid)
    return out


def mark_handled(store: Dict[str, Any], item_id: str, info: Dict[str, Any]) -> bool:
    for it in store.get("items") or []:
        if it.get("id") == item_id:
            it["handled"] = True
            it["handledInfo"] = copy.deepcopy(info)
            return True
    return False


def prune(store: Dict[str, Any], now: str) -> None:
    """滚动清理去重表与发送台账。【items 永不自动删】——
    收件箱是人要读的东西,自动删会让人错过。"""
    ref = _parse(now) or datetime.now()
    seen_cut = ref - timedelta(days=SEEN_RETENTION_DAYS)
    sent_cut = ref - timedelta(days=SENT_RETENTION_DAYS)
    store["seenEventIds"] = [x for x in store.get("seenEventIds") or []
                             if (_parse(x.get("ts")) or ref) >= seen_cut]
    store["sent"] = [x for x in store.get("sent") or []
                     if (_parse(x.get("sentAt")) or ref) >= sent_cut]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_lanxin_inbox.py -q`
Expected: PASS，15 passed

- [ ] **Step 5: 变异验证（必做）**

1. 把 `prune` 里 `store["items"]` 也加上时间过滤（删旧条目）
   Expected: `test_prune_drops_stale_seen_and_sent_but_keeps_items` 红
2. 把 `resolve_identity` 查不到时改成返回 `{"employId": staff_id, "name": staff_id}`
   Expected: `test_resolve_identity_unknown_returns_nulls` 红
3. 把 `add_item` 的 `insert(0, rec)` 改成 `append(rec)`
   Expected: `test_add_item_puts_newest_first` 红

- [ ] **Step 6: 提交**

```bash
git add lanxin_inbox.py tests/test_lanxin_inbox.py
git commit -m "feat(lanxin): 收件箱与发送台账存储(身份反查 + 归因候选 + 滚动清理)"
```

---

### Task 3: `lanxin_config.py` —— 回调凭证与发送身份

**Files:**
- Modify: `lanxin_config.py`（`default_config` / `public_config` / 凭证校验）
- Test: `tests/test_lanxin_config.py`（若不存在则新建；已存在则追加）

**Interfaces:**
- Consumes: 无
- Produces:
  - `default_config()` 的 `credentials` 增 `callbackAesKey` `callbackSignToken`；顶层增 `sendAs`
  - `public_config(cfg)` 额外抹掉两个回调密钥，透出 `hasCallbackAesKey` / `hasCallbackSignToken` 布尔
  - 常量 `SEND_AS_VALUES = ("account", "bot")`

- [ ] **Step 1: 写失败测试**

在 `tests/test_lanxin_config.py` 追加（若文件不存在，先建，顶部加 `import lanxin_config as LC`）：

```python
def test_default_config_has_callback_credentials_and_send_as():
    cfg = LC.default_config()
    assert cfg["credentials"]["callbackAesKey"] == ""
    assert cfg["credentials"]["callbackSignToken"] == ""
    # 默认走应用号:机器人能力要额外一道组织管理员审批,可能批不下来
    assert cfg["sendAs"] == "account"


def test_public_config_masks_callback_secrets(tmp_path):
    cfg = LC.default_config()
    cfg["credentials"]["callbackAesKey"] = "AAA"
    cfg["credentials"]["callbackSignToken"] = "BBB"
    pub = LC.public_config(cfg)
    assert pub["credentials"]["callbackAesKey"] == ""
    assert pub["credentials"]["callbackSignToken"] == ""
    assert pub["credentials"]["hasCallbackAesKey"] is True
    assert pub["credentials"]["hasCallbackSignToken"] is True


def test_public_config_reports_missing_callback_secrets():
    pub = LC.public_config(LC.default_config())
    assert pub["credentials"]["hasCallbackAesKey"] is False
    assert pub["credentials"]["hasCallbackSignToken"] is False


def test_save_config_rejects_bad_send_as(tmp_path):
    import pytest
    cfg = LC.default_config()
    cfg["sendAs"] = "robot"          # 合法值只有 account / bot
    with pytest.raises(ValueError):
        LC.save_config(str(tmp_path / "c.json"), cfg)


def test_save_config_accepts_bot(tmp_path):
    cfg = LC.default_config()
    cfg["sendAs"] = "bot"
    saved = LC.save_config(str(tmp_path / "c.json"), cfg)
    assert saved["sendAs"] == "bot"


def test_save_config_empty_callback_secret_keeps_old(tmp_path):
    """与 appSecret 同规:传空串=不修改,避免脱敏读回后误清空。"""
    p = str(tmp_path / "c.json")
    cfg = LC.default_config()
    cfg["credentials"]["callbackAesKey"] = "KEEPME"
    LC.save_config(p, cfg)
    cfg2 = LC.load_config(p)
    cfg2["credentials"]["callbackAesKey"] = ""
    saved = LC.save_config(p, cfg2)
    assert saved["credentials"]["callbackAesKey"] == "KEEPME"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_lanxin_config.py -q`
Expected: FAIL，`KeyError: 'callbackAesKey'`

- [ ] **Step 3: 改 `lanxin_config.py`**

在模块顶部常量区加：

```python
# 发送身份。account=应用号(回调事件 account_message);bot=智能机器人
# (回调事件 bot_private_message / bot_group_message,须组织管理员额外开通机器人能力)。
# 默认 account:机器人能力是第二道审批,可能批不下来,应用号是安全落点。
SEND_AS_VALUES = ("account", "bot")
```

`default_config()` 的 `credentials` 字典改为：

```python
        "credentials": {
            "appId": "", "appSecret": "", "orgId": "",
            "apiGateway": "", "idType": "employ_id",
            # 回调密钥与回调签名令牌,取自开发者中心「回调事件」页 ——
            # 与 AppId/AppSecret 是【另外两个】凭证,不要混。
            "callbackAesKey": "", "callbackSignToken": "",
        },
```

并在 `default_config()` 返回的字典里，`"sendIntervalMs"` 之后加一行：

```python
        "sendAs": "account",
```

`public_config()` 改为：

```python
def public_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """下发给前端的脱敏配置:三个密钥一律抹成空串,只透出 has* 布尔。
    绝不回显明文 —— 前端拿不到,就不会被日志/截图/导出带出去。"""
    out = json.loads(json.dumps(cfg, ensure_ascii=False))
    cred = out.setdefault("credentials", {})
    for field, flag in (("appSecret", "hasSecret"),
                        ("callbackAesKey", "hasCallbackAesKey"),
                        ("callbackSignToken", "hasCallbackSignToken")):
        cred[flag] = bool(cred.get(field, ""))
        cred[field] = ""
    return out
```

在 `save_config` 中，凡对 `appSecret` 做「空串=沿用旧值」处理的地方，对
`callbackAesKey` 与 `callbackSignToken` 做同样处理（三者共用一个循环，不要复制三遍）；
并加入 `sendAs` 校验：

```python
    send_as = raw.get("sendAs", "account")
    if send_as not in SEND_AS_VALUES:
        raise ValueError("sendAs 须为 %s 之一" % "/".join(SEND_AS_VALUES))
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_lanxin_config.py -q`
Expected: PASS

- [ ] **Step 5: 变异验证（必做）**

1. 把 `public_config` 里 `cred[field] = ""` 那行删掉（密钥明文下发）
   Expected: `test_public_config_masks_callback_secrets` 红
2. 把 `sendAs` 校验的 `raise ValueError` 改成 `send_as = "account"`（静默纠正）
   Expected: `test_save_config_rejects_bad_send_as` 红

- [ ] **Step 6: 提交**

```bash
git add lanxin_config.py tests/test_lanxin_config.py
git commit -m "feat(lanxin): 配置增回调双凭证与发送身份(三密钥统一脱敏)"
```

---

### Task 4: 发送侧双身份 + 卡片回复引导语

**Files:**
- Modify: `lanxin.py`（抽 `_send`、新增 `send_bot_message`、`dispatch` 回传台账）
- Modify: `lanxin_recipients.py`（卡片底部引导语）
- Test: `tests/test_lanxin.py`（追加）

**Interfaces:**
- Consumes: `lanxin_config.SEND_AS_VALUES`（Task 3；本任务只读取 `cfg["sendAs"]` 字符串，不 import 该常量，故可与 Task 3 并行）
- Produces:
  - `send_message(cfg, token, staff_ids, msg_data) -> Dict`（路径 `/v1/messages/create`，签名不变）
  - `send_bot_message(cfg, token, staff_ids, msg_data) -> Dict`（路径 `/v1/bot/messages/create`）
  - `dispatch(plan, cfg)` 返回值增加 `"sentLog": List[Dict]`，每项形如
    `{"staffId":..,"employId":..,"name":..,"routeKey":..,"projectIds":[..],"msgId":..}`
  - `lanxin_recipients.REPLY_HINT = "如有说明，请直接回复本消息"`

- [ ] **Step 1: 写失败测试**

在 `tests/test_lanxin.py` 追加：

```python
def test_send_bot_message_hits_bot_path(monkeypatch):
    """机器人与应用号只差一个 path,必须各自打到正确 URL。"""
    seen = {}

    def fake_http(url, data=None, headers=None, timeout=None):
        seen["url"] = url
        return {"errCode": 0, "errMsg": "ok", "data": {}}

    monkeypatch.setattr(lanxin, "_http", fake_http)
    cfg = {"credentials": {"apiGateway": "https://gw.example"}}
    lanxin.send_bot_message(cfg, "tk", ["s1"], {"appCard": {}})
    assert "/v1/bot/messages/create" in seen["url"]


def test_send_message_still_hits_account_path(monkeypatch):
    seen = {}

    def fake_http(url, data=None, headers=None, timeout=None):
        seen["url"] = url
        return {"errCode": 0, "errMsg": "ok", "data": {}}

    monkeypatch.setattr(lanxin, "_http", fake_http)
    cfg = {"credentials": {"apiGateway": "https://gw.example"}}
    lanxin.send_message(cfg, "tk", ["s1"], {"appCard": {}})
    assert "/v1/messages/create" in seen["url"]
    assert "/v1/bot/" not in seen["url"]


def test_dispatch_uses_bot_when_send_as_bot(monkeypatch):
    calls = []
    monkeypatch.setattr(lanxin, "get_app_token", lambda cfg: "tk")
    monkeypatch.setattr(lanxin, "id_mapping", lambda cfg, tk, emp: "sid-" + emp)
    monkeypatch.setattr(lanxin, "send_message",
                        lambda *a, **k: calls.append("account") or {"msgId": "m"})
    monkeypatch.setattr(lanxin, "send_bot_message",
                        lambda *a, **k: calls.append("bot") or {"msgId": "m"})
    plan = {"recipients": [{"employId": "A1", "name": "张三", "card": {},
                            "projectIds": ["P1"], "routeKey": "project"}]}
    lanxin.dispatch(plan, {"sendAs": "bot", "sendIntervalMs": 0})
    assert calls == ["bot"]


def test_dispatch_defaults_to_account(monkeypatch):
    calls = []
    monkeypatch.setattr(lanxin, "get_app_token", lambda cfg: "tk")
    monkeypatch.setattr(lanxin, "id_mapping", lambda cfg, tk, emp: "sid-" + emp)
    monkeypatch.setattr(lanxin, "send_message",
                        lambda *a, **k: calls.append("account") or {"msgId": "m"})
    monkeypatch.setattr(lanxin, "send_bot_message",
                        lambda *a, **k: calls.append("bot") or {"msgId": "m"})
    plan = {"recipients": [{"employId": "A1", "name": "张三", "card": {},
                            "projectIds": [], "routeKey": "timesheet"}]}
    lanxin.dispatch(plan, {"sendIntervalMs": 0})          # 未配 sendAs
    assert calls == ["account"]


def test_dispatch_returns_sent_log_for_identity_lookup(monkeypatch):
    """台账是回调反查身份的唯一依据 —— 必须带回 staffId↔employId。"""
    monkeypatch.setattr(lanxin, "get_app_token", lambda cfg: "tk")
    monkeypatch.setattr(lanxin, "id_mapping", lambda cfg, tk, emp: "sid-" + emp)
    monkeypatch.setattr(lanxin, "send_message", lambda *a, **k: {"msgId": "m1"})
    plan = {"recipients": [{"employId": "A1", "name": "张三", "card": {},
                            "projectIds": ["P1", "P2"], "routeKey": "project"}]}
    out = lanxin.dispatch(plan, {"sendIntervalMs": 0})
    assert out["sentLog"] == [{"staffId": "sid-A1", "employId": "A1", "name": "张三",
                               "routeKey": "project", "projectIds": ["P1", "P2"],
                               "msgId": "m1"}]


def test_dispatch_sent_log_omits_failed(monkeypatch):
    """发失败的人不进台账 —— 否则会拿他当「推送过」去反查身份和推荐项目。"""
    monkeypatch.setattr(lanxin, "get_app_token", lambda cfg: "tk")
    monkeypatch.setattr(lanxin, "id_mapping", lambda cfg, tk, emp: "sid-" + emp)

    def boom(*a, **k):
        raise lanxin.LanxinError(10005, "无权限")

    monkeypatch.setattr(lanxin, "send_message", boom)
    plan = {"recipients": [{"employId": "A1", "name": "张三", "card": {},
                            "projectIds": ["P1"], "routeKey": "project"}]}
    out = lanxin.dispatch(plan, {"sendIntervalMs": 0})
    assert out["sentLog"] == []
    assert len(out["failed"]) == 1
```

在 `tests/test_lanxin.py` 追加引导语测试（顶部需 `import lanxin_recipients as LR`）：

```python
def test_card_has_reply_hint_when_callback_configured():
    card = LR.build_timesheet_card("张三", [{"label": "缺少工作概述", "count": 2}],
                                   reply_hint=True)
    assert LR.REPLY_HINT in json.dumps(card, ensure_ascii=False)


def test_card_omits_reply_hint_when_callback_not_configured():
    """回调没配就不许写「请直接回复」—— 那是让人对着收不到的地方说话。"""
    card = LR.build_timesheet_card("张三", [{"label": "缺少工作概述", "count": 2}],
                                   reply_hint=False)
    assert LR.REPLY_HINT not in json.dumps(card, ensure_ascii=False)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_lanxin.py -q`
Expected: FAIL，`AttributeError: module 'lanxin' has no attribute 'send_bot_message'`

- [ ] **Step 3: 改 `lanxin.py`**

把现有 `send_message`（`lanxin.py:107-132`）改为共用实现 + 两个薄封装：

```python
ACCOUNT_MESSAGE_PATH = "/v1/messages/create"        # 应用号:回调事件 account_message
BOT_MESSAGE_PATH = "/v1/bot/messages/create"        # 智能机器人:回调 bot_private_message


def _send(cfg: Dict[str, Any], token: str, staff_ids: List[str],
          msg_data: Dict[str, Any], path: str) -> Dict[str, Any]:
    """两种发送身份的共用实现。msgType 由 msg_data 的唯一键推断(text/appCard/...)。
    56008 限流 → 退避重试;其余错误(如 10005 无权限)立即失败,重试无用。
    两个接口的请求体、收件上限、错误码完全一致,唯一差异是 path。"""
    if len(staff_ids) > MAX_RECIPIENTS:
        raise ValueError("userIdList 最多 %d 个,当前 %d" % (MAX_RECIPIENTS, len(staff_ids)))
    keys = list(msg_data.keys())
    if len(keys) != 1:
        raise ValueError("msgData 必须且只能含一个消息体键")
    body = json.dumps({"userIdList": list(staff_ids), "msgType": keys[0], "msgData": msg_data},
                      ensure_ascii=False).encode("utf-8")
    url = "%s%s?%s" % (_gateway(cfg), path,
                       urllib.parse.urlencode({"app_token": token}))
    headers = {"Content-Type": "application/json"}

    last: Optional[LanxinError] = None
    for attempt in range(len(RETRY_BACKOFF) + 1):
        try:
            return _unwrap(_http(url, data=body, headers=headers))
        except LanxinError as e:
            if e.err_code != RATE_LIMIT_CODE:
                raise
            last = e
            if attempt < len(RETRY_BACKOFF):
                time.sleep(RETRY_BACKOFF[attempt])
    raise last            # type: ignore[misc]


def send_message(cfg, token, staff_ids, msg_data):
    """以【应用号】身份发送。"""
    return _send(cfg, token, staff_ids, msg_data, ACCOUNT_MESSAGE_PATH)


def send_bot_message(cfg, token, staff_ids, msg_data):
    """以【智能机器人】身份发送。须组织管理员已开通机器人能力。"""
    return _send(cfg, token, staff_ids, msg_data, BOT_MESSAGE_PATH)
```

`dispatch`（`lanxin.py:363`）改动三处：

1. 函数开头加身份选择与台账容器：

```python
    sender = send_bot_message if cfg.get("sendAs") == "bot" else send_message
    sent_log: List[Dict[str, Any]] = []
```

2. 循环内把 `data = send_message(cfg, token, [sid], {"appCard": r["card"]})`
   改为 `data = sender(cfg, token, [sid], {"appCard": r["card"]})`；
   在 `sent += 1` 之后追加台账（**只记成功的**）：

```python
            sent_log.append({
                "staffId": sid,
                "employId": emp,
                "name": r["name"],
                "routeKey": r.get("routeKey") or "",
                "projectIds": list(r.get("projectIds") or []),
                "msgId": data.get("msgId") or "",
            })
```

3. 返回值加 `"sentLog": sent_log`：

```python
    return {"sent": sent, "failed": failed, "msgIds": msg_ids, "sentLog": sent_log}
```

同时把 `dispatch` docstring 里「单线程 HTTPServer」改为「串行发送以控速」——
该服务早已是 `ThreadingHTTPServer`（见 Task 9）。

**注意：** `build_plan` 产出的 `recipients` 项须带 `routeKey` 与 `projectIds`。
若现有 `build_plan` 未产出这两个键，在本任务中补上（`projectIds` 取该收件人卡片涉及的项目号列表，
`routeKey` 取该行来源路由的 key），并补一条断言其存在的测试。

- [ ] **Step 4: 改 `lanxin_recipients.py` 加引导语**

在常量区加：

```python
# 卡片底部引导语。仅在【回调凭证已配置】时附加 —— 回调没配就写「请直接回复」,
# 是让人对着收不到的地方说话。两种发送身份都能收回复(应用号走 account_message,
# 机器人走 bot_private_message),故不按身份区分。
REPLY_HINT = "如有说明，请直接回复本消息"
```

三个卡片构造函数 `build_project_card` / `build_summary_card` / `build_timesheet_card`
各增一个末位关键字参数 `reply_hint: bool = False`；为 True 时把 `REPLY_HINT`
追加到 `bodyContent` 末尾（用换行分隔），**并且仍走既有的 `fit_bytes(..., LIMIT_BODY_CONTENT)`
截断**（引导语不得让正文突破字节上限）。

- [ ] **Step 5: 跑测试确认通过**

Run: `python -m pytest tests/test_lanxin.py -q`
Expected: PASS

- [ ] **Step 6: 变异验证（必做）**

1. 把 `send_bot_message` 的 path 改成 `ACCOUNT_MESSAGE_PATH`
   Expected: `test_send_bot_message_hits_bot_path` 红
2. 把 `dispatch` 的台账 `append` 移到 `except` 分支之外（失败也记）
   Expected: `test_dispatch_sent_log_omits_failed` 红
3. 把引导语改成无条件追加（忽略 `reply_hint`）
   Expected: `test_card_omits_reply_hint_when_callback_not_configured` 红

- [ ] **Step 7: 提交**

```bash
git add lanxin.py lanxin_recipients.py tests/test_lanxin.py
git commit -m "feat(lanxin): 发送侧支持应用号/机器人双身份 + 发送台账 + 回复引导语"
```

---

### Task 5: `lanxin_callback.py` —— 回调编排

**Files:**
- Create: `lanxin_callback.py`
- Test: `tests/test_lanxin_callback.py`

**Interfaces:**
- Consumes:
  - `lanxin_crypto.verify_signature(sign_token, timestamp, nonce, data_encrypt, signature) -> bool`（Task 1）
  - `lanxin_crypto.decrypt(aes_key, data_encrypt) -> str`（Task 1，失败抛 `ValueError`）
  - `lanxin_inbox.is_seen / mark_seen / add_item / resolve_identity`（Task 2）
- Produces:
  - `parse_envelope(plain: str) -> Dict[str, Any]`（返回 `{"appId","orgId","events":[...]}`，失败抛 `ValueError`）
  - `event_to_item(event: Dict, store: Dict, received_at: str) -> Dict`
  - `EVENT_TYPES = ("account_message", "bot_private_message", "bot_group_message")`

**关键：** 本模块**不做文件 IO、不做存证**。存证与 HTTP 响应由 `server.py`（Task 6）负责。
本模块只负责「密文与 store → 收件箱条目」的纯转换，因而完全可单测。

- [ ] **Step 1: 写失败测试**

创建 `tests/test_lanxin_callback.py`：

```python
"""回调解析的回归。

重点在【两套键名都认】:蓝信文档的字段表(eventType/appId/orgId/length)
与真实密文解出的明文(type/app_id/org_id/len)对不上,文档自身前后也矛盾。
照任何单一写法写解析器都会失败,故两套都要有用例。
"""
import json

import pytest

import lanxin_callback as CB
import lanxin_inbox as I

NOW = "2026-07-20 10:00:00"


def _store():
    s = I.new_store()
    I.record_sent(s, [{"staffId": "524288-aaa", "employId": "A000701", "name": "张三",
                       "routeKey": "project", "projectIds": ["P001"], "msgId": "m1"}], NOW)
    return s


def test_parse_envelope_snake_case():
    """真实密文解出来是蛇形键 —— 这是实测形态,必须支持。"""
    plain = json.dumps({"random": "r", "len": "9", "app_id": "A", "org_id": "O",
                        "events": [{"id": "e1", "type": "account_message", "data": {}}]})
    env = CB.parse_envelope(plain)
    assert env["appId"] == "A" and env["orgId"] == "O"
    assert env["events"][0]["id"] == "e1"


def test_parse_envelope_camel_case():
    """文档字段表写的是驼峰 —— 也必须支持,不赌哪一套是真的。"""
    plain = json.dumps({"random": "r", "length": 9, "appId": "A", "orgId": "O",
                        "events": [{"id": "e1", "eventType": "account_message", "data": {}}]})
    env = CB.parse_envelope(plain)
    assert env["appId"] == "A" and env["orgId"] == "O"
    assert env["events"][0]["id"] == "e1"


def test_parse_envelope_normalizes_event_type_key():
    """无论来源用 type 还是 eventType,出口统一成 type。"""
    for key in ("type", "eventType"):
        plain = json.dumps({"events": [{"id": "e1", key: "bot_private_message", "data": {}}]})
        assert CB.parse_envelope(plain)["events"][0]["type"] == "bot_private_message"


@pytest.mark.parametrize("bad", ["", "not json", "[]", '"x"', "123"])
def test_parse_envelope_raises_on_garbage(bad):
    with pytest.raises(ValueError):
        CB.parse_envelope(bad)


def test_parse_envelope_raises_when_events_not_list():
    with pytest.raises(ValueError):
        CB.parse_envelope(json.dumps({"events": "nope"}))


def test_event_to_item_extracts_text_msgdata_shape():
    ev = {"id": "e1", "type": "bot_private_message",
          "data": {"from": "524288-aaa", "msgType": "text",
                   "msgData": {"text": {"content": "已处理完毕"}}}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["status"] == "parsed"
    assert it["text"] == "已处理完毕"
    assert it["staffId"] == "524288-aaa"
    assert it["employId"] == "A000701" and it["name"] == "张三"
    assert it["id"] == "evt-e1"
    assert it["handled"] is False


def test_event_to_item_extracts_snake_case_shape():
    """官方样本里 account_message 的 data 是 {staff_id, msg_text}。"""
    ev = {"id": "e2", "type": "account_message",
          "data": {"staff_id": "524288-aaa", "msg_text": "this is a test"}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["status"] == "parsed"
    assert it["text"] == "this is a test"
    assert it["staffId"] == "524288-aaa"


def test_event_to_item_unknown_staff_keeps_nulls():
    ev = {"id": "e3", "type": "bot_private_message",
          "data": {"from": "524288-zzz", "msgType": "text",
                   "msgData": {"text": {"content": "hi"}}}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["employId"] is None and it["name"] is None
    assert it["staffId"] == "524288-zzz"


def test_event_to_item_non_text_keeps_raw_and_marks_unparsed():
    """非文本消息(图片/文件)不得静默丢弃 —— 落未解析并保留原始 data。"""
    ev = {"id": "e4", "type": "bot_private_message",
          "data": {"from": "524288-aaa", "msgType": "image", "msgData": {"image": {"id": "x"}}}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["status"] == "unparsed"
    assert it["rawMsgData"] == {"image": {"id": "x"}}
    assert it["msgType"] == "image"


def test_event_to_item_group_message_keeps_group_id():
    ev = {"id": "e5", "type": "bot_group_message",
          "data": {"from": "524288-aaa", "msgType": "text", "groupId": "g1",
                   "groupName": "交付三部", "msgData": {"text": {"content": "收到"}}}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["groupId"] == "g1" and it["groupName"] == "交付三部"


def test_event_to_item_unknown_event_type_marked_unparsed():
    """订阅了别的事件也不能崩 —— 落未解析,让超管看得见。"""
    ev = {"id": "e6", "type": "staff_modify", "data": {"staffId": "x"}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["status"] == "unparsed"
    assert it["eventType"] == "staff_modify"


def test_event_without_id_still_produces_item():
    """没有 id 就无法去重,但绝不能丢 —— 用接收时间兜底成条目 id。"""
    ev = {"type": "bot_private_message",
          "data": {"from": "524288-aaa", "msgType": "text",
                   "msgData": {"text": {"content": "hi"}}}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["id"]
    assert it["id"].startswith("raw-")
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_lanxin_callback.py -q`
Expected: FAIL，`ModuleNotFoundError: No module named 'lanxin_callback'`

- [ ] **Step 3: 实现 `lanxin_callback.py`**

```python
# lanxin_callback.py
"""蓝信回调报文 → 收件箱条目 的纯转换。

为什么两套键名都认:蓝信文档的字段表写 eventType/appId/orgId/length,
文档自己的 JSON 示例写 type/orgId/appId/len,而【真实密文解出来】是
type/app_id/org_id/len。三者互不一致 —— 赌任何一套都是错的。

本模块不做文件 IO、不做存证、不发 HTTP 响应,只做纯转换,因而完全可单测。
存证与响应由 server.py 负责(见 spec §5)。
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import lanxin_inbox

EVENT_TYPES = ("account_message", "bot_private_message", "bot_group_message")

_MAX_TEXT = 20000        # 单条回复的存储上限,防止异常长文本撑爆 store


def _pick(d: Dict[str, Any], *names: str) -> Any:
    """按顺序取第一个存在的键。用于吸收文档与实现的键名分歧。"""
    for n in names:
        if n in d:
            return d[n]
    return None


def parse_envelope(plain: str) -> Dict[str, Any]:
    """解析解密后的明文信封。失败抛 ValueError,由上层落「未解析」。"""
    try:
        obj = json.loads(plain)
    except (TypeError, ValueError) as e:
        raise ValueError("信封不是合法 JSON: %s" % e)
    if not isinstance(obj, dict):
        raise ValueError("信封顶层不是对象")
    events = obj.get("events")
    if not isinstance(events, list):
        raise ValueError("events 缺失或不是数组")

    norm: List[Dict[str, Any]] = []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        norm.append({
            "id": ev.get("id") or "",
            "type": _pick(ev, "type", "eventType") or "",
            "data": ev.get("data") if isinstance(ev.get("data"), dict) else {},
        })
    return {
        "appId": _pick(obj, "app_id", "appId") or "",
        "orgId": _pick(obj, "org_id", "orgId") or "",
        "events": norm,
    }


def _extract_text(data: Dict[str, Any]) -> Optional[str]:
    """取回复正文。两种已知形态:
      ① {"msgData": {"text": {"content": "..."}}}   —— 事件列表文档
      ② {"msg_text": "..."}                          —— 官方密文样本
    取不到返回 None,由调用方落「未解析」。"""
    flat = _pick(data, "msg_text", "msgText")
    if isinstance(flat, str) and flat:
        return flat
    msg_data = data.get("msgData")
    if isinstance(msg_data, dict):
        text = msg_data.get("text")
        if isinstance(text, dict):
            content = text.get("content")
            if isinstance(content, str) and content:
                return content
    return None


def event_to_item(event: Dict[str, Any], store: Dict[str, Any],
                  received_at: str) -> Dict[str, Any]:
    """把一个规整后的事件转成收件箱条目。

    【绝不抛错、绝不丢弃】—— 看不懂的一律落 status="unparsed" 并保留原始 data,
    让超管在收件箱里看得见(仓库既有约定:不静默丢弃)。
    """
    ev_id = event.get("id") or ""
    ev_type = event.get("type") or ""
    data = event.get("data") if isinstance(event.get("data"), dict) else {}

    staff_id = _pick(data, "from", "staff_id", "staffId") or ""
    ident = lanxin_inbox.resolve_identity(store, staff_id)
    msg_type = _pick(data, "msgType", "msg_type") or ""
    text = _extract_text(data)

    unparsed_reason = None
    if ev_type not in EVENT_TYPES:
        unparsed_reason = "未订阅或未知的事件类型"
    elif text is None:
        unparsed_reason = "非文本消息或正文字段缺失"

    return {
        # 无 id 的事件无法去重,但绝不能丢 —— 用接收时间兜底
        "id": ("evt-%s" % ev_id) if ev_id else ("raw-%s" % received_at),
        "receivedAt": received_at,
        "status": "unparsed" if unparsed_reason else "parsed",
        "unparsedReason": unparsed_reason,
        "eventType": ev_type,
        "staffId": staff_id,
        "employId": ident["employId"],
        "name": ident["name"],
        "msgType": msg_type,
        "text": (text or "")[:_MAX_TEXT],
        "rawMsgData": data.get("msgData") if isinstance(data.get("msgData"), dict) else {},
        "groupId": _pick(data, "groupId", "group_id"),
        "groupName": _pick(data, "groupName", "group_name"),
        "handled": False,
        "handledInfo": None,
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_lanxin_callback.py -q`
Expected: PASS，17 passed

- [ ] **Step 5: 变异验证（必做）**

1. 把 `_pick(obj, "app_id", "appId")` 改成 `obj.get("appId")`
   Expected: `test_parse_envelope_snake_case` 红
2. 把 `_pick(ev, "type", "eventType")` 改成 `ev.get("type")`
   Expected: `test_parse_envelope_camel_case` 红
3. 把 `event_to_item` 里非文本消息的处理改成 `return None`（静默丢弃）
   Expected: `test_event_to_item_non_text_keeps_raw_and_marks_unparsed` 红

- [ ] **Step 6: 提交**

```bash
git add lanxin_callback.py tests/test_lanxin_callback.py
git commit -m "feat(lanxin): 回调报文解析(两套键名兼容 + 看不懂的一律落未解析)"
```

---

### Task 6: `server.py` —— 入站端点与收件箱 API

**Files:**
- Modify: `server.py`
  - `_AUTH_EXEMPT`（`server.py:188`）
  - 常量区（新增文件路径与锁，参照 `server.py:338-342` 蓝信段落）
  - `do_POST` 路由分派（参照 `server.py:1021-1028`）
  - handler 方法（追加到 `server.py:2843` 起的蓝信段落之后）
  - `audit.py` 的 `_ACTION_MAP`（`audit.py:29`）
- Test: `tests/test_server_lanxin_callback.py`（新建）

**Interfaces:**
- Consumes: Task 1 / 2 / 3 / 5 的全部导出
- Produces:
  - `POST /api/lanxin/callback` —— **免登录**，返回 `{"errCode":0|-1|-2|-3|-4,"errMsg":...}`
  - `GET  /api/lanxin/inbox` —— 超管，返回 `{items, rejectedCount, receivedCount}`
  - `POST /api/lanxin/inbox/handle` —— 超管，`{itemId, domain, projectId, instanceId?}`
  - `POST /api/lanxin/inbox/delete` —— 超管，`{itemId}`

**本任务独占 `server.py`，不可与其他任务并行。**

- [ ] **Step 1: 写失败测试**

创建 `tests/test_server_lanxin_callback.py`。测试**纯函数层**，不起真实 HTTP 服务
（参照 `tests/test_server_audit.py` 的既有做法）：

```python
"""回调端点的纯函数层回归 —— 重点是三条承重设计。"""
import html

import pytest

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


def test_callback_audit_actions_registered():
    """审计埋点靠 _ACTION_MAP 查表,漏登记就是死埋点(V3.3.0 教训)。"""
    import audit
    assert audit.action_for('POST', '/api/lanxin/inbox/handle') is not None
    assert audit.action_for('POST', '/api/lanxin/inbox/delete') is not None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_lanxin_callback.py -q`
Expected: FAIL，`AttributeError: module 'server' has no attribute '_lanxin_append_reply'`

- [ ] **Step 3: 在 `server.py` 蓝信常量段落（`server.py:338-342` 附近）追加**

```python
LANXIN_INBOX_FILE = os.path.join(BASE_DIR, 'data', 'lanxin_inbox.json')
LANXIN_RAW_FILE = os.path.join(BASE_DIR, 'data', 'lanxin_callback_raw.jsonl')
_lanxin_inbox_lock = threading.RLock()
# 回调报文体上限。蓝信一次最多推若干事件,1 MiB 远超实际需要,
# 但足以挡住「免登录端点被灌爆磁盘」。
LANXIN_CALLBACK_MAX_BYTES = 1024 * 1024
# 验签未通过的请求只记数与时间,【绝不落 body】—— 否则免登录端点等于任人写盘。
_lanxin_rejected = {"count": 0, "lastAt": "", "lastFrom": ""}

# 归入目标域。四域的首个进展字段【已核实,不得臆测】:
#   risk / payment_key → followAction     temp / progress → weekProgress
# progress 域是唯一例外:它不走 followup_store,store 逻辑内联在本文件。
_LANXIN_HANDLE_TARGETS = {
    'risk':        {'field': 'followAction', 'label': '风险跟进'},
    'payment_key': {'field': 'followAction', 'label': '回款重点跟进'},
    'temp':        {'field': 'weekProgress', 'label': '临时重点跟进'},
    'progress':    {'field': 'weekProgress', 'label': '重点项目进展'},
}
```

`_AUTH_EXEMPT`（`server.py:188`）改为：

```python
# /api/lanxin/callback 免登录:蓝信服务端不会带我们的会话 cookie。
# 它的安全边界是【SHA1 验签】而非会话 —— 见 handle_lanxin_callback。
_AUTH_EXEMPT = ('/api/login', '/api/logout', '/api/auth/me', '/api/lanxin/callback')
```

`_SUPER_ONLY_PATHS`（`server.py:202`）加入三个收件箱路径（**不要加 callback**）：

```python
    '/api/lanxin/inbox', '/api/lanxin/inbox/handle', '/api/lanxin/inbox/delete',
```

- [ ] **Step 4: 加入库读写与拼接辅助函数**

```python
def _load_lanxin_inbox():
    """读收件箱。文件不存在或损坏 → 返回全新 store(不落盘)。"""
    if os.path.exists(LANXIN_INBOX_FILE):
        try:
            with open(LANXIN_INBOX_FILE, 'r', encoding='utf-8') as f:
                return lanxin_inbox.migrate(json.load(f))
        except (OSError, ValueError) as e:
            logger.error("读取蓝信收件箱失败,本次按内存默认值处理、不写盘: %s", e)
    return lanxin_inbox.new_store()


def _save_lanxin_inbox(store):
    _atomic_write_json(LANXIN_INBOX_FILE, store)


def _lanxin_append_reply(existing, name, received_at, text):
    """把蓝信回复【追加】到既有跟进内容之后。

    两条铁律:
    ① 追加不覆盖 —— followup_store.apply_update 是 rec[field] = content(直接赋值),
       原样调用会抹掉该项目已有的跟进内容。
    ② 全量转义 —— 回复是员工任意输入,而跟进字段是富文本(V2.8.2 就地富文本编辑),
       不转义即存储型 XSS,攻击面是「任何能给机器人发消息的员工」。
    换行只用 <br>:前端 richText 白名单是 B/STRONG/U/I/EM/S/STRIKE/DEL/BR/SPAN/FONT,
    <p> 不在其中,用了会被读端拆解。
    """
    safe_name = html.escape(str(name or '未知'))
    safe_time = html.escape(str(received_at or ''))
    safe_text = html.escape(str(text or '')).replace('\n', '<br>')
    block = '[蓝信回复 %s %s]<br>%s' % (safe_name, safe_time, safe_text)
    old = str(existing or '').strip()
    return (old + '<br><br>' + block) if old else block
```

在 `server.py` 顶部 import 区加 `import html`、`import lanxin_callback`、`import lanxin_crypto`、`import lanxin_inbox`。

- [ ] **Step 5: 实现回调 handler**

```python
    def handle_lanxin_callback(self):
        """POST /api/lanxin/callback —— 蓝信订阅事件推送入口。【免登录】。

        闸门顺序即设计,不可调换(见 spec §5):
          ① 大小上限 → ② 验签 → ③ 存证 → ④ 解密 → ⑤ 解析 → ⑥ 去重 → ⑦ 落库

        为什么验签必须先于存证:这是全站唯一的免登录写入口。先无条件落盘,
        同网段任何人都能 POST 垃圾把磁盘灌满。

        为什么解密/解析失败仍返回 errCode 0:③ 一旦落盘,重推毫无意义 ——
        内容一模一样,我们会以同样方式再失败三次,白白烧掉蓝信的 3 次重试额度。
        「成功」定义为「我已持久化」而非「我已理解」。唯一返回非 0 的分支是存证失败。
        """
        raw = self._read_body_bytes(LANXIN_CALLBACK_MAX_BYTES)
        if raw is None:
            self._send_json(413, {"errCode": -4, "errMsg": "报文过大或长度非法"})
            return

        q = parse_qs(urlparse(self.path).query)
        timestamp = (q.get('timestamp') or [''])[0]
        nonce = (q.get('nonce') or [''])[0]
        signature = (q.get('signature') or [''])[0]

        try:
            body = json.loads(raw.decode('utf-8'))
            data_encrypt = str((body or {}).get('dataEncrypt') or '')
        except (ValueError, UnicodeDecodeError):
            data_encrypt = ''

        cfg = lanxin_config.load_config(LANXIN_CONFIG_FILE)
        cred = cfg.get('credentials') or {}
        sign_token = cred.get('callbackSignToken') or ''
        aes_key = cred.get('callbackAesKey') or ''

        # ② 验签。未通过只记数与时间,绝不落 body。
        if not sign_token or not lanxin_crypto.verify_signature(
                sign_token, timestamp, nonce, data_encrypt, signature):
            _lanxin_rejected['count'] += 1
            _lanxin_rejected['lastAt'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            _lanxin_rejected['lastFrom'] = audit.client_ip(self.headers, self.client_address)
            self._send_json(200, {"errCode": -2, "errMsg": "签名校验失败"})
            return

        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # ③ 存证。这是唯一允许让蓝信重推的失败点。
        try:
            os.makedirs(os.path.dirname(LANXIN_RAW_FILE) or '.', exist_ok=True)
            with open(LANXIN_RAW_FILE, 'a', encoding='utf-8') as f:
                f.write(json.dumps({"receivedAt": now, "timestamp": timestamp,
                                    "nonce": nonce, "signature": signature,
                                    "body": raw.decode('utf-8', 'replace')},
                                   ensure_ascii=False) + '\n')
        except OSError as e:
            logger.error("蓝信回调存证失败,请求蓝信重推: %s", e)
            self._send_json(200, {"errCode": -4, "errMsg": "服务端存证失败"})
            return

        # ④⑤ 解密与解析。失败一律落「未解析」,仍回 0。
        events, err = [], None
        try:
            events = lanxin_callback.parse_envelope(
                lanxin_crypto.decrypt(aes_key, data_encrypt))['events']
        except ValueError as e:
            err = str(e)

        def _mutate(store):
            if err is not None:
                lanxin_inbox.add_item(store, {
                    "id": "raw-%s" % now, "receivedAt": now, "status": "unparsed",
                    "unparsedReason": err, "eventType": "", "staffId": "",
                    "employId": None, "name": None, "msgType": "", "text": "",
                    "rawMsgData": {}, "groupId": None, "groupName": None,
                    "handled": False, "handledInfo": None,
                })
            for ev in events:
                eid = ev.get('id') or ''
                if eid and lanxin_inbox.is_seen(store, eid):
                    continue                       # ⑥ 去重
                if eid:
                    lanxin_inbox.mark_seen(store, eid, now)
                lanxin_inbox.add_item(store, lanxin_callback.event_to_item(ev, store, now))
            lanxin_inbox.prune(store, now)
            return True

        ok, _res = self._followup_txn(_lanxin_inbox_lock, _load_lanxin_inbox,
                                      _mutate, _save_lanxin_inbox)
        if not ok:
            logger.error("蓝信回调落库失败(存证已保留,不请求重推)")
        self._send_json(200, {"errCode": 0, "errMsg": "ok"})
```

在 `do_POST` 路由区（`server.py:1021` 附近）加：

```python
        elif parsed.path == '/api/lanxin/callback':
            self.handle_lanxin_callback()
```

`do_GET` 中若命中 `/api/lanxin/callback` 则返回 405：

```python
        elif parsed.path == '/api/lanxin/callback':
            self._send_json(405, {"errCode": -4, "errMsg": "仅支持 POST"})
```

- [ ] **Step 6: 实现收件箱三个 handler**

```python
    def handle_lanxin_inbox_get(self):
        """GET /api/lanxin/inbox —— 收件箱。超管专属(路径已在 _SUPER_ONLY_PATHS)。"""
        with _lanxin_inbox_lock:
            store = _load_lanxin_inbox()
        items = []
        for it in store.get('items') or []:
            row = dict(it)
            row['candidateProjects'] = lanxin_inbox.candidate_projects(store, it.get('staffId') or '')
            items.append(row)
        self._send_json(200, {"success": True, "items": items,
                              "rejected": dict(_lanxin_rejected),
                              "received": len(store.get('items') or [])})

    def handle_lanxin_inbox_handle(self):
        """POST /api/lanxin/inbox/handle {itemId, domain, projectId, instanceId?}
        —— 把一条回复【追加】进目标跟进域。超管专属。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        item_id = str(data.get('itemId') or '').strip()
        domain = str(data.get('domain') or '').strip()
        project_id = str(data.get('projectId') or '').strip()
        instance_id = str(data.get('instanceId') or '').strip()
        if not item_id or not project_id or domain not in _LANXIN_HANDLE_TARGETS:
            self._send_json(400, _error_payload(
                ERR_VALIDATION, "itemId/projectId 必填,domain 须为 %s 之一"
                % "/".join(sorted(_LANXIN_HANDLE_TARGETS))))
            return
        account = auth.validate_session(auth.parse_cookie_token(self.headers.get('Cookie')))
        if not account:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return

        with _lanxin_inbox_lock:
            store = _load_lanxin_inbox()
            item = next((x for x in store.get('items') or [] if x.get('id') == item_id), None)
        if item is None:
            self._send_json(404, _error_payload(ERR_VALIDATION, "收件箱条目不存在"))
            return
        if item.get('handled'):
            self._send_json(400, _error_payload(ERR_VALIDATION, "该条已归入,不可重复归入"))
            return

        field = _LANXIN_HANDLE_TARGETS[domain]['field']
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ok, res = self._lanxin_write_followup(
            domain, field, project_id, instance_id,
            item.get('name'), item.get('receivedAt'), item.get('text'), account, now)
        if not ok:
            self._send_json(400 if isinstance(res, str) else 500,
                            _error_payload(ERR_VALIDATION if isinstance(res, str) else ERR_INTERNAL,
                                           res or "归入失败"))
            return

        info = {"domain": domain, "label": _LANXIN_HANDLE_TARGETS[domain]['label'],
                "projectId": project_id, "instanceId": instance_id or None,
                "at": now, "by": account}
        self._followup_txn(_lanxin_inbox_lock, _load_lanxin_inbox,
                           lambda s: lanxin_inbox.mark_handled(s, item_id, info),
                           _save_lanxin_inbox)
        self._audit_set(target='蓝信回复 %s' % item_id,
                        detail='归入%s · 项目 %s' % (_LANXIN_HANDLE_TARGETS[domain]['label'], project_id))
        self._send_json(200, {"success": True, "handledInfo": info})

    def handle_lanxin_inbox_delete(self):
        """POST /api/lanxin/inbox/delete {itemId} —— 删除一条收件箱条目。超管专属。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        item_id = str(data.get('itemId') or '').strip()
        if not item_id:
            self._send_json(400, _error_payload(ERR_VALIDATION, "itemId 必填"))
            return

        def _mutate(store):
            before = len(store.get('items') or [])
            store['items'] = [x for x in store.get('items') or [] if x.get('id') != item_id]
            if len(store['items']) == before:
                raise ValueError("收件箱条目不存在")
            return True

        ok, res = self._followup_txn(_lanxin_inbox_lock, _load_lanxin_inbox,
                                     _mutate, _save_lanxin_inbox)
        if not ok:
            self._send_json(400 if isinstance(res, str) else 500,
                            _error_payload(ERR_VALIDATION if isinstance(res, str) else ERR_INTERNAL,
                                           res or "删除失败"))
            return
        self._audit_set(target='蓝信回复 %s' % item_id, detail='删除收件箱条目')
        self._send_json(200, {"success": True})
```

归入写入的分域实现（`progress` 不走 `followup_store`，必须单开分支）：

```python
    def _lanxin_write_followup(self, domain, field, project_id, instance_id,
                               name, received_at, text, account, now):
        """把回复追加进目标域。返回 (ok, result) —— 与 _followup_txn 同构。

        progress 域【不走 followup_store】,其 store 逻辑内联在本文件,
        故必须单开分支,不可假定四域同构。
        """
        def _append(rec_getter):
            def _mutate(store):
                old = (rec_getter(store) or {}).get(field, '')
                return _lanxin_append_reply(old, name, received_at, text)
            return _mutate

        if domain == 'risk':
            def _m(store):
                old = (store.get('current', {}).get(project_id) or {}).get(field, '')
                return risk_followup.apply_update(
                    store, project_id, field,
                    _lanxin_append_reply(old, name, received_at, text), account, now)
            return self._followup_txn(_risk_lock, _load_risk_followup, _m, _save_risk_followup)

        if domain == 'payment_key':
            def _m(store):
                old = (store.get('current', {}).get(project_id) or {}).get(field, '')
                return payment_key_followup.apply_update(
                    store, project_id, field,
                    _lanxin_append_reply(old, name, received_at, text), account, now)
            return self._followup_txn(_payment_key_lock, _load_payment_key_followup,
                                      _m, _save_payment_key_followup)

        if domain == 'temp':
            def _m(store):
                inst = temp_followup.find_instance(store, instance_id)
                if inst is None:
                    raise ValueError("临时跟进实例不存在,请重新选择")
                old = (inst.get('current', {}).get(project_id) or {}).get(field, '')
                return temp_followup.apply_update(
                    inst, project_id, field,
                    _lanxin_append_reply(old, name, received_at, text), account, now)
            return self._followup_txn(_temp_lock, _load_temp_followup, _m, _save_temp_followup)

        # progress
        def _m(store):
            old = (store.get('current', {}).get(project_id) or {}).get(field, '')
            return _progress_apply_update(
                store, project_id, field,
                _lanxin_append_reply(old, name, received_at, text), account, now)
        return self._followup_txn(_progress_lock, _load_progress, _m, _save_progress)
```

**实现者注意：** 上面的 `_risk_lock` / `_load_risk_followup` / `_save_risk_followup`
等名称需按 `server.py` 中的**实际名称**核对后使用（各域的锁与读写函数已存在，
在 `/api/risk-followup/*`、`/api/payment-key-followup/*`、`/api/temp-followup/*`、
`/api/progress/*` 的 handler 里可以找到）。`temp_followup.find_instance` 若不存在，
按 `temp_followup.py` 的实际实例查找方式调整。**不要新增或修改 `followup_store.py`。**

- [ ] **Step 7: `audit.py` 登记动作**

在 `_ACTION_MAP`（`audit.py:29`）加：

```python
    ('POST', '/api/lanxin/inbox/handle'): ('lanxin.inbox_handle', '归入蓝信回复'),
    ('POST', '/api/lanxin/inbox/delete'): ('lanxin.inbox_delete', '删除蓝信回复'),
```

- [ ] **Step 8: 跑测试确认通过**

Run: `python -m pytest tests/test_server_lanxin_callback.py -q`
Expected: PASS，11 passed

Run: `python -m pytest -q`
Expected: 全绿（确认未打破既有测试）

- [ ] **Step 9: 变异验证（必做）**

1. 把 `/api/lanxin/callback` 从 `_AUTH_EXEMPT` 移除
   Expected: `test_callback_path_is_auth_exempt` 红
2. 把 `_lanxin_append_reply` 的 `html.escape(str(text or ''))` 改成 `str(text or '')`
   Expected: `test_append_reply_escapes_html` 红
3. 把 `_lanxin_append_reply` 的返回改成只返回 `block`（丢弃 `old`）
   Expected: `test_append_reply_keeps_existing_content` 红
4. 把 `_LANXIN_HANDLE_TARGETS['temp']['field']` 改成 `'followAction'`
   Expected: `test_handle_domain_field_map_matches_real_domains` 红

- [ ] **Step 10: 提交**

```bash
git add server.py audit.py tests/test_server_lanxin_callback.py
git commit -m "feat(lanxin): 免登录回调端点 + 收件箱与归入 API(追加写 + 全量转义)"
```

---

### Task 7: 前端配置卡扩展

**Files:**
- Modify: `frontend/src/components/LanxinConfigCard.vue`
- Modify: `frontend/src/lib/lanxinApi.ts`（若类型定义在别处，按实际路径调整 `LanxinConfig` 类型）
- Test: `frontend/src/components/LanxinConfigCard.test.ts`（追加）

**Interfaces:**
- Consumes: Task 3 的 `public_config` 输出形状（`credentials.hasCallbackAesKey` / `hasCallbackSignToken`，顶层 `sendAs`）
- Produces: 无（纯 UI）

- [ ] **Step 1: 写失败测试**

在 `frontend/src/components/LanxinConfigCard.test.ts` 追加：

```ts
it('展示发送身份单选，默认应用号', async () => {
  const wrapper = await mountCard({ sendAs: 'account' })
  expect(wrapper.text()).toContain('应用号')
  expect(wrapper.text()).toContain('智能机器人')
})

it('两个回调凭证未配置时显示「未配置」', async () => {
  const wrapper = await mountCard({
    credentials: { hasCallbackAesKey: false, hasCallbackSignToken: false },
  })
  expect(wrapper.text()).toContain('回调密钥')
  expect(wrapper.text()).toContain('回调签名令牌')
})

it('回调地址按当前站点拼出，可复制', async () => {
  const wrapper = await mountCard({})
  expect(wrapper.text()).toContain('/api/lanxin/callback')
})

it('展示已拒绝次数，让 signToken 配错一眼可见', async () => {
  const wrapper = await mountCard({}, { rejected: { count: 7, lastAt: '2026-07-20 10:00:00' } })
  expect(wrapper.text()).toContain('7')
})

it('保存时不回传空的回调密钥（空串=不修改）', async () => {
  const { payload } = await saveWithoutTouchingSecrets()
  expect(payload.credentials.callbackAesKey).toBe('')
  expect(payload.credentials.callbackSignToken).toBe('')
})
```

`mountCard` / `saveWithoutTouchingSecrets` 按该测试文件**既有的挂载与 mock 写法**实现
（文件已存在，沿用其现有 helper；若无则参照 `frontend/src/components/YitianRulesCard.test.ts`）。
**注意：vitest 默认不还原 mock**，每个用例前需显式 `vi.restoreAllMocks()` 或在 `beforeEach` 清理。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/LanxinConfigCard.test.ts`
Expected: FAIL，找不到「智能机器人」文本

- [ ] **Step 3: 改 `LanxinConfigCard.vue`**

在凭证表单区（`LanxinConfigCard.vue:79-93` 附近）追加三组控件：

```vue
      <el-form-item label="发送身份">
        <el-radio-group v-model="cfg.sendAs" size="small">
          <el-radio-button label="account">应用号</el-radio-button>
          <el-radio-button label="bot">智能机器人</el-radio-button>
        </el-radio-group>
        <span class="dv-hint">
          机器人须由组织管理员额外开通「机器人能力」；应用号无需额外审批
        </span>
      </el-form-item>

      <el-form-item label="回调密钥">
        <el-input v-model="newCallbackAesKey" type="password" show-password size="small"
          style="width: 320px"
          :placeholder="cfg.credentials.hasCallbackAesKey ? '已配置，留空则不修改' : '未配置'" />
        <span class="dv-hint" :class="cfg.credentials.hasCallbackAesKey ? 'ok' : 'warn'">
          {{ cfg.credentials.hasCallbackAesKey ? '已配置' : '未配置' }} · 不回显、不入日志与审计
        </span>
      </el-form-item>

      <el-form-item label="回调签名令牌">
        <el-input v-model="newCallbackSignToken" type="password" show-password size="small"
          style="width: 320px"
          :placeholder="cfg.credentials.hasCallbackSignToken ? '已配置，留空则不修改' : '未配置'" />
        <span class="dv-hint" :class="cfg.credentials.hasCallbackSignToken ? 'ok' : 'warn'">
          {{ cfg.credentials.hasCallbackSignToken ? '已配置' : '未配置' }}
        </span>
      </el-form-item>

      <el-form-item label="回调地址">
        <el-input :model-value="callbackUrl" readonly size="small" style="width: 420px" />
        <el-button size="small" @click="copyCallbackUrl">复制</el-button>
        <span class="dv-hint">填到开发者中心「回调事件」页的「订阅事件回调地址」</span>
      </el-form-item>

      <el-form-item v-if="rejected.count > 0" label="已拒绝">
        <span class="dv-hint warn">
          {{ rejected.count }} 次验签失败 · 最近 {{ rejected.lastAt }}
          —— 通常意味着回调签名令牌填错了
        </span>
      </el-form-item>
```

script 区加：

```ts
const newCallbackAesKey = ref('')
const newCallbackSignToken = ref('')
const rejected = ref<{ count: number; lastAt: string }>({ count: 0, lastAt: '' })

// 系统不知道自己的对外地址,用当前访问地址拼 —— 超管是从浏览器打开的,
// 他看到的 origin 就是蓝信要访问的地址(同一张内网)。
const callbackUrl = computed(() => `${location.origin}/api/lanxin/callback`)

async function copyCallbackUrl() {
  await navigator.clipboard.writeText(callbackUrl.value)
  ElMessage.success('回调地址已复制')
}
```

`onSave()`（`LanxinConfigCard.vue:36`）中，与 `appSecret` 并列地回传两个新密钥：

```ts
    payload.credentials.callbackAesKey = newCallbackAesKey.value
    payload.credentials.callbackSignToken = newCallbackSignToken.value
```

- [ ] **Step 4: 跑测试与类型检查**

Run: `cd frontend && npx vitest run src/components/LanxinConfigCard.test.ts && npm run typecheck`
Expected: PASS，typecheck 无错误

- [ ] **Step 5: 变异验证（必做）**

1. 把 `payload.credentials.callbackAesKey = newCallbackAesKey.value` 改成
   `= cfg.value.credentials.callbackAesKey`（回传脱敏后的空串会清空后端已存密钥）
   Expected: `保存时不回传空的回调密钥` 红

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/LanxinConfigCard.vue frontend/src/components/LanxinConfigCard.test.ts frontend/src/lib/lanxinApi.ts
git commit -m "feat(lanxin): 配置卡增发送身份、回调双凭证、回调地址与拒绝计数"
```

---

### Task 8: 前端「蓝信回复」签

**Files:**
- Create: `frontend/src/lib/lanxinInbox.ts`
- Create: `frontend/src/lib/lanxinInbox.test.ts`
- Create: `frontend/src/components/LanxinInboxCard.vue`
- Create: `frontend/src/components/LanxinInboxCard.test.ts`
- Modify: `frontend/src/views/DataView.vue`（新增第四签）

**Interfaces:**
- Consumes: Task 6 的 `GET /api/lanxin/inbox`、`POST /api/lanxin/inbox/handle`、`POST /api/lanxin/inbox/delete`
- Produces: 无

- [ ] **Step 1: 写 `lanxinInbox.ts` 的失败测试**

创建 `frontend/src/lib/lanxinInbox.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { HANDLE_DOMAINS, needsInstance, canHandle } from './lanxinInbox'

describe('lanxinInbox', () => {
  it('四个归入目标域与后端一致', () => {
    expect(HANDLE_DOMAINS.map((d) => d.value).sort())
      .toEqual(['payment_key', 'progress', 'risk', 'temp'])
  })

  it('只有 temp 域需要选实例', () => {
    expect(needsInstance('temp')).toBe(true)
    expect(needsInstance('risk')).toBe(false)
    expect(needsInstance('progress')).toBe(false)
  })

  it('已归入的条目不可再次归入', () => {
    expect(canHandle({ handled: true, status: 'parsed' } as never)).toBe(false)
  })

  it('未解析的条目不可归入', () => {
    // 看不懂的东西不许往业务数据里写
    expect(canHandle({ handled: false, status: 'unparsed' } as never)).toBe(false)
  })

  it('已解析且未归入的条目可归入', () => {
    expect(canHandle({ handled: false, status: 'parsed' } as never)).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/lanxinInbox.test.ts`
Expected: FAIL，`Failed to resolve import "./lanxinInbox"`

- [ ] **Step 3: 实现 `frontend/src/lib/lanxinInbox.ts`**

```ts
// 蓝信收件箱的类型与纯判定。口径单一来源在此,组件不重复判断。
export interface LanxinInboxItem {
  id: string
  receivedAt: string
  status: 'parsed' | 'unparsed'
  unparsedReason: string | null
  eventType: string
  staffId: string
  employId: string | null
  name: string | null
  msgType: string
  text: string
  groupId: string | null
  groupName: string | null
  handled: boolean
  handledInfo: Record<string, unknown> | null
  candidateProjects: string[]
}

export const HANDLE_DOMAINS = [
  { value: 'risk', label: '风险跟进' },
  { value: 'temp', label: '临时重点跟进' },
  { value: 'payment_key', label: '回款重点跟进' },
  { value: 'progress', label: '重点项目进展' },
] as const

export type HandleDomain = (typeof HANDLE_DOMAINS)[number]['value']

/** 只有临时跟进是多实例的（V4.0.2），归入时须再选一级。 */
export function needsInstance(domain: string): boolean {
  return domain === 'temp'
}

/** 已归入的不可重复归入；未解析的不许往业务数据里写。 */
export function canHandle(item: Pick<LanxinInboxItem, 'handled' | 'status'>): boolean {
  return !item.handled && item.status === 'parsed'
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/lanxinInbox.test.ts`
Expected: PASS，5 passed

- [ ] **Step 5: 写 `LanxinInboxCard` 的失败测试**

创建 `frontend/src/components/LanxinInboxCard.test.ts`：

```ts
it('未解析条目显示原因，不静默隐藏', async () => {
  const wrapper = await mountInbox([
    { id: 'raw-1', status: 'unparsed', unparsedReason: '非文本消息或正文字段缺失',
      handled: false, text: '', name: null, receivedAt: '2026-07-20 10:00:00',
      candidateProjects: [] },
  ])
  expect(wrapper.text()).toContain('未解析')
  expect(wrapper.text()).toContain('非文本消息或正文字段缺失')
})

it('身份查不到时显示原始 staffId 与「未知」，不编造姓名', async () => {
  const wrapper = await mountInbox([
    { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: null,
      employId: null, staffId: '524288-zzz', receivedAt: '2026-07-20 10:00:00',
      candidateProjects: [] },
  ])
  expect(wrapper.text()).toContain('未知')
  expect(wrapper.text()).toContain('524288-zzz')
})

it('归入候选项目标注为推测', async () => {
  const wrapper = await mountInbox([
    { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: '张三',
      employId: 'A1', staffId: 's1', receivedAt: '2026-07-20 10:00:00',
      candidateProjects: ['P001'] },
  ])
  await openHandleDrawer(wrapper)
  expect(wrapper.text()).toContain('推测')
})

it('已归入条目显示去向且归入按钮禁用', async () => {
  const wrapper = await mountInbox([
    { id: 'evt-1', status: 'parsed', handled: true, text: 'hi', name: '张三',
      handledInfo: { label: '风险跟进', projectId: 'P001' },
      receivedAt: '2026-07-20 10:00:00', candidateProjects: [] },
  ])
  expect(wrapper.text()).toContain('风险跟进')
})
```

`mountInbox` / `openHandleDrawer` 按仓库既有组件测试写法实现
（参照 `frontend/src/components/YitianRulesCard.test.ts`）。

- [ ] **Step 6: 实现 `LanxinInboxCard.vue`**

要求（实现者按仓库既有卡片/表格写法落地，样式**只准引用 `theme.css` 令牌，不准手写散值**）：

- 表格列：接收时间 / 姓名（查不到显「未知」并同时展示 `staffId`）/ 工号 / 来源（私聊 / 群聊+群名 / 应用号）/ 状态（已解析 / 未解析+原因）/ 回复内容 / 归入去向 / 操作
- 数字列挂 `.u-num`（金额百分比 KPI 表格数字列的既有约定）
- 未解析条目**显式展示**原因，不隐藏、不折叠掉
- 「归入」按钮：`canHandle(item)` 为 false 时禁用
- 归入抽屉：域下拉（`HANDLE_DOMAINS`）→ `needsInstance(domain)` 为真时再显示实例下拉 →
  项目选择（`candidateProjects` 作为默认候选置顶，**旁注「推测，可改」**）→ 确认
- 归入成功后刷新列表
- 删除按钮须二次确认

- [ ] **Step 7: `DataView.vue` 新增第四签**

在 `DataView.vue:135` 的「维护」签**之前**插入：

```vue
      <el-tab-pane label="蓝信回复" name="lanxinInbox">
        <LanxinInboxCard />
      </el-tab-pane>
```

并在 script 区 `import LanxinInboxCard from '@/components/LanxinInboxCard.vue'`。

**注意（V3.5.0 教训）：绝不给 `el-tab-pane` 设 `lazy`** —— EP 2.14.1 默认 `false`（全渲染 + `v-show` 隐藏），
现有三签依赖这一行为，加 `lazy` 会改变既有语义。

- [ ] **Step 8: 跑测试、类型检查与构建**

Run: `cd frontend && npx vitest run src/lib/lanxinInbox.test.ts src/components/LanxinInboxCard.test.ts && npm run typecheck && npm run build`
Expected: 全部 PASS

- [ ] **Step 9: 变异验证（必做）**

1. 把 `canHandle` 改成 `return !item.handled`（允许归入未解析条目）
   Expected: `未解析的条目不可归入` 红
2. 把 `needsInstance` 改成恒 `false`
   Expected: `只有 temp 域需要选实例` 红

- [ ] **Step 10: 提交**

```bash
git add frontend/src/lib/lanxinInbox.ts frontend/src/lib/lanxinInbox.test.ts frontend/src/components/LanxinInboxCard.vue frontend/src/components/LanxinInboxCard.test.ts frontend/src/views/DataView.vue
git commit -m "feat(lanxin): /data 新增「蓝信回复」签(收件箱 + 归入抽屉)"
```

---

### Task 9: 版本号、陈旧记录修正与文档

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `CLAUDE.md:153`
- Modify: `server.py:341`、`server.py:2948`（注释）
- Modify: `docs/2026-07-20-蓝信接口与回调地址填写说明.md`
- Modify: `docs/2026-07-20-蓝信回调接口调研.md`
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: 无
- Produces: 无

- [ ] **Step 1: 版本号**

`frontend/src/version.ts` 改为 `export const APP_VERSION = 'V4.0.5'`（**单一来源，只改此处**）。

- [ ] **Step 2: 修正陈旧的「单线程」记载**

`server.py:3816` 实为 `ThreadingHTTPServer`（提交 `4bbff71` 改的），以下三处记载已过期：

- `CLAUDE.md:153` 那条技术债整条**删除**，因为它描述的问题已不存在
- `server.py:341` 注释「服务是单线程 HTTPServer,排队会把整站堵死」→
  改为「抢不到锁立即 400,绝不排队等待:排队会把请求线程耗在锁上」
- `server.py:2948` 注释「单线程排队 = 把全站堵死」→ 改为「排队 = 请求线程被锁拖住」

**核实后再改**：先跑 `grep -n "ThreadingHTTPServer" server.py` 确认仍是多线程，避免把正确记载改错。

- [ ] **Step 3: 更新填写说明文档**

`docs/2026-07-20-蓝信接口与回调地址填写说明.md`：

- §1.2「回调地址 —— 本系统留空」**整节作废重写**：改为填
  `https://<部署地址>/api/lanxin/callback`，并说明两个框中「订阅事件回调地址」要填、
  「动态数据拉取地址」仍留空
- §1.2 增补：需在开发者中心订阅事件。应用号身份订阅 `account_message`；
  机器人身份订阅 `bot_private_message` 与 `bot_group_message`
- §1.1 增补两个凭证：**回调密钥（aesKey）** 与 **回调签名令牌（signToken）**，
  取自开发者中心「回调事件」页，与 AppId/AppSecret 是不同的凭证
- §2 表格增补这两个框在 `/data` 的填法
- §3「为什么回调地址留空」**整节删除**，替换为「回调已实现」的说明并指向本 spec
- §4 状态表更新

- [ ] **Step 4: 更新调研文档**

`docs/2026-07-20-蓝信回调接口调研.md`：在开头加一段**结论作废声明**：

```markdown
> **本文 2026-07-20 的「不做回调」结论已于 V4.0.5 作废。** 两条理由中：
> ① 「纯标准库没有 AES」——【已推翻】。蓝信文档附有完整测试向量，
>    纯 Python 零依赖 AES-256-CBC 解密已实测跑通（见 `lanxin_crypto.py`）。
> ② 「内网部署蓝信进不来」——【前提有误】。蓝信是私有化部署在公司内网，入站可达。
> 现行设计见 `docs/superpowers/specs/2026-07-20-lanxin-bidirectional-callback-design.md`。
```

- [ ] **Step 5: 更新 `PROGRESS.md`**

追加 V4.0.5 条目，写明：双向闭环（应用号/机器人双身份 + 回调 + 收件箱 + 归入）、
零依赖 AES、三条承重设计、**以及「凭证仍未下发，全链路从未联调」这一状态**。

- [ ] **Step 6: 全量验证**

Run: `bash verify.sh`
Expected: EXIT=0，全绿

- [ ] **Step 7: 提交**

```bash
git add frontend/src/version.ts CLAUDE.md server.py docs/ PROGRESS.md
git commit -m "chore(release): V4.0.5 + 修正 ThreadingHTTPServer 的陈旧记载 + 回调文档改写"
```

---

## 自审记录

**1. Spec 覆盖**：spec 各节 → 任务映射

| Spec 节 | 任务 |
|---|---|
| §2.3 回调协议 / §2.4 零依赖解密 | Task 1 |
| §7 存储结构 / §8 发送台账与归因 | Task 2、Task 4 |
| §2.2 双身份 / §8 引导语 | Task 4 |
| §5.3 事件与字段兼容 | Task 5 |
| §5 闸门顺序 / §6 安全边界 / §9 归入 | Task 6 |
| §10.1 配置扩展 | Task 3 |
| §10.2 前端 | Task 7、Task 8 |
| §11 测试策略 | 各任务 Step「变异验证」 |
| §12.1 陈旧记录 / §13 文档 | Task 9 |

无遗漏。

**2. 占位符扫描**：无 TBD / TODO / 「类似 Task N」/ 「加适当错误处理」。
两处标注「按实际名称核对」（Task 6 的各域锁与读写函数名、Task 7/8 的测试 helper），
是**要求实现者核实既有代码**而非留空——这些名称在现有 `server.py` 与测试文件中确实存在，
只是行号会随改动漂移，写死行号反而会误导。

**3. 类型一致性**：
- `dispatch` 返回的 `sentLog` 各字段（Task 4）↔ `lanxin_inbox.record_sent` 入参（Task 2）—— 一致
- `event_to_item` 产出的条目形状（Task 5）↔ `LanxinInboxItem`（Task 8）—— 一致
- `_LANXIN_HANDLE_TARGETS` 的四个键（Task 6）↔ `HANDLE_DOMAINS` 的四个 value（Task 8）—— 一致
- `public_config` 的 `hasCallbackAesKey` / `hasCallbackSignToken`（Task 3）↔ 前端读取（Task 7）—— 一致
