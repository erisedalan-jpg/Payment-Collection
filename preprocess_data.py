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
# 通用工具函数
# ============================================================

def parse_header_and_data(sheet_json):
    """将行列数据转为字典列表"""
    if not sheet_json or not sheet_json.get("data"):
        return [], []
    data = sheet_json["data"]
    if len(data) < 2:
        return data[0] if data else [], []
    headers = data[0]
    rows = []
    for row_data in data[1:]:
        row_dict = {}
        for i, val in enumerate(row_data):
            key = headers[i] if i < len(headers) else f"col_{i}"
            # 标准化：将换行（含\r\n和\r）替换为空格，去除首尾空白
            key = key.replace('\r\n', ' ').replace('\r', ' ').replace('\n', ' ').strip()
            # 标准化：统一引号字符（弯引号→直引号），确保与代码中的查找键匹配
            key = key.replace('\u201c', '"').replace('\u201d', '"').replace('\u2018', "'").replace('\u2019', "'")
            # 清洗单元格值：替换换行符为空格，保持字段内容在单行内显示，避免前端表格行列错位
            clean_val = str(val).replace('\r\n', ' ').replace('\n', ' ').replace('\r', ' ') if val is not None else ""
            row_dict[key] = clean_val
        rows.append(row_dict)
    return headers, rows

def excel_serial_to_date(val):
    """Excel序列号转日期字符串"""
    if not val or not str(val).strip():
        return None
    val_str = str(val).strip()
    try:
        num = float(val_str)
        if config.EXCEL_SERIAL_MIN < num < config.EXCEL_SERIAL_MAX:
            base = datetime(1899, 12, 30)
            return (base + timedelta(days=int(num))).strftime("%Y-%m-%d")
    except:
        pass
    # 标准日期格式
    for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y年%m月%d日", "%Y.%m.%d"]:
        try:
            return datetime.strptime(val_str, fmt).strftime("%Y-%m-%d")
        except:
            pass
    m = re.search(r'(\d{4})[/-](\d{1,2})[/-](\d{1,2})', val_str)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    return None

def assign_tier(amount):
    """按项目金额（元）确定分层标签。None 视为 0。"""
    amt = amount if amount is not None else 0
    if amt >= config.TIER_ABOVE_1M:
        return config.TIER_ABOVE_1M_LABEL
    if amt >= config.TIER_ABOVE_500K:
        return config.TIER_MID_LABEL
    return config.TIER_BELOW_500K_LABEL


def _clean_text(val):
    """清理文本字段：过滤Excel错误值（如#REF!被解析为负数大数）"""
    s = str(val).strip() if val is not None else ''
    if not s: return ''
    # Excel错误值常被解析为类似 -2146826246 的大负数
    if s.startswith('-') and len(s) >= 8 and s[1:].isdigit():
        n = int(s)
        if n <= -100000: return ''
    return s

def parse_amount(val):
    """解析金额值（保持原始元单位）"""
    if not val or not str(val).strip():
        return 0
    val = str(val).strip().replace(',', '').replace('，', '')
    m = re.search(r'([\d.]+)', val)
    if m:
        try:
            return float(m.group(1))
        except:
            return 0
    return 0

def parse_ratio(val):
    """
    解析比例值，返回0-1的小数或None
    WPS云文档API读取Excel时，百分比单元格返回的是Excel内部存储的小数值
    （如101%→1.01, 70%→0.7），parse_ratio_raw已将原始值转为"xxx%"格式。
    此函数从百分比字符串中提取数值并转为0-1小数用于内部计算。
    空字符串返回None（标记为待上报）。
    """
    if val is None or str(val).strip() == "":
        return None
    val_str = str(val).strip()
    # 百分比格式如"50%"、"101%"
    m = re.search(r'([\d.]+)\s*%?', val_str)
    if m:
        try:
            num = float(m.group(1))
            if num <= 1:
                return num
            # num > 1: 如50→0.5, 101→1.01，统一除以100
            return num / 100
        except:
            pass
    try:
        num = float(val_str)
        if num <= 1:
            return num
        return num / 100
    except:
        return None

def parse_ratio_raw(val):
    """解析比例原始值，保留云文档原始显示值，空值返回'空值'
    
    WPS云文档API读取Excel时，百分比单元格返回的是Excel内部存储的小数值
    （如101%→1.01, 70%→0.7, 30%→0.3），因此所有正小数都需要×100转换。
    空字符串返回'空值'（标记为待上报）。
    """
    if val is None or str(val).strip() == "":
        return "空值"
    val_str = str(val).strip()
    # "待上报"等非数值状态统一显示为"空值"
    if val_str in ("待上报",):
        return "空值"
    # 已包含%号，直接原样返回（不修改云文档原始数据）
    if "%" in val_str:
        return val_str
    # 纯数字，保留原值加%后缀
    try:
        num = float(val_str)
        # 正数：WPS API返回的是Excel内部小数（0-1+），需×100转为百分比
        # 如0.7→70%, 1.01→101%, 0.3→30%
        if num > 0:
            result = round(num * 100, 2)
            # 去掉尾部无意义的.0（如70.0→70, 101.0→101）
            if result == int(result):
                result = int(result)
            return str(result) + "%"
        # 0或0.0 → 0%
        return "0%"
    except:
        return val_str

