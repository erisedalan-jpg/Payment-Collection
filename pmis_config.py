"""pmisdata/config.json 的 session_cookie 读写(独立纯函数,供 server 端点与测试复用)。"""
import json
import os
import re
import time

_SESSION_RE = re.compile(r'SESSION=([^;]+)')

# pmisdata/config.json 的默认内容(不含 cookie —— 凭证只在运行时写入)。
# 为什么要有它:交付一台新机器时 pmisdata/ 整个目录都不存在,而 write_session_cookie
# 第一步就 open(...,'r'),于是首次点「获取 PMIS Cookie」必然报
# 「写入失败: [Errno 2] No such file or directory: ...pmisdata/config.json」
# (V4.5.17 交付机实测)。只补一个 {"session_cookie": ...} 不够 —— 下载脚本
# (fetch_pmis_tables / fetch_all_projects / delivery_analysis)读的是同一个文件里的
# 十几个配置项,缺了它们下载会换一种方式失败。所以模板必须完整。
# 取自现网配置,仅剔除凭证;各键含义见其相邻的 _*_说明 键。
DEFAULT_CONFIG = {
    "_说明": "PMIS 项目损益分析脚本 - 配置文件。修改此文件后直接运行脚本即可，无需改动脚本代码。",
    "base_url": "https://pmis.qianxin-inc.cn",
    "request_delay": 0.3,
    "page_size": 100,
    "max_workers": 12,
    "_max_workers_说明": "并发请求线程数。内网接口建议 8-16；设为 1 即退回串行。越大越快，但可能触发风控。",
    "max_retries": 3,
    "_max_retries_说明": "单个请求遇网络/超时/坏 JSON 时的最大尝试次数（含首次），指数退避重试。",
    "retry_backoff": 0.5,
    "_retry_backoff_说明": "重试退避基数（秒），第 n 次重试等待 retry_backoff * 2^(n-1)。",
    "checkpoint_every": 50,
    "_checkpoint_every_说明": "每处理 N 个项目保存一次断点。崩溃时最多丢失这 N 个的进度。越小越安全但写盘更频繁。",
    "max_projects": 0,
    "_max_projects_说明": "限制处理的活跃项目数（0=全部）。改新流程后先设为 10-20 跑一遍快速验证，确认无误再设回 0。",
    "output_dir": "",
    "_output_dir_说明": "留空则输出到脚本所在目录，否则填写绝对路径",
    "bridge_excel": "A.xlsx",
    "_bridge_excel_说明": "SF-SS 桥接表，包含 A列(SF项目编号) B列(负责人) C列(SS项目编号/合同编号)。如不需要桥接，可留空。",
    "use_local_project_list": True,
    "_use_local_project_list_说明": "true=项目列表从本地 Excel 读取（不调列表接口）；缺文件自动回退 API。false=始终走 API。",
    "project_list_active_excel": "项目基础信息数据.xlsx",
    "project_list_closed_excel": "项目基础信息数据-已关闭.xlsx",
    "_project_list_excel_说明": "本地项目基础信息表（活跃/已关闭）。表头需含'项目编号''合同编号'等列；本地表无 projId/wbsId，合同项目改用合同号取损益。",
    "output_mode": "compact",
    "_output_mode_说明": "standard = 收入/成本/毛利/毛利率均保留 L0-L2（三级）; compact = 成本保留 L0-L2（三级），收入/毛利/毛利率仅保留 L0（一级汇总），大幅减少列数。",
    "fetch_budget": True,
    "_fetch_budget_说明": "是否同步获取预算/概算/核算三维科目数据 (getBudgetJson.pd)。需项目有合同号或桥接。默认 false。",
    "fetch_payment": True,
    "_fetch_payment_说明": "是否同步获取回款记录 (getPaymentCollectionsJSONList.pd)。需项目有合同号或桥接。默认 false。",
    "fetch_collection_stages": True,
    "_fetch_collection_stages_说明": "是否同步获取合同回款阶段数据 (getCollectionStagesJSONList.pd)。需项目有合同号或桥接。默认 false。",
    "auto_resume": True,
    "_auto_resume_说明": "检测到中断进度时是否自动续跑。true=自动续跑不询问, false=每次询问。默认 true。",
    "phases": {
        "_说明": "各阶段独立开关。关闭则跳过该阶段（但仍可从已有 checkpoint 加载数据供后续阶段使用）。",
        "profit_loss": True,
        "bridge": True,
        "budget": True,
        "payment": True,
        "collection_stages": True
    }
}


def _load_or_default(config_path):
    """读现有配置;【只有文件不存在】才用默认模板起底。

    坏 JSON 不走模板而是让 json.load 抛出去 —— 那说明用户有一份配置只是坏了,
    静默套模板会把他改过的并发数、阶段开关一起抹掉。两种情况必须区别对待。"""
    if not os.path.exists(config_path):
        return dict(DEFAULT_CONFIG)
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)



def session_preview(cookie):
    """取 cookie 串里 SESSION 值前 8 位;无则空串。"""
    m = _SESSION_RE.search(cookie or '')
    return m.group(1)[:8] if m else ''


def write_session_cookie(config_path, cookie):
    """把 session_cookie 写回 config.json,保留其余键,原子替换。
    文件/目录不存在则按 DEFAULT_CONFIG 创建(首次部署的正常路径)。
    cookie 必须非空且含 'SESSION='。返回 SESSION 前 8 位预览。"""
    cookie = (cookie or '').strip()
    if not cookie or 'SESSION=' not in cookie:
        raise ValueError('cookie 为空或缺少 SESSION')
    config = _load_or_default(config_path)
    config['session_cookie'] = cookie
    parent = os.path.dirname(config_path)
    if parent:
        os.makedirs(parent, exist_ok=True)      # 交付机上 pmisdata/ 这个目录本身也不存在
    tmp = config_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    os.replace(tmp, config_path)
    return session_preview(cookie)


def read_session_status(config_path):
    """返回 {sessionPreview, updatedAt}。文件不存在/坏 JSON 返回空串。"""
    try:
        mtime = os.path.getmtime(config_path)
        with open(config_path, 'r', encoding='utf-8') as f:
            cookie = json.load(f).get('session_cookie', '')
    except (OSError, ValueError):
        return {'sessionPreview': '', 'updatedAt': ''}
    return {
        'sessionPreview': session_preview(cookie),
        'updatedAt': time.strftime('%Y-%m-%d %H:%M', time.localtime(mtime)),
    }
