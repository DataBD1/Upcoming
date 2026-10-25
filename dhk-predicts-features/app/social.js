// Social layer for rival-a: groups (invite codes), leagues and daily streaks.
// Ported from Rival B (rival-b/index.html). Plain JS, no dependencies, runs where core.js runs.
// Install once after core.js loads:   require('./social.js').install(Core)   (or DPSocial.install(Core) in the browser)
// Needs the small core.js patch in core.patch (Core.extend, Core.worth, Core.siteDay).
//
// Rules (decisions A13, A23, A35):
// - Invites and groups give nothing of value to anyone: no points, no perks.
// - Streaks are a count only. The daily top-up stays exactly what core.js pays.
// - All state lives in the same single state object: s.groups, s.week, u.streak.
(function (root) {
  'use strict';

  var MAX_GROUPS_PER_USER = 10, MAX_MEMBERS = 300, MIN_RANKED = 3;
  var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

  function install(Core) {
    var err = Core.err, worth = Core.worth, siteDay = Core.siteDay;

    function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function groups(s) { return s.groups || (s.groups = {}); }
    function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 32); }
    function newCode(s, rnd) {
      for (var tries = 0; tries < 50; tries++) {
        var c = '';
        for (var i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(rnd() * CODE_CHARS.length)];
        c = c.slice(0, 3) + '-' + c.slice(3);
        if (!has(groups(s), c)) return c;
      }
      throw err('try_again');
    }
    function myGroups(s, uid) {
      var G = groups(s);
      return Object.keys(G).filter(function (c) { return G[c].members.indexOf(uid) >= 0; });
    }
    function live(s, uid) { return s.users[uid] && !s.users[uid].deleted; }

    // ---- week baseline -----------------------------------------------------
    // Week id = Sunday's date in the site's timezone (Dhaka weeks run Sun-Sat).
    function weekId(s, now) {
      var d = siteDay(s, now), dt = new Date(d + 'T00:00:00Z');
      dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
      return dt.toISOString().slice(0, 10);
    }
    // Called at the start of every write, so the baseline is saved inside the same
    // transaction. Reads never write; they fall back to START_POINTS for anyone missing.
    function rollWeek(s, now) {
      var id = weekId(s, now);
      // Start-of-week scores live in s.weekstart (a top-level map, so the Postgres store can keep one row per player).
      // Older states kept them in s.week.start; move them over.
      if (s.week && s.week.start) { s.weekstart = s.week.start; delete s.week.start; }
      if (!s.week || s.week.id !== id) {
        s.week = { id: id }; s.weekstart = {};
        Object.keys(s.users).forEach(function (u) { if (live(s, u)) s.weekstart[u] = Math.round(worth(s, u)); });
      }
    }
    function gain(s, uid) {
      var base = s.weekstart && has(s.weekstart, uid) ? s.weekstart[uid] : Core.START_POINTS;
      return Math.round(worth(s, uid) - base);
    }
    function row(s, uid, me, now, hideId) {
      var u = s.users[uid], r = { name: u.name, worth: Math.round(worth(s, uid)), week: gain(s, uid), bot: !!u.bot, me: uid === me };
      if (uid === me || !hideId) r.id = uid;
      if (uid === me) r.streak = liveStreak(s, uid, now); // other players' streak is not shared; group co-members get no id either
      return r;
    }

    // ---- streaks -------------------------------------------------------------
    // u.streak counts consecutive site days the player took the daily top-up.
    function liveStreak(s, uid, now) {
      var u = s.users[uid];
      if (!u.streakDay) return 0;
      var today = siteDay(s, now), yest = siteDay(s, now - 864e5);
      // a day in the future (left by the Dhaka->UTC migration) counts as today
      return (u.streakDay >= today || u.streakDay === yest) ? (u.streak || 0) : 0;
    }

    // ---- reads -----------------------------------------------------------------
    Core.extend('read', 'social', function (s, uid, a, now) {
      if (!uid) throw Core.err('login');
      var u = s.users[uid];
      return {
        streak: liveStreak(s, uid, now), bonusReady: u.lastBonus !== siteDay(s, now), best: u.bestStreak || 0, week: s.week ? s.week.id : weekId(s, now),
        groups: myGroups(s, uid).map(function (c) {
          var g = groups(s)[c];
          var members = g.members.filter(function (m) { return live(s, m); }).map(function (m) { return row(s, m, uid, now, true); });
          members.sort(function (x, y) { return y.worth - x.worth; });
          return { code: c, name: g.name, owner: g.owner === uid, members: members };
        })
      };
    });

    // a.kind: 'week' (everyone, by points gained this week), 'friends' (people in
    // any of my groups, by worth), 'groups' (group league: average gain per member).
    Core.extend('read', 'league', function (s, uid, a, now) {
      var kind = a.kind === 'friends' || a.kind === 'groups' ? a.kind : 'week';
      if (kind === 'groups') {
        var G = groups(s), list = Object.keys(G).map(function (c) {
          var ms = G[c].members.filter(function (m) { return live(s, m); });
          var avg = ms.length ? ms.reduce(function (t, m) { return t + gain(s, m); }, 0) / ms.length : 0;
          return { code: c, name: G[c].name, size: ms.length, avg: Math.round(avg), mine: uid ? ms.indexOf(uid) >= 0 : false };
        }).filter(function (g) { return g.size >= MIN_RANKED || g.mine; });
        list.sort(function (x, y) { return y.avg - x.avg; });
        list.forEach(function (g, i) { g.rank = g.size >= MIN_RANKED ? i + 1 : null; });
        return { kind: kind, top: list.slice(0, 50), minRanked: MIN_RANKED };
      }
      var ids;
      if (kind === 'friends') {
        if (!uid) throw Core.err('login');
        var set = {}; set[uid] = 1;
        myGroups(s, uid).forEach(function (c) { groups(s)[c].members.forEach(function (m) { set[m] = 1; }); });
        ids = Object.keys(set);
      } else ids = Object.keys(s.users);
      var rows = ids.filter(function (id) { return live(s, id); }).map(function (id) { return row(s, id, uid, now); });
      var key = kind === 'week' ? 'week' : 'worth';
      rows.sort(function (x, y) { return y[key] - x[key]; });
      var myRank = 0; rows.forEach(function (r, i) { r.rank = i + 1; if (r.me) myRank = i + 1; });
      return { kind: kind, top: rows.slice(0, 50), myRank: myRank, total: rows.length };
    });

    // ---- writes ----------------------------------------------------------------
    Core.extend('write', 'gcreate', function (s, uid, a, now) {
      var name = cleanName(a.name);
      if (name.length < 2) throw err('bad_name');
      if (myGroups(s, uid).length >= MAX_GROUPS_PER_USER) throw err('too_many_groups');
      var seed = now ^ (uid.length * 2654435761), rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
      var code = newCode(s, a._rnd || rnd);
      groups(s)[code] = { name: name, owner: uid, members: [uid], created: now };
      Core.track(s, 'group_create', uid, null, now);
      return { code: code, name: name };
    });
    Core.extend('write', 'gjoin', function (s, uid, a, now) {
      var code = String(a.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      code = code.slice(0, 3) + '-' + code.slice(3, 6);
      var g = has(groups(s), code) ? groups(s)[code] : null;
      if (!g) throw err('no_group');
      if (g.members.indexOf(uid) >= 0) return { code: code, name: g.name, already: true };
      if (myGroups(s, uid).length >= MAX_GROUPS_PER_USER) throw err('too_many_groups');
      if (g.members.length >= MAX_MEMBERS) throw err('group_full');
      g.members.push(uid);
      Core.track(s, 'group_join', uid, null, now); // A23: tracked for analytics only, no reward to anyone
      return { code: code, name: g.name };
    });
    Core.extend('write', 'gleave', function (s, uid, a) {
      var code = String(a.code || ''), g = has(groups(s), code) ? groups(s)[code] : null;
      if (!g || g.members.indexOf(uid) < 0) throw err('no_group');
      g.members = g.members.filter(function (m) { return m !== uid; });
      if (!g.members.length) delete groups(s)[code];
      else if (g.owner === uid) g.owner = g.members[0];
      return { ok: true };
    });

    // Every write rolls the week first; the daily top-up also advances the streak.
    Core.beforeWrite(function (s, uid, name, a, now) { rollWeek(s, now); });
    Core.afterWrite('bonus', function (s, uid, a, now) {
      var u = s.users[uid], today = siteDay(s, now), yest = siteDay(s, now - 864e5);
      u.streak = u.streakDay === yest ? (u.streak || 0) + 1 : (u.streakDay === today ? u.streak || 1 : 1);
      u.streakDay = today;
      u.bestStreak = Math.max(u.bestStreak || 0, u.streak);
    });

    // A31 account deletion: drop the player from every group.
    Core.onDelete(function (s, uid) {
      Object.keys(groups(s)).forEach(function (c) {
        var g = groups(s)[c];
        g.members = g.members.filter(function (m) { return m !== uid; });
        if (!g.members.length) delete groups(s)[c]; else if (g.owner === uid) g.owner = g.members[0];
      });
      if (s.weekstart) delete s.weekstart[uid];
    });
    return { weekId: weekId };
  }

  var Social = { install: install };
  if (typeof module === 'object' && module.exports) module.exports = Social; else root.DPSocial = Social;
})(this);
