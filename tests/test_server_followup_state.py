import pytest

import server


@pytest.fixture(autouse=True)
def _clean_followup_state():
    server.followup_sync_state.clear()
    yield
    server.followup_sync_state.clear()


def test_set_followup_state_caps_size(monkeypatch):
    monkeypatch.setattr(server, "_FOLLOWUP_STATE_MAX", 3)
    for i in range(5):
        server._set_followup_state(f"R{i}", {"status": "syncing"})
    assert len(server.followup_sync_state) == 3
    assert set(server.followup_sync_state.keys()) == {"R2", "R3", "R4"}


def test_set_followup_state_overwrites(monkeypatch):
    monkeypatch.setattr(server, "_FOLLOWUP_STATE_MAX", 10)
    server._set_followup_state("R1", {"status": "syncing"})
    server._set_followup_state("R1", {"status": "success"})
    assert server.followup_sync_state["R1"] == {"status": "success"}
