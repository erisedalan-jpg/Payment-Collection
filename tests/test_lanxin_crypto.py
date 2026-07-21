"""lanxin_crypto 的回归。

断言用的是【蓝信官方文档给出的测试向量】,不是自造 fixture ——
这是本功能里唯一能在无凭证情况下做真实回归的部分,必须做实。
"""
import base64
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


def test_decrypt_raises_on_malformed_key():
    """密钥【格式】非法(base64 位数不对) → 在解码阶段就该拦下。"""
    malformed = "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU"   # 46 字符,+"=" 后非 4 的倍数
    with pytest.raises(ValueError):
        C.decrypt(malformed, DOC_CIPHER)


def test_decrypt_raises_on_valid_shape_wrong_key():
    """密钥【格式合法但值错误】→ 解出的是乱码,必须被 PKCS7/UTF-8 校验拦下,
    绝不能静默返回乱码。这条才是 PKCS7 护栏的真实覆盖 ——
    此前那条用的密钥位数不对,在 base64 阶段就被拦下,从未走到 PKCS7。"""
    wrong = base64.b64encode(b"A" * 32).decode().rstrip("=")   # 43 字符,解出 32 字节
    with pytest.raises(ValueError):
        C.decrypt(wrong, DOC_CIPHER)
