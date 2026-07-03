import threading
import server


def test_acquire_free_slot_sets_running():
    state = {"running": False}
    lock = threading.Lock()
    ok = server._acquire_run_slot(state, lock, {"running": True, "phase": "x"})
    assert ok is True and state["running"] is True and state["phase"] == "x"


def test_acquire_busy_slot_rejected_and_unchanged():
    state = {"running": True, "phase": "old"}
    lock = threading.Lock()
    ok = server._acquire_run_slot(state, lock, {"running": True, "phase": "new"})
    assert ok is False and state["phase"] == "old"   # 忙时不改 state
