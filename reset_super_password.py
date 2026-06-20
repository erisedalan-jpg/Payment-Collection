"""部署期账号口令重置助手(纯标准库,复用 auth.py)。

为什么需要它:超级管理员口令**无法经 /admin 界面修改**(update_account 拒改 isSuper),
而源码内置的种子超管口令(_SEED_SUPERS)是弱口令——部署到多用户服务器**上线前必须改掉**。
本脚本直接改 data/accounts.json 中指定账号的 salt+hash,其它字段(权限/显示名)不动。

用法:
    python reset_super_password.py <账号> [新口令]
    # 不传新口令则交互式输入(不回显),推荐:
    python reset_super_password.py admin
"""
from __future__ import annotations

import sys
import getpass
import secrets

import auth


def reset_password(account: str, new_password: str) -> None:
    """重置指定账号口令。账号不存在抛 KeyError;口令非法抛 ValueError。"""
    auth._validate_password(new_password)
    data = auth.load_accounts()
    users = data.get('users', {})
    if account not in users:
        raise KeyError(account)
    salt = secrets.token_hex(16)
    rec = dict(users[account])
    rec['salt'] = salt
    rec['hash'] = auth.hash_password(new_password, salt)
    new_users = dict(users)
    new_users[account] = rec
    data = dict(data)
    data['users'] = new_users
    auth.save_accounts(data)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("用法: python reset_super_password.py <账号> [新口令]")
        return 2
    account = argv[1]
    password = argv[2] if len(argv) > 2 else getpass.getpass(f"为账号 {account} 设置新口令: ")
    try:
        reset_password(account, password)
    except KeyError:
        print(f"账号不存在: {account}")
        return 1
    except ValueError as e:
        print(f"口令无效: {e}")
        return 1
    print(f"已更新账号 {account} 的口令。")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
