"""Small deterministic float64 cross-language fixtures; no JavaScript dependency."""
import json
from pathlib import Path
import numpy as np
from .oracle import default_medium,path,coherent_field,piston


def main():
    medium=default_medium()
    rng=np.random.default_rng(1729)
    paths=[]
    starts=[[0,0,.12],[0,0,-.12],[.12,0,0],[-.12,.02,.03],[-.2,.09,0],[.2,.2,.2]]
    ends=[[0,0,0],[.01,.01,-.02],[0,0,0],[.015,-.012,.025],[.2,.09,0],[.15,.15,.15]]
    for i in range(12):
        u=rng.normal(size=3);u/=np.linalg.norm(u)
        starts.append((.12*u).tolist());ends.append(rng.uniform(-.03,.03,3).tolist())
    for start,end in zip(starts,ends):
        for homogeneous in [False,True]:
            paths.append(dict(start=start,end=end,homogeneous=homogeneous,expected=path(start,end,medium,500000,homogeneous)))
    positions=np.array([[0,0,.12],[.06,0,.10392304845413264],[-.055,.03,.10234744745229361],[0,-.07,.09746794344808964]])
    normals=-positions/np.linalg.norm(positions,axis=1)[:,None]
    target=np.array([.012,-.008,.015])
    fields=[]
    for mode in ['homogeneous','uncorrected','corrected']:
        travel=np.array([path(p,target,medium,500000,True)['travelTimeS'] if mode=='homogeneous' else path(p,target,medium,500000)['travelTimeS'] if mode=='corrected' else np.linalg.norm(p-target)/1560 for p in positions])
        delays=max(travel)-travel
        weights=[.5]*4
        for point in [target,np.array([0.,0.,0.]),np.array([-.015,.012,-.02])]:
            pressure=coherent_field(positions,normals,point,delays,weights,.003,medium,500000,mode=='homogeneous')
            fields.append(dict(mode=mode,point=point.tolist(),delaysS=delays.tolist(),weights=weights,expected=dict(real=pressure.real,imag=pressure.imag,magnitude=abs(pressure))))
    fixture=dict(schemaVersion=1,description='Independent NumPy float64 and SciPy J1 oracle. SI units; arbitrary 100mm pressure normalization.',seed=1729,frequencyHz=500000,assumedSoundSpeedMps=1560,medium=medium,paths=paths,
        elements=[dict(position=p.tolist(),normal=n.tolist(),radiusM=.003) for p,n in zip(positions,normals)],targetM=target.tolist(),fields=fields,
        piston=[dict(argument=q,expected=piston(q)) for q in [0,1e-8,.2,1,3.8317059702075125,5,8,12]])
    out=Path(__file__).resolve().parents[1]/'public'/'reference'/'golden.json'
    out.write_text(json.dumps(fixture,indent=2,allow_nan=False))
    print(f'Wrote {len(paths)} paths, {len(fields)} complex fields: {out}')


if __name__=='__main__':main()
