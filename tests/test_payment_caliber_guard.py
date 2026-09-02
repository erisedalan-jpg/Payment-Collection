# -*- coding: utf-8 -*-
"""回款分子口径的守卫:节点已收 与 流水净额 不得同名并列。

★ 2026-08-31 审查发现:同一个项目对象里并排躺着两个 `actualTotal`,差 570 万 ——

    payment.actualTotal      节点已收   全域 220,169,980.90   → 46.36%
    paymentPmis.actualTotal  流水净额   全域 225,871,290.35   → 47.56%(主口径)

后者与直接从 payment_records.csv 独立重算的结果差 0.01 元(浮点舍入),即主口径实现正确。
但两个字段名毫无区分度:任何人写 `Σ p.payment.actualTotal / Σ contract` 都会静默拿到
46.36%,而 code review 看不出问题 —— 字段名、类型、数量级全都正常。这正是 2026-08-03
修掉的 /insight 107.57% 那类缺陷的形状,只是这次偏差小到不会触发任何人的怀疑(2.5%
而不是 107%),**更难被发现**。

故:节点口径那个改名为 `nodeActualTotal`,让名字说真话。
"""
import os
import re

import projects


def _nodes(*pairs):
    """(expectedPayment, receivedAmount) → 节点列表。"""
    return [{"expectedPayment": e, "receivedAmount": a, "unpaidAmount": e - a,
             "status": "部分回款", "reached": True} for e, a in pairs]


class Test节点口径字段改名:
    def test_aggregate返回nodeActualTotal(self):
        r = projects.aggregate_payment_pmis(_nodes((1000000, 600000), (500000, 0)))
        assert r["nodeActualTotal"] == 600000

    def test_不再有含糊的actualTotal键(self):
        """★ 关键:旧键必须消失。留着它 = 改名等于没改,消费方照样能取到。"""
        r = projects.aggregate_payment_pmis(_nodes((1000000, 600000)))
        assert "actualTotal" not in r

    def test_流水口径那个不受影响(self):
        """build_payment_summary 产出的是 paymentPmis,它的 actualTotal 是【流水净额】
        —— 主口径分子,名字不动。两个函数改一个不能碰另一个。"""
        s = projects.build_payment_summary(1000000.0, _nodes((1000000, 600000)),
                                           {"total": 700000.0, "count": 2, "lastDate": "2026-01-01"})
        assert s["actualTotal"] == 700000.0
        assert "nodeActualTotal" not in s


class Test全仓无残留消费方:
    """改字段名最经典的翻车是「孤儿消费方」:pydantic 的 extra=allow 让后端不报错,
    自洽的 fixture 让测试不报错,前端 `?? 0` 让页面不报错 —— 于是某处静默变成 0。
    这条守卫直接扫源码文本。

    ★ 守卫必须自证扫描规模:正则失配 → 空集合 → 断言恒真,是本仓栽过的假绿
    (「结构守卫正则失配→空数组→恒真」)。故先断言真的扫到了足够多的文件。
    """

    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    SKIP = ('lts', 'lanxin', 'build', 'dist', 'node_modules', '.venv', '__pycache__',
            'yitian-analyze', 'yitian-new', 'new-dep', 'release', 'report',
            'yundocs_data', 'client', 'log', 'docs', 'pmisdata')

    def _sources(self):
        out = []
        for dirpath, dirnames, filenames in os.walk(self.ROOT):
            dirnames[:] = [d for d in dirnames if d not in self.SKIP and not d.startswith('.')]
            for fn in filenames:
                if fn.endswith(('.py', '.ts', '.vue')):
                    p = os.path.join(dirpath, fn)
                    try:
                        out.append((p, open(p, encoding='utf-8').read()))
                    except (OSError, UnicodeDecodeError):
                        pass
        return out

    def test_扫描规模自证(self):
        """先证明这条守卫真的读到了东西 —— 否则下面那条恒真。"""
        srcs = self._sources()
        assert len(srcs) > 300, '只扫到 %d 个源文件,守卫形同虚设' % len(srcs)
        assert any(p.endswith('projects.py') for p, _ in srcs)
        assert any(p.endswith('overview.ts') for p, _ in srcs)

    def test_没有代码再从payment对象取actualTotal(self):
        """匹配 `payment.actualTotal` / `payment?.actualTotal` / `payment"]["actualTotal"`。
        刻意【不】匹配 paymentPmis.actualTotal(那是主口径分子,合法)。

        ★★ 已知盲区:**逮不到别名访问**。本次改名时 `projectList.ts` 里就有一处
           `const pay = p.payment; ... pay.actualTotal` —— 这条守卫完全没看见,
           是 `npm run typecheck` 逮到的(字段从类型上消失 → 比较运算符报错)。
           **文本守卫必要但不充分,类型检查才是别名访问的网。** 两者都要跑。
        """
        pat = re.compile(r'(?<!Pmis)(?<!pmis)\bpayment[?!]?\s*\.\s*actualTotal'
                         r'|["\']payment["\']\s*\]\s*\[\s*["\']actualTotal')
        bad = []
        for p, src in self._sources():
            if os.path.basename(p) == os.path.basename(__file__):
                continue
            for i, line in enumerate(src.splitlines(), 1):
                if pat.search(line):
                    bad.append('%s:%d  %s' % (os.path.relpath(p, self.ROOT), i, line.strip()[:80]))
        assert not bad, '仍有消费方从 payment 取 actualTotal(节点已收):\n  ' + '\n  '.join(bad)

    def test_正则自证能逮到坏样例(self):
        """★ 反向验证:守卫的正则必须真的会命中。不做这一步,正则写错时上面那条恒绿。"""
        pat = re.compile(r'(?<!Pmis)(?<!pmis)\bpayment[?!]?\s*\.\s*actualTotal'
                         r'|["\']payment["\']\s*\]\s*\[\s*["\']actualTotal')
        assert pat.search('const x = p.payment.actualTotal')
        assert pat.search('act += p.payment?.actualTotal ?? 0')
        assert pat.search('v = row["payment"]["actualTotal"]')
        # 合法写法不得被误伤
        assert not pat.search('const y = p.paymentPmis.actualTotal')
        assert not pat.search('act += pp.get("actualTotal") or 0')
        assert not pat.search('s["actualTotal"] == 700000.0')


