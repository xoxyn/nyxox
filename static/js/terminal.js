/* =========================================
   nyxoshell — the hidden terminal
   Open with ` or ~ (or the footer ~ link).
   Lazily hydrates from /index.json so ls,
   cat, open and search work for real.
   ========================================= */
(function () {
  'use strict';

  var panel = document.getElementById('terminal-panel');
  if (!panel) return;

  var output = document.getElementById('terminal-output');
  var scrollBox = document.getElementById('terminal-scroll');
  var form = document.getElementById('terminal-prompt');
  var input = document.getElementById('terminal-input');
  var closeBtn = document.getElementById('terminal-close');
  var cwdLabel = document.getElementById('terminal-cwd');

  var reduceMotion = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var base = (document.body.dataset.baseurl || '/').replace(/\/?$/, '/');
  // index.json and navigation stay site-relative so local mirrors of the
  // production build don't accidentally hit the live site (CORS)
  var sitePath = (new URL(base, window.location.href).pathname) || '/';
  var isOpen = false;
  var greeted = false;
  var openedBy = null;         // element to restore focus to on close
  var cwd = '~';
  var history = [];
  var historyPos = -1;

  var EMAIL = 'numterminal@gmail.com';
  var HANDLE = 'xoxyn';

  /* ---------- shared data (also used by the 404 page) ---------- */
  window.NyxoxData = {
    request: function () {
      if (this._promise) return this._promise;
      var self = this;
      this._promise = fetch(sitePath + 'index.json')
        .then(function (r) {
          if (!r.ok) throw new Error('index.json ' + r.status);
          return r.json();
        })
        .then(function (data) { self.posts = data; return data; })
        .catch(function (err) {
          self._promise = null;
          throw err;
        });
      return this._promise;
    },
    posts: null
  };

  /* ---------- printing helpers (textContent = injection-proof) ---------- */
  function scrollDown() {
    scrollBox.scrollTop = scrollBox.scrollHeight;
  }

  function print(text, cls) {
    var div = document.createElement('div');
    div.className = 't-line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    output.appendChild(div);
    scrollDown();
    return div;
  }

  function printPre(text, cls) {
    var div = document.createElement('div');
    div.className = 't-line t-pre' + (cls ? ' ' + cls : '');
    div.textContent = text;
    output.appendChild(div);
    scrollDown();
    return div;
  }

  function printLink(text, href) {
    var div = document.createElement('div');
    div.className = 't-line';
    var a = document.createElement('a');
    a.textContent = text;
    a.href = href;
    div.appendChild(a);
    output.appendChild(div);
    scrollDown();
  }

  function printLinkRow(label, href) {
    var div = document.createElement('div');
    div.className = 't-line';
    var a = document.createElement('a');
    a.textContent = label;
    a.href = href;
    div.appendChild(a);
    output.appendChild(div);
    scrollDown();
  }

  function printRaw(node) {
    output.appendChild(node);
    scrollDown();
  }

  function clear() {
    output.textContent = '';
  }

  /* ---------- url helpers ---------- */
  // index.json keeps HTML entities (&rsquo; etc.) in .Plain/.Title — decode for display
  function decodeEntities(text) {
    if (!text || text.indexOf('&') === -1) return text;
    var ta = document.createElement('textarea');
    ta.innerHTML = text;
    return ta.value;
  }

  function slugOf(post) {
    var parts = (post.url || '').split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function findBySlug(name) {
    if (!name) return [];
    var q = name.toLowerCase().replace(/^~?\/?(posts\/)?/, '').replace(/\/$/, '');
    var hits = [];
    (window.NyxoxData.posts || []).forEach(function (p) {
      var slug = slugOf(p);
      if (slug.toLowerCase() === q) hits.push(p);
    });
    if (hits.length) return hits;
    return (window.NyxoxData.posts || []).filter(function (p) {
      return slugOf(p).toLowerCase().indexOf(q) !== -1;
    });
  }

  /* ---------- data-driven commands ---------- */
  var lunrIndex = null;

  function boxed(lines) {
    var width = Math.max.apply(null, lines.map(function (l) { return l.length; }));
    var border = '─';
    return ['┌' + border.repeat(width + 2) + '┐']
      .concat(lines.map(function (l) { return '│ ' + l.padEnd(width) + ' │'; }))
      .concat(['└' + border.repeat(width + 2) + '┘'])
      .join('\n');
  }

  function buildIndex(posts) {
    if (!window.lunr) return null;
    return window.lunr(function () {
      this.ref('url');
      this.field('title', { boost: 10 });
      this.field('contents');
      posts.forEach(function (doc) {
        this.add({ url: doc.url, title: doc.title, contents: doc.contents || '' });
      }, this);
    });
  }

  function searchPosts(query, done) {
    window.NyxoxData.request().then(function (posts) {
      try {
        if (window.lunr) {
          if (!lunrIndex) lunrIndex = buildIndex(posts);
          var hits = lunrIndex.search(query).slice(0, 6);
          var out = hits.map(function (h) {
            return posts.find(function (p) { return p.url === h.ref; });
          }).filter(Boolean);
          if (out.length) { done(out); return; }
        }
      } catch (err) { /* fall through to substring search */ }

      var q = query.toLowerCase();
      var loose = posts.filter(function (p) {
        return ((p.title || '') + ' ' + (p.contents || '')).toLowerCase().indexOf(q) !== -1;
      }).slice(0, 6);
      done(loose);
    }).catch(function () {
      print('search: index unavailable (' + 'check your connection)', 't-err');
    });
  }

  function earliestDate(posts) {
    var min = null;
    posts.forEach(function (p) {
      if (!p.date) return;
      var t = Date.parse(p.date);
      // '0001-01-01' (zero-valued dates) parses fine but is nonsense; floor at ~1990
      if (isNaN(t) || t < 631152000000) return;
      if (min === null || t < min) min = t;
    });
    return min;
  }

  /* ---------- commands ---------- */
  var commands = {
    help: function () {
      print('available commands:', 't-dim');
      var rows = [
        ['help', 'this output'],
        ['ls [dir]', 'list pages & posts'],
        ['cd <dir> | cd ~', 'change directory'],
        ['cat <file>', 'preview a post'],
        ['open <file>', 'goto a post/page'],
        ['search <query>', 'search the site'],
        ['whoami', 'who is nyxox'],
        ['neofetch', 'system info'],
        ['date', 'current time'],
        ['echo <msg>', 'say it back'],
        ['theme crt [on|off]', 'toggle crt mode'],
        ['sudo hire-me', 'why not'],
        ['rm -rf /', 'you wish'],
        ['clear', 'wipe the screen'],
        ['exit', 'close terminal']
      ];
      rows.forEach(function (row) {
        var div = document.createElement('div');
        div.className = 't-line t-help';
        var cmd = document.createElement('span');
        cmd.className = 't-helpcmd';
        cmd.textContent = row[0];
        var desc = document.createElement('span');
        desc.textContent = row[1];
        div.appendChild(cmd);
        div.appendChild(desc);
        printRaw(div);
      });
    },

    clear: function () { clear(); },

    ls: function (args) {
      window.NyxoxData.request().then(function (posts) {
        var sections = {};
        var roots = [];
        var seen = {};
        posts.forEach(function (p) {
          var parts = (p.url || '').split('/').filter(Boolean);
          if (parts.length > 1) {
            var sec = parts[0];
            if (!sections[sec]) sections[sec] = [];
            sections[sec].push(p);
          } else if (parts.length === 1 && !seen[parts[0]]) {
            seen[parts[0]] = true;
            roots.push(parts[0] + '/');
          }
        });

        // `ls <dir>` wins over the cd-cwd, when provided
        var target = cwd !== '~' ? cwd : (args[0] ? args[0].replace(/\/+$/, '') : '~');

        if (target === '~') {
          print('total ' + posts.length + ' pages', 't-dim');
          print(roots.join('   '), 't-dir');
        }

        Object.keys(sections).forEach(function (sec) {
          if (target !== '~' && target !== sec) return;
          print(sec + '/  (' + sections[sec].length + ')', 't-dir');
          sections[sec].slice().reverse().forEach(function (p) {
            var div = document.createElement('div');
            div.className = 't-line';
            div.textContent = '  ' + slugOf(p);
            if (p.date) div.textContent += '   # ' + p.date;
            printRaw(div);
          });
        });
      }).catch(function () {
        print('ls: index unavailable', 't-err');
      });
    },

    cd: function (args) {
      var target = args[0] || '~';
      if (target === '~' || target === '/' || target === '..') {
        cwd = '~';
      } else {
        cwd = target.replace(/^~\/?/, '').replace(/\/+$/, '') || '~';
      }
      cwdLabel.textContent = cwd;
    },

    cat: function (args) {
      var name = args[0];
      if (!name) { print('cat: missing operand', 't-err'); return; }
      window.NyxoxData.request().then(function () {
        var hits = findBySlug(name);
        if (!hits.length) { print('cat: no such file: ' + name, 't-err'); return; }
        var p = hits[0];
        print(decodeEntities(p.title) + '  (' + (p.date || 'undated') + ')', 't-title');
        var body = decodeEntities((p.contents || '').trim());
        if (body.length > 320) body = body.slice(0, 320).replace(/\s+\S*$/, '') + '…';
        print(body || '(empty)', 't-dim');
        printLinkRow('→ open: ' + p.url, p.url);
      }).catch(function () {
        print('cat: index unavailable', 't-err');
      });
    },

    open: function (args) {
      window.NyxoxData.request().then(function () {
        var name = args[0];
        if (!name) { print('open: missing operand', 't-err'); return; }
        if (name === 'home' || name === '~' || name === '/') {
          printLinkRow('→ ' + sitePath, sitePath);
          window.location.href = sitePath;
          return;
        }
        var hits = findBySlug(name);
        if (!hits.length) { print('open: no such file: ' + name, 't-err'); return; }
        if (hits.length > 1) {
          print('open: ambiguous, candidates:', 't-err');
          hits.forEach(function (p) { printLinkRow('  ' + p.url, p.url); });
          return;
        }
        var post = hits[0];
        printLinkRow('→ ' + post.url, post.url);
        window.location.href = post.url;
      }).catch(function () {
        print('open: index unavailable', 't-err');
      });
    },

    search: function (args) {
      var query = args.join(' ').trim();
      if (!query) { print('search: what are we looking for?', 't-err'); return; }
      searchPosts(query, function (hits) {
        if (!hits.length) { print('no results for "' + query + '" — even grep gave up', 't-dim'); return; }
        print(hits.length + ' hit(s) for "' + query + '":', 't-dim');
        hits.forEach(function (p) {
          printLinkRow('  ' + decodeEntities(p.title || p.url) + '  (' + p.url + ')', p.url);
        });
      });
    },

    whoami: function () {
      print('Victor Chinekezi (nyxox) — software engineer.');
      print('backend & systems, AI infrastructure, the occasional 3D render.', 't-dim');
    },

    neofetch: function () {
      function neofetchBox(count, days) {
        return boxed([
          'nyxox@nyxox.dev',
          '--------------------------------------',
          'role:    backend / systems / aiinfra',
          'stack:   C++ · Go · Python · React',
          'shell:   nyxoshell v1.0',
          'pages:   ' + count,
          'uptime:  ' + (days ? days + 'd since first post' : 'fresh boot')
        ]);
      }
      window.NyxoxData.request().then(function (posts) {
        var min = earliestDate(posts);
        var days = min ? Math.max(1, Math.floor((Date.now() - min) / 86400000)) : null;
        printPre(neofetchBox(posts.length, days), 't-box');
      }).catch(function () {
        printPre(neofetchBox('?', null), 't-box');
      });
    },

    date: function () {
      var now = new Date();
      print(now.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'medium' }));
    },

    echo: function (args) {
      print(args.join(' ') || '');
    },

    sudo: function (args) {
      var joined = args.join(' ').toLowerCase();
      if (joined.indexOf('hire-me') !== -1 || joined.indexOf('hire me') !== -1) {
        printPre(boxed([
          'sudo hire-me — accepted ✓',
          'role: whatever ships next',
          'inbox: ' + EMAIL
        ]), 't-box');
        printLinkRow('→ ' + EMAIL, 'mailto:' + EMAIL);
        return;
      }
      print('visitor is not in the sudoers file. this incident will be reported.', 't-err');
    },

    rm: function (args) {
      var expr = args.join(' ');
      if (/(^|\s)-\w*r\w*f\w*(\s|$)|(^|\s)-[rf]+\b/.test(expr) && /(^|\s)\/(\s|$)|(^|\s)\*(\s|$)|(^|\s)~/.test(expr)) {
        print('removing / … really? deleting your root filesystem.', 't-err');
        glitch();
        window.setTimeout(function () {
          print('just kidding. this incident will be reported to ' + HANDLE + '.', 't-dim');
        }, reduceMotion ? 300 : 700);
      } else {
        print('rm: missing operand', 't-err');
      }
    },

    theme: function (args) {
      var sub = (args[0] || '').toLowerCase();
      if (sub !== 'crt') { print('theme: known themes: crt', 't-err'); return; }
      var fx = window.NyxoxFX;
      if (!fx) { print('theme: crt unavailable in this session', 't-err'); return; }
      var flag = (args[1] || '').toLowerCase();
      if (flag === 'on') fx.setCRT(true);
      else if (flag === 'off') fx.setCRT(false);
      else fx.setCRT(!document.documentElement.classList.contains('crt'));
    },

    exit: function () { close(); }
  };

  var aliases = {
    q: 'exit',
    quit: 'exit',
    close: 'exit',
    whois: 'whoami',
    dir: 'ls'
  };

  function glitch() {
    print('█▓▒░ kernel panic ░▒▓█ (nope)', 't-err');
    if (reduceMotion) return;
    document.body.classList.add('terminal-glitch');
    window.setTimeout(function () {
      document.body.classList.remove('terminal-glitch');
    }, 500);
  }

  /* ---------- command dispatch ---------- */
  function execute(raw) {
    var line = raw.trim();
    var echo = document.createElement('div');
    echo.className = 't-line t-cmd';
    echo.textContent = 'visitor@nyxox:' + cwd + '$ ' + line;
    output.appendChild(echo);

    if (!line) { scrollDown(); return; }

    history.push(line);
    historyPos = history.length;

    var argv = line.split(/\s+/);
    var cmd = argv[0].toLowerCase();
    if (aliases[cmd]) cmd = aliases[cmd];
    var fn = commands[cmd];
    if (fn) {
      fn(argv.slice(1));
    } else {
      print('nyxoshell: command not found: ' + cmd + " — try 'help'", 't-err');
    }
    scrollDown();
  }

  /* ---------- open / close ---------- */
  function greet() {
    if (greeted) return;
    greeted = true;
    print('nyxoshell v1.0 — you found it. type \'help\' to begin.', 't-dim');
  }

  function open(restoredBy) {
    if (isOpen) { input.focus(); return; }
    isOpen = true;
    openedBy = restoredBy || document.activeElement;
    panel.hidden = false;
    // once found, there's no reason to ever hint about it again
    try { localStorage.setItem('nyxox-opened', '1'); } catch (err) { /* private mode */ }
    var tip = document.getElementById('nyx-tip');
    if (tip) tip.parentNode.removeChild(tip);
    window.requestAnimationFrame(function () {
      panel.classList.add('terminal-visible');
    });
    greet();
    window.setTimeout(function () { input.focus(); }, 60);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove('terminal-visible');
    window.setTimeout(function () { panel.hidden = true; }, 230);
    if (openedBy && openedBy.focus) {
      try { openedBy.focus(); } catch (err) { /* ignore */ }
    }
    openedBy = null;
  }

  window.NyxoxTerminal = { open: open, close: close, run: execute };

  /* ---------- wiring ---------- */
  document.addEventListener('keydown', function (e) {
    // Esc closes everywhere, even while focused in the input
    if (isOpen && e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing) return; // typing '~' into inputs must stay a normal character

    if (e.key === '`' || e.key === '~') {
      e.preventDefault();
      if (isOpen) close(); else open();
    }
  });

  closeBtn.addEventListener('click', close);

  panel.addEventListener('mousedown', function (e) {
    if (e.target === panel) close();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var value = input.value;
    input.value = '';
    execute(value);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp') {
      if (historyPos > 0) {
        e.preventDefault();
        historyPos--;
        input.value = history[historyPos] || '';
      }
    } else if (e.key === 'ArrowDown') {
      if (historyPos < history.length) {
        e.preventDefault();
        historyPos++;
        input.value = history[historyPos] || '';
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clear();
    }
  });

  var footerEgg = document.getElementById('footer-egg');
  if (footerEgg) {
    footerEgg.addEventListener('click', function (e) {
      e.preventDefault();
      if (isOpen) close(); else open(footerEgg);
    });
  }

  /* ---------- 404 page auto-open (once per tab session) ---------- */
  if (document.querySelector('main[data-egg]')) {
    var seen = null;
    try { seen = sessionStorage.getItem('nyxoshell-404'); } catch (err) { /* ignore */ }
    if (!seen) {
      try { sessionStorage.setItem('nyxoshell-404', '1'); } catch (err) { /* ignore */ }
      window.setTimeout(function () {
        open();
        print("zsh: last flight attempt crashed ✈  (you're on the 404 page)", 't-err');
        print("tip: help · ls · open posts · search ghost", 't-dim');
      }, 650);
    }
  }
})();
