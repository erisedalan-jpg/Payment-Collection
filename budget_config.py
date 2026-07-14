# budget_config.py
"""概算工具:费率与目录配置(超管可配)。纯标准库 + 原子读写,可单测。

为什么要有这个文件:原工具 CostBudgetEstimate.html 把汇率(6.8,还直接写在函数体里)、
人天单价、住宿/差补标准、销售物料单价、成本比例阈值(3%~15%)、19 个产品与 8 项服务的
目录全部硬编码,多处还在 HTML 和 JS 里各写一遍(两份真相源)。价格是会变的,而后继管理员
根本无从得知这些数字从哪来。本模块把它们全部提升为服务端配置,超管在 /budget 页内可见可改,
改完立即生效(前端按配置现算,不必重跑任何管线)。

默认值 = 原工具现值,保证开箱即用时与历史报价口径一致。

销售物料单价与毛利率解耦:原工具只配了 13% 一档的单价表(SALES_PRICES = {0.13: {...}}),
选 6% 时 SALES_PRICES[0.06] 是 undefined、代码静默回退用 13% 的单价。重构后单价就是
一套(salesPrices,不分档位),毛利率只作为 (1 + margin) 的乘数;为了让销售下单的逆运算
能对得上,salesPrices 的键必须与 materials 的 key 一一对应,validate_config 强制校验。
"""
from __future__ import annotations

import copy
import json
import os
from typing import Any, Dict, List

CONFIG_VERSION = 1

# —— 防呆上限(挡住误操作/恶意超大 body,不是业务限制) ——
MAX_PRODUCTS = 200
MAX_PM_PHASES = 50
MAX_SERVICES = 100
MAX_NAME_LEN = 100
MAX_DESC_LEN = 4000

