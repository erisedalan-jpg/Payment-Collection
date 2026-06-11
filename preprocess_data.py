"""
数据预处理脚本V2：只读取3个回款节点清单Sheet，按新公式计算所有指标
"""
import json
import sys
import os
import re
from datetime import datetime, date, timedelta
from collections import defaultdict
import config
import schema
import pmis
import projects as projects_mod
import snapshots as snapshots_mod

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# PyInstaller 打包后，__file__ 指向 _MEIPASS 临时目录，数据文件在 exe 目录
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(BASE_DIR, "yundocs_data")
OUTPUT_DIR = os.path.join(BASE_DIR, "data")

# ============================================================
# 通用工具函数
# ============================================================

def load_sheet(name):
    """加载指定Sheet的JSON数据"""
    safe_name = "".join(c if c.isalnum() or c in "._- " else "_" for c in name)
    filepath = f"{INPUT_DIR}/sheet_{safe_name}.json"
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return None

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

def process_below100_nodes(sheet_json, tier_name, now=None):
    """处理50万以下和50-100万回款节点清单"""
    if now is None:
        now = datetime.now()
    headers, rows = parse_header_and_data(sheet_json)
    
    nodes = []
    for row in rows:
        project_id = str(row.get("项目编号", "")).strip()
        if not project_id:
            continue
        
        project_name = str(row.get("项目名称", "")).strip()
        project_amount = parse_amount(row.get("项目金额", "0"))
        plan_date_raw = row.get("该节点计划完成时间", "")
        plan_date = excel_serial_to_date(plan_date_raw)
        actual_date_raw = row.get("实际完成时间", "")
        actual_date = excel_serial_to_date(actual_date_raw) if actual_date_raw else None
        
        is_payment_related = is_yes(row.get("是否关联回款", ""))
        plan_ratio_raw = parse_ratio_raw(row.get("关联回款比例", ""))
        actual_ratio_raw = parse_ratio_raw(row.get("实际回款比例", ""))
        # 提取数值用于计算
        plan_ratio = _get_ratio_num(plan_ratio_raw)
        actual_ratio = _get_ratio_num(actual_ratio_raw)
        can_advance = is_yes(row.get("是否增加资源是否可以提前完成里程碑计划", ""))
        project_completion_raw = str(row.get("当前项目完成%", "")).strip()
        project_completion = project_completion_raw if project_completion_raw else "空值"
        # 解析"当前项目完成%"为0-1小数用于计算（存储保持原样）
        completion_pct = _parse_completion_pct(project_completion)
        is_milestone_achieved = str(row.get("是否已达成里程碑", "")).strip()
        
        # 计算节点状态（6种状态）
        # 仅"是否关联回款"=是时才计算节点状态；否则保留原始数据但不判定状态
        if not is_payment_related:
            # 不关联回款的节点：保留原始数据，nodeStatus为空，金额字段为0
            node = {
                "source": "below100",
                "tier": tier_name,
                "projectId": project_id,
                "projectName": project_name,
                "orgL3": str(row.get("项目经理L3-1部门", "")).strip(),
                "orgL4": str(row.get("项目经理L4部门", "")).strip(),
                "projectManager": str(row.get("项目经理", "")).strip(),
                "projectType": str(row.get("项目类型", "")).strip(),
                "projectAmount": project_amount,
                "amountTier": str(row.get("项目金额分层", "")).strip(),
                "nodeName": str(row.get("里程碑节点", "")).strip(),
                "planDate": plan_date or "",
                "planQuarter": str(row.get("计划时间切片", "")).strip(),
                "actualDate": actual_date or "",
                "completionStatus": str(row.get("里程碑节点完成情况", "")).strip(),
                "isPaymentRelated": is_payment_related,
                "planPaymentRatio": plan_ratio_raw,
                "actualPaymentRatio": actual_ratio_raw,
                "projectCompletion": _format_completion_display(project_completion_raw),
                "isMilestoneAchieved": is_milestone_achieved,
                "expectedMilestoneDate": excel_serial_to_date(row.get("预计里程碑完成时间", "")) or "",
                "canAdvance": can_advance,
                "advanceDetail": str(row.get('如T列为"是"写明需求资源，如"否"写明原因', "")).strip(),
                "blocker": str(row.get("卡点", "")).strip(),
                "blockerOwner": str(row.get("卡点责任方", "")).strip(),
                "nextAction": str(row.get("下一步动作", "")).strip(),
                "nextActionDate": str(row.get("下一步动作完成时间", "")).strip(),
                "remarks": str(row.get("备注", "")).strip(),
                "remarks2": str(row.get("备注2", "")).strip(),
                "signUnit": _clean_text(row.get("签约单位", "")),
                "纳管": str(row.get("纳管", "")).strip(),
                "planMonth": get_month(plan_date) or "",
                "nodeStatus": "",
                "delayDays": 0,
                "expectedPayment": 0,
                "actualPayment": 0,
            }
            nodes.append(node)
            continue

        node_status, delay_days = compute_node_status(
            is_payment_related=is_payment_related,
            can_advance=can_advance,
            completion_pct=completion_pct,
            actual_ratio=actual_ratio,
            is_milestone_achieved=is_milestone_achieved,
            plan_date=plan_date,
            now=now,
        )

        # 保存所有原始字段
        node = {
            "source": "below100",
            "tier": tier_name,
            "projectId": project_id,
            "projectName": project_name,
            "orgL3": str(row.get("项目经理L3-1部门", "")).strip(),
            "orgL4": str(row.get("项目经理L4部门", "")).strip(),
            "projectManager": str(row.get("项目经理", "")).strip(),
            "projectType": str(row.get("项目类型", "")).strip(),
            "projectAmount": project_amount,
            "amountTier": str(row.get("项目金额分层", "")).strip(),
            "nodeName": str(row.get("里程碑节点", "")).strip(),
            "planDate": plan_date or "",
            "planQuarter": str(row.get("计划时间切片", "")).strip(),
            "actualDate": actual_date or "",
            "completionStatus": str(row.get("里程碑节点完成情况", "")).strip(),
            "isPaymentRelated": is_payment_related,
            "planPaymentRatio": plan_ratio_raw,
            "actualPaymentRatio": actual_ratio_raw,
            "projectCompletion": _format_completion_display(project_completion_raw),
            "isMilestoneAchieved": is_milestone_achieved,
            "expectedMilestoneDate": excel_serial_to_date(row.get("预计里程碑完成时间", "")) or "",
            "canAdvance": can_advance,
            "advanceDetail": str(row.get('如T列为"是"写明需求资源，如"否"写明原因', "")).strip(),
            "blocker": str(row.get("卡点", "")).strip(),
            "blockerOwner": str(row.get("卡点责任方", "")).strip(),
            "nextAction": str(row.get("下一步动作", "")).strip(),
            "nextActionDate": str(row.get("下一步动作完成时间", "")).strip(),
            "remarks": str(row.get("备注", "")).strip(),
            "remarks2": str(row.get("备注2", "")).strip(),
            "signUnit": _clean_text(row.get("签约单位", "")),
            "planMonth": get_month(plan_date) or "",
            "nodeStatus": node_status,
            "delayDays": delay_days,
            # 计算字段
            "expectedPayment": round(project_amount * (plan_ratio or 0), 2) if is_payment_related else 0,
            "actualPayment": round(project_amount * (plan_ratio or 0) * (actual_ratio or 0), 2) if is_payment_related else 0,
        }
        nodes.append(node)
    
    return nodes

