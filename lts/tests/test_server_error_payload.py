import server


def test_error_payload_shape():
    p = server._error_payload(server.ERR_VALIDATION, "缺少必填字段: 项目编号")
    assert p == {"success": False, "code": "validation_error", "message": "缺少必填字段: 项目编号"}


def test_error_codes_distinct():
    codes = {server.ERR_VALIDATION, server.ERR_BUSY, server.ERR_PARSE, server.ERR_NOT_FOUND, server.ERR_INTERNAL}
    assert len(codes) == 5
