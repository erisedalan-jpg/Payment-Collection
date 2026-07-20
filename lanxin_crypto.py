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
        # M-5:validate=True 与下方解密文时保持一致。默认(False)会静默丢弃非
        # base64 字符,含杂字符的密钥会被吞成另一个「看似合法」的密钥,
        # 于是解密在很远的 PKCS7 处才失败,报错完全指不到真正的原因。
        key = base64.b64decode((aes_key or "") + "=", validate=True)
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