# ============================================================
# V5.9 统一：所有层级使用 process_below100_nodes() 处理
# 原 process_above100_nodes() 已废弃删除
# 数据来源统一为"项目回款节点（里程碑）清单"Sheet
# 层级仅通过 projectAmount 金额阈值区分，列名体系统一
# ============================================================

# ============================================================
# 汇总计算
# ============================================================

def process_followup_records():
    """解析跟进记录Sheet，按项目编号分组，每个项目取最近5条
    跟进状态重置：节点动作完成时间 <= 今天 且 状态=已解决 → 重置为跟进中
    """
    followup_data = load_sheet(config.SHEET_FOLLOWUP)
    if not followup_data or len(followup_data) < 2:
        print("[INFO] 跟进记录Sheet无数据或不存在，跳过")
        return {}
    
    # 解析数据（第一行为表头）
    headers, rows = parse_header_and_data(followup_data)
    if not headers:
        print("[WARN] 跟进记录Sheet表头为空，跳过")
        return {}
    
    today_str = datetime.now().strftime('%Y-%m-%d')
    records_by_project = {}

    for row in rows:
        # row 是 dict（parse_header_and_data 返回的），直接用 key 取值
        record = {k: row.get(k, '') for k in headers if k.strip()}

        # Excel日期序列号转正常日期格式
        date_fields = ['节点动作完成时间', '跟进时间', '下次跟进计划日期']
        for df in date_fields:
            raw = record.get(df, '')
            if raw and re.match(r'^\d{4,5}\.', str(raw)):
                converted = excel_serial_to_date(raw)
                if converted:
                    # 跟进时间可能包含时分：Excel序列号的小数部分=时分秒
                    try:
                        val = float(str(raw))
                        if val > config.EXCEL_SERIAL_MIN:
                            base = datetime(1899, 12, 30)
                            dt = base + timedelta(days=int(val))
                            if val % 1 > 0:
                                seconds = int((val % 1) * 86400)
                                dt = dt + timedelta(seconds=seconds)
                                record[df] = dt.strftime('%Y-%m-%d %H:%M:%S')
                            else:
                                record[df] = dt.strftime('%Y-%m-%d')
                    except:
                        record[df] = converted

        project_id = record.get('项目编号', '')
        if not project_id:
            continue
        
        if project_id not in records_by_project:
            records_by_project[project_id] = []
        
        # 跟进状态重置检查
        action_date = record.get('节点动作完成时间', '')
        status = record.get('跟进状态', '')
        if action_date and status == '已解决':
            try:
                action_dt = datetime.strptime(action_date.strip(), '%Y-%m-%d')
                if action_dt.date() <= datetime.now().date():
                    # 标记该记录需要重置
                    record['跟进状态'] = '跟进中'
                    record['_resetReason'] = f'节点动作完成时间({action_date.strip()})已到，跟进状态重置为跟进中'
            except ValueError:
                pass
        
        records_by_project[project_id].append(record)
    
    # 每个项目只保留最近5条（按跟进时间降序）
    for project_id in records_by_project:
        records_by_project[project_id] = sorted(
            records_by_project[project_id],
            key=lambda r: r.get('跟进时间', ''),
            reverse=True
        )[:5]
    
    # 清理内部标记
    for project_id, recs in records_by_project.items():
        for r in recs:
            r.pop('_resetReason', None)

    # 同步到本地 followup_records.json（展平为全量记录数组）
    all_records = []
    for project_id, recs in records_by_project.items():
        all_records.extend(recs)
    try:
        followup_path = os.path.join(BASE_DIR, 'data', 'followup_records.json')
        with open(followup_path, 'w', encoding='utf-8') as f:
            json.dump(all_records, f, ensure_ascii=False, indent=2)
        print(f"[OK] 跟进记录已同步到本地: {len(all_records)} 条记录 → {followup_path}")
    except Exception as e:
        print(f"[WARN] 跟进记录同步本地失败: {e}")

    print(f"[OK] 跟进记录解析完成: {len(records_by_project)}个项目, 共{sum(len(v) for v in records_by_project.values())}条记录")
    return records_by_project


