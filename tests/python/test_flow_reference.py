from reference.flow_oracle import check_reference


def test_frozen_temporal_flow_matches_independent_numpy():
    assert check_reference()['passed']
