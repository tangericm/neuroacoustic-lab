"""Generate real k-Wave 3-D fixtures, matched planar straight-ray comparators.

Run from repository root: .venv/Scripts/python -m reference.generate_fullwave
Frozen geometry, linear compressional acoustics, no phase calibration.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import subprocess
import time
import numpy as np
from scipy.interpolate import RegularGridInterpolator
from .oracle import directivity

ROOT = Path(__file__).resolve().parents[1]
FREQUENCY = 500000.
TARGET = np.array([.003,0,.05])
RADIUS = .0015
MATERIALS = {'water':dict(c=1500.,rho=1000.,alpha=0.), 'bone':dict(c=2800.,rho=1900.,alpha=12.), 'brain':dict(c=1560.,rho=1040.,alpha=.6)}
# k-Wave requires one alpha_power throughout. y=2 has zero power-law dispersion;
# coefficients are frequency-matched to 6dB/cm bone and .3dB/cm brain at .5MHz.
ALPHA_POWER = 2.0


def elements():
    i = np.arange(16)
    radial = .018*np.sqrt((i+.5)/16)
    angle = i*np.pi*(3-np.sqrt(5))
    xy = np.column_stack((radial*np.cos(angle),radial*np.sin(angle)))
    z = .05-np.sqrt(.04**2-radial**2)
    positions = np.column_stack((xy,z))
    normals = (np.array([0,0,.05])-positions)/.04
    return positions,normals


def planar_path(a,b,slab):
    d = b-a
    distance = np.linalg.norm(d)
    cuts = [0.,1.]
    if slab and abs(d[2])>1e-15:
        cuts += [q for plane in [.022,.0285] if 0<(q:=(plane-a[2])/d[2])<1]
    cuts.sort()
    travel,db,transmission,prev = 0.,0.,1.,None
    for low,high in zip(cuts[:-1],cuts[1:]):
        depth = (a+d*(low+high)/2)[2]
        name = 'water' if not slab or depth<.022 else 'bone' if depth<.0285 else 'brain'
        m = MATERIALS[name]
        length = distance*(high-low)
        travel += length/m['c']
        db += length*100*m['alpha']*.5
        impedance=m['c']*m['rho']
        if prev is not None:
            transmission *= 2*impedance/(prev+impedance)
        prev=impedance
    return travel,transmission*10**(-db/20)/max(distance,1e-6),db


def ray_plane(x,z,slab,mode):
    pos,normals=elements()
    times=np.array([planar_path(p,TARGET,slab and mode=='corrected')[0] for p in pos])
    delays=max(times)-times
    out=np.zeros((len(z),len(x)),complex)
    for iz,zz in enumerate(z):
        for ix,xx in enumerate(x):
            pt=np.array([xx,0,zz])
            for p,n,delay in zip(pos,normals,delays):
                travel,amp,_=planar_path(p,pt,slab)
                out[iz,ix] += .25*amp*directivity(n,pt-p,RADIUS,FREQUENCY,1500)*np.exp(-2j*np.pi*FREQUENCY*(travel+delay))
    return np.abs(out),delays


def measure(p,x,z,target=TARGET):
    # Restrict focal search to the target ROI, excluding sources and slab surface.
    roi=(abs(z[:,None]-target[2])<=.012)&(abs(x[None,:]-target[0])<=.012)
    iz,ix=np.unravel_index(np.argmax(np.where(roi,p,-np.inf)),p.shape)
    row=p[iz]
    half=row[ix]/2
    left=ix
    right=ix
    while left>0 and row[left]>=half: left-=1
    while right<len(x)-1 and row[right]>=half: right+=1
    xl=float(np.interp(half,row[left:left+2],x[left:left+2]))
    xr=float(np.interp(half,row[right-1:right+1][::-1],x[right-1:right+1][::-1]))
    target_amp=float(RegularGridInterpolator((z,x),p)(target[[2,0]][None,:])[0])
    return dict(focalPositionM=[float(x[ix]),0,float(z[iz])],focalErrorMm=float(np.hypot(x[ix]-target[0],z[iz]-target[2])*1000),
                lateralFwhmMm=(xr-xl)*1000,targetAmplitude=target_amp,peakAmplitude=float(p[iz,ix]))


def simulate(dx,slab,mode,backend='python',device='gpu',duration=90e-6):
    from kwave.kgrid import kWaveGrid
    from kwave.kmedium import kWaveMedium
    from kwave.ksource import kSource
    from kwave.ksensor import kSensor
    from kwave.kspaceFirstOrder import kspaceFirstOrder
    nx=int(round(.05/dx)); ny=nx; nz=int(round(.08/dx))
    x=(np.arange(nx)-nx//2)*dx; y=(np.arange(ny)-ny//2)*dx; z=np.arange(nz)*dx
    shape=(nx,ny,nz)
    grid=kWaveGrid(shape,[dx]*3)
    c=np.full(shape,1500.,dtype=np.float32); rho=np.full(shape,1000.,dtype=np.float32); alpha=np.zeros(shape,dtype=np.float32)
    if slab:
        for mask,name in [((z>=.022)&(z<.0285),'bone'),(z>=.0285,'brain')]:
            m=MATERIALS[name]
            c[:,:,mask]=m['c'];rho[:,:,mask]=m['rho'];alpha[:,:,mask]=m['alpha']*.5/(.5**ALPHA_POWER)
    medium=kWaveMedium(sound_speed=c,density=rho,alpha_coeff=alpha,alpha_power=ALPHA_POWER)
    dt=.2*dx/float(c.max()); steps=int(np.ceil(duration/dt)); grid.setTime(steps,dt)
    t=np.arange(steps)*dt
    positions,normals=elements()
    travel=np.array([planar_path(p,TARGET,slab and mode=='corrected')[0] for p in positions]);delays=max(travel)-travel
    # Voxelized tilted finite discs; each source integrates to the same physical
    # disc area as dx changes. Python source rows use C order; C++ serializer
    # consumes MATLAB/Fortran source rows. Both unified backends return C rows.
    labels=np.full(shape,-1,dtype=np.int16)
    X,Y,Z=np.meshgrid(x,y,z,indexing='ij')
    counts=[]
    for j,(p,n) in enumerate(zip(positions,normals)):
        vx=X-p[0];vy=Y-p[1];vz=Z-p[2]
        along=vx*n[0]+vy*n[1]+vz*n[2]
        disc=(abs(along)<=dx/2)&(vx*vx+vy*vy+vz*vz-along*along<=RADIUS**2)
        if np.any(labels[disc]>=0): raise ValueError('Overlapping source discs')
        labels[disc]=j;counts.append(int(disc.sum()))
    source=kSource();source.p_mask=(labels>=0).astype(np.uint8)
    ids=labels.ravel(order='C' if backend=='python' else 'F');ids=ids[ids>=0]
    source.p=np.empty((len(ids),steps),dtype=np.float32)
    for row,j in enumerate(ids):
        td=t-delays[j]
        ramp=np.sin(np.clip(td/(8/FREQUENCY),0,1)*np.pi/2)**2
        source.p[row]=.25*np.pi*RADIUS**2/(counts[j]*dx**2)*ramp*np.sin(2*np.pi*FREQUENCY*td)
    source.p_mode='additive'
    mask=np.zeros(shape,dtype=np.uint8);mask[:,ny//2,:]=1
    sensor=kSensor(mask=mask)
    fit_start=int((duration-20e-6)/dt)
    # 0.6.3rc1 C++ wrapper does not forward record_start_index. Record all,
    # explicitly select the final window after execution.
    if backend=='python':sensor.record_start_index=fit_start+1
    import kwave
    binary=str(kwave.BINARY_PATH / ('kspaceFirstOrder-CUDA.exe' if device=='gpu' else 'kspaceFirstOrder-OMP.exe')) if platform.system()=='Windows' and backend=='cpp' else None
    start=time.perf_counter()
    result=kspaceFirstOrder(grid,medium,source,sensor,pml_size=12,pml_inside=False,backend=backend,device=device,quiet=True,binary_path=binary,dtype=np.float32 if backend=='python' else None)
    runtime=time.perf_counter()-start
    data=np.asarray(result['p']).squeeze()
    n_sensor=nx*nz
    if data.shape[0]!=n_sensor and data.shape[1]==n_sensor:data=data.T
    if data.shape[0]!=n_sensor:raise RuntimeError(f'Unexpected sensor shape {data.shape}')
    if backend=='cpp':data=data[:,fit_start:]
    times=t[fit_start:fit_start+data.shape[1]]
    design=np.column_stack((np.sin(2*np.pi*FREQUENCY*times),np.cos(2*np.pi*FREQUENCY*times),np.ones_like(times)))
    coeff=data@np.linalg.pinv(design).T
    amplitude=np.hypot(coeff[:,0],coeff[:,1]).reshape((nx,nz),order='C').T
    # Saved central plane focuses on propagation/focal region and is compact.
    keepz=(z>=.03)&(z<=.07);keepx=abs(x)<=.02
    xp=x[keepx];zp=z[keepz];plane=amplitude[np.ix_(keepz,keepx)]
    ray,_=ray_plane(xp,zp,slab,mode)
    return dict(dxM=dx,shape=list(shape),dtS=dt,steps=steps,runtimeS=runtime,mode=mode,sourceCells=counts,
                effectiveBoneThicknessMm=float(np.sum((z>=.022)&(z<.0285))*dx*1000) if slab else 0.,
                metrics=measure(plane,xp,zp),rayMetrics=measure(ray,xp,zp),
                plane=dict(xMm=(xp*1000).tolist(),zMm=(zp*1000).tolist(),pressure=plane.ravel().tolist(),rayPressure=ray.ravel().tolist()))


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--backend',default='python');parser.add_argument('--device',default='gpu');parser.add_argument('--force',action='store_true')
    args=parser.parse_args()
    cache=ROOT/'.work'/'fullwave';cache.mkdir(parents=True,exist_ok=True)
    cases=[]
    for slab in [False,True]:
        runs=[]
        for dx in [.000625,.0005]:
            for mode in (['uncorrected','corrected'] if slab else ['uncorrected']):
                key=f'{"slab" if slab else "free"}-{dx}-{mode}'
                file=cache/(key+'.json')
                if file.exists() and not args.force: run=json.loads(file.read_text())
                else:
                    print('RUN '+key,flush=True)
                    run=simulate(dx,slab,mode,args.backend,args.device)
                    file.write_text(json.dumps(run,allow_nan=False))
                    print(json.dumps({k:run[k] for k in ['dxM','runtimeS','metrics']}),flush=True)
                runs.append(run)
        cases.append(dict(id='slab' if slab else 'free',label='Water / 6.5 mm bone / brain' if slab else 'Homogeneous water',runs=runs))
    # One free-field amplitude scale per grid; no skull amplitude or phase fit.
    scales={r['dxM']:r['metrics']['targetAmplitude']/r['rayMetrics']['targetAmplitude'] for r in cases[0]['runs']}
    for case in cases:
        for run in case['runs']:
            free=next(r for r in cases[0]['runs'] if r['dxM']==run['dxM'])
            scale=scales[run['dxM']]
            p=np.array(run['plane']['pressure']);r=np.array(run['plane']['rayPressure'])*scale
            run['plane']['rayPressure']=r.tolist()
            run['rayAmplitudeScaleFromFreeField']=scale
            run['metrics']['normalizedL2Ray']=float(np.linalg.norm(p-r)/np.linalg.norm(p))
            for key in ['targetAmplitude','peakAmplitude']:run['rayMetrics'][key]*=scale
            run['metrics']['targetRelativeToFreeField']=run['metrics']['targetAmplitude']/free['metrics']['targetAmplitude']
            run['plane']['pressure']=[round(v,7) for v in p]
            run['plane']['rayPressure']=[round(v,7) for v in r]
        case['convergence']=[]
        for mode in {r['mode'] for r in case['runs']}:
            coarse,fine=sorted([r for r in case['runs'] if r['mode']==mode],key=lambda r:-r['dxM'])
            cx=np.array(coarse['plane']['xMm']);cz=np.array(coarse['plane']['zMm'])
            fx=np.array(fine['plane']['xMm']);fz=np.array(fine['plane']['zMm'])
            c=np.array(coarse['plane']['pressure']).reshape(len(cz),len(cx));f=np.array(fine['plane']['pressure']).reshape(len(fz),len(fx))
            zz,xx=np.meshgrid(cz,cx,indexing='ij');sample=RegularGridInterpolator((fz,fx),f,bounds_error=False,fill_value=np.nan)(np.column_stack((zz.ravel(),xx.ravel()))).reshape(c.shape)
            valid=np.isfinite(sample)
            case['convergence'].append(dict(mode=mode,coarseDxMm=coarse['dxM']*1000,fineDxMm=fine['dxM']*1000,
                normalizedL2=float(np.linalg.norm(c[valid]-sample[valid])/np.linalg.norm(sample[valid])),
                targetAmplitudeRelativeChange=float((fine['metrics']['targetAmplitude']-coarse['metrics']['targetAmplitude'])/fine['metrics']['targetAmplitude']),
                focalPositionChangeMm=float(np.linalg.norm(np.array(coarse['metrics']['focalPositionM'])-fine['metrics']['focalPositionM'])*1000),
                lateralFwhmChangeMm=fine['metrics']['lateralFwhmMm']-coarse['metrics']['lateralFwhmMm']))
    import kwave
    positions,normals=elements()
    result=dict(schemaVersion=1,provenance=dict(solver='k-Wave k-space pseudospectral 3D compressional',version=kwave.__version__,binaryVersion=kwave.BINARY_VERSION,
        backend=args.backend,device=args.device,hardware=subprocess.check_output(['nvidia-smi','--query-gpu=name','--format=csv,noheader'],text=True).strip(),seed=1729,
        generatedUtc=datetime.now(timezone.utc).isoformat(),python=platform.python_version(),numpy=np.__version__,scipy=importlib.metadata.version('scipy'),
        sourceSha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),Path(__file__).with_name('oracle.py')]},
        sources=['https://k-wave-python.readthedocs.io/en/latest/','https://github.com/waltsims/k-wave-python','https://github.com/waltsims/kspacefirstorder-unified/releases/tag/v1.4.2']),
        config=dict(frequencyHz=FREQUENCY,targetM=TARGET.tolist(),elements=[dict(positionM=p.tolist(),normal=n.tolist(),radiusM=RADIUS,weight=.25) for p,n in zip(positions,normals)],
            geometry='Fixed 16 finite-disc spherical cap, radius 40 mm; slab z=22..28.5 mm; independent from interactive head geometry',domainMm=[50,50,80],materials=MATERIALS,
            attenuationPower=ALPHA_POWER,attenuationNote='Coefficients are frequency matched at 500kHz; power 2 has zero dispersive term, consistent with nondispersive ray speeds.',
            durationUs=90,recordLastUs=20,sourceRampCycles=8,pmlCells=12,cfl=.2,planeOrder='z-major, x-fastest',pressureUnits='arbitrary linear pressure, identical integrated disc drive and weights across grids/cases'),
        cases=cases,limitations=['This is a small frozen 3D planar compressional reference, not full-head or patient validation.',
            'No shear waves, elastic mode conversion, CT-derived heterogeneity, nonlinear harmonics, thermal or safety prediction.',
            'Two grids measure sensitivity; they do not establish asymptotic convergence. Bone and circular sources are voxelized.',
            'Ray comparator uses straight paths and normal-incidence pressure transmission; k-Wave includes refraction, diffraction and reverberation.',
            'One free-field target amplitude scale per grid aligns ray source units; no slab amplitude fit or numerical phase correction.',
            'Focal metrics search +/-12mm target ROI on the central x-z plane, not a full 3D global peak.',
            'Finite 90us continuous-wave run and 20us fit window leave possible residual transients; pressure values are not calibrated pascals.',
            'Absorption exponent 2 is frequency matched at 500kHz and its dispersive term is zero; broadband tissue attenuation is not validated.'])
    output=ROOT/'public'/'reference'/'fullwave.json';output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,separators=(',',':'),allow_nan=False))
    print('WROTE '+str(output),flush=True)


if __name__=='__main__':main()