def compute_dashboard(all_nodes):
    """计算看板首页汇总数据"""
    today = datetime.now().strftime("%Y-%m-%d")
    
    # a. 项目总数量：按tier分别去重项目编号
    tier_project_ids = defaultdict(set)
    for n in all_nodes:
        tier_project_ids[n["tier"]].add(n["projectId"])
    total_project_count = sum(len(ids) for ids in tier_project_ids.values())
    
    # b. 项目回款阶段总数量：关联回款=是的行数
    related_nodes = [n for n in all_nodes if n["isPaymentRelated"]]
    total_payment_nodes = len(related_nodes)
    
    # c. 已回款项目总数量：关联回款=是且实际回款比例=100%
    paid_nodes = [n for n in related_nodes if n["nodeStatus"] in (config.STATUS_FULL_PAID, config.STATUS_ADVANCE_PAID)]
    total_paid_nodes = len(paid_nodes)
    
    # d. 可提前回款项目总数量：关联回款=是 + canAdvance=是 + 实际回款比例未达100%
    can_advance_nodes = [n for n in related_nodes if n["nodeStatus"] == config.STATUS_CAN_ADVANCE]
    total_can_advance = len(can_advance_nodes)

    # e. 回款延期项目总数量
    delayed_nodes = [n for n in related_nodes if n["nodeStatus"] == config.STATUS_DELAYED]
    total_delayed = len(delayed_nodes)
    
    # f. 月度回款计划（关联回款=是且实际回款≠100%，按月统计）
    monthly_nodes = [n for n in related_nodes 
                     if _get_ratio_num(n["actualPaymentRatio"]) is None or _get_ratio_num(n["actualPaymentRatio"]) < 1.0]
    monthly_plan = {}
    for n in monthly_nodes:
        m = n.get("planMonth", "")
        if not m:
            continue
        if m not in monthly_plan:
            monthly_plan[m] = {"count": 0, "amount": 0, "nodes": []}
        monthly_plan[m]["count"] += 1
        monthly_plan[m]["amount"] += n["expectedPayment"] - n["actualPayment"]
        monthly_plan[m]["nodes"].append({
            "projectId": n["projectId"],
            "projectName": n["projectName"],
            "nodeName": n["nodeName"],
            "planDate": n["planDate"],
            "projectAmount": n["projectAmount"],
            "planPaymentRatio": n["planPaymentRatio"],
            "actualPaymentRatio": n["actualPaymentRatio"],
            "expectedPayment": n["expectedPayment"],
            "tier": n["tier"],
        })
    
    # g. 服务组回款达成排名
    org_stats = defaultdict(lambda: {"expectedTotal": 0, "actualTotal": 0, "count": 0})
    for n in related_nodes:
        org = n["orgL4"] or "未分配"
        org_stats[org]["expectedTotal"] += n["expectedPayment"]
        org_stats[org]["actualTotal"] += n["actualPayment"]
        org_stats[org]["count"] += 1
    
    org_ranking = []
    for org, stats in org_stats.items():
        rate = stats["actualTotal"] / stats["expectedTotal"] if stats["expectedTotal"] > 0 else 0
        org_ranking.append({
            "org": org,
            "expectedTotal": round(stats["expectedTotal"], 2),
            "expectedTotalWan": round(stats["expectedTotal"] / 10000, 2),
            "actualTotal": round(stats["actualTotal"], 2),
            "actualTotalWan": round(stats["actualTotal"] / 10000, 2),
            "achievementRate": round(rate, 4),
            "count": stats["count"],
        })
    org_ranking.sort(key=lambda x: x["actualTotal"], reverse=True)
    
    # h. 延期回款TOP5（按延期天数倒序）
    delayed_top = []
    seen = set()
    for n in sorted(delayed_nodes, key=lambda x: x.get("delayDays", 0), reverse=True):
        key = n["projectId"]
        if key not in seen:
            seen.add(key)
            delayed_top.append({
                "projectId": n["projectId"],
                "projectName": n["projectName"],
                "orgL4": n["orgL4"],
                "projectManager": n["projectManager"],
                "tier": n["tier"],
                "delayDays": n.get("delayDays", 0),
            })
    delayed_top = delayed_top[:10]
    
    # 计划回款总金额 = sum(节点计划回款金额)，已回款总金额 = sum(节点实际回款金额)
    total_expected_payment = sum(n["expectedPayment"] for n in related_nodes)
    total_actual_payment = sum(n["actualPayment"] for n in related_nodes)
    total_pending_payment = total_expected_payment - total_actual_payment
    # 总完成率 = sum(节点实际回款金额)/sum(节点计划回款金额)
    total_completion_rate = total_actual_payment / total_expected_payment if total_expected_payment > 0 else 0
    
    return {
        "totalProjectCount": total_project_count,
        "totalPaymentNodes": total_payment_nodes,
        "totalPaidNodes": total_paid_nodes,
        "totalCanAdvance": total_can_advance,
        "totalDelayed": total_delayed,
        "totalReachedCondition": len([n for n in related_nodes if n["nodeStatus"] == config.STATUS_REACHED]),
        "totalOnTime": len([n for n in related_nodes if n["nodeStatus"] == config.STATUS_ON_TIME]),
        "totalAdvanceEarly": len([n for n in related_nodes if n["nodeStatus"] == config.STATUS_ADVANCE_PAID]),
        "totalFullPaid": len([n for n in related_nodes if n["nodeStatus"] == config.STATUS_FULL_PAID]),
        # 金额指标（元为单位计算，万为单位展示）
        "totalExpectedPayment": round(total_expected_payment, 2),
        "totalExpectedPaymentWan": round(total_expected_payment / 10000, 2),
        "totalActualPayment": round(total_actual_payment, 2),
        "totalActualPaymentWan": round(total_actual_payment / 10000, 2),
        "totalPendingPayment": round(total_pending_payment, 2),
        "totalPendingPaymentWan": round(total_pending_payment / 10000, 2),
        "totalCompletionRate": round(total_completion_rate, 4),
        "monthlyPlan": {k: {"count": v["count"], 
                            "amountWan": round(v["amount"]/10000, 2),
                            "nodes": v["nodes"]} 
                        for k, v in sorted(monthly_plan.items())},
        "orgRanking": org_ranking,
        "delayedTop5": delayed_top,
        "tierProjectCounts": {tier: len(ids) for tier, ids in tier_project_ids.items()},
    }

