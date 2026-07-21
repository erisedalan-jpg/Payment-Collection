"""回调解析的回归。

重点在【两套键名都认】:蓝信文档的字段表(eventType/appId/orgId/length)
与真实密文解出的明文(type/app_id/org_id/len)对不上,文档自身前后也矛盾。
照任何单一写法写解析器都会失败,故两套都要有用例。
"""
import json

import pytest

import lanxin_callback as CB
import lanxin_inbox as I

NOW = "2026-07-20 10:00:00"


def _store():
    s = I.new_store()
    I.record_sent(s, [{"staffId": "524288-aaa", "employId": "A000701", "name": "张三",
                       "routeKey": "project", "projectIds": ["P001"], "msgId": "m1"}], NOW)
    return s


def test_parse_envelope_snake_case():
    """真实密文解出来是蛇形键 —— 这是实测形态,必须支持。"""
    plain = json.dumps({"random": "r", "len": "9", "app_id": "A", "org_id": "O",
                        "events": [{"id": "e1", "type": "account_message", "data": {}}]})
    env = CB.parse_envelope(plain)
    assert env["appId"] == "A" and env["orgId"] == "O"
    assert env["events"][0]["id"] == "e1"


def test_parse_envelope_camel_case():
    """文档字段表写的是驼峰 —— 也必须支持,不赌哪一套是真的。"""
    plain = json.dumps({"random": "r", "length": 9, "appId": "A", "orgId": "O",
                        "events": [{"id": "e1", "eventType": "account_message", "data": {}}]})
    env = CB.parse_envelope(plain)
    assert env["appId"] == "A" and env["orgId"] == "O"
    assert env["events"][0]["id"] == "e1"
    assert env["events"][0]["type"] == "account_message"   # 驼峰 eventType 也要归一成 type


def test_parse_envelope_normalizes_event_type_key():
    """无论来源用 type 还是 eventType,出口统一成 type。"""
    for key in ("type", "eventType"):
        plain = json.dumps({"events": [{"id": "e1", key: "bot_private_message", "data": {}}]})
        assert CB.parse_envelope(plain)["events"][0]["type"] == "bot_private_message"


@pytest.mark.parametrize("bad", ["", "not json", "[]", '"x"', "123"])
def test_parse_envelope_raises_on_garbage(bad):
    with pytest.raises(ValueError):
        CB.parse_envelope(bad)


def test_parse_envelope_raises_when_events_not_list():
    with pytest.raises(ValueError):
        CB.parse_envelope(json.dumps({"events": "nope"}))


def test_event_to_item_extracts_text_msgdata_shape():
    ev = {"id": "e1", "type": "bot_private_message",
          "data": {"from": "524288-aaa", "msgType": "text",
                   "msgData": {"text": {"content": "已处理完毕"}}}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["status"] == "parsed"
    assert it["text"] == "已处理完毕"
    assert it["staffId"] == "524288-aaa"
    assert it["employId"] == "A000701" and it["name"] == "张三"
    assert it["id"] == "evt-e1"
    assert it["handled"] is False


def test_event_to_item_extracts_snake_case_shape():
    """官方样本里 account_message 的 data 是 {staff_id, msg_text}。"""
    ev = {"id": "e2", "type": "account_message",
          "data": {"staff_id": "524288-aaa", "msg_text": "this is a test"}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["status"] == "parsed"
    assert it["text"] == "this is a test"
    assert it["staffId"] == "524288-aaa"


def test_event_to_item_unknown_staff_keeps_nulls():
    ev = {"id": "e3", "type": "bot_private_message",
          "data": {"from": "524288-zzz", "msgType": "text",
                   "msgData": {"text": {"content": "hi"}}}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["employId"] is None and it["name"] is None
    assert it["staffId"] == "524288-zzz"


def test_event_to_item_non_text_keeps_raw_and_marks_unparsed():
    """非文本消息(图片/文件)不得静默丢弃 —— 落未解析并保留原始 data。"""
    ev = {"id": "e4", "type": "bot_private_message",
          "data": {"from": "524288-aaa", "msgType": "image", "msgData": {"image": {"id": "x"}}}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["status"] == "unparsed"
    assert it["rawMsgData"] == {"image": {"id": "x"}}
    assert it["msgType"] == "image"


def test_event_to_item_group_message_keeps_group_id():
    ev = {"id": "e5", "type": "bot_group_message",
          "data": {"from": "524288-aaa", "msgType": "text", "groupId": "g1",
                   "groupName": "交付三部", "msgData": {"text": {"content": "收到"}}}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["groupId"] == "g1" and it["groupName"] == "交付三部"


def test_event_to_item_unknown_event_type_marked_unparsed():
    """订阅了别的事件也不能崩 —— 落未解析,让超管看得见。"""
    ev = {"id": "e6", "type": "staff_modify", "data": {"staffId": "x"}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["status"] == "unparsed"
    assert it["eventType"] == "staff_modify"


def test_event_without_id_still_produces_item():
    """没有 id 就无法去重,但绝不能丢 —— 用接收时间兜底成条目 id。"""
    ev = {"type": "bot_private_message",
          "data": {"from": "524288-aaa", "msgType": "text",
                   "msgData": {"text": {"content": "hi"}}}}
    it = CB.event_to_item(ev, _store(), NOW)
    assert it["id"]
    assert it["id"].startswith("raw-")
