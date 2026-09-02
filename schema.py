# schema.py
"""数据契约（pydantic v2）：AnalysisData 是前后端共享的权威结构。

策略：首版重"结构 + 核心字段类型"，对节点的众多次要字段用 extra=allow 容纳，
后续可逐步收紧。preprocess_data.py 末尾用本模块校验输出。
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(extra="allow")


class Meta(_Base):
    lastUpdate: str
    totalProjects: int
    totalClosed: int = 0
    totalPaymentNodes: int


class PmisCost(_Base):
    总预算: Optional[float] = None
    核算: Optional[float] = None
    剩余预算: Optional[float] = None
    消耗比: Optional[float] = None
    项目超支: Optional[bool] = None
    交付超支: Optional[bool] = None
    成本状态: Optional[str] = None


class PmisProgress(_Base):
    完工进展: Optional[float] = None
    里程碑进度状态: Optional[str] = None
    项目阶段: Optional[str] = None
    终验时间: Optional[str] = None
    实际终验时间: Optional[str] = None


class PmisRisk(_Base):
    未关闭风险数: Optional[int] = None
    风险记录数: Optional[int] = None
    最高等级: Optional[str] = None
    闭环率: Optional[float] = None


class PmisStatus(_Base):
    项目状态: Optional[str] = None
    是否暂停: Optional[bool] = None
    评级: Optional[str] = None
    项目级别: Optional[str] = None
    项目类型: Optional[str] = None
    立项日期: Optional[str] = None
    评分: Optional[float] = None
    关键动作: Optional[str] = None
    交付物: Optional[str] = None


class PmisCustomer(_Base):
    最终客户: Optional[str] = None
    合同编号: Optional[str] = None
    签约单位: Optional[str] = None
    行业: Optional[str] = None
    合同总额: Optional[float] = None


class PmisTeam(_Base):
    项目名称: Optional[str] = None
    项目经理: Optional[str] = None
    L4部门: Optional[str] = None
    L3部门: Optional[str] = None
    L3_1部门: Optional[str] = None
    AR: Optional[str] = None
    SR: Optional[str] = None
    CSR: Optional[str] = None
    CDR: Optional[str] = None
    Sponsor: Optional[str] = None


class ProjectPmis(_Base):
    matched: bool = False
    source: str = ""
    cost: PmisCost = PmisCost()
    progress: PmisProgress = PmisProgress()
    risk: PmisRisk = PmisRisk()
    status: PmisStatus = PmisStatus()
    customer: PmisCustomer = PmisCustomer()
    team: PmisTeam = PmisTeam()
    riskRecords: List[Dict[str, Any]] = []


class QualitySummary(_Base):
    pmisProvided: bool = False
    joinRate: float = 0.0
    matchedActive: int = 0
    matchedClosed: int = 0
    unmatched: int = 0
    lastPmisUpdate: str = ''


class DataQuality(_Base):
    summary: QualitySummary
    themes: List[Dict[str, Any]] = []
    unmatched: List[Dict[str, Any]] = []
    backfill: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, Any]] = []
    dirty: List[Dict[str, Any]] = []
    # 有合同却零收款阶段节点的项目。显式声明(而非靠 extra=allow 混进去),
    # 这样前端 gen:types 能生成类型、改名时 typecheck 能找到消费方。
    collectionStagesMissing: Dict[str, Any] = {"count": 0, "items": []}
    # 无合同却有流水的项目。这些被排除出达成率(分子分母须同一集合),
    # 单列出来供业务侧核对:是原项目映射漏了,还是 PMIS 没录合同。
    paymentNoContract: Dict[str, Any] = {"count": 0, "items": []}


class ProjectPayment(_Base):
    relatedNodeCount: int = 0
    expectedTotal: float = 0
    # 【节点已收】。与 PaymentPmis.actualTotal(流水净额,主口径分子)不是一回事:
    # 生产实测两者差 570 万(46.36% vs 47.56%)。2026-08-31 审查从 actualTotal 改名,
    # 就是为了让名字说真话 —— 详见 tests/test_payment_caliber_guard.py。
    nodeActualTotal: float = 0
    remainingTotal: float = 0
    paymentRatio: Optional[float] = None
    delayedCount: int = 0


class DeliveryCostItem(_Base):
    类别: str
    预算金额: Optional[float] = None
    实际发生: Optional[float] = None
    剩余预算: Optional[float] = None
    消耗率: Optional[float] = None


class ProjectHealth(_Base):
    progressAbnormal: bool = False
    riskAbnormal: bool = False
    costAbnormal: bool = False
    paymentAbnormal: bool = False
    overall: str = "健康"


class PaymentNodePmis(_Base):
    stage: str
    category: str = ""
    planDate: str = ""
    actualDate: str = ""
    payRatio: Optional[float] = None
    expectedPayment: float = 0
    receivedAmount: float = 0
    unpaidAmount: float = 0
    actualRatio: Optional[float] = None
    termDays: Optional[int] = None
    payTerm: str = ""
    reached: bool = False
    status: str = ""


class ProjectPaymentPmis(_Base):
    contract: Optional[float] = None
    actualTotal: Optional[float] = None
    paymentCount: int = 0
    expectedTotal: float = 0
    nodeCount: int = 0
    reachedCount: int = 0
    delayedCount: int = 0
    lastPaymentDate: str = ""
    fromOrigin: bool = False


class Project(_Base):
    projectId: str
    projectName: str = ""
    projectManager: str = ""
    orgL4: str = ""
    orgL3_1: str = ""
    合同编号: str = ""
    isPresale: bool = False
    relatedClosedId: str = ""
    payment: ProjectPayment = ProjectPayment()
    deliveryCosts: List[DeliveryCostItem] = []
    overspendAmount: Optional[float] = None   # S2:整体超支金额(元,同源 profit.overspend_amount,可为负=未超支)
    paymentPmis: Optional[ProjectPaymentPmis] = None   # 2A:PMIS 核心回款摘要(售前回退原项目)
    health: ProjectHealth = ProjectHealth()
    top1000: str = "否"        # TOP1000.xlsx:是否 TOP1000 大客户(按最终客户匹配)
    quadrant: str = ""         # TOP1000.xlsx:客户象限(M1/M2/M3/M4),未匹配为空
    customer: str = ""        # 有效客户(单一来源):非售前=本项目最终客户;售前=原项目最终客户,空则项目名解析
    signUnit: str = ""        # 有效签约单位(单一来源):非售前=本项目签约单位;售前=原项目签约单位


class ClosedProjectCloseInfo(_Base):
    关闭时间: Optional[str] = None
    是否正常关闭: Optional[str] = None
    关闭说明: Optional[str] = None
    计划终验时间: Optional[str] = None


class ClosedProject(_Base):
    projectId: str
    projectName: str = ""
    projectManager: str = ""
    orgL4: str = ""
    orgL3_1: str = ""
    合同编号: str = ""
    team: PmisTeam = PmisTeam()
    customer: PmisCustomer = PmisCustomer()
    status: PmisStatus = PmisStatus()
    progress: PmisProgress = PmisProgress()
    cost: PmisCost = PmisCost()
    closeInfo: ClosedProjectCloseInfo = ClosedProjectCloseInfo()


class InputFileStat(_Base):
    provided: bool = False
    rows: int = 0
    matched: int = 0
    matchRate: float = 0.0


class ProjectsQuality(_Base):
    deptProjectCount: int = 0
    orgFile: InputFileStat = InputFileStat()
    mappingFile: InputFileStat = InputFileStat()
    deliveryFile: InputFileStat = InputFileStat()
    milestoneActive: InputFileStat = InputFileStat()
    milestoneClosed: InputFileStat = InputFileStat()
    paymentRecordsFile: InputFileStat = InputFileStat()
    profitDirectFile: InputFileStat = InputFileStat()
    profitBridgeFile: InputFileStat = InputFileStat()
    budgetFile: InputFileStat = InputFileStat()
    collectionStagesFile: InputFileStat = InputFileStat()
    staffNoProject: List[Dict[str, Any]] = []
    managerNotInOrg: List[Dict[str, Any]] = []
    presaleTotal: int = 0
    presaleMapped: int = 0
    presaleUnmapped: List[Dict[str, Any]] = []


class MilestoneItem(_Base):
    name: str
    planDate: str = ""
    actualDate: str = ""
    payStage: str = ""
    payRatio: Optional[float] = None
    pct: Optional[float] = None  # 0-100 原值
    priority: str = "low"  # high | mid | low
    stage: bool = False  # true=阶段验收款项(列38/39派生),供前端换色


class PaymentRecord(_Base):
    type: str = ""
    serial: str = ""
    payer: str = ""
    amount: Optional[float] = None
    date: str = ""
    claimer: str = ""
    orderNo: str = ""
    currency: str = ""
    rate: Optional[float] = None
    note: str = ""
    billType: str = ""
    billDueDate: str = ""
    billProtocol: str = ""


class PaymentRecordsEntry(_Base):
    total: float = 0
    count: int = 0
    lastDate: str = ""
    records: List[PaymentRecord] = []


class ProfitRow(_Base):
    code: str
    name: str
    level: int = 1
    budget: Optional[float] = None
    estimate: Optional[float] = None   # budget_data 概算
    final: Optional[float] = None      # budget_data 核算
    actual: Optional[float] = None
    remaining: Optional[float] = None
    rate: Optional[float] = None


class BridgeProfit(_Base):
    ssId: str = ""
    summary: Dict[str, Optional[float]] = {}
    rows: List[ProfitRow] = []


class ProjectProfit(_Base):
    summary: Dict[str, Optional[float]] = {}
    rows: List[ProfitRow] = []
    bridge: Optional[BridgeProfit] = None


class Event(_Base):
    date: str
    type: str
    domain: str  # project | payment
    projectId: str = ""
    projectName: str = ""
    summary: str = ""
    prev: Optional[Any] = None
    curr: Optional[Any] = None
    amount: Optional[float] = None
    tone: str = ""  # S1: ok | warn | danger | ''(默认走 domain 缺省色)


class PeriodCompareEntry(_Base):
    baseDate: str
    advancedProjects: int = 0
    newDelayedNodes: int = 0
    paymentGained: float = 0
    riskNetChange: int = 0
    newOverspendProjects: int = 0
    paymentRatioChange: Optional[float] = None  # 百分点


class PeriodCompare(_Base):
    lastSync: Optional[PeriodCompareEntry] = None
    lastWeek: Optional[PeriodCompareEntry] = None
    lastMonth: Optional[PeriodCompareEntry] = None


class AnalysisData(_Base):
    meta: Meta
    followupRecords: Dict[str, Any] = {}
    projectPmis: Dict[str, ProjectPmis] = {}
    dataQuality: Optional[DataQuality] = None
    projects: List[Project] = []
    closedProjects: List[ClosedProject] = []
    projectsQuality: Optional[ProjectsQuality] = None
    projectMilestones: Dict[str, List[MilestoneItem]] = {}
    paymentRecords: Dict[str, PaymentRecordsEntry] = {}
    paymentNodes: Dict[str, List[PaymentNodePmis]] = {}   # 2A:PMIS 核心回款逐节点
    projectProfit: Dict[str, ProjectProfit] = {}
    events: List[Event] = []
    periodCompare: Optional[PeriodCompare] = None
    tagSeed: Dict[str, List[str]] = {}


# ── 倚天工时域(V3.0.0):与 AnalysisData 并列的第二个根模型,独立产物 data/yitian_data.json ──

# ── 源表解析就绪度(V4.5.4):把此前的静默降级变成可见指标 ──

class YitianReadinessTop1000(_Base):
    provided: bool                   # 文件是否存在
    rows: int                        # 解析出的客户数
    matchedCustomers: int            # 工时表客户中匹配上清单的个数
    hasQuad: bool                    # 象限列是否解析到值(全空且 rows>0 → False)
    hasBg: bool                      # 市场BG 列同上


class YitianReadinessProductCat(_Base):
    provided: bool
    rows: int                        # 映射条数
    coveredLines: int                # 工时表产品线中被覆盖的个数
    totalLines: int                  # 工时表产品线总数


class YitianReadinessCalib(_Base):
    pending: int                     # 待校准行数(产品线为空/其他 且客户类)
    calibrated: int
    ambiguous: int
    unmatched: int


class YitianReadinessUnattr(_Base):
    rows: int
    hours: float


class YitianReadinessRoster(_Base):
    hasSupColumn: bool               # 组织架构表是否有「直接上级工号」列
    managers: int                    # 派生出的管理干部人数


class YitianReadinessHolidays(_Base):
    provided: bool                   # 文件是否存在
    rows: int                        # 读懂的行数(休+班)。provided=True 而 rows=0
    #                                  ⇒ 文件在但格式没读懂,与「没上传」是两码事,告警文案必须分开


class YitianReadiness(_Base):
    top1000: YitianReadinessTop1000
    productCategory: YitianReadinessProductCat
    calibration: YitianReadinessCalib
    unattributed: YitianReadinessUnattr
    roster: YitianReadinessRoster
    holidays: YitianReadinessHolidays


class YitianMeta(_Base):
    periodStart: Optional[str]      # 可空(无数据行时为 None),但键必须出现
    periodEnd: Optional[str]        # 同上
    generatedAt: str
    rows: int
    employees: int
    droppedRows: int                # 工号不在花名册而被丢弃的行数(治理可见)
    calendarSource: str              # "csv" | "fallback"。注意 fallback 的含义是「**没读到任何
    #                                  休/班行**」,不等于「文件缺失」—— 文件在但表头/格式没读懂
    #                                  时同样是 fallback。要区分原因看 dataReadiness.holidays。
    hoursPerDay: int
    thisBgL2: List[str]              # 本BG销售L2组织(跨BG判定常量,随数据下发)
    storeRows: int                   # 累积库总行数(供 /data 展示"累积了多久")
    storeStart: Optional[str]        # 累积库覆盖区间起(可空,但键必须出现)
    storeEnd: Optional[str]          # 累积库覆盖区间止(同上)
    top1000Named: Dict[str, int]     # 市场BG → 指名的 TOP1000 客户数(清单全量,不随工时变)
    dataReadiness: YitianReadiness   # 源表解析就绪度(V4.5.4),/data 与总览卡消费
    # 必填、非 Optional:它是本期护栏的载体,缺它等于护栏没接上,必须硬失败而非静默默认。


class YitianRosterItem(_Base):
    id: str                          # 工号(大写归一),跨域连接键
    name: str
    l2: str
    l3: str
    l31: str
    l4: str
    category: str
    isMgr: bool                      # 管理干部(由「直接上级工号」派生,V4.5.4)


class YitianDay(_Base):
    d: str
    workday: bool
    isoWeek: str
    calcWeek: str


class YitianDims(_Base):
    types: List[str]
    workTypes: List[str]
    customers: List[str]
    products: List[str]
    productNames: List[str]
    projectTypes: List[str]
    salesL2: List[str]
    serviceModes: List[str]
    custQuads: List[str]             # 客户象限(V4.5.4)
    custBgs: List[str]               # 市场BG(V4.5.4)
    prodCats: List[str]              # 校准后产品大类(V4.5.4)


class YitianEntry(_Base):
    d: str                           # 工作日 YYYY-MM-DD
    e: str                           # 工号 → roster
    t: Optional[int]                 # → dims.types(可空,键必须出现)
    h: float
    wt: Optional[int]                # → dims.workTypes(可空)
    cu: Optional[int]                # → dims.customers(可空)
    pl: Optional[int]                # → dims.products(可空)
    pn: Optional[int]                # → dims.productNames(可空)
    pt: Optional[int]                # → dims.projectTypes(可空)
    sm: Optional[int]                # → dims.serviceModes(可空)
    bg: Optional[int]                # → dims.salesL2(可空)
    wo: str                          # 工单编号
    top: bool                        # 客户 ∈ TOP1000
    ok: int                          # 0 合规 / 1 合规(提示) / 2 问题
    iss: List[str]                   # 问题码
    ct: str                          # 工作成果全文（V4.1.3 起下发供明细页整列展示；此前按隐私裁列、仅问题行带 120 字摘要，用户 2026-07-21 授权开放全文）
    # ── V4.5.4 派生字段 ──
    cq: Optional[int]                # → dims.custQuads 客户象限(可空)
    cbg: Optional[int]               # → dims.custBgs 市场BG(可空)
    el: Optional[int]                # → dims.products 校准后产品线(复用产品线码表,可空)
    ls: int                          # 校准状态 0 raw / 1 calibrated / 2 ambiguous / 3 unmatched
    ec: Optional[int]                # → dims.prodCats 校准后产品大类(可空)
    ch: bool                         # 渠道商可交付
    pm: bool                         # 项目管理工时
    tr: int                          # 可转移五档 0 不可归属 /1 M1M2 /2 项目管理 /3 非渠道 /4 可转移


class YitianIssue(_Base):
    i: int                           # entries 下标
    codes: List[str]
    msgs: List[str]
    snippet: str                     # 工作成果前 120 字(仅问题行)


class YitianData(_Base):
    meta: YitianMeta
    roster: List[YitianRosterItem]
    days: List[YitianDay]
    dims: YitianDims
    entries: List[YitianEntry]
    issues: List[YitianIssue]


def validate_and_write_json(final_data: dict, output_dir: str) -> str:
    """用 AnalysisData 校验 final_data，校验通过后写出 analysis_data.json。
    返回输出文件路径。校验失败抛 pydantic.ValidationError。"""
    AnalysisData.model_validate(final_data)
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, "analysis_data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(final_data, f, ensure_ascii=False, indent=1)
    return out_path


def dump_json_schema(out_path: str) -> None:
    """导出 JSON Schema（供前端 json-schema-to-typescript 生成 TS 类型）。"""
    sch = AnalysisData.model_json_schema()
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(sch, f, ensure_ascii=False, indent=2)


def validate_and_write_yitian_json(data: dict, output_dir: str) -> str:
    """用 YitianData 校验后写出 yitian_data.json。返回输出文件路径。校验失败抛 ValidationError。

    注意:这里**不用** indent(与 analysis_data.json 的写法不同)。倚天 entries 每行 16 个键,
    indent=1 会把每个键各占一行 —— 实测同一份数据 indent=1 是 210KB/周、紧凑是 155KB/周(省 26%)。
    该文件是机器读的(前端 fetch),不需要人眼可读性。"""
    YitianData.model_validate(data)
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, "yitian_data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return out_path


def dump_yitian_schema(out_path: str) -> None:
    """导出倚天域 JSON Schema(供前端 json-schema-to-typescript 生成 TS 类型)。"""
    sch = YitianData.model_json_schema()
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(sch, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    dump_json_schema("schema.json")
    print("[OK] JSON Schema 已写出: schema.json")
    dump_yitian_schema("yitian_schema.json")
    print("[OK] JSON Schema 已写出: yitian_schema.json")
