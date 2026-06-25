# -*- coding: utf-8 -*-
import server as S


def test_step_markers_map_progress():
    assert S.classify_download_line('[2026-06-25 12:00:00]   Step 1/3: ...') == (10, '下载 PMIS 报表...')
    assert S.classify_download_line('  ✓ fetch_pmis_tables.py 执行成功') == (30, 'PMIS 报表已下载')
    assert S.classify_download_line('Step 2/3') == (35, '下载全量项目损益(耗时较长)...')
    assert S.classify_download_line('  ✓ fetch_all_projects.py 执行成功') == (75, '项目损益已下载')
    assert S.classify_download_line('Step 3/3') == (80, '交付成本分析...')
    assert S.classify_download_line('  ✓ delivery_analysis.py 执行成功') == (90, '成本分析完成')
    assert S.classify_download_line('  拷贝到目标路径') == (95, '拷贝到 input/...')
    assert S.classify_download_line('  流水线完成') == (100, '下载完成，请点更新数据生效')


def test_empty_line_returns_none():
    assert S.classify_download_line('   ') is None


def test_other_line_keeps_progress_none_with_message():
    prog, msg = S.classify_download_line('   下载项目 123/500 ...')
    assert prog is None
    assert msg == '下载项目 123/500 ...'
