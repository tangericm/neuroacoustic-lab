import importlib
import numpy as np
import pytest
import json
from pathlib import Path


def test_gaussian_focal_position_and_interpolated_fwhm():
    try:
        mod = importlib.import_module('reference.generate_fullwave')
    except ModuleNotFoundError:
        pytest.fail('Full-wave metric extraction is missing')
    x = np.linspace(-.01,.01,101)
    z = np.linspace(.04,.06,101)
    p = np.exp(-((x[None,:]-.002)**2+(z[:,None]-.05)**2)/(2*.002**2))
    m = mod.measure(p,x,z,np.array([.002,0,.05]))
    assert m['focalPositionM'] == pytest.approx([.002,0,.05])
    assert m['focalErrorMm'] < 1e-9
    assert m['lateralFwhmMm'] == pytest.approx(4.70964009,rel=.002)


def test_planar_path_axis_time_and_absorption():
    try:
        mod = importlib.import_module('reference.generate_fullwave')
    except ModuleNotFoundError:
        pytest.fail('Full-wave matched planar ray reference is missing')
    p = mod.planar_path(np.array([0,0,.01]),np.array([0,0,.05]),True)
    assert p[0] == pytest.approx(.012/1500+.0065/2800+.0215/1560)
    assert p[2] == pytest.approx(3.9+.645)


def test_free_field_focal_location_detects_source_sensor_ordering_errors():
    fixture=Path('.work/fullwave/free-0.000625-uncorrected.json')
    if not fixture.exists():pytest.skip('Optional generated k-Wave run cache absent')
    run=json.loads(fixture.read_text())
    assert run['metrics']['focalErrorMm'] < 6
    assert run['metrics']['targetAmplitude']/run['metrics']['peakAmplitude'] > .6
