/* =========================================
   nyxox.dev — site life support
   typewriter · scroll reveals · copy buttons
   avatar spin · konami-code CRT easter egg
   All vanilla JS, no dependencies.
   ========================================= */
(function () {
  'use strict';

  var docEl = document.documentElement;
  docEl.classList.add('js');

  var reduceMotion = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* -----------------------------------------
     Typewriter subtitle
     Server-rendered text is the no-JS fallback;
     this replaces it with a typed-out phrase.
     ----------------------------------------- */
  (function typewriter() {
    var el = document.getElementById('typewriter');
    if (!el || !el.dataset.config) return; // disabled in hugo.toml or no config

    var cfg;
    try { cfg = JSON.parse(el.dataset.config); } catch (err) { return; }

    var phrases = (cfg && cfg.phrases) ? cfg.phrases.filter(String) : [];
    phrases = phrases.filter(function (p) { return p && p.length; });
    if (!phrases.length) phrases = [el.textContent.trim()];

    var typeMs = (typeof cfg.typeMs === 'number') ? cfg.typeMs : 34;
    var deleteMs = (typeof cfg.deleteMs === 'number') ? cfg.deleteMs : 16;
    var holdMs = (typeof cfg.holdMs === 'number') ? cfg.holdMs : 2400;
    var lateStart = (typeof cfg.lateNightStart === 'number') ? cfg.lateNightStart : 0;
    var lateEnd = (typeof cfg.lateNightEnd === 'number') ? cfg.lateNightEnd : 5;

    // late-night bonus phrase (window like `lsof -i :hour`)
    var hour = new Date().getHours();
    if (cfg.lateNight && hour >= lateStart && hour < lateEnd) {
      phrases = [cfg.lateNight].concat(phrases);
    }

    if (reduceMotion) {
      el.textContent = phrases[0]; // no typing, keep static text
      return;
    }

    var pick = Math.floor(Math.random() * phrases.length);
    var index = pick;
    var pos = 0;
    var deleting = false;

    function tick() {
      var target = phrases[index];
      if (!deleting) {
        pos++;
        el.textContent = target.slice(0, pos);
        if (pos >= target.length) {
          deleting = true;
          window.setTimeout(tick, holdMs);
          return;
        }
        window.setTimeout(tick, typeMs);
      } else {
        pos--;
        el.textContent = target.slice(0, pos);
        if (pos <= 0) {
          deleting = false;
          index = (index + 1) % phrases.length;
          window.setTimeout(tick, 400); // brief pause on an empty line
          return;
        }
        window.setTimeout(tick, deleteMs);
      }
    }

    el.textContent = '';
    window.setTimeout(tick, 450);
  })();

  /* -----------------------------------------
     Scroll reveal — post cards, experience
     cards, quote entries. Progressive: only
     hidden when JS is on, never without it.
     ----------------------------------------- */
  (function scrollReveal() {
    var items = document.querySelectorAll('main article, .exp-card, .quote-entry');
    if (!items.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) return; // leave as-is

    var stagger = 0;

    function show(el, delay) {
      el.style.transitionDelay = delay + 'ms';
      el.classList.add('revealed');
      window.setTimeout(function () {
        // hand styling back to the original CSS once settled
        el.classList.remove('reveal', 'revealed');
        el.style.transitionDelay = '';
      }, delay + 650);
    }

    var observer = new IntersectionObserver(function (entries) {
      stagger = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        observer.unobserve(el);
        show(el, Math.min(stagger * 70, 350));
        stagger++;
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    items.forEach(function (el) {
      el.classList.add('reveal');
      observer.observe(el);
    });
  })();

  /* -----------------------------------------
     Copy buttons on code blocks
     Wraps `pre` (or its .highlight parent) so
     the button never fights the existing styles.
     ----------------------------------------- */
  (function copyButtons() {
    var pres = document.querySelectorAll('main pre');
    if (!pres.length) return;

    function makeCopy(text) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');

      var timer = null;
      btn.addEventListener('click', function () {
        function done(ok) {
          btn.textContent = ok ? 'copied ✓' : 'failed';
          btn.classList.toggle('copied', ok);
          btn.setAttribute('aria-label', ok ? 'Copied' : 'Copy failed');
          window.clearTimeout(timer);
          timer = window.setTimeout(function () {
            btn.textContent = 'copy';
            btn.classList.remove('copied');
            btn.setAttribute('aria-label', 'Copy code to clipboard');
          }, 1500);
        }

        function fallbackCopy() {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
          document.body.removeChild(ta);
          done(ok);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, fallbackCopy);
        } else {
          fallbackCopy();
        }
      });
      return btn;
    }

    pres.forEach(function (pre) {
      var block = pre.closest('.highlight') || pre;
      if (block.classList.contains('code-frame')) return; // already wrapped
      var frame = document.createElement('div');
      frame.className = 'code-frame';
      block.parentNode.insertBefore(frame, block);
      frame.appendChild(block);
      var code = block.querySelector('code');
      var text = (code && code.textContent) ? code.textContent : block.textContent;
      frame.appendChild(makeCopy(text.replace(/\n$/, '')));
    });
  })();

  /* -----------------------------------------
     Avatar spin — click the profile pic for a
     coin-flip before it takes you home.
     ----------------------------------------- */
  (function avatarSpin() {
    var link = document.querySelector('header a.site-image');
    if (!link || reduceMotion) return;
    link.addEventListener('click', function (e) {
      if (link.classList.contains('avatar-spin')) return;
      e.preventDefault();
      link.classList.add('avatar-spin');
      var href = link.getAttribute('href');
      window.setTimeout(function () {
        // don't force a reload if we're already at the link target
        if (new URL(href, window.location.href).href !== window.location.href) {
          window.location.href = href;
        }
      }, 430);
    });
  })();

  /* -----------------------------------------
     Konami code → CRT mode
     ↑ ↑ ↓ ↓ ← → ← → B A
     (persisted; also reachable via `theme crt`
     in the hidden terminal)
     ----------------------------------------- */
  var crtTitleBackup = '';

  function setCRT(on) {
    var active = docEl.classList.contains('crt');
    if (!!on === active) return;
    docEl.classList.toggle('crt', !!on);
    try { localStorage.setItem('nyxox-crt', on ? '1' : '0'); } catch (err) { /* private mode */ }
    if (on) {
      if (!crtTitleBackup) {
        crtTitleBackup = document.title;
        try { sessionStorage.setItem('nyxox-crt-title', crtTitleBackup); } catch (err) { /* ignore */ }
      }
      document.title = 'nyxox@dev:~';
      console.log('%c crt mode engaged ', 'background:#fff;color:#000;font-weight:bold');
    } else {
      if (!crtTitleBackup) {
        try { crtTitleBackup = sessionStorage.getItem('nyxox-crt-title') || document.title; } catch (err) { /* ignore */ }
      }
      document.title = crtTitleBackup || document.title;
      crtTitleBackup = '';
      console.log('%c crt mode off ', 'background:#000;color:#fff;font-weight:bold');
    }
  }

  // restore persisted state on load (title swap included, for consistency)
  try { if (localStorage.getItem('nyxox-crt') === '1') setCRT(true); } catch (err) { /* ignore */ }

  (function konami() {
    var seq = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown',
               'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
    var progress = 0;

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      var key = e.key.toLowerCase();
      if (key === seq[progress]) {
        progress++;
        if (progress === seq.length) {
          progress = 0;
          setCRT(!docEl.classList.contains('crt'));
        }
      } else {
        // a wrong key can still be the *start* of the sequence
        progress = (key === seq[0]) ? 1 : 0;
      }
    });
  })();

  // terminal.js reaches in for `theme crt`
  window.NyxoxFX = { setCRT: setCRT };

  /* -----------------------------------------
     For the devtools crowd — yes, you.
     ----------------------------------------- */
  try {
    console.log('%c nyxox.dev ', 'background:#fff;color:#000;padding:2px 6px;font-weight:bold');
    console.log('%cyou found the console. press ` or the ~ in the footer for a shell.',
      'color:#aaa;font-style:italic');
  } catch (err) { /* ignore */ }
})();
