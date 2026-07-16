# 倚天工时合规规则前端可配置 — 设计规格

> 状态：设计已与用户逐项确认（brainstorm 六问），待用户复核本 spec 后转 writing-plans。
> 分支：master（倚天域仅存于 master）。日期：2026-07-16。

## 1. 目标

把倚天工时「问题工时」的合规判定规则从**代码内置常量**（`yitian_rules.py`）提升为**超管在 `/data` 页可视化配置**的数据。支持页内结构化编辑、JSON/Excel 双通道导入导出、下载默认模板、恢复默认；每个检查项可单独启用/停用。保存后**后端立即重算**、刷新 `yitian_data.json`，无需重跑整条数据管线。

## 2. 已确认决策（brainstorm 结论）

1. **配置范围 = 全部三组**：A 基础项 + B 类型一致性 + C 产品类别关键词表。`ISSUE_LABELS`（问题码→中文标签）**保持内置、不可配**。
2. **生效时机 = 保存即后端重算**：复用现成 `_rebuild_yitian_data`（读累积库 `yitian_store` + join `组织架构.xlsx` 花名册 → 重跑 `build_yitian_data` → 写 `yitian_data.json`），秒级，不重新导入工时、不跑主管线。
3. **导入格式 = JSON + Excel 双通道**：服务不同水平管理员。后端**只认 JSON 一套校验**（唯一权威）；**Excel ↔ JSON 转换在前端**（复用现有 xlsx 库）；两种导入最终都提交同一份 JSON 给后端。
4. **页内编辑 = 三组全结构化编辑器** + JSON/Excel 导入导出。
5. **每检查项带启用/停用开关**：7 类检查 + 1 类提示可整项停用而不删其关键词表；停用的检查不产码。

按默认拍板（用户已认可、未否决）：① 配置独立存 `data/yitian_rules.json`（不并入 `yitian_settings.json`）；② 后端只认 JSON、Excel 转换在前端；③ 导入 = 整份替换 + 预览确认；④ 超管专属 + 写操作审计。

## 3. 架构与数据流

```
data/yitian_rules.json (新配置文件, 超管可改, gitignore)      yitian_rules.py (保留=默认基线常量)
        │ 缺失/损坏→回落默认                                         │ default_config() 由常量装配(单一默认来源)
        ▼                                                            ▼
yitian_rules_config.py (新模块: default_config / validate_config / load_config / save_config, 原子读写, 仿 yitian_settings.py)
        │ cfg
        ▼
yitian_check.check_row(row, peer, cfg)      ← 由读模块常量 R.XXX 改为读 cfg;每检查项先看 cfg["checks"][x]["enabled"]
        ▲ cfg
yitian.build_yitian_data(base_dir, store=None, rules_cfg=None)   ← 新增 rules_cfg 形参;None 则 load_config(disk) 或默认
        ▲ 保存规则时复用
server.py  GET/POST /api/yitian/rules (超管专属 + 审计) → 校验 → 先算通(内存 build+schema) → 落 yitian_rules.json + yitian_data.json → 回问题数
        ▲ fetch
前端 /data「合规规则配置」卡 YitianRulesCard.vue (超管) : 三组结构化编辑 + 启用开关 + JSON/Excel 导入导出 + 下载默认模板 + 恢复默认 + 保存
```

**默认值单一来源**：仍是 `yitian_rules.py` 的现有常量；`yitian_rules_config.default_config()` 由这些常量**装配**成默认配置 dict，**不重复维护第二份默认**。「恢复默认」= 回落这套内置基线。

## 4. 配置 schema（JSON，同时是导出/模板结构）

