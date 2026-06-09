# S1 — 双域数据地基与治理层(回款域 + 项目域)设计(Design)

> 设计文档(harness: Design)。基于 2026-06-09 对 `input/` 全量数据的两轮普查(见 `docs/superpowers/research/2026-06-09-data-census-report.md`、`...-data.json`、`...-unmatched-166.xlsx`)与现有管线探查。
> 这是"回款工具 → 项目集管理平台"演进的第一个子项目 S1,目标是**双域数据地基**。后续 P(项目域看板)、S2(回款×项目详情)、S3(多角色看板)各自独立 spec。

## 背景

现工具只有"回款"单视角。引入 PMIS(项目中心 / 项目基础信息 / 项目状态信息 / 项目风险)的在建 + 已关闭导出后,数据呈现**两个天然的域**:

| 数据域 | 规模 | 粒度 | 来源 | 性质 | 字段成色 |
|---|---|---|---|---|---|
| **回款域** | 628 项目 / 955 节点 | 节点级 | 交付中心 / WPS | 操作型(现金) | 高(自成闭环) |
| **项目域·在建** | 911 项目 | 项目级 | PMIS 在建三表 + 风险表 | 运营型(进行中) | 半满 40~52% |
| **项目域·已关闭** | ~4772 项目 | 项目级 | PMIS 已关闭三表 | 历史(本期仅作回款补充) | 较满 68~77% |

普查与对抗核验已确证的事实:

- 回款数据**自成闭环**(上游云文档已合并三张分层清单为单张"项目回款节点(里程碑)清单",`preprocess_data.py` 已用之;回款比例 >1、金额/日期解析均已处理且有单测)。**S1 不重做这些。**
- 回款项目 ∩ PMIS:仅在建 **462/628(73%)**;加上已关闭后 **620/628(98%)**;仍未匹配仅 **8 个,全为售前(SF)**,属可接受残差(售前阶段 PMIS 不一定建项)。手工抽样证实未匹配主因是"项目已关闭、不在在建导出里"。
- 成本健康度可由 100% 填充的预算字段**自算**(核验 [剩余=总预算−核算] 100% 吻合、[消耗比=核算/总预算] 97.4% 吻合)。
- 风险记录 ∩ 回款仅 44/628;项目级风险评级几乎全空 → 风险短期只做台账。
- 同名列口径冲突多;"项目金额"在项目状态信息中不存在(其金额列是项目总预算),**跨表不可相加**。

## 已确认的产品决策(来自 brainstorm)

1. **一个工具、两个顶层区**:并列"回款"与"项目管理",共享外壳/主题/登录,按 `projectId` 交叉下钻。
2. **项目详情下钻以 PMIS 数据为主、回款信息为辅**。
3. **本期不做历史分析**:已关闭 PMIS 数据**仅作为回款数据的补充查找**(覆盖"项目已关闭但未回款"的约 158 个),**不做 4772 个的历史看板**;已关闭表按回款 projectId 过滤后入库,不全量加载。

## S1 目标与范围

**目标:建立双域数据地基——摄取回款(现有)+ PMIS(在建全量 + 已关闭按回款过滤)→ 干净的双域数据模型 + 按 projectId 交叉链接 + 维度入库(`projectPmis`)+ 一个"数据质量"治理视图(覆盖率记分卡 + 未匹配/回填清单 + 冲突/脏值告警,可导出)。**

做:
- 在线(用户在数据管理页录入下载链接,工具下载到本地)+ 离线(手动放置)两种方式获取 PMIS 七个文件到本地。
- 解析 → 按 projectId join → 自算派生 → 维度入库 `projectPmis`(在建 911 + 已关闭∩回款 ~158)。
- 计算数据质量并入库 `dataQuality`;前端新增「数据质量」视图与导出。

不做(留给后续子项目):
- **项目域看板**(在建 911 的交付/成本/风险运营看板)= 独立子项目 P,不在 S1。
- **回款/业务看板内展示**成本/进度/风险维度、PMIS-主的项目详情抽屉 = S2。
- 多主题 tab、多角色看板 = S3。
- **历史分析**(已关闭 4772 的趋势/复盘/基准)= 暂不做。
- **SF↔SS 映射 / 模糊匹配**:只输出 8 个未匹配清单,补全方式由用户后续定。
- 回款节点合并去重(上游已合并)。

## 架构选择

