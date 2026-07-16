"""
数据预处理脚本V2：只读取3个回款节点清单Sheet，按新公式计算所有指标
"""
import json
import sys
import os
import re
from datetime import datetime, timedelta
import config
import schema
import pmis
import projects as projects_mod
import snapshots as snapshots_mod
import milestones as milestones_mod
import profit as profit_mod
import collection_stages as collection_mod
import yitian as yitian_mod

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# PyInstaller 打包后，__file__ 指向 _MEIPASS 临时目录，数据文件在 exe 目录
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "data")

# ============================================================
# 汇总计算
# ============================================================

def _followup_records_from_local(records):
    """从本地 data/followup_records.json(扁平数组)重建按项目分组的跟进记录快照。
    只读不写,保护 /api/followup 维护的实时数据;每项目按跟进时间降序取最近 5 条。"""
    by_project = {}
    for r in records or []:
        pid = r.get("项目编号", "")
        if not pid:
            continue
        by_project.setdefault(pid, []).append(r)
    for pid in by_project:
        by_project[pid] = sorted(
            by_project[pid], key=lambda x: x.get("跟进时间", ""), reverse=True)[:5]
    return by_project

# ============================================================
# 主流程
# ============================================================


def run_snapshot_pipeline(final_data, output_dir, today=None):
    """9d. 快照/diff/事件/周期对比(Phase P3, spec 3.3)。
    返回 (events_embed 新在前全部保留(≤cap), period_compare dict)。
    时序: 先 diff 既有最新快照(含同日早前一次) → 算周期对比 → 再覆盖写当日快照。"""
    today = today or datetime.now().strftime("%Y-%m-%d")
    snap_dir = os.path.join(output_dir, "snapshots")
    events_path = os.path.join(output_dir, "events.json")

    cur = snapshots_mod.build_snapshot(
        today, final_data["projects"], final_data["projectPmis"], final_data["paymentNodes"],
        final_data.get("projectProfit"))

    dates = snapshots_mod.list_snapshot_dates(snap_dir)
    baselines = snapshots_mod.pick_baseline_dates(dates, today)

    new_events = []
    if baselines["lastSync"]:
        prev = snapshots_mod.load_snapshot(snap_dir, baselines["lastSync"])
        if prev:
            new_events = snapshots_mod.diff_snapshots(prev, cur)
    all_events = snapshots_mod.append_events(events_path, new_events, cap=500)

    period = {}
    for key in ("lastSync", "lastWeek", "lastMonth"):
        ds = baselines[key]
        base = snapshots_mod.load_snapshot(snap_dir, ds) if ds else None
        period[key] = snapshots_mod.compute_period_compare_entry(ds, base, cur) if base else None

    snapshots_mod.save_snapshot(snap_dir, cur, today=today, keep_days=90)
    return list(reversed(all_events)), period


def backfill_final_acceptance(project_pmis, project_milestones):
    """把里程碑计划终验/服务完成日回填到 project_pmis[pid].progress.终验时间(就地修改)。"""
    for pid, pm in project_pmis.items():
        ptype = (pm.get("status") or {}).get("项目类型")
        (pm.setdefault("progress", {}))["终验时间"] = milestones_mod.final_acceptance_date(
            project_milestones.get(pid, []), ptype)


def _collection_nodes_for(pid, rid, collection_stages):
    """售前收款阶段台账把节点挂在本项目号下,故本项目号优先、缺再回退原项目号。"""
    return collection_stages.get(pid) or (collection_stages.get(rid) if rid else None) or []


def derive_sign_unit_tag_seed(project_rows):
    """按 config.SIGN_UNIT_TAG_RULES 精确匹配 signUnit(trim 后) → {pid: [tag]}。规则派生,不写标签文件。"""
    seed = {}
    for p in project_rows:
        tag = config.SIGN_UNIT_TAG_RULES.get((p.get("signUnit") or "").strip())
        if tag:
            seed[p["projectId"]] = [tag]
    return seed


def derive_product_overspend_tag_seed(project_profit):
    """损益科目「产品、商品成本」(code==PRODUCT_COST_SUBJECT_CODE)剩余<0 → {pid:['产品超支']}。规则派生,不写标签文件。"""
    seed = {}
    for pid, data in (project_profit or {}).items():
        for r in (data or {}).get("rows", []):
            if r.get("code") == config.PRODUCT_COST_SUBJECT_CODE:
                rem = r.get("remaining")
                if isinstance(rem, (int, float)) and rem < 0:
                    seed[pid] = [config.PRODUCT_OVERSPEND_TAG]
                break     # 2.1 单行
    return seed