# 说明:长中文段落(stdDesc/nonstdDesc/PM content/service desc)从
# CostBudgetEstimate.html 行 1428-1467 原样抄录,含 \n 换行。
_PRODUCTS: List[Dict[str, Any]] = [
    {"id": "1.1", "name": "防火墙", "coefficient": 0.8, "stdDays": 1.5,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）了解客户需求，随后编制实施方案（120分钟）；\n2、进入设备部署服务阶段，先进行部署环境准备与确认",
     "nonstdDesc": "防火墙实施复杂场景，比如\n1、分支机构建设，通过环境调研与方案编制，确保分支与总部协同；\n2、技术实施层面，完成防火墙软件部署、VPN及高级网络配置，同步实施集中管理与设备联动配置等"},
    {"id": "1.2", "name": "天擎V10", "coefficient": 0.6, "stdDays": 2.0,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（120分钟）对客户现有终端资产及风险进行全面摸排，并将防护需求转化为标准策略配置清单，随后编制实施方案（120分钟）",
     "nonstdDesc": "天擎迁移、培训，预计2人天"},
    {"id": "1.3", "name": "天眼", "coefficient": 0.8, "stdDays": 1.0,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）勘察网络架构（单出口、扁平网络等），确认镜像流量，将客户侧安全检测的需求转化为威胁检测规则并确认关键",
     "nonstdDesc": "天眼实施复杂场景，比如\n1、跨数据中心，多分支机构建设，通过环境调研与方案编制，确保分支与总部协同；\n2、技术实施层面，完成天眼软件化部署、扩展节点部署，级联部署，多产品联动"},
    {"id": "1.4", "name": "NGSOC", "coefficient": 0.6, "stdDays": 2.0,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）勘察网络架构，确认镜像流量，并将客户侧的安全运营需求转化为策略规则，随后编制实施方案（120分钟）",
     "nonstdDesc": "NGSOC实施复杂场景，比如\n1、跨数据中心，多分支机构建设，通过环境调研与方案编制，确保分支与总部协同；\n2、技术实施层面，完成NGSOC集群部署、扩展节点部署，级联部署以及多产品设备联动配置"},
    {"id": "1.5", "name": "入侵防御系统（IPS）", "coefficient": 0.8, "stdDays": 1.5,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）勘察网络架构及环境，确认关键业务访问权限并将安全需求转化为策略规则",
     "nonstdDesc": "IPS实施复杂场景，比如\n1、跨数据中心，多分支机构建设；\n2、技术实施层面，完成高可用性部署以及多产品设备联动配置"},
    {"id": "1.6", "name": "日志审计（LAS）", "coefficient": 0.8, "stdDays": 1.5,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）勘察网络架构及环境，将客户侧明确的日志留存、安全审计需求转化为策略规则",
     "nonstdDesc": "1.客户端100点，需要教会客户后，客户自行安装\n2.产品使用培训"},
    {"id": "1.7", "name": "漏洞扫描", "coefficient": 0.8, "stdDays": 1.0,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）勘察网络架构，确认关键业务访问权限并将安全需求转化为策略规则",
     "nonstdDesc": "漏洞扫描产品实施复杂场景，比如\n1、跨数据中心，多分支机构建设；\n2、最终开展知识转移培训并配合客户验收或测评工作"},
    {"id": "1.8", "name": "代码审计", "coefficient": 0.8, "stdDays": 1.0,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）勘察网络架构，确认关键业务访问权限并将安全需求转化为策略规则",
     "nonstdDesc": "代码审计产品实施复杂场景，比如\n1、技术实施层面，完成代码卫士集群部署配置；\n2、最终开展知识转移培训并配合客户验收或测评工作"},
    {"id": "1.9", "name": "准入", "coefficient": 0.8, "stdDays": 1.5,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）勘察网络架构，确认关键业务访问权限并将安全需求转化为策略规则",
     "nonstdDesc": "准入产品实施复杂场景，比如\n1、802.1x准入部署场景，通过环境调研与方案编制，确保入网合规要求；\n2、技术实施层面，完成安全策略与访问控制配置、客户端批量安装部署以及多产品设备联动配置等"},
    {"id": "1.10", "name": "堡垒机", "coefficient": 0.8, "stdDays": 1.5,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）勘察网络架构，确认关键业务访问权限并将安全需求转化为策略规则",
     "nonstdDesc": "堡垒机产品实施复杂场景，比如\n1、复杂的运维流程和要求；\n2、技术实施层面，完成高可用部署、应用发布服务器部署、手动资源录入以及多产品设备联动配置等"},
    {"id": "1.11", "name": "WAF", "coefficient": 0.8, "stdDays": 1.5,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）勘察网络架构，确认关键业务访问权限并将安全需求转化为策略规则",
     "nonstdDesc": "WAF产品实施复杂场景，比如\n1、多产品部署、多厂商整体安全解决方案等；\n2、技术实施层面，完成高级安全策略配置、高可用配置以及多产品设备联动配置等"},
    {"id": "1.12", "name": "数据库审计与防护系统（DAS）", "coefficient": 0.8, "stdDays": 1.2,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）重点识别数据库业务流量路径，将数据库安全需求转化为审计策略规则",
     "nonstdDesc": "DAS产品实施复杂场景，比如\n1、多节点协同部署方案；\n2、技术实施层面，完成高级审计规则与策略配置以及多产品设备联动配置等"},
    {"id": "1.13", "name": "SSL VPN", "coefficient": 0.8, "stdDays": 1.6,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）勘察网络架构，确认关键业务访问权限并将安全需求转化为策略规则",
     "nonstdDesc": "SSL VPN产品实施复杂场景，比如\n1、复杂的客户认证需求及业务资源访问需求；\n2、技术实施层面，完成高可用部署以及多产品设备联动配置等"},
    {"id": "1.14", "name": "入侵检测系统（IDS）", "coefficient": 0.8, "stdDays": 1.0,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段。\n1、在项目前期规划服务中，服务团队首先通过环境调研咨询（30分钟）勘察网络架构，确认关键业务访问权限并将安全需求转化为策略规则",
     "nonstdDesc": "IDS产品实施复杂场景，比如\n1、技术实施层面，完成高可用性部署以及多产品设备联动配置等；\n2、项目推进中，组织上线方案评审把控风险"},
    {"id": "1.15", "name": "云安全管理平台CSMP", "coefficient": 0.6, "stdDays": 6.375,
     "stdDesc": "标准实施服务包含项目前期规划、设备部署、上线保障及交付验收四个阶段\n1、在项目前期规划服务中：服务团队首先开展环境调研咨询（60分钟），重点勘察客户网络架构、梳理云主机资产分布、VPC划分及现有安全设备部署情况",
     "nonstdDesc": "CSMP产品实施复杂场景，比如\n1、多安全组件，业务资源分布多，有合规需求及租户需求等；\n2、技术实施层面，完成CSMP集群单台节点扩容以及多产品设备联动配置等"},
    {"id": "1.16", "name": "椒图", "coefficient": 0.6, "stdDays": 1.6,
     "stdDesc": "标准实施服务分为项目前期规划、设备部署、上线保障及交付验收四阶段\n1、在项目前期规划服务中：服务团队开展环境调研咨询（30分钟），全面摸排客户终端资产、安全配置、风险隐患及管理流程，将终端安全防护需求转化为防护策略并输出标准配置清单",
     "nonstdDesc": "非标准实施复杂场景，比如\n1、复杂场景涉及多站点、旧版本升级的环境调研及实施方案编写工作\n2、设备部署：服务器安全管理系统单节点扩容、客户端批量安装部署、应用防护插件安装等"},
    {"id": "1.17", "name": "网闸", "coefficient": 0.8, "stdDays": 1.4,
     "stdDesc": "标准实施服务分为项目前期规划、设备部署、上线保障及交付验收四阶段\n1、在项目前期规划服务中：服务团队开展环境调研咨询（30分钟），勘察网络架构、机柜部署等环境，将客户安全需求转化为策略规则并确认关键业务访问权限",
     "nonstdDesc": "网闸产品实施复杂场景，比如\n1、技术实施层面，完成复杂的策略（10条以上）、数据库同步模块、视频模块配置等；\n2、项目推进中，组织上线方案评审把控风险"},
    {"id": "1.18", "name": "零信任", "coefficient": 0.8, "stdDays": 3.0,
     "stdDesc": "标准实施服务分为项目前期规划、设备部署、上线保障及交付验收四阶段\n1、在项目前期规划服务中：服务团队开展环境调研咨询（30分钟），勘察网络架构（含单出口、扁平网络等）、机柜部署等，梳理对接身份源、历史VPN等信息，将客户安全需求转化为策略规则",
     "nonstdDesc": "零信任产品实施复杂场景，比如\n1、多节点协同部署方案；\n2、技术实施层面，完成集群部署（2TAC+1TAP）、访问控制台系统部署、应用代理部署、客户端批量安装部署、高级安全配置及多设备联动配置"},
    {"id": "1.19", "name": "上网行为管理", "coefficient": 0.8, "stdDays": 1.5,
     "stdDesc": "标准实施服务分为项目前期规划、设备部署、上线保障及交付验收四个阶段\n1、在项目前期规划阶段：环境调研咨询（60分钟），为客户提供网络架构及环境勘察服务（涵盖单出口、扁平网络、少量设备、拓扑简单及设备机柜部署位置等）",
     "nonstdDesc": "上网行为管理产品实施复杂场景，比如\n1、多出口、多节点协同部署方案；\n2、技术实施层面，完成软件部署、手动资源录入、外置数据中心配置、高级安全配置及多设备联动配置等"},
]

