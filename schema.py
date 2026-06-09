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
    评分: Optional[float] = None


class PmisCustomer(_Base):
    最终客户: Optional[str] = None
    合同编号: Optional[str] = None
    签约形式: Optional[str] = None
    行业: Optional[str] = None
    合同总额: Optional[float] = None


class ProjectPmis(_Base):
    matched: bool = False
    source: str = ""
    cost: PmisCost = PmisCost()
    progress: PmisProgress = PmisProgress()
    risk: PmisRisk = PmisRisk()
    status: PmisStatus = PmisStatus()
    customer: PmisCustomer = PmisCustomer()


class QualitySummary(_Base):
    pmisProvided: bool = False
    joinRate: float = 0.0
    matchedActive: int = 0
    matchedClosed: int = 0
    unmatched: int = 0


class DataQuality(_Base):
    summary: QualitySummary
    themes: List[Dict[str, Any]] = []
    unmatched: List[Dict[str, Any]] = []
    backfill: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, Any]] = []
    dirty: List[Dict[str, Any]] = []


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
