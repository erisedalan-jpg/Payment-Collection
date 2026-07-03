# -*- coding: utf-8 -*-
import server


class _DeadPipe:
    def write(self, *_):
        raise BrokenPipeError("client gone")
    def flush(self):
        pass


class _OkPipe:
    def __init__(self):
        self.buf = b""
    def write(self, b):
        self.buf += b
    def flush(self):
        pass


class _Req:
    def __init__(self, wfile):
        self.wfile = wfile


def test_sse_write_swallows_broken_pipe():
    req = _Req(_DeadPipe())
    assert server.CustomHandler._sse_write(req, "data: x\n\n") is False   # 不抛


def test_sse_write_ok_returns_true():
    ok_pipe = _OkPipe()
    req = _Req(ok_pipe)
    assert server.CustomHandler._sse_write(req, "data: x\n\n") is True
    assert b"data: x" in ok_pipe.buf