```jsonc
{
  "version": 1,
  "checkedTypes": ["项目类", "售前类", "售后类"],          // 哪些工时类型进检查(其余直接合规)
  "checks": {
    "summary":     { "enabled": true, "keywords": ["工作概述","工作概况","工作总结","工作汇报","工作总述","工作述职"] },
    "progress":    { "enabled": true, "keywords": ["工作进展","工作进度","工作内容","进展情况","进行的工作","今日工作","工资进展","工资进度","工作已进","已完成工作","工作完成情况","工作当前","用时"] },
    "next":        { "enabled": true, "keywords": ["下一步工作计划","下一步计划","下一步工作","下一步","后续计划","明日计划","工作计划","下步计划","下步工作","后续工作","之后计划","下期计划"] },
    "serviceMode": { "enabled": true, "effectiveDate": "2026-05-09" },   // 早于此日的记录豁免(不追溯)
    "typeMismatch":{ "enabled": true, "rules": {
        "售前类": [["正式上线","项目类"],["割接上线","项目类"],["生产上线","项目类"],["生产环境部署","项目类"],["项目验收","项目类"],["系统验收","项目类"],["初验","项目类"],["终验","项目类"],["验收报告","项目类"],["投标书","业务类"],["标书制作","业务类"],["招标文件","业务类"]],
        "售后类": [["方案演示","售前类"],["产品演示","售前类"],["需求调研","售前类"],["实施部署","项目类"],["安装部署","项目类"],["项目实施","项目类"],["项目验收","项目类"],["系统验收","项目类"],["验收报告","项目类"],["投标","业务类"],["标书","业务类"]] } },
    "product":     { "enabled": true,
        "lineKeywords": [
          { "linePatterns": ["NGSOC"], "keywords": ["SOC","AISOC","NGSOC","SOAR","SIEM","告警","解析","解析规则","传感器","探针"] }
          /* …其余 25 条产品线,默认取自 yitian_rules.PRODUCT_LINE_KEYWORDS 全量 */
        ],
        "nameKeywords": [
          { "namePatterns": ["奇安信网神SSL编排控制网关系统V6.0"], "keywords": ["流量编排","SSLO","sslo","加解密"] },
          { "namePatterns": ["网神工业控制安全网关系统V4.0"], "keywords": ["防火墙","工业","工业安全监测","网闸"] }
        ],
        "exclusiveKws": ["组件","租户"] },
    "customer":    { "enabled": true, "hintKeywords": ["客户","用户","甲方","业主"] },
    "presaleProductHint": { "enabled": true, "skipWorkTypes": ["文档编写与汇报","项目管理","项目验收"] }
  }
}
```

**关键转换**：必填三段（summary/progress/next）现为正则 `(a|b|c)`（`SUMMARY_RE`/`PROGRESS_RE`/`NEXT_RE`），改存**关键词列表**，`check_row` 判定时以 `re.escape` 后拼成 `(a|b|c)` 大小写不敏感匹配 —— UI 变简单列表、**匹配行为不变**（默认词表与现正则的分支一一对应）。`customer.hintKeywords` 同理由 `CUSTOMER_HINT_RE` 拆成列表。

`ISSUE_LABELS` 与 `HINT_PREFIX`/`SNIPPET_MAX` 不进配置，仍在 `yitian_rules.py`；某检查 `enabled:false` 时其码永不产出，标签自然不出现。

`corrected_work_type`（项目类型含「售前服务」→ 强制项目类）保持内置、不可配（属数据校正、非合规规则）。

## 5. 后端组件

### 5.1 `yitian_rules_config.py`（新，纯函数 + 原子读写，仿 `yitian_settings.py`）
- `default_config() -> dict`：由 `yitian_rules` 常量装配成 §4 结构（含各 `enabled:true`）。默认单一来源。
- `validate_config(cfg) -> dict`：严格校验并归一化，非法抛 `ValueError`；缺键回落对应默认段。规则：
  - 顶层须 dict；`version` 为 int（缺则补 1）。
  - `checkedTypes`：字符串数组、strip/去空/去重保序、每项 ≤ 20 字、总数 ≤ 20。
  - `checks` 为 dict，只认已知键（未知键忽略）；每检查段须含 `enabled`(bool)。
  - 关键词类字段（keywords/hintKeywords/skipWorkTypes/exclusiveKws）：字符串数组、strip/去空/去重、单项长度与总数上限（防呆）。
  - `serviceMode.effectiveDate`：`YYYY-MM-DD` 字符串（正则校验），非法抛错。
  - `typeMismatch.rules`：dict，值为 `[[禁止词, 应归属类型], ...]`，每对两个非空字符串。
  - `product.lineKeywords`/`nameKeywords`：`[{linePatterns/namePatterns:[str], keywords:[str]}]`，patterns 与 keywords 均非空数组。
