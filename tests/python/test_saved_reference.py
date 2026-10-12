"""Artifact integrity tests, not a claim of full-head validation."""
import json
from pathlib import Path
import numpy as np


def test_saved_fullwave_runs_are_finite_and_have_grid_sensitivity_evidence():
    path=Path('public/reference/fullwave.json')
    assert path.exists(), 'Real k-Wave reference has not yet been generated'
    data=json.loads(path.read_text())
    assert len(data['cases'])==2
    for case in data['cases']:
        assert len({r['dxM'] for r in case['runs']})>=2
        assert case['convergence']
        for run in case['runs']:
            plane=run['plane'];n=len(plane['xMm'])*len(plane['zMm'])
            for name in ['pressure','rayPressure']:
                arr=np.asarray(plane[name])
                assert arr.size==n
                assert np.isfinite(arr).all() and np.min(arr)>=0 and np.max(arr)>0
            assert run['runtimeS']>0 and run['steps']>100
            assert np.isfinite(run['metrics']['normalizedL2Ray'])
    # Physical free-field focal quality catches a transposed/scrambled mask.
    for run in data['cases'][0]['runs']:
        assert run['metrics']['focalErrorMm']<6
        assert run['metrics']['targetAmplitude']/run['metrics']['peakAmplitude']>.6


def test_golden_fixture_has_all_modes_and_oblique_paths():
    data=json.loads(Path('public/reference/golden.json').read_text())
    assert {f['mode'] for f in data['fields']}=={'homogeneous','uncorrected','corrected'}
    assert len(data['paths'])>=30
    for p in data['paths']:
        e=p['expected']
        assert np.isclose(sum(e['layerLengthsM'].values()),e['lengthM'])
        assert e['travelTimeS']>0 and e['amplitude']>0


def test_slab_ray_uses_the_same_free_field_amplitude_scale():
    data=json.loads(Path('public/reference/fullwave.json').read_text())
    free={r['dxM']:r['rayAmplitudeScaleFromFreeField'] for r in data['cases'][0]['runs']}
    for run in data['cases'][1]['runs']:
        assert np.isclose(run['rayAmplitudeScaleFromFreeField'],free[run['dxM']])