def merge_tag_seeds(*seeds):
    """合并多个 {pid:[tag]} 规则种子,按 pid 并集去重保序。"""
    out = {}
    for seed in seeds:
        for pid, tags in seed.items():
            cur = out.setdefault(pid, [])
            for t in tags:
                if t not in cur:
                    cur.append(t)
    return out


def _pay_projects_from_collection(collection_stages):
    """回款项目清单换源:取收款阶段台账(collection_stages.csv)的项目号。
    取代旧的 yundocs project_overview 派生,语义=回款项目即收款台账里的项目。"""
    return [{"projectId": pid, "projectName": ""} for pid in collection_stages]


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("[INFO] 开始数据预处理V3（PMIS 核心口径）...")

    # === 9. 跟进记录:只读本地 data/followup_records.json 重建快照(不写回) ===
    print("[INFO] 读取本地跟进记录...")
    _fpath = os.path.join(BASE_DIR, 'data', 'followup_records.json')
    try:
        with open(_fpath, 'r', encoding='utf-8') as f:
            _flat = json.load(f)
    except (OSError, ValueError):
        _flat = []
    followup_records = _followup_records_from_local(_flat)

    # === 9a. 读项目映射(售前↔已关闭原项目),供 PMIS 已关闭收录与项目主域使用 ===
    mapping = projects_mod.read_mapping(os.path.join(BASE_DIR, "input", config.MAPPING_FILE))
    extra_closed = {m["closed"] for m in mapping}
    if mapping:
        print(f"  [OK] 项目映射 {len(mapping)} 条(售前↔已关闭)")
    else:
        print("  [WARN] 未提供 A.xlsx 项目映射,售前服务项目将标记待映射")

    # 提前加载收款阶段台账(系统核心回款源),供 pay_projects 换源与 9f 复用
    _today = datetime.now().strftime("%Y-%m-%d")
    collection_stages = collection_mod.load_collection_stages(
        os.path.join(BASE_DIR, "input"), _today)
    # 治理告警:收款台账逐单元格解析失败计数(金额/日期/比例),PMIS 导出格式漂移可见化;
    # 不改变 load_collection_stages 本身的静默降级口径,仅并入 dataQuality 供治理页展示。
    collection_parse_errors = collection_mod.count_parse_errors(os.path.join(BASE_DIR, "input"))

    # === 9b. 摄取 PMIS 项目域(在建全量 + 已关闭∩回款),按 projectId join ===
    print("[INFO] 摄取 PMIS 项目域数据...")
    pmis_dir = os.path.join(BASE_DIR, "input", config.PMIS_DIRNAME)
    # 换源:pay_projects 取收款阶段台账项目号(原 yundocs project_overview 已下线)
    pay_projects = _pay_projects_from_collection(collection_stages)
    # dirty 延迟到 payment_nodes 建好后填充(见 9f 循环之后),此处先传空列表
    project_pmis, data_quality = pmis.load_project_pmis(
        pmis_dir, pay_projects, dirty=[], extra_closed_ids=extra_closed)
    if data_quality["summary"]["pmisProvided"]:
        print(f"  [OK] PMIS 命中在建 {data_quality['summary']['matchedActive']} / "
              f"已关闭 {data_quality['summary']['matchedClosed']} / 未匹配 {data_quality['summary']['unmatched']}")
    else:
        print("  [WARN] 未提供 PMIS 数据(input/pmis/ 为空),数据治理视图将提示去获取")

    # === 9c. 构建项目主域(PMIS在建 ∩ 交付三部,Phase P1) ===
    print("[INFO] 构建项目主域(交付实施三部)...")
    dept_projects, projects_quality = projects_mod.load_dept_projects(
        os.path.join(BASE_DIR, "input"), project_pmis, mapping)
    org_names, _org_l4s, _org_rows = projects_mod.read_org_names(
        os.path.join(BASE_DIR, "input", config.ORG_FILE))
    closed_projects = pmis.build_closed_projects(pmis_dir, org_names)
    print(f"  [OK] 已关闭项目清单 {len(closed_projects)} 个(交付三部)")
    if projects_quality["orgFile"]["provided"]:
        print(f"  [OK] 主域项目 {projects_quality['deptProjectCount']} 个, "
              f"售前已映射 {projects_quality['presaleMapped']}/{projects_quality['presaleTotal']}, "
              f"漏网告警 {len(projects_quality['managerNotInOrg'])}")
    else:
        print("  [WARN] 未提供 组织架构.xlsx,主域退化为 PMIS 在建全量")
    if not projects_quality["deliveryFile"]["provided"]:
        print("  [WARN] 未提供 delivery_analysis.xlsx,预算核算明细缺失")

    # === 9e. 新数据源(Phase R1):里程碑/回款流水/全预算 ===
    print("[INFO] 摄取里程碑/回款流水/全预算数据...")
    keep_ids = {p["projectId"] for p in dept_projects}
    keep_ids |= {p["relatedClosedId"] for p in dept_projects if p.get("relatedClosedId")}
    project_milestones, ms_a, ms_c = milestones_mod.load_milestones(pmis_dir, keep_ids)
    backfill_final_acceptance(project_pmis, project_milestones)
    payment_records, pr_stat = profit_mod.load_payment_records(
        os.path.join(BASE_DIR, "input"), keep_ids)
    project_profit, pf_stats = profit_mod.load_profit(
        os.path.join(BASE_DIR, "input"), keep_ids)
    projects_quality["milestoneActive"] = ms_a
    projects_quality["milestoneClosed"] = ms_c
    projects_quality["paymentRecordsFile"] = pr_stat
    projects_quality["profitDirectFile"] = pf_stats["direct"]
    projects_quality["profitBridgeFile"] = pf_stats["bridge"]
    projects_quality["budgetFile"] = pf_stats["budget"]
    for label, st in [("里程碑(在建)", ms_a), ("里程碑(已结项)", ms_c),
                      ("回款流水", pr_stat), ("全预算(direct)", pf_stats["direct"]),
                      ("预算版本(budget)", pf_stats["budget"]), ("桥接预算", pf_stats["bridge"])]:
        if st["provided"]:
            print(f"  [OK] {label} {st['rows']} 行, 命中 {st['matched']}")
        else:
            print(f"  [WARN] 未提供 {label} 数据文件")

    # === S2: 整体超支金额回填(同源 profit.overspend_amount;无 profit 数据自动 None,供详情页风险徽章,与事件快照同口径) ===
    for p in dept_projects:
        p["overspendAmount"] = profit_mod.overspend_amount(project_profit.get(p["projectId"]))

    # 成本预算口径兜底:PMIS总预算 与 损益预算成本 分歧时改用损益预算成本并重算,分歧清单入数据质量告警
    # 必须在 9f 的 compute_health 之前:health 的 costAbnormal/overall 派生自 cost.消耗比/项目超支,reconcile 须先改好 cost
    budget_mismatches = pmis.reconcile_cost_budget(project_pmis, project_profit)
    data_quality["budgetSourceMismatch"] = {"count": len(budget_mismatches), "items": budget_mismatches}
    if budget_mismatches:
        print(f"  [INFO] 预算口径分歧 {len(budget_mismatches)} 个项目,已改用损益预算成本并入数据质量告警")

    # === 9f. 系统核心口径回款(3A):收款阶段台账 collection_stages.csv;售前回退原项目 ===
    def _pmis_contract(_pid):
        return ((project_pmis.get(_pid) or {}).get("customer") or {}).get("合同总额")
    # _today / collection_stages 已在 9b 前加载,此处直接复用
    payment_nodes = {}
    for p in dept_projects:
        _pid = p["projectId"]
        _rid = p.get("relatedClosedId") or ""
        _eff, _from_origin = _pid, False
        if not _pmis_contract(_pid) and _rid and _pmis_contract(_rid):
            _eff, _from_origin = _rid, True
        # 节点按 eff 取(售前=原项目);流水本项目优先,缺再回退原项目
        _rec = payment_records.get(_pid) or (payment_records.get(_rid) if _rid else None)
        _nodes = _collection_nodes_for(_pid, _rid, collection_stages)
        _summary = projects_mod.build_payment_summary(_pmis_contract(_eff), _nodes, _rec)
        _summary["fromOrigin"] = _from_origin
        p["paymentPmis"] = _summary
        payment_nodes[_pid] = _nodes
        p["payment"] = projects_mod.aggregate_payment_pmis(_nodes)
        p["payment"]["paymentRatio"] = projects_mod.payment_ratio_from_records(
            p["paymentPmis"]["actualTotal"], p["paymentPmis"]["contract"], None)
        p["health"] = projects_mod.compute_health(project_pmis.get(_pid) or {}, p["payment"]["delayedCount"])
    print(f"  [OK] 系统核心口径回款已回填 {len(dept_projects)} 项目"
          f"(售前取原项目 {sum(1 for p in dept_projects if p['paymentPmis']['fromOrigin'])}"
          f";收款阶段项目 {len(collection_stages)})")

    # 换源:dirty 改由 payment_nodes 取(actualRatio),回填至 data_quality
    dirty = []
    for _pid, _nodes in payment_nodes.items():
        for n in _nodes:
            r = n.get("actualRatio")
            if r is not None and r > 1:
                dirty.append({"type": "回款比例>1", "projectId": _pid,
                              "field": "actualRatio", "value": r})
    data_quality["dirty"] = dirty
    data_quality["collectionParseErrors"] = collection_parse_errors

    # === 10. 构建最终数据 ===
    final_data = {
        "meta": {
            "lastUpdate": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "totalProjects": len(dept_projects),
            "totalClosed": len(closed_projects),
            "totalPaymentNodes": sum(len(v) for v in payment_nodes.values()),
        },
        "followupRecords": followup_records,
        "projectPmis": project_pmis,
        "dataQuality": data_quality,
        "projects": dept_projects,
        "closedProjects": closed_projects,
        "projectsQuality": projects_quality,
        "projectMilestones": project_milestones,
        "paymentRecords": payment_records,
        "paymentNodes": payment_nodes,
        "projectProfit": project_profit,
        "tagSeed": merge_tag_seeds(
            derive_sign_unit_tag_seed(dept_projects),
            derive_product_overspend_tag_seed(project_profit)),
    }

    # === 9d. 快照/diff/事件流/周期对比(Phase P3) ===
    print("[INFO] 生成快照与项目动态...")
    try:
        events_embed, period_compare = run_snapshot_pipeline(final_data, OUTPUT_DIR)
    except Exception as e:  # 快照/事件为辅助特性,IO 异常(权限/磁盘满)不得阻断主数据输出
        print(f"  [WARN] 快照/动态生成失败,本次跳过: {e}")
        events_embed, period_compare = [], {"lastSync": None, "lastWeek": None, "lastMonth": None}
    final_data["events"] = events_embed
    final_data["periodCompare"] = period_compare
    if events_embed:
        print(f"  [OK] 新事件 {len([e for e in events_embed if e['date'] == datetime.now().strftime('%Y-%m-%d')])} 条,内嵌最近 {len(events_embed)} 条")
    elif period_compare.get("lastSync"):
        print("  [INFO] 与上次快照相比无变化")
    else:
        print("  [INFO] 首次快照,暂无变化记录")

    # === 10. 保存（校验后输出 JSON）===
    output_file = schema.validate_and_write_json(final_data, OUTPUT_DIR)
    print("[OK] 数据已通过 schema 校验")

    print(f"\n[INFO] 数据预处理V3完成!")
    print(f"  主域项目总数: {len(dept_projects)}")
    print(f"  回款阶段总数(收款阶段节点): {sum(len(v) for v in payment_nodes.values())}")
    print(f"  输出文件: {output_file}")

    # === 11. 倚天工时域:先把当周导出 upsert 进累积库,再从累积库构建下发数据。
    # 每周导出只含当周数据,靠累积库(data/yitian_store.json)才能攒成长期数据集。
    # 缺 input/yitian/工时.xlsx 或累积库为空都不阻断主管线 ===
    try:
        ing = yitian_mod.ingest(BASE_DIR)
        if ing is None:
            print("[INFO] 未提供 input/yitian/工时.xlsx,本次不导入倚天工时(累积库保持原样)")
        else:
            print("[OK] 倚天工时导入: 新增 %d 行 / 更新 %d 行 / 累积库共 %d 行"
                  % (ing["added"], ing["updated"], ing["total"]))
            if ing["skipped"]:
                print("  [WARN] 倚天工时 %d 行因缺工时ID被跳过(无去重键,无法累积)"
                      % ing["skipped"])
        ydata = yitian_mod.build_yitian_data(BASE_DIR)
        if ydata is None:
            print("[INFO] 倚天累积库为空,跳过倚天工时域")
        else:
            ypath = schema.validate_and_write_yitian_json(ydata, OUTPUT_DIR)
            ymeta = ydata["meta"]
            print("[OK] 倚天工时域: %d 行 / %d 人 / %s ~ %s / 日历源 %s → %s"
                  % (ymeta["rows"], ymeta["employees"], ymeta["periodStart"],
                     ymeta["periodEnd"], ymeta["calendarSource"], ypath))
            if ymeta["droppedRows"]:
                print("  [WARN] 倚天工时 %d 行因工号不在组织架构花名册或工作日不可解析被丢弃"
                      % ymeta["droppedRows"])
            if ymeta["calendarSource"] == "fallback":
                print("  [WARN] 未提供 input/yitian/holidays.csv,工作日退化为纯周一~周五(节假日周饱和度会偏低)")
    except Exception as e:   # 倚天域是附加特性,任何异常都不得影响 analysis_data.json
        print(f"  [WARN] 倚天工时域生成失败,本次跳过: {e}")

if __name__ == "__main__":
    main()