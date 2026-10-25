// Dhaka Predicts (rival A) game engine. Plain JS, no dependencies.
// Runs on the server (Node) and in the browser (offline/demo mode), so the
// same rules price every trade wherever it happens.
(function (root) {
  'use strict';

  var START_POINTS = 1000;
  var DAILY_BONUS = 100;
  var HIST_MAX = 48;
  // LMSR liquidity. Risk M2: a player's whole 1,000-point start should move a 50% market
  // by about 15 points at most (b = 3000 gives 50% -> 65%); 100 points moves it under 2.
  var LIQUIDITY = 3000;

  // ---- LMSR market maker ----------------------------------------------------
  function cost(b, qy, qn) {
    var m = Math.max(qy, qn);
    return m + b * Math.log(Math.exp((qy - m) / b) + Math.exp((qn - m) / b));
  }
  function priceYes(b, qy, qn) {
    return 1 / (1 + Math.exp((qn - qy) / b));
  }
  // Shares of `side` that `amount` points buys.
  function sharesFor(m, side, amount) {
    var b = m.b, mine = side === 'y' ? m.qy : m.qn, other = side === 'y' ? m.qn : m.qy;
    var k = (cost(b, m.qy, m.qn) + amount) / b;
    var next = b * (k + Math.log1p(-Math.exp(other / b - k)));
    return next - mine;
  }
  // Points received for selling `shares` of `side`.
  function proceedsFor(m, side, shares) {
    var before = cost(m.b, m.qy, m.qn);
    var after = side === 'y' ? cost(m.b, m.qy - shares, m.qn) : cost(m.b, m.qy, m.qn - shares);
    return before - after;
  }

  // ---- helpers ----------------------------------------------------------------
  // Own-property lookup. Never index a plain object with user input directly:
  // READS['constructor'] would be Object() and hand back the whole state.
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
  function err(code) { var e = new Error(code); e.code = code; return e; }
  // Calendar day in the site's timezone (A34/A37: the top-up resets at local midnight).
  function localDay(now, offsetMin) { return new Date(now + offsetMin * 60e3).toISOString().slice(0, 10); }
  function siteDay(s, now) { return localDay(now, s.site ? s.site.utcOffset : 360); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function pY(m) { return priceYes(m.b, m.qy, m.qn); }
  function pos(state, uid, mid) {
    var u = state.pos[uid] || (state.pos[uid] = {});
    var p = u[mid] || (u[mid] = { y: 0, n: 0, spent: 0, sy: 0, sn: 0 });
    // Per-side cost basis. Older saved positions only have the combined `spent`:
    // split it by share count the first time we see them.
    if (p.sy == null) {
      var tot = p.y + p.n;
      p.sy = tot > 0 ? p.spent * p.y / tot : 0;
      p.sn = p.spent - p.sy;
    }
    return p;
  }
  function findMarket(state, id) {
    for (var i = 0; i < state.markets.length; i++) if (state.markets[i].id === id) return state.markets[i];
    throw err('no_market');
  }
  function isOpen(m, now) { return m.status === 'open' && now < m.closes; }

  function summary(m, now) {
    return {
      id: m.id, cat: m.cat, city: m.city, tz: m.tz, utcOffset: m.utcOffset, q: m.q, p: r2(pY(m) * 100) / 100, vol: Math.round(m.vol),
      closes: m.closes, status: isOpen(m, now) ? 'open' : m.status === 'open' ? 'closed' : m.status,
      outcome: m.outcome, proposal: m.proposal ? { out: m.proposal.out, until: m.proposal.until } : null, traders: m.traders, spark: m.hist.map(function (h) { return Math.round(h[1] * 100); })
    };
  }

  // What a position would fetch if sold back now. Valuing at the last price instead lets one
  // big buy in a quiet market inflate the buyer's own net worth (spend 990 -> worth 1,554).
  function holdValue(m, p) {
    var v = 0;
    if (p.y > 0) v += proceedsFor(m, 'y', p.y);
    if (p.n > 0) v += proceedsFor({ b: m.b, qy: m.qy - (p.y > 0 ? p.y : 0), qn: m.qn }, 'n', p.n);
    return v;
  }
  function worth(state, uid) {
    var u = state.users[uid], total = u.pts - (u.debt || 0), P = state.pos[uid] || {};
    state.markets.forEach(function (m) {
      var p = P[m.id]; if (!p || m.status !== 'open') return;
      total += holdValue(m, p);
    });
    return Math.round(total);
  }

  function publicUser(state, uid, now) {
    var u = state.users[uid];
    return {
      id: u.id, name: u.name, pts: Math.floor(u.pts), worth: worth(state, uid), admin: !!u.admin,
      bonusReady: u.lastBonus !== siteDay(state, now), debt: Math.ceil(u.debt || 0), notices: u.notices || []
    };
  }

  function record(state, m, now) {
    m.hist.push([now, r2(pY(m) * 1000) / 1000]);
    if (m.hist.length > HIST_MAX) m.hist.splice(1, m.hist.length - HIST_MAX);
  }

  // ---- seed -----------------------------------------------------------------
  var DAY = 864e5;
  // A34: city, timezone and settlement source are data on every market, and the
  // site (name, home city) is data in the state, so a new first market is a data change.
  // Offsets are standard time for the beta window (Nov–Mar); a market's close is 23:59 there.
  var DEFAULT_CITIES = {
    dhaka: { name: { en: 'Bangladesh', bn: 'বাংলাদেশ' }, tz: 'Asia/Dhaka', utcOffset: 360 },
    uk: { name: { en: 'UK', bn: 'যুক্তরাজ্য' }, tz: 'Europe/London', utcOffset: 0 },
    uae: { name: { en: 'UAE', bn: 'আমিরাত' }, tz: 'Asia/Dubai', utcOffset: 240 },
    us: { name: { en: 'USA', bn: 'যুক্তরাষ্ট্র' }, tz: 'America/New_York', utcOffset: -300 },
    my: { name: { en: 'Malaysia', bn: 'মালয়েশিয়া' }, tz: 'Asia/Kuala_Lumpur', utcOffset: 480 },
    world: { name: { en: 'Cricket', bn: 'ক্রিকেট' }, tz: 'UTC', utcOffset: 0 }
  };
  var DEFAULT_SITE = { name: { en: 'Dhaka Predicts', bn: 'ঢাকা প্রেডিক্টস' }, city: 'dhaka', tz: 'UTC', utcOffset: 0, signupCountries: [],
    // Site clock (A41 top-up reset, weekly league, retention days): fixed UTC+0, no DST, for the
    // diaspora beta (GTM, 15 Oct), so the day flips at UK midnight. Markets keep their own city clocks.
    // A45: no sign-ups from Bangladesh IPs during the beta. Data, so reversible. Phone codes
    // aren't blocked by default: diaspora players keep their +880 SIMs abroad.
    blockedIpCountries: ['BD'], blockedPhoneCodes: [] };
  function closesAt(dateStr, offsetMin) {
    var t = Date.parse(String(dateStr) + 'T23:59:00Z');
    return isNaN(t) ? NaN : t - offsetMin * 60e3;
  }

  // Daily quick markets (gtm/beta-markets-diaspora.md section A0). Kept as data so the
  // settlement routine or an admin can open the next one with a new date and threshold.
  // {x} = threshold, {date} = settlement day. Trading closes 23:59 UK time the day before.
  var TEMPLATES = {
    q1: { cat: 'money', city: 'dhaka', en: 'Will the taka be weaker than {x} per US dollar on Bangladesh Bank\'s rate for {date}?', bn: '{date}-এর বাংলাদেশ ব্যাংকের হারে কি ডলারপ্রতি টাকা {x}-এর চেয়ে দুর্বল থাকবে?', srcEn: 'Bangladesh Bank daily exchange rate page / BB weighted average interbank rate', srcBn: 'বাংলাদেশ ব্যাংকের দৈনিক বিনিময় হার / আন্তঃব্যাংক গড় হার' },
    q2: { cat: 'weather', city: 'uk', en: "Will London Heathrow's maximum temperature on {date} be above {x} °C?", bn: '{date} কি লন্ডন হিথ্রোর সর্বোচ্চ তাপমাত্রা {x} °C-এর বেশি হবে?', srcEn: 'Met Office daily observations, Heathrow', srcBn: 'মেট অফিসের দৈনিক পর্যবেক্ষণ, হিথ্রো' },
    q3: { cat: 'weather', city: 'uae', en: "Will Dubai International's maximum temperature on {date} be above {x} °C?", bn: '{date} কি দুবাই আন্তর্জাতিক বিমানবন্দরের সর্বোচ্চ তাপমাত্রা {x} °C-এর বেশি হবে?', srcEn: 'UAE National Centre of Meteorology daily report / Dubai airport METAR', srcBn: 'আমিরাতের জাতীয় আবহাওয়া কেন্দ্র / দুবাই বিমানবন্দর METAR' },
    q4: { cat: 'weather', city: 'my', en: 'Will Kuala Lumpur (Subang) get any measurable rain on {date}?', bn: '{date} কি কুয়ালালামপুরে (সুবাং) মাপার মতো বৃষ্টি হবে?', srcEn: 'MetMalaysia daily observations, Subang / Ogimet daily summary', srcBn: 'মেটমালয়েশিয়া দৈনিক পর্যবেক্ষণ, সুবাং' },
    q5: { cat: 'weather', city: 'us', en: 'Will New York (Central Park) reach {x} °F on {date}?', bn: '{date} কি নিউ ইয়র্কের সেন্ট্রাল পার্কে তাপমাত্রা {x} °F ছোঁবে?', srcEn: 'NWS New York daily climate report (CLI), Central Park', srcBn: 'NWS নিউ ইয়র্ক দৈনিক জলবায়ু প্রতিবেদন, সেন্ট্রাল পার্ক' },
    q6: { cat: 'money', city: 'uk', en: "Will the pound be above ${x} on the Bank of England's spot rate for {date}?", bn: '{date}-এর ব্যাংক অব ইংল্যান্ডের হারে কি পাউন্ড ${x}-এর বেশি থাকবে?', srcEn: 'Bank of England daily spot rates (GBP/USD)', srcBn: 'ব্যাংক অব ইংল্যান্ডের দৈনিক হার (পাউন্ড/ডলার)' }
  };
  var WD = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], bn: ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহস্পতি', 'শুক্র', 'শনি'] };
  var MO = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'] };
  function bnDigits(x) { return String(x).replace(/\d/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; }); }
  function says(iso, l) {
    var d = new Date(iso + 'T12:00:00Z'), w = WD[l][d.getUTCDay()], m = MO[l][d.getUTCMonth()];
    return l === 'bn' ? w + 'বার ' + bnDigits(d.getUTCDate()) + ' ' + m : w + ' ' + d.getUTCDate() + ' ' + m;
  }
  function fromTemplate(tid, x, date) {
    var tp = own(TEMPLATES, tid); if (!tp) throw err('bad_template');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw err('bad_date');
    x = String(x == null ? '' : x).trim().slice(0, 12);
    if (tp.en.indexOf('{x}') >= 0 && !/^\d+(\.\d+)?$/.test(x)) throw err('bad_threshold');
    var fill = function (str, l) { return str.replace('{date}', says(date, l)).replace('{x}', l === 'bn' ? bnDigits(x) : x); };
    var close = new Date(Date.parse(date + 'T00:00:00Z') - DAY).toISOString().slice(0, 10); // 23:59 UK the day before
    return { id: tid + '-' + date + (x ? '-' + x.replace('.', '_') : ''), tpl: tid, x: x, settles: date, cat: tp.cat, city: tp.city, q: { en: fill(tp.en, 'en'), bn: fill(tp.bn, 'bn') },
      src: { en: tp.srcEn, bn: tp.srcBn }, closesOn: close, closeCity: 'uk', p0: 0.5 };
  }

  // Beta seed (A46): day 1 opens Q1, Q2 and Q3 so the first results land within 24-72 hours,
  // plus the longer section A arguments. THRESHOLDS ARE PLACEHOLDERS: whoever opens a market
  // sets it from the latest published value so it opens near 50%, and every market passes the
  // A20 checklist before it goes live.
  function betaSeed(now) {
    var tomorrow = localDay(now + DAY + 6 * 3600e3, 0); // at least ~6h of predicting before the close
    return [
      fromTemplate('q1', '122.50', tomorrow), fromTemplate('q2', '13', tomorrow), fromTemplate('q3', '32', tomorrow),
      mk('ban-sa-tests', 'cricket', 'Will Bangladesh avoid defeat in the 2-Test series in South Africa (15–27 Nov 2026)?', 'দক্ষিণ আফ্রিকায় ২ টেস্টের সিরিজে (১৫–২৭ নভেম্বর ২০২৬) কি বাংলাদেশ হারবে না (ড্র বা জয়)?', 'BCB official results / ICC match centre', 'বিসিবির অফিশিয়াল ফলাফল / আইসিসি', '2026-11-14', 0.3, 'world'),
      mk('ban-300', 'cricket', 'Will Bangladesh score 300+ in any innings of the two Tests in South Africa (15–27 Nov 2026)?', 'দক্ষিণ আফ্রিকায় দুই টেস্টের কোনো ইনিংসে কি বাংলাদেশ ৩০০+ রান করবে?', 'ESPNcricinfo scorecard / BCB', 'ESPNcricinfo স্কোরকার্ড / বিসিবি', '2026-11-14', 0.4, 'world'),
      mk('lhr-cold', 'weather', 'Will London Heathrow record a minimum below −2 °C on any day before 31 Dec 2026?', '৩১ ডিসেম্বর ২০২৬-এর আগে কোনো দিন কি লন্ডন হিথ্রোতে সর্বনিম্ন তাপমাত্রা −২ °C-এর নিচে নামবে?', 'Met Office daily observations, Heathrow', 'মেট অফিসের দৈনিক পর্যবেক্ষণ, হিথ্রো', '2026-12-30', 0.45, 'uk'),
      mk('nyc-snow', 'weather', 'Will New York (Central Park) get measurable snow (0.1 in or more) before 31 Dec 2026?', '৩১ ডিসেম্বর ২০২৬-এর আগে কি নিউ ইয়র্কের সেন্ট্রাল পার্কে মাপার মতো তুষার (০.১ ইঞ্চি বা বেশি) পড়বে?', 'NOAA NWS New York climate report', 'NOAA NWS নিউ ইয়র্ক জলবায়ু প্রতিবেদন', '2026-12-30', 0.5, 'us'),
      mk('bdt-usd-mar', 'money', 'Will the taka be weaker than 125 per US dollar on 31 March 2027?', '৩১ মার্চ ২০২৭-এ কি ডলারপ্রতি টাকা ১২৫-এর চেয়ে দুর্বল থাকবে?', 'Bangladesh Bank / weighted average interbank rate', 'বাংলাদেশ ব্যাংক / আন্তঃব্যাংক গড় হার', '2027-03-30', 0.4, 'dhaka')
    ];
  }
  // The first Dhaka day-1 set (gtm/launch-calendar.md). Out of the beta by A46; kept as the
  // fixed fixture the test suites run against: Core.seed(now, { set: 'dhaka' }).
  var DHAKA_SET = [
    mk('aqi-250-wk', 'air', "Will Dhaka's AQI go above 250 on any day this week (Sun 18 to Sat 24 Oct)?", 'এই সপ্তাহে (রবি ১৮ থেকে শনি ২৪ অক্টোবর) কোনো দিন কি ঢাকার AQI ২৫০ ছাড়াবে?', 'DoE CASE daily AQI, Dhaka', 'পরিবেশ অধিদপ্তরের CASE দৈনিক AQI, ঢাকা', '2026-10-24', 0.34),
    mk('onion-100-thu', 'prices', 'Will local onion be above ৳100/kg (upper bound) on TCB\'s list next Thursday, 22 Oct?', 'আগামী বৃহস্পতিবার ২২ অক্টোবর টিসিবির তালিকায় দেশি পেঁয়াজের সর্বোচ্চ দাম কি কেজিপ্রতি ৳১০০ ছাড়াবে?', 'TCB daily Dhaka price list', 'টিসিবির দৈনিক ঢাকা বাজারদর', '2026-10-22', 0.47),
    mk('usd-wk2', 'economy', 'Will the USD/BDT interbank rate be above 122.50 on Thursday 29 Oct 2026?', 'বৃহস্পতিবার ২৯ অক্টোবর ২০২৬-এ কি ডলারের আন্তঃব্যাংক রেট ১২২.৫০ টাকা ছাড়াবে?', 'Bangladesh Bank interbank rate', 'বাংলাদেশ ব্যাংকের আন্তঃব্যাংক রেট', '2026-10-29', 0.42),
    mk('dengue-wk2', 'health', 'Will DGHS report more than 4,000 dengue admissions nationwide from 25 to 31 Oct?', '২৫ থেকে ৩১ অক্টোবর সারা দেশে ডেঙ্গুতে হাসপাতালে ভর্তি কি ৪,০০০ ছাড়াবে (স্বাস্থ্য অধিদপ্তর)?', 'DGHS daily dengue press release', 'স্বাস্থ্য অধিদপ্তরের দৈনিক ডেঙ্গু বিজ্ঞপ্তি', '2026-10-31', 0.55),
    mk('cold-15', 'weather', "Will Dhaka's minimum temperature drop below 15 °C on any day before 15 Dec 2026?", '১৫ ডিসেম্বর ২০২৬-এর আগে কোনো দিন কি ঢাকার সর্বনিম্ন তাপমাত্রা ১৫ °C-এর নিচে নামবে?', 'BMD Dhaka (Agargaon) station', 'আবহাওয়া অধিদপ্তর, ঢাকা (আগারগাঁও) স্টেশন', '2026-12-14', 0.52),
    mk('onion-120', 'prices', 'Will local onion cost more than ৳120/kg in Dhaka before 31 Dec 2026?', '৩১ ডিসেম্বর ২০২৬-এর আগে ঢাকায় দেশি পেঁয়াজ কি কেজিপ্রতি ৳১২০ ছাড়াবে?', 'TCB daily Dhaka price list', 'টিসিবির দৈনিক ঢাকা বাজারদর', '2026-12-31', 0.41),
    mk('aqi-jan', 'air', "Will Dhaka's AQI pass 300 on any day in January 2027?", 'জানুয়ারি ২০২৭-এ কোনো দিন কি ঢাকার AQI ৩০০ ছাড়াবে?', 'DoE CASE daily AQI, Dhaka', 'পরিবেশ অধিদপ্তরের CASE দৈনিক AQI', '2027-01-31', 0.64),
    mk('boimela', 'culture', 'Will Amar Ekushey Boi Mela 2027 open to the public on 1 February?', 'অমর একুশে বইমেলা ২০২৭ কি ১ ফেব্রুয়ারি সবার জন্য খুলবে?', 'Bangla Academy announcement', 'বাংলা একাডেমির ঘোষণা', '2027-02-01', 0.78),
    mk('usd-125', 'economy', 'Will the USD/BDT rate be above 125 on 31 March 2027?', '৩১ মার্চ ২০২৭-এ কি ডলারের দাম ১২৫ টাকার বেশি থাকবে?', 'Bangladesh Bank reference rate', 'বাংলাদেশ ব্যাংকের রেফারেন্স রেট', '2027-03-31', 0.35),
    mk('mrt1', 'transport', 'Will MRT Line-1 open any section to passengers by 30 June 2027?', '৩০ জুন ২০২৭-এর মধ্যে কি এমআরটি লাইন-১ এর কোনো অংশে যাত্রী চলাচল শুরু হবে?', 'DMTCL announcements', 'ডিএমটিসিএলের ঘোষণা', '2027-06-30', 0.22)
  ];
  function mk(id, cat, en, bn, srcEn, srcBn, closes, p, city) {
    return { id: id, cat: cat, city: city || 'dhaka', q: { en: en, bn: bn }, src: { en: srcEn, bn: srcBn }, closesOn: closes, p0: p };
  }
  // The earlier Dhaka day-1 set (gtm/launch-calendar.md) is kept out of the beta by A46.
  // Sample players exist only in the browser demo (focus group: they topped the leaderboard).
  var BOTS = [['b1', 'রাফি'], ['b2', 'নুসরাত'], ['b3', 'Tanvir'], ['b4', 'মিথিলা'], ['b5', 'Arif'], ['b6', 'সাদিয়া']];

  function newMarket(s, d, now, by) {
    var b = LIQUIDITY, c = s.cities[d.city], cc = s.cities[d.closeCity || d.city];
    var m = { id: d.id, cat: d.cat, city: d.city, tz: c.tz, utcOffset: c.utcOffset, q: d.q, src: d.src, closes: closesAt(d.closesOn, cc.utcOffset), b: b,
      qy: b * Math.log(d.p0 / (1 - d.p0)), qn: 0, vol: 0, traders: 0, status: 'open', outcome: null, hist: [[now, r2(d.p0 * 1000) / 1000]] };
    if (d.tpl) { m.tpl = d.tpl; m.x = d.x; m.settles = d.settles; }
    if (by) m.createdBy = by;
    return m;
  }
  function seed(now, opts) {
    var s = { v: 4, users: {}, pos: {}, markets: [], trades: 0, site: clone(DEFAULT_SITE), cities: clone(DEFAULT_CITIES) };
    var demo = opts && opts.demo;
    (opts && opts.set === 'dhaka' ? DHAKA_SET : betaSeed(now)).forEach(function (d) {
      var m = newMarket(s, d, now);
      if (false) {}
      if (demo) {
        // Demo only: a short made-up price walk and activity so charts aren't empty.
        var p = d.p0, rnd = mulberry(hash(d.id)); m.hist = [];
        for (var i = 0; i < 12; i++) {
          p = Math.min(0.95, Math.max(0.05, p + (rnd() - 0.5) * 0.06));
          m.hist.push([now - (12 - i) * DAY, r2(p * 1000) / 1000]);
        }
        m.hist.push([now, r2(d.p0 * 1000) / 1000]);
        m.vol = 2000 + Math.floor(rnd() * 9000);
        m.traders = 20 + Math.floor(rnd() * 160);
      }
      s.markets.push(m);
    });
    if (demo || (opts && opts.bots)) BOTS.forEach(function (b, i) {
      s.users[b[0]] = { id: b[0], name: b[1], pts: START_POINTS + 300 - i * 90, bot: true, lastBonus: siteDay(s, now) };
    });
    return s;
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  // Brings older saved states up to date. Idempotent and cheap, run before every action.
  function migrate(s) {
    if (s.v >= 4) return s;
    if (s.v === 3) return migrate4(s);
    if (s.v === 2) return migrate3(s);
    s.site = s.site || clone(DEFAULT_SITE);
    s.cities = s.cities || clone(DEFAULT_CITIES);
    s.markets.forEach(function (m) {
      var c = own(s.cities, m.city) || s.cities[s.site.city];
      m.city = m.city || s.site.city; m.tz = m.tz || c.tz; if (m.utcOffset == null) m.utcOffset = c.utcOffset;
    });
    s.v = 2;
    return migrate3(s);
  }
  // v3 (A43): phone keys move to E.164; sign-up countries become app-wide data (empty = all).
  function migrate3(s) {
    var A = s.auth || {}, T = s.attempts || {};
    Object.keys(A).forEach(function (k) { if (/^01\d{9}$/.test(k)) { A['+880' + k.slice(1)] = A[k]; delete A[k]; } });
    Object.keys(T).forEach(function (k) { if (/^01\d{9}$/.test(k)) delete T[k]; });
    s.site.signupCountries = s.site.signupCountries || [];
    if (!s.site.blockedIpCountries) s.site.blockedIpCountries = ['BD'];
    if (!s.site.blockedPhoneCodes) s.site.blockedPhoneCodes = [];
    s.v = 3;
    return migrate4(s);
  }
  // v4: the site clock moves from Dhaka time to fixed UTC+0 (GTM decision for the diaspora beta).
  // Only a state still on the old Dhaka default is changed; an admin's own choice is kept.
  function migrate4(s) {
    if (s.site && s.site.utcOffset === 360 && s.site.tz === 'Asia/Dhaka') { s.site.utcOffset = 0; s.site.tz = 'UTC'; }
    s.v = 4;
    return s;
  }

  function addUser(state, id, name, now, extra) {
    var u = { id: id, name: String(name || '').trim().slice(0, 24) || 'Player', pts: START_POINTS, lastBonus: siteDay(state, now), created: now };
    for (var k in extra) u[k] = extra[k];
    state.users[id] = u;
    return u;
  }

  // ---- actions ----------------------------------------------------------------
  var READS = {
    home: function (s, uid, a, now) {
      return { me: uid ? publicUser(s, uid, now) : null, markets: s.markets.map(function (m) { return summary(m, now); }) };
    },
    market: function (s, uid, a, now) {
      var m = findMarket(s, a.id), out = summary(m, now);
      out.src = m.src; out.hist = m.hist; out.b = m.b; out.qy = m.qy; out.qn = m.qn;
      out.mine = uid && s.pos[uid] && s.pos[uid][m.id] ? s.pos[uid][m.id] : { y: 0, n: 0, spent: 0 };
      out.me = uid ? publicUser(s, uid, now) : null;
      if (m.status === 'proposed') {
        var hp = uid && s.pos[uid] && s.pos[uid][m.id];
        out.proposal = { out: m.proposal.out, until: m.proposal.until, note: m.proposal.note, link: m.proposal.link };
        out.disputes = (m.disputes || []).length;
        out.myDispute = !!(uid && (m.disputes || []).some(function (d) { return d.uid === uid; }));
        out.canDispute = !!(hp && (hp.y || hp.n) && now <= m.proposal.until && !out.myDispute);
        out.disputeUntil = m.proposal.until;
      }
      if (m.status === 'resolved') {
        out.note = m.note; out.link = m.link; out.resolvedAt = m.resolvedAt; out.review = m.review || null;
        out.holders = m.book ? Object.keys(m.book).length : 0;
        out.totalPaid = Math.round(Object.keys(m.paid || {}).reduce(function (t, k) { return t + m.paid[k]; }, 0));
        out.myPaid = uid && m.paid && m.paid[uid] != null ? Math.round(m.paid[uid]) : null;
        out.myBook = uid && m.book ? m.book[uid] || null : null;
        out.canDispute = !!(uid && out.myBook && now - m.resolvedAt < DISPUTE_MS && !(m.disputes || []).some(function (d) { return d.uid === uid; }));
        out.disputeUntil = m.resolvedAt + DISPUTE_MS;
        out.tpl = m.tpl || null;
        out.disputes = (m.disputes || []).length; out.pending = m.pending ? { to: m.pending.to } : null;
        out.myDispute = uid && (m.disputes || []).some(function (d) { return d.uid === uid; });
      }
      return out;
    },
    me: function (s, uid, a, now) {
      if (!uid) throw err('login');
      var P = s.pos[uid] || {}, rows = [];
      s.markets.forEach(function (m) {
        var p = P[m.id]; if (!p || (p.y < 0.005 && p.n < 0.005 && p.paid == null)) return;
        var py = pY(m), val = m.status === 'open' ? holdValue(m, p) : (p.paid || 0);
        rows.push({ id: m.id, q: m.q, y: r2(p.y), n: r2(p.n), spent: Math.round(p.spent), value: Math.round(val), status: summary(m, now).status, outcome: m.outcome, p: r2(py) });
      });
      return { me: publicUser(s, uid, now), rows: rows };
    },
    leaders: function (s, uid, a, now) {
      var list = Object.keys(s.users).filter(function (id) { return !s.users[id].deleted; }).map(function (id) { return { id: id, name: s.users[id].name, worth: worth(s, id), bot: !!s.users[id].bot }; });
      list.sort(function (x, y) { return y.worth - x.worth; });
      var rank = 0; list.forEach(function (r, i) { r.rank = i + 1; if (r.id === uid) rank = i + 1; });
      return { top: list.slice(0, 20), myRank: rank, total: list.length };
    }
  };

  // A31: everything we hold about the player, plus their full prediction history.
  READS.account = function (s, uid, a, now) {
    if (!uid) throw err('login');
    var u = s.users[uid], names = {};
    s.markets.forEach(function (m) { names[m.id] = m.q; });
    return { me: publicUser(s, uid, now), profile: { name: u.name, created: u.created, adultAt: u.adultAt, consentAt: u.consentAt, consentVer: u.consentVer },
      history: ((s.log || {})[uid] || []).slice().reverse().map(function (t) { return { at: t.at, id: t.id, q: names[t.id], kind: t.kind, side: t.side, pts: t.pts, sh: t.sh, note: t.note }; }) };
  };
  // A8: activation and beta exit-gate numbers, computed from the event log.
  READS.metrics = function (s, uid, a, now) {
    if (!uid || !s.users[uid].admin) throw err('forbidden');
    var ev = s.events || [], per = {}, WEEK = 7 * DAY;
    Object.keys(s.users).forEach(function (id) { var u = s.users[id]; if (!u.bot && !u.deleted && !u.admin) per[id] = { created: u.created || 0, preds: [], cats: {}, seen: 0, first: null }; });
    ev.forEach(function (e) {
      var p = per[e[2]]; if (!p) return;
      if (e[1] === 'prediction') { p.preds.push(e[0]); if (e[0] - p.created < WEEK) p.cats[e[3].cat] = 1; if (p.first == null) p.first = e[0]; }
      if (e[1] === 'resolution_seen' && e[0] - p.created < WEEK) p.seen++;
    });
    var ids = Object.keys(per), activated = 0, first24 = 0, active = 0, activePreds = 0, counts = {};
    ids.forEach(function (id) {
      var p = per[id], early = p.preds.filter(function (t) { return t - p.created < WEEK; }).length;
      if (early >= 3 && Object.keys(p.cats).length >= 2 && p.seen >= 1) activated++;
      if (p.first != null && p.first - p.created < DAY) first24++;
      var wk = p.preds.filter(function (t) { return now - t < WEEK; }).length;
      if (wk) { active++; activePreds += wk; }
    });
    ev.forEach(function (e) { counts[e[1]] = (counts[e[1]] || 0) + 1; });
    var flags = Object.keys(s.devices || {}).filter(function (d) { return s.devices[d].length >= 3; }).map(function (d) {
      return s.devices[d].map(function (id) { return s.users[id] ? s.users[id].name : id; });
    });
    var co = cohort(s, now);
    return { players: ids.length, activated: activated, first24: first24, weeklyActive: active, predsPerActive: active ? r2(activePreds / active) : 0, events: counts, deviceFlags: flags,
      cohort: co, returns: returnRates(co) };
  };
  // First-20 retention (gtm/first-20-users.md section 4): one row per player, matching the tracker
  // columns. Days are calendar days on the site clock (A41); sign-up day is day 0. A "return" is any
  // day the player opened the app (return_visit), predicted or saw a result. Day-N columns are null
  // until day N has fully passed. Built only from our own event log: no third-party tracker (A31).
  function dayIdx(s, created, t) { return Math.round((Date.parse(siteDay(s, t)) - Date.parse(siteDay(s, created))) / DAY); }
  function cohort(s, now) {
    var per = {}, today, WEEK = 7 * DAY;
    Object.keys(s.users).forEach(function (id) {
      var u = s.users[id]; if (u.bot || u.deleted || u.admin) return;
      per[id] = { u: u, days: {}, preds7: 0, cats7: {}, seen7: false, first: null, w2: 0 };
    });
    (s.events || []).forEach(function (e) {
      var p = per[e[2]]; if (!p) return;
      var created = p.u.created || 0, d = dayIdx(s, created, e[0]), early = e[0] - created < WEEK;
      if (e[1] === 'return_visit' || e[1] === 'prediction' || e[1] === 'resolution_seen') p.days[d] = 1;
      if (e[1] === 'prediction') {
        if (p.first == null) p.first = e[0];
        if (early) { p.preds7++; p.cats7[(e[3] && e[3].cat) || '?'] = 1; }
        if (d >= 7 && d <= 13) p.w2++;
      }
      if (e[1] === 'resolution_seen' && early) p.seen7 = true;
    });
    return Object.keys(per).map(function (id) {
      var p = per[id], created = p.u.created || 0, age = dayIdx(s, created, now);
      var ret = function (n) { return age > n ? !!p.days[n] : null; };
      return { id: id.slice(0, 7), name: p.u.name, signed_up: siteDay(s, created), first_prediction: p.first != null ? siteDay(s, p.first) : null,
        predictions_d7: p.preds7, categories_d7: Object.keys(p.cats7).length, saw_resolution_d7: p.seen7,
        returned_d1: ret(1), returned_d3: ret(3), returned_d7: ret(7), returned_d14: ret(14),
        activated: p.preds7 >= 3 && Object.keys(p.cats7).length >= 2 && p.seen7, active_week2: age > 13 ? p.w2 > 0 : null };
    }).sort(function (x, y) { return x.signed_up < y.signed_up ? -1 : 1; });
  }
  // Share of players old enough for each day who came back that day.
  function returnRates(rows) {
    var out = {};
    ['returned_d1', 'returned_d3', 'returned_d7', 'returned_d14', 'active_week2'].forEach(function (k) {
      var el = rows.filter(function (r) { return r[k] != null; });
      out[k] = { yes: el.filter(function (r) { return r[k]; }).length, of: el.length };
    });
    return out;
  }
  // CS request 6: admin looks a player up and sees balance, shortfall and full history.
  // `a.uid` comes from the handler when the admin searched by phone.
  READS.users = function (s, uid, a, now) {
    if (!uid || !s.users[uid].admin) throw err('forbidden');
    var q = String(a.q || '').trim().toLowerCase();
    var ids = a.uid ? [a.uid] : Object.keys(s.users).filter(function (id) {
      var u = s.users[id]; return !u.deleted && (!q || id === q || u.name.toLowerCase().indexOf(q) >= 0);
    }).slice(0, 30);
    var names = {}; s.markets.forEach(function (m) { names[m.id] = m.q; });
    return { users: ids.filter(function (id) { return s.users[id]; }).map(function (id) {
      var u = s.users[id];
      return { id: id, name: u.name, pts: r2(u.pts), debt: r2(u.debt || 0), worth: worth(s, id), bot: !!u.bot, admin: !!u.admin, created: u.created,
        history: ids.length === 1 ? ((s.log || {})[id] || []).slice(-100).reverse().map(function (t) { return { at: t.at, q: names[t.id], kind: t.kind, side: t.side, pts: t.pts, sh: t.sh }; }) : undefined };
    }) };
  };
  READS.inbox = function (s, uid, a, now) {
    if (!uid || !s.users[uid].admin) throw err('forbidden');
    var disputes = [];
    s.markets.forEach(function (m) {
      (m.disputes || []).forEach(function (d) { disputes.push({ id: m.id, q: m.q, outcome: m.outcome, name: d.name, reason: d.reason, link: d.link, at: d.at, closed: !!d.closed,
        pending: m.pending ? { to: m.pending.to, by: s.users[m.pending.by] ? s.users[m.pending.by].name : '—', mine: m.pending.by === uid } : null }); });
    });
    var proposed = s.markets.filter(function (m) { return m.status === 'proposed'; }).map(function (m) {
      return { id: m.id, q: m.q, out: m.proposal.out, until: m.proposal.until, disputes: (m.disputes || []).length, mine: m.proposal.by === uid, soon: m.proposal.until - now <= 6 * 36e5 };
    });
    return { me: publicUser(s, uid, now), proposed: proposed, feedback: (s.feedback || []).slice(-100).reverse(), disputes: disputes.reverse(), audit: (s.audit || []).slice(-50).reverse() };
  };

  // The whole audit log (at most 5000 entries) for the admin CSV export.
  READS.auditall = function (s, uid) {
    if (!uid || !s.users[uid].admin) throw err('forbidden');
    return { audit: (s.audit || []).slice().reverse(), truncated: (s.auditDropped || 0) > 0, dropped: s.auditDropped || 0, cap: AUDIT_CAP };
  };

  var WRITES = {
    buy: function (s, uid, a, now) {
      var m = findMarket(s, a.id), u = s.users[uid];
      if (!isOpen(m, now)) throw err('closed');
      if (m.createdBy === uid) throw err('own_market'); // A27
      var side = a.side === 'n' ? 'n' : 'y', amt = Math.floor(Number(a.amount));
      if (!(amt >= 1)) throw err('bad_amount');
      if (amt > u.pts) throw err('no_points');
      var sh = sharesFor(m, side, amt);
      if (!(sh > 0) || !isFinite(sh)) throw err('bad_amount');
      // Keep prices inside 1-99% so one big trade can't pin a market.
      var after = side === 'y' ? priceYes(m.b, m.qy + sh, m.qn) : priceYes(m.b, m.qy, m.qn + sh);
      if (after > 0.99 || after < 0.01) throw err('too_big');
      if (side === 'y') m.qy += sh; else m.qn += sh;
      u.pts -= amt; m.vol += amt;
      var p = pos(s, uid, m.id);
      if (!p.counted) { m.traders++; p.counted = 1; } // count each player once, even after selling out and re-buying
      p[side] += sh; p.spent += amt; p['s' + side] += amt; p.net = (p.net || 0) + amt;
      record(s, m, now); s.trades++;
      logTrade(s, uid, { at: now, id: m.id, kind: 'buy', side: side, pts: amt, sh: r2(sh) });
      track(s, 'prediction', uid, { mid: m.id, cat: m.cat }, now);
      return { shares: r2(sh), p: pY(m), pts: Math.floor(u.pts) };
    },
    sell: function (s, uid, a, now) {
      var m = findMarket(s, a.id), u = s.users[uid];
      if (!isOpen(m, now)) throw err('closed');
      if (m.createdBy === uid) throw err('own_market');
      var side = a.side === 'n' ? 'n' : 'y', p = pos(s, uid, m.id);
      var sh = a.shares === 'all' ? p[side] : Number(a.shares);
      if (!(sh > 0)) throw err('bad_amount');
      if (sh > p[side] + 1e-9) throw err('no_shares');
      sh = Math.min(sh, p[side]);
      var got = proceedsFor(m, side, sh);
      if (side === 'y') m.qy -= sh; else m.qn -= sh;
      // Only this side's cost basis goes down; the other side's stays at risk (and is refunded on N/A).
      var frac = sh / p[side], basis = p['s' + side] * frac;
      p['s' + side] -= basis; p.spent -= basis; p[side] -= sh; p.net = (p.net || 0) - got;
      if (p[side] < 1e-6) p[side] = 0;
      u.pts += got; m.vol += got;
      record(s, m, now); s.trades++;
      logTrade(s, uid, { at: now, id: m.id, kind: 'sell', side: side, pts: Math.floor(got), sh: r2(sh) });
      return { points: Math.floor(got), p: pY(m), pts: Math.floor(u.pts) };
    },
    bonus: function (s, uid, a, now) {
      var u = s.users[uid], d = siteDay(s, now);
      if (u.lastBonus === d) throw err('bonus_taken');
      u.lastBonus = d;
      var toDebt = Math.min(u.debt || 0, DAILY_BONUS / 2); // always leaves 50 playable
      u.debt = (u.debt || 0) - toDebt; u.pts += DAILY_BONUS - toDebt;
      return { pts: Math.floor(u.pts), added: DAILY_BONUS - toDebt, repaid: toDebt };
    },
    ack: function (s, uid) {
      s.users[uid].notices = []; return { ok: true };
    },
    resolve: function (s, uid, a, now) {
      if (!s.users[uid].admin) throw err('forbidden');
      var m = findMarket(s, a.id), out;
      if (m.status === 'proposed') {
        // Settle the proposed outcome once its dispute window is over (or early, on purpose).
        if (now < m.proposal.until && !a.early) throw err('window_open');
        out = m.proposal.out;
        if (a.note == null) a.note = m.proposal.note;
        if (a.link == null) a.link = m.proposal.link;
      } else {
        if (m.status !== 'open') throw err('closed');
        out = own(OUTCOMES, a.outcome);
      }
      if (!out) throw err('bad_outcome');
      // Snapshot every holder before paying, so a dispute can re-settle exactly.
      m.book = {};
      Object.keys(s.pos).forEach(function (id) {
        var p = s.pos[id][m.id]; if (!p || (!p.y && !p.n)) return;
        m.book[id] = { y: p.y, n: p.n, spent: p.spent, net: p.net != null ? p.net : p.spent };
        p.y = 0; p.n = 0;
      });
      m.status = 'resolved'; m.resolvedAt = now; m.resolvedBy = uid;
      m.note = String(a.note || '').slice(0, 200); m.link = safeLink(a.link);
      settle(s, m, out, uid, now);
      return { ok: true };
    },
    // Step 1 of settling: stop trading and publish the intended outcome. No points move yet.
    propose: function (s, uid, a, now) {
      if (!s.users[uid].admin) throw err('forbidden');
      var m = findMarket(s, a.id), out = own(OUTCOMES, a.outcome);
      if (m.status !== 'open') throw err('closed');
      if (!out) throw err('bad_outcome');
      var hours = Number(a.hours == null ? 24 : a.hours);
      if (!(hours >= 0 && hours <= 72)) throw err('bad_window');
      m.status = 'proposed'; m.closes = Math.min(m.closes, now);
      m.proposal = { out: out, note: String(a.note || '').slice(0, 200), link: safeLink(a.link), at: now, by: uid, until: now + hours * 3600e3 };
      m.disputes = [];
      return { ok: true, until: m.proposal.until };
    },
    // Withdraw a proposal (e.g. a dispute was right). Trading stays closed.
    retract: function (s, uid, a, now) {
      if (!s.users[uid].admin) throw err('forbidden');
      var m = findMarket(s, a.id);
      if (m.status !== 'proposed') throw err('no_proposal');
      m.status = 'open'; m.proposal = null; m.disputes = [];
      return { ok: true };
    },
    // Anyone who held shares can dispute within 48 hours of settlement.
    dispute: function (s, uid, a, now) {
      var m = findMarket(s, a.id);
      if (m.status === 'proposed') {
        if (now > m.proposal.until) throw err('dispute_over');
        var hp = s.pos[uid] && s.pos[uid][m.id];
        if (!hp || (!hp.y && !hp.n)) throw err('not_holder');
      } else {
        if (m.status !== 'resolved') throw err('not_resolved');
        if (now - m.resolvedAt > DISPUTE_MS) throw err('dispute_over');
        if (!m.book || !m.book[uid]) throw err('not_holder');
      }
      m.disputes = m.disputes || [];
      if (m.disputes.some(function (d) { return d.uid === uid; })) throw err('already_disputed');
      var reason = String(a.reason || '').trim().slice(0, 500);
      if (reason.length < 5) throw err('need_reason');
      m.disputes.push({ uid: uid, name: s.users[uid].name, reason: reason, link: safeLink(a.link), at: now });
      return { ok: true };
    },
    // Admin decision on a disputed market: keep, or switch to y / n / na.
    // Admin decision on a disputed market: keep the result, or propose y / n / na.
    // Two-admin rule: a correction only takes effect when a different admin confirms it.
    review: function (s, uid, a, now) {
      if (!s.users[uid].admin) throw err('forbidden');
      var m = findMarket(s, a.id);
      if (m.status !== 'resolved' || !m.disputes || !m.disputes.length) throw err('no_dispute');
      var to = a.decision === 'keep' ? m.outcome : own(OUTCOMES, a.decision);
      if (!to) throw err('bad_outcome');
      var note = String(a.note || '').slice(0, 200);
      if (to === m.outcome) {
        m.pending = null;
        m.review = { by: [uid], at: now, from: m.outcome, to: to, changed: false, note: note };
        m.disputes.forEach(function (d) { if (!d.closed) d.closed = now; });
        return { ok: true, outcome: m.outcome };
      }
      m.pending = { by: uid, to: to, at: now, note: note };
      return { ok: true, pending: true };
    },
    confirm: function (s, uid, a, now) {
      if (!s.users[uid].admin) throw err('forbidden');
      var m = findMarket(s, a.id), pd = m.pending;
      if (!pd) throw err('no_pending');
      if (pd.by === uid) throw err('same_admin');
      m.pending = null;
      if (a.accept === false) return { ok: true, rejected: true };
      var from = m.outcome;
      settle(s, m, pd.to, uid, now);
      m.review = { by: [pd.by, uid], at: now, from: from, to: pd.to, changed: true, note: pd.note };
      m.disputes.forEach(function (d) { if (!d.closed) d.closed = now; });
      return { ok: true, outcome: m.outcome };
    },
    create: function (s, uid, a, now) {
      if (!s.users[uid].admin) throw err('forbidden');
      var en = String(a.en || '').trim().slice(0, 200), bn = String(a.bn || '').trim().slice(0, 200);
      var city = own(s.cities, a.city) ? a.city : s.site.city, c = s.cities[city];
      var closes = closesAt(a.closes, c.utcOffset), p0 = Number(a.p) / 100;
      if (en.length < 10 || bn.length < 5) throw err('need_reason');
      if (!(closes > now)) throw err('bad_date');
      if (!(p0 >= 0.05 && p0 <= 0.95)) p0 = 0.5;
      var srcEn = String(a.srcEn || '').trim().slice(0, 120);
      if (srcEn.length < 3) throw err('need_source');
      var id = 'm' + now.toString(36), b = LIQUIDITY;
      s.markets.push({ id: id, cat: CATS.indexOf(a.cat) >= 0 ? a.cat : 'money', city: city, tz: c.tz, utcOffset: c.utcOffset, q: { en: en, bn: bn },
        src: { en: srcEn, bn: String(a.srcBn || '').trim().slice(0, 120) || srcEn }, closes: closes, b: b,
        qy: b * Math.log(p0 / (1 - p0)), qn: 0, vol: 0, traders: 0, status: 'open', outcome: null, hist: [[now, p0]], createdBy: uid });
      return { id: id };
    },
    // Sign-up rules (A43/A45): allowed calling codes (empty = all), blocked IP countries and phone codes.
    signup: function (s, uid, a) {
      if (!s.users[uid].admin) throw err('forbidden');
      var codes = function (x, re) { return (Array.isArray(x) ? x : []).map(function (c) { return String(c).toUpperCase().replace('+', ''); }).filter(function (c) { return re.test(c); }); };
      if (a.allow) s.site.signupCountries = codes(a.allow, /^\d{1,3}$/);
      if (a.blockedIp) s.site.blockedIpCountries = codes(a.blockedIp, /^[A-Z]{2}$/);
      if (a.blockedPhone) s.site.blockedPhoneCodes = codes(a.blockedPhone, /^\d{1,3}$/);
      return { ok: true, site: s.site };
    },
    // Sponsor line shown under the question list. Empty text clears it. https links only.
    sponsor: function (s, uid, a) {
      if (!s.users[uid].admin) throw err('forbidden');
      var en = String(a.en || '').trim().slice(0, 80), bn = String(a.bn || '').trim().slice(0, 80) || en, url = String(a.url || '').trim().slice(0, 200);
      if (!en) { delete s.site.sponsor; return { ok: true, site: s.site }; }
      if (url && !/^https:\/\/[^\s]+$/.test(url)) throw err('bad_link');
      s.site.sponsor = { en: en, bn: bn, url: url };
      return { ok: true, site: s.site };
    },
    // Open a daily market from a template, or repeat an existing template market for a new
    // date (backlog 11). Threshold x is required where the template has one.
    open: function (s, uid, a, now) {
      if (!s.users[uid].admin) throw err('forbidden');
      var tid = a.tpl, x = a.x;
      if (a.repeat) { var src = findMarket(s, a.repeat); if (!src.tpl) throw err('bad_template'); tid = src.tpl; if (x == null || x === '') x = src.x; }
      var d = fromTemplate(tid, x, a.date);
      if (!(closesAt(d.closesOn, s.cities.uk.utcOffset) > now)) throw err('bad_date');
      if (s.markets.some(function (m) { return m.id === d.id; })) throw err('exists');
      s.markets.push(newMarket(s, d, now, uid));
      return { id: d.id };
    },
    rename: function (s, uid, a) {
      var n = String(a.name || '').trim().slice(0, 24);
      if (n.length < 2) throw err('bad_name');
      s.users[uid].name = n; return { ok: true };
    },
    // Client-reported analytics (A8). Others (signup, prediction, feedback) are logged where they happen.
    track: function (s, uid, a, now) {
      if (a.e === 'resolution_seen') {
        var m = findMarket(s, a.id);
        if (m.status !== 'resolved' || !m.book || !m.book[uid]) return { ok: false };
        var seen = s.seen || (s.seen = {}), k = uid + ':' + m.id;
        if (!seen[k]) { seen[k] = 1; track(s, 'resolution_seen', uid, { mid: m.id }, now); }
      } else if (a.e === 'return_visit') {
        var u = s.users[uid], d = siteDay(s, now);
        if ((u.lastVisit || siteDay(s, u.created || now)) !== d) track(s, 'return_visit', uid, null, now); // one per day after sign-up day
        u.lastVisit = d;
      }
      return { ok: true };
    },
    // Add or update a city, and optionally make it the site's home city (and rename the site).
    city: function (s, uid, a) {
      if (!s.users[uid].admin) throw err('forbidden');
      var id = String(a.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24), off = Number(a.utcOffset);
      if (!id || !(off >= -720 && off <= 840) || !a.en) throw err('bad_city');
      s.cities[id] = { name: { en: String(a.en).slice(0, 40), bn: String(a.bn || a.en).slice(0, 40) }, tz: String(a.tz || '').slice(0, 40), utcOffset: off };
      if (a.home) {
        s.site.city = id; s.site.tz = s.cities[id].tz; s.site.utcOffset = off;
        if (a.siteEn) s.site.name = { en: String(a.siteEn).slice(0, 40), bn: String(a.siteBn || a.siteEn).slice(0, 40) };
      }
      return { ok: true };
    },
    feedback: function (s, uid, a, now) {
      var text = String(a.text || '').trim().slice(0, 1000);
      if (text.length < 2) throw err('need_reason');
      s.feedback = s.feedback || [];
      s.feedback.push({ id: (s.feedback.length ? s.feedback[s.feedback.length - 1].id : 0) + 1, uid: uid, name: uid ? s.users[uid].name : 'guest', text: text, page: String(a.page || '').slice(0, 60),
        ver: String(a.ver || '').slice(0, 20), ua: String(a.ua || '').slice(0, 200), at: now, status: 'new' });
      if (s.feedback.length > 2000) s.feedback.shift();
      if (uid) track(s, 'feedback_sent', uid, null, now);
      return { ok: true };
    },
    // Fix a balance by hand. Reason is required and the change is audited (ADMIN_ACTIONS).
    adjust: function (s, uid, a, now) {
      if (!s.users[uid].admin) throw err('forbidden');
      var u = s.users[a.user], amt = Math.round(Number(a.amount) * 100) / 100, why = String(a.reason || '').trim().slice(0, 200);
      if (!u || u.deleted) throw err('no_user');
      if (!amt || !isFinite(amt) || Math.abs(amt) > 100000) throw err('bad_amount');
      if (why.length < 5) throw err('need_reason');
      if (u.pts + amt < 0) throw err('bad_amount');
      u.pts += amt;
      logTrade(s, a.user, { at: now, id: null, kind: 'adjust', pts: amt, note: why });
      u.notices = u.notices || [];
      u.notices.push({ kind: 'adjust', amount: amt, reason: why, at: now });
      return { pts: r2(u.pts) };
    },
    fbstatus: function (s, uid, a) {
      if (!s.users[uid].admin) throw err('forbidden');
      var f = (s.feedback || []).filter(function (x) { return x.id === Number(a.fid); })[0];
      if (!f || ['new', 'replied', 'closed'].indexOf(a.status) < 0) throw err('bad_outcome');
      f.status = a.status; return { ok: true };
    }
  };

  function logTrade(s, uid, t) {
    var L = (s.log || (s.log = {}))[uid] || (s.log[uid] = []);
    L.push(t); if (L.length > 500) L.shift();
  }
  // Analytics event: [time, name, uid, extra]. Kept to the newest 50,000.
  function track(s, e, uid, extra, now) {
    var E = s.events || (s.events = []);
    E.push([now, e, uid, extra || null]); if (E.length > 50000) E.splice(0, E.length - 50000);
  }
  // A31 account deletion: removes name and any text the player wrote; their trades
  // stay in market history under an id that no longer points to anyone.
  function deleteUser(s, uid, now) {
    var u = s.users[uid];
    if (!u) return;
    ONDELETE.forEach(function (f) { f(s, uid, now); });
    s.users[uid] = { id: uid, name: '—', pts: 0, deleted: now, created: u.created };
    s.feedback = (s.feedback || []).filter(function (f) { return f.uid !== uid; });
    s.markets.forEach(function (m) { (m.disputes || []).forEach(function (d) { if (d.uid === uid) { d.name = '—'; d.reason = ''; d.link = ''; } }); });
    // Audit log keeps ids and action names; free text that can hold personal data is redacted.
    var KEEP = { user: 1, market: 1, id: 1, amount: 1, shortfall: 1, out: 1, outcome: 1, to: 1, status: 1, on: 1, demoted: 1, truncated: 1 };
    (s.audit || []).forEach(function (x) {
      var mine = x.by === uid, about = x.args && x.args.user === uid;
      if (mine) x.name = '—';
      if ((mine || about) && x.args) Object.keys(x.args).forEach(function (k) { if (!KEEP[k] && typeof x.args[k] === 'string' && x.args[k]) x.args[k] = '[redacted]'; });
    });
    Object.keys(s.devices || {}).forEach(function (d) { s.devices[d] = s.devices[d].filter(function (id) { return id !== uid; }); if (!s.devices[d].length) delete s.devices[d]; });
  }

  var OUTCOMES = { y: 'y', n: 'n', na: 'na' };
  var DISPUTE_MS = 48 * 3600e3;
  var CATS = ['money', 'cricket', 'prices', 'weather', 'air', 'health', 'economy', 'culture', 'transport'];
  function safeLink(l) { l = String(l || '').trim().slice(0, 300); return /^https?:\/\//i.test(l) ? l : ''; }
  // Pay (or re-pay) every holder for outcome `out`. y/n pays 1 per winning share;
  // na refunds the points each holder still had at risk. Reverses any earlier payout first.
  // A correction claws back the full overpayment (decision A15): points in hand go
  // first, the rest becomes a shortfall (u.debt) paid off by new winnings and half
  // of each daily top-up. Each player gets a notice and each clawback is audited.
  function settle(s, m, out, by, now) {
    m.paid = m.paid || {};
    var prevOut = m.outcome;
    Object.keys(m.book).forEach(function (id) {
      var b = m.book[id], u = s.users[id], prev = m.paid[id] || 0;
      // N/A refunds the net stake (points put in minus points taken out by selling), never below 0.
      var pay = out === 'na' ? Math.max(0, b.net != null ? b.net : b.spent) : b[out], delta = pay - prev;
      if (delta >= 0) credit(u, delta);
      else {
        var take = -delta, fromPts = Math.min(Math.max(u.pts, 0), take);
        u.pts -= fromPts; u.debt = (u.debt || 0) + take - fromPts;
        audit(s, by, 'clawback', { user: id, market: m.id, amount: Math.round(take), shortfall: Math.round(u.debt) }, now);
      }
      if (prevOut && Math.abs(delta) >= 0.5) {
        u.notices = u.notices || [];
        u.notices.push({ mid: m.id, q: m.q, from: prevOut, to: out, amount: Math.round(delta), at: now });
      }
      m.paid[id] = pay;
      var p = pos(s, id, m.id); p.paid = Math.round(pay);
    });
    m.outcome = out;
  }
  function credit(u, amt) {
    var r = Math.min(u.debt || 0, amt);
    if (r > 0) u.debt -= r;
    if (u.debt < 0.005) u.debt = 0;
    u.pts += amt - r;
  }

  // Every admin write is logged with who, when, and what.
  var ADMIN_ACTIONS = { adjust: 1, propose: 1, retract: 1, resolve: 1, review: 1, confirm: 1, open: 1, fbstatus: 1, create: 1, city: 1, signup: 1, sponsor: 1 };
  var AUDIT_CAP = 5000;
  function audit(s, uid, name, a, now) {
    s.audit = s.audit || [];
    var args = JSON.parse(JSON.stringify(a));
    Object.keys(args).forEach(function (k) { if (typeof args[k] === 'string' && args[k].length > 500) args[k] = args[k].slice(0, 500); });
    if (JSON.stringify(args).length > 2000) args = { truncated: true };
    s.audit.push({ at: now, by: uid, name: s.users[uid].name, action: name, args: args });
    while (s.audit.length > AUDIT_CAP) { s.audit.shift(); s.auditDropped = (s.auditDropped || 0) + 1; }
  }

  // Extension points for add-on modules (social.js).
  var BEFORE = [], AFTER = {}, ONDELETE = [];
  function extend(kind, name, fn) { if (own(READS, name) || own(WRITES, name)) throw err('dup_action'); (kind === 'read' ? READS : WRITES)[name] = fn; }

  function act(state, uid, name, args, now) {
    now = now || Date.now();
    migrate(state);
    var read = own(READS, name), write = own(WRITES, name);
    if (read) {
      var out = read(state, uid, args || {}, now);
      out.site = state.site; out.cities = state.cities;
      if (uid && state.users[uid] && state.users[uid].admin) out.templates = TEMPLATES;
      return out;
    }
    if (write) {
      if (name === 'feedback' && !uid) uid = null; // feedback works logged out
      else if (!uid || !state.users[uid] || state.users[uid].deleted) throw err('login');
      BEFORE.forEach(function (f) { f(state, uid, name, args || {}, now); });
      var r = write(state, uid, args || {}, now);
      (own(AFTER, name) || []).forEach(function (f) { f(state, uid, args || {}, now, r); });
      if (ADMIN_ACTIONS[name] || (name === 'rename' && state.users[uid].admin)) audit(state, uid, name, args || {}, now);
      return r;
    }
    throw err('unknown');
  }

  var Core = {
    seed: seed, act: act, migrate: migrate, localDay: localDay, track: track, deleteUser: deleteUser, addUser: addUser, isWrite: function (n) { return !!own(WRITES, n); },
    audit: audit, extend: extend, beforeWrite: function (f) { BEFORE.push(f); }, afterWrite: function (n, f) { (AFTER[n] = AFTER[n] || []).push(f); },
    onDelete: function (f) { ONDELETE.push(f); }, err: err, worth: worth, siteDay: siteDay,
    sharesFor: sharesFor, proceedsFor: proceedsFor, priceYes: priceYes, START_POINTS: START_POINTS, DAILY_BONUS: DAILY_BONUS
  };
  if (typeof module === 'object' && module.exports) module.exports = Core; else root.Core = Core;
})(this);
