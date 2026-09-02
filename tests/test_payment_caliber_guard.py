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
