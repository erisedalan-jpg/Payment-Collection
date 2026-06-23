# 普通管理员首次登录强制改密 — 设计文档

> 日期：2026-06-23　版本：V1.17.0（新增 /change-password 页 + 自助改密端点 + 强制流转，属整页级 Y）
> 范围：鉴权域单子系统，已上线系统的轻量变更（纯代码 + dist，零数据迁移）。

## 1. 目标与背景

超管在 `/admin` 新建的**普通管理员**（即现有非超管账号，带 `allowedPages`/`allowedL4` 权限）首次登录时，必须先修改密码才能进入系统。超管（`_SEED_SUPERS` 种子账号）不受影响。

威胁模型沿用现状：**前端强制流转 + 后端自助改密端点**，与既有"前端页面门禁 + 后端按 L4 切数据"的折中模型同构，不引入后端硬性门禁。

**已定决策（用户拍板）：**
- 普通管理员 = 现有非超管账号，复用 `/admin` 既有建号流程，只加"首次须改密"。
- 拦截力度 = 前端强制 + 后端自助改密端点（不加后端硬拦）。
- `mustChangePassword` **仅新建时置位**；超管经 `/admin` 重置密码**不**置位。
- 新密码校验 = 长度 1–256 且新≠旧（与现有 `_validate_password` 口径一致，不另加最小长度）。
- AdminView 增轻量状态徽标（首次须改密/已改密）。

## 2. 数据模型（auth.py）— 零迁移

账号记录 `users[account]` 新增布尔字段 `mustChangePassword`。

- `_make_user(password, display_name, is_super=True, pages=None, l4=None, must_change=False)`：新增末位形参 `must_change`，写入 `'mustChangePassword': bool(must_change)`。
- `seed_default_accounts`：调用 `_make_user(..., is_super=True)`，`must_change` 用默认 `False` → **3 个种子超管 flag=False**。
- `create_account`：构造非超管时传 `must_change=True` → **新建普通管理员 flag=True**。
- `update_account`：超管重置密码分支**不触碰** `mustChangePassword` → 重置不强制再改。
- `public_user(account, rec)`：增回 `'mustChangePassword': bool(rec.get('mustChangePassword', False))`。

**向后兼容**：已上线 `accounts.json` 旧记录无此键，`rec.get('mustChangePassword', False)` → `False`，不强制。无需改写 accounts.json、无需重置任何账号。

## 3. 后端自助改密（auth.py + server.py）

### 3.1 auth.py 纯函数 + 封装
- `change_own_password_dict(accounts: dict, account: str, old_password: str, new_password: str) -> dict`（纯函数，仿 `update_account` 风格）：
  - 账号不存在 → 抛 `KeyError(account)`。
  - 旧密码用 `verify_password` 校验失败 → 抛 `ValueError('原密码错误')`。
  - 新密码 `_validate_password`（1–256）；若 `new_password == old_password` → 抛 `ValueError('新密码不能与原密码相同')`。
  - 通过则换新 `salt`（`secrets.token_hex(16)`）+ `hash`，并置 `mustChangePassword=False`；返回新 accounts dict（不可变更新，沿用既有 `dict(...)` 拷贝模式）。
- `change_own_password(account, old_password, new_password) -> dict`（封装，仿 `edit_account`）：在 `_accounts_mutate_lock` 内 `load_accounts` → `change_own_password_dict` → `save_accounts`，返回 `public_user(account, data['users'][account])`。

### 3.2 server.py 端点
- 路由：`do_POST` 增 `elif parsed.path == '/api/account/change-password': self.handle_account_change_password()`。
- 鉴权判断（无需改 `_path_needs_auth`/`_SUPER_ONLY_PATHS`）：
  - `_path_needs_auth('/api/account/change-password')` → 以 `/api/` 起且非豁免 → `True`（需登录会话）。
  - `_authz_gate`：不在 `_SUPER_ONLY_PATHS`、非 `/api/admin/`、非受保护数据 → 放行（任意登录用户可改自己密码）。
- `handle_account_change_password`：
  - 取会话 account：`auth.validate_session(auth.parse_cookie_token(self.headers.get('Cookie')))`；`_auth_gate` 已保证非空，二次取以拿 account。
  - 读 body：`oldPassword` / `newPassword`（缺失视作空串）。
  - 调 `auth.change_own_password(account, old, new)`：
    - `ValueError('原密码错误')` → 401 `ERR_AUTH`。
    - 其它 `ValueError`（新密码不合法/同旧）→ 400 `ERR_VALIDATION`。
    - 成功 → 200 `{success:true, user:<public_user>}`。
  - 当前会话不销毁（用户改完直接进系统）。

## 4. 前端（强制流转）

