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
    http.client 会在 ASCII 编码处崩掉(副本实测教训)。base64url 保证全 ASCII。

    工号故意用"王小明"而不是"张三":{"emp":"张三",...} 序列化后的字节在标准
    base64 与 urlsafe base64 两种字母表下编码结果恰好相同(不含 + 或 /),
    换编码器这条测试也测不出来,是运气型断言。"王小明" 是实测过的、标准 base64
    下真的会产出 / 字符的输入(urlsafe 会把它换成 _),换编码器时才会真的变红。"""
    t = LR.issue_token("王小明", "project", SEC, NOW)
    assert t.isascii()
    assert all(c not in t for c in " /?#&+%")


def test_expired_token_rejected():
    t = LR.issue_token("A030910", "project", SEC, NOW, ttl_hours=1)
    assert LR.verify_token(t, SEC, NOW + 3599) is not None
    assert LR.verify_token(t, SEC, NOW + 3601) is None


def test_token_valid_exactly_at_expiry_boundary():
    """【承重】now_epoch 恰好等于 exp 时仍应放行 —— 判断用的是 >,不是 >=,
    "到期那一刻仍算有效"是设计意图。test_expired_token_rejected 只探了
    NOW+3599(未到期)和 NOW+3601(已过期)两侧,唯独没探恰好等于 exp 的
    NOW+3600 —— 这一点正是 > 与 >= 唯一有行为差异的地方,不补这条,
    把 > 改成 >= 不会有任何测试变红。"""
    t = LR.issue_token("A030910", "project", SEC, NOW, ttl_hours=1)
    assert LR.verify_token(t, SEC, NOW + 3600) is not None


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


def test_oversized_exp_digits_rejected_not_crashed():
    """【承重·Critical①】exp 段是超长纯数字串(>4300 位)时必须被拒、而不是崩溃 ——
    这个输入不需要知道密钥就能构造。Python 3.11+ 的 int(str) 对超长数字串有位数
    上限(默认 4300 位),直接 int(exp_s) 会抛 ValueError,而这里是免登录入口,
    抛出去就是 500,员工会以为系统坏了。三条 Critical 分开写成三条独立测试而不是
    合并成一条 parametrize:枚举对输入空间等价类的划分本身不完整,合并会把
    "这一类崩溃已堵住"的全称断言伪装成"枚举过的这几个值不崩",不是一回事。"""
    t = LR.issue_token("A030910", "project", SEC, NOW)
    payload, _exp, sig = t.split(".")
    forged = "%s.%s.%s" % (payload, "9" * 4301, sig)
    assert LR.verify_token(forged, SEC, NOW) is None


def test_unicode_digit_exp_rejected_not_crashed():
    """【承重·Critical②】exp 段是 Unicode 上标数字(如 "²³")时必须被拒、而不是崩溃 ——
    这个输入同样不需要知道密钥。str.isdigit() 对这类字符返回 True,但 int() 解析
    不了会抛 ValueError:isdigit() 认可的合法集合比 int() 能解析的更大,用 isdigit()
    做前置校验等于隐含假设"isdigit 通过 ⇒ int() 能解析",这个假设不成立,
    必须换成 isdecimal()(它的合法集合与 int() 一致)。"""
    t = LR.issue_token("A030910", "project", SEC, NOW)
    payload, _exp, sig = t.split(".")
    forged = "%s.%s.%s" % (payload, "²³", sig)
    assert LR.verify_token(forged, SEC, NOW) is None


def test_non_ascii_sig_rejected_not_crashed():
    """【承重·Critical③】sig 段含非 ASCII 字符(如中文)时必须被拒、而不是崩溃 ——
    这个输入同样不需要知道密钥。hmac.compare_digest 两个参数都是 str 时要求全
    ASCII,否则抛 TypeError。payload 段早已因为走 base64url 而全 ASCII(见
    test_token_is_pure_ascii_and_url_safe),但 sig/exp 两段完全在那层保护之外 ——
    同一类"中文进 ASCII 处崩掉"的问题,换了 sig 这个机制原样复现一次。"""
    t = LR.issue_token("A030910", "project", SEC, NOW)
    payload, exp, _sig = t.split(".")
    forged = "%s.%s.%s" % (payload, exp, "中文签名")
    assert LR.verify_token(forged, SEC, NOW) is None


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


def test_forged_invalid_kind_rejected_at_verify():
    """【承重】verify_token 里 kind not in KINDS 这道校验,在当前签发路径下"不可达"
    ——issue_token 会在签发时就拒绝非法 kind(见下面 test_unknown_kind_rejected_at_issue),
    不掌握密钥也伪造不出带非法 kind 的合法签名,所以删掉这道校验不会有任何测试变红。
    但"当前不可达"不等于"不该测":这与空密钥判断是同一形状的缺口(见
    test_empty_secret_rejects_token_signed_with_empty_secret),必须用真密钥手工签一个
    非法 kind 的 token,单独钉住 verify_token 里这道校验本身,而不是依赖
    issue_token 那道更早的闸门顺带覆盖。"""
    payload_b64 = LR._b64url_encode(json.dumps(
        {"emp": "A030910", "kind": "nosuchkind"},
        ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    exp = NOW + 3600
    forged = "%s.%d.%s" % (payload_b64, exp, LR._sign(SEC, payload_b64, exp))
    assert LR.verify_token(forged, SEC, NOW) is None


def test_unknown_kind_rejected_at_issue():
    with pytest.raises(ValueError):
        LR.issue_token("A030910", "nosuchkind", SEC, NOW)