_PM_PHASES: List[Dict[str, Any]] = [
    {"name": "项目启动阶段",
     "content": "【标准工作内容】\n1、组织开展项目开工会，确认公司参与项目成员，确认项目基本信息，建立沟通机制，确保项目顺利启动\n2、投入必要资源参与同客户、渠道的沟通，确认项目背景与业务边界\n3、了解项目当前所处阶段与主要里程碑，制定详细项目计划\n4、与客户充分沟通当前需求后，将需求转化为可执行实施工作说明书120人天；客户通过周报确认项目执行计划\n5、投入必要资源参与项目变更管理，确认项目执行过程中的变更范围\n\n【客户参与事项】\n6、提供必要的项目配合与资源支持，确认关键业务负责人与权限分配，将项目从销售转移至项目管理阶段"},
    {"name": "项目规划阶段",
     "content": "【标准工作内容】\n1、开展客户环境调研与现场勘察，确认项目实施环境与设备到货时间\n2、组织编写实施工作计划说明书，明确项目关键里程碑与责任人，确认项目人员分工\n3、开展差异分析，输出差异对比表，明确项目实施策略与计划\n\n【客户参与事项】\n4、投入必要资源协助确认客户现场环境与设备存放位置，提供必要的安全产品初始账号"},
    {"name": "项目执行阶段",
     "content": "【标准工作内容】\n1、组织设备到货验收与开箱验货，核对设备标签与合同一致\n2、组织开展设备安装、上架、加电及初始化配置\n3、组织开展设备网络调试，验证设备路由、策略、控制台连通性\n4、组织开展设备功能调试、业务割接、漏洞验证与安全设备调优\n5、组织开展功能验证与业务割接，确认业务系统平稳运行\n\n【客户参与事项】\n6、投入必要资源参与业务割接、需求确认"},
    {"name": "项目收尾阶段",
     "content": "【标准工作内容】\n1、编写项目验收同客户签字的交付物清单，完成设备验收、文档交付\n2、确认并与客户确认培训内容及时间\n3、编写客户运维手册与培训手册，确认项目文档归档\n4、完成项目关闭报告PPT，开展项目验收会，编写项目总结报告\n\n【客户参与事项】\n5、与客户确认项目交付培训与后续运维沟通机制，确认后续运维支持"},
    {"name": "其他工作",
     "content": "标准场景：\n1、客户侧沟通汇报（交付周期中平均每周0.5人天）。\n2、项目组内部例会（交付周期中平均每周0.5人天）。\n特殊场景可继续往下增加内容\n3、客户是否要求驻场（需按实际情况评估，有些项目中需要帮客户整理材料、跑腿等）。"},
]

