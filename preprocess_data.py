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


def derive_tag_seed(project_rows):
    """2C 标签播种：扫 config.TAG_SEED_COLUMNS 两列文字，命中 config.TAG_SEED_WHITELIST
    的给项目挂对应标签（两列并集、去重、忽略图片公式与非白名单文字）。返回 {pid: [tag,...]}。"""
    wl = set(config.TAG_SEED_WHITELIST)
    seed = {}
    for p in project_rows or []:
        pid = str(p.get("项目编号", "")).strip()
        if not pid:
            continue
        tags = []
        for col in config.TAG_SEED_COLUMNS:
            val = str(p.get(col, "")).strip()
            if val in wl and val not in tags:
                tags.append(val)
        if tags:
            seed[pid] = tags
    return seed


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
    return list(reversed(all_events[-100:])), period


def backfill_final_acceptance(project_pmis, project_milestones):
    """把里程碑计划终验/服务完成日回填到 project_pmis[pid].progress.终验时间(就地修改)。"""
    for pid, pm in project_pmis.items():
        ptype = (pm.get("status") or {}).get("项目类型")
        (pm.setdefault("progress", {}))["终验时间"] = milestones_mod.final_acceptance_date(
            project_milestones.get(pid, []), ptype)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("[INFO] 开始数据预处理V3（合并回款节点清单 + 项目验收日期Sheet）...")

    naguan_map = {}
    project_overview = []
    classification = []
    service_groups = []
    classification_total = 0
    classification_total_amount = 0

    # === 2. 处理项目验收日期Sheet ===
    print("[INFO] 处理 项目验收日期、回款条件信息收集...")
    overview_sheet = load_sheet(config.SHEET_PROJECT_OVERVIEW)
    overview_sheet_headers = []
    if overview_sheet:
        project_overview, naguan_map, naguan_exclude, overview_sheet_headers = process_project_overview(overview_sheet)
        print(f"  [OK] {len(project_overview)} 个项目, {len(overview_sheet_headers)} 列, 纳管 {sum(1 for v in naguan_map.values() if v)} 个")
    else:
        print("  [WARN] 未找到Sheet: 项目验收日期、回款条件信息收集")

    # === 4. 计算分类分布 (Content 1) ===
    print("[INFO] 计算项目分类分布...")
    classification, classification_total, classification_total_amount = compute_classification(project_overview)
    print(f"  [OK] {len(classification)} 个分类, 总数 {classification_total}")

    # === 5. 计算服务组重点关注 (Content 2) ===
    print("[INFO] 计算服务组重点关注项目...")
    service_groups, svc_total = compute_service_groups(project_overview, naguan_map)
    print(f"  [OK] {len(service_groups)} 个服务组, 重点关注 {svc_total} 个")

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
    # 换源:pay_projects 改由 project_overview 取,不再遍历 all_nodes
    pay_projects = [{"projectId": p.get("projectId", ""), "projectName": p.get("projectName", "")}
                    for p in project_overview]
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
    _today = datetime.now().strftime("%Y-%m-%d")
    collection_stages = collection_mod.load_collection_stages(
        os.path.join(BASE_DIR, "input"), _today)
    payment_nodes = {}
    for p in dept_projects:
        _pid = p["projectId"]
        _rid = p.get("relatedClosedId") or ""
        _eff, _from_origin = _pid, False
        if not _pmis_contract(_pid) and _rid and _pmis_contract(_rid):
            _eff, _from_origin = _rid, True
        # 节点按 eff 取(售前=原项目);流水本项目优先,缺再回退原项目
        _rec = payment_records.get(_pid) or (payment_records.get(_rid) if _rid else None)
        _nodes = collection_stages.get(_eff) or []
        _summary = projects_mod.build_payment_summary(_pmis_contract(_eff), _nodes, _rec)
        _summary["fromOrigin"] = _from_origin
        p["paymentPmis"] = _summary
        payment_nodes[_pid] = _nodes
        p["payment"] = projects_mod.aggregate_payment_pmis(_nodes)
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

    # === 10. 构建最终数据 ===
    final_data = {
        "meta": {
            "lastUpdate": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "totalProjects": len(dept_projects),
            "totalClosed": projects_quality.get("closedDeptCount", 0),
            "totalPaymentNodes": sum(len(v) for v in payment_nodes.values()),
        },
        "projectOverview": {
            "projects": project_overview,
            "columns": overview_cols,
        },
        "naguanMap": {k: v for k, v in naguan_map.items()},
        "naguanExclude": {k: v for k, v in naguan_exclude.items()},
        "followupRecords": followup_records,
        "projectPmis": project_pmis,
        "dataQuality": data_quality,
        "projects": dept_projects,
        "projectsQuality": projects_quality,
        "projectMilestones": project_milestones,
        "paymentRecords": payment_records,
        "paymentNodes": payment_nodes,
        "projectProfit": project_profit,
        "tagSeed": derive_tag_seed(project_overview),
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
    print(f"  项目总数(验收日期表): {len(project_overview)}")
    print(f"  回款阶段总数(收款阶段节点): {sum(len(v) for v in payment_nodes.values())}")
    print(f"  分类总数: {classification_total}")
    print(f"  重点关注: {svc_total}")
    print(f"  输出文件: {output_file}")

if __name__ == "__main__":
    main()