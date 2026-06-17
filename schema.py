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
    totalPaymentNodes: int


class RawNode(_Base):
    projectId: str
    projectName: str = ""
    tier: str
    isPaymentRelated: bool
    nodeStatus: str = ""
    projectAmount: float = 0
    expectedPayment: float = 0
    actualPayment: float = 0
    delayDays: int = 0
    planDate: str = ""
    planMonth: str = ""
    followupRecords: List[Any] = []


class Dashboard(_Base):
    totalProjectCount: int
    totalPaymentNodes: int
    totalPaidNodes: int


class TierSummary(_Base):
    projectCount: int


class ProjectOverview(_Base):
    projects: List[Dict[str, Any]] = []
    columns: List[Dict[str, Any]] = []


class PmisCost(_Base):
    总预算: Optional[float] = None
    核算: Optional[float] = None
    剩余预算: Optional[float] = None
    消耗比: Optional[float] = None
    超支: Optional[bool] = None
    成本状态: Optional[str] = None


class PmisProgress(_Base):
    完工进展: Optional[float] = None
    里程碑进度状态: Optional[str] = None
    项目阶段: Optional[str] = None
    计划终验: Optional[str] = None


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
    评分: Optional[float] = None


class PmisCustomer(_Base):
    最终客户: Optional[str] = None
    合同编号: Optional[str] = None
    签约形式: Optional[str] = None
    行业: Optional[str] = None
    合同总额: Optional[float] = None


class PmisTeam(_Base):
    项目名称: Optional[str] = None
    项目经理: Optional[str] = None
    L4部门: Optional[str] = None


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


class ProjectPayment(_Base):
    relatedNodeCount: int = 0
    expectedTotal: float = 0
    actualTotal: float = 0
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
    paymentRatio: Optional[float] = None
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
    orgL3: str = ""
    isPresale: bool = False
    relatedClosedId: str = ""
    payment: ProjectPayment = ProjectPayment()
    deliveryCosts: List[DeliveryCostItem] = []
    overspendAmount: Optional[float] = None   # S2:整体超支金额(元,同源 profit.overspend_amount,可为负=未超支)
    paymentPmis: Optional[ProjectPaymentPmis] = None   # 2A:PMIS 核心回款摘要(售前回退原项目)
    health: ProjectHealth = ProjectHealth()


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
    dashboard: Dashboard
    summary: Dict[str, TierSummary]
    rawNodes: List[RawNode]
    projectOverview: ProjectOverview
    naguanMap: Dict[str, bool] = {}
    naguanExclude: Dict[str, bool] = {}
    displayColumns: Dict[str, Any] = {}
    followupRecords: Dict[str, Any] = {}
    projectPmis: Dict[str, ProjectPmis] = {}
    dataQuality: Optional[DataQuality] = None
    projects: List[Project] = []
    projectsQuality: Optional[ProjectsQuality] = None
    projectMilestones: Dict[str, List[MilestoneItem]] = {}
    paymentRecords: Dict[str, PaymentRecordsEntry] = {}
    paymentNodes: Dict[str, List[PaymentNodePmis]] = {}   # 2A:PMIS 核心回款逐节点
    projectProfit: Dict[str, ProjectProfit] = {}
    events: List[Event] = []
    periodCompare: Optional[PeriodCompare] = None
    tagSeed: Dict[str, List[str]] = {}


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


if __name__ == "__main__":
    dump_json_schema("schema.json")
    print("[OK] JSON Schema 已写出: schema.json")
