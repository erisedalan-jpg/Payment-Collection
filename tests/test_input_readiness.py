# -*- coding: utf-8 -*-
"""输入文件「就绪度上报」的语义契约。

★ 本文件守的是 V4.5.14 那次生产报障的**根**,不是那次的症状。
当时 holidays.csv 表头带一个制表符 → 解析出 0 行 → 告警说「未提供节假日表」→
用户反复重传一个已经在那儿的文件。修复时在 yitian.py 定下了正确模式并写进注释:

    "provided 看文件是否存在,rows 看解析结果 —— 两者分开才能区分
     『没放文件』与『文件在但表头坏了』,告警文案才不会说反"

2026-08-31 审查发现:**主域这边 6 个输入文件全都没照做**,`provided` 一律派生自
解析结果(`_stat(bool(rows), ...)` 或空即 `_stat(False, 0, 0)`)。也就是说同一个
生产事故在 payment_records / profit_loss_direct / profit_loss_bridge / budget_data /
里程碑在建 / 里程碑已结项 上原封不动地等着复发。

另有一条:`read_csv_rows` 只试 utf-8-sig,而 `except (OSError, csv.Error)` **接不住**
`UnicodeDecodeError`(它是 ValueError 的子类)。生产 CSV 是 Excel 导出的 GBK 时(V4.4.1
实际发生过),异常会一路冒到 main() 之外 —— 整个「更新数据」崩掉,且报错是
UnicodeDecodeError 而不是「文件编码不对」。
"""
import os

import collection_stages
import config
import milestones
import profit


def _w(path, text, encoding='utf-8-sig'):
    with open(path, 'w', encoding=encoding, newline='') as f:
        f.write(text)


HEADER = '项目编号,付款金额,回款确认日期\n'
ONE_ROW = HEADER + 'P1,100,2026-01-01\n'


class Test读CSV的编码鲁棒性:
    """read_csv_rows 是主管线的入口,它抛异常 = 「更新数据」整体失败。"""

    def test_GBK编码的CSV能读出来而不是抛异常(self, tmp_path):
        """V4.4.1 同款:生产 CSV 由 Excel 导出、编码是 GBK。
        当时 holidays 那条被 preprocess 的 try/except 吞掉了;payment_records/profit
        这几处【没有任何 try/except 兜底】,异常直接冒出 main()。"""
        p = tmp_path / 'gbk.csv'
        with open(p, 'wb') as f:
            f.write('项目编号,付款金额\n中文项目,100\n'.encode('gbk'))
        rows = profit.read_csv_rows(str(p))
        assert len(rows) == 1, 'GBK 文件应能读出 1 行'
        assert rows[0]['项目编号'] == '中文项目', '中文列名与中文值都要正确解码'

    def test_真正读不了的文件返回空而不是抛(self, tmp_path):
        """任何编码都试不通时必须降级成空,不能把整条管线带走 ——
        但降级本身要能被 provided/rows 两分表达出来(见下面的类)。"""
        p = tmp_path / 'binary.csv'
        with open(p, 'wb') as f:
            f.write(bytes(range(0, 256)) * 8)
        assert profit.read_csv_rows(str(p)) == []


class Test就绪度的provided看文件在不在:
    """provided=文件是否存在;rows=读懂了几行。两者必须分开。"""

    def test_回款流水_文件不存在(self, tmp_path):
        _out, st = profit.load_payment_records(str(tmp_path), {'P1'})
        assert st['provided'] is False
        assert st['rows'] == 0

    def test_回款流水_文件存在但只有表头(self, tmp_path):
        """★ 核心用例:文件明明在,解析出 0 行。
        改前 provided=False → 告警说「未提供回款流水」→ 运维去传一个已经在的文件。"""
        _w(tmp_path / config.PAYMENT_RECORDS_FILE, HEADER)
        _out, st = profit.load_payment_records(str(tmp_path), {'P1'})
        assert st['provided'] is True, '文件在,provided 必须为 True'
        assert st['rows'] == 0, '没读出行,rows 必须为 0'

    def test_回款流水_正常(self, tmp_path):
        _w(tmp_path / config.PAYMENT_RECORDS_FILE, ONE_ROW)
        _out, st = profit.load_payment_records(str(tmp_path), {'P1'})
        assert st['provided'] is True
        assert st['rows'] == 1
        assert st['matched'] == 1

    def test_三份预算文件_存在但解析不出行(self, tmp_path):
        """profit_loss_direct / budget_data / profit_loss_bridge 同构。"""
        for name in (config.PROFIT_DIRECT_FILE, config.BUDGET_FILE, config.PROFIT_BRIDGE_FILE):
            _w(tmp_path / name, '项目编号\n')
        _out, stats = profit.load_profit(str(tmp_path), {'P1'})
        for key in ('direct', 'budget', 'bridge'):
            assert stats[key]['provided'] is True, '%s: 文件在,provided 应为 True' % key
            assert stats[key]['rows'] == 0, '%s: rows 应为 0' % key

    def test_三份预算文件_都不存在(self, tmp_path):
        _out, stats = profit.load_profit(str(tmp_path), {'P1'})
        for key in ('direct', 'budget', 'bridge'):
            assert stats[key]['provided'] is False, '%s: 文件不在,provided 应为 False' % key


