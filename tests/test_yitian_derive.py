"""倚天派生字段纯函数(V4.5.4)。"""
import yitian_derive as D

LK = [
    {"linePatterns": ["NGSOC"], "keywords": ["SOC", "SOAR", "告警"]},
    {"linePatterns": ["威胁感知"], "keywords": ["天眼", "沙箱", "探针"]},
    {"linePatterns": ["网络流量探针"], "keywords": ["探针", "传感器"]},
]
CHECKED = ("项目类", "售前类", "售后类")

PM_SEG = {"enabled": True,
          "workType3": ["项目管理", "项目验收", "文档编写与汇报"],
          "excludeTypes": ["售后类"],
          "rolePrefixes": ["担任角色", "【担任角色】", "本人角色", "角色"],
          "roleKeywords": ["项目经理"]}
PH_SEG = {"enabled": True, "customerWords": ["受影响的客户"]}


# ── calibrate_line ──

def test_校准_原值有效则原样返回且状态raw():
    assert D.calibrate_line("NGSOC", "项目类", "任意内容", LK, CHECKED) == ("NGSOC", D.LINE_SRC_RAW)


def test_校准_唯一命中则替换且状态calibrated():
    got = D.calibrate_line("其他", "项目类", "本周处理 SOAR 告警策略", LK, CHECKED)
    assert got == ("NGSOC", D.LINE_SRC_CALIBRATED)


def test_校准_多义则保持原值且状态ambiguous():
    """「探针」同时属于 威胁感知 与 网络流量探针 —— 必须留白,不可任选其一。"""
    got = D.calibrate_line("其他", "项目类", "现场部署探针设备", LK, CHECKED)
    assert got == ("其他", D.LINE_SRC_AMBIGUOUS)


def test_校准_零命中则保持原值且状态unmatched():
    got = D.calibrate_line("其他", "项目类", "参加部门例会", LK, CHECKED)
    assert got == ("其他", D.LINE_SRC_UNMATCHED)


def test_校准_大小写不敏感():
    got = D.calibrate_line("其他", "项目类", "处理 soar 队列", LK, CHECKED)
    assert got == ("NGSOC", D.LINE_SRC_CALIBRATED)


def test_校准_非客户类工时不触发():
    """管理类即使产品线为「其他」也不校准——校准只服务客户类工时口径。"""
    got = D.calibrate_line("其他", "管理类", "本周处理 SOAR 告警", LK, CHECKED)
    assert got == ("其他", D.LINE_SRC_RAW)


def test_校准_空产品线按其他处理():
    got = D.calibrate_line("", "项目类", "本周处理 SOAR 告警", LK, CHECKED)
    assert got == ("NGSOC", D.LINE_SRC_CALIBRATED)


# ── pm_tag ──

def test_pm条件一_项目类且工作类型三命中():
    assert D.pm_tag("项目类", "项目管理", "", PM_SEG) is True


def test_pm条件一_售前类同样工作类型三不命中():
    """条件① 明确限定 工时类型=项目类。"""
    assert D.pm_tag("售前类", "项目管理", "", PM_SEG) is False


def test_pm条件二_角色槽位四种写法均命中():
    for txt in ["担任角色：项目经理 服务方式：现场",
                "【担任角色】：项目经理  工作概述:升级",
                "本人角色 项目经理",
                "角色: 项目经理"]:
        assert D.pm_tag("项目类", "安装部署", txt, PM_SEG) is True, txt


def test_pm条件二_兼任写法命中():
    """「项目经理/工程师」兼任仍算项目管理工时(宁窄勿宽,兼任确带管理属性)。"""
    assert D.pm_tag("项目类", "安装部署", "担任角色：项目经理/工程师", PM_SEG) is True


def test_pm条件二_裸提及一律不命中():
    """真实假阳性样本:这些人恰恰不是项目经理。裸匹配会多吃 51 行/290h。"""
    for txt in ["编辑整理巡检报告并输出给项目经理，签字盖章发客户",
                "需求已同步至产品经理和项目经理，等待行内反馈",
                "把服务器降配操作的风险点同步给项目经理和客户",
                "由项目经理拟送说明邮件至行内技术部评估",
                "整理设备台帐发送个项目经理",
                "登记设备信息到设备清单表格，反馈给我司项目经理"]:
        assert D.pm_tag("项目类", "安装部署", txt, PM_SEG) is False, txt


def test_pm条件二_售后类被排除():
    assert D.pm_tag("售后类", "故障处理", "担任角色：项目经理", PM_SEG) is False


def test_pm_禁用时恒False():
    seg = dict(PM_SEG, enabled=False)
    assert D.pm_tag("项目类", "项目管理", "担任角色：项目经理", seg) is False


# ── is_placeholder_customer ──

def test_占位客户_命中词表():
    assert D.is_placeholder_customer("受影响的客户", PH_SEG) is True


