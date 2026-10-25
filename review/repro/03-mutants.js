// Mutates a copy of app.js and reports whether i18n-parity catches it (exit code of the real CLI).
const fs=require('fs'),cp=require('child_process');
const SRC='/home/user/upcoming/dhk-predicts-features/app/public/app.js';
const D='/tmp/claude-0/-home-user-DHK-Predicts/40770141-c89f-5d4e-b4c8-6b95cd22e417/scratchpad/03/';
const orig=fs.readFileSync(SRC,'utf8');
const rep=(a,b)=>s=>{if(!s.includes(a))throw new Error('no anchor '+a);return s.replace(a,b)};
const M={
 'baseline (unmodified)':s=>s,
 'D1 key used in code, defined nowhere (t("nope_key"))':s=>s.replace("function t(k, vars) {","var __x=t('nope_key');\n  function t(k, vars) {"),
 'D2 dup key en (later wins, different value)':rep("close: 'Close'","close: 'Close', close: 'WRONG'"),
 'D3 dup key bn (later wins)':s=>s.replace("close: 'বন্ধ'","close: 'বন্ধ', close: 'ভুল'"),
 'D4 untranslated English left in bn (app: bn.top)':rep("top: 'সেরা'","top: 'Top'"),
 'D5 bn value identical to en for whole sentence':rep("bn: {\n      app: 'ঢাকা প্রেডিক্টস'","bn: {\n      app: 'Dhaka Predicts'"),
 'D6 bn value uses ASCII digits where en does':rep("e_bad_otp","e_bad_otp"),
 'D7 non-string value (number) in bn':rep("top: 'সেরা'","top: 5"),
 'D8 value is object (nested)':rep("top: 'সেরা'","top: {x:'a'}"),
 'D9 call site passes wrong var name (t("est",{w}) -> {q}), dicts untouched':rep("t('est', { s: '<b>' + num(sh) + '</b>', w:","t('est', { s: '<b>' + num(sh) + '</b>', q:"),
 'D10 placeholder renamed in BOTH langs, call site still passes w':s=>s.replace(/(est: '[^'\n]*?)\{w\}/g,'$1{zz}'),
 'D11 mojibake in bn value':rep("top: 'সেরা'","top: 'à¦¸à§‡à¦°à¦¾'"),
 'D12 PRIVACY bn section removed':s=>s.replace(/\n      \['পরিবর্তন', \['[^\n]*\n/,"\n"),
 'D13 TERMS en section removed':s=>s.replace(/\n      \['Contact', \['[^\n]*\n/,"\n"),
 'D14 PRIVACY bn paragraph blanked':rep("['আমরা কারা', [","['আমরা কারা', ['', "),
 'D15 PRIVACY bn contains English paragraph copy':rep("['পরিবর্তন', ['গুরুত্বপূর্ণ","['পরিবর্তন', ['Changes we make will be told in the app. গুরুত্বপূর্ণ"),
 'D16 key in en only via bracket-quoted "key"':rep("top: 'Top'","'top': 'Top'"),
 'D17 comment with quote+brace inside T (// it\'s {)':s=>s.replace("      app: 'ঢাকা প্রেডিক্টস',","      // it's { broken\n      app: 'ঢাকা প্রেডিক্টস',"),
 'D18 comment with brace in T ( /* } */ )':s=>s.replace("      app: 'ঢাকা প্রেডিক্টস',","      /* } */ app: 'ঢাকা প্রেডিক্টস',"),
 'D19 comment above T containing marker text':s=>s.replace("  var T = {","  // old: var T = { bn: {}, en: {} }\n  var T = {"),
 'D20 template literal with ${} in bn':rep("top: 'সেরা'","top: `${1+1} সেরা`"),
 'D21 regex literal with quote inside T':rep("top: 'সেরা'","top: /'/.source"),
 'D22 en value only whitespace/nbsp':rep("top: 'Top'","top: '\\u00a0'"),
 'D23 escaped brace placeholder \\{w\\} (not a placeholder at runtime?)':rep("top: 'Top'","top: 'Top {w}'"),
 'D24 bn value only Latin (not equal to en): "Leaderboard"':rep("top: 'সেরা'","top: 'Leaders'"),
 'D25 e_ key present in en, missing in bn':s=>s.replace(/ e_bad_otp: '[^']*',/,m=>m.includes('বা')||/[ঀ-৿]/.test(m)?'':m),
};
const fix6=s=>s; // D6 handled below
let i=0;
for(const [name,fn] of Object.entries(M)){
  let out;try{out=fn(orig)}catch(e){console.log(name.padEnd(75),'MUTATION FAILED',e.message);continue}
  const f=D+'m'+(i++)+'.js';fs.writeFileSync(f,out);
  const changed=out!==orig;
  const r=cp.spawnSync('node',['/home/user/upcoming/i18n-parity/index.js',f,'var T = ','bn','en'],{encoding:'utf8',timeout:20000});
  console.log(name.padEnd(75),changed?'':'(no change!) ',r.status===0?'PASS (not caught)':'exit '+r.status+' CAUGHT: '+((r.stderr||'').split('\n')[0]).slice(0,70));
}