### 4.1 lib/auth.ts
- `AuthUser` 接口增 `mustChangePassword: boolean`（后端 login/me 已带回）。
- 新增 `changePassword(oldPassword, newPassword): Promise<AuthResult>`：`POST apiUrl('/api/account/change-password')`，`credentials:'same-origin'`，JSON body；成功（`res.ok && data.success`）返回 `{ok:true, user:data.user}`，否则 `{ok:false, message:data.message||'修改失败'}`。

### 4.2 stores/auth.ts
- `mustChangePassword` computed：`user.value?.mustChangePassword === true`。
- 新增 action `changePassword(old, neo)`：调 `lib/auth.changePassword`，成功且带 user 则 `user.value = res.user`（flag 已被后端清零随 public_user 回传）；返回 `AuthResult`。

### 4.3 ChangePasswordView.vue（新建，fullscreen）
- 复用 LoginView 骨架风格（设计令牌，不手写散值；无 emoji）。
- 三字段：原密码 / 新密码 / 确认新密码；前端预校验：三框非空、新=确认、新≠原（与后端一致，前端早提示）。
- 提交调 `auth.changePassword(old, neo)`：成功 `router.push(auth.firstAllowedPath())`；失败显示 `res.message`。
- 顶部文案提示"首次登录请设置新密码"。

### 4.4 路由（router/index.ts）
- 新增路由：`{ path: '/change-password', name: 'change-password', component: ChangePasswordView, meta: { title: '修改密码', fullscreen: true } }`。
- 守卫新增一条，**置于 `if (!auth.isLoggedIn) return {path:'/login'}` 之后、`requiresSuper`/`pageKey` 判断之前**：
  ```ts
  if (auth.user?.mustChangePassword && to.path !== '/change-password') return { path: '/change-password' }
  ```
  未改密用户被锁在改密页；改成功后 flag 清零，放行其它页。`/login`、`/change-password` 自身不受此条阻断（前者在守卫开头已 `return true`，后者命中 `to.path === '/change-password'` 例外）。

### 4.5 LoginView.vue
- `onSubmit` 登录成功后：若 `res.user?.mustChangePassword` → `router.push('/change-password')`；否则 `router.push('/')`（守卫兜底，双保险）。

### 4.6 AdminView.vue（轻量增强）
- 账号列表对非超管账号显示状态徽标：`mustChangePassword` 为真显"首次须改密"（warn 淡底深字），否则显"已改密"（ok 淡底深字）。数据来自 `listAccounts()` 已带回的字段，仅前端展示。
- 建号表单加一行说明文案："新账号首次登录须修改密码"。

## 5. 测试

### pytest（tests/）
- `_make_user`/`create_account`：非超管账号 `mustChangePassword=True`；`seed_default_accounts` 种子超管 `mustChangePassword=False`。
- `public_user` 暴露 `mustChangePassword`。
- `change_own_password_dict`：
  - 账号不存在 → `KeyError`。
  - 旧密码错 → `ValueError('原密码错误')`，记录不变。
  - 新=旧 → `ValueError`，记录不变。
  - 成功 → `mustChangePassword` 清零、salt/hash 变更、新密码可 `verify_password`/`authenticate`，旧密码失效。
- `update_account` 重置密码后 `mustChangePassword` 不变（仍为原值）。

### vitest（frontend/src/）
- store：`login` 后 `mustChangePassword` 反映返回值；`changePassword` 成功后 flag 清零。
- 路由守卫：构造 `mustChangePassword=true` 的登录态，导航任意受保护页 → 重定向 `/change-password`；导航 `/change-password` 自身不被重定向。
- `lib/auth.changePassword`：请求 URL/method/body 正确，成功/失败分支返回结构正确。

## 6. 部署（轻量）

纯代码变更：`auth.py`、`server.py`、前端 `frontend/dist` 重建（含 /pm 版另出）。无数据迁移、无账号重置。上线步骤 = 替换代码 + dist + `systemctl restart pmplatform`（同 `deploy/部署-Ubuntu24-端口80-pm.md`）。

已上线 `accounts.json` 中的 3 个种子超管与任何既存账号：因 `mustChangePassword` 缺省按 `False` 处理，行为不变；升级后由超管**新建**的普通管理员才进入"首次须改密"。

## 7. 验证

`bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）；并手动启动一次走通：新建普通管理员 → 用初始密码登录 → 被锁到改密页 → 改密 → 进入其授权页；超管登录不受影响。

## 8. 非目标（YAGNI）

- 不做后端硬性门禁（未改密前 403 拦截其它端点）。
- 不做密码复杂度策略（大小写/特殊字符）/历史密码/有效期。
- 不做超管自助改密专用入口（超管经种子/现有手段管理）；本端点理论上任意登录用户可用，但本期 UI 仅在"首次须改密"场景触发。
