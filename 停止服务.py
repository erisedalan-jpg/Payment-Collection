#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
跨平台停止服务脚本 - 项目管理平台
支持 Windows / macOS / Linux
通过查找占用 8080 端口的进程或运行 server.py 的 Python 进程来终止服务
"""

import os
import sys
import subprocess
import time
import signal

PORT = 8080
SERVER_SCRIPT = "server.py"


def print_header():
    """打印脚本头部信息"""
    print("=" * 44)
    print("  项目管理平台 - 停止服务")
    print("=" * 44)
    print()


def find_pids_by_port_windows(port):
    """
    Windows: 通过 netstat 查找占用指定端口的进程 PID
    返回 PID 列表
    """
    pids = set()
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        for line in result.stdout.splitlines():
            # 匹配 LISTENING 状态的指定端口
            if f":{port} " in line and "LISTENING" in line:
                parts = line.strip().split()
                if parts:
                    pid_str = parts[-1]
                    if pid_str.isdigit():
                        pids.add(int(pid_str))
    except Exception:
        pass
    return list(pids)


def find_pids_by_port_unix(port):
    """
    macOS/Linux: 通过 lsof 查找占用指定端口的进程 PID
    返回 PID 列表
    """
    pids = set()
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().splitlines():
            line = line.strip()
            if line.isdigit():
                pids.add(int(line))
    except Exception:
        pass
    return list(pids)


def find_python_server_pids_windows():
    """
    Windows: 通过 tasklist + wmic 查找运行 server.py 的 Python 进程 PID
    作为端口查找的补充（处理 pythonw.exe 无窗口进程等场景）
    返回 PID 列表
    """
    pids = set()
    for exe_name in ["pythonw.exe", "python.exe"]:
        try:
            result = subprocess.run(
                ["tasklist", "/fi", f"imagename eq {exe_name}", "/fo", "csv", "/nh"],
                capture_output=True, text=True, timeout=10,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            for line in result.stdout.splitlines():
                line = line.strip()
                if not line:
                    continue
                # CSV 格式: "pythonw.exe","12345","Console","1","10,000 K"
                parts = line.split('","')
                if len(parts) >= 2:
                    pid_str = parts[1].strip('"')
                    if not pid_str.isdigit():
                        continue
                    pid = int(pid_str)
                    # 用 wmic 检查命令行是否包含 server.py
                    try:
                        cmd_result = subprocess.run(
                            ["wmic", "process", "where", f"processid={pid}", "get", "commandline"],
                            capture_output=True, text=True, timeout=10,
                            creationflags=subprocess.CREATE_NO_WINDOW
                        )
                        if SERVER_SCRIPT in cmd_result.stdout:
                            pids.add(pid)
                    except Exception:
                        continue
        except Exception:
            continue
    return list(pids)


def find_python_server_pids_unix():
    """
    macOS/Linux: 通过 ps 查找运行 server.py 的 Python 进程 PID
    作为端口查找的补充
    返回 PID 列表
    """
    pids = set()
    try:
        result = subprocess.run(
            ["ps", "aux"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.splitlines():
            if SERVER_SCRIPT in line and ("python" in line.lower()):
                parts = line.split()
                if len(parts) >= 2:
                    pid_str = parts[1]
                    if pid_str.isdigit():
                        pids.add(int(pid_str))
    except Exception:
        pass
    return list(pids)


def kill_process_windows(pid):
    """
    Windows: 终止指定 PID 的进程
    返回是否成功
    """
    try:
        subprocess.run(
            ["taskkill", "/f", "/pid", str(pid)],
            capture_output=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        return True
    except Exception:
        # fallback: 使用 os.kill
        try:
            os.kill(pid, signal.SIGTERM)
            return True
        except Exception:
            return False


def kill_process_unix(pid, force=False):
    """
    macOS/Linux: 终止指定 PID 的进程
    force=True 时发送 SIGKILL，否则先尝试 SIGTERM
    返回是否成功
    """
    try:
        sig = signal.SIGKILL if force else signal.SIGTERM
        os.kill(pid, sig)
        return True
    except ProcessLookupError:
        # 进程已不存在，视为成功
        return True
    except PermissionError:
        # 权限不足，尝试 sudo kill
        try:
            subprocess.run(
                ["sudo", "kill", "-9" if force else "", str(pid)],
                capture_output=True, timeout=10
            )
            return True
        except Exception:
            return False
    except Exception:
        return False


def verify_process_dead(pid, max_wait=3):
    """
    验证进程是否已终止，等待最多 max_wait 秒
    返回是否已终止
    """
    for _ in range(max_wait * 2):
        try:
            if sys.platform == "win32":
                result = subprocess.run(
                    ["tasklist", "/fi", f"pid eq {pid}", "/nh"],
                    capture_output=True, text=True, timeout=5,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
                if str(pid) not in result.stdout:
                    return True
            else:
                os.kill(pid, 0)  # 检查进程是否存在
        except ProcessLookupError:
            return True
        except PermissionError:
            # 进程存在但无权限发送信号，说明还在运行
            pass
        except Exception:
            return True
        time.sleep(0.5)
    return False


def stop_service():
    """主函数：跨平台停止服务"""
    print_header()

    is_windows = sys.platform == "win32"

    # 1. 通过端口查找进程
    if is_windows:
        port_pids = find_pids_by_port_windows(PORT)
    else:
        port_pids = find_pids_by_port_unix(PORT)

    # 2. 通过进程名查找 server.py 进程（补充方式）
    if is_windows:
        script_pids = find_python_server_pids_windows()
    else:
        script_pids = find_python_server_pids_unix()

    # 合并去重
    all_pids = list(set(port_pids + script_pids))

    if not all_pids:
        print("未检测到运行中的服务。")
        print()
        return

    # 3. 终止所有找到的进程
    killed_count = 0
    for pid in all_pids:
        if is_windows:
            success = kill_process_windows(pid)
        else:
            # 先尝试优雅终止
            success = kill_process_unix(pid, force=False)
            if success:
                # 等待进程退出
                if not verify_process_dead(pid, max_wait=3):
                    # 优雅终止失败，强制杀死
                    success = kill_process_unix(pid, force=True)

        if success:
            killed_count += 1
            print(f"  已停止服务进程 (PID: {pid})")
        else:
            print(f"  停止进程失败 (PID: {pid})，请手动终止")

    # 4. 验证端口是否已释放
    time.sleep(1)
    if is_windows:
        remaining = find_pids_by_port_windows(PORT)
    else:
        remaining = find_pids_by_port_unix(PORT)

    if remaining:
        print()
        print(f"  警告: 端口 {PORT} 仍有进程占用 (PID: {', '.join(map(str, remaining))})")
        print(f"  请尝试手动执行: {'taskkill /f /pid <PID>' if is_windows else 'kill -9 <PID>'}")
    else:
        if killed_count > 0:
            print()
            print(f"  服务已停止（共终止 {killed_count} 个进程）。")
        else:
            print()
            print("  未成功终止任何进程。")

    print()


if __name__ == "__main__":
    stop_service()
    # Windows 下暂停以便用户查看输出
    if sys.platform == "win32":
        time.sleep(2)