def _get_ratio_num(val):
    """从存储的百分比字符串中提取0-1小数值，用于内部计算"""
    if val is None or val == "空值" or val == "":
        return None
    return parse_ratio(val)

def _parse_completion_pct(val):
    """解析'当前项目完成%'字段，返回0-1小数或None
    原始值可能是'80%'、'0.8'、'80'、空值、'空值'等
    计算时实时转为小数，存储和展示保持原样不修改
    """
    if val is None or val == "空值" or str(val).strip() == "":
        return None
    return parse_ratio(val)

def _format_completion_display(val):
    """将projectCompletion的Excel内部小数值转为云文档展示的百分比格式
    '1' -> '100%', '0.1' -> '10%', '0.8' -> '80%'
    空值/''/None -> '空值'
    已包含'%'的保持不变
    """
    if val is None or str(val).strip() == "" or str(val).strip() == "空值":
        return "空值"
    val_str = str(val).strip()
    if "%" in val_str:
        return val_str
    try:
        num = float(val_str)
        # 值>1时视为整数百分比（如100→100%），不乘100；≤1时视为小数（如0.8→80%）
        if num > 1:
            pct = num
        else:
            pct = num * 100
        # 去除不必要的小数位
        if pct == int(pct):
            return f"{int(pct)}%"
        return f"{round(pct, 2)}%"
    except:
        return val_str

def is_yes(val):
    """判断是否为'是'"""
    return val is not None and "是" in str(val).strip()

def get_month(date_str):
    """从日期字符串提取月份 YYYY-MM"""
    if not date_str or len(date_str) < 7:
        return None
    return date_str[:7]

def is_past(date_str):
    """判断日期是否已过（<当前日期）"""
    if not date_str or len(date_str) < 10:
        return False
    try:
        d = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return d < datetime.now()
    except:
        return False

def is_future(date_str):
    """判断日期是否在未来（>当前日期）"""
    if not date_str or len(date_str) < 10:
        return False
    try:
        d = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return d > datetime.now()
    except:
        return False

def compute_node_status(*, is_payment_related, can_advance, completion_pct,
                        actual_ratio, is_milestone_achieved, plan_date, now):
    """计算回款节点状态与延期天数（行为同原 process_below100_nodes 内联逻辑）。

    completion_pct / actual_ratio 为 0~1 小数或 None；now 为参考时间（datetime）。
    返回 (nodeStatus, delayDays)。
    """
    if not is_payment_related:
        return "", 0

    cp = completion_pct
    ar = actual_ratio

    def _past(ds):
        if not ds or len(ds) < 10:
            return False
        try:
            return datetime.strptime(ds[:10], "%Y-%m-%d") < now
        except Exception:
            return False

    def _future(ds):
        if not ds or len(ds) < 10:
            return False
        try:
            return datetime.strptime(ds[:10], "%Y-%m-%d") > now
        except Exception:
            return False

    # 步骤1: 加资源可提前
    if can_advance and (cp is not None and cp < 1.0) and (ar is not None and ar < 1.0):
        return config.STATUS_CAN_ADVANCE, 0
    # 步骤2: 达到回款条件
    if (cp is not None and cp >= 1.0) and is_yes(is_milestone_achieved) and (ar is None or ar < 1.0):
        return config.STATUS_REACHED, 0
    # 步骤3: 已提前回款
    if _future(plan_date) and (ar is not None and ar >= 1.0):
        return config.STATUS_ADVANCE_PAID, 0
    # 步骤4: 已全额回款
    if ar is not None and ar >= 1.0:
        return config.STATUS_FULL_PAID, 0
    # 步骤5: 延期
    if _past(plan_date) and (cp is None or cp < 1.0) and (ar is None or ar < 1.0):
        delay_days = 0
        if plan_date:
            try:
                plan_d = datetime.strptime(plan_date[:10], "%Y-%m-%d")
                delay_days = max(0, (now - plan_d).days)
            except Exception:
                pass
        return config.STATUS_DELAYED, delay_days
    # 步骤6: 正常实施中（兜底）
    return config.STATUS_ON_TIME, 0


# ============================================================
# 50万/50-100万 回款节点清单处理
# ============================================================

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
        "tagSeed": {},
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

if __name__ == "__main__":
    main()