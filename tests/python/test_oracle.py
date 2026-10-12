"""Independent analytic checks: unit conversion, boundaries, phase sign, finite aperture."""
import importlib
import math
import numpy as np
import pytest


def oracle():
    try:
        return importlib.import_module('reference.oracle')
    except ModuleNotFoundError:
        pytest.fail('Independent float64 oracle has not been implemented')


def test_axial_shell_lengths_and_travel_time():
    o = oracle()
    m = o.default_medium()
    p = o.path([0, 0, .12], [0, 0, 0], m, 500000)
    assert p['layerLengthsM'] == pytest.approx({'water': .02, 'scalp': .004, 'skull': .0065, 'fluid': .002, 'brain': .0875})
    assert p['travelTimeS'] == pytest.approx(.02/1500+.004/1540+.0065/2800+.002/1500+.0875/1560)


def test_homogeneous_amplitude_uses_pressure_db_and_reference_distance():
    o = oracle()
    p = o.path([0, 0, .1], [0, 0, 0], o.default_medium(), 500000, True)
    assert p['attenuationDb'] == pytest.approx(3.0)
    assert p['amplitude'] == pytest.approx(10**(-3/20))


def test_tangent_has_no_spurious_inside_length():
    o = oracle()
    p = o.path([-.2, .09, 0], [.2, .09, 0], o.default_medium(), 500000)
    assert p['layerLengthsM']['water'] == pytest.approx(.4)


def test_piston_axis_back_and_first_zero():
    o = oracle()
    assert o.piston(0) == 1
    assert abs(o.piston(3.8317059702075125)) < 1e-14
    assert o.directivity([0,0,1], [0,0,-1], .001, 500000, 1480) == 0


def test_delay_phase_aligns_unequal_distance_sources():
    o = oracle()
    positions = [[0,0,.1], [0,0,.12]]
    travel = np.array([.1/1560, .12/1560])
    delays = max(travel)-travel
    field = o.coherent_field(positions, [[0,0,-1]]*2, [0,0,0], delays, [1,1], .001, o.default_medium(), 500000, True)
    expected = sum(o.path(p,[0,0,0],o.default_medium(),500000,True)['amplitude'] for p in positions)
    assert abs(field) == pytest.approx(expected, rel=1e-12)
