# schema.py
"""数据契约（pydantic v2）：AnalysisData 是前后端共享的权威结构。

策略：首版重"结构 + 核心字段类型"，对节点的众多次要字段用 extra=allow 容纳，
后续可逐步收紧。preprocess_data.py 末尾用本模块校验输出。
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List

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