def compute_tier_summary(all_nodes, tier_name):
    """计算单个层级的汇总统计"""
    tier_nodes = [n for n in all_nodes if n["tier"] == tier_name]
    related_nodes = [n for n in tier_nodes if n["isPaymentRelated"]]
    
    # 项目去重（全量，含是否关联回款=否）
    project_ids = set(n["projectId"] for n in tier_nodes)
    project_count = len(project_ids)
    # 项目去重（仅关联回款=是）
    related_project_ids = set(n["projectId"] for n in related_nodes)
    related_project_count = len(related_project_ids)
    
    # 精确计算：按项目ID去重取项目金额
    project_amounts = {}
    for n in tier_nodes:
        pid = n["projectId"]
        if pid not in project_amounts:
            project_amounts[pid] = n["projectAmount"]
    total_amount = sum(project_amounts.values())
    
    # 金额指标：计划回款/已回款/待回款（元为单位计算）
    tier_expected_payment = sum(n["expectedPayment"] for n in related_nodes)
    tier_actual_payment = sum(n["actualPayment"] for n in related_nodes)
    tier_pending_payment = tier_expected_payment - tier_actual_payment
    tier_completion_rate = tier_actual_payment / tier_expected_payment if tier_expected_payment > 0 else 0
    # 兼容旧字段
    remaining = tier_pending_payment
    
    # 6种节点状态统计（使用nodeStatus字段直接匹配）
    can_advance_nodes = [n for n in related_nodes if n["nodeStatus"] == config.STATUS_CAN_ADVANCE]
    reached_condition = [n for n in related_nodes if n["nodeStatus"] == config.STATUS_REACHED]
    advance_early = [n for n in related_nodes if n["nodeStatus"] == config.STATUS_ADVANCE_PAID]
    full_paid = [n for n in related_nodes if n["nodeStatus"] == config.STATUS_FULL_PAID]
    on_time = [n for n in related_nodes if n["nodeStatus"] == config.STATUS_ON_TIME]
    delayed = [n for n in related_nodes if n["nodeStatus"] == config.STATUS_DELAYED]
    
    # 月度计划
    monthly = {}
    for n in related_nodes:
        if _get_ratio_num(n["actualPaymentRatio"]) is not None and _get_ratio_num(n["actualPaymentRatio"]) >= 1.0:
            continue
        m = n.get("planMonth", "")
        if not m:
            continue
        if m not in monthly:
            monthly[m] = {"count": 0, "amount": 0}
        monthly[m]["count"] += 1
        monthly[m]["amount"] += n["expectedPayment"] - n["actualPayment"]
    
    # 服务组统计
    org_stats = defaultdict(lambda: {"expectedTotal": 0, "actualTotal": 0, "count": 0, "delayedCount": 0})
    for n in related_nodes:
        org = n["orgL4"] or "未分配"
        org_stats[org]["expectedTotal"] += n["expectedPayment"]
        org_stats[org]["actualTotal"] += n["actualPayment"]
        org_stats[org]["count"] += 1
        if n["nodeStatus"] == config.STATUS_DELAYED:
            org_stats[org]["delayedCount"] += 1
    
    org_summary = {}
    for org, stats in org_stats.items():
        rate = stats["actualTotal"] / stats["expectedTotal"] if stats["expectedTotal"] > 0 else 0
        org_summary[org] = {
            "count": stats["count"],
            "expectedTotal": round(stats["expectedTotal"], 2),
            "expectedTotalWan": round(stats["expectedTotal"] / 10000, 2),
            "actualTotal": round(stats["actualTotal"], 2),
            "actualTotalWan": round(stats["actualTotal"] / 10000, 2),
            "achievementRate": round(rate, 4),
            "delayedCount": stats["delayedCount"],
        }
    
    # 数据完整性检查（三表统一）：关联回款=是且当前项目完成%为空且是否已达成里程碑为空
    def _is_empty_val(v):
        """判断字段值是否为空（空字符串、'空值'均视为空）"""
        if not v or not str(v).strip():
            return True
        return str(v).strip() == "空值"

    incomplete = [n for n in related_nodes
                 if _is_empty_val(n["projectCompletion"]) and _is_empty_val(n["isMilestoneAchieved"])]
    
    # 去重
    seen_incomplete = set()
    incomplete_list = []
    for n in incomplete:
        if n["projectId"] not in seen_incomplete:
            seen_incomplete.add(n["projectId"])
            incomplete_list.append({
                "projectId": n["projectId"],
                "projectName": n["projectName"],
                "orgL4": n["orgL4"],
                "projectManager": n["projectManager"],
            })
    
    return {
        "projectCount": project_count,
        "totalAmount": round(total_amount, 2),
        "totalAmountWan": round(total_amount / 10000, 2),
        # 新增：计划回款/已回款/待回款金额（元计算，万展示）
        "expectedPayment": round(tier_expected_payment, 2),
        "expectedPaymentWan": round(tier_expected_payment / 10000, 2),
        "actualPayment": round(tier_actual_payment, 2),
        "actualPaymentWan": round(tier_actual_payment / 10000, 2),
        "pendingPayment": round(tier_pending_payment, 2),
        "pendingPaymentWan": round(tier_pending_payment / 10000, 2),
        "completionRate": round(tier_completion_rate, 4),
        # 兼容旧字段
        "remainingAmount": round(remaining, 2),
        "remainingAmountWan": round(remaining / 10000, 2),
        # 兼容旧字段：app.js 使用 actualAmountWan/expectedAmountWan
        "actualAmountWan": round(tier_actual_payment / 10000, 2),
        "expectedAmountWan": round(tier_expected_payment / 10000, 2),
        "relatedNodeCount": len(related_nodes),
        "relatedProjectCount": related_project_count,
        # 6种节点状态统计
        "canAdvanceCount": len(can_advance_nodes),
        "reachedConditionCount": len(reached_condition),
        "advanceEarlyCount": len(advance_early),
        "fullPaidCount": len(full_paid),
        "onTimeCount": len(on_time),
        "delayedCount": len(delayed),
        # 各状态金额统计
        "canAdvanceAmount": round(sum(n["expectedPayment"] for n in can_advance_nodes) / 10000, 2),
        "reachedConditionAmount": round(sum(n["expectedPayment"] for n in reached_condition) / 10000, 2),
        "advanceEarlyAmount": round(sum(n["expectedPayment"] for n in advance_early) / 10000, 2),
        "fullPaidAmount": round(sum(n["actualPayment"] for n in full_paid) / 10000, 2),
        "onTimeAmount": round(sum(n["expectedPayment"] for n in on_time) / 10000, 2),
        "delayedAmount": round(sum(n["expectedPayment"] for n in delayed) / 10000, 2),
        "monthlyPlan": {k: {"count": v["count"], "amountWan": round(v["amount"]/10000, 2)} 
                       for k, v in sorted(monthly.items())},
        "orgStats": org_summary,
        "incompleteData": incomplete_list,
    }

