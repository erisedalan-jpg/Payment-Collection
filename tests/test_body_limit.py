import io
import server


class _FakeReq:
    def __init__(self, content_length, body=b""):
        self.headers = {"Content-Length": str(content_length)}
        self.rfile = io.BytesIO(body)


def test_read_json_body_rejects_oversize():
    req = _FakeReq(server.MAX_JSON_BODY + 1, b"{}")
    assert server.CustomHandler._read_json_body(req) is None   # 超限→None,未读大 body


def test_read_json_body_ok_small():
    body = b'{"a": 1}'
    req = _FakeReq(len(body), body)
    assert server.CustomHandler._read_json_body(req) == {"a": 1}


def test_read_body_bytes_rejects_negative_and_oversize():
    assert server.CustomHandler._read_body_bytes(_FakeReq(-5), server.MAX_UPLOAD_BODY) is None
    assert server.CustomHandler._read_body_bytes(_FakeReq(server.MAX_UPLOAD_BODY + 1), server.MAX_UPLOAD_BODY) is None
