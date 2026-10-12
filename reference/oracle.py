"""Independent NumPy float64 straight-ray oracle; SI lengths and times.

Not a full-wave solver. The separate generate_fullwave.py runs k-Wave.
"""
import math
import numpy as np
from scipy.special import j1

LAYERS = ('water', 'scalp', 'skull', 'fluid', 'brain')


def default_medium():
    specs = [(1500,1000,0,2), (1540,1050,.5,1), (2800,1900,12,1), (1500,1000,.0022,2), (1560,1040,1.2,2)]
    return dict(outerRadiiM=[.08,.09,.1], scalpThicknessM=.004, skullThicknessM=.0065, fluidThicknessM=.002,
                materials={name:dict(name=name,soundSpeedMps=c,densityKgM3=rho,attenuationDbCmAtMHz=a,attenuationPower=y) for name,(c,rho,a,y) in zip(LAYERS,specs)})


def path(start, end, medium, frequency_hz, homogeneous=False):
    a, b = np.asarray(start, dtype=np.float64), np.asarray(end, dtype=np.float64)
    d = b-a
    length = float(np.linalg.norm(d))
    radii = np.asarray(medium['outerRadiiM'],dtype=np.float64)
    offsets = np.cumsum([0, medium['scalpThicknessM'], medium['skullThicknessM'], medium['fluidThicknessM']])
    shells = [radii-o for o in offsets]
    knots = [0.,1.]
    if not homogeneous and length:
        for shell in shells:
            u, v = a/shell, d/shell
            aa, bb, cc = float(v@v), float(2*u@v), float(u@u-1)
            disc = bb*bb-4*aa*cc
            if disc > 0:
                knots.extend(t for t in ((-bb-math.sqrt(disc))/(2*aa),(-bb+math.sqrt(disc))/(2*aa)) if 0<t<1)
    knots = sorted(set(knots))
    lengths = dict.fromkeys(LAYERS,0.)
    travel, db, transmission, previous = 0.,0.,1.,None
    for lo,hi in zip(knots[:-1],knots[1:]):
        mid = a+d*(lo+hi)/2
        layer = 'brain' if homogeneous else LAYERS[sum(float(np.sum((mid/s)**2))<1 for s in shells)]
        mat = medium['materials'][layer]
        segment = length*(hi-lo)
        lengths[layer] += segment
        travel += segment/mat['soundSpeedMps']
        db += segment*100*mat['attenuationDbCmAtMHz']*(frequency_hz/1e6)**mat['attenuationPower']
        impedance = mat['soundSpeedMps']*mat['densityKgM3']
        if previous is not None:
            transmission *= 2*impedance/(previous+impedance)
        previous = impedance
    return dict(travelTimeS=travel, amplitude=.1/max(length,.001)*10**(-db/20)*transmission,
                attenuationDb=db, lengthM=length, layerLengthsM=lengths)


def piston(q):
    return 1. if abs(q)<1e-10 else float(2*j1(q)/q)


def directivity(normal, displacement, radius_m, frequency_hz, sound_speed):
    v = np.asarray(displacement,dtype=np.float64)
    norm = np.linalg.norm(v)
    cosine = float(np.dot(normal,v)/norm) if norm else 1.
    if cosine <= 0:
        return 0.
    return piston(2*np.pi*frequency_hz/sound_speed*radius_m*np.sqrt(max(0,1-cosine*cosine)))


def coherent_field(positions, normals, point, delays, weights, radius_m, medium, frequency_hz, homogeneous=False):
    value = 0j
    c = medium['materials']['brain' if homogeneous else 'water']['soundSpeedMps']
    for position,normal,delay,weight in zip(positions,normals,delays,weights):
        p = path(position,point,medium,frequency_hz,homogeneous)
        direct = directivity(normal,np.asarray(point)-position,radius_m,frequency_hz,c)
        value += weight*direct*p['amplitude']*np.exp(-2j*np.pi*frequency_hz*(p['travelTimeS']+delay))
    return complex(value)