class Test里程碑就绪度:
    def test_文件不存在(self, tmp_path):
        _out, a, c = milestones.load_milestones(str(tmp_path), {'P1'})
        assert a['provided'] is False
        assert c['provided'] is False

    def test_文件存在但读不出行(self, tmp_path):
        """xlsx 路径:造一个存在但不是合法 xlsx 的文件 —— 等价于「表头坏了/格式漂移」,
        文件确实在,只是读不懂。"""
        for name in (config.MILESTONE_FILE_ACTIVE, config.MILESTONE_FILE_CLOSED):
            (tmp_path / name).write_bytes(b'not a real xlsx')
        _out, a, c = milestones.load_milestones(str(tmp_path), {'P1'})
        assert a['provided'] is True, '在建里程碑文件在,provided 应为 True'
        assert a['rows'] == 0
        assert c['provided'] is True, '已结项里程碑文件在,provided 应为 True'
        assert c['rows'] == 0


class Test收款阶段台账的就绪度:
    """★ 2026-08-31 审查发现:collection_stages.csv 是 CLAUDE.md 明确的「回款数据核心源」,
    却是【唯一一个没有任何就绪度上报的输入文件】—— projectsQuality 里另外 9 个都有。
    它静默缺失时,回款看板会少掉整批节点而没有任何提示。"""

    def test_文件不存在(self, tmp_path):
        st = collection_stages.collection_stages_stat(str(tmp_path), {'P1'})
        assert st['provided'] is False
        assert st['rows'] == 0

    def test_文件存在但只有表头(self, tmp_path):
        _w(tmp_path / config.COLLECTION_STAGES_FILE, '项目编号,收款阶段\n')
        st = collection_stages.collection_stages_stat(str(tmp_path), {'P1'})
        assert st['provided'] is True, '文件在,provided 必须为 True'
        assert st['rows'] == 0

    def test_正常时统计行数与命中数(self, tmp_path):
        _w(tmp_path / config.COLLECTION_STAGES_FILE,
           '项目编号,收款阶段\nP1,首款\nP1,尾款\nP9,首款\n')
        st = collection_stages.collection_stages_stat(str(tmp_path), {'P1'})
        assert st['rows'] == 3
        assert st['matched'] == 2, 'P1 的两行命中,P9 不在主域不算'
        assert st['matchRate'] == round(2 / 3, 4)


class Test收款阶段覆盖率告警:
    """现有前端只有一个 noStageCount(实测生产 75),把「合同=0 本来就不该有节点」和
    「有合同却缺节点」混在一起 —— 75 像噪音,真正的信号是其中【合同>0】的那 31 个,
    它们的合同进达成率分母、分子为 0,实测系统性拉低全域达成率 2.39 个百分点。"""

    @staticmethod
    def _p(pid, contract, org='银行服务组', name='X'):
        return {'projectId': pid, 'projectName': name, 'orgL4': org,
                'paymentPmis': {'contract': contract}}

    def test_只数合同大于0且零节点的(self):
        projects = [
            self._p('A', 100000.0),          # 有合同、零节点 → 计入
            self._p('B', 0.0),               # 合同=0、零节点 → 不计(本来就不该有)
            self._p('C', 200000.0),          # 有合同、有节点 → 不计
            self._p('D', None),              # 合同缺失 → 不计
        ]
        nodes = {'C': [{'name': '首款'}]}
        miss = collection_stages.missing_coverage(projects, nodes)
        assert [m['projectId'] for m in miss] == ['A']

    def test_异常项目不计入(self):
        """orgL4 空 = 异常项目,全站已硬排除出回款统计(lib/anomaly.isAnomalous),
        这里再算进来会让告警数与看板对不上。"""
        projects = [self._p('A', 100000.0, org=''), self._p('B', 100000.0, org=None)]
        assert collection_stages.missing_coverage(projects, {}) == []

    def test_条目带足够的排查信息(self):
        """治理告警要能直接拿去查:项目号、名称、合同、归属组,缺一个就得再去翻别处。"""
        projects = [self._p('A', 4690500.0, org='河北服务组', name='某某项目')]
        m = collection_stages.missing_coverage(projects, {})[0]
        assert m == {'projectId': 'A', 'projectName': '某某项目',
                     'orgL4': '河北服务组', 'contract': 4690500.0}

    def test_空节点列表等同于没有节点(self):
        """payment_nodes 里键存在但值是空列表,与键不存在是同一回事。"""
        projects = [self._p('A', 100000.0)]
        assert len(collection_stages.missing_coverage(projects, {'A': []})) == 1