**方案 A(采用):PMIS 作为独立摄取模块,在 preprocess 阶段 join。** 新建 `pmis.py` 把七个文件解析为 projectId 维度字典;`preprocess_data.py` join 进现有项目/节点,产出 `projectPmis` + `dataQuality`。
- 不选 B(把 PMIS 塞进 WPS 的 sheet-json 管线):PMIS 是项目级、形状不同,塞进面向节点的 `load_sheet` 别扭。
- 不选 C(独立一次性脚本):用户要"入库",已排除。

## 数据流

```
[在线] 数据管理页录入下载链接 → server 下载端点(SSE进度) → input/pmis/*.xlsx ┐
[离线] 手动放置                                          → input/pmis/*.xlsx ┤
                                                                            │
WPS同步/离线导入 → yundocs_data/*.json ─┐                                      │
                                       ├──────── preprocess_data.py ◄────────┘
                       input/pmis/*.xlsx┘    ├ pmis.py 解析七表(纯函数,可测)
                                            ├ 在建全量(911) + 已关闭∩回款(~158) 取并
                                            ├ 按 projectId join 到项目/节点
                                            ├ 自算派生(消耗比/超支标记/风险聚合)
                                            ├ 算 dataQuality(覆盖率/未匹配/回填/冲突/脏值)
                                            v
                                 data/analysis_data.json
                                   + projectPmis{}   projectId → 成本/进度/风险/状态/客户维度
                                   + dataQuality{}   质量指标 + 未匹配 + 回填 + 告警
                                            v
                       schema.py → schema.json → frontend/src/types/analysis.ts
                                            v
                          前端新增「数据质量」视图(记分卡 + 清单 + 导出)
```

## 组件与文件

PMIS 七个文件(在建 4 + 已关闭 3;风险无已关闭变体):
`项目中心.xlsx`、`项目基础信息数据.xlsx`、`项目状态信息数据.xlsx`、`项目风险数据.xlsx`、`项目中心-已关闭.xlsx`、`项目基础信息数据-已关闭.xlsx`、`项目状态信息数据-已关闭.xlsx`。表头均在第 2 行。

后端新增:
- `pmis.py` — 摄取与 join 核心(纯函数为主:解析、join、派生、质量计算)。读 `input/pmis/` 下七个固定文件名(config 配)。**已关闭三表先按回款 projectId 集合过滤再入内存**(避免加载 4772 行)。**PMIS 缺失要优雅降级**(空维度 + `pmisProvided=false`),不抛错、不阻断回款主流程。
- `pmis_download.py` — 在线下载:按持久化链接把七个文件下载到 `input/pmis/`,带 `[INFO]/[OK]/[ERROR]` 进度标记。**frozen/dev 双路径同时维护**(开发 subprocess / 打包进程内;路径基于 `sys._MEIPASS` 与 `sys.executable` 目录)。
- `data/pmis_links.json` — 七个下载链接 + 上次下载时间(沿用 `followup_records.json` 的本地 json 持久化模式)。

后端修改:
- `preprocess_data.py` — 调 `pmis.py`,join 到现有项目/节点(键 `projectId`),写 `projectPmis` 与 `dataQuality`。
- `schema.py` — 新增 `ProjectPmis`、`DataQuality` 及子模型;`AnalysisData` 增 `projectPmis`、`dataQuality` 顶层字段(默认空,向后兼容)。改完跑 `npm run gen:types`。
- `server.py` — 新增 PMIS 在线下载端点(SSE 进度)+ 链接读写端点。下载与文件路径逻辑**frozen/dev 两条分支都改**。
- `config.py` — 新增 `PMIS_DIR`(默认 `input/pmis/`)与七个固定文件名常量。

前端新增/修改:
- `frontend/src/views/DataQualityView.vue` + 路由 + nav 项。
- 数据管理页新增"PMIS 数据"区块:七个链接录入/保存 + "下载并刷新 PMIS"按钮(SSE 进度,符合"云同步必须有明确进度反馈")。
- 导出工具:未匹配/回填清单导出 CSV 或 xlsx(复用 `lib/xlsx`)。
- `frontend/src/types/analysis.ts` 由 `gen:types` 重新生成;data store 读取新顶层字段。

## 数据模型(schema.py)

`projectPmis`:map,键 `projectId`,覆盖 **在建 911 + 已关闭∩回款 ~158**,值:
- `matched: bool`、`source: str`(在建/已关闭/未命中)
- `cost`:`总预算`、`核算`、`剩余预算`、`消耗比`(自算=核算/总预算,总预算 0 时 None)、`超支: bool|None`(任一超支布尔=是)、`成本状态`(权威源=项目状态信息),均 `float|str|None`
- `progress`:`完工进展: float|None`(% 文本解析为 0-1)、`里程碑进度状态`、`项目阶段`、`计划终验`(YYYY-MM-DD)
- `risk`:`未关闭风险数: int|None`、`风险记录数: int|None`(按 projectId 聚合风险表)、`最高等级`(高/中/低)、`闭环率: float|None`
- `status`:`项目状态`、`是否暂停: bool|None`、`评级`、`评分: float|None`
- `customer`:`最终客户`、`合同编号`、`签约形式`、`行业`、`合同总额: float|None`