# ============================================================
# 主流程
# ============================================================

# ============================================================
# 项目验收日期、回款条件信息收集 Sheet 处理
# ============================================================

def process_project_overview(sheet_json):
    """处理项目验收日期Sheet，返回项目列表和纳管映射。
    动态读取所有列，自动适配云文档中新增/删除字段。"""
    sheet_headers, rows = parse_header_and_data(sheet_json)
    # 标准化表头：去掉换行和首尾空白
    clean_headers = [h.replace('\r\n',' ').replace('\r',' ').replace('\n',' ').strip() for h in sheet_headers] if sheet_headers else []
    projects = []
    naguan_map = {}  # projectId -> bool
    naguan_exclude = {}  # projectId -> bool (true when naguan='否')

    for row_dict in rows:
        # 动态构建项目字段：遍历所有表头
        project = {}
        for h in clean_headers:
            if h:
                val = str(row_dict.get(h, "")).strip()
                project[h] = val

        project_id = project.get("项目编号", "").strip()
        if not project_id:
            continue

        # 纳管状态: 是/空→展示, 否→排除
        naguan_val = project.get("纳管", "").strip()
        naguan_map[project_id] = (naguan_val == "是")
        naguan_exclude[project_id] = (naguan_val == "否")

        # 项目金额
        project_amount = parse_amount(project.get("项目金额（元）", project.get("项目金额", "0")))
        project["projectAmount"] = project_amount

        # 按金额确定区间
        sheet_tier = project.get("项目分层", "").strip()
        if sheet_tier and sheet_tier in config.TIER_LABELS:
            amount_tier = sheet_tier
        else:
            amount_tier = assign_tier(project_amount)
        project["amountTier"] = amount_tier

        # 兼容旧字段名（用于分类计算）
        project["signType"] = project.get("签约形式分类", "")
        project["paymentSnapshot"] = project.get("合同验收回款时间节点截图", "")
        project["isMaintenance"] = project.get("是否维保类项目", "")
        project["projectId"] = project_id
        project["projectName"] = project.get("项目名称", "")
        project["projectType"] = project.get("项目状态", project.get("项目类型", ""))
        project["orgL4"] = project.get("项目经理L4部门", "")
        project["orgL3"] = project.get("项目经理L3-1部门", "")
        project["projectManager"] = project.get("项目经理", "")
        project["纳管"] = naguan_val

        projects.append(project)

    return projects, naguan_map, naguan_exclude, clean_headers