class Test分子分母必须同一集合:
    """★ 2026-09-01 目验发现:有流水但【无合同】的项目,流水进了分子、合同记 0 进分母。
    生产实测 6 个售前项目、流水 136.68 万,把全域达成率从 47.56% 抬到 47.85%(+0.29pp)。
    与 /insight 当年 107.57% 是同一形状(分子计了、分母没计),只是偏差小到没人怀疑。

    用户 2026-09-01 拍板:合同记 0 的,分子也不计入;被排除的项目在治理页单列。
    """

    def test_快照达成率排除无合同项目(self):
        import snapshots
        ps = [
            {"projectId": "A", "orgL4": "X", "paymentPmis": {"contract": 1000000, "actualTotal": 500000}},
            {"projectId": "B", "orgL4": "X", "paymentPmis": {"contract": None, "actualTotal": 300000}},
        ]
        # 改前:(500000+300000)/1000000 = 0.8;改后:500000/1000000 = 0.5
        assert snapshots._record_payment_ratio(ps) == 0.5

    def test_快照_合同为0与缺失同等对待(self):
        import snapshots
        ps = [
            {"projectId": "A", "orgL4": "X", "paymentPmis": {"contract": 800000, "actualTotal": 400000}},
            {"projectId": "B", "orgL4": "X", "paymentPmis": {"contract": 0, "actualTotal": 200000}},
        ]
        assert snapshots._record_payment_ratio(ps) == 0.5

    def test_无合同却有流水的项目要能被列出来(self):
        """不能只是「排除」—— 排除掉就没人知道有这么一批钱收了却对不上合同。
        治理页要单列一张表,所以得有个纯函数产出清单。"""
        import projects as P
        ps = [
            {"projectId": "A", "projectName": "甲", "orgL4": "银行服务组",
             "paymentPmis": {"contract": 1000000}},
            {"projectId": "B", "projectName": "乙", "orgL4": "河北服务组",
             "paymentPmis": {"contract": None}},
            {"projectId": "C", "projectName": "丙", "orgL4": "京津服务组",
             "paymentPmis": {"contract": 0}},
            {"projectId": "D", "projectName": "丁", "orgL4": "上海一服务组",
             "paymentPmis": {"contract": None}},   # 无合同【也没有流水】→ 不该列
        ]
        recs = {
            "A": {"total": 500000.0},
            "B": {"total": 858800.0},
            "C": {"total": 90000.0},
        }
        out = P.no_contract_with_payment(ps, recs)
        assert [r["projectId"] for r in out] == ["B", "C"], "只列【无合同且有流水】的"
        assert out[0] == {"projectId": "B", "projectName": "乙", "orgL4": "河北服务组",
                          "contract": None, "flowTotal": 858800.0}

    def test_按流水金额倒序_大额排前面(self):
        import projects as P
        ps = [{"projectId": x, "projectName": x, "orgL4": "X", "paymentPmis": {"contract": None}}
              for x in ("A", "B", "C")]
        recs = {"A": {"total": 100.0}, "B": {"total": 900.0}, "C": {"total": 500.0}}
        assert [r["projectId"] for r in P.no_contract_with_payment(ps, recs)] == ["B", "C", "A"]

    def test_异常项目不计入(self):
        """orgL4 空 = 异常项目,全站已排除出回款统计;列进来会与看板对不上。"""
        import projects as P
        ps = [{"projectId": "A", "projectName": "甲", "orgL4": "", "paymentPmis": {"contract": None}}]
        assert P.no_contract_with_payment(ps, {"A": {"total": 999.0}}) == []
