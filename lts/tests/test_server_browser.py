# tests/test_server_browser.py
import os
import server


def test_browser_check_no_crash_when_env_missing(monkeypatch):
    monkeypatch.delenv("PROGRAMFILES(X86)", raising=False)
    monkeypatch.delenv("PROGRAMFILES", raising=False)
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    monkeypatch.setattr(os.path, "isfile", lambda p: False)
    assert server._check_browser_available() == (False, "")


def test_browser_check_detects_chrome(monkeypatch):
    monkeypatch.setenv("PROGRAMFILES", r"C:\PF")
    monkeypatch.setenv("PROGRAMFILES(X86)", r"C:\PF86")
    monkeypatch.setenv("LOCALAPPDATA", r"C:\Local")
    chrome = os.path.join(r"C:\PF", "Google", "Chrome", "Application", "chrome.exe")
    monkeypatch.setattr(os.path, "isfile", lambda p: p == chrome)
    assert server._check_browser_available() == (True, "Google Chrome")


def test_browser_check_detects_edge(monkeypatch):
    monkeypatch.setenv("PROGRAMFILES", r"C:\PF")
    monkeypatch.setenv("PROGRAMFILES(X86)", r"C:\PF86")
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    edge = os.path.join(r"C:\PF", "Microsoft", "Edge", "Application", "msedge.exe")
    monkeypatch.setattr(os.path, "isfile", lambda p: p == edge)
    assert server._check_browser_available() == (True, "Microsoft Edge")
