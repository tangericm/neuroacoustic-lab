"""A numerical cache must never inherit the repackager's provenance."""
import copy
import json
import pytest
from reference import generate_fullwave as generator


def cache_api():
    assert hasattr(generator,'cache_fingerprint'), 'Fingerprint validation missing'
    assert hasattr(generator,'read_cached_run'), 'Validated cache reader missing'
    return generator.cache_fingerprint,generator.read_cached_run


@pytest.mark.parametrize('change',['source','backend','spacing','software'])
def test_changed_execution_or_configuration_cannot_reuse_cache(tmp_path,change):
    fingerprint,read=cache_api()
    identity={'config':{'dxM':.0005},'execution':{'backend':'python','version':'0.6.3rc1','sourceSha256':{'generator':'old'}}}
    fp=fingerprint(identity)
    file=tmp_path/'run.json'
    file.write_text(json.dumps({'cacheVersion':1,'identity':identity,'fingerprint':fp,'run':{'runtimeS':4,'provenance':{'computedUtc':'original','fingerprint':fp}}}))
    assert read(file,identity)['provenance']['computedUtc']=='original'
    changed=copy.deepcopy(identity)
    if change=='source':changed['execution']['sourceSha256']['generator']='new'
    elif change=='backend':changed['execution']['backend']='cpp'
    elif change=='software':changed['execution']['version']='future'
    else:changed['config']['dxM']=.000625
    assert read(file,changed) is None


def test_legacy_and_forged_identity_caches_are_rejected(tmp_path):
    fingerprint,read=cache_api()
    file=tmp_path/'run.json'
    identity={'config':{'dxM':.0005},'execution':{'backend':'python'}}
    file.write_text(json.dumps({'runtimeS':4}))
    assert read(file,identity) is None
    file.write_text(json.dumps({'cacheVersion':1,'identity':{'wrong':True},'fingerprint':fingerprint(identity),'run':{}}))
    assert read(file,identity) is None
