(function () {
  "use strict";
  var B = window.BALLOT;
  var S = B.state;
  var main = document.getElementById("main");
  document.getElementById("updated").textContent = B.updated;

  var SCALE = ["Strongly disagree", "Disagree", "Not sure", "Agree", "Strongly agree"];
  var WEIGHTS = [["A little", 1], ["Some", 2], ["A lot", 3]];
  var MIN_OVERLAP = 3;
  var KEY = "ballotmatch-v2";
  var STATES = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"];

  var state = load() || { answers: {}, weights: {}, i: 0, place: "" };
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function link(url, text) {
    if (!url || !/^https?:\/\//.test(url)) return esc(text || "");
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text || url) + "</a>";
  }
  function srcLink(url, text) {
    if (!url || !/^https?:\/\//.test(url)) return "";
    return '<a class="srclink" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text || "Source") + '<span class="sr"> (opens a new tab)</span></a>';
  }
  function host(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return "source"; } }
  function answeredCount() { return Object.keys(state.answers).filter(function (k) { return state.answers[k] > 0; }).length; }
  function chosen() { return state.place || ""; }
  function ready() { return chosen() === S.name; }
  function shortBio(c) { return (c.profile && c.profile.bio) || c.bio || ""; }

  // ---------- glossary: tap a term to see what it means ----------
  var G = B.glossary || [];
  var termRe = null, termIndex = {};
  (function () {
    var words = [];
    G.forEach(function (g, i) {
      [g.term].concat(g.aliases || []).forEach(function (w) {
        if (!w || w.length < 3) return;
        termIndex[w.toLowerCase()] = i; words.push(w);
      });
    });
    words.sort(function (a, b) { return b.length - a.length; });
    if (words.length) {
      var src = words.map(function (w) { return esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|");
      termRe = new RegExp("(^|[^A-Za-z0-9])(" + src + ")(?![A-Za-z0-9])", "gi");
    }
  })();
  function rich(text, seen) {
    var h = esc(text);
    if (!termRe) return h;
    seen = seen || {};
    return h.replace(termRe, function (m, pre, w) {
      var i = termIndex[w.toLowerCase()];
      if (i == null || seen[i]) return m;
      seen[i] = 1;
      return pre + '<button type="button" class="term" data-term="' + i + '">' + w + "</button>";
    });
  }

  var pop = document.createElement("div");
  pop.className = "pop"; pop.id = "pop"; pop.setAttribute("role", "dialog"); pop.hidden = true;
  document.body.appendChild(pop);
  function placePop(anchor) {
    var host = anchor.closest("dialog");
    if (host && pop.parentNode !== host) host.appendChild(pop);
    if (!host && pop.parentNode !== document.body) document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    if (window.innerWidth < 640) { pop.className = "pop sheet"; pop.style.left = ""; pop.style.top = ""; pop.style.width = ""; return; }
    pop.className = "pop";
    var w = Math.min(360, window.innerWidth - 32);
    pop.style.width = w + "px";
    pop.style.left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16)) + "px";
    var top = r.bottom + 8;
    if (top + pop.offsetHeight > window.innerHeight - 12) top = Math.max(12, r.top - pop.offsetHeight - 8);
    pop.style.top = top + "px";
  }
  function showPop(html, anchor) {
    pop.innerHTML = '<button type="button" class="pop-x" aria-label="Close">×</button>' + html;
    pop.hidden = false;
    placePop(anchor);
    pop.querySelector(".pop-x").onclick = hidePop;
  }
  function hidePop() { pop.hidden = true; }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest(".term");
    if (t) {
      e.preventDefault(); e.stopPropagation();
      var g = G[+t.dataset.term];
      showPop("<h4>" + esc(g.term) + "</h4><p>" + esc(g.definition) + "</p>" + (g.source_url ? '<p class="src">' + srcLink(g.source_url) + "</p>" : ""), t);
      return;
    }
    if (!pop.hidden && !pop.contains(e.target)) hidePop();
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hidePop();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".party[data-party]")) { e.preventDefault(); e.target.click(); }
  });

  // ---------- contact form ----------
  // Messages post to a Google Apps Script web app that emails Zayviana, labels the thread, and logs it to a Sheet.
  var CONTACT_ENDPOINT = (B.contactEndpoint || "");
  var KINDS = [["mistake", "Report a mistake"], ["thanks", "Say thanks"], ["question", "Ask a question"], ["state", "Add my state"]];
  function reportBox(about) {
    return '<div class="report"><div><b>See something wrong?</b><p>Tell us and we\'ll check it against the source and fix it.</p></div>' +
      '<button type="button" class="btn ghost" data-contact="mistake" data-about="' + esc(about) + '">Report a mistake</button></div>';
  }
  var cdlg = document.createElement("dialog");
  cdlg.className = "profile contact"; cdlg.setAttribute("aria-labelledby", "cname");
  document.body.appendChild(cdlg);
  cdlg.addEventListener("click", function (e) { if (e.target === cdlg) cdlg.close(); });
  function openContact(kind, about) {
    if (dlg.open) dlg.close();
    cdlg.innerHTML = '<div class="p-head"><div class="p-id"><h2 id="cname">Contact us</h2><p class="p-race">Corrections, thank-yous, and questions all come to the same place. We read every one.</p></div>' +
      '<button type="button" class="p-x" aria-label="Close">×</button></div>' +
      '<form class="p-body cform" id="cform" novalidate>' +
      '<fieldset><legend>What is this about?</legend><div class="weight">' + KINDS.map(function (k) {
        return '<label><input type="radio" name="kind" value="' + k[0] + '"' + (k[0] === kind ? " checked" : "") + "><span>" + k[1] + "</span></label>";
      }).join("") + "</div></fieldset>" +
      (about ? '<p class="about-chip">About: <b>' + esc(about) + "</b></p>" : "") +
      '<label class="pick-label" for="cmsg" id="cmsgLabel">Your message</label>' +
      '<textarea id="cmsg" name="message" class="search area" rows="6" required></textarea>' +
      '<p class="hint" id="cmsgHint"></p>' +
      '<label class="pick-label" for="csrc" id="csrcWrap">Link to a source (optional)</label><input id="csrc" name="source" class="search" type="url" placeholder="https://">' +
      '<div class="two"><div><label class="pick-label" for="cnm">Your name (optional)</label><input id="cnm" name="name" class="search" autocomplete="name"></div>' +
      '<div><label class="pick-label" for="cem">Your email (optional, if you want a reply)</label><input id="cem" name="email" class="search" type="email" autocomplete="email"></div></div>' +
      '<input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="form-msg" id="cstatus" role="status"></p>' +
      '<div class="row"><button type="submit" class="btn" id="csend">Send message</button><button type="button" class="btn quiet" id="ccancel">Cancel</button></div></form>';
    var form = cdlg.querySelector("#cform");
    function sync() {
      var k = (form.querySelector('input[name="kind"]:checked') || {}).value || "mistake";
      var mistake = k === "mistake";
      form.querySelector("#csrcWrap").hidden = !mistake; form.querySelector("#csrc").hidden = !mistake;
      form.querySelector("#cmsgLabel").textContent = mistake ? "What's wrong, and what should it say?" : k === "state" ? "Which state, and how would you like to help?" : "Your message";
      form.querySelector("#cmsgHint").textContent = mistake ? "Be as specific as you can. We check every report against the source before changing anything." : "";
    }
    form.querySelectorAll('input[name="kind"]').forEach(function (r) { r.onchange = sync; });
    sync();
    cdlg.querySelector(".p-x").onclick = function () { cdlg.close(); };
    cdlg.querySelector("#ccancel").onclick = function () { cdlg.close(); };
    form.onsubmit = function (e) {
      e.preventDefault();
      var status = form.querySelector("#cstatus");
      var msg = form.querySelector("#cmsg").value.trim();
      var em = form.querySelector("#cem").value.trim();
      if (!msg) { status.className = "form-msg err"; status.textContent = "Write a message before sending."; form.querySelector("#cmsg").focus(); return; }
      if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { status.className = "form-msg err"; status.textContent = "That email address doesn't look complete. Fix it or leave it blank."; form.querySelector("#cem").focus(); return; }
      if (form.website.value) return;
      var kind = (form.querySelector('input[name="kind"]:checked') || {}).value || "mistake";
      var payload = { kind: kind, kindLabel: (KINDS.filter(function (k) { return k[0] === kind; })[0] || [])[1], about: about || "", message: msg,
        source: form.querySelector("#csrc").value.trim(), name: form.querySelector("#cnm").value.trim(), email: em,
        state: S.name, page: location.hash || "#start", sent: new Date().toISOString() };
      if (!CONTACT_ENDPOINT) { status.className = "form-msg err"; status.textContent = "The contact form isn't connected yet. It will work once the site is live."; return; }
      var btn = form.querySelector("#csend"); btn.disabled = true; btn.textContent = "Sending...";
      fetch(CONTACT_ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
        .then(function () {
          form.innerHTML = '<div class="sent"><h3>Message sent</h3><p>Thank you. ' + (kind === "mistake" ? "We'll check it against the source and fix anything that's wrong." : "We read every message.") + (em ? " We'll reply to " + esc(em) + " if we have questions." : "") + '</p><button type="button" class="btn" id="cdone">Done</button></div>';
          form.querySelector("#cdone").onclick = function () { cdlg.close(); };
        })
        .catch(function () { btn.disabled = false; btn.textContent = "Send message"; status.className = "form-msg err"; status.textContent = "Your message didn't send. Check your connection and try again."; });
    };
    if (cdlg.showModal) cdlg.showModal(); else cdlg.setAttribute("open", "");
    setTimeout(function () { form.querySelector("#cmsg").focus(); }, 30);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-contact]");
    if (!b) return;
    e.preventDefault();
    openContact(b.dataset.contact || "mistake", b.dataset.about || "");
  });

  // ---------- parties ----------
  var P = B.parties || {};
  var partyAll = (P.parties || []).concat(P.not_parties || []);
  function partyFor(label) {
    var l = (label || "").toLowerCase();
    for (var i = 0; i < partyAll.length; i++) {
      var p = partyAll[i];
      var names = [p.name].concat(p.aliases || []).map(function (x) { return String(x).toLowerCase(); });
      if (names.indexOf(l) >= 0) return i;
    }
    for (var j = 0; j < partyAll.length; j++) {
      if (l && (partyAll[j].name || "").toLowerCase().indexOf(l.split(" ")[0]) === 0) return j;
    }
    return -1;
  }
  function partyHtml(p, full) {
    var body = p.stands_for
      ? (full ? "" : "") + '<p class="pmeta">' + [p.founded ? "Founded " + esc(p.founded) : "", p.nickname ? esc(p.nickname) : ""].filter(Boolean).join(". ") + "</p>" +
        '<p class="small"><b>What the party says it stands for:</b></p><ul class="rec">' + p.stands_for.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
        (p.florida_note ? '<p class="small muted">' + esc(p.florida_note) + "</p>" : "")
      : "<p>" + esc(p.text) + "</p>";
    return body;
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest(".party[data-party]");
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    var p = partyAll[+t.dataset.party];
    showPop("<h4>" + esc(p.name) + "</h4>" + partyHtml(p) + '<p class="src"><a href="#parties">All parties explained</a></p>', t);
  }, true);

  // ---------- countdown ----------
  var bar = document.createElement("div");
  bar.className = "clock"; bar.setAttribute("role", "status");
  var topEl = document.querySelector(".top");
  topEl.parentNode.insertBefore(bar, topEl.nextSibling);
  function span(ms) {
    var m = Math.max(0, Math.floor(ms / 60000)), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 2) return d + " days";
    if (h >= 1) return h + (h === 1 ? " hour " : " hours ") + (m % 60) + " min";
    return (m % 60) + (m % 60 === 1 ? " minute" : " minutes");
  }
  function tick() {
    var k = S.clock; if (!k) { bar.hidden = true; return; }
    var now = Date.now(), open = Date.parse(k.opens), ce = Date.parse(k.closeEastern), cc = Date.parse(k.closeCentral);
    var html;
    if (now < open) html = "<b>Election Day.</b> Polls open at 7 a.m. local time, in " + span(open - now) + ".";
    else if (now < ce) html = '<b>Polls close in <span class="t">' + span(ce - now) + "</span></b> (7 p.m. Eastern). The western Panhandle closes at 7 p.m. Central. In line by 7? You can still vote.";
    else if (now < cc) html = '<b>Polls in the western Panhandle close in <span class="t">' + span(cc - now) + "</span></b> (7 p.m. Central). In line by 7? You can still vote.";
    else if (k.next && now < Date.parse(k.next.date)) html = '<b>Next statewide election in <span class="t">' + span(Date.parse(k.next.date) - now) + "</span>:</b> " + esc(k.next.name) + ", " + esc(k.next.label) + '. <button type="button" class="linkish" id="nextWhy">Why this date?</button>';
    else { bar.hidden = true; return; }
    bar.hidden = !ready();
    bar.className = "clock" + (now >= open && now < cc ? " live" : "");
    bar.innerHTML = '<div class="wrap">' + html + "</div>";
    var w = document.getElementById("nextWhy");
    if (w) w.onclick = function () { showPop("<h4>Next election</h4><p>" + esc(k.next.note) + "</p>", w); };
  }
  setInterval(tick, 30000);

  // ---------- state picker ----------
  function stateChip() {
    var el = document.getElementById("place");
    if (el) el.innerHTML = chosen() ? '<a href="#start">' + esc(chosen()) + " · Change</a>" : "";
  }
  function picker(id) {
    return '<label class="pick-label" for="' + id + '">Choose your state</label>' +
      '<select class="pick" id="' + id + '"><option value="">Select a state</option>' +
      STATES.map(function (n) { return "<option" + (n === chosen() ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select>";
  }
  function notYet() {
    return '<div class="panel notyet"><h2>' + esc(chosen() || "Your state") + " isn't here yet</h2>" +
      "<p>We're adding states one at a time, and every candidate gets checked against their own words before a state goes live. Until then, VOTE411 from the League of Women Voters covers every state, with candidates' own answers.</p>" +
      '<div class="row"><a class="btn" href="https://www.vote411.org" target="_blank" rel="noopener">Open VOTE411</a><a class="btn ghost" href="#start">Choose a different state</a></div>' +
      '<div class="report"><div><b>Want ' + esc(chosen() || "your state") + ' on Ballot Match?</b><p>We\'d love to partner with people who know their state. Reach out and let\'s talk.</p></div>' +
      '<button type="button" class="btn ghost" data-contact="state" data-about="' + esc(chosen() || "") + '">Contact us</button></div></div>';
  }
  function photo(key, cls) {
    var p = (B.photos || {})[key];
    if (!p) return "";
    return '<figure class="' + (cls || "") + '"><img src="' + p.src + '" alt="' + esc(p.alt) + '" loading="lazy"><figcaption>' + esc(p.caption || "") + ' <span>' + esc(p.credit) + "</span></figcaption></figure>";
  }

  // ---------- home ----------
  function home() {
    var started = answeredCount() > 0;
    var hero = (B.photos || {}).hero;
    var cta;
    if (!chosen()) cta = '<p class="hero-note">Ballot Match covers ' + esc(S.name) + " only for now. More states are coming soon.</p>";
    else if (!ready()) cta = "";
    else cta = '<div class="row"><a class="btn red" href="#quiz">' + (started ? "Pick up where you left off" : "Start the questions") + '</a><a class="btn white" href="#races">Meet the candidates</a></div>';

    main.innerHTML =
      '<section class="hero"' + (hero ? ' style="--hero:url(\'' + hero.src + '\')"' : "") + '><div class="hero-in">' +
      '<p class="stars" aria-hidden="true">★ ★ ★</p>' +
      "<h1>Know who's on your ballot before you vote.</h1>" +
      '<p class="lede">Answer 10 quick questions about what matters to you. See how every candidate lines up, based on what they\'ve actually said and done, in plain English.</p>' +
      '<div class="pickwrap">' + picker("pickHome") + "</div>" + cta +
      "</div>" + (hero ? '<p class="hero-credit">Photo: ' + esc(hero.credit) + "</p>" : "") + "</section>" +
      (chosen() && !ready() ? notYet() : "") +
      (ready() ? '<div class="notice"><p><b>' + esc(S.name) + "'s Election Day is " + esc(S.electionDate) + ".</b> " + S.whereToVote + "</p></div>" : "") +

      '<section class="promise">' +
      "<div><h3>No endorsements</h3><p>We never tell you who to vote for. You compare, you decide.</p></div>" +
      "<div><h3>Their own record</h3><p>Every stance comes from what a candidate said or did, with the source one tap away.</p></div>" +
      "<div><h3>Every name on the ballot</h3><p>Independents and third parties get the same treatment as the two big parties.</p></div>" +
      "</section>" +

      '<section class="history"><h2>Everyone gets a vote. It took a fight.</h2>' +
      '<p class="lede">The right to vote belongs to every citizen, no matter your race, gender, religion, or who you are. It wasn\'t always that way. People marched, went to jail, and died so that it would be.</p>' +
      '<div class="hist-photos">' + photo("suffrage", "ph") + photo("selma", "ph") + "</div>" +
      '<ol class="timeline">' +
      "<li><b>1870</b><span>The 15th Amendment says no one can be denied the vote because of their race. Many states still blocked Black voters for nearly a century with poll taxes, reading tests, and violence.</span></li>" +
      "<li><b>1920</b><span>The 19th Amendment gives women the right to vote across the country, after more than 70 years of organizing.</span></li>" +
      "<li><b>1924</b><span>Native Americans are made U.S. citizens. Some states kept them from voting into the 1950s.</span></li>" +
      "<li><b>1964</b><span>The 24th Amendment bans poll taxes, fees people had to pay just to vote, in federal elections.</span></li>" +
      "<li><b>1965</b><span>After marchers were beaten on a bridge in Selma, Alabama, Congress passes the Voting Rights Act to stop racial discrimination at the polls.</span></li>" +
      "<li><b>1971</b><span>The 26th Amendment lowers the voting age to 18. If you were old enough to be drafted, you were old enough to vote.</span></li>" +
      "</ol></section>" +

      '<section class="band">' + photo("stickers", "band-ph") +
      '<div class="band-in"><h2>Your vote is your voice.</h2><p>Take ten minutes, look at the facts, and make the choice that\'s yours to make.</p>' +
      (ready() ? '<a class="btn red" href="#quiz">Start the questions</a>' : '<a class="btn red" href="#start" id="toPick">Choose your state</a>') + "</div></section>";

    document.getElementById("pickHome").addEventListener("change", function (e) {
      state.place = e.target.value; save(); stateChip(); home();
    });
    var tp = document.getElementById("toPick");
    if (tp) tp.onclick = function (e) { e.preventDefault(); window.scrollTo(0, 0); document.getElementById("pickHome").focus(); };
  }

  // ---------- quiz ----------
  function quiz() {
    var qs = B.questions;
    if (state.i >= qs.length) state.i = qs.length - 1;
    var q = qs[state.i];
    var val = state.answers[q.id] || 0;
    var w = state.weights[q.id] || 2;
    var bars = qs.map(function (x, n) { return '<span class="' + (n < state.i ? "done" : n === state.i ? "now" : "") + '"></span>'; }).join("");
    var ovals = SCALE.map(function (lbl, n) {
      var v = n + 1;
      return '<label><input type="radio" name="ans" value="' + v + '"' + (val === v ? " checked" : "") + '><span class="oval" aria-hidden="true"></span><span class="lbl">' + lbl + "</span></label>";
    }).join("");
    var weights = WEIGHTS.map(function (p) {
      return '<label><input type="radio" name="wt" value="' + p[1] + '"' + (w === p[1] ? " checked" : "") + "><span>" + p[0] + "</span></label>";
    }).join("");
    var last = state.i === qs.length - 1;
    main.innerHTML =
      '<div class="progress" aria-hidden="true">' + bars + "</div>" +
      '<div class="panel qcard"><p class="qcount">Question ' + (state.i + 1) + " of " + qs.length + '<span class="qtopic">' + esc(q.topic) + "</span></p>" +
      '<h1 class="statement">' + rich(q.text) + "</h1>" +
      '<fieldset><legend>Do you agree?</legend><div class="scale">' + ovals + "</div></fieldset>" +
      '<fieldset class="last"><legend>How much does this matter to you?</legend><div class="weight">' + weights + "</div></fieldset></div>" +
      '<div class="quiz-nav">' +
      '<button class="btn quiet" id="back"' + (state.i === 0 ? " disabled" : "") + ">Back</button>" +
      '<div class="row"><button class="btn quiet" id="skip">Skip</button>' +
      '<button class="btn" id="next"' + (val ? "" : " disabled") + ">" + (last ? "See my matches" : "Next question") + "</button></div></div>";
    main.querySelectorAll('input[name="ans"]').forEach(function (el) {
      el.addEventListener("change", function () { state.answers[q.id] = +el.value; save(); document.getElementById("next").disabled = false; });
    });
    main.querySelectorAll('input[name="wt"]').forEach(function (el) {
      el.addEventListener("change", function () { state.weights[q.id] = +el.value; save(); });
    });
    document.getElementById("back").onclick = function () { state.i--; save(); quiz(); focusMain(); };
    document.getElementById("skip").onclick = function () { delete state.answers[q.id]; advance(); };
    document.getElementById("next").onclick = advance;
    function advance() {
      if (!state.weights[q.id]) state.weights[q.id] = 2;
      if (last) { save(); location.hash = "#results"; return; }
      state.i++; save(); quiz(); focusMain();
    }
  }

  function scoreCandidate(c) {
    var byQ = {};
    c.stances.forEach(function (s) { if (s.q && s.agree != null) (byQ[s.q] = byQ[s.q] || []).push(s.agree); });
    var num = 0, den = 0, n = 0;
    Object.keys(byQ).forEach(function (qid) {
      var u = state.answers[qid];
      if (!u) return;
      var a = byQ[qid].reduce(function (x, y) { return x + y; }, 0) / byQ[qid].length;
      var w = state.weights[qid] || 2;
      num += w * (1 - Math.abs(u - a) / 4); den += w; n++;
    });
    return { n: n, pct: n >= MIN_OVERLAP ? Math.round((100 * num) / den) : null };
  }

  // ---------- candidate cards and profile ----------
  var CARDS = [];
  function partyTag(c) {
    var pi = partyFor(c.writeIn ? "Write-in" : c.party);
    return (pi >= 0 ? '<span class="party" role="button" tabindex="0" data-party="' + pi + '">' + esc(c.party) + "</span>" : '<span class="party">' + esc(c.party) + "</span>") +
      (c.incumbent ? '<span class="badge">Incumbent</span>' : "") +
      (c.writeIn ? '<span class="badge soft">Write-in</span>' : "");
  }
  function card(race, c, score) {
    var idx = CARDS.push({ race: race, c: c }) - 1;
    var right = "";
    if (score) right = score.pct != null
      ? '<div class="score"><b>' + score.pct + '%</b><span>match</span></div>'
      : '<div class="score na"><span>Not enough public positions to compare</span></div>';
    var meter = score && score.pct != null ? '<div class="meter" aria-hidden="true"><i style="width:' + score.pct + '%"></i></div>' : "";
    var basis = score ? '<p class="basis">' + (score.pct != null ? "Compared on " + score.n + (score.n === 1 ? " issue" : " issues") : score.n ? "Only " + score.n + " overlapping " + (score.n === 1 ? "issue" : "issues") : "No overlapping issues") + "</p>" : "";
    return '<button type="button" class="cardx" data-card="' + idx + '" aria-haspopup="dialog">' +
      '<span class="cardx-top"><span class="who"><span class="cname">' + esc(c.name) + "</span>" +
      (c.mate ? '<span class="mate">with ' + esc(c.mate) + "</span>" : "") +
      '<span class="tags">' + partyTag(c) + "</span></span>" + right + "</span>" + meter + basis +
      (shortBio(c) ? '<span class="cbio">' + esc(shortBio(c)) + "</span>" : "") +
      '<span class="open">View profile</span></button>';
  }
  function quickLook(c) {
    var found = c.stances.filter(function (s) { return s.found; }).slice(0, 4);
    if (!found.length) return "<h4>" + esc(c.name) + '</h4><p class="none">No public positions found on these issues yet.</p>';
    return "<h4>" + esc(c.name) + '</h4><ul class="quick">' + found.map(function (s) {
      return "<li><b>" + esc(s.issue) + "</b>" + esc(s.summary) + "</li>";
    }).join("") + '</ul><p class="src">Click to see everything.</p>';
  }

  var dlg = document.createElement("dialog");
  dlg.className = "profile"; dlg.setAttribute("aria-labelledby", "pname");
  document.body.appendChild(dlg);
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", hidePop);

  function openProfile(i, withYou) {
    hidePop();
    var it = CARDS[i]; if (!it) return;
    var c = it.c, p = c.profile || {};
    var seen = {};
    var sources = [];
    function addSrc(u, label) { if (u && sources.every(function (s) { return s.u !== u; })) sources.push({ u: u, l: label }); }

    var stances = c.stances.filter(function (s) { return withYou ? s.q : true; });
    var foundSt = stances.filter(function (s) { return s.found; });
    var missing = stances.filter(function (s) { return !s.found; });
    foundSt.forEach(function (s) { addSrc(s.url, s.issue); });
    (p.record || []).forEach(function (r) { addSrc(r.source_url, "Background"); });
    (p.onRecord || []).forEach(function (r) { addSrc(r.source_url, "On the record"); });
    var GROUPS = GROUP_LIST || [["police_and_public", "Police and the public"], ["immigrants", "Immigrants"], ["housing", "Housing and homelessness"], ["struggling_families", "Families who are struggling"], ["race_civil_rights", "Race and civil rights"], ["lgbtq", "LGBTQ people"], ["disability_veterans", "People with disabilities and veterans"], ["faith", "Faith and religious freedom"]];
    var peopleHtml = "";
    if (p.people) {
      var emptyG = [];
      GROUPS.forEach(function (g) {
        var items = p.people[g[0]] || [];
        if (!items.length) { emptyG.push(g[1].toLowerCase()); return; }
        items.forEach(function (r) { addSrc(r.source_url, g[1]); });
        peopleHtml += '<div class="st"><h4>' + esc(g[1]) + '</h4><ul class="rec">' + items.map(function (r) { return "<li>" + rich(r.text, seen) + "</li>"; }).join("") + "</ul></div>";
      });
      if (emptyG.length) peopleHtml += '<p class="missing"><b>No public record found on:</b> ' + emptyG.join(", ") + ".</p>";
    }

    var standHtml = foundSt.map(function (s) {
      var you = "";
      if (withYou && s.q && state.answers[s.q]) {
        you = '<p class="you">You said <b>' + SCALE[state.answers[s.q] - 1].toLowerCase() + "</b>" +
          (s.agree != null ? ". Their record is closest to <b>" + SCALE[Math.round(s.agree) - 1].toLowerCase() + "</b>." : ".") + "</p>";
      }
      return '<div class="st"><h4>' + esc(s.issue) + "</h4><p>" + rich(s.summary, seen) + "</p>" + you +
        (s.note ? '<p class="hold">' + esc(s.note) + "</p>" : "") + "</div>";
    }).join("");
    if (missing.length) standHtml += '<p class="missing"><b>No public position found on:</b> ' + missing.map(function (s) { return esc(s.issue).toLowerCase(); }).join(", ") + ". Nothing turned up in the sources we checked. That doesn't mean they have no view.</p>";

    var record = (p.record || []).length ? '<ul class="rec">' + p.record.map(function (r) { return "<li>" + rich(r.text, seen) + "</li>"; }).join("") + "</ul>" : "";
    var onRec = (p.onRecord || []).length
      ? p.onRecord.map(function (r) {
          return '<div class="orec"><p>' + rich(r.text, seen) + "</p>" +
            (r.status ? '<p class="meta"><b>Status:</b> ' + esc(r.status) + "</p>" : "") +
            (r.response ? '<p class="meta"><b>Their response:</b> ' + esc(r.response) + "</p>" : "") + "</div>";
        }).join("")
      : '<p class="none">' + (c.profile ? "Nothing found that meets our standard." : "This section is being researched.") + "</p>";

    dlg.innerHTML =
      '<div class="p-head"><div class="p-id"><h2 id="pname">' + esc(c.name) + "</h2>" +
      (c.mate ? '<p class="mate">Running with ' + esc(c.mate) + "</p>" : "") +
      '<div class="tags">' + partyTag(c) + '</div><p class="p-race">' + esc(it.race.title) + (c.incumbent ? ". " + esc(c.incumbent) : "") + "</p></div>" +
      '<button type="button" class="p-x" aria-label="Close profile">×</button></div>' +
      '<div class="p-body">' +
      "<section><h3>Who they are</h3><p>" + rich(shortBio(c) || "We couldn't find a public biography for this candidate.", seen) + "</p>" + record +
      (c.site ? '<p class="src">' + srcLink(c.site, "Campaign website") + "</p>" : "") + "</section>" +
      "<section><h3>Where they stand</h3>" + (standHtml || '<p class="none">No public positions found.</p>') + "</section>" +
      '<section><h3>Who they stand up for</h3><p class="explain">What they have said and done that affects different groups of people. You decide what it means.</p>' + (peopleHtml || '<p class="none">This section is being researched.</p>') + "</section>" +
      '<section><h3>On the record</h3><p class="explain">Documented controversies, criticisms, and legal matters. Every candidate is checked the same way. <a href="#about">How we decide</a></p>' + onRec + "</section>" +
      '<details class="sources"><summary>Sources (' + sources.length + ")</summary><ul>" +
      sources.map(function (s) { return "<li><span>" + esc(s.l) + "</span>" + srcLink(s.u) + "</li>"; }).join("") + "</ul></details>" +
      reportBox(c.name + " (" + it.race.title + ")") +
      "</div>";
    dlg.querySelector(".p-x").onclick = function () { dlg.close(); };
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    dlg.querySelector(".p-body").scrollTop = 0;
  }

  function wireCards(withYou) {
    var canHover = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    main.querySelectorAll(".cardx").forEach(function (b) {
      b.addEventListener("click", function () { openProfile(+b.dataset.card, withYou); });
      if (canHover) {
        var t;
        b.addEventListener("mouseenter", function () {
          t = setTimeout(function () { var it = CARDS[+b.dataset.card]; if (it && document.body.contains(b)) showPop(quickLook(it.c), b.querySelector(".cname")); }, 350);
        });
        b.addEventListener("mouseleave", function () { clearTimeout(t); hidePop(); });
      }
    });
  }

  var GROUP_LIST = [["police_and_public", "Police and the public"], ["immigrants", "Immigrants"], ["housing", "Housing and homelessness"], ["struggling_families", "Families who are struggling"], ["race_civil_rights", "Race and civil rights"], ["lgbtq", "LGBTQ people"], ["disability_veterans", "People with disabilities and veterans"], ["faith", "Faith and religious freedom"]];

  // ---------- compare ----------
  function allRaces() { return B.races.concat(B.house || []); }
  function compare() {
    CARDS = [];
    var rid = state.cmpRace || B.races[0].id;
    var race = allRaces().filter(function (r) { return r.id === rid; })[0] || B.races[0];
    var sel = (state.cmpSel && state.cmpSel[race.id]) || [];
    var showing = state.cmpShow && state.cmpShow === race.id && sel.length >= 2;
    var tabs = '<div class="cmp-tabs" role="tablist">' + B.races.map(function (r) {
      return '<button type="button" role="tab" class="cmp-tab" data-race="' + r.id + '" aria-selected="' + (r.id === race.id) + '">' + esc(r.title.replace(" (special election)", "")) + "</button>";
    }).join("") + "</div>" +
      ((B.house || []).length ? '<div class="cmp-house"><label class="pick-label" for="cmpHouse">Or compare a U.S. House race</label><select class="pick" id="cmpHouse"><option value="">Choose a district</option>' +
        B.house.map(function (h) { return '<option value="' + h.id + '"' + (h.id === race.id ? " selected" : "") + ">District " + h.district + "</option>"; }).join("") + "</select></div>" : "");

    var picker = '<div class="panel cmp-pick"><div class="cmp-pick-h"><h3>Choose who to compare</h3>' +
      '<button type="button" class="btn quiet" id="cmpAll">' + (sel.length === race.candidates.length ? "Clear all" : "Select all") + "</button></div>" +
      '<div class="cmp-list">' + race.candidates.map(function (c, i) {
        return '<label class="cmp-opt"><input type="checkbox" data-i="' + i + '"' + (sel.indexOf(i) >= 0 ? " checked" : "") + '><span class="box" aria-hidden="true"></span><span><b>' + esc(c.name) + "</b><small>" + esc(c.party) + (c.writeIn ? ", write-in" : "") + "</small></span></label>";
      }).join("") + "</div>" +
      '<div class="row"><button type="button" class="btn" id="cmpGo"' + (sel.length < 2 ? " disabled" : "") + ">Compare " + (sel.length >= 2 ? sel.length + " candidates" : "") + "</button>" +
      (sel.length < 2 ? '<span class="small muted">Pick at least two.</span>' : "") + "</div></div>";

    var table = "";
    if (showing) {
      var cs = sel.map(function (i) { return race.candidates[i]; });
      var onlyDiff = !!state.cmpDiff;
      // gather issues in order of first appearance
      var issues = [];
      cs.forEach(function (c) { c.stances.forEach(function (s) { if (issues.indexOf(s.issue) < 0) issues.push(s.issue); }); });
      var cols = "repeat(" + cs.length + ", minmax(" + (cs.length === 2 ? "150px" : "220px") + ", 1fr))";
      var head = '<div class="cmp-grid cmp-head" style="grid-template-columns:' + cols + '">' + cs.map(function (c) {
        return '<div class="cmp-cell"><b>' + esc(c.name) + "</b><small>" + esc(c.party) + "</small></div>";
      }).join("") + "</div>";
      var rows = 0, hidden = 0;
      var body = issues.map(function (iss) {
        var cells = cs.map(function (c) { return c.stances.filter(function (s) { return s.issue === iss; })[0]; });
        var stated = cells.filter(function (s) { return s && s.found; });
        if (!stated.length) { hidden++; return ""; }
        if (onlyDiff) {
          var pos = stated.map(function (s) { return s.pos; }).filter(function (p) { return p != null; });
          var same = stated.length === cs.length && pos.length === stated.length && Math.max.apply(null, pos) - Math.min.apply(null, pos) < 1;
          if (same) { hidden++; return ""; }
        }
        rows++;
        return '<section class="cmp-row"><h3>' + esc(iss) + '</h3><div class="cmp-grid" style="grid-template-columns:' + cols + '">' + cells.map(function (s, k) {
          return '<div class="cmp-cell"><span class="cmp-who">' + esc(cs[k].name) + "</span>" +
            (s && s.found ? "<p>" + rich(s.summary) + "</p>" + (s.url ? '<p class="src">' + srcLink(s.url) + "</p>" : "") : '<p class="none">No public position found.</p>') + "</div>";
        }).join("") + "</div></section>";
      }).join("");
      // who they stand up for
      var ppl = GROUP_LIST.map(function (g) {
        var cells = cs.map(function (c) { return (c.profile && c.profile.people && c.profile.people[g[0]]) || []; });
        if (!cells.some(function (x) { return x.length; })) return "";
        return '<section class="cmp-row"><h3>' + esc(g[1]) + '</h3><div class="cmp-grid" style="grid-template-columns:' + cols + '">' + cells.map(function (items, k) {
          return '<div class="cmp-cell"><span class="cmp-who">' + esc(cs[k].name) + "</span>" +
            (items.length ? '<ul class="rec">' + items.map(function (r) { return "<li>" + rich(r.text) + "</li>"; }).join("") + "</ul>" : '<p class="none">No public record found.</p>') + "</div>";
        }).join("") + "</div></section>";
      }).join("");
      table = '<div class="cmp-bar"><label class="switch"><input type="checkbox" id="cmpDiff"' + (onlyDiff ? " checked" : "") + '><span aria-hidden="true"></span>Show only where they differ</label>' +
        '<span class="small muted">' + rows + " issues shown" + (hidden ? ", " + hidden + " hidden" : "") + "</span></div>" +
        '<div class="cmp-scroll">' + head + "<h2 class=\"cmp-sec\">Where they stand</h2>" + (body || '<p class="none">No issues to show with this filter.</p>') +
        (ppl ? '<h2 class="cmp-sec">Who they stand up for</h2>' + ppl : "") + "</div>" +
        '<p class="small muted">"Show only where they differ" hides issues where every selected candidate has the same position on our scale. Tap a name on the Candidates page for the full profile, including what\'s on their record.</p>' + reportBox("Compare: " + race.title);
    }

    main.innerHTML = '<div class="section-head"><h1>Compare candidates</h1><p class="lede">Pick a race, choose two or more candidates, and see where they stand side by side.</p></div>' +
      tabs + picker + '<div id="cmpOut">' + table + "</div>";

    var ch = document.getElementById("cmpHouse");
    if (ch) ch.onchange = function () { if (!ch.value) return; state.cmpRace = ch.value; state.cmpShow = ""; save(); compare(); };
    main.querySelectorAll(".cmp-tab").forEach(function (t) {
      t.onclick = function () { state.cmpRace = t.dataset.race; state.cmpShow = ""; save(); compare(); };
    });
    main.querySelectorAll(".cmp-opt input").forEach(function (cb) {
      cb.onchange = function () {
        state.cmpSel = state.cmpSel || {};
        var cur = (state.cmpSel[race.id] || []).filter(function (x) { return x !== +cb.dataset.i; });
        if (cb.checked) cur.push(+cb.dataset.i);
        cur.sort(function (x, y) { return x - y; });
        state.cmpSel[race.id] = cur; if (state.cmpShow === race.id && cur.length < 2) state.cmpShow = "";
        save(); compare();
        var again = main.querySelector('.cmp-opt input[data-i="' + cb.dataset.i + '"]'); if (again) again.focus();
      };
    });
    document.getElementById("cmpAll").onclick = function () {
      state.cmpSel = state.cmpSel || {};
      state.cmpSel[race.id] = sel.length === race.candidates.length ? [] : race.candidates.map(function (c, i) { return i; });
      state.cmpShow = ""; save(); compare();
    };
    document.getElementById("cmpGo").onclick = function () {
      state.cmpShow = race.id; save(); compare();
      var out = document.getElementById("cmpOut"); if (out) out.scrollIntoView({ block: "start" });
    };
    var df = document.getElementById("cmpDiff");
    if (df) df.onchange = function () { state.cmpDiff = df.checked; save(); compare(); var o = document.getElementById("cmpOut"); if (o) o.scrollIntoView({ block: "start" }); };
  }

  function raceBlock(r, withScores) {
    var list = r.candidates.slice();
    var scores = {};
    if (withScores) {
      list.forEach(function (c) { scores[c.name] = scoreCandidate(c); });
      list.sort(function (a, b) {
        var x = scores[a.name].pct == null ? -1 : scores[a.name].pct, y = scores[b.name].pct == null ? -1 : scores[b.name].pct;
        return y - x;
      });
    } else {
      list.sort(function (a, b) { return (a.writeIn ? 1 : 0) - (b.writeIn ? 1 : 0); });
    }
    var none = withScores && !list.some(function (c) { return scores[c.name].pct != null; });
    return '<section class="race" id="r-' + r.id + '"><header class="race-head"><h2>' + esc(r.title) + '</h2><a class="cmp-link" href="#compare" data-cmp="' + r.id + '">Compare these candidates</a></header>' +
      '<p class="race-blurb">' + rich(r.blurb) + "</p>" +
      (none ? '<p class="race-note">Candidates here haven\'t taken enough public positions on these questions to score a match. Open a profile to compare what they have said.</p>' : "") +
      '<div class="cards">' + list.map(function (c) { return card(r, c, withScores ? scores[c.name] : null); }).join("") + "</div></section>";
  }

  document.addEventListener("click", function (e) {
    var l = e.target.closest && e.target.closest("[data-cmp]");
    if (!l) return;
    state.cmpRace = l.dataset.cmp; state.cmpSel = state.cmpSel || {};
    var r = allRaces().filter(function (x) { return x.id === l.dataset.cmp; })[0];
    if (!(state.cmpSel[r.id] || []).length) state.cmpSel[r.id] = r.candidates.map(function (c, i) { return i; }).filter(function (i) { return !r.candidates[i].writeIn; });
    state.cmpShow = state.cmpSel[r.id].length >= 2 ? r.id : ""; save();
  });

  function results() {
    CARDS = [];
    var n = answeredCount();
    if (!n) {
      main.innerHTML = '<div class="section-head"><h1>Your matches</h1><p class="lede">Answer a few questions first, then come back here.</p><a class="btn" href="#quiz">Start the questions</a></div>';
      return;
    }
    main.innerHTML = '<div class="section-head"><h1>Your matches</h1>' +
      '<p class="lede">Based on ' + n + " of " + B.questions.length + " answers. A higher number means a candidate's public record is closer to your answers on issues you both have a position on. Tap anyone to see why.</p>" +
      '<div class="row"><a class="btn ghost" href="#quiz" id="redo">Change my answers</a></div></div>' +
      B.races.map(function (r) { return raceBlock(r, true); }).join("") +
      '<p class="muted small">Amendments don\'t get a match score because they aren\'t people. <a href="#amendments">Read what each one does.</a></p>';
    wireCards(true);
    document.getElementById("redo").onclick = function () { state.i = 0; save(); };
  }

  function races() {
    CARDS = [];
    main.innerHTML = '<div class="section-head"><h1>Meet the candidates</h1><p class="lede">Everyone on ' + esc(S.name) + "'s statewide ballot, in the order of the state's official ballot list. Tap a name to see who they are, where they stand, and what's on their record.</p></div>" +
      B.races.map(function (r) { return raceBlock(r, false); }).join("");
    wireCards(false);
  }

  function amendments() {
    main.innerHTML = '<div class="section-head"><h1>Amendments</h1><p class="lede">These are proposed changes to ' + esc(S.name) + "'s constitution, and everyone in the state votes on them. Each one needs 60% yes votes to pass.</p></div>" +
      B.amendments.map(function (a) {
        var seen = {};
        var list = function (arr) {
          return "<ul>" + (arr || []).map(function (x) { return "<li>" + rich(x.argument, seen) + '<span class="who">' + esc(x.who) + "</span></li>"; }).join("") + "</ul>";
        };
        var srcs = [];
        (a.supporters || []).concat(a.opponents || []).forEach(function (x) { if (x.source_url) srcs.push(x.source_url); });
        (a.sources || []).forEach(function (u) { srcs.push(typeof u === "string" ? u : u.url); });
        srcs = srcs.filter(function (u, i) { return u && srcs.indexOf(u) === i; });
        return '<section class="race amd"><header class="race-head"><h2><span class="amd-n">Amendment ' + esc(a.number) + "</span>" + esc(a.title) + "</h2></header>" +
          '<div class="amd-body"><p class="amd-sum">' + rich(a.summary, seen) + "</p>" +
          '<div class="yn"><div class="yes"><h3><span class="oval-static filled" aria-hidden="true"></span>Voting yes</h3><p>' + rich(a.yes_means, seen) + "</p></div>" +
          '<div class="no"><h3><span class="oval-static" aria-hidden="true"></span>Voting no</h3><p>' + rich(a.no_means, seen) + "</p></div></div>" +
          (a.fiscal_impact ? '<h3 class="sub">What it would cost</h3><p class="small">' + rich(a.fiscal_impact, seen) + "</p>" : "") +
          '<div class="args"><div><h3 class="sub">What supporters say</h3>' + list(a.supporters) + '</div><div><h3 class="sub">What opponents say</h3>' + list(a.opponents) + "</div></div>" +
          '<details class="sources"><summary>Who put it on the ballot, and sources</summary><p class="small">' + esc(a.sponsor) + "</p><ul>" +
          srcs.map(function (u) { return "<li>" + srcLink(u) + "</li>"; }).join("") + "</ul></details>" + reportBox("Amendment " + a.number) + "</div></section>";
      }).join("");
  }

  function congress() {
    var C = B.congress;
    var lookup = (C && C.district_lookup_urls || []).map(function (l) { return "<li>" + link(l.url, l.label) + "</li>"; }).join("");
    var html = '<div class="section-head"><h1>U.S. House</h1><p class="lede">Your race for Congress depends on where you live. Find your district, then tap a name to see who they are, where they stand, and what\'s on their record.</p>' +
      '<div class="panel"><h3>Not sure of your district?</h3><ul class="links">' + lookup + "</ul>" + (C && C.map_note ? '<p class="small muted">' + rich(C.map_note) + "</p>" : "") + "</div></div>";
    if (!C || !C.districts) { main.innerHTML = html + '<p class="notice">District lists are coming soon.</p>'; return; }
    html += '<label for="q" class="pick-label">Search by district number, county, or name</label><input id="q" class="search" type="search" placeholder="For example: 14, Pinellas, or a name" autocomplete="off">' +
      ((B.house || []).length ? '<div id="dlist" class="house-list"></div>' : '<section class="race" style="margin-top:16px"><header class="race-head"><h2>Representative in Congress</h2><span class="vf">Vote for one</span></header><div id="dlist"></div></section>');
    main.innerHTML = html;
    var listEl = document.getElementById("dlist");
    function render(f) {
      f = (f || "").trim().toLowerCase();
      var rows = C.districts.filter(function (d) {
        if (!f) return true;
        if (/^\d+$/.test(f)) return String(d.district) === f;
        return (d.counties + " " + (d.candidates || []).map(function (c) { return c.name; }).join(" ")).toLowerCase().indexOf(f) >= 0;
      });
      if ((B.house || []).length) {
        CARDS = [];
        var hs = B.house.filter(function (h) { return rows.some(function (d) { return d.district === h.district; }); });
        var missing = rows.filter(function (d) { return !B.house.some(function (h) { return h.district === d.district; }); });
        listEl.innerHTML = hs.map(function (h) { return raceBlock(h, false); }).join("") + missing.map(function (d) {
          return '<div class="dist panel"><div class="dist-h"><h3>District ' + esc(d.district) + "</h3><p>" + esc(d.counties) + "</p></div><ul>" +
            (d.candidates || []).map(function (c) { return "<li><b>" + esc(c.name) + '</b><span class="party">' + esc(c.party) + "</span>" + (c.incumbent ? '<span class="badge">Incumbent</span>' : "") + "</li>"; }).join("") +
            "</ul>" + (d.notes ? '<p class="small muted">' + esc(d.notes) + "</p>" : '<p class="small muted">Full profiles for this district are coming soon.</p>') + "</div>";
        }).join("") || '<p class="race-note">No district matches that. Try a number from 1 to ' + C.districts.length + ", or a county name.</p>";
        wireCards(false);
        return;
      }
      listEl.innerHTML = rows.length ? rows.map(function (d) {
        return '<div class="dist"><div class="dist-h"><h3>District ' + esc(d.district) + "</h3><p>" + esc(d.counties) + "</p></div><ul>" +
          (d.candidates || []).map(function (c) {
            return "<li><b>" + (c.website ? link(c.website, c.name) : esc(c.name)) + '</b><span class="party">' + esc(c.party) + "</span>" + (c.incumbent ? '<span class="badge">Incumbent</span>' : "") + "</li>";
          }).join("") + "</ul>" + (d.notes ? '<p class="small muted">' + esc(d.notes) + "</p>" : "") + "</div>";
      }).join("") : '<p class="race-note">No district matches that. Try a number from 1 to ' + C.districts.length + ", or a county name.</p>";
    }
    render("");
    document.getElementById("q").addEventListener("input", function (e) { render(e.target.value); });
  }

  function words() {
    var list = G.slice().sort(function (a, b) { return a.term.localeCompare(b.term); });
    main.innerHTML = '<div class="section-head"><h1>Words to know</h1><p class="lede">Political terms in plain English. Around the site, any word with a dotted underline can be tapped to see what it means.</p>' +
      '<input id="gq" class="search" type="search" placeholder="Search a word" autocomplete="off"></div><div class="panel gl" id="gl"></div>';
    var el = document.getElementById("gl");
    function render(f) {
      f = (f || "").toLowerCase();
      var rows = list.filter(function (g) { return !f || (g.term + " " + (g.aliases || []).join(" ") + " " + g.definition).toLowerCase().indexOf(f) >= 0; });
      el.innerHTML = rows.length ? rows.map(function (g) { return '<div class="g"><h3>' + esc(g.term) + "</h3><p>" + esc(g.definition) + "</p></div>"; }).join("") : '<p class="none">' + (G.length ? "No matches." : "The word list is being finished.") + "</p>";
    }
    render("");
    document.getElementById("gq").addEventListener("input", function (e) { render(e.target.value); });
  }

  function parties() {
    var intro = (P.intro || []).map(function (x) { return '<div class="g"><h3>' + esc(x.title) + "</h3><p>" + esc(x.text) + "</p></div>"; }).join("");
    var cards = (P.parties || []).map(function (p) {
      return '<section class="race"><header class="race-head"><h2>' + esc(p.name) + "</h2></header><div class=\"amd-body\">" + partyHtml(p, true) +
        '<details class="sources"><summary>Sources</summary><ul>' + (p.source_urls || []).map(function (u) { return "<li>" + srcLink(u) + "</li>"; }).join("") + "</ul></details></div></section>";
    }).join("");
    var np = (P.not_parties || []).map(function (p) { return '<div class="g"><h3>' + esc(p.name) + "</h3><p>" + esc(p.text) + "</p></div>"; }).join("");
    main.innerHTML = '<div class="section-head"><h1>Political parties</h1><p class="lede">What each party on the ballot says it stands for, in its own words, summarized the same way for every party. A candidate\'s own positions can differ from their party\'s.</p></div>' +
      (intro ? '<div class="panel gl" style="margin-bottom:32px">' + intro + "</div>" : "") + cards +
      (np ? '<h2 style="margin:8px 0 14px">Not a party</h2><div class="panel gl">' + np + "</div>" : "");
  }

  function about() {
    var credits = Object.keys(B.photos || {}).map(function (k) { var p = B.photos[k]; return "<li>" + esc(p.alt) + ". " + esc(p.credit) + ". " + esc(p.license) + "." + "</li>"; }).join("");
    main.innerHTML =
      '<div class="section-head"><h1>How this works</h1></div><div class="panel prose">' +
      "<h3>Where the positions come from</h3><p>Only from what each candidate has said or done: their campaign website, surveys they answered, news reports of their own statements, official actions, and voting records. We never use an opponent's description of someone as their position, and we never fill in a blank based on party.</p>" +
      "<h3>The \"On the record\" section</h3><p>Every candidate is checked for the same things, with the same effort: their own recorded words, votes, court rulings, official investigations, and ethics findings. We include an item only if it comes from a primary record or at least two independent news outlets. We describe what happened in plain words without labels, give its current status, and include the candidate's response when there is one. If nothing meets the bar, we say so.</p>" +
      "<h3>Being neutral</h3><p>Neutral means the same rules for everyone. It doesn't mean hiding facts, and it doesn't mean making both sides sound equal when the record isn't. We report what happened and let you decide what it means.</p>" +
      "<h3>How matching works</h3><p>Each candidate's public position on a question is placed on the same five-point scale you answered on. For each question you both have a position on, we measure how close you are, weighted by how much you said it matters. A percentage only shows when a candidate has positions on at least " + MIN_OVERLAP + " of the questions you answered.</p>" +
      "<h3>What we don't do</h3><p>We don't endorse, rank, or recommend anyone. No campaign, party, or outside group has paid for or reviewed this site. Your answers stay on your device and are never sent anywhere.</p>" +
      "<h3>Mistakes</h3><p>If something's wrong or out of date, tell us with a link to the source, and we'll fix it.</p>" + reportBox("") +
      (credits ? '<h3>Photo credits</h3><ul class="small">' + credits + "</ul>" : "") +
      '<p style="margin-top:24px"><button class="btn ghost" id="clear">Clear my answers</button></p></div>';
    document.getElementById("clear").onclick = function () {
      state = { answers: {}, weights: {}, i: 0, place: state.place }; save();
      this.textContent = "Answers cleared";
    };
  }

  function focusMain() { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }

  function route() {
    hidePop();
    if (dlg.open) dlg.close();
    var page = (location.hash || "#").slice(1);
    if (page === "main") { main.focus(); return; }
    document.querySelectorAll("nav a").forEach(function (a) {
      if (a.dataset.nav === page || (page === "results" && a.dataset.nav === "quiz")) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var titles = { quiz: "Questions", results: "Your matches", races: "Candidates", amendments: "Amendments", congress: "Congress", words: "Words to know", parties: "Political parties", compare: "Compare", about: "How it works" };
    document.title = (titles[page] ? titles[page] + " · " : "") + "Ballot Match";
    var gated = ["quiz", "results", "races", "amendments", "congress", "compare"].indexOf(page) >= 0;
    if (gated && !chosen()) { state.place = S.name; save(); }
    stateChip(); tick();
    if (gated && !ready()) { main.innerHTML = notYet(); focusMain(); return; }
    if (page === "quiz") quiz();
    else if (page === "results") results();
    else if (page === "races") races();
    else if (page === "amendments") amendments();
    else if (page === "congress") congress();
    else if (page === "words") words();
    else if (page === "parties") parties();
    else if (page === "compare") compare();
    else if (page === "about") about();
    else home();
    focusMain();
  }
  window.addEventListener("hashchange", route);
  route();
})();