def test_占位客户_空客户名也算不可归属():
    assert D.is_placeholder_customer("", PH_SEG) is True
    assert D.is_placeholder_customer("   ", PH_SEG) is True


def test_占位客户_真实客户名不命中():
    assert D.is_placeholder_customer("中国邮政集团有限公司", PH_SEG) is False


def test_占位客户_精确匹配不做子串():
    """「受影响的客户张三」是真实填写的变体,不按占位处理——子串匹配会误伤。"""
    assert D.is_placeholder_customer("受影响的客户张三", PH_SEG) is False


# ── transferable ──

def test_五档_不可归属优先于一切():
    """象限空 + 可交付 + 非项目管理 也必须落「不可归属」,不能被算成可转移。"""
    assert D.transferable(True, "", False, True) == D.TR_UNATTRIBUTED
    # 「优先于一切」必须逐条钉死。只写上面那条时,把 cust_unknown 判定挪到 M1M2/
    # 项目管理/渠道 三个分支之后照样全绿(该组实参下三个分支都不拦截),等于只证明了
    # 「判了」而没证明「先判」。下面三条各让一个分支去抢答,抢到即红。
    assert D.transferable(True, "M1 战略核心区", False, True) == D.TR_UNATTRIBUTED
    assert D.transferable(True, "", True, True) == D.TR_UNATTRIBUTED
    assert D.transferable(True, "", False, False) == D.TR_UNATTRIBUTED


def test_五档_M1M2前缀匹配():
    assert D.transferable(False, "M1 战略核心区", False, True) == D.TR_M12
    assert D.transferable(False, "M2 现金牛/打猎区", False, True) == D.TR_M12


def test_五档_M3M4不算战略客户():
    assert D.transferable(False, "M3 潜力培育区", False, True) == D.TR_YES
    assert D.transferable(False, "M4 待开拓/长尾区", False, True) == D.TR_YES


def test_五档_象限为空但客户可归属时不落M12():
    """未匹配上 TOP1000 清单的客户 = 非 TOP1000 = 定义上非 M1/M2,应继续往下判。"""
    assert D.transferable(False, "", False, True) == D.TR_YES


def test_五档_项目管理工时优先于渠道判定():
    assert D.transferable(False, "", True, True) == D.TR_PM


def test_五档_非渠道可交付():
    assert D.transferable(False, "", False, False) == D.TR_NOT_CHANNEL


# ── canonical_line / unresolved_aliases(V4.5.4 修订:短名→规范全称) ──

VOCAB = ['NGSOC', '威胁感知（天眼）', '网闸（SIS）', '一体化终端管理（天擎）', '新天擎V10']


def test_短名解析为规范全称():
    assert D.canonical_line('威胁感知', VOCAB) == ('威胁感知（天眼）', True)


def test_已是全称则原样返回():
    assert D.canonical_line('NGSOC', VOCAB) == ('NGSOC', True)


def test_候选多于一个判未解析():
    """日后产品分类表新增「网闸（XYZ）」,「网闸」就不再唯一 —— 必须判未解析,
    不能静默取第一个,否则会把工时挂到错的产品线上。"""
    v = VOCAB + ['网闸（XYZ）']
    assert D.canonical_line('网闸', v) == ('网闸', False)


def test_零候选判未解析():
    assert D.canonical_line('不存在的产品', VOCAB) == ('不存在的产品', False)


def test_无词表时不解析():
    """产品分类表缺失的退化场景由就绪度告警覆盖,这里不重复报,原样返回。"""
    assert D.canonical_line('威胁感知', []) == ('威胁感知', True)


def test_校准唯一命中时解析成全称():
    lk = [{'linePatterns': ['威胁感知'], 'keywords': ['天眼', '沙箱']}]
    got = D.calibrate_line('其他', '项目类', '现场调试沙箱策略', lk, CHECKED, VOCAB)
    assert got == ('威胁感知（天眼）', D.LINE_SRC_CALIBRATED)


def test_校准命中但短名无法唯一解析时留白():
    """绝不把非规范短名写进产品线码表 —— 那会让同一条产品线在 dims 里裂成两个值。"""
    lk = [{'linePatterns': ['网闸'], 'keywords': ['光闸']}]
    v = VOCAB + ['网闸（XYZ）']
    got = D.calibrate_line('其他', '项目类', '光闸链路调试', lk, CHECKED, v)
    assert got == ('其他', D.LINE_SRC_AMBIGUOUS)


def test_unresolved_aliases_列出对不上的短名():
    lk = [{'linePatterns': ['威胁感知'], 'keywords': ['天眼']},
          {'linePatterns': ['不存在的产品'], 'keywords': ['x']},
          {'linePatterns': ['NGSOC'], 'keywords': ['soc']}]
    assert D.unresolved_aliases(lk, VOCAB) == ['不存在的产品']


def test_unresolved_aliases_无词表返回空():
    lk = [{'linePatterns': ['威胁感知'], 'keywords': ['天眼']}]
    assert D.unresolved_aliases(lk, []) == []