- `load_config(path) -> dict`：读→`validate_config`；缺失/损坏/非法 → 静默回落 `default_config()`（降级不阻断）。
- `save_config(path, cfg) -> dict`：`validate_config` 后原子写（`.tmp`→`os.replace`），返回落盘配置。

### 5.2 `yitian_check.py` 重构（判定读 cfg）
- `check_row(row, peer, cfg)`：签名加 `cfg`。所有 `R.XXX` 常量读取改为读 `cfg`：
  - `cfg["checkedTypes"]` 门；六检查各自 `if not cfg["checks"][k]["enabled"]: skip`。
  - 必填三段用 `cfg["checks"][{summary,progress,next}]["keywords"]` 拼正则。
  - 服务方式用 `serviceMode.effectiveDate`。类型一致性用 `typeMismatch.rules`。产品用 `product.*`。客户用 `customer.hintKeywords`。售前提示用 `presaleProductHint.skipWorkTypes` + `product_line == "其他"`。
- `_check_product(row, peer, cfg)`：`PRODUCT_LINE_KEYWORDS`/`PRODUCT_NAME_KEYWORDS`/`EXCLUSIVE_KWS` 改读 cfg；`_ALL_LINE_KWS`（他家产品词全集）由「模块级常量」改为**按 cfg 现算**（每次 build 从 cfg 装配一次，避免 import 期固化）。
- `ok_of(codes)` 不变（HINT 前缀逻辑）；`peer_contents`/`corrected_work_type` 不变。
- `yitian_rules.py` 常量**保留**（作默认来源），本模块不再直接引用其规则常量做判定（仅 `HINT_PREFIX` 等非规则常量仍可引用）。

### 5.3 `yitian.py`：`build_yitian_data(base_dir, store=None, rules_cfg=None)`
- 新增 `rules_cfg` 形参：`None` → `yitian_rules_config.load_config(<data/yitian_rules.json>)`（内部回落默认）；非 None → 直接用（供保存时「先算通再落盘」传内存 cfg）。
- 载入后传给逐行 `check_row(r, peer, cfg)`。其余不变。

### 5.4 `server.py`：`/api/yitian/rules` 端点 + 门禁 + 审计
- 常量：`YITIAN_RULES_FILE = os.path.join(BASE_DIR, 'data', 'yitian_rules.json')`；`_yitian_rules_lock = threading.RLock()`。
- 路由：GET → `handle_yitian_rules_get`；POST → `handle_yitian_rules_save`。
- **门禁**：`/api/yitian/rules` 加入 `_SUPER_ONLY_PATHS`（按 path 匹配、GET+POST 均超管专属）。唯一消费方是超管 `/data` 卡，合规页不依赖它（页面读 `yitian_data.json` 里已烘焙的 ok/codes/labels），故整路径超管化安全。
- `handle_yitian_rules_get`：`_require_super()` → 返回 `{"success":True, "rules": yitian_rules_config.load_config(YITIAN_RULES_FILE)}`。
- `handle_yitian_rules_save`（**先算通再落盘**，沿用 `_rebuild_yitian_data` 的 I-2 不变式）：
  1. `_require_super()`；`body = _read_json_body()`（非法 JSON → 400）。
  2. `cfg = yitian_rules_config.validate_config(body)`（`ValueError` → 400，附字段错因）。
  3. 加 `_yitian_rules_lock`：`store = yitian_store.load_store(YITIAN_STORE_FILE)`；`data = yitian.build_yitian_data(BASE_DIR, store=store, rules_cfg=cfg)`（**内存跑通 build + schema 校验**，此步不落盘）。任一异常 → 500「规则未生效，配置与下发数据均未变更」。
  4. 跑通后才落盘：`yitian_rules_config.save_config(YITIAN_RULES_FILE, cfg)` → 写 `yitian_data.json`（`data is None`＝累积库空则删该文件）+ 清 `_yitian_cache`（复用 `_rebuild_yitian_data` 的写/清缓存逻辑，可将其扩展为 `_rebuild_yitian_data(store, rules_cfg=None)` 并在本 handler 内按上述顺序调用）。
  5. `_audit_set(target='倚天合规规则', detail=...)`（如「保存合规规则；停用: 产品类别」）。
  6. 返回 `{"success":True, "rules":cfg, "problemCount": data 中 ok==2 计数(累积库空则 0)}`。
