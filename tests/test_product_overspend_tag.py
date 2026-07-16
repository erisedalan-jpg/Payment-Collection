import preprocess_data as P
import config


def test_whitelist_has_product_overspend():
    assert "产品超支" in config.TAG_SEED_WHITELIST


def test_derive_product_overspend_hits_negative_2_1():
    profit = {
        "P1": {"rows": [{"code": "2.1", "name": "产品、商品成本", "remaining": -995.73},
                        {"code": "2", "name": "成本", "remaining": 100.0}]},
        "P2": {"rows": [{"code": "2.1", "name": "产品、商品成本", "remaining": 104.42}]},  # ≥0 不打
        "P3": {"rows": [{"code": "3", "name": "毛利", "remaining": -50.0}]},                # 非 2.1 不打
        "P4": {"rows": []},
    }
    seed = P.derive_product_overspend_tag_seed(profit)
    assert seed == {"P1": ["产品超支"]}


def test_derive_product_overspend_empty():
    assert P.derive_product_overspend_tag_seed({}) == {}
    assert P.derive_product_overspend_tag_seed(None) == {}


def test_merge_tag_seeds_union_dedup():
    a = {"P1": ["佳杰"], "P2": ["佳杰"]}
    b = {"P1": ["产品超支"], "P3": ["产品超支"]}
    merged = P.merge_tag_seeds(a, b)
    assert merged["P1"] == ["佳杰", "产品超支"]      # 并集保序
    assert merged["P2"] == ["佳杰"] and merged["P3"] == ["产品超支"]


def test_merge_tag_seeds_no_dup():
    assert P.merge_tag_seeds({"P1": ["佳杰"]}, {"P1": ["佳杰"]}) == {"P1": ["佳杰"]}
