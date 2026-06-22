import preprocess_data as pre


def test_pay_projects_from_collection_maps_keys():
    cs = {"P1": [{"node": 1}], "P2": [], "P3": [{"node": 2}]}
    out = pre._pay_projects_from_collection(cs)
    assert out == [
        {"projectId": "P1", "projectName": ""},
        {"projectId": "P2", "projectName": ""},
        {"projectId": "P3", "projectName": ""},
    ]


def test_pay_projects_from_collection_empty():
    assert pre._pay_projects_from_collection({}) == []
