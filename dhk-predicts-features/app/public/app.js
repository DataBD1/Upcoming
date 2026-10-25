// Dhaka Predicts (rival A) client. Vanilla JS, no framework, ES5-friendly
// syntax so it runs on old Android WebViews. Needs core.js loaded first.
(function () {
  'use strict';
  var VERSION = 'a-0.2';
  var LOCAL = !!window.DP_LOCAL; // true = no server, everything in this browser
  if (LOCAL && window.DPSocial && !Core.isWrite('gcreate')) DPSocial.install(Core); // demo mode runs the social rules here
  var $ = function (s) { return document.querySelector(s); };

  // ---- storage (never throws) ---------------------------------------------------
  function sget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function sdel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // ---- language -----------------------------------------------------------------
  var lang = sget('dp-lang') || (/^bn/i.test(navigator.language || '') ? 'bn' : 'en');
  var T = {
    bn: {
      app: 'ঢাকা প্রেডিক্টস', markets: 'বাজার', mine: 'আমার', top: 'সেরা', pts: 'পয়েন্ট', chance: 'সম্ভাবনা',
      all: 'সব', air: 'বাতাস', prices: 'দাম', health: 'স্বাস্থ্য', weather: 'আবহাওয়া', economy: 'অর্থনীতি', cricket: 'ক্রিকেট', culture: 'সংস্কৃতি', transport: 'যাতায়াত',
      traders: 'জন খেলছেন', vol: 'পয়েন্ট দেওয়া হয়েছে', closes: 'শেষ', closed: 'বন্ধ', resolved: 'নিষ্পত্তি', yes: 'হ্যাঁ', no: 'না',
      bonus: 'আজকের ১০০ ফ্রি পয়েন্ট নিন', take: 'নিন', got_bonus: '১০০ পয়েন্ট যোগ হয়েছে',
      buy: 'বলুন', sell: 'মত বদলান', amount: 'কত পয়েন্ট দেবেন', max: 'সব', est: 'ঠিক হলে পাবেন {w} পয়েন্ট।',
      buy_yes: 'হ্যাঁ বলুন', buy_no: 'না বলুন', bought: 'আপনার ভবিষ্যদ্বাণী জমা হয়েছে। ঠিক হলে পাবেন {s} পয়েন্ট।', sold: 'মত বদলেছেন, {p} পয়েন্ট ফেরত পেয়েছেন',
      your_pos: 'আপনার ভবিষ্যদ্বাণী', sell_all: 'মত বদলান', worth_now: 'এখন ফেরত পাবেন', source: 'যেভাবে নিষ্পত্তি হবে', source_line: 'উৎস: {s}। এই উৎস যা বলবে, সেটাই চূড়ান্ত।',
      rules: 'যত মানুষ যে দিকে বলেন, % তত সরে। কম % থাকতে ঠিক বললে বেশি পয়েন্ট পাবেন। ভুল হলে এই প্রশ্নে দেওয়া পয়েন্ট ফেরত আসে না।',
      admin: 'নিষ্পত্তি করুন (অ্যাডমিন)', settle_y: 'ফলাফল: হ্যাঁ', settle_n: 'ফলাফল: না', settled: 'বাজার নিষ্পত্তি হয়েছে',
      won: 'জিতেছে', lost: 'হেরেছে', outcome: 'ফলাফল', paid: 'পেয়েছেন',
      worth: 'মোট পয়েন্ট', cash: 'হাতে পয়েন্ট', in_play: 'বাজারে', none_yet: 'এখনো কোনো ভবিষ্যদ্বাণী নেই। বাজার থেকে একটি বেছে নিন।',
      all_time: 'সব সময়', this_week: 'এই সপ্তাহ', friends: 'বন্ধুরা', groups: 'গ্রুপ', my_groups: 'আপনার গ্রুপ',
      g_intro: 'পরিবার বা বন্ধুদের নিয়ে গ্রুপ বানিয়ে অনুমান মিলিয়ে দেখুন। গ্রুপ শুধু মজার জন্য: যোগ দিলে বা ডাকলে কেউ পয়েন্ট পায় না।',
      g_new: 'নতুন গ্রুপ', g_name: 'গ্রুপের নাম', g_create: 'বানান', g_join: 'কোড দিয়ে যোগ দিন', g_code: 'কোড, যেমন T75-382', join: 'যোগ দিন',
      g_code_l: 'কোড', copy_invite: 'আমন্ত্রণ কপি', invite_card: 'আমন্ত্রণ কার্ড', leave: 'ছেড়ে দিন', members: '{n} জন সদস্য', copied: 'কপি হয়েছে',
      g_joined: '{g}-এ যোগ দিয়েছেন', week_gain: 'এই সপ্তাহে', avg_week: 'এই সপ্তাহে গড়', unranked: '৩ জন সদস্য হলে র‍্যাংক হবে',
      no_groups: 'আপনি এখনো কোনো গ্রুপে নেই।', friends_empty: 'বন্ধুদের দেখতে একটি গ্রুপ বানান বা যোগ দিন।',
      share_call: 'আপনার অনুমান শেয়ার করুন', share: 'শেয়ার', long_press: 'ছবিটি চেপে ধরে সেভ করুন, তারপর যেকোনো জায়গায় পোস্ট করুন।', copy_caption: 'লেখা কপি', close: 'বন্ধ',
      e_no_group: 'এই কোডের কোনো গ্রুপ নেই', e_too_many_groups: 'সর্বোচ্চ ১০টি গ্রুপে থাকা যায়', e_group_full: 'গ্রুপটি পূর্ণ',
      rank: 'আপনার র‍্যাংক', of: 'জনের মধ্যে', sample: 'নমুনা খেলোয়াড়', you: 'আপনি',
      login: 'লগইন', signup: 'নতুন অ্যাকাউন্ট', phone: 'মোবাইল নম্বর', pin: 'পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)', name: 'নাম (লিডারবোর্ডে দেখাবে)',
      have_acc: 'অ্যাকাউন্ট আছে? লগইন করুন', new_acc: 'নতুন? অ্যাকাউন্ট খুলুন', start_pts: 'শুরুতেই ১,০০০ ফ্রি পয়েন্ট। টাকা লাগে না, টাকা তোলাও যায় না।',
      logout: 'লগআউট', offline: 'আপনি অফলাইনে। শেষ দেখা তথ্য দেখাচ্ছে, ভবিষ্যদ্বাণী বন্ধ।', back: 'ফিরে যান',
      demo: 'ডেমো: আপনার খেলা শুধু এই ফোনে সেভ হয়। অন্য খেলোয়াড়রা নমুনা।', reset: 'নতুন করে শুরু',
      free: 'শুধু ফ্রি পয়েন্ট। কোনো টাকা নেই।',
      e_no_points: 'যথেষ্ট পয়েন্ট নেই', e_closed: 'এই বাজার বন্ধ', e_bad_amount: 'সঠিক পরিমাণ দিন', e_too_big: 'একবারে এত পয়েন্ট দেওয়া যাবে না, কম দিন',
      e_bad_phone: 'সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)', e_bad_pin: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে', e_phone_taken: 'এই নম্বরে অ্যাকাউন্ট আছে, লগইন করুন',
      e_no_account: 'এই নম্বরে অ্যাকাউন্ট নেই', e_wrong_login: 'নম্বর বা পাসওয়ার্ড ভুল', e_wrong_pin: 'পাসওয়ার্ড ভুল', e_slow_down: 'অনেকবার চেষ্টা হয়েছে, ১৫ মিনিট পরে আবার করুন',
      settle_na: 'বাতিল (সবাই ফেরত পাবে)', note_ph: 'উৎসের মান, যেমন ৳১৫৫', link_ph: 'উৎসের লিংক (https://...)', na: 'বাতিল',
      res_card: 'ফলাফল', res_value: 'উৎসের মান', res_paid: '{h} জনকে মোট {p} পয়েন্ট দেওয়া হয়েছে', res_mine: 'আপনি পেয়েছেন {p} পয়েন্ট', res_refund: 'বাজার বাতিল হয়েছে, সবাই খরচ করা পয়েন্ট ফেরত পেয়েছেন',
      dispute: 'এই ফলাফলে আপত্তি জানান', dispute_why: 'কেন ফলাফল ভুল মনে হচ্ছে?', dispute_link: 'প্রমাণের লিংক (ঐচ্ছিক)', send: 'পাঠান', dispute_sent: 'আপত্তি পাঠানো হয়েছে, অ্যাডমিন দেখবেন',
      dispute_until: '{d} পর্যন্ত আপত্তি জানানো যাবে', dispute_open: '{n}টি আপত্তি পর্যালোচনায়', you_disputed: 'আপনার আপত্তি জমা আছে',
      reviewed_kept: 'আপত্তি দেখা হয়েছে, ফলাফল ঠিক আছে', reviewed_changed: 'আপত্তির পর ফলাফল বদলেছে: {a} থেকে {b}। সবার পয়েন্ট আবার হিসাব হয়েছে।',
      help: 'মতামত', fb_title: 'সমস্যা বা মতামত জানান', fb_ph: 'কী হয়েছে, কোন পাতায়?', fb_sent: 'ধন্যবাদ, আমরা পেয়েছি', close: 'বন্ধ',
      new_market: 'নতুন বাজার', q_en: 'প্রশ্ন (ইংরেজি)', q_bn: 'প্রশ্ন (বাংলা)', src_en: 'উৎস (ইংরেজি)', src_bn: 'উৎস (বাংলা)', closes_on: 'শেষ তারিখ', start_p: 'শুরুর সম্ভাবনা %', category: 'বিভাগ', create: 'বাজার খুলুন', created: 'বাজার খোলা হয়েছে', audit: 'অডিট লগ',
      streak_now: 'টানা {n} দিন', streak_best: 'সেরা: {n} দিন', streak_none: 'আজকের ১০০ পয়েন্ট নিলে ধারা শুরু হবে',
      streak_wait: 'আগামীকাল ফিরে এসে ১০০ পয়েন্ট নিলে ধারা শুরু হবে',
      soon: 'শীঘ্রই শেষ', admin_one: 'মাত্র {n}টি অ্যাডমিন নম্বর দেওয়া আছে। ADMIN_PHONES-এ দ্বিতীয় নম্বর যোগ করুন, না হলে সংশোধন অনুমোদন করা যাবে না।', audit_csv: 'অডিট লগ CSV নামান',
      overdue: 'সময় পেরিয়েছে', need_review: 'আপত্তি দেখতে হবে', need_approval: 'দ্বিতীয় অ্যাডমিন দরকার', need_settle: 'নিজে থেকেই নিষ্পত্তি হবে', early_confirm: 'আপত্তির সময় শেষ হওয়ার আগেই নিষ্পত্তি করবেন?',
      reset_title: 'খেলোয়াড়ের পাসওয়ার্ড রিসেট', reset_phone: 'খেলোয়াড়ের নম্বর', reset_make: 'কোড বানান', reset_code: 'এই কোডটি খেলোয়াড়কে দিন। একবারই কাজ করবে, {m} মিনিট: {c}',
      forgot: 'পাসওয়ার্ড ভুলে গেছেন?', otp_login: 'এসএমএস কোড দিয়ে লগইন', otp_send: 'কোড পাঠান', otp_code: 'কোড', otp_verify: 'লগইন', otp_sent: 'এই নম্বরে অ্যাকাউন্ট থাকলে একটি কোড পাঠানো হয়েছে।', reset_have: 'রিসেট কোড', reset_new: 'নতুন পাসওয়ার্ড', reset_do: 'নতুন পাসওয়ার্ড দিন', back_login: 'লগইনে ফিরুন',
      sp_title: 'স্পনসর লাইন', sp_en: 'লেখা (ইংরেজি)', sp_bn: 'লেখা (বাংলা)', sp_url: 'লিংক (https://...)', sp_save: 'সংরক্ষণ', sp_tag: 'স্পনসর',
      e_bad_link: 'লিংক https:// দিয়ে শুরু হতে হবে', e_bad_reset: 'কোডটি ভুল বা মেয়াদ শেষ', e_forbidden: 'অনুমতি নেই', e_bad_otp: 'কোড ভুল বা মেয়াদ শেষ', e_otp_unavailable: 'এখন কোড পাঠানো যাচ্ছে না',
      e_bad_date: 'ভবিষ্যতের একটি তারিখ দিন', e_need_source: 'নিষ্পত্তির উৎস দিন',
      shortfall: 'বাকি', notice: 'সংশোধন: "{q}" এর ফলাফল {a} থেকে {b} করা হয়েছে। {p} পয়েন্ট {dir}।', taken: 'ফেরত নেওয়া হয়েছে', given: 'যোগ হয়েছে', ok: 'ঠিক আছে',
      debt_line: 'আপনার {d} পয়েন্ট বাকি আছে। নতুন জেতা পয়েন্ট আর প্রতিদিনের বোনাসের অর্ধেক দিয়ে এটা শোধ হবে। প্রতিদিন অন্তত ৫০ পয়েন্ট খেলতে পারবেন।',
      if_right: 'ঠিক হলে {n} পয়েন্ট', lost_n: '{n} পয়েন্ট গেছে', terms: 'শর্তাবলি', agree_terms: 'সাইন আপ করলে আপনি শর্তাবলি মেনে নিচ্ছেন।',
      not_here: 'এই বেটা এখনো আপনার দেশে চালু হয়নি।', proposed: 'প্রস্তাবিত ফলাফল', proposed_line: 'আপত্তি জানানো যাবে {d} পর্যন্ত। এরপর পয়েন্ট দেওয়া হবে।',
      window: 'আপত্তির সময়', hours: '{n} ঘণ্টা', no_window: 'এখনই', propose: 'ফলাফল প্রস্তাব করুন', settle_now: 'নিষ্পত্তি করুন', retract: 'প্রস্তাব ফেরত নিন',
      pending_fix: 'সংশোধনের প্রস্তাব: {o}। দ্বিতীয় একজন অ্যাডমিনের অনুমোদন লাগবে।', waiting_second: 'দ্বিতীয় অ্যাডমিনের অপেক্ষায়', approve: 'অনুমোদন', reject: 'বাতিল',
      players: 'খেলোয়াড় খুঁজুন', search_ph: 'নাম বা মোবাইল নম্বর', search: 'খুঁজুন', adjust: 'পয়েন্ট ঠিক করুন', adj_amt: 'পরিমাণ (+ বা −)', adj_why: 'কারণ (অডিট লগে থাকবে)',
      daily: 'দৈনিক বাজার খুলুন', template: 'ধরন', threshold: 'সীমা', settle_day: 'নিষ্পত্তির দিন', repeat: 'আবার খুলুন', adj_notice: 'অ্যাডমিন আপনার পয়েন্ট {p} বদলেছেন: {r}',
      money: 'টাকা-ডলার', closes_at: 'শেষ {d}, {t}',
      e_not_available: 'এই বেটা এখনো আপনার দেশে চালু হয়নি।', e_same_admin: 'নিজের প্রস্তাব নিজে অনুমোদন করা যায় না', e_no_pending: 'অনুমোদনের কিছু নেই', e_window_open: 'আপত্তির সময় এখনো চলছে',
      e_no_proposal: 'কোনো প্রস্তাব নেই', e_bad_template: 'ধরন বেছে নিন', e_bad_threshold: 'সীমা সংখ্যায় দিন', e_exists: 'এই বাজার আগেই খোলা হয়েছে', e_no_user: 'খেলোয়াড় পাওয়া যায়নি', e_unknown: 'কিছু একটা ভুল হয়েছে', e_bad_window: 'আপত্তির সময় ০, অথবা ১৫ মিনিট থেকে ৭২ ঘণ্টা',
      e_has_disputes: 'খোলা আপত্তি আছে। আগে সেগুলো দেখুন', e_bad_city: 'শহর বেছে নিন', e_bad_json: 'অনুরোধটি পড়া যায়নি', e_bad_outcome: 'ফলাফল বেছে নিন', e_dup_action: 'কিছু একটা ভুল হয়েছে', e_login: 'আগে লগইন করুন', e_no_dispute: 'দেখার মতো কোনো আপত্তি নেই', e_no_market: 'বেটা পাওয়া যায়নি', e_no_shares: 'এতগুলো শেয়ার আপনার নেই', e_not_resolved: 'বেটাটির ফলাফল এখনো ঠিক হয়নি', e_too_large: 'অনুরোধটি অনেক বড়', e_try_again: 'একটু পরে আবার চেষ্টা করুন', e_use_post: 'কিছু একটা ভুল হয়েছে',
      footer: 'বিনামূল্যে খেলুন। কোনো টাকা নেই, কোনো পুরস্কার নেই। পয়েন্ট কেনা যায় না, ভাঙানো যায় না। শুধু ১৮+।', privacy: 'গোপনীয়তা নীতি',
      adult_box: 'আমার বয়স ১৮ বছর বা তার বেশি', consent_box: 'আমি গোপনীয়তা নীতি পড়েছি এবং আমার তথ্য ব্যবহারে সম্মতি দিচ্ছি',
      admin_setup: 'অ্যাডমিন সেটআপ কোড (শুধু টিমের জন্য)', e_bad_setup: 'সেটআপ কোডটি সঠিক নয়',
      priv_short: 'আমরা শুধু আপনার নাম, মোবাইল নম্বর ও পাসওয়ার্ড (গোপন করে) রাখি, আর খেলার হিসাব। খেলা চালানো ও একজনের একটি অ্যাকাউন্ট নিশ্চিত করতে এগুলো লাগে। তথ্য থাকে Supabase (মুম্বাই, ভারত) ও Vercel-এ। সেটিংস থেকে যেকোনো সময় দেখা, ঠিক করা বা মুছে ফেলা যায়।',
      read_full: 'পুরো নীতি পড়ুন', account: 'আমার তথ্য', your_data: 'আপনার সম্পর্কে আমরা যা রাখি', joined: 'যোগ দিয়েছেন', consented: 'সম্মতি দিয়েছেন',
      save: 'সেভ করুন', saved: 'সেভ হয়েছে', new_phone: 'নতুন মোবাইল নম্বর', change_phone: 'নম্বর বদলান', pw_again: 'পাসওয়ার্ড আবার দিন',
      history: 'আপনার সব ভবিষ্যদ্বাণী', bought_h: 'বলেছেন', sold_h: 'মত বদলেছেন', del_title: 'অ্যাকাউন্ট মুছুন',
      del_text: 'আপনার নাম, মোবাইল নম্বর, পাসওয়ার্ড, মতামত ও আপত্তির লেখা মুছে যাবে, আর আপনার সম্মতি প্রত্যাহার হবে। বাজারের % ইতিহাসে আপনার ভবিষ্যদ্বাণী থাকবে, তবে আপনার পরিচয় ছাড়া। এটা ফেরানো যায় না।',
      del_confirm: 'আমি বুঝেছি, অ্যাকাউন্ট মুছে ফেলুন', del_go: 'চিরতরে মুছুন', deleted: 'অ্যাকাউন্ট মুছে ফেলা হয়েছে', demo_del: 'ডেমোতে মুছলে খেলা নতুন করে শুরু হয়।',
      metrics: 'বিটা মেট্রিক্স (A8)', m_ret: 'ফিরে এসেছেন (যাদের ততদিন হয়েছে)', m_w2: 'দ্বিতীয় সপ্তাহে ভবিষ্যদ্বাণী', m_csv: 'ট্র্যাকারের জন্য CSV নামান', m_players: 'খেলোয়াড়', m_act: 'সক্রিয় (৭ দিনে ৩+ ভবিষ্যদ্বাণী, ২+ বিভাগ, ১টি ফলাফল দেখা)', m_first: '২৪ ঘণ্টায় প্রথম ভবিষ্যদ্বাণী', m_wau: 'এই সপ্তাহে সক্রিয়', m_ppa: 'সক্রিয়দের গড় ভবিষ্যদ্বাণী', m_flags: 'এক ডিভাইসে ৩+ অ্যাকাউন্ট',
      e_need_adult: '১৮+ বক্সে টিক দিন', e_need_consent: 'গোপনীয়তা নীতির সম্মতি বক্সে টিক দিন', e_own_market: 'নিজের খোলা প্রশ্নে ভবিষ্যদ্বাণী করা যায় না', e_bad_name: 'নাম অন্তত ২ অক্ষরের হতে হবে',
      inbox: 'অ্যাডমিন ইনবক্স', feedback: 'মতামত', disputes: 'আপত্তি', keep: 'ফলাফল রাখুন', mark: 'চিহ্নিত',
      e_need_reason: 'একটু বিস্তারিত লিখুন', e_dispute_over: 'আপত্তির সময় শেষ', e_already_disputed: 'আপনি আগেই আপত্তি জানিয়েছেন', e_not_holder: 'শুধু যারা এই প্রশ্নে ভবিষ্যদ্বাণী করেছিলেন তারা আপত্তি জানাতে পারেন',
      e_bonus_taken: 'আজকের বোনাস নেওয়া হয়েছে', e_net: 'নেটওয়ার্ক পাওয়া যাচ্ছে না', e_other: 'কিছু একটা ভুল হয়েছে', e_boot: 'সাইট চালু হচ্ছে, একটু পরে আবার চেষ্টা করুন', e_server: 'সাইট চালু হচ্ছে, একটু পরে আবার চেষ্টা করুন'
    },
    en: {
      app: 'Dhaka Predicts', markets: 'Markets', mine: 'Mine', top: 'Top', pts: 'pts', chance: 'chance',
      all: 'All', air: 'Air', prices: 'Prices', health: 'Health', weather: 'Weather', economy: 'Economy', cricket: 'Cricket', culture: 'Culture', transport: 'Transport',
      traders: 'players', vol: 'points in', closes: 'Closes', closed: 'Closed', resolved: 'Resolved', yes: 'Yes', no: 'No',
      bonus: "Claim today's 100 free points", take: 'Claim', got_bonus: '100 points added',
      buy: 'Predict', sell: 'Change my mind', amount: 'Points on this', max: 'Max', est: "If you're right you get {w} pts.",
      buy_yes: 'Predict YES', buy_no: 'Predict NO', bought: "Prediction saved. If you're right you get {s} pts.", sold: 'Mind changed. {p} pts back.',
      your_pos: 'Your predictions', sell_all: 'Change my mind', worth_now: 'back now', source: 'How this settles', source_line: 'Source: {s}. What this source reports is final.',
      rules: "The % moves as people predict. Predict early or against the crowd and you get more points if you're right. If you're wrong, the points you put on this question are gone.",
      admin: 'Settle market (admin)', settle_y: 'Outcome: YES', settle_n: 'Outcome: NO', settled: 'Market settled',
      won: 'won', lost: 'lost', outcome: 'Outcome', paid: 'paid',
      worth: 'Total points', cash: 'Points in hand', in_play: 'In play', none_yet: 'No predictions yet. Pick a market to start.',
      all_time: 'All time', this_week: 'This week', friends: 'Friends', groups: 'Groups', my_groups: 'Your groups',
      g_intro: 'Make a group for family or friends and compare forecasts. Groups are just for fun: nobody gets points for joining or inviting.',
      g_new: 'New group', g_name: 'Group name', g_create: 'Create', g_join: 'Join with a code', g_code: 'Code, like T75-382', join: 'Join',
      g_code_l: 'Code', copy_invite: 'Copy invite', invite_card: 'Invite card', leave: 'Leave', members: 'Members: {n}', copied: 'Copied',
      g_joined: 'You joined {g}', week_gain: 'this week', avg_week: 'average this week', unranked: 'Ranked from 3 members',
      no_groups: 'You are not in a group yet.', friends_empty: 'Join or make a group to see friends here.',
      share_call: 'Share your call', share: 'Share', long_press: 'Long-press the picture to save it, then post it anywhere.', copy_caption: 'Copy text', close: 'Close',
      e_no_group: 'No group with that code', e_too_many_groups: 'You can be in up to 10 groups', e_group_full: 'That group is full',
      rank: 'Your rank', of: 'of', sample: 'sample player', you: 'You',
      login: 'Log in', signup: 'Create account', phone: 'Mobile number', pin: 'Password (6+ characters)', name: 'Name (shown on leaderboard)',
      have_acc: 'Have an account? Log in', new_acc: 'New here? Create an account', start_pts: 'Start with 1,000 free points. No money in, no money out.',
      logout: 'Log out', offline: "You're offline. Showing what you last saw; predicting is paused.", back: 'Back',
      demo: 'Demo: your game is saved only on this phone. Other players are samples.', reset: 'Start over',
      free: 'Free points only. No money.',
      e_no_points: 'Not enough points', e_closed: 'This market is closed', e_bad_amount: 'Enter a valid amount', e_too_big: 'Too many points for one go, try less',
      e_bad_phone: 'Enter a valid mobile number (01XXXXXXXXX)', e_bad_pin: 'Password must be at least 6 characters', e_phone_taken: 'That number has an account, log in instead',
      e_no_account: 'No account for that number', e_wrong_login: 'Wrong number or password', e_wrong_pin: 'Wrong password', e_slow_down: 'Too many tries, wait 15 minutes',
      settle_na: 'Cancel (refund everyone)', note_ph: 'Source value, e.g. ৳155', link_ph: 'Source link (https://...)', na: 'Cancelled',
      res_card: 'Result', res_value: 'Source value', res_paid: '{p} pts paid to {h} players', res_mine: 'You received {p} pts', res_refund: 'Market cancelled. Everyone got back the points they spent.',
      dispute: 'Dispute this result', dispute_why: 'Why do you think the result is wrong?', dispute_link: 'Link to evidence (optional)', send: 'Send', dispute_sent: 'Dispute sent. An admin will review it.',
      dispute_until: 'Disputes open until {d}', dispute_open: '{n} dispute(s) under review', you_disputed: 'Your dispute is in',
      reviewed_kept: 'Disputes reviewed; the result stands', reviewed_changed: 'After review the result changed from {a} to {b}. Everyone\'s points were recalculated.',
      help: 'Help', fb_title: 'Report a problem or send feedback', fb_ph: 'What happened, and on which screen?', fb_sent: 'Thanks, we got it', close: 'Close',
      new_market: 'New market', q_en: 'Question (English)', q_bn: 'Question (Bangla)', src_en: 'Source (English)', src_bn: 'Source (Bangla)', closes_on: 'Closes on', start_p: 'Starting chance %', category: 'Category', create: 'Open market', created: 'Market opened', audit: 'Audit log',
      streak_now: '{n}-day streak', streak_best: 'Best: {n} days', streak_none: 'Take today\'s 100 points to start a streak',
      streak_wait: 'Come back tomorrow and take your 100 points to start a streak',
      soon: 'Due soon', admin_one: 'Only {n} admin number is set. Add a second one in ADMIN_PHONES, or corrections cannot be approved.', audit_csv: 'Download audit log CSV',
      overdue: 'Overdue', need_review: 'Needs review', need_approval: 'Needs a second admin', need_settle: 'Settles automatically', early_confirm: 'Settle now, before the dispute window ends?',
      reset_title: 'Reset a player\'s password', reset_phone: 'Player\'s number', reset_make: 'Make code', reset_code: 'Give this code to the player. It works once, for {m} minutes: {c}',
      forgot: 'Forgot your password?', otp_login: 'Log in with an SMS code', otp_send: 'Send code', otp_code: 'Code', otp_verify: 'Log in', otp_sent: 'If that number has an account, a code was sent.', reset_have: 'Reset code', reset_new: 'New password', reset_do: 'Set new password', back_login: 'Back to log in',
      sp_title: 'Sponsor line', sp_en: 'Text (English)', sp_bn: 'Text (Bangla)', sp_url: 'Link (https://...)', sp_save: 'Save', sp_tag: 'Sponsored',
      e_bad_link: 'The link must start with https://', e_bad_reset: 'That code is wrong or has expired', e_forbidden: 'Not allowed', e_bad_otp: 'That code is wrong or has expired', e_otp_unavailable: 'Codes cannot be sent right now',
      e_bad_date: 'Pick a future date', e_need_source: 'Add the settlement source',
      shortfall: 'Owed', notice: 'Correction: "{q}" changed from {a} to {b}. {p} pts {dir}.', taken: 'taken back', given: 'added', ok: 'OK',
      debt_line: 'You owe {d} pts. New winnings and half of each daily bonus pay it off; you always get at least 50 pts a day to play.',
      if_right: '{n} pts if right', lost_n: '{n} pts gone', terms: 'Terms', agree_terms: 'By signing up you agree to the Terms.',
      not_here: 'This beta is not available in your country yet.', proposed: 'Proposed result', proposed_line: 'Disputes are open until {d}. Points move after that.',
      window: 'Dispute window', hours: '{n} hours', no_window: 'None', propose: 'Propose result', settle_now: 'Settle now', retract: 'Retract',
      pending_fix: 'Correction proposed: {o}. A second admin must approve it.', waiting_second: 'Waiting for a second admin', approve: 'Approve', reject: 'Reject',
      players: 'Find a player', search_ph: 'Name or mobile number', search: 'Search', adjust: 'Adjust points', adj_amt: 'Amount (+ or −)', adj_why: 'Reason (goes in the audit log)',
      daily: 'Open a daily market', template: 'Template', threshold: 'Threshold', settle_day: 'Settlement day', repeat: 'Repeat', adj_notice: 'An admin changed your points by {p}: {r}',
      money: 'Money', closes_at: 'Closes {d}, {t}',
      e_not_available: 'This beta is not available in your country yet.', e_same_admin: "You can't approve your own proposal", e_no_pending: 'Nothing to approve', e_window_open: 'The dispute window is still open',
      e_no_proposal: 'No proposal to retract', e_bad_template: 'Pick a template', e_bad_threshold: 'Threshold must be a number', e_exists: 'That market is already open', e_no_user: 'Player not found', e_unknown: 'Something went wrong', e_bad_window: 'Dispute window must be 0, or between 15 minutes and 72 hours',
      e_has_disputes: 'There are open disputes. Review them first', e_bad_city: 'Pick a city', e_bad_json: 'That request could not be read', e_bad_outcome: 'Pick a result', e_dup_action: 'Something went wrong', e_login: 'Please log in first', e_no_dispute: 'No dispute to review', e_no_market: 'Market not found', e_no_shares: "You don't have that many shares", e_not_resolved: 'This market is not settled yet', e_too_large: 'That request is too large', e_try_again: 'Please try again in a moment', e_use_post: 'Something went wrong',
      footer: "Free to play. No money, no prizes. Points can't be bought or cashed out. 18+ only.", privacy: 'Privacy notice',
      adult_box: 'I am 18 or older', consent_box: 'I have read the privacy notice and agree to my data being used as it describes',
      admin_setup: 'Admin setup code (team only)', e_bad_setup: 'That setup code is not right',
      priv_short: 'We keep only your name, mobile number and password (scrambled), plus your game record. We need them to run the game and make sure each person has one account. Data is stored with Supabase (Mumbai, India) and Vercel. You can see, correct or delete it any time in settings.',
      read_full: 'Read the full notice', account: 'My data', your_data: 'What we hold about you', joined: 'Joined', consented: 'Consent given',
      save: 'Save', saved: 'Saved', new_phone: 'New mobile number', change_phone: 'Change number', pw_again: 'Enter your password again',
      history: 'All your predictions', bought_h: 'predicted', sold_h: 'changed mind on', del_title: 'Delete account',
      del_text: 'Your name, mobile number, password, feedback and dispute text are deleted and your consent is withdrawn. Your predictions stay in the question\'s % history without anything that identifies you. This cannot be undone.',
      del_confirm: 'I understand, delete my account', del_go: 'Delete forever', deleted: 'Account deleted', demo_del: 'In the demo, deleting starts the game over.',
      metrics: 'Beta metrics (A8)', m_ret: 'Came back (players old enough for that day)', m_w2: 'Predicted in week 2', m_csv: 'Download CSV for the tracker', m_players: 'Players', m_act: 'Activated (3+ predictions, 2+ categories, 1 result seen in 7 days)', m_first: 'First prediction within 24h', m_wau: 'Active this week', m_ppa: 'Predictions per active player', m_flags: '3+ accounts on one device',
      e_need_adult: 'Tick the 18+ box', e_need_consent: 'Tick the privacy consent box', e_own_market: "You can't predict on a question you created", e_bad_name: 'Name must be at least 2 characters',
      inbox: 'Admin inbox', feedback: 'Feedback', disputes: 'Disputes', keep: 'Keep result', mark: 'Mark',
      e_need_reason: 'Please add a bit more detail', e_dispute_over: 'The dispute window has closed', e_already_disputed: 'You already disputed this', e_not_holder: 'Only players who predicted on this question can dispute',
      e_bonus_taken: "Today's bonus is already claimed", e_net: 'No network', e_other: 'Something went wrong', e_boot: 'Setting up, back soon. Try again in a few minutes.', e_server: 'Setting up, back soon. Try again in a few minutes.'
    }
  };
  // Privacy notice (A31), condensed from risk/privacy-and-terms-draft.md Part 1.
  // DRAFT: not yet reviewed by the lawyer (B6); the Bangla still needs the native check (B8). [Brackets] are blanks SK fills (B13).
  var PRIVACY = {
    en: { title: 'Privacy notice', status: 'Draft for legal review, version draft-1. Not final.', sections: [
      ['Who we are', ['Dhaka Predicts is a free forecasting game run by [SK\'s full legal name, or the company once formed], contact [email address]. This person is responsible for your data.']],
      ['What we collect, and why', ['<b>Display name</b>: shown on leaderboards and markets. <b>Mobile number</b>: to sign you in, keep one account per person and contact you about your account; only we see it. <b>Password</b>: stored scrambled, nobody can read it.',
        '<b>Your predictions, points and positions</b>: to run the game and the leaderboard. Totals and rank are public; trades show in market history without your number. <b>Dispute reasons and feedback</b> you write: seen only by admins. <b>Basic usage events</b> (signed up, made a prediction, saw a result, came back, sent feedback) and your browser type: to see whether the game works and fix bugs.',
        'We do not collect your NID, birth certificate, address, payment details, contacts or location. We do not sell your data or show ads based on it.']],
      ['Your age', ['Dhaka Predicts is for people aged 18 and over. If we learn a player is under 18, we close the account and delete their data.']],
      ['Consent', ['We use your data because you agree at sign-up with a separate box that is not ticked for you. You can withdraw consent any time by deleting your account.']],
      ['Where your data is stored', ['With Supabase (database) in its Mumbai, India region, and Vercel (app hosting). Both process data for us under their own security terms. Your data is held outside Bangladesh.']],
      ['How long we keep it', ['While your account is open, we keep your data so the game works. When you delete your account, your name, number, password, feedback and dispute text are deleted within [30] days, and your past trades stay in market history without anything that identifies you. Backups are overwritten within [30] days. Admin action records are kept for [2 years] without your account reference. Accounts unused for [2 years] are deleted after a reminder.']],
      ['Your rights', ['<b>See</b> your data and full prediction history, <b>correct</b> your name and number, and <b>delete</b> your account, all from "My data" in the Mine tab. Questions or complaints: [email]; we reply within [7] days. You can also complain to [the data protection authority under the Personal Data Protection Act 2026].']],
      ['Security', ['Passwords are stored scrambled, connections are encrypted, admin tools are limited and every admin action is logged. If a breach puts your data at risk we will tell the Authority and affected players as the law requires.']],
      ['Changes', ['If we change this notice in a way that matters, we tell you in the app first and ask for consent again where needed.']]
    ] },
    bn: { title: 'গোপনীয়তা নীতি', status: 'আইনি পর্যালোচনার জন্য খসড়া, সংস্করণ draft-1। চূড়ান্ত নয়।', sections: [
      ['আমরা কারা', ['ঢাকা প্রেডিক্টস একটি বিনামূল্যের ভবিষ্যদ্বাণীর খেলা, পরিচালনা করেন [SK-এর পূর্ণ আইনি নাম, বা কোম্পানি গঠিত হলে তার নাম], যোগাযোগ [ইমেইল]। আপনার তথ্যের দায়িত্ব তাঁর।']],
      ['আমরা কী রাখি, কেন', ['<b>প্রদর্শনের নাম</b>: লিডারবোর্ড ও বাজারে দেখায়। <b>মোবাইল নম্বর</b>: লগইন, একজনের একটি অ্যাকাউন্ট নিশ্চিত করা ও অ্যাকাউন্ট নিয়ে যোগাযোগের জন্য; শুধু আমরা দেখি। <b>পাসওয়ার্ড</b>: গোপন করে রাখা হয়, কেউ পড়তে পারে না।',
        '<b>আপনার ভবিষ্যদ্বাণী, পয়েন্ট ও শেয়ার</b>: খেলা ও লিডারবোর্ড চালাতে। মোট পয়েন্ট ও র‍্যাংক সবাই দেখে; লেনদেন বাজারের ইতিহাসে দেখায়, আপনার নম্বর ছাড়া। আপনার লেখা <b>আপত্তি ও মতামত</b>: শুধু অ্যাডমিন দেখেন। <b>সাধারণ ব্যবহারের তথ্য</b> (যোগ দেওয়া, ভবিষ্যদ্বাণী, ফলাফল দেখা, ফিরে আসা, মতামত পাঠানো) ও ব্রাউজারের ধরন: খেলা ঠিকমতো চলছে কিনা বুঝতে ও সমস্যা ঠিক করতে।',
        'আমরা আপনার এনআইডি, জন্মনিবন্ধন, ঠিকানা, পেমেন্টের তথ্য, কন্টাক্ট বা লোকেশন নিই না। আপনার তথ্য বিক্রি করি না, এর ভিত্তিতে বিজ্ঞাপনও দেখাই না।']],
      ['বয়স', ['ঢাকা প্রেডিক্টস শুধু ১৮ বা তার বেশি বয়সীদের জন্য। কেউ ১৮-এর কম জানলে অ্যাকাউন্ট বন্ধ করে তথ্য মুছে ফেলা হয়।']],
      ['সম্মতি', ['সাইন-আপের সময় আলাদা একটি বক্সে (আগে থেকে টিক দেওয়া নয়) আপনি সম্মতি দেন বলেই আমরা তথ্য ব্যবহার করি। অ্যাকাউন্ট মুছে দিয়ে যেকোনো সময় সম্মতি প্রত্যাহার করতে পারেন।']],
      ['তথ্য কোথায় থাকে', ['Supabase (ডেটাবেস, মুম্বাই, ভারত) ও Vercel (অ্যাপ হোস্টিং)-এ। দুটিই নিজেদের নিরাপত্তা শর্তে আমাদের হয়ে তথ্য রাখে। অর্থাৎ আপনার তথ্য বাংলাদেশের বাইরে থাকে।']],
      ['কতদিন রাখি', ['অ্যাকাউন্ট খোলা থাকা পর্যন্ত। অ্যাকাউন্ট মুছলে [৩০] দিনের মধ্যে নাম, নম্বর, পাসওয়ার্ড, মতামত ও আপত্তির লেখা মুছে যায়; আগের লেনদেন বাজারের ইতিহাসে থাকে, আপনার পরিচয় ছাড়া। ব্যাকআপ [৩০] দিনে মুছে যায়। অ্যাডমিনের কাজের রেকর্ড [২ বছর] থাকে, আপনার অ্যাকাউন্টের উল্লেখ ছাড়া। [২ বছর] অব্যবহৃত অ্যাকাউন্ট মনে করিয়ে দেওয়ার পর মুছে ফেলা হয়।']],
      ['আপনার অধিকার', ['"আমার" ট্যাবের "আমার তথ্য" থেকে আপনার তথ্য ও সব ভবিষ্যদ্বাণী <b>দেখুন</b>, নাম ও নম্বর <b>ঠিক করুন</b>, আর অ্যাকাউন্ট <b>মুছে ফেলুন</b>। প্রশ্ন বা অভিযোগ: [ইমেইল]; আমরা [৭] দিনের মধ্যে উত্তর দিই। ব্যক্তিগত উপাত্ত সুরক্ষা আইন ২০২৬-এর [কর্তৃপক্ষের নাম]-এর কাছেও অভিযোগ করতে পারেন।']],
      ['নিরাপত্তা', ['পাসওয়ার্ড গোপন করে রাখা হয়, সংযোগ এনক্রিপ্টেড, অ্যাডমিন টুল সীমিত, আর অ্যাডমিনের প্রতিটি কাজ লগ হয়। তথ্য ঝুঁকিতে পড়লে আইন অনুযায়ী কর্তৃপক্ষ ও ক্ষতিগ্রস্ত খেলোয়াড়দের জানানো হবে।']],
      ['পরিবর্তন', ['গুরুত্বপূর্ণ পরিবর্তন হলে আগে অ্যাপে জানাব, প্রয়োজনে আবার সম্মতি চাইব।']]
    ] }
  };
  var TERMS = {
    en: { title: 'Terms of use', status: 'Draft for legal review, version draft-1. Not final.', sections: [
      ['What this is', ['A free game where you forecast real events using points, for fun and bragging rights. <b>Free to play. No money, no prizes. Points can\'t be bought or cashed out. 18+ only.</b>']],
      ['Who can play', ['You must be 18 or older. One account per person and per phone number; extra accounts may be closed and their points removed. Don\'t play on behalf of anyone else.', '<b>Not available to people in Bangladesh during the beta.</b>']],
      ['Points', ['You get 1,000 points when you join. Once per day you can claim 100 points; the day resets at midnight on the site clock for everyone, and unclaimed days don\'t build up.', 'Points have no cash value. They can never be bought, sold, transferred, exchanged for anything or cashed out. Trading accounts or points outside the app leads to closure. We may change point amounts and rules to keep the game fair.']],
      ['No prizes', ['There are no prizes of any kind. Leaderboards are for recognition only.']],
      ['Questions and prices', ['Each question shows its rule, closing time and the public source that settles it. Prices are set by a formula and move as people predict; a price is the crowd\'s estimate, not a fact or advice. Nothing here is financial or other professional advice.']],
      ['How results are settled', ['We settle each question from its named source, using the rule shown. If the source is unclear or unavailable, or the event doesn\'t happen as worded, we may cancel it (N/A) and return the points spent.', 'If a result was wrong, we fix it and recalculate everyone\'s points. If you already spent points you should not have received, you may owe points for a while; half of each daily top-up and all new winnings pay it back, so you always get at least 50 points a day. You\'ll get a notice.', 'You can ask us to check a result within 48 hours of settlement. A different admin reviews any change. Our decision after review is final within the game.']],
      ['Sponsors', ['Sponsors have no say in results and don\'t see your data. We never accept sponsors from betting, mobile-money or crypto businesses.']],
      ['How to behave', ['Don\'t post hate, harassment or sexual content, election or political content, false information or other people\'s personal information. Don\'t use bots, scripts, multiple accounts or groups to move prices or rankings, attack the app, or promote gambling. We may remove content or points gained unfairly, hide names, or close accounts.']],
      ['Closing your account', ['You can delete your account any time from "My data". We may close accounts that break these terms, or end the game, with notice where possible. Points end when an account or the game closes and have no value to refund.']],
      ['Our responsibility, law, changes', ['The app is provided as it is; we do our best but can\'t promise it is always available or error-free. [Liability limits, governing law and courts: for the lawyer.] We\'ll tell you in the app before important changes apply.']],
      ['Contact', ['[email], and the feedback button.']]
    ] },
    bn: { title: 'ব্যবহারের শর্তাবলি', status: 'আইনি পর্যালোচনার জন্য খসড়া, সংস্করণ draft-1। চূড়ান্ত নয়।', sections: [
      ['এটা কী', ['পয়েন্ট দিয়ে বাস্তব ঘটনার পূর্বাভাস দেওয়ার একটি বিনামূল্যের খেলা, শুধু মজা ও সম্মানের জন্য। <b>খেলা বিনামূল্যে। টাকা নেই, পুরস্কার নেই। পয়েন্ট কেনা বা ভাঙানো যায় না। শুধু ১৮+।</b>']],
      ['কে খেলতে পারবেন', ['বয়স ১৮ বা তার বেশি হতে হবে। একজন মানুষ ও একটি ফোন নম্বরে একটিই অ্যাকাউন্ট; বাড়তি অ্যাকাউন্ট বন্ধ ও তার পয়েন্ট বাদ হতে পারে। অন্য কারো হয়ে খেলবেন না।', '<b>বেটা চলাকালীন বাংলাদেশে থাকা কারো জন্য এটি চালু নেই।</b>']],
      ['পয়েন্ট', ['যোগ দিলে ১,০০০ পয়েন্ট। দিনে একবার ১০০ পয়েন্ট নিতে পারবেন; সাইটের ঘড়িতে মাঝরাতে সবার জন্য দিন বদলায়, না নেওয়া দিন জমে না।', 'পয়েন্টের কোনো টাকার মূল্য নেই। কখনো কেনা, বেচা, হস্তান্তর, কিছুর বদলে বিনিময় বা ভাঙানো যাবে না। অ্যাপের বাইরে অ্যাকাউন্ট বা পয়েন্ট লেনদেন করলে অ্যাকাউন্ট বন্ধ হবে। খেলা ন্যায্য রাখতে আমরা পয়েন্ট ও নিয়ম বদলাতে পারি।']],
      ['পুরস্কার নেই', ['কোনো ধরনের পুরস্কার নেই। লিডারবোর্ড শুধু স্বীকৃতির জন্য।']],
      ['প্রশ্ন ও দাম', ['প্রতিটি প্রশ্নে নিয়ম, শেষ হওয়ার সময় ও ফল ঠিক করার পাবলিক সূত্র দেখানো থাকে। দাম একটি সূত্রে ঠিক হয় ও মানুষের পূর্বাভাসে বদলায়; দাম মানে ভিড়ের অনুমান, তথ্য বা পরামর্শ নয়। এখানে কিছুই আর্থিক বা অন্য পেশাদার পরামর্শ নয়।']],
      ['ফল কীভাবে ঠিক হয়', ['প্রতিটি প্রশ্নের ফল তার নির্দিষ্ট সূত্র ও দেখানো নিয়ম মেনে ঠিক করা হয়। সূত্র অস্পষ্ট বা অনুপলব্ধ হলে, বা ঘটনা যেভাবে লেখা সেভাবে না ঘটলে, প্রশ্নটি বাতিল (N/A) করে খরচ করা পয়েন্ট ফেরত দিতে পারি।', 'ফল ভুল হলে আমরা ঠিক করে সবার পয়েন্ট আবার হিসাব করি। যে পয়েন্ট পাওয়ার কথা ছিল না তা খরচ করে ফেললে কিছুদিন পয়েন্ট বাকি থাকতে পারে; প্রতিদিনের টপ-আপের অর্ধেক ও নতুন জেতা পয়েন্ট দিয়ে তা শোধ হয়, তাই প্রতিদিন অন্তত ৫০ পয়েন্ট খেলার জন্য পাবেন। আপনাকে নোটিশ দেওয়া হবে।', 'ফল ঘোষণার ৪৮ ঘণ্টার মধ্যে ফল আবার দেখতে বলতে পারেন। কোনো পরিবর্তন অন্য একজন অ্যাডমিন যাচাই করেন। যাচাইয়ের পর সিদ্ধান্ত খেলার ভেতরে চূড়ান্ত।']],
      ['স্পনসর', ['স্পনসরদের ফলের ওপর কোনো হাত নেই এবং তারা আপনার তথ্য দেখে না। বাজি, মোবাইল-মানি বা ক্রিপ্টো ব্যবসার স্পনসর আমরা কখনো নিই না।']],
      ['আচরণ', ['ঘৃণা, হয়রানি, যৌন বিষয়, নির্বাচন বা রাজনীতি, ভুল তথ্য বা অন্যের ব্যক্তিগত তথ্য পোস্ট করবেন না। বট, স্ক্রিপ্ট, একাধিক অ্যাকাউন্ট বা দল দিয়ে দাম বা র‍্যাঙ্ক সরাবেন না, অ্যাপে আক্রমণ বা জুয়ার প্রচার করবেন না। আমরা লেখা বা অন্যায়ভাবে পাওয়া পয়েন্ট সরাতে, নাম লুকাতে বা অ্যাকাউন্ট বন্ধ করতে পারি।']],
      ['অ্যাকাউন্ট বন্ধ', ['"আমার তথ্য" থেকে যেকোনো সময় অ্যাকাউন্ট মুছতে পারেন। শর্ত ভাঙলে আমরা অ্যাকাউন্ট বন্ধ, বা সম্ভব হলে আগে জানিয়ে খেলা বন্ধ করতে পারি। অ্যাকাউন্ট বা খেলা বন্ধ হলে পয়েন্টও শেষ; ফেরত দেওয়ার মতো কোনো মূল্য নেই।']],
      ['দায়, আইন, পরিবর্তন', ['অ্যাপটি যেমন আছে তেমন দেওয়া হচ্ছে; আমরা চেষ্টা করি, তবে সবসময় চালু বা নির্ভুল থাকার নিশ্চয়তা দিতে পারি না। [দায়ের সীমা, প্রযোজ্য আইন ও আদালত: আইনজীবীর জন্য।] গুরুত্বপূর্ণ পরিবর্তনের আগে অ্যাপে জানাব।']],
      ['যোগাযোগ', ['[ইমেইল], এবং মতামত বাটন।']]
    ] }
  };
  function t(k, vars) {
    var s = (T[lang][k] != null ? T[lang][k] : T.en[k]) || k;
    if (vars) for (var v in vars) s = s.replace('{' + v + '}', vars[v]);
    return s;
  }
  var BN = '০১২৩৪৫৬৭৮৯';
  function dig(s) { s = String(s); return lang === 'bn' ? s.replace(/\d/g, function (d) { return BN[d]; }) : s; }
  // South Asian grouping: 1,23,456
  function num(n) {
    n = Math.round(n); var neg = n < 0, s = String(Math.abs(n)), out = s.slice(-3); s = s.slice(0, -3);
    while (s.length) { out = s.slice(-2) + ',' + out; s = s.slice(0, -2); }
    return dig((neg ? '-' : '') + out);
  }
  function pct(p) { return dig(Math.round(p * 100)) + '%'; }
  var MON = { bn: ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
  var site = null;
  try { site = JSON.parse(sget('dp-site')); } catch (e) {}
  // Dates show in the market's own timezone (A34), else the site's.
  // Dates and times show in the player's own timezone (the phone's clock), per the design review.
  function date(ms) { var d = new Date(ms); return dig(d.getDate()) + ' ' + MON[lang][d.getMonth()] + ' ' + dig(d.getFullYear()); }
  function clock(ms) { var d = new Date(ms), h = d.getHours(), m = d.getMinutes(); return dig((h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m) + (lang === 'bn' ? (h < 12 ? ' এএম' : ' পিএম') : (h < 12 ? ' am' : ' pm')); }
  // Short timezone name for the viewer's clock (e.g. GMT+6, BST), so a deadline is never ambiguous.
  function tzl(ms) { try { var p = new Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(new Date(ms)).filter(function (x) { return x.type === 'timeZoneName'; })[0]; return p ? ' ' + p.value : ''; } catch (e) { return ''; } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function tx(o) { return esc(o[lang] || o.en); }

  // ---- api: server or in-browser -------------------------------------------------
  var token = sget('dp-token');
  var local = null;
  if (LOCAL) {
    try { local = JSON.parse(sget('dp-a-state')); } catch (e) {}
    if (!local || local.v !== 1) {
      local = Core.seed(Date.now(), { demo: true });
      Core.addUser(local, 'me', lang === 'bn' ? 'আপনি' : 'You', Date.now(), { admin: true });
    }
  }
  // Response cache for offline reading: public reads only, and only while logged out. Anything that
  // depends on the token (me, inbox, auditall, metrics, users, account, social...) is never stored.
  var PUBLIC_READS = { home: 1, market: 1, leaders: 1 };
  function clearCaches() {
    try {
      var ks = [], i, k;
      for (i = 0; i < localStorage.length; i++) { k = localStorage.key(i); if (k && k.indexOf('dp-c:') === 0) ks.push(k); }
      ks.forEach(function (x) { localStorage.removeItem(x); });
    } catch (e) {}
  }
  function api(name, args) {
    if (LOCAL) {
      return new Promise(function (ok, bad) {
        try {
          var r = Core.act(local, 'me', name, args || {}, Date.now()); if (Core.isWrite(name)) sset('dp-a-state', JSON.stringify(local));
          if (r.site) site = r.site;
          ok(JSON.parse(JSON.stringify(r)));
        }
        catch (e) { bad(e); }
      });
    }
    var write = name === 'auth' || name === 'chphone' || name === 'delete' || name === 'logout' || name === 'gcreate' || name === 'gjoin' || name === 'gleave' || name === 'resetpw' || name === 'usereset' || name === 'otpsend' || name === 'otpverify' || Core.isWrite(name), key = 'dp-c:' + name + ':' + JSON.stringify(args || {}), cacheable = !write && !token && PUBLIC_READS[name] === 1;
    var url = '/api/' + name + (!write && args ? '?' + Object.keys(args).map(function (k) { return k + '=' + encodeURIComponent(args[k]); }).join('&') : '');
    var opt = { method: write ? 'POST' : 'GET', headers: {} };
    if (token) opt.headers.Authorization = 'Bearer ' + token;
    if (write) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(args || {}); }
    return fetch(url, opt).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) { var e = new Error(j.error); e.code = j.error; if (r.status === 401 && token) { token = null; sdel('dp-token'); clearCaches(); } throw e; }
        if (cacheable) sset(key, JSON.stringify(j)); // last copy, for offline reading
        if (j.site) { site = j.site; sset('dp-site', JSON.stringify(site)); }
        return j;
      });
    }, function () {
      var cached = cacheable && sget(key);
      if (cached) { stale = true; return JSON.parse(cached); }
      var e = new Error('net'); e.code = 'net'; throw e;
    });
  }
  var stale = false;

  // ---- ui bits --------------------------------------------------------------------
  var toastTimer;
  function toast(msg) {
    var el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }
  function errText(e) { var k = 'e_' + (e && e.code); return t(k) !== k ? t(k) : t('e_other'); } // never show a raw key
  function fail(e) { toast(errText(e)); }
  function online() { return LOCAL || navigator.onLine !== false; }

  function spark(vals) {
    if (vals.length < 2) return '';
    var n = vals.length, pts = vals.map(function (v, i) { return (i * 64 / (n - 1)).toFixed(1) + ',' + (19 - v * 0.18).toFixed(1); }).join(' ');
    var up = vals[n - 1] >= vals[0];
    return '<svg class="spark" viewBox="0 0 64 20" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="var(--' + (up ? 'yes' : 'no') + ')" stroke-width="1.6"/></svg>';
  }
  function chart(hist) {
    var W = 320, H = 130, L = 28, R = 8, Tp = 8, B = 20, n = hist.length;
    if (n < 2) return '';
    var t0 = hist[0][0], t1 = hist[n - 1][0] || t0 + 1, span = Math.max(1, t1 - t0);
    var x = function (ts) { return L + (ts - t0) / span * (W - L - R); }, y = function (p) { return Tp + (1 - p) * (H - Tp - B); };
    var line = hist.map(function (h) { return x(h[0]).toFixed(1) + ',' + y(h[1]).toFixed(1); }).join(' ');
    var g = '';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)" stroke-width="' + (v === 0.5 ? 1 : 0.6) + '"/>' +
        '<text x="' + (L - 4) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + pct(v) + '</text>';
    });
    var last = hist[n - 1];
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + t('chance') + '">' + g +
      '<polygon points="' + L + ',' + y(0) + ' ' + line + ' ' + x(last[0]).toFixed(1) + ',' + y(0) + '" fill="var(--brand)" fill-opacity=".1"/>' +
      '<polyline points="' + line + '" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round"/>' +
      '<circle cx="' + x(last[0]) + '" cy="' + y(last[1]) + '" r="3.5" fill="var(--brand)"/>' +
      '<text x="' + L + '" y="' + (H - 4) + '">' + date(t0) + '</text><text x="' + (W - R) + '" y="' + (H - 4) + '" text-anchor="end">' + date(t1) + '</text></svg>';
  }

  var me = null;
  function header() {
    $('#title').textContent = site ? tx(site.name) : t('app');
    document.title = site ? site.name.en : 'Dhaka Predicts';
    $('#pts').textContent = me ? num(me.pts) + ' ' + t('pts') + (me.debt > 0 ? ' · ' + t('shortfall') + ' ' + num(me.debt) : '') : '';
    $('#lang').textContent = lang === 'bn' ? 'EN' : 'বাং';
    $('#help').textContent = t('help'); $('#fbh').textContent = t('fb_title'); $('#fbtext').placeholder = t('fb_ph');
    $('#fbsend').textContent = t('send'); $('#fbclose').textContent = t('close');
    document.documentElement.lang = lang;
    var tabs = [['', 'markets', '<path d="M3 20h18M6 16V9M11 16V5M16 16v-5"/>'], ['me', 'mine', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'], ['top', 'top', '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/>']];
    var r = route().name;
    $('#tabs').innerHTML = tabs.map(function (x) {
      var cur = (x[0] === '' && (r === 'home' || r === 'market')) || x[0] === r;
      return '<a href="#' + (x[0] || 'home') + '"' + (cur ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true">' + x[2] + '</svg>' + t(x[1]) + '</a>';
    }).join('');
  }
  function banners() {
    var b = '';
    if (stale || !online()) b += '<div class="banner">' + t('offline') + '</div>';
    if (LOCAL) b += '<div class="banner"><span>' + t('demo') + '</span><button class="ghost" id="reset" type="button">' + t('reset') + '</button></div>';
    if (me && me.notices && me.notices.length) b += me.notices.map(function (n) {
      if (n.kind === 'adjust') return '<div class="banner"><span>' + t('adj_notice', { p: (n.amount > 0 ? '+' : '') + num(n.amount), r: esc(n.reason) }) + '</span></div>';
      return '<div class="banner"><span>' + t('notice', { q: tx(n.q), a: oname(n.from), b: oname(n.to), p: num(Math.abs(n.amount)), dir: t(n.amount < 0 ? 'taken' : 'given') }) + '</span></div>';
    }).join('').replace(/<\/div>$/, '<button class="ghost" id="ack" type="button">' + t('ok') + '</button></div>');
    if (me && me.debt > 0) b += '<div class="banner"><span>' + t('debt_line', { d: num(me.debt) }) + '</span></div>';
    if (me && me.bonusReady && online()) b += '<div class="banner"><span>' + t('bonus') + '</span><button class="ghost" id="bonus" type="button">' + t('take') + '</button></div>';
    return b;
  }

  // ---- views ------------------------------------------------------------------------
  var cat = sget('dp-cat') || 'all';
  var V = {};
  // Optional sponsor line (admin sets it under Sponsor line). Always labelled; no points or prizes attach to it.
  function sponsorLine() {
    var sp = site && site.sponsor; if (!sp) return '';
    var txt = esc(sp[lang] || sp.en);
    return '<p class="muted small"><span class="tag">' + t('sp_tag') + '</span> ' + (sp.url ? '<a href="' + esc(sp.url) + '" target="_blank" rel="sponsored noopener">' + txt + '</a>' : txt) + '</p>';
  }
  V.home = function () {
    return api('home').then(function (d) {
      me = d.me; if (d.signupOpen != null) signupOpen = d.signupOpen; if (d.otp != null) otpOn = !!d.otp;
      var cats = ['all'];
      d.markets.forEach(function (m) { if (cats.indexOf(m.cat) < 0) cats.push(m.cat); });
      var list = d.markets.filter(function (m) { return cat === 'all' || m.cat === cat; });
      list.sort(function (a, b) { return (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || a.closes - b.closes; });
      return banners() +
        '<div class="chips" role="group">' + cats.map(function (c) { return '<button class="chip" type="button" data-cat="' + c + '" aria-pressed="' + (c === cat) + '">' + t(c) + '</button>'; }).join('') + '</div>' +
        list.map(function (m) {
          var st = m.status === 'open' ? t('closes_at', { d: date(m.closes), t: clock(m.closes) }) : m.status === 'proposed' ? '<span class="tag">' + t('proposed') + ': ' + oname(m.proposal.out) + '</span>' : m.status === 'resolved' ? '<span class="tag">' + t('outcome') + ': ' + oname(m.outcome) + '</span>' : '<span class="tag">' + t('closed') + '</span>';
          return '<a class="mk" href="#m-' + m.id + '"><span class="q">' + tx(m.q) + '</span><span class="pct">' + pct(m.p) + '<small>' + t('yes') + '</small></span>' +
            '<span class="meta"><span class="tag">' + t(m.cat) + '</span>' + spark(m.spark) + '<span>' + st + '</span><span>' + num(m.traders) + ' ' + t('traders') + '</span></span></a>';
        }).join('') + '<p class="muted small">' + t('free') + '</p>' + sponsorLine();
    });
  };

  var trade = { side: 'y', amount: 50, mode: 'buy' };
  V.market = function (id) {
    return api('market', { id: id }).then(function (m) {
      me = m.me; V._m = m;
      if (m.status === 'resolved' && m.myBook) api('track', { e: 'resolution_seen', id: m.id }).catch(function () {});
      var open = m.status === 'open', mine = m.mine, py = Core.priceYes(m.b, m.qy, m.qn);
      var h = banners() + '<div class="card"><a href="#home" class="small">← ' + t('back') + '</a><h2>' + tx(m.q) + '</h2>' +
        (m.status === 'resolved' ? '' : '<div class="big"><b>' + pct(py) + '</b><span class="muted">' + t('chance') + ' "' + t('yes') + '"</span></div>') + chart(m.hist) +
        '<div class="meta"><span class="tag">' + t(m.cat) + '</span><span class="tag">' + (m.cities && m.cities[m.city] ? tx(m.cities[m.city].name) : esc(m.city)) + '</span><span>' + t('closes_at', { d: date(m.closes), t: clock(m.closes) }) + '</span><span>' + num(m.vol) + ' ' + t('vol') + '</span><span>' + num(m.traders) + ' ' + t('traders') + '</span></div></div>';
      if (m.status === 'resolved') h += resultCard(m); else if (m.status === 'proposed') h += proposedCard(m); else if (open) {
        h += '<div class="card" id="trade"><div class="sides">' +
          '<button class="side y" type="button" data-side="y" aria-pressed="' + (trade.side === 'y') + '">' + t('yes') + '<small>' + pct(py) + '</small></button>' +
          '<button class="side n" type="button" data-side="n" aria-pressed="' + (trade.side === 'n') + '">' + t('no') + '<small>' + pct(1 - py) + '</small></button></div>' +
          '<label for="amt">' + t('amount') + '<span class="amt"><input id="amt" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="' + trade.amount + '"></span></label>' +
          '<div class="quick">' + [10, 50, 100, 250].map(function (v) { return '<button type="button" data-amt="' + v + '">' + dig(v) + '</button>'; }).join('') + '</div>' +
          '<div class="est" id="est"></div><button class="go ' + trade.side + '" id="buy" type="button"' + (online() ? '' : ' disabled') + '>' + t(trade.side === 'y' ? 'buy_yes' : 'buy_no') + '</button></div>';
      } else {
        h += '<div class="card"><span class="tag">' + t('closed') + '</span></div>';
      }
      if (mine && (mine.y > 0.005 || mine.n > 0.005)) {
        h += '<div class="card"><h3>' + t('your_pos') + '</h3><div class="list">' + ['y', 'n'].filter(function (s) { return mine[s] > 0.005; }).map(function (s) {
          var val = open ? Core.proceedsFor(m, s, mine[s]) : 0;
          return '<div class="row"><span><b style="color:var(--' + (s === 'y' ? 'yes' : 'no') + ')">' + t(s === 'y' ? 'yes' : 'no') + '</b> · ' + t('if_right', { n: num(mine[s]) }) + '</span>' +
            '<span class="muted small">' + t('worth_now') + ' ' + num(val) + '</span>' + (open ? '<button class="ghost" type="button" data-sell="' + s + '"' + (online() ? '' : ' disabled') + '>' + t('sell_all') + '</button>' : '') + '</div>';
        }).join('') + '</div>' + (open ? '<button class="ghost" type="button" data-shcall="' + (mine.y >= mine.n ? 'y' : 'n') + '">' + t('share_call') + '</button>' : '') + '</div>';
      }
      h += '<div class="card"><h3>' + t('source') + '</h3><p style="margin:0">' + t('source_line', { s: tx(m.src) }) + '</p><p class="muted small" style="margin:0">' + t('rules') + '</p></div>';
      if (me && me.admin && open) {
        h += '<details class="card"><summary>' + t('admin') + '</summary><label for="rnote">' + t('res_value') + '<input id="rnote" placeholder="' + t('note_ph') + '"></label>' +
          '<label for="rlink">' + t('source') + '<input id="rlink" type="url" placeholder="' + t('link_ph') + '"></label>' +
          '<label for="rwin">' + t('window') + '<select id="rwin" class="sel"><option value="24">' + t('hours', { n: dig(24) }) + '</option><option value="48">' + t('hours', { n: dig(48) }) + '</option><option value="0">' + t('no_window') + '</option></select></label>' +
          '<div class="sides"><button class="ghost" type="button" data-settle="y">' + t('settle_y') + '</button><button class="ghost" type="button" data-settle="n">' + t('settle_n') + '</button></div>' +
          '<button class="ghost" type="button" data-settle="na">' + t('settle_na') + '</button></details>';
      }
      if (me && me.admin && m.tpl) h += '<button class="ghost" type="button" data-repeat="' + esc(m.id) + '">' + t('repeat') + '</button>';
      return h;
    });
  };
  function oname(o) { return t(o === 'y' ? 'yes' : o === 'n' ? 'no' : 'na'); }
  function ocolor(o) { return o === 'y' ? 'yes' : o === 'n' ? 'no' : 'muted'; }
  function disputeForm(m) {
    return '<details><summary>' + t('dispute') + '</summary><form id="disp" style="display:flex;flex-direction:column;gap:8px;padding-top:8px">' +
      '<label for="dwhy">' + t('dispute_why') + '<input id="dwhy" required minlength="5" maxlength="500"></label>' +
      '<label for="dlink">' + t('dispute_link') + '<input id="dlink" type="url" placeholder="https://"></label>' +
      '<button class="go" type="submit">' + t('send') + '</button><p class="small muted" style="margin:0">' + t('dispute_until', { d: date(m.disputeUntil) + ', ' + clock(m.disputeUntil) }) + '</p></form></details>';
  }
  function proposedCard(m) {
    var pr = m.proposal, h = '<div class="card"><h3>' + t('proposed') + '</h3><b style="font-size:28px;line-height:1.1;color:var(--' + ocolor(pr.out) + ')">' + oname(pr.out) + '</b>';
    if (pr.note) h += '<div class="row"><span class="muted">' + t('res_value') + '</span><b>' + esc(pr.note) + '</b></div>';
    if (pr.link) h += '<a class="small" href="' + esc(pr.link) + '" target="_blank" rel="noopener">' + esc(pr.link) + '</a>';
    h += '<p class="small" style="margin:0">' + t('proposed_line', { d: date(pr.until) + ', ' + clock(pr.until) + tzl(pr.until) }) + '</p>';
    if (m.disputes) h += '<p class="small muted" style="margin:0">' + t('dispute_open', { n: dig(m.disputes) }) + '</p>';
    if (m.myDispute) h += '<p class="small muted" style="margin:0">' + t('you_disputed') + '</p>';
    if (m.canDispute) h += disputeForm(m);
    var early = Date.now() < pr.until, canNow = me && me.admin && !m.disputes && !(pr.mine && (early || pr.short));
    if (me && me.admin) h += '<div class="sides">' + (canNow ? '<button class="ghost" type="button" data-final="' + (early ? 'early' : '1') + '">' + t('settle_now') + '</button>' : '') + '<button class="ghost" type="button" data-retract="1">' + t('retract') + '</button></div>';
    return h + '</div>';
  }
  function resultCard(m) {
    var h = '<div class="card"><h3>' + t('res_card') + '</h3><b style="font-size:28px;line-height:1.1;color:var(--' + ocolor(m.outcome) + ')">' + oname(m.outcome) + '</b>';
    if (m.note) h += '<div class="row"><span class="muted">' + t('res_value') + '</span><b>' + esc(m.note) + '</b></div>';
    if (m.link) h += '<a class="small" href="' + esc(m.link) + '" target="_blank" rel="noopener">' + esc(m.link) + '</a>';
    h += '<p class="small" style="margin:0">' + (m.outcome === 'na' ? t('res_refund') : t('res_paid', { p: num(m.totalPaid), h: num(m.holders) })) + '</p>';
    if (m.myPaid != null) h += '<p style="margin:0"><b>' + t('res_mine', { p: num(m.myPaid) }) + '</b></p>';
    if (m.myPaid != null && m.myBook && m.outcome !== 'na' && m.myPaid > m.myBook.spent && m.myBook[m.outcome] > 0) h += '<button class="ghost" type="button" data-shwon="1">' + t('share') + '</button>';
    if (m.review) h += '<p class="small" style="margin:0">' + (m.review.changed ? t('reviewed_changed', { a: oname(m.review.from), b: oname(m.review.to) }) : t('reviewed_kept')) + '</p>';
    else if (m.disputes) h += '<p class="small muted" style="margin:0">' + t('dispute_open', { n: dig(m.disputes) }) + '</p>';
    if (m.myDispute) h += '<p class="small muted" style="margin:0">' + t('you_disputed') + '</p>';
    if (m.pending) h += '<p class="small" style="margin:0">' + t('pending_fix', { o: oname(m.pending.to) }) + '</p>';
    if (m.canDispute) h += disputeForm(m);
    return h + '</div>';
  }
  function updateEst() {
    var m = V._m, el = $('#est'); if (!m || !el) return;
    var a = Math.floor(Number(String($('#amt').value).replace(/[০-৯]/g, function (d) { return BN.indexOf(d); })));
    trade.amount = a;
    var btn = $('#buy');
    if (!(a > 0)) { el.textContent = ''; btn.disabled = true; return; }
    var sh = Core.sharesFor(m, trade.side, a);
    el.innerHTML = t('est', { s: '<b>' + num(sh) + '</b>', w: '<b>' + num(sh) + '</b>' }) + (me && a > me.pts ? ' <b style="color:var(--no)">' + t('e_no_points') + '</b>' : '');
    btn.disabled = !online() || (me && a > me.pts);
  }

  V.me = function () {
    if (!LOCAL && !token) return V.login();
    return api('me').then(function (d) {
      me = d.me;
      var inPlay = 0; d.rows.forEach(function (r) { if (r.status === 'open') inPlay += r.value; });
      var h = banners() + '<div class="card"><h2>' + esc(me.name) + '</h2><div class="stats"><div><b>' + num(me.worth) + '</b><span>' + t('worth') + '</span></div><div><b>' + num(me.pts) + '</b><span>' + t('cash') + '</span></div><div><b>' + num(inPlay) + '</b><span>' + t('in_play') + '</span></div></div></div>';
      h += '<div class="card">' + (d.rows.length ? '<div class="list">' + d.rows.map(function (r) {
        var tag = r.status === 'resolved' ? (r.outcome === 'na' ? '<span class="tag">' + t('na') + ' · ' + num(r.value) + '</span>' : r.value > 0 ? '<span class="tag won">' + t('won') + ' ' + num(r.value) + '</span>' : '<span class="tag lost">' + t('lost_n', { n: num(r.spent) }) + '</span>') : '';
        var holds = (r.y ? t('yes') + ': ' + t('if_right', { n: num(r.y) }) : '') + (r.y && r.n ? ' · ' : '') + (r.n ? t('no') + ': ' + t('if_right', { n: num(r.n) }) : '');
        return '<a href="#m-' + r.id + '" style="color:inherit;text-decoration:none"><div class="row"><span>' + tx(r.q) + '</span></div><div class="row small muted"><span>' + holds + '</span><span>' + (tag || t('worth_now') + ' <b style="color:var(--ink)">' + num(r.value) + '</b>') + '</span></div></a>';
      }).join('') + '</div>' : '<p class="muted" style="margin:0">' + t('none_yet') + '</p>') + '</div>';
      h += groupsLink();
      h += '<a class="ghost" href="#account" style="display:flex;align-items:center;justify-content:center;text-decoration:none">' + t('account') + '</a>';
      if (me.admin) h += '<a class="ghost" href="#admin" style="display:flex;align-items:center;justify-content:center;text-decoration:none">' + t('inbox') + '</a>';
      if (!LOCAL) h += '<button class="ghost" type="button" id="logout">' + t('logout') + '</button>';
      return h;
    });
  };

  var lg = sget('dp-lg') || 'all';
  V.top = function () {
    var chips = '<div class="chips">' + ['all', 'week', 'friends', 'groups'].map(function (k) {
      return '<button class="chip" type="button" data-lg="' + k + '" aria-pressed="' + (lg === k) + '">' + t({ all: 'all_time', week: 'this_week', friends: 'friends', groups: 'groups' }[k]) + '</button>';
    }).join('') + '</div>';
    if (lg === 'friends' && !LOCAL && !token) return Promise.resolve(chips + '<div class="card"><p class="muted" style="margin:0">' + t('friends_empty') + '</p><a class="go" href="#login" style="display:flex;align-items:center;justify-content:center;text-decoration:none">' + t('login') + '</a></div>');
    if (lg !== 'all') return api('league', { kind: lg }).then(function (d) {
      if (lg === 'groups') return chips + '<div class="card"><div class="list">' + (d.top.length ? d.top.map(function (g) {
        return '<div class="row' + (g.mine ? ' me-row' : '') + '"><span>' + (g.rank ? '<span class="muted">' + dig(g.rank) + '.</span> ' : '') + esc(g.name) + ' <span class="small muted">' + t('members', { n: dig(g.size) }) + '</span></span><span class="small muted">' + (g.rank ? t('avg_week') + ' <b style="color:var(--ink)">' + signed(g.avg) + '</b>' : t('unranked')) + '</span></div>';
      }).join('') : '<p class="muted" style="margin:0">' + t('no_groups') + '</p>') + '</div></div>' + groupsLink();
      if (lg === 'friends' && d.total <= 1) return chips + '<div class="card"><p class="muted" style="margin:0">' + t('friends_empty') + '</p></div>' + groupsLink();
      return chips + '<div class="card"><h3>' + t('rank') + ': ' + (d.myRank ? dig(d.myRank) + ' / ' + dig(d.total) : '–') + '</h3><div class="list">' + d.top.filter(function (r) { return !r.bot; }).map(function (r) {
        return '<div class="row' + (r.me ? ' me-row' : '') + '"><span><span class="muted">' + dig(r.rank) + '.</span> ' + esc(r.name) + '</span><b>' + (lg === 'week' ? signed(r.week) : num(r.worth)) + '</b></div>';
      }).join('') + '</div></div>' + (lg === 'friends' ? groupsLink() : '');
    });
    return api('leaders').then(function (d) {
      return chips + '<div class="card"><h3>' + t('rank') + ': ' + (d.myRank ? dig(d.myRank) + ' / ' + dig(d.total) : '–') + '</h3><div class="list">' + d.top.map(function (r) {
        var isMe = me && r.id === me.id;
        return '<div class="row' + (isMe ? ' me-row' : '') + '"><span><span class="muted">' + dig(r.rank) + '.</span> ' + esc(r.name) + (r.bot ? ' <span class="tag">' + t('sample') + '</span>' : '') + '</span><b>' + num(r.worth) + '</b></div>';
      }).join('') + '</div></div>' + groupsLink();
    });
  };
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n)); }
  function groupsLink() { return '<a class="ghost" href="#groups" style="display:flex;align-items:center;justify-content:center;text-decoration:none">' + t('my_groups') + '</a>'; }

  // Groups (Rival B port, A13/A23): invite codes, member boards. Nothing of value for joining or inviting.
  V.groups = function () {
    if (!LOCAL && !token) { sset('dp-after', 'groups'); return V.login(); }
    return api('social').then(function (d) {
      V._groups = d.groups;
      var h = '<div class="card"><div class="row"><b>' + (d.streak ? t('streak_now', { n: dig(d.streak) }) : (d.bonusReady === false ? t('streak_wait') : t('streak_none'))) + '</b>' + (d.best ? '<span class="small muted">' + t('streak_best', { n: dig(d.best) }) + '</span>' : '') + '</div></div>' +
        '<div class="card"><h2>' + t('my_groups') + '</h2><p class="small muted" style="margin:0">' + t('g_intro') + '</p></div>';
      h += d.groups.length ? d.groups.map(function (g) {
        return '<div class="card"><div class="row"><h2>' + esc(g.name) + '</h2><span class="tag">' + esc(g.code) + '</span></div><p class="small muted" style="margin:0">' + t('members', { n: dig(g.members.length) }) + '</p><div class="list">' +
          g.members.map(function (x, i) { return '<div class="row' + (x.me ? ' me-row' : '') + '"><span><span class="muted">' + dig(i + 1) + '.</span> ' + esc(x.name) + '</span><span class="small muted">' + signed(x.week) + ' ' + t('week_gain') + ' · <b style="color:var(--ink)">' + num(x.worth) + '</b></span></div>'; }).join('') +
          '</div><div class="sides"><button class="ghost" type="button" data-gcopy="' + esc(g.code) + '">' + t('copy_invite') + '</button><button class="ghost" type="button" data-gcard="' + esc(g.code) + '">' + t('invite_card') + '</button></div>' +
          '<button class="ghost" type="button" data-gleave="' + esc(g.code) + '">' + t('leave') + '</button></div>';
      }).join('') : '<div class="card"><p class="muted" style="margin:0">' + t('no_groups') + '</p></div>';
      h += '<form class="card" id="gjoin"><h3>' + t('g_join') + '</h3><label for="gcode">' + t('g_code_l') + '<input id="gcode" required maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="' + t('g_code') + '"></label><button class="go" type="submit">' + t('join') + '</button></form>';
      h += '<form class="card" id="gnew"><h3>' + t('g_new') + '</h3><label for="gname">' + t('g_name') + '<input id="gname" required minlength="2" maxlength="32"></label><button class="go" type="submit">' + t('g_create') + '</button></form>';
      return h;
    });
  };
  // Invite links are #j-CODE: join after sign-up, then land on the groups page.
  V.join = function (code) {
    if (!LOCAL && !token) { sset('dp-after', 'j-' + code); return V.login(); }
    return api('gjoin', { code: code }).then(function (r) { toast(t('g_joined', { g: r.name })); location.replace('#groups'); return ''; });
  };

  // Share cards (Rival B port). share.js is only fetched the first time someone shares.
  function withShare() {
    if (window.DPShare) return Promise.resolve(window.DPShare);
    return new Promise(function (ok, bad) { var el = document.createElement('script'); el.src = '/share.js'; el.onload = function () { ok(window.DPShare); }; el.onerror = bad; document.head.appendChild(el); });
  }
  function shareCard(spec) {
    spec.brand = site ? (site.name[lang] || site.name.en) : undefined;
    spec.url = spec.url || (LOCAL ? undefined : location.origin + '/');
    if (me && !spec.who) spec.who = me.name;
    return withShare().then(function (S) { return S.share(spec, lang); }).then(function (r) {
      if (!r || !r.fallback) return;
      V._cap = r.caption;
      var sh = $('#sharesheet');
      if (!sh) { sh = document.createElement('div'); sh.id = 'sharesheet'; sh.className = 'sheet'; document.body.appendChild(sh); }
      sh.innerHTML = '<div class="card"><img src="' + r.fallback + '" alt="" style="width:100%;max-height:55vh;object-fit:contain;border-radius:8px"><p class="small muted" style="margin:0">' + t('long_press') + '</p>' +
        '<div class="sides"><button class="ghost" type="button" id="shclose">' + t('close') + '</button><button class="go" type="button" id="shcopy">' + t('copy_caption') + '</button></div></div>';
      sh.hidden = false;
    }, fail);
  }
  function copyText(s) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s).then(function () { toast(t('copied')); }, function () { prompt('', s); });
    prompt('', s);
  }

  // First-20 retention (gtm/first-20-users.md): rates, one row per player, and a CSV in the tracker's columns.
  var COLS = ['id', 'name', 'signed_up', 'first_prediction', 'predictions_d7', 'categories_d7', 'saw_resolution_d7', 'returned_d1', 'returned_d3', 'returned_d7', 'returned_d14', 'activated', 'active_week2'];
  function yn(v) { return v == null ? '' : v === true ? 'y' : v === false ? 'n' : String(v); }
  function retention(k) {
    if (!k.cohort) return '';
    V._cohort = k.cohort;
    var R = k.returns, rate = function (x) { return x.of ? dig(x.yes) + '/' + dig(x.of) : '–'; };
    return '<h3 style="margin-top:8px">' + t('m_ret') + '</h3><div class="list small">' +
      [['D1', R.returned_d1], ['D3', R.returned_d3], ['D7', R.returned_d7], ['D14', R.returned_d14], [t('m_w2'), R.active_week2]].map(function (r) { return '<div class="row"><span>' + r[0] + '</span><b>' + rate(r[1]) + '</b></div>'; }).join('') +
      '</div><div style="overflow-x:auto"><table class="small" style="border-collapse:collapse;white-space:nowrap"><tr>' + ['name', 'signed_up', 'predictions_d7', 'categories_d7', 'saw_resolution_d7', 'returned_d1', 'returned_d3', 'returned_d7', 'returned_d14', 'activated', 'active_week2'].map(function (c) { return '<th style="text-align:left;padding:2px 6px">' + c.replace('returned_', '').replace('_d7', '') + '</th>'; }).join('') + '</tr>' +
      k.cohort.map(function (r) { return '<tr>' + ['name', 'signed_up', 'predictions_d7', 'categories_d7', 'saw_resolution_d7', 'returned_d1', 'returned_d3', 'returned_d7', 'returned_d14', 'activated', 'active_week2'].map(function (c) { return '<td style="padding:2px 6px;border-top:1px solid var(--line)">' + esc(yn(r[c])) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</table></div><button class="ghost" type="button" id="csv">' + t('m_csv') + '</button>';
  }
  function csvDownload() {
    var q = function (v) { v = yn(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var text = COLS.join(',') + '\n' + (V._cohort || []).map(function (r) { return COLS.map(function (c) { return q(r[c]); }).join(','); }).join('\n') + '\n';
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = 'retention-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // Full audit log as CSV (UTF-8 with BOM so Excel reads Bangla). Cells that start with = + - @ get a leading ' so a spreadsheet never runs them as formulas.
  function auditCsv() {
    return api('auditall').then(function (r) {
      var q = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var rows = r.audit.map(function (x) { var a = x.args || {}; return [new Date(x.at).toISOString(), x.by, x.name, x.action, a.user, a.market, JSON.stringify(a)].map(q).join(','); });
      if (r.truncated) rows.push(['#', '', '', 'truncated', '', '', 'The log is capped at ' + r.cap + ' entries; ' + r.dropped + ' older entries were dropped and are not in this file'].map(q).join(','));
      var text = '\ufefftime_utc,admin_uid,admin,action,target_user,market,details\n' + rows.join('\n') + '\n';
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = 'audit-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
    }, fail);
  }

  V.admin = function () {
    return Promise.all([api('inbox'), api('metrics')]).then(function (both) {
      var d = both[0], k = both[1];
      d.templates = d.templates || both[1].templates;
      me = d.me;
      var pc = function (n) { return k.players ? ' (' + dig(Math.round(n / k.players * 100)) + '%)' : ''; };
      var mh = '<details class="card" open><summary>' + t('metrics') + '</summary><div class="list small">' +
        [['m_players', num(k.players)], ['m_act', num(k.activated) + pc(k.activated)], ['m_first', num(k.first24) + pc(k.first24)], ['m_wau', num(k.weeklyActive) + pc(k.weeklyActive)], ['m_ppa', dig(k.predsPerActive)]].map(function (r) {
          return '<div class="row"><span>' + t(r[0]) + '</span><b>' + r[1] + '</b></div>';
        }).join('') + '<div class="muted">' + esc(Object.keys(k.events).map(function (e) { return e + ' ' + k.events[e]; }).join(' · ')) + '</div>' +
        (k.deviceFlags.length ? '<div><b>' + t('m_flags') + ':</b> ' + k.deviceFlags.map(function (g) { return esc(g.join(', ')); }).join(' | ') + '</div>' : '') + '</div>' + retention(k) + '</details>';
      var ph = d.proposed.length ? '<div class="card"><h3>' + t('proposed') + '</h3><div class="list">' + d.proposed.map(function (x) {
        return '<div class="row"><a href="#m-' + x.id + '">' + tx(x.q) + '</a><span class="small">' + oname(x.out) + ' · ' + date(x.until) + ', ' + clock(x.until) + tzl(x.until) + (x.disputes ? ' · ' + t('disputes') + ' ' + dig(x.disputes) : '') + (x.overdue ? ' <span class="tag" style="background:var(--no);color:#fff">' + t('overdue') + '</span>' : x.soon ? ' <span class="tag">' + t('soon') + '</span>' : '') + (x.needs ? ' <span class="tag">' + t('need_' + x.needs) + '</span>' : '') + '</span></div>';
      }).join('') + '</div></div>' : '';
      var tpls = d.templates || {};
      var dh = '<details class="card"><summary>' + t('daily') + '</summary><form id="openq" style="display:flex;flex-direction:column;gap:8px;padding-top:8px">' +
        '<label for="qtpl">' + t('template') + '<select id="qtpl" class="sel">' + Object.keys(tpls).map(function (k) { return '<option value="' + k + '">' + k.toUpperCase() + ': ' + esc(tpls[k][lang === 'bn' ? 'bn' : 'en'].slice(0, 60)) + '</option>'; }).join('') + '</select></label>' +
        '<label for="qx">' + t('threshold') + '<input id="qx" inputmode="decimal"></label><label for="qdate">' + t('settle_day') + '<input id="qdate" type="date" required></label>' +
        '<button class="go" type="submit">' + t('create') + '</button></form></details>';
      var uh = '<details class="card"' + (V._users ? ' open' : '') + '><summary>' + t('players') + '</summary><form id="ufind" class="amt" style="padding-top:8px"><input id="uq" placeholder="' + t('search_ph') + '" value="' + esc(V._uq || '') + '"><button class="ghost" type="submit">' + t('search') + '</button></form>' +
        (V._users ? '<div class="list small">' + V._users.map(function (u) {
          return '<div><div class="row"><b>' + esc(u.name) + (u.admin ? ' · admin' : '') + '</b><span>' + num(u.pts) + ' ' + t('pts') + (u.debt ? ' · ' + t('shortfall') + ' ' + num(u.debt) : '') + '</span></div>' +
            (u.history ? u.history.slice(0, 10).map(function (x) { return '<div class="muted">' + date(x.at) + ' · ' + esc(x.kind) + ' ' + (x.side || '') + ' ' + num(x.pts) + (x.q ? ' · ' + tx(x.q).slice(0, 40) : '') + '</div>'; }).join('') : '') +
            '<form class="adj" data-user="' + esc(u.id) + '" style="display:flex;gap:6px;flex-wrap:wrap;padding-top:6px"><input name="amt" inputmode="numeric" placeholder="' + t('adj_amt') + '" style="flex:1;min-width:90px"><input name="why" placeholder="' + t('adj_why') + '" style="flex:2;min-width:140px"><button class="ghost" type="submit">' + t('adjust') + '</button></form></div>';
        }).join('') + '</div>' : '') + '</details>';
      var one = d.adminCount != null && d.adminCount < 2 ? '<div class="banner"><span>' + t('admin_one', { n: dig(d.adminCount) }) + '</span></div>' : '';
      var tools = '';
      if (!LOCAL) tools += '<details class="card"><summary>' + t('reset_title') + '</summary><form id="rstmake" class="amt" style="padding-top:8px"><input id="rstphone" type="tel" inputmode="tel" placeholder="' + t('reset_phone') + '" required><button class="ghost" type="submit">' + t('reset_make') + '</button></form>' +
        (V._rst ? '<p class="small" style="margin:8px 0 0">' + t('reset_code', { m: dig(V._rst.minutes), c: '<b>' + esc(V._rst.code) + '</b>' }) + '</p>' : '') + '</details>';
      var spo = (site && site.sponsor) || {};
      tools += '<details class="card"><summary>' + t('sp_title') + '</summary><form id="sponsor" style="display:flex;flex-direction:column;gap:8px;padding-top:8px">' +
        '<label for="spen">' + t('sp_en') + '<input id="spen" maxlength="80" value="' + esc(spo.en || '') + '"></label><label for="spbn">' + t('sp_bn') + '<input id="spbn" maxlength="80" value="' + esc(spo.bn || '') + '"></label>' +
        '<label for="spurl">' + t('sp_url') + '<input id="spurl" type="url" maxlength="200" value="' + esc(spo.url || '') + '"></label><button class="go" type="submit">' + t('sp_save') + '</button></form></details>';
      var h = one + '<div class="card"><h2>' + t('inbox') + '</h2></div>' + mh + tools + ph + dh + uh + '<div class="card"><h3>' + t('disputes') + '</h3><div class="list">' +
        (d.disputes.length ? d.disputes.map(function (x) {
          return '<div><div class="row"><a href="#m-' + x.id + '">' + tx(x.q) + '</a><span class="tag">' + oname(x.outcome) + '</span></div><p class="small" style="margin:4px 0">' + esc(x.name) + ': ' + esc(x.reason) +
            (x.link ? ' <a href="' + esc(x.link) + '" target="_blank" rel="noopener">↗</a>' : '') + '</p>' +
            (x.closed ? '' : x.pending ? (x.pending.mine ? '<p class="small muted" style="margin:0">' + t('pending_fix', { o: oname(x.pending.to) }) + ' ' + t('waiting_second') + '</p>' :
              '<p class="small" style="margin:0">' + t('pending_fix', { o: oname(x.pending.to) }) + ' (' + esc(x.pending.by) + ')</p><div class="sides"><button class="ghost" type="button" data-confirm="1" data-mid="' + x.id + '">' + t('approve') + '</button><button class="ghost" type="button" data-confirm="0" data-mid="' + x.id + '">' + t('reject') + '</button></div>') :
              '<div class="quick">' + ['keep', 'y', 'n', 'na'].map(function (k) { return '<button type="button" data-review="' + k + '" data-mid="' + x.id + '">' + (k === 'keep' ? t('keep') : oname(k)) + '</button>'; }).join('') + '</div>') + '</div>';
        }).join('') : '<p class="muted" style="margin:0">–</p>') + '</div></div>';
      h += '<div class="card"><h3>' + t('feedback') + '</h3><div class="list">' + (d.feedback.length ? d.feedback.map(function (f) {
        return '<div><div class="row small"><span>' + esc(f.name) + ' · ' + esc(f.page) + ' · ' + date(f.at) + '</span><span class="tag">' + f.status + '</span></div><p style="margin:4px 0">' + esc(f.text) + '</p>' +
          '<p class="small muted" style="margin:0 0 4px">' + esc(f.ua) + '</p><div class="quick">' + ['new', 'replied', 'closed'].map(function (st) { return '<button type="button" data-fid="' + f.id + '" data-st="' + st + '">' + st + '</button>'; }).join('') + '</div></div>';
      }).join('') : '<p class="muted" style="margin:0">–</p>') + '</div></div>';
      var cats = ['air', 'prices', 'health', 'weather', 'economy', 'cricket', 'culture', 'transport'];
      h += '<details class="card"><summary>' + t('new_market') + '</summary><form id="newm" style="display:flex;flex-direction:column;gap:8px;padding-top:8px">' +
        [['nq_en', 'q_en', 'text'], ['nq_bn', 'q_bn', 'text'], ['ns_en', 'src_en', 'text'], ['ns_bn', 'src_bn', 'text'], ['nclose', 'closes_on', 'date'], ['np', 'start_p', 'number']].map(function (f) {
          return '<label for="' + f[0] + '">' + t(f[1]) + '<input id="' + f[0] + '" type="' + f[2] + '"' + (f[2] === 'number' ? ' min="5" max="95" value="50"' : '') + (f[0] === 'ns_bn' ? '' : ' required') + '></label>';
        }).join('') +
        '<label for="ncat">' + t('category') + '<select id="ncat" style="min-height:48px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:8px">' + cats.map(function (c) { return '<option value="' + c + '">' + t(c) + '</option>'; }).join('') + '</select></label>' +
        '<button class="go" type="submit">' + t('create') + '</button></form></details>';
      h += '<details class="card"><summary>' + t('audit') + '</summary><div class="list small">' + d.audit.map(function (x) {
        return '<div>' + date(x.at) + ' · ' + esc(x.name) + ' · <b>' + esc(x.action) + '</b> <span class="muted">' + esc(JSON.stringify(x.args)).slice(0, 160) + '</span></div>';
      }).join('') + '</div><button class="ghost" type="button" id="auditcsv">' + t('audit_csv') + '</button></details>';
      return h;
    });
  };

  V.account = function () {
    if (!LOCAL && !token) return V.login();
    return api('account').then(function (d) {
      me = d.me; var pr = d.profile;
      var h = '<div class="card"><h2>' + t('your_data') + '</h2><div class="list">' +
        '<div class="row"><span class="muted">' + t('name').split(' (')[0] + '</span><b>' + esc(pr.name) + '</b></div>' +
        (pr.phone ? '<div class="row"><span class="muted">' + t('phone') + '</span><b>' + dig(pr.phone) + '</b></div>' : '') +
        (pr.created ? '<div class="row"><span class="muted">' + t('joined') + '</span><span>' + date(pr.created) + '</span></div>' : '') +
        (pr.consentAt ? '<div class="row"><span class="muted">' + t('consented') + '</span><span>' + date(pr.consentAt) + ' · ' + esc(pr.consentVer) + '</span></div>' : '') +
        '<div class="row"><span class="muted">' + t('cash') + '</span><b>' + num(me.pts) + '</b></div></div></div>';
      h += '<form class="card" id="rename"><label for="nname">' + t('name') + '<input id="nname" maxlength="24" minlength="2" required value="' + esc(pr.name) + '"></label><button class="ghost" type="submit">' + t('save') + '</button></form>';
      if (!LOCAL) h += '<details class="card"><summary>' + t('change_phone') + '</summary><form id="chphone" style="display:flex;flex-direction:column;gap:8px;padding-top:8px">' +
        '<label for="nphone">' + t('new_phone') + '<input id="nphone" type="tel" inputmode="tel" required></label><label for="cpin">' + t('pw_again') + '<input id="cpin" type="password" required autocomplete="current-password"></label>' +
        '<button class="ghost" type="submit">' + t('save') + '</button></form></details>';
      h += '<div class="card"><h3>' + t('history') + '</h3><div class="list small">' + (d.history.length ? d.history.map(function (x) {
        return '<div><div>' + (x.q ? tx(x.q) : esc(x.id)) + '</div><div class="row muted"><span>' + date(x.at) + ' · ' + t(x.kind === 'buy' ? 'bought_h' : x.kind === 'adjust' ? 'adjust' : 'sold_h') + ' ' + (x.kind === 'adjust' ? esc(x.note || '') : t(x.side === 'y' ? 'yes' : 'no')) + '</span><b>' + num(x.pts) + ' ' + t('pts') + '</b></div></div>';
      }).join('') : '<p class="muted" style="margin:0">' + t('none_yet') + '</p>') + '</div></div>';
      h += '<details class="card"><summary>' + t('del_title') + '</summary><form id="delacc" style="display:flex;flex-direction:column;gap:8px;padding-top:8px"><p class="small" style="margin:0">' + t(LOCAL ? 'demo_del' : 'del_text') + '</p>' +
        (LOCAL ? '' : '<label for="dpin">' + t('pw_again') + '<input id="dpin" type="password" required autocomplete="current-password"></label>') +
        '<label class="check" for="dok"><input id="dok" type="checkbox" required> <span>' + t('del_confirm') + '</span></label>' +
        '<button class="go n" type="submit">' + t('del_go') + '</button></form></details>';
      h += '<a href="#privacy" class="small">' + t('privacy') + '</a>';
      return h;
    });
  };
  V.terms = function () {
    var P = TERMS[lang];
    return Promise.resolve('<article class="card prose"><a href="#home" class="small">← ' + t('back') + '</a><h2>' + P.title + '</h2><p class="note small">' + P.status + '</p>' +
      P.sections.map(function (x) { return '<h3>' + x[0] + '</h3>' + x[1].map(function (para) { return '<p>' + para + '</p>'; }).join(''); }).join('') + '</article>');
  };
  V.privacy = function () {
    var P = PRIVACY[lang];
    return Promise.resolve('<article class="card prose"><a href="#home" class="small">← ' + t('back') + '</a><h2>' + P.title + '</h2><p class="note small">' + P.status + '</p>' +
      P.sections.map(function (x) { return '<h3>' + x[0] + '</h3>' + x[1].map(function (para) { return '<p>' + para + '</p>'; }).join(''); }).join('') + '</article>');
  };

  var signup = true, signupOpen = null;
  var resetMode = false, otpOn = null, otpMode = false, otpSent = false, otpPhone = '';
  V.login = function () {
    if (otpOn == null && !LOCAL) return api('home').then(function (d) { otpOn = !!d.otp; return V.login(); }, function () { otpOn = false; return V.login(); });
    if (resetMode) return Promise.resolve(resetForm());
    if (otpMode && otpOn) return Promise.resolve(otpForm());
    if (signup && signupOpen === false) return Promise.resolve('<div class="card"><h2>' + t('signup') + '</h2><p style="margin:0">' + t('not_here') + '</p><button class="ghost" type="button" id="swap">' + t('have_acc') + '</button></div>');
    return Promise.resolve('<form class="card" id="auth"><h2>' + t(signup ? 'signup' : 'login') + '</h2><p class="muted small" style="margin:0">' + t('start_pts') + '</p>' +
      (signup ? '<label for="name">' + t('name') + '<input id="name" autocomplete="nickname" maxlength="24" required></label>' : '') +
      '<label for="phone">' + t('phone') + '<input id="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX" required></label>' +
      '<label for="pin">' + t('pin') + '<input id="pin" type="password" minlength="6" maxlength="64" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" required></label>' +
      '<details class="small muted"><summary>' + t('admin_setup') + '</summary><label for="setup"><input id="setup" type="password" autocomplete="off" maxlength="128"></label></details>' +
      (signup ? '<div class="note small">' + t('priv_short') + ' <a href="#privacy">' + t('read_full') + '</a></div>' +
        '<label class="check" for="adult"><input id="adult" type="checkbox" required> <span>' + t('adult_box') + '</span></label>' +
        '<label class="check" for="consent"><input id="consent" type="checkbox" required> <span>' + t('consent_box') + '</span></label>' +
        '<p class="small muted" style="margin:0">' + t('agree_terms') + ' <a href="#terms">' + t('terms') + '</a></p>' : '') +
      '<button class="go" type="submit">' + t(signup ? 'signup' : 'login') + '</button><button class="ghost" type="button" id="swap">' + t(signup ? 'have_acc' : 'new_acc') + '</button>' + (!signup && otpOn ? '<button class="ghost" type="button" id="otpgo">' + t('otp_login') + '</button>' : '') + (!signup && !LOCAL ? '<button class="ghost" type="button" id="forgot">' + t('forgot') + '</button>' : '') + '</form>');
  };
  function otpForm() {
    return '<form class="card" id="otpform"><h2>' + t('otp_login') + '</h2>' +
      '<label for="ophone">' + t('phone') + '<input id="ophone" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(otpPhone) + '" required></label>' +
      (otpSent ? '<p class="small muted" style="margin:0">' + t('otp_sent') + '</p><label for="ocode">' + t('otp_code') + '<input id="ocode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>' : '') +
      '<button class="go" type="submit">' + t(otpSent ? 'otp_verify' : 'otp_send') + '</button><button class="ghost" type="button" id="otpback">' + t('back_login') + '</button></form>';
  }
  function resetForm() {
    return '<form class="card" id="usereset"><h2>' + t('forgot') + '</h2>' +
      '<label for="rphone">' + t('phone') + '<input id="rphone" type="tel" inputmode="tel" autocomplete="tel" required></label>' +
      '<label for="rcode">' + t('reset_have') + '<input id="rcode" autocomplete="one-time-code" autocapitalize="off" required></label>' +
      '<label for="rpin">' + t('reset_new') + '<input id="rpin" type="password" minlength="6" maxlength="64" autocomplete="new-password" required></label>' +
      '<button class="go" type="submit">' + t('reset_do') + '</button><button class="ghost" type="button" id="backlogin">' + t('back_login') + '</button></form>';
  }

  // ---- router -----------------------------------------------------------------------
  function route() {
    var h = location.hash.slice(1);
    if (h.indexOf('m-') === 0) return { name: 'market', id: h.slice(2) };
    if (h === 'me' || h === 'top' || h === 'login' || h === 'admin' || h === 'account' || h === 'privacy' || h === 'terms' || h === 'groups') return { name: h };
    if (h.indexOf('j-') === 0) return { name: 'join', id: h.slice(2) };
    return { name: 'home' };
  }
  var renderSeq = 0;
  function render(keepScroll) {
    var r = route(), seq = ++renderSeq, main = $('#main');
    stale = false;
    if (!main.firstChild || main.querySelector('.skel')) main.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    var y = window.scrollY;
    V[r.name](r.id).then(function (html) {
      if (seq !== renderSeq) return;
      main.innerHTML = html + '<footer class="foot small muted"><p>' + t('footer') + '</p><span><a href="#privacy">' + t('privacy') + '</a> · <a href="#terms">' + t('terms') + '</a></span></footer>'; header();
      if (r.name === 'market') updateEst();
      window.scrollTo(0, keepScroll ? y : 0);
    }, function (e) {
      if (seq !== renderSeq) return;
      if (e.code === 'login') { location.hash = 'login'; return; }
      main.innerHTML = '<div class="card"><p style="margin:0">' + errText(e) + '</p><button class="ghost" type="button" id="retry">↻</button></div>'; header();
    });
  }

  // ---- events (one delegated listener) ----------------------------------------------
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('button'); if (!el) return;
    var d = el.dataset;
    if (el.id === 'lang') { lang = lang === 'bn' ? 'en' : 'bn'; sset('dp-lang', lang); header(); render(true); return; }
    if (el.id === 'retry') return render();
    if (d.cat) { cat = d.cat; sset('dp-cat', cat); return render(true); }
    if (d.lg) { lg = d.lg; sset('dp-lg', lg); return render(true); }
    if (d.gcopy) return withShare().then(function (S) { return S.caption({ kind: 'group', name: groupName(d.gcopy), code: d.gcopy, url: inviteUrl(d.gcopy), brand: site && (site.name[lang] || site.name.en) }, lang); }).then(copyText, fail);
    if (d.gcard) return shareCard({ kind: 'group', name: groupName(d.gcard), code: d.gcard, size: groupSize(d.gcard), url: inviteUrl(d.gcard) });
    if (d.gleave) return api('gleave', { code: d.gleave }).then(function () { render(true); }, fail);
    if (d.shcall) { var mk = V._m, pc = Core.priceYes(mk.b, mk.qy, mk.qn); return shareCard({ kind: 'call', q: mk.q[lang] || mk.q.en, side: d.shcall, p: d.shcall === 'y' ? pc : 1 - pc }); }
    if (d.shwon) { var mw = V._m, bk = mw.myBook; return shareCard({ kind: 'called', q: mw.q[lang] || mw.q.en, side: mw.outcome, p: Math.min(0.99, bk.spent / bk[mw.outcome]), got: mw.myPaid, src: mw.src ? (mw.src[lang] || mw.src.en) : '' }); }
    if (el.id === 'csv') return csvDownload();
    if (el.id === 'auditcsv') return auditCsv();
    if (el.id === 'shclose') { $('#sharesheet').hidden = true; return; }
    if (el.id === 'shcopy') return copyText(V._cap);
    if (d.side) { trade.side = d.side; return render(true); }
    if (d.amt) { $('#amt').value = d.amt; return updateEst(); }
    if (el.id === 'buy') {
      if (!me) { sset('dp-after', location.hash.slice(1)); location.hash = 'login'; return; }
      el.disabled = true;
      return api('buy', { id: V._m.id, side: trade.side, amount: trade.amount }).then(function (r) { toast(t('bought', { s: num(r.shares) })); render(true); }, function (e) { fail(e); el.disabled = false; });
    }
    if (d.sell) {
      el.disabled = true;
      return api('sell', { id: V._m.id, side: d.sell, shares: 'all' }).then(function (r) { toast(t('sold', { p: num(r.points) })); render(true); }, function (e) { fail(e); el.disabled = false; });
    }
    if (d.review) return api('review', { id: d.mid, decision: d.review }).then(function () { toast(t('settled')); render(true); }, fail);
    if (d.fid) return api('fbstatus', { fid: d.fid, status: d.st }).then(function () { render(true); }, fail);
    if (el.id === 'help') { $('#fb').hidden = false; $('#fbtext').focus(); return; }
    if (el.id === 'fbclose') { $('#fb').hidden = true; return; }
    if (d.confirm) return api('confirm', { id: d.mid, accept: d.confirm === '1' }).then(function () { toast(t('settled')); render(true); }, fail);
    if (d.final) return (d.final === 'early' && !confirm(t('early_confirm')) ? Promise.resolve() : api('resolve', d.final === 'early' ? { id: V._m.id, early: true } : { id: V._m.id }).then(function () { toast(t('settled')); render(true); }, fail));
    if (d.retract) return api('retract', { id: V._m.id }).then(function () { render(true); }, fail);
    if (d.repeat) { location.hash = 'admin'; return; }
    if (d.settle) return api(+$('#rwin').value > 0 ? 'propose' : 'resolve', +$('#rwin').value > 0 ? { id: V._m.id, outcome: d.settle, note: $('#rnote').value, link: $('#rlink').value, hours: +$('#rwin').value } : { id: V._m.id, outcome: d.settle, note: $('#rnote').value, link: $('#rlink').value }).then(function () { toast(t('settled')); render(true); }, fail);
    if (el.id === 'ack') return api('ack').then(function () { render(true); }, fail);
    if (el.id === 'bonus') return api('bonus').then(function () { toast(t('got_bonus')); render(true); }, fail);
    if (el.id === 'reset') { sdel('dp-a-state'); location.hash = 'home'; location.reload(); return; }
    if (el.id === 'otpgo') { otpMode = true; otpSent = false; return render(); }
    if (el.id === 'otpback') { otpMode = false; otpSent = false; return render(); }
    if (el.id === 'forgot') { resetMode = true; return render(); }
    if (el.id === 'backlogin') { resetMode = false; return render(); }
    if (el.id === 'swap') { signup = !signup; return render(); }
    if (el.id === 'logout') { api('logout').catch(function () {}); token = null; me = null; sdel('dp-token'); clearCaches(); location.hash = 'home'; return; }
  });
  document.addEventListener('input', function (ev) { if (ev.target.id === 'amt') updateEst(); });
  document.addEventListener('submit', function (ev) {
    if (ev.target.id === 'disp') {
      ev.preventDefault();
      return api('dispute', { id: V._m.id, reason: $('#dwhy').value, link: $('#dlink').value }).then(function () { toast(t('dispute_sent')); render(true); }, fail);
    }
    if (ev.target.id === 'newm') {
      ev.preventDefault();
      return api('create', { en: $('#nq_en').value, bn: $('#nq_bn').value, srcEn: $('#ns_en').value, srcBn: $('#ns_bn').value, closes: $('#nclose').value, p: $('#np').value, cat: $('#ncat').value })
        .then(function (r) { toast(t('created')); location.hash = 'm-' + r.id; }, fail);
    }
    if (ev.target.id === 'fbform') {
      ev.preventDefault();
      return api('feedback', { text: $('#fbtext').value, page: location.hash.slice(1) || 'home', ver: VERSION, ua: navigator.userAgent }).then(function () {
        $('#fbtext').value = ''; $('#fb').hidden = true; toast(t('fb_sent'));
      }, fail);
    }
    if (ev.target.id === 'otpform') {
      ev.preventDefault();
      otpPhone = $('#ophone').value;
      if (!otpSent) return api('otpsend', { phone: otpPhone }).then(function () { otpSent = true; render(); }, fail);
      return api('otpverify', { phone: otpPhone, code: $('#ocode').value }).then(function (r) {
        otpMode = false; otpSent = false; token = r.token; clearCaches(); sset('dp-token', token); location.hash = 'home'; render();
      }, fail);
    }
    if (ev.target.id === 'usereset') {
      ev.preventDefault();
      return api('usereset', { phone: $('#rphone').value, code: $('#rcode').value, pin: $('#rpin').value }).then(function (r) {
        resetMode = false; token = r.token; clearCaches(); sset('dp-token', token); location.hash = 'home'; render();
      }, fail);
    }
    if (ev.target.id !== 'auth') return;
    ev.preventDefault();
    var body = { mode: signup ? 'signup' : 'login', phone: $('#phone').value, pin: $('#pin').value };
    if ($('#setup') && $('#setup').value) body.setup = $('#setup').value;
    if (signup) { body.name = $('#name').value; body.adult = $('#adult').checked; body.consent = $('#consent').checked; body.device = deviceId(); }
    api('auth', body).then(function (r) {
      token = r.token; clearCaches(); sset('dp-token', token);
      var back = sget('dp-after'); sdel('dp-after');
      var to = back && /^(m-[\w.~-]+|j-[A-Za-z0-9-]{6,7}|groups)$/.test(back) ? back : 'home'; // back to the question or invite they tapped
      if (location.hash.slice(1) === to) render(); else location.hash = to;
    }, fail);
  });
  document.addEventListener('submit', function (ev) {
    var id = ev.target.id, done = function () { toast(t('saved')); render(true); };
    if (id === 'openq') { ev.preventDefault(); return api('open', { tpl: $('#qtpl').value, x: $('#qx').value, date: $('#qdate').value }).then(function (r) { toast(t('created')); location.hash = 'm-' + r.id; }, fail); }
    if (id === 'rstmake') { ev.preventDefault(); return api('resetpw', { phone: $('#rstphone').value }).then(function (r) { V._rst = r; render(true); }, fail); }
    if (id === 'sponsor') { ev.preventDefault(); return api('sponsor', { en: $('#spen').value, bn: $('#spbn').value, url: $('#spurl').value }).then(done, fail); }
    if (id === 'ufind') { ev.preventDefault(); V._uq = $('#uq').value; return api('users', { q: V._uq }).then(function (r) { V._users = r.users; render(true); }, fail); }
    if (ev.target.classList.contains('adj')) {
      ev.preventDefault();
      var f = ev.target;
      return api('adjust', { user: f.dataset.user, amount: Number(String(f.amt.value).replace(/[০-৯]/g, function (c) { return BN.indexOf(c); }).replace('−', '-')), reason: f.why.value })
        .then(function () { toast(t('saved')); return api('users', { q: V._uq }).then(function (r) { V._users = r.users; render(true); }); }, fail);
    }
    if (id === 'gnew') { ev.preventDefault(); return api('gcreate', { name: $('#gname').value }).then(function () { render(true); }, fail); }
    if (id === 'gjoin') { ev.preventDefault(); return api('gjoin', { code: $('#gcode').value }).then(function (r) { toast(t('g_joined', { g: r.name })); render(true); }, fail); }
    if (id === 'rename') { ev.preventDefault(); api('rename', { name: $('#nname').value }).then(done, fail); }
    if (id === 'chphone') { ev.preventDefault(); api('chphone', { phone: $('#nphone').value, pin: $('#cpin').value }).then(done, fail); }
    if (id === 'delacc') {
      ev.preventDefault();
      if (LOCAL) { sdel('dp-a-state'); location.hash = 'home'; location.reload(); return; }
      api('delete', { pin: $('#dpin').value }).then(function () { token = null; me = null; sdel('dp-token'); clearCaches(); toast(t('deleted')); location.hash = 'home'; }, fail);
    }
  });
  window.addEventListener('hashchange', function () { render(); });
  window.addEventListener('online', function () { render(true); });
  window.addEventListener('offline', function () { render(true); });

  function groupName(c) { var g = (V._groups || []).filter(function (x) { return x.code === c; })[0]; return g ? g.name : ''; }
  function groupSize(c) { var g = (V._groups || []).filter(function (x) { return x.code === c; })[0]; return g ? g.members.length : 1; }
  function inviteUrl(c) { return LOCAL ? undefined : location.origin + '/#j-' + c; }
  function deviceId() {
    var d = sget('dp-device');
    if (!d) { d = Math.random().toString(36).slice(2) + Date.now().toString(36); sset('dp-device', d); }
    return d;
  }
  header(); render();
  function visit() { if (LOCAL || token) api('track', { e: 'return_visit' }).catch(function () {}); } // counted once per site day, on the server
  visit();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') visit(); }); // phones keep the tab open for days
  if (!LOCAL && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});
})();
