// Share cards for rival-a, ported from Rival B. Browser only, no dependencies, no web fonts
// (uses the phone's Noto Sans Bengali / system sans, like the rest of rival-a).
//
//   DPShare.png(spec, lang)    -> data: URL of a 1080x1350 PNG (Facebook / WhatsApp / Instagram 4:5)
//   DPShare.share(spec, lang)  -> Promise; opens the phone's share sheet with the image when the
//                                 browser supports sharing files (Android Chrome does), otherwise
//                                 resolves { fallback: dataUrl, caption } so the app shows the image
//                                 (long-press to save) and a Copy caption button.
//
// spec.kind: 'call' | 'called' | 'rank' | 'group' | 'streak'
//   call:   { q, side:'y'|'n', p }            p = crowd chance of the side the player picked (0..1)
//   called: { q, side, p, got, src }          got = points received when it settled
//   rank:   { rank, total, label }
//   group:  { name, code, size }
//   streak: { days }
//   all:    { who } optional display name; { url } optional link put in the caption
//
// Wording follows A20/A22: no betting words, and the A22 line goes on every card and caption.
// Nothing here gives anything of value for sharing (A23).
(function (root) {
  'use strict';
  var C = { ink: '#13201E', paper: '#FFF8EC', magenta: '#C21F72', gold: '#F2B705', teal: '#0A8463', orange: '#E0531A', mute: '#56493A', foot: '#C9D6D3' };
  var FONT = '"Noto Sans Bengali","Hind Siliguri",system-ui,Roboto,sans-serif';
  var BN = '০১২৩৪৫৬৭৮৯';
  var A22 = {
    en: "Free to play. No money, no prizes. Points can't be bought or cashed out. 18+ only.",
    bn: 'বিনামূল্যে খেলুন। কোনো টাকা নেই, কোনো পুরস্কার নেই। পয়েন্ট কেনা যায় না, ভাঙানো যায় না। শুধু ১৮+।'
  };
  var T = {
    en: { brand: 'Dhaka Predicts', my_call: 'My call', called: 'Called it', y: 'YES', n: 'NO', invited: "You're invited", streak: 'Daily streak',
      call_low: '{p} of players agree with me. Think I\'m wrong?', call_high: "I'm with {p} of players on this one.",
      called_sub: '{o} of players said {other}. I said {side}. Settled from {src}.', got: '+{n} points',
      rank_title: 'of {n} forecasters', rank_sub: 'Think you can call it better?',
      group_title: 'Join {name}', group_sub: 'Free forecasts on prices, weather and cricket. Members so far: {n}.', days: '{n} days',
      streak_title: 'Checked in {n} days running', streak_sub: 'One quick forecast a day.',
      cap_call: 'I said {side} on "{q}" on {brand}. Think I\'m wrong? Make your own call.',
      cap_called: 'I called it: {o} of players said {other}, I said {side}. "{q}" on {brand}.',
      cap_rank: "I'm #{r} of {n} on {brand}.", cap_group: 'Join my group "{name}" on {brand} with code {code}.',
      cap_streak: '{n}-day streak on {brand}.' },
    bn: { brand: 'ঢাকা প্রেডিক্টস', my_call: 'আমার অনুমান', called: 'মিলে গেছে!', y: 'হ্যাঁ', n: 'না', invited: 'আপনার আমন্ত্রণ', streak: 'টানা চেক-ইন',
      call_low: '{p} খেলোয়াড় আমার সাথে একমত। আপনার কী মনে হয়?', call_high: 'এবার আমি {p} খেলোয়াড়ের সাথে।',
      called_sub: '{o} খেলোয়াড় বলেছিল {other}। আমি বলেছিলাম {side}। ফলাফলের উৎস: {src}।', got: '+{n} পয়েন্ট',
      rank_title: '{n} জনের মধ্যে', rank_sub: 'আপনি কি আরও ভালো অনুমান করতে পারবেন?',
      group_title: '{name}-এ যোগ দিন', group_sub: '{n} জন সদস্য দাম, আবহাওয়া আর ক্রিকেট নিয়ে বিনামূল্যে অনুমান করছেন।', days: '{n} দিন',
      streak_title: 'টানা {n} দিন চেক-ইন', streak_sub: 'প্রতিদিন একটি ছোট অনুমান।',
      cap_call: '{brand}-এ "{q}" প্রশ্নে আমি বলেছি {side}। আপনার অনুমান কী?',
      cap_called: 'মিলে গেছে! {o} খেলোয়াড় বলেছিল {other}, আমি বলেছিলাম {side}। "{q}" · {brand}।',
      cap_rank: '{brand}-এ {n} জনের মধ্যে আমি #{r}।', cap_group: '{brand}-এ আমার গ্রুপ "{name}"-এ যোগ দিন, কোড {code}।',
      cap_streak: '{brand}-এ টানা {n} দিন।' }
  };
  function fill(s, v) { for (var k in v) s = s.split('{' + k + '}').join(v[k]); return s; }
  function dig(s, lang) { s = String(s); return lang === 'bn' ? s.replace(/\d/g, function (d) { return BN[d]; }) : s; }
  function pct(p, lang) { return dig(Math.round(p * 100), lang) + '%'; }

  function text(spec, lang) {
    var t = T[lang] || T.en, L = lang === 'bn' ? 'bn' : 'en', side = t[spec.side] || '', other = t[spec.side === 'y' ? 'n' : 'y'];
    switch (spec.kind) {
      case 'call': return { eyebrow: t.my_call, big: side, color: spec.side === 'y' ? C.teal : C.orange, title: spec.q,
        sub: fill(spec.p < 0.5 ? t.call_low : t.call_high, { p: pct(spec.p, L) }), cap: fill(t.cap_call, { side: side, q: spec.q }) };
      case 'called': return { eyebrow: t.called, big: fill(t.got, { n: dig(Math.round(spec.got), L) }), size: 150, color: C.teal, title: spec.q,
        sub: fill(t.called_sub, { o: pct(1 - spec.p, L), other: other, side: side, src: spec.src || '' }),
        cap: fill(t.cap_called, { o: pct(1 - spec.p, L), other: other, side: side, q: spec.q }) };
      case 'rank': return { eyebrow: spec.label || '', big: '#' + dig(spec.rank, L), color: C.magenta, title: fill(t.rank_title, { n: dig(spec.total, L) }),
        sub: t.rank_sub, cap: fill(t.cap_rank, { r: dig(spec.rank, L), n: dig(spec.total, L) }) };
      case 'group': return { eyebrow: t.invited, big: spec.code, size: 150, color: C.magenta, title: fill(t.group_title, { name: spec.name }),
        sub: fill(t.group_sub, { n: dig(spec.size, L) }), cap: fill(t.cap_group, { name: spec.name, code: spec.code }) };
      case 'streak': return { eyebrow: t.streak, big: fill(t.days, { n: dig(spec.days, L) }), size: 170, color: C.orange,
        title: fill(t.streak_title, { n: dig(spec.days, L) }), sub: t.streak_sub, cap: fill(t.cap_streak, { n: dig(spec.days, L) }) };
    }
    throw new Error('bad kind');
  }

  function wrap(x, s, X, Y, w, lh, max) {
    var words = String(s).split(' '), line = '', out = [];
    words.forEach(function (wd) { var t = line ? line + ' ' + wd : wd; if (x.measureText(t).width > w && line) { out.push(line); line = wd; } else line = t; });
    if (line) out.push(line);
    if (out.length > max) { out = out.slice(0, max); out[max - 1] += '…'; }
    out.forEach(function (l, i) { x.fillText(l, X, Y + i * lh); });
    return out.length * lh;
  }
  function fitBig(x, s, size, maxW) { // shrink long words (codes, Bangla) to fit the panel
    do { x.font = '800 ' + size + 'px ' + FONT; size -= 6; } while (x.measureText(s).width > maxW && size > 60);
    return size + 6;
  }

  function png(spec, lang) {
    lang = lang === 'bn' ? 'bn' : 'en';
    var o = text(spec, lang), c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    var x = c.getContext('2d'), cols = [C.magenta, C.gold, C.teal, C.orange], i;
    x.fillStyle = C.ink; x.fillRect(0, 0, 1080, 1350);
    for (i = 0; i < 27; i++) { // rickshaw-art trim
      x.fillStyle = cols[i % 4];
      x.beginPath(); x.moveTo(i * 40, 0); x.lineTo(i * 40 + 40, 0); x.lineTo(i * 40 + 20, 44); x.fill();
      x.beginPath(); x.moveTo(i * 40, 1350); x.lineTo(i * 40 + 40, 1350); x.lineTo(i * 40 + 20, 1306); x.fill();
    }
    x.fillStyle = C.gold;
    for (i = 0; i < 31; i++) { x.beginPath(); x.arc(30, 90 + i * 35, 5, 0, 7); x.fill(); x.beginPath(); x.arc(1050, 90 + i * 35, 5, 0, 7); x.fill(); }
    x.fillStyle = C.paper; x.beginPath(); if (x.roundRect) x.roundRect(80, 110, 920, 1000, 36); else x.rect(80, 110, 920, 1000); x.fill();
    x.textBaseline = 'top';
    x.fillStyle = C.magenta; x.font = '700 34px ' + FONT; x.fillText(String(o.eyebrow).toUpperCase(), 140, 165);
    var size = fitBig(x, o.big, o.size || 200, 800);
    x.fillStyle = o.color; x.fillText(o.big, 132, 215);
    var y = 215 + size + 40;
    x.fillStyle = C.ink; x.font = '600 58px ' + FONT; y += wrap(x, o.title, 140, y, 800, 74, 5) + 26;
    x.fillStyle = C.mute; x.font = '500 38px ' + FONT; wrap(x, o.sub, 140, y, 800, 54, 3);
    x.fillStyle = C.ink; x.fillRect(140, 1000, 800, 3);
    if (spec.who) { x.font = '700 38px ' + FONT; x.fillText(String(spec.who).slice(0, 30), 140, 1030); }
    x.font = '800 50px ' + FONT; x.fillStyle = C.gold; x.fillText(brand(spec, lang), 120, 1150);
    // A22 line, both languages, always
    x.fillStyle = C.foot; x.font = '500 24px ' + FONT;
    x.fillText(A22[lang], 120, 1205, 840);
    x.fillText(A22[lang === 'bn' ? 'en' : 'bn'], 120, 1243, 840);
    return c.toDataURL('image/png');
  }

  function brand(spec, lang) { return spec.brand || T[lang].brand; } // the site name is data (A34)
  function caption(spec, lang) {
    lang = lang === 'bn' ? 'bn' : 'en';
    return text(spec, lang).cap.split('{brand}').join(brand(spec, lang)) + (spec.url ? ' ' + spec.url : '') + ' ' + A22[lang];
  }

  function share(spec, lang) {
    var url = png(spec, lang), cap = caption(spec, lang);
    try {
      var bin = atob(url.split(',')[1]), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var file = new File([arr], 'dhaka-predicts.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], text: cap }).then(function () { return { shared: true }; }, function () { return { fallback: url, caption: cap }; });
      }
    } catch (e) {}
    return Promise.resolve({ fallback: url, caption: cap });
  }

  var DPShare = { png: png, caption: caption, share: share, A22: A22 };
  if (typeof module === 'object' && module.exports) module.exports = DPShare; else root.DPShare = DPShare;
})(this);
