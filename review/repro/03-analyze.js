// Analyses app.js for defects the i18n-parity tool does not see. usage: node 03-analyze.js [path to app.js]
const fs=require('fs'),vm=require('vm');
const file=process.argv[2]||'/home/user/upcoming/dhk-predicts-features/app/public/app.js';
const src=fs.readFileSync(file,'utf8');
const {literalAfter}=require('/home/user/upcoming/i18n-parity/index.js');
const T=vm.runInNewContext('('+literalAfter(src,'var T = ')+')',{},{timeout:1000});
const out={};
// duplicate keys per language: scan the raw literal text per block
const lit=literalAfter(src,'var T = ');
for(const l of ['bn','en']){
  const m=lit.match(new RegExp('\\b'+l+': \\{([\\s\\S]*?)\\n    \\}'));
  const keys=[...m[1].matchAll(/(?:^|[,{\s])([A-Za-z_]\w*):\s*['"`]/g)].map(x=>x[1]);
  const seen={},d=[];keys.forEach(k=>{if(seen[k])d.push(k);seen[k]=1});
  out['dup_'+l]=d; out['rawcount_'+l]=keys.length; out['objcount_'+l]=Object.keys(T[l]).length;
}
// used keys
const body=src.replace(lit,'');
const used=new Set(),dyn=[];
for(const m of body.matchAll(/\bt\(\s*(['"])([^'"]+)\1/g))used.add(m[2]);
for(const m of body.matchAll(/\bt\(\s*([^'"\s)][^,)]*)/g))dyn.push(m[1]);
out.used=used.size;
out.used_undefined_both=[...used].filter(k=>!(k in T.bn)&&!(k in T.en));
out.used_missing_bn=[...used].filter(k=>!(k in T.bn)&&(k in T.en));
out.dynamic_t_calls=[...new Set(dyn)];
const all=new Set([...Object.keys(T.bn),...Object.keys(T.en)]);
// dynamic prefixes
out.unused=[...all].filter(k=>!used.has(k)&&!body.includes("'"+k+"'")&&!body.includes('"'+k+'"'));
// placeholder vs call-site vars
const ph=s=>(String(s).match(/\{\w+\}/g)||[]).map(x=>x.slice(1,-1));
out.callsite_ph=[];
for(const m of body.matchAll(/\bt\(\s*'([^']+)'\s*,\s*\{([^}]*)\}/g)){
  const vars=[...m[2].matchAll(/(\w+)\s*:/g)].map(x=>x[1]);
  for(const l of ['bn','en']){const p=ph(T[l][m[1]]||'');
    const miss=p.filter(x=>!vars.includes(x)),extra=vars.filter(x=>!p.includes(x));
    if(miss.length||extra.length)out.callsite_ph.push(`${l}.${m[1]} placeholders[${p}] vars[${vars}]`);}
}
// placeholders used in t(k) without vars
out.ph_no_vars=[];
for(const k of used)for(const l of ['bn','en'])if(ph(T[l][k]).length&&!new RegExp("\\bt\\('"+k+"'\\s*,").test(body))out.ph_no_vars.push(l+'.'+k);
// repeated placeholders (t replaces only first)
out.repeated_ph=[];for(const l of ['bn','en'])for(const k in T[l]){const p=ph(T[l][k]);if(new Set(p).size!==p.length)out.repeated_ph.push(l+'.'+k)}
// identical / latin in bn
out.identical=Object.keys(T.bn).filter(k=>k in T.en&&T.bn[k]===T.en[k]);
const bnNoBangla=Object.keys(T.bn).filter(k=>typeof T.bn[k]==='string'&&!/[ঀ-৿]/.test(T.bn[k]));
out.bn_no_bangla_chars=bnNoBangla.map(k=>k+'='+T.bn[k]);
out.bn_latin_ratio=Object.keys(T.bn).filter(k=>{const s=String(T.bn[k]).replace(/\{\w+\}/g,'');const lat=(s.match(/[A-Za-z]/g)||[]).length,bn=(s.match(/[ঀ-৿]/g)||[]).length;return lat>bn&&lat>3}).length;
out.bn_ascii_digits=Object.keys(T.bn).filter(k=>/\d/.test(T.bn[k].replace(/\{\w+\}/g,'')));
out.en_bangla=Object.keys(T.en).filter(k=>/[ঀ-৿]/.test(T.en[k]));
out.mojibake=[src.match(/[�]/g)||[]].map(a=>a.length);
out.nonstring=['bn','en'].flatMap(l=>Object.keys(T[l]).filter(k=>typeof T[l][k]!=='string').map(k=>l+'.'+k));
out.html_diff=Object.keys(T.bn).filter(k=>k in T.en&&/<[^>]+>/.test(T.bn[k])!==/<[^>]+>/.test(T.en[k]));
// PRIVACY/TERMS
for(const n of ['PRIVACY','TERMS']){
  const o=vm.runInNewContext('('+literalAfter(src,'var '+n+' = ')+')',{},{timeout:1000});
  const r={};for(const l of ['bn','en'])r[l]={sections:o[l].sections.length,paras:o[l].sections.map(s=>s[1].length).join(','),
    ph:(JSON.stringify(o[l]).match(/\[[^\]]*\]/g)||[]).length,tags:(JSON.stringify(o[l]).match(/<b>/g)||[]).length,digits_ascii:(o[l].sections.flat(2).join(' ').match(/\d/g)||[]).length};
  out[n]=r;
}
console.log(JSON.stringify(out,null,1));