def compute_classification(projects):
    """计算Content 1: 项目分类分布数据
    返回 9 个分类的统计数据（count/percentage/amount），供 Treemap 使用
    """
    total = len(projects)
    total_amount = sum(p["projectAmount"] for p in projects)
    if total == 0:
        return [], total, 0

    # 1. 代理商（佳杰签约）
    agent_projs = [p for p in projects if p["signType"] == "佳杰签约"]
    # 非代理商项目
    non_agent = [p for p in projects if p["signType"] != "佳杰签约"]

    # 2-7. 按"合同验收回款时间节点截图"分类（排除代理商）
    cats_237 = [
        ("已100%回款", "已100%回款"),
        ("BH项目", "BH项目"),
        ("退货项目", "退换货项目"),
        ("已关闭项目", "项目已关闭"),
        ("0元单项目", "0元订单项目"),
        ("框架协议", "框架合同"),
    ]
    cat_results = []
    categorized_ids = set()

    for cat_name, cat_val in cats_237:
        matched = [p for p in non_agent if p["paymentSnapshot"] == cat_val and p["projectId"] not in categorized_ids]
        for p in matched:
            categorized_ids.add(p["projectId"])
        cat_count = len(matched)
        cat_amount = sum(p["projectAmount"] for p in matched)
        cat_results.append({
            "name": cat_name,
            "count": cat_count,
            "pct": round(cat_count / total * 100, 1) if total > 0 else 0,
            "amountWan": round(cat_amount / 10000, 2),
        })

    # 8. 维保类项目（排除代理商 + 未被上面分类的）
    maintenance = [p for p in non_agent if p["isMaintenance"] == "是" and p["projectId"] not in categorized_ids]
    for p in maintenance:
        categorized_ids.add(p["projectId"])
    m_count = len(maintenance)
    m_amount = sum(p["projectAmount"] for p in maintenance)
    cat_results.append({
        "name": "维保类项目",
        "count": m_count,
        "pct": round(m_count / total * 100, 1) if total > 0 else 0,
        "amountWan": round(m_amount / 10000, 2),
    })

    # 代理商
    agent_count = len(agent_projs)
    agent_amount = sum(p["projectAmount"] for p in agent_projs)
    cat_results.insert(0, {
        "name": "代理商（佳杰、方正）",
        "count": agent_count,
        "pct": round(agent_count / total * 100, 1) if total > 0 else 0,
        "amountWan": round(agent_amount / 10000, 2),
    })

    # 9. 重点关注 = 总数 - (代理商 + 已分类项目)
    categorized_all = agent_count + sum(c["count"] for c in cat_results[1:])
    focus_count = total - categorized_all
    focus_amount = total_amount - agent_amount - sum(c["amountWan"] for c in cat_results[1:]) * 10000
    cat_results.append({
        "name": "重点关注的项目",
        "count": max(focus_count, 0),
        "pct": round(max(focus_count, 0) / total * 100, 1) if total > 0 else 0,
        "amountWan": round(max(focus_amount, 0) / 10000, 2),
    })

    return cat_results, total, round(total_amount / 10000, 2)


def compute_service_groups(projects, naguan_map):
    """计算Content 2: 各L4服务组重点关注项目数"""
    # 关注列表: projects that are NOT in categories 1-8 (agent + specific types)
    agent_ids = {p["projectId"] for p in projects if p["signType"] == "佳杰签约"}
    specific_snapshots = {"已100%回款", "BH项目", "退换货项目", "项目已关闭", "0元订单项目", "框架合同"}
    specific_ids = {p["projectId"] for p in projects
                    if p["signType"] != "佳杰签约" and p["paymentSnapshot"] in specific_snapshots}
    maintenance_ids = {p["projectId"] for p in projects
                       if p["signType"] != "佳杰签约" and p["isMaintenance"] == "是"}

    excluded = agent_ids | specific_ids | maintenance_ids
    focus_projects = [p for p in projects if p["projectId"] not in excluded]

    # Group by orgL4
    groups = defaultdict(lambda: {"count": 0, "amount": 0, "naguan_count": 0})
    for p in focus_projects:
        org = p["orgL4"] or "未分配"
        groups[org]["count"] += 1
        groups[org]["amount"] += p["projectAmount"]
        if naguan_map.get(p["projectId"], False):
            groups[org]["naguan_count"] += 1

    result = []
    for org, stats in sorted(groups.items(), key=lambda x: x[1]["count"], reverse=True):
        result.append({
            "orgL4": org,
            "count": stats["count"],
            "amountWan": round(stats["amount"] / 10000, 2),
            "naguanCount": stats["naguan_count"],
        })

    return result, len(focus_projects)