**每个字段可空,缺即 None——只放、不猜。** 同名冲突按普查处置建议指定权威源(成本状态/成本数值→项目状态信息;客户/签约→优先验收回款条件收集表)。`projectPmis` 同时服务两边:后续 P(项目域看板)消费 911,S2(回款详情 PMIS-主)按 projectId 查。

`dataQuality`:
- `summary`:`pmisProvided: bool`、`lastPmisUpdate`、`joinRate`(0.98)、`matchedActive`(462)、`matchedClosed`(158)、`unmatched`(8)
- `themes`:[`{theme, verdict(green/yellow/red), coveragePct, fields:[{field, fillPct}]}`](回款/成本预算/风险/交付进度/客户合同)
- `unmatched`:[`{projectId, projectName, kind}`](8 个 SF,可导出)
- `backfill`:[`{projectId, projectName, missingFields:[str]}`](在建项目缺完工进展/成本状态/项目阶段/评级等,可导出)
- `conflicts`:[`{column, sheets, issue, recommendation}`](承接普查冲突清单)
- `dirty`:[`{type, projectId, field, value}`](回款比例>1、签约单位脏值"无T1-最终用户直签"/#N/A/0)

## 派生计算口径(纯函数,先测)

- `消耗比 = 核算 / 总预算`(总预算>0 才算)——核验 97.4% 吻合,自算,不依赖只填 46% 的成本状态列。
- `超支 = 任一(是否人工/直接/各部门成本超支)== 是`。
- `风险聚合`:按 projectId 聚合风险表 → 记录数、最高等级(高>中>低)、闭环率(已关闭/全部)。
- `完工进展`:含 % 文本解析为 0-1,>1 告警。
- join 键 `projectId`;先并集"在建∪(已关闭∩回款)"再 join;命中标 `matched`,回款侧未命中进 `unmatched`(按 `-SF-`/`-SS-` 前缀分 kind)。

## 前端「数据质量」视图

- 顶部**记分卡**:五主题覆盖率红黄绿 + join 率(98%) + "PMIS 已提供 / 上次更新时间"。PMIS 未提供时整页引导(去数据管理页下载或放置)。
- **未匹配清单**(可导出)、**回填待办**(按项目缺哪些字段,可导出)、**口径冲突 / 脏值告警**(只读折叠)。
- 复用现有 token/暗色/三档字号;补 CSS 不引框架;符号用 `→ ↓ ❌ ✕ ▾`,不用 emoji。

## 测试(TDD)

- `tests/test_pmis.py`:七表解析;join(在建 462 / 已关闭 158 / 未匹配 8 计数与分类);派生(消耗比/超支/风险聚合);质量(覆盖率/回填/脏值);已关闭按回款过滤;PMIS 缺失优雅降级。
- `tests/test_schema.py`:补 `projectPmis`/`dataQuality` 校验;旧数据(无新字段)仍通过。
- 前端 `*.test.ts`:DataQualityView 渲染、导出工具、PMIS 未提供空态。
- 改 `preprocess_data.py` 计算逻辑 → 先补/改测试再改实现。

## 验证与完成定义

- `bash verify.sh` 全绿。
- 手动:放入 PMIS 七表跑一次 → 数据质量视图加载,join 约 98%,未匹配 8,记分卡正确,导出可用;不放 PMIS 时优雅降级、回款主流程不受影响。
- `PROGRESS.md` 更新。

## 后续路线(本 spec 之外)

- **P 项目域看板**:在建 911 的交付/成本/风险运营看板 + 新顶层区。
- **S2**:回款×项目详情(PMIS-主、回款-辅的项目详情抽屉)。
- **S3**:多角色/多主题看板。

## 约定遵守

- 不使用 emoji;符号用 `→ ↓ ❌ ✕ ▾`。跟进术语用"邮件推动"。
- 样式以补 CSS / token 完善,不引框架。
- **frozen / dev 两条路径同时维护**(下载、文件读写、脚本调用)。
- **禁止 `git add -A` / `git add .`**;只 add 指定文件(`input/`、`data/` 为生成数据,绝不提交)。
- 一次只做一个子项目;独立分支 + subagent 执行 + 两段式审查 + 本地 merge。