_SERVICES: List[Dict[str, Any]] = [
    {"name": "变更协调服务",
     "desc": "在合同计划产品交付范围内，原厂工程师提供出差现场支持，通过远程协同、电话会议、即时通讯等方式提供远程支持"},
    {"name": "变更驻场服务",
     "desc": "提供客户现场的变动协同支持，现场支持服务包含实施与交付工作的协调"},
    {"name": "巡检服务",
     "desc": "通过对公司客户绑定的安全设备安全系统进行漏洞扫描、策略调优、安全审计与固件评估，核实设备初始保障与安全防护状态"},
    {"name": "设备搬迁服务",
     "desc": "应客户需求将设备从甲方原机房迁移到目标机房，配合客户完成设备搬迁"},
    {"name": "应急响应",
     "desc": "当客户发生安全事件，应急保障响应时间内，提供原厂工程师以专业能力提供应急响应服务"},
    {"name": "特别值守服务",
     "desc": "在重大活动保障时间内在，如十一、双十一等，为了保证产品运行稳定，联动厂商提供专业值守方式提供技术支持"},
    {"name": "能力赋能服务",
     "desc": "为客户输出运维能力提升计划，输出能力提升培训、认证推荐路径等"},
    {"name": "其他服务", "desc": "用户自定义服务项", "isOther": True},
]

