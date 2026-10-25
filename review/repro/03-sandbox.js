// Probes vm.runInNewContext use in i18n-parity/index.js. Each case is a hostile "app.js".
const {check}=require('/home/user/upcoming/i18n-parity/index.js');
const {execFileSync,spawnSync}=require('child_process');
const wrap=body=>"var T = { bn: { a: "+body+" }, en: { a: 'x' } };";
const only=process.argv[2];let n=0;const run0=(name,src,fn)=>{const t0=Date.now();let r;try{r=check(src,'var T = ','bn','en');r='returned '+JSON.stringify(r)}catch(e){r='threw '+String(e.message).slice(0,80)}console.log(name.padEnd(34),r,(Date.now()-t0)+'ms',fn?fn():'')};
global.PWNED=0;const run=(name,...a)=>{if(String(n++)===only)run0(name,...a)};
// 1 classic escape via constructor chain -> host process
run('constructor escape (this.constructor)', wrap("(this.constructor.constructor('return process')().mainModule.require('fs').writeFileSync('/tmp/claude-0/-home-user-DHK-Predicts/40770141-c89f-5d4e-b4c8-6b95cd22e417/scratchpad/03/PWNED_escape','x'),'a')"),()=>require('fs').existsSync('/tmp/claude-0/-home-user-DHK-Predicts/40770141-c89f-5d4e-b4c8-6b95cd22e417/scratchpad/03/PWNED_escape')?'ESCAPED: file written':'no file');
// 2 sync infinite loop
run('while(true) in IIFE', wrap("(function(){while(true){}})()"));
// 3 regex ReDoS
run('ReDoS regex', wrap("/(a+)+$/.test('a'.repeat(40)+'!')"));
// 4 memory
run('memory bomb', wrap("(function(){var a=[];while(true)a.push(new Array(1e6).fill(1))})()"));
// 5 async/microtask escape of timeout: promise loop
run('microtask loop', wrap("(Promise.resolve().then(function f(){return Promise.resolve().then(f)}),'a')"));
// 6 string growth
run('string doubling', wrap("(function(){var s='x';for(;;)s+=s})()"));
