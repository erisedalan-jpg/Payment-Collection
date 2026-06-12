# config.py
"""集中配置常量：消除散落在 preprocess_data.py 各处的硬编码。"""

# ── 云文档 Sheet 名 ──
SHEET_PAYMENT_NODES = "项目回款节点（里程碑）清单"
SHEET_PROJECT_OVERVIEW = "项目验收日期、回款条件信息收集"
SHEET_FOLLOWUP = "项目回款跟进记录"

# ── 金额分层阈值（元）与标签 ──
TIER_ABOVE_1M = 1_000_000
TIER_ABOVE_500K = 500_000
TIER_ABOVE_1M_LABEL = "100万以上"
TIER_MID_LABEL = "50-100万"
TIER_BELOW_500K_LABEL = "50万以下"
TIER_LABELS = [TIER_ABOVE_1M_LABEL, TIER_MID_LABEL, TIER_BELOW_500K_LABEL]

# ── Excel 序列号合理范围 ──
EXCEL_SERIAL_MIN = 40000
EXCEL_SERIAL_MAX = 60000

# ── 节点状态枚举（判定优先级顺序）──
STATUS_CAN_ADVANCE = "加资源可提前"
STATUS_REACHED = "达到回款条件"
STATUS_ADVANCE_PAID = "已提前回款"
STATUS_FULL_PAID = "已全额回款"
STATUS_DELAYED = "延期"
STATUS_ON_TIME = "正常实施中"
NODE_STATUSES = [
    STATUS_CAN_ADVANCE, STATUS_REACHED, STATUS_ADVANCE_PAID,
    STATUS_FULL_PAID, STATUS_DELAYED, STATUS_ON_TIME,
]

# ── 项目健康度:里程碑进度状态的"滞后类"关键词(命中任一即进度异常,取值域实测:正常/延期/严重延期/超期未发布) ──
MILESTONE_DELAYED_KEYWORDS = ("滞后", "延期", "超期")

# ── PMIS 数据(项目域)──
PMIS_DIRNAME = "pmis"  # 位于 input/pmis/
# 在建四表 + 已关闭三表(风险无已关闭变体);键=逻辑名,值=固定文件名
PMIS_FILES_ACTIVE = {
    "center": "项目中心.xlsx",
    "base": "项目基础信息数据.xlsx",
    "status": "项目状态信息数据.xlsx",
    "risk": "项目风险数据.xlsx",
}
PMIS_FILES_CLOSED = {
    "center": "项目中心-已关闭.xlsx",
    "base": "项目基础信息数据-已关闭.xlsx",
    "status": "项目状态信息数据-已关闭.xlsx",
}
# 里程碑两表(Phase R1,位于 input/pmis/)
MILESTONE_FILE_ACTIVE = "在建项目里程碑计划数据.xlsx"
MILESTONE_FILE_CLOSED = "已结项里程碑计划数据.xlsx"
PMIS_HEADER_ROW = 2  # PMIS 表表头在第 2 行(第 1 行为合并标题)

# ── 项目主域输入文件(Phase P,位于 input/ 根) ──
ORG_FILE = "组织架构.xlsx"
MAPPING_FILE = "A.xlsx"
DELIVERY_FILE = "delivery_analysis.xlsx"
INPUT_UPLOAD_NAMES = [ORG_FILE, MAPPING_FILE, DELIVERY_FILE]
DEPT_L3 = "交付实施三部"
PRESALE_PREFIX = "售前服务"
DELIVERY_COST_CATEGORIES = [
    "交付外包服务成本", "交付部门人工成本", "项目直接成本", "差旅费",
    "业务招待费", "本地交通及通讯费", "其他费用",
]

# 项目阶段推进顺序(周期对比"阶段推进"判定;真实取值域: 启动/规划/执行/收尾)
STAGE_ORDER = ("项目启动", "项目规划", "项目执行", "项目收尾")