# 物料 key 的白名单。**不是**装饰性的常量:前端 MaterialKey 是写死的四元联合,
# calcSalesOrder 的 cost 记录也只有这四个键。超管手改 data/budget_config.json(明文 JSON,
# 手改是合理的管理员操作)加进第 5 个物料,若后端放行,前端 qty[key] 就是 undefined、
# amount = NaN —— 销售下单建议整表和导出的 Excel 全是 NaN。要加物料,前后端必须一起改。
ALLOWED_MATERIAL_KEYS = ("pm", "pm2ndc", "eng1stc", "eng2ndc")

# 销售物料。key 是内部归一化后的键(与原 HTML 里的 data-material 属性一一对应:
# pm / pm-2ndc / 1stc / 2ndc → pm / pm2ndc / eng1stc / eng2ndc),
# 必须与 DEFAULT_CONFIG["salesPrices"] 的键一一对应(见 validate_config)。
_MATERIALS: List[Dict[str, str]] = [
    {"key": "pm", "code": "JY-CPJF-OTHER-PM",
     "name": "其他交付服务 – 一线城市人天服务 - 项目经理"},
    {"key": "pm2ndc", "code": "JY-CPJF-OTHER-PM-2NDC-PISN",
     "name": "其他交付服务 - 二线城市人天服务 - 项目经理"},
    {"key": "eng1stc", "code": "JY-CPJF-AZ-OTHER-1STC-ENG",
     "name": "其他交付服务 - 一线城市人天服务 - 工程师"},
    {"key": "eng2ndc", "code": "JY-CPJF-AZ-OTHER-2NDC-ENG",
     "name": "其他交付服务 - 二线城市人天服务 - 工程师"},
]

DEFAULT_CONFIG: Dict[str, Any] = {
    "version": CONFIG_VERSION,
    # 人天成本单价(内部成本)。城市分类:一类/二类
    "rates": {
        "city1": {"pm": 2000, "tech": 1300, "out": 1000},
        "city2": {"pm": 1500, "tech": 1000, "out": 800},
    },
    # 销售物料单价(对外报价)。与毛利率**无关** —— 原工具只配了 13% 一档,选 6% 会静默
    # 回退用 13% 的单价;重构后单价就是一套,毛利率只作为 (1 + margin) 的乘数。
    "salesPrices": {"pm": 2400, "pm2ndc": 1800, "eng1stc": 1500, "eng2ndc": 1200},
    "materials": _MATERIALS,
    # 住宿标准。注意:住宿的城市分类(一线/省会/其他/港澳)与人工成本的城市分类(一类/二类)
    # 是两套互不相干的口径,外包差旅又用回一类/二类。这是原工具的既定事实,不要合并。
    "hotel": {"type1": 450, "capital": 350, "other": 300,
              "hk": 125, "outType1": 300, "outType2": 230},
    "allowance": {"dom": 150, "intl": 75},   # 境内 元/天;境外 美金/天
    "fx": 6.8,                                # 美元汇率
    "margins": [
        {"value": 0.13, "label": "13%（含产品）"},
        {"value": 0.06, "label": "6%（纯服务）"},
    ],
    "ratio": {"min": 3, "max": 15},           # 成本比例正常区间(闭区间),单位 %
    "products": _PRODUCTS,
    "pmPhases": _PM_PHASES,
    "services": _SERVICES,
}


def default_config() -> Dict[str, Any]:
    """深拷贝 —— 调用方改了返回值不会污染下一次。"""
    return copy.deepcopy(DEFAULT_CONFIG)


def _pos_number(v: Any, label: str) -> float:
    """必须是 > 0 的数(bool 不算数,Python 里 True 是 int 的子类)。"""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError("%s 必须是数字" % label)
    if v <= 0:
        raise ValueError("%s 必须大于 0" % label)
    return float(v)


