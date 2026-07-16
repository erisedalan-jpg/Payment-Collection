import threading
import server


class _H:  # 借用 CustomHandler 未绑定方法,构造最小 self
    pass


def test_followup_txn_success_saves_and_returns():
    saved = {}
    lock = threading.Lock()
    ok, res = server.CustomHandler._followup_txn(
        _H(), lock,
        load_fn=lambda: {"current": {}},
        mutate_fn=lambda s: s.setdefault("current", {}).setdefault("K", {"x": 1}),
        save_fn=lambda s: saved.update(s))
    assert ok is True and res == {"x": 1} and saved["current"]["K"] == {"x": 1}


def test_followup_txn_valueerror_is_validation():
    def boom(_s):
        raise ValueError("bad field")
    ok, msg = server.CustomHandler._followup_txn(_H(), threading.Lock(),
                                                 lambda: {}, boom, lambda _s: None)
    assert ok is False and "bad field" in str(msg)


def test_followup_txn_other_error_is_internal():
    def boom(_s):
        raise RuntimeError("disk full")
    ok, msg = server.CustomHandler._followup_txn(_H(), threading.Lock(),
                                                 lambda: {}, boom, lambda _s: None)
    assert ok is False and msg is not None
