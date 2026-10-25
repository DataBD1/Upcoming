#!/bin/bash
# Edge cases of size-budget/index.js. Run: bash 02-tool-bugs.sh
T=/tmp/claude-0/-home-user-DHK-Predicts/40770141-c89f-5d4e-b4c8-6b95cd22e417/scratchpad/02/t; rm -rf $T; mkdir -p $T/d $T/sub "$T/ünï"; cd $T
S=/home/user/upcoming/size-budget/index.js
echo hello > a.js; echo hello > "ünï/ü.js"; ln -s a.js link.js
run(){ echo "--- $1"; shift; node $S "$@" 2>&1 | head -6; echo "rc=${PIPESTATUS[0]}"; }
echo '{"files":{"nope.js":1}}' > missing.json;  run "missing file" missing.json
echo '{"files":{"d":1}}' > dir.json;            run "directory as file" dir.json
echo '{"files":{}}' > empty.json;               run "empty files object (should it pass?)" empty.json
echo '{}' > nofiles.json;                       run "no files key" nofiles.json
echo '{"files":{"a.js":-1}}' > neg.json;        run "negative budget" neg.json
echo '{"files":{"a.js":"abc"}}' > str.json;    run "string budget (NaN compare)" str.json
echo '{"files":{"a.js":null}}' > null.json;    run "null budget" null.json
echo '{"files":{"a.js":1},"total":"x"}' > tstr.json; run "string total" tstr.json
echo '{"files":{"a.js":1},"total":0}' > t0.json; run "total 0 (should fail)" t0.json
echo '{"files":{"link.js":1}}' > sym.json;     run "symlink" sym.json
echo '{"files":{"ünï/ü.js":1}}' > uni.json;    run "unicode path" uni.json
echo '{"files":{"a.js":1,"typo":1},"excludeFromTotal":["a.jss"]}' > ex.json; run "exclude typo ignored silently" ex.json
echo '{"files":{"../a.js":1}}' > sub/up.json; cp a.js sub/../a.js 2>/dev/null; run "config in other dir, file ../a.js" sub/up.json
echo '{bad' > bad.json;                        run "invalid json" bad.json
run "missing config" nonexist.json
echo '{"files":{"a.js":1}}' > size-budget.json; (cd sub && echo "--- default cfg from other cwd"; node $S 2>&1 | head -3; echo rc=$?)
echo '{"files":{"a.js":1}}' | tee x.json >/dev/null; run "files as array" <(echo '{"files":["a.js"]}')
# duplicate file keys / same file via two paths double-counted in total
echo '{"files":{"a.js":1,"./a.js":1},"total":0.01}' > dup.json; run "same file twice -> double counted" dup.json
# brotli input limit: big file
head -c 300000000 /dev/zero > big.bin; echo '{"files":{"big.bin":1}}' > big.json; run "300MB zero file" big.json