def _nonneg_number(v: Any, label: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError("%s 必须是数字" % label)
    if v < 0:
        raise ValueError("%s 不能为负" % label)
    return float(v)


def _text(v: Any, label: str, max_len: int, required: bool = True) -> str:
    if not isinstance(v, str):
        raise ValueError("%s 必须是字符串" % label)
    s = v.strip()
    if required and not s:
        raise ValueError("%s 不能为空" % label)
    if len(s) > max_len:
        raise ValueError("%s 过长(上限 %d)" % (label, max_len))
    return s


def validate_config(cfg: Any) -> Dict[str, Any]:
    """校验并归一化。非法 → ValueError(带可读原因,直接回给前端)。

    归一化:数值统一转 float;字符串 strip;缺失的可选字段补默认。
    """
    if not isinstance(cfg, dict):
        raise ValueError("配置必须是对象")

    out: Dict[str, Any] = {"version": CONFIG_VERSION}

    # 人天成本单价
    rates_in = cfg.get("rates")
    if not isinstance(rates_in, dict):
        raise ValueError("rates 必须是对象")
    rates: Dict[str, Any] = {}
    for city in ("city1", "city2"):
        blk = rates_in.get(city)
        if not isinstance(blk, dict):
            raise ValueError("rates.%s 必须是对象" % city)
        rates[city] = {k: _pos_number(blk.get(k), "%s.%s 人天单价" % (city, k))
                       for k in ("pm", "tech", "out")}
    out["rates"] = rates

    # 销售物料单价 + 物料目录(键必须一一对应,否则销售下单逆运算会对不上)
    materials_in = cfg.get("materials")
    if not isinstance(materials_in, list) or not materials_in:
        raise ValueError("materials 不能为空")
    materials: List[Dict[str, str]] = []
    for m in materials_in:
        if not isinstance(m, dict):
            raise ValueError("materials 条目必须是对象")
        materials.append({
            "key": _text(m.get("key"), "物料 key", MAX_NAME_LEN),
            "code": _text(m.get("code"), "物料编号", MAX_NAME_LEN),
            "name": _text(m.get("name"), "物料名称", MAX_NAME_LEN),
        })
    keys = [m["key"] for m in materials]
    if len(set(keys)) != len(keys):
        raise ValueError("物料 key 不能重复")
    # key 集合钉死:前端只认这四个键,多一个/少一个/改个名都会让销售下单建议算出 NaN。
    if set(keys) != set(ALLOWED_MATERIAL_KEYS):
        raise ValueError("物料 key 必须正好是 %s(前端只认这四个键;要加物料须前后端一起改)"
                         % "、".join(ALLOWED_MATERIAL_KEYS))
    out["materials"] = materials

    sp_in = cfg.get("salesPrices")
    if not isinstance(sp_in, dict):
        raise ValueError("salesPrices 必须是对象")
    if set(sp_in) != set(keys):
        raise ValueError("salesPrices 的键必须与 materials 的 key 一一对应")
    out["salesPrices"] = {k: _pos_number(sp_in.get(k), "%s 销售单价" % k) for k in keys}

    # 住宿 / 差补 / 汇率
    hotel_in = cfg.get("hotel")
    if not isinstance(hotel_in, dict):
        raise ValueError("hotel 必须是对象")
    out["hotel"] = {k: _pos_number(hotel_in.get(k), "%s 住宿标准" % k)
                    for k in ("type1", "capital", "other", "hk", "outType1", "outType2")}

    al_in = cfg.get("allowance")
    if not isinstance(al_in, dict):
        raise ValueError("allowance 必须是对象")
    out["allowance"] = {k: _pos_number(al_in.get(k), "%s 差补标准" % k) for k in ("dom", "intl")}

    out["fx"] = _pos_number(cfg.get("fx"), "汇率")

    # 毛利率档位
    margins_in = cfg.get("margins")
    if not isinstance(margins_in, list) or not margins_in:
        raise ValueError("毛利率档位不能为空")
    margins = []
    for m in margins_in:
        if not isinstance(m, dict):
            raise ValueError("毛利率档位必须是对象")
        v = m.get("value")
        if isinstance(v, bool) or not isinstance(v, (int, float)) or v < 0 or v >= 1:
            raise ValueError("毛利率必须是 [0, 1) 之间的小数")
        margins.append({"value": float(v), "label": _text(m.get("label"), "毛利率标签", MAX_NAME_LEN)})
    out["margins"] = margins

    # 成本比例阈值
    ratio_in = cfg.get("ratio")
    if not isinstance(ratio_in, dict):
        raise ValueError("ratio 必须是对象")
    rmin = _nonneg_number(ratio_in.get("min"), "成本比例区间下限")
    rmax = _nonneg_number(ratio_in.get("max"), "成本比例区间上限")
    if rmin >= rmax:
        raise ValueError("成本比例区间下限必须小于上限")
    out["ratio"] = {"min": rmin, "max": rmax}

    # 产品目录
    products_in = cfg.get("products")
    if not isinstance(products_in, list) or not products_in:
        raise ValueError("产品目录不能为空")
    if len(products_in) > MAX_PRODUCTS:
        raise ValueError("产品目录最多 %d 条" % MAX_PRODUCTS)
    products = []
    for p in products_in:
        if not isinstance(p, dict):
            raise ValueError("产品条目必须是对象")
        products.append({
            "id": _text(p.get("id"), "产品 id", MAX_NAME_LEN),
            "name": _text(p.get("name"), "产品名称", MAX_NAME_LEN),
            "coefficient": _nonneg_number(p.get("coefficient"), "设备系数"),
            "stdDays": _nonneg_number(p.get("stdDays"), "单台标准人天"),
            "stdDesc": _text(p.get("stdDesc"), "标准实施说明", MAX_DESC_LEN, required=False),
            "nonstdDesc": _text(p.get("nonstdDesc"), "非标实施说明", MAX_DESC_LEN, required=False),
        })
    pids = [p["id"] for p in products]
    if len(set(pids)) != len(pids):
        raise ValueError("产品 id 不能重复")
    if "other" in pids:
        raise ValueError("产品 id 不能用 other(该 id 保留给自定义产品)")
    out["products"] = products

    # 项目经理阶段
    phases_in = cfg.get("pmPhases")
    if not isinstance(phases_in, list) or not phases_in:
        raise ValueError("项目经理阶段不能为空")
    if len(phases_in) > MAX_PM_PHASES:
        raise ValueError("项目经理阶段最多 %d 条" % MAX_PM_PHASES)
    out["pmPhases"] = [{
        "name": _text(x.get("name") if isinstance(x, dict) else None, "阶段名称", MAX_NAME_LEN),
        "content": _text(x.get("content") if isinstance(x, dict) else None,
                         "阶段工作内容", MAX_DESC_LEN, required=False),
    } for x in phases_in]

    # 其他服务
    svc_in = cfg.get("services")
    if not isinstance(svc_in, list) or not svc_in:
        raise ValueError("其他服务目录不能为空")
    if len(svc_in) > MAX_SERVICES:
        raise ValueError("其他服务最多 %d 条" % MAX_SERVICES)
    services = []
    for s in svc_in:
        if not isinstance(s, dict):
            raise ValueError("服务条目必须是对象")
        item: Dict[str, Any] = {
            "name": _text(s.get("name"), "服务名称", MAX_NAME_LEN),
            "desc": _text(s.get("desc"), "服务说明", MAX_DESC_LEN, required=False),
        }
        if s.get("isOther"):
            item["isOther"] = True
        services.append(item)
    out["services"] = services

    return out


def load_config(path: str) -> Dict[str, Any]:
    """读配置;文件缺失/损坏/非法 → 静默回落默认(降级不阻断,页面不能因此白板)。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return validate_config(json.load(f))
    except (OSError, ValueError):
        return default_config()


def save_config(path: str, cfg: Any) -> Dict[str, Any]:
    """校验后原子写(先写 .tmp 再 replace,避免并发/崩溃留半截坏文件)。返回落盘后的配置。

    校验不过 → 抛 ValueError,**磁盘文件原样不动**(先算通再落盘)。
    """
    clean = validate_config(cfg)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return clean
