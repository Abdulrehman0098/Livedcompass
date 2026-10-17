/* ============================================================
   LIVE COMPASS — theme.js
   Shared dark/light theme engine for all content pages.
   Mirrors the inline engine in index.html.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'livecompass-theme';

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      var label = btn.querySelector('.theme-label');
      if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
    }
  }

  function init() {
    var theme = 'dark';
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') theme = saved;
    } catch (e) { /* storage unavailable */ }
    apply(theme);

    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        apply(next);
        try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
      });
    }

    var year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