- 缺 `data/yitian_rules.json` 时 GET 返回默认（`load_config` 回落）；build 侧同样回落默认——**存量部署无该文件也开箱即用，口径 == 旧硬编码**。

## 6. 前端组件

### 6.1 `frontend/src/lib/yitian/rulesConfig.ts`（纯逻辑）
- 类型：`YitianRulesConfig`（与 §4 对应）。
- `configToWorkbook(cfg)` / `workbookToConfig(wb)`：JSON ↔ Excel（xlsx 库）双向转换，多值单元格用 `、` 分隔、行增删。
- `downloadJson(cfg)` / `downloadXlsx(cfg)` / `downloadDefaultTemplate()`（默认模板 = 后端默认，前端可从 GET 到的默认或内置一份常量装配；**以后端 GET 的默认为准**避免双源）。
- `parseImport(file)`：按扩展名 `.json`/`.xlsx` 分流 → 统一产出 `YitianRulesConfig`（前端仅做结构解析，**合法性以后端 validate 为准**）。

### 6.2 `frontend/src/lib/yitianRulesApi.ts`
- `getRules(): Promise<YitianRulesConfig>` → GET `/api/yitian/rules`。
- `saveRules(cfg): Promise<{rules, problemCount}>` → POST `/api/yitian/rules`（失败抛后端错因）。

### 6.3 `frontend/src/components/YitianRulesCard.vue`（/data，超管）
- 与 `YitianScopeCard` 同权限（`auth.isSuper`）、同区域摆放（倚天工时域分组内）。
- 三段结构化编辑器：
  - **基础项**：checkedTypes 标签增删；serviceMode 生效日 `el-date-picker` + 启用开关；customer.hintKeywords、presaleProductHint.skipWorkTypes 标签增删 + 各启用开关。
  - **必填 & 类型一致性**：summary/progress/next 三关键词列表编辑 + 各启用开关；typeMismatch 表格（工时类型 / 禁止词 / 应归属类型）行增删 + 启用开关。
  - **产品类别**：lineKeywords 表（产品线匹配词[多] / 合法关键词[多]）、nameKeywords 表、exclusiveKws 标签，行增删 + 启用开关。
- 工具条：导入(JSON/Excel) · 导出(JSON/Excel) · 下载默认模板 · 恢复默认 · **保存**。
- 交互：导入 → 前端解析 → **预览确认对话框**（展示将整份替换）→ 用户确认后写入编辑区（尚未提交后端）。保存 → `saveRules` → 成功 toast「已重算，问题工时 N 条」→ 触发倚天数据 store 失效/重取（合规页再进即见新结果）。校验失败 → 就地报错、编辑区不变。恢复默认 → 二次确认 → 载入后端默认到编辑区。
- 未保存改动离开提示（可选，`YitianScopeCard` 若无则不引入，保持一致）。

### 6.4 `frontend/src/views/DataView.vue` 接线
在倚天工时域分组内、`YitianScopeCard` 旁挂 `YitianRulesCard`（超管 `v-if="auth.isSuper"`）。

## 7. Excel 模板布局（一个工作簿多 sheet，多值单元格 `、` 分隔）

| Sheet | 列 |
|---|---|
| `基础与开关` | 检查项 / 启用(是·否) / 参数（serviceMode 生效日、checkedTypes、客户提示词、售前跳过类型分行或分列） |
| `必填三段` | 检查项(概述/进展/下一步) / 启用(是·否) / 关键词 |
| `类型一致性` | 工时类型 / 禁止词 / 应归属类型（该组启用状态单独一行在 `基础与开关`） |
| `产品线关键词` | 产品线匹配词 / 合法关键词 |
| `产品名称复核` | 产品名称匹配词 / 合法关键词 |

