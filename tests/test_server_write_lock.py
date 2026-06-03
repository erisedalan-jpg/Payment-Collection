import threading
import time
import server


def test_write_followup_lock_serializes():
    overlap = {"max": 0, "cur": 0}
    probe = threading.Lock()

    def critical():
        with server._write_followup_lock:
            with probe:
                overlap["cur"] += 1
                overlap["max"] = max(overlap["max"], overlap["cur"])
            time.sleep(0.02)
            with probe:
                overlap["cur"] -= 1

    threads = [threading.Thread(target=critical) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert overlap["max"] == 1  # 任意时刻最多 1 个线程进入临界区