def run_snapshot_pipeline(final_data, output_dir, today=None):
    """9d. 快照/diff/事件/周期对比(Phase P3, spec 3.3)。
    返回 (events_embed 新在前最多100条, period_compare dict)。
    时序: 先 diff 既有最新快照(含同日早前一次) → 算周期对比 → 再覆盖写当日快照。"""
    today = today or datetime.now().strftime("%Y-%m-%d")
    snap_dir = os.path.join(output_dir, "snapshots")
    events_path = os.path.join(output_dir, "events.json")

    cur = snapshots_mod.build_snapshot(
        today, final_data["projects"], final_data["projectPmis"], final_data["rawNodes"])

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
    return list(reversed(all_events[-100:])), period


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("[INFO] 开始数据预处理V3（合并回款节点清单 + 项目验收日期Sheet）...")

    all_nodes = []
    naguan_map = {}
    project_overview = []
    classification = []
    service_groups = []
    classification_total = 0
    classification_total_amount = 0

    # === 1. 处理合并后的回款节点清单 ===
    print("[INFO] 处理 项目回款节点（里程碑）清单...")
    sheet = load_sheet(config.SHEET_PAYMENT_NODES)
    if sheet:
        # 先用 below100 逻辑处理所有行（字段映射一致），统一标记为待修正 tier
        nodes = process_below100_nodes(sheet, "__temp__")
        # 根据实际项目金额重新分配 tier
        for node in nodes:
            node["tier"] = assign_tier(node.get("projectAmount", 0))
        # amountTier 保留 Excel"项目金额分层"列的原始值，不再用金额覆盖
        all_nodes.extend(nodes)
        print(f"  [OK] {len(nodes)} 个节点 (100万以上: {sum(1 for n in nodes if n['tier']=='100万以上')}, 50-100万: {sum(1 for n in nodes if n['tier']=='50-100万')}, 50万以下: {sum(1 for n in nodes if n['tier']=='50万以下')})")
    else:
        print("  [WARN] 未找到Sheet: 项目回款节点（里程碑）清单")

    # === 2. 处理项目验收日期Sheet ===
    print("[INFO] 处理 项目验收日期、回款条件信息收集...")
    overview_sheet = load_sheet(config.SHEET_PROJECT_OVERVIEW)
    overview_sheet_headers = []
    if overview_sheet:
        project_overview, naguan_map, naguan_exclude, overview_sheet_headers = process_project_overview(overview_sheet)
        print(f"  [OK] {len(project_overview)} 个项目, {len(overview_sheet_headers)} 列, 纳管 {sum(1 for v in naguan_map.values() if v)} 个")
    else:
        print("  [WARN] 未找到Sheet: 项目验收日期、回款条件信息收集")

    # === 3. 纳管映射关联到回款节点 ===
    # 统一以验收日期表的纳管值为标准，按项目编号关联
    for node in all_nodes:
        pid = node.get("projectId", "")
        ov_naguan = ""
        for p in project_overview:
            if p.get("projectId") == pid:
                ov_naguan = p.get("纳管", "").strip()
                break
        node["纳管"] = ov_naguan  # 直接用验收日期表的值（空/是/否）

    # === 4. 计算分类分布 (Content 1) ===
    print("[INFO] 计算项目分类分布...")
    classification, classification_total, classification_total_amount = compute_classification(project_overview)
    print(f"  [OK] {len(classification)} 个分类, 总数 {classification_total}")

    # === 5. 计算服务组重点关注 (Content 2) ===
    print("[INFO] 计算服务组重点关注项目...")
    service_groups, svc_total = compute_service_groups(project_overview, naguan_map)
    print(f"  [OK] {len(service_groups)} 个服务组, 重点关注 {svc_total} 个")

    # === 6. 计算看板首页汇总 ===
    print("[INFO] 计算看板首页汇总...")
    dashboard = compute_dashboard(all_nodes)
    # 统一项目总数：使用验收日期表的项目数 633，与分类分布一致
    if project_overview:
        dashboard["totalProjectCount"] = len(project_overview)
    # 附加 Content 1 和 Content 2 数据
    dashboard["classification"] = classification
    dashboard["classificationTotal"] = classification_total
    dashboard["classificationTotalAmountWan"] = classification_total_amount
    dashboard["serviceGroups"] = service_groups

    # === 7. 计算各层级汇总 ===
    print("[INFO] 计算各层级汇总...")
    summary = {}
    for tier in config.TIER_LABELS:
        summary[tier] = compute_tier_summary(all_nodes, tier)

    # === 8. 构建展示列配置（动态，跟随云文档列名） ===
    # 内部key → 云文档中文列名映射（从 process_below100_nodes 的 row.get() 调用提取）
    NODE_FIELD_MAP = {
        "projectId": "项目编号", "projectName": "项目名称",
        "orgL3": "项目经理L3-1部门", "orgL4": "项目经理L4部门", "projectManager": "项目经理",
        "projectType": "项目类型", "projectAmount": "项目金额", "amountTier": "项目金额分层",
        "nodeName": "里程碑节点", "planDate": "该节点计划完成时间",
        "planQuarter": "计划时间切片", "actualDate": "实际完成时间",
        "completionStatus": "里程碑节点完成情况",
        "isPaymentRelated": "是否关联回款", "planPaymentRatio": "关联回款比例",
        "actualPaymentRatio": "实际回款比例", "projectCompletion": "当前项目完成%",
        "isMilestoneAchieved": "是否已达成里程碑", "expectedMilestoneDate": "预计里程碑完成时间",
        "canAdvance": "是否增加资源是否可以提前完成里程碑计划",
        "advanceDetail": "如T列为\"是\"写明需求资源，如\"否\"写明原因",
        "blocker": "卡点", "blockerOwner": "卡点责任方",
        "nextAction": "下一步动作", "nextActionDate": "下一步动作完成时间", "remarks": "备注",
        "delayDays": "延期天数", "planMonth": "计划月份", "纳管": "纳管",
        "remarks2": "备注2", "signUnit": "签约单位",
    }
    # 从云文档 Sheet 获取实际列顺序
    node_sheet = load_sheet(config.SHEET_PAYMENT_NODES)
    node_sheet_headers = []
    if node_sheet:
        raw_headers, _ = parse_header_and_data(node_sheet)
        node_sheet_headers = [h.replace('\r\n',' ').replace('\r',' ').replace('\n',' ').strip().replace('“','"').replace('”','"').replace('‘',"'").replace('’',"'") for h in raw_headers] if raw_headers else []
    # 构建显示列：先按云文档列顺序放，再放计算字段
    internal_to_chinese = {}
    for internal_key, chinese_name in NODE_FIELD_MAP.items():
        internal_to_chinese[internal_key] = chinese_name
    # 反向映射：云文档列名 → internal_key
    chinese_to_internal = {v: k for k, v in NODE_FIELD_MAP.items()}
    hidden_cols = {"source", "tier", "nodeStatus", "expectedPayment", "actualPayment", "planMonth"}
    display_columns = {}
    for tier in config.TIER_LABELS:
        tier_nodes = [n for n in all_nodes if n["tier"] == tier]
        tier_cols = set()
        for n in tier_nodes:
            tier_cols.update(n.keys())
        cols = []
        seen = set()
        # 先按云文档列顺序添加
        for h in node_sheet_headers:
            ikey = chinese_to_internal.get(h)
            if ikey and ikey in tier_cols and ikey not in hidden_cols and ikey not in seen:
                cols.append({"key": ikey, "label": h, "visible": True})
                seen.add(ikey)
        # 再添加云文档中没有的计算字段（如 delayDays, planMonth, 纳管）
        extra_order = ["delayDays", "planMonth", "纳管", "remarks2", "signUnit"]
        for ikey in extra_order:
            if ikey in tier_cols and ikey not in hidden_cols and ikey not in seen:
                label = NODE_FIELD_MAP.get(ikey, ikey)
                cols.append({"key": ikey, "label": label, "visible": True})
                seen.add(ikey)
        # 最后添加任何遗漏的字段
        for c in sorted(tier_cols):
            if c not in hidden_cols and c not in seen:
                label = internal_to_chinese.get(c, c)
                cols.append({"key": c, "label": label, "visible": True})
                seen.add(c)
        display_columns[tier] = cols

    # 项目总览展示列：动态生成，按云文档Sheet列顺序，全部默认可见
    # 截图类列名（包含这些关键词的列自动标记为图片类型）
    image_keywords = ["截图", "图片", "image", "screenshot", "screen"]
    overview_cols = []
    for h in overview_sheet_headers:
        if h:
            is_img = any(kw in h.lower() for kw in image_keywords)
            overview_cols.append({"key": h, "label": h, "visible": True, "isImage": is_img})

    # === 9. 处理跟进记录 ===
    print("[INFO] 处理跟进记录...")
    followup_records = process_followup_records()
    
    # 将跟进记录关联到回款节点
    for node in all_nodes:
        pid = node.get("projectId", "")
        node["followupRecords"] = followup_records.get(pid, [])

    # === 9a. 读项目映射(售前↔已关闭原项目),供 PMIS 已关闭收录与项目主域使用 ===
    mapping = projects_mod.read_mapping(os.path.join(BASE_DIR, "input", config.MAPPING_FILE))
    extra_closed = {m["closed"] for m in mapping}
    if mapping:
        print(f"  [OK] 项目映射 {len(mapping)} 条(售前↔已关闭)")
    else:
        print("  [WARN] 未提供 A.xlsx 项目映射,售前服务项目将标记待映射")

    # === 9b. 摄取 PMIS 项目域(在建全量 + 已关闭∩回款),按 projectId join ===
    print("[INFO] 摄取 PMIS 项目域数据...")
    pmis_dir = os.path.join(BASE_DIR, "input", config.PMIS_DIRNAME)
    pay_projects = [{"projectId": n.get("projectId", ""), "projectName": n.get("projectName", "")}
                    for n in all_nodes]
    # 回款侧脏值:实际回款比例 > 1
    dirty = []
    for n in all_nodes:
        rnum = _get_ratio_num(n.get("actualPaymentRatio"))
        if rnum is not None and rnum > 1:
            dirty.append({"type": "回款比例>1", "projectId": n.get("projectId", ""),
                          "field": "actualPaymentRatio", "value": n.get("actualPaymentRatio")})
    project_pmis, data_quality = pmis.load_project_pmis(
        pmis_dir, pay_projects, dirty=dirty, extra_closed_ids=extra_closed)
    if data_quality["summary"]["pmisProvided"]:
        print(f"  [OK] PMIS 命中在建 {data_quality['summary']['matchedActive']} / "
              f"已关闭 {data_quality['summary']['matchedClosed']} / 未匹配 {data_quality['summary']['unmatched']}")
    else:
        print("  [WARN] 未提供 PMIS 数据(input/pmis/ 为空),数据治理视图将提示去获取")

    # === 9c. 构建项目主域(PMIS在建 ∩ 交付三部,Phase P1) ===
    print("[INFO] 构建项目主域(交付实施三部)...")
    dept_projects, projects_quality = projects_mod.load_dept_projects(
        os.path.join(BASE_DIR, "input"), project_pmis, all_nodes, mapping)
    if projects_quality["orgFile"]["provided"]:
        print(f"  [OK] 主域项目 {projects_quality['deptProjectCount']} 个, "
              f"售前已映射 {projects_quality['presaleMapped']}/{projects_quality['presaleTotal']}, "
              f"漏网告警 {len(projects_quality['managerNotInOrg'])}")
    else:
        print("  [WARN] 未提供 组织架构.xlsx,主域退化为 PMIS 在建全量")
    if not projects_quality["deliveryFile"]["provided"]:
        print("  [WARN] 未提供 delivery_analysis.xlsx,预算核算明细缺失")

    # === 10. 构建最终数据 ===
    final_data = {
        "meta": {
            "lastUpdate": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "totalProjects": dashboard["totalProjectCount"],
            "totalPaymentNodes": dashboard["totalPaymentNodes"],
        },
        "dashboard": dashboard,
        "summary": summary,
        "rawNodes": all_nodes,
        "projectOverview": {
            "projects": project_overview,
            "columns": overview_cols,
        },
        "naguanMap": {k: v for k, v in naguan_map.items()},
        "naguanExclude": {k: v for k, v in naguan_exclude.items()},
        "displayColumns": display_columns,
        "followupRecords": followup_records,
        "projectPmis": project_pmis,
        "dataQuality": data_quality,
        "projects": dept_projects,
        "projectsQuality": projects_quality,
    }

    # === 9d. 快照/diff/事件流/周期对比(Phase P3) ===
    print("[INFO] 生成快照与项目动态...")
    events_embed, period_compare = run_snapshot_pipeline(final_data, OUTPUT_DIR)
    final_data["events"] = events_embed
    final_data["periodCompare"] = period_compare
    if events_embed:
        print(f"  [OK] 新事件 {len([e for e in events_embed if e['date'] == datetime.now().strftime('%Y-%m-%d')])} 条,内嵌最近 {len(events_embed)} 条")
    else:
        print("  [INFO] 首次快照,暂无变化记录")

    # === 10. 保存（校验后输出 JSON）===
    output_file = schema.validate_and_write_json(final_data, OUTPUT_DIR)
    print("[OK] 数据已通过 schema 校验")

    print(f"\n[INFO] 数据预处理V3完成!")
    print(f"  项目总数(去重): {dashboard['totalProjectCount']}")
    print(f"  回款阶段总数: {dashboard['totalPaymentNodes']}")
    print(f"  已回款总数: {dashboard['totalPaidNodes']}")
    print(f"  分类总数: {classification_total}")
    print(f"  重点关注: {svc_total}")
    print(f"  原始节点数: {len(all_nodes)}")
    print(f"  输出文件: {output_file}")

if __name__ == "__main__":
    main()