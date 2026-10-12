"""Independent NumPy reconstruction/SVD check of the frozen temporal experiment.

Run: python reference/flow_oracle.py --check
No project TypeScript is imported. Geometry, analytic-signal conversion, interpolation,
complex SVD, power and phase estimates are recalculated from the archived RF.
"""
import gzip
import json
from pathlib import Path
import sys
import time
import numpy as np

ROOT = Path(__file__).resolve().parents[1]


def check_reference():
    started = time.perf_counter()
    manifest = json.loads((ROOT / 'reference/flow_manifest.json').read_text())
    c = manifest['config']
    t, n, ns, size = c['frames'], c['elementCount'], c['samples'], c['size']
    pixels = size * size
    def floats(name):
        return np.frombuffer(gzip.decompress((ROOT / 'reference' / name).read_bytes()), dtype='<f4')
    rf = floats('flow_rf.f32.gz').astype(np.float64).reshape(t, n, ns)
    expected_iq = floats('flow_iq.f32.gz').reshape(t, pixels, 2)
    expected_filtered = floats('flow_filtered.f32.gz').reshape(t, pixels, 2)
    expected_iq = expected_iq[..., 0] + 1j * expected_iq[..., 1]
    expected_filtered = expected_filtered[..., 0] + 1j * expected_filtered[..., 1]
    hilbert = np.zeros(ns)
    hilbert[0] = hilbert[ns // 2] = 1
    hilbert[1:ns // 2] = 2
    analytic = np.fft.ifft(np.fft.fft(rf, axis=-1) * hilbert, axis=-1)
    xs = (np.arange(n) - (n-1)/2) * c['elementPitchM']
    xs = xs[np.argsort(abs(xs), kind='stable')]
    px, pz = np.meshgrid(np.linspace(-c['extentM']/2, c['extentM']/2, size),
                         c['centerZM'] + np.linspace(c['extentM']/2, -c['extentM']/2, size))
    distances = np.sqrt((px.reshape(-1, 1)-xs[None, :])**2 + (pz.reshape(-1, 1)-c['probeZM'])**2)
    times = (distances[:, [0]] + distances) / c['soundSpeedMps']
    samples = times * c['samplingRateHz']
    indices = np.floor(samples).astype(int)
    fractions = samples - indices
    iq = np.zeros((t, pixels), dtype=np.complex128)
    for r in range(n):
        k = indices[:, r]
        good = (k >= 0) & (k < ns-1)
        f = fractions[good, r]
        iq[:, good] += analytic[:, r, k[good]]*(1-f) + analytic[:, r, k[good]+1]*f
    iq /= n
    # Nominal axial two-way spreading/attenuation correction, no phantom mask.
    depth = c['probeZM'] - pz.reshape(-1)
    reference_depth = c['probeZM'] - c['centerZM']
    gain = (depth/reference_depth)**2 * 10**(2*(depth-reference_depth)*100*c['attenuationDbCmAtMHz']*(c['frequencyHz']/1e6)**c['attenuationPower']/20)
    iq *= gain[None, :]
    x = iq.T
    u, singular, vh = np.linalg.svd(x, full_matrices=False)
    rank = c['clutterRank']
    filtered = (x - (u[:, :rank] * singular[:rank]) @ vh[:rank]).T
    power = np.mean(abs(filtered)**2, axis=0)
    correlation = np.sum(filtered[1:] * filtered[:-1].conj(), axis=0)
    coherence = abs(correlation) / np.maximum(1e-30, np.sqrt(np.sum(abs(filtered[1:])**2, axis=0)*np.sum(abs(filtered[:-1])**2, axis=0)))
    velocity = np.angle(correlation)*c['soundSpeedMps']/(4*np.pi*c['frequencyHz']*c['frameIntervalS'])
    valid = (power > manifest['powerThreshold']) & (coherence >= manifest['coherenceThreshold'])
    expected_power = np.asarray(manifest['afterPower'])
    expected_velocity = np.asarray(manifest['velocityMps'])
    expected_valid = np.asarray(manifest['valid']).astype(bool)
    errors = {
        'iqRelativeL2': float(np.linalg.norm(iq-expected_iq)/np.linalg.norm(iq)),
        'filteredRelativeL2': float(np.linalg.norm(filtered-expected_filtered)/np.linalg.norm(filtered)),
        'powerRelativeL2': float(np.linalg.norm(power-expected_power)/np.linalg.norm(power)),
        'singularValueRelativeL2': float(np.linalg.norm(singular-np.asarray(manifest['singularValues']))/np.linalg.norm(singular)),
        'velocityMaxAbsErrorMpsOnAcceptedPixels': float(np.max(abs(velocity[valid]-expected_velocity[valid]))) if np.any(valid) else 0,
        'validMaskDisagreements': int(np.count_nonzero(valid != expected_valid)),
    }
    assert errors['iqRelativeL2'] < 2e-6, errors
    assert errors['filteredRelativeL2'] < 2e-5, errors
    assert errors['powerRelativeL2'] < 2e-5, errors
    assert errors['singularValueRelativeL2'] < 2e-6, errors
    assert errors['velocityMaxAbsErrorMpsOnAcceptedPixels'] < 2e-6, errors
    assert errors['validMaskDisagreements'] == 0, errors
    return {'passed': True, 'numpyVersion': np.__version__, 'elapsedMs': (time.perf_counter()-started)*1000, 'errors': errors,
            'scope': 'Independent analytic RF conversion, geometry-derived DAS, full complex SVD, retained power, lag-one velocity and validity masks. Does not independently validate the acoustic forward model or NCC.'}


if __name__ == '__main__':
    if '--check' not in sys.argv:
        raise SystemExit('Usage: python reference/flow_oracle.py --check')
    print(json.dumps(check_reference()))
