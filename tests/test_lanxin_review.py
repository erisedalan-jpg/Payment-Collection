import json

import pytest

import lanxin_review as LR

SEC = "s" * 43
NOW = 1785296160


def test_roundtrip():
    t = LR.issue_token("A030910", "project", SEC, NOW)
    assert LR.verify_token(t, SEC, NOW) == {"emp": "A030910", "kind": "project"}


def test_token_is_pure_ascii_and_url_safe():
    """【承重】token 要拼进 URL path。中文工号/中文 kind 若明文进 URL,
    http.client 会在 ASCII 编码处崩掉(副本实测教训)。base64url 保证全 ASCII。"""
    t = LR.issue_token("张三", "project", SEC, NOW)
    assert t.isascii()
    assert all(c not in t for c in " /?#&+%")


def test_expired_token_rejected():
    t = LR.issue_token("A030910", "project", SEC, NOW, ttl_hours=1)
    assert LR.verify_token(t, SEC, NOW + 3599) is not None
    assert LR.verify_token(t, SEC, NOW + 3601) is None


def test_forged_signature_rejected():
    t = LR.issue_token("A030910", "project", SEC, NOW)
    payload, exp, sig = t.split(".")
    forged = "%s.%s.%s" % (payload, exp, "0" * len(sig))
    assert LR.verify_token(forged, SEC, NOW) is None


def test_wrong_secret_rejected():
    t = LR.issue_token("A030910", "project", SEC, NOW)
    assert LR.verify_token(t, "d" * 43, NOW) is None


def test_tampered_payload_rejected():
    """【承重】改工号必须失效 —— 否则任何人把自己的 token 里的工号换成别人的
    就能读到别人的待办、往别人的项目写反馈。"""
    t = LR.issue_token("A030910", "project", SEC, NOW)
    other = LR.issue_token("A999999", "project", SEC, NOW)
    mixed = "%s.%s.%s" % (other.split(".")[0], *t.split(".")[1:])
    assert LR.verify_token(mixed, SEC, NOW) is None


def test_tampered_exp_rejected():
    """exp 也在签名覆盖范围内 —— 否则改 exp 就能无限续期。"""
    t = LR.issue_token("A030910", "project", SEC, NOW, ttl_hours=1)
    payload, exp, sig = t.split(".")
    assert LR.verify_token("%s.%s.%s" % (payload, str(int(exp) + 99999), sig), SEC, NOW) is None


@pytest.mark.parametrize("bad", ["", "a", "a.b", "a.b.c.d", "...", "a.notint.c", None, 123])
def test_malformed_never_raises(bad):
    """【承重】格式怪异一律返回 None,绝不抛错 —— 这是免登录端点,
    任何异常都会变成 500,而 500 会让人以为系统坏了(应当显示「链接失效」)。"""
    assert LR.verify_token(bad, SEC, NOW) is None


def test_empty_secret_always_rejects():
    """密钥没配时不许放行任何 token —— 空密钥下 HMAC 仍能算出值,
    不显式拒绝等于把签名校验变成摆设。本条用真密钥签的 token 去测,靠签名不符拦下,
    不承担"空密钥判断本身"的举证责任 —— 那是下面
    test_empty_secret_rejects_token_signed_with_empty_secret 的职责。"""
    t = LR.issue_token("A030910", "project", SEC, NOW)
    assert LR.verify_token(t, "", NOW) is None
    with pytest.raises(ValueError):
        LR.issue_token("A030910", "project", "", NOW)


def test_empty_secret_rejects_token_signed_with_empty_secret():
    """【承重·安全】密钥未配时,连【用空密钥签出来的】token 也不许放行。

    这条比「用真密钥签的 token 在空密钥下被拒」严格得多:后者靠签名不符就拦下了,
    根本走不到空密钥判断那一行(删掉判断照样绿 —— 实测过)。
    而空密钥的签名是【任何人都能算出来的】:HMAC 的 key 就是空串,不需要任何秘密。
    所以密钥一旦没配,攻击者可以自签一个完全合法的 token,读任意工号的待办、
    往任意项目写反馈。这才是那道显式空密钥判断存在的理由。

    构造 forged 时【复用模块自己的 _b64url_encode/_sign】而不是手写等价物 ——
    手写等价物一旦与实现算法漂移,这条测试就变成恒真的假绿。
    """
    payload_b64 = LR._b64url_encode(json.dumps(
        {"emp": "A030910", "kind": "project"},
        ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    exp = NOW + 3600
    forged = "%s.%d.%s" % (payload_b64, exp, LR._sign("", payload_b64, exp))
    assert LR.verify_token(forged, "", NOW) is None


def test_unknown_kind_rejected_at_issue():
    with pytest.raises(ValueError):
        LR.issue_token("A030910", "nosuchkind", SEC, NOW)
