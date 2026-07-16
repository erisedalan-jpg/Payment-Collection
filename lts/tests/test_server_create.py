# tests/test_server_create.py
import http.server
import server


def test_create_server_is_threaded_and_local():
    srv = server.create_server(host="127.0.0.1", port=0)  # port 0 = 临时空闲端口
    try:
        assert isinstance(srv, http.server.ThreadingHTTPServer)
        assert srv.server_address[0] == "127.0.0.1"
    finally:
        srv.server_close()