导入读全部存在的 sheet 组装整份配置；缺某 sheet → 该段回落默认（与 JSON 缺键一致）。精确列名/合并方式在 writing-plans 定稿。

## 8. 生效流程 / 校验 / 边界

- **保存 = 校验 → 内存跑通 build+schema（新规则）→ 落 `yitian_rules.json` + `yitian_data.json` → 清缓存 → 回问题数**。「先算通再落盘」：任一步失败，两文件都不动，返回 500。
- **导入 = 整份替换 + 预览确认**；后端 `validate_config` 失败 **整份拒绝** 并提示错因，绝不半份落库。
- 超管专属（`_SUPER_ONLY_PATHS` + handler `_require_super`）；保存写审计（改合规口径属治理级动作）。
- 配置文件缺/坏 → 静默回落默认，与 `yitian_settings` 一致。
- 单线程 `HTTPServer`：保存期间重建短暂阻塞全站（累积库通常数千行、`check_row` 为正则，秒级，可接受）；前端保存按钮 loading。
- L4 数据隔离不变：`yitian_data` 下发仍经 `data_scope.scope_yitian_data` 按 allowedL4 切分；本功能不改切分。

## 9. 测试

- **后端回归安全网（最重要）**：新增测试断言「`default_config()` 装配出的 cfg 喂 `check_row` == 旧硬编码 `check_row` 行为」——构造一组覆盖全部检查类型（缺三段/服务方式/类型一致/产品/客户/售前提示）的样本行，逐行对拍 codes/ok 完全一致，证明重构零口径漂移。可保留一份重构前的 `check_row` 快照或对拍旧常量装配结果。
- `yitian_rules_config`：default/validate/save/load 往返；非法（错日期、非数组、空对、超长）拒绝；缺键回落默认。
- `yitian_check` 参数化：同一行在「默认 cfg」vs「改词表 / 停用某检查」下产码差异符合预期；停用检查 → 该码消失；`enabled:false` 的必填检查不再把每行判缺失。
- `server` 端点：`/api/yitian/rules` GET/POST 超管放行、非超管 403/401；保存后 `yitian_data.json` 重算（问题数随规则变）；非法 body 400 且文件未变；build 失败时 rules 文件与 yitian_data 均未变（500）。
- 前端：`rulesConfig` JSON↔Excel 往返一致、默认模板生成、`.json`/`.xlsx` 解析、非法导入提示；`YitianRulesCard` 编辑/开关/导入预览/保存/恢复默认交互；`yitianRulesApi` 请求形状。

## 10. 交付属性

- **非纯前端**：改 `yitian_check.py`/`yitian.py` + 新 `yitian_rules_config.py` + `server.py` 新端点 → **升级须换 dist + 覆盖上述后端文件 + 重启后端**。
- **无需点「更新数据」**（本配置域保存即重算）。
- **无新页面/路由/pageKey/授权**（`/data` 内新卡、超管专属，复用 `data` pageKey）。
- 新增 `data/yitian_rules.json` 须进 `.gitignore`（含业务口径配置，同其他 `data/*.json`）。
- 版本：建议 **Y 级**（新增可配置子系统 + 后端判定引擎重构）；X 级才须用户钦定，Y/Z 由实现定，本 spec 记 Y。

## 11. 不在本次范围（YAGNI）

- `ISSUE_LABELS`（码→中文）可配、自定义新增检查类型、正则自由填写（只开关键词列表，不放开裸正则以防注入/误配）。
- 配置版本历史/回滚（保存即覆盖；如需可后续接入 `data_history` 类机制，本次不做）。
- 跨 BG（`THIS_BG_L2_ORGS`）等**非问题判定**用途的常量不纳入本配置（不属「问题工时」判定链）。
- 合规检查范围 `excludedTypes`（已在 `yitian_settings`，独立卡，不合并）。
```
