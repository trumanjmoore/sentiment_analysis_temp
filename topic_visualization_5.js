(function () {
  'use strict';

  // ======================================================================
  // Per-instance configuration.
  //
  // Two <script> tags can load this file on the same page. Each tag sets a
  // data-suffix attribute:
  //     ""   → 3-class view, target id "topic-explorer",   file "treemap_data.json"
  //     "-5" → 5-class view, target id "topic-explorer-5", file "treemap_data_5class.json"
  //
  // document.currentScript is captured SYNCHRONOUSLY at the top of this IIFE,
  // before init() is deferred to DOMContentLoaded, so the value is correct
  // when the browser executes the file.
  // ======================================================================
  const _script = document.currentScript;
  const _suffix = (_script && _script.dataset && _script.dataset.suffix) || '';
  const _is5 = _suffix === '-5';

  const _rootId = 'topic-explorer' + _suffix;
  const _topicsId = 'topics-container' + _suffix;
  const _searchId = 'search-input' + _suffix;

  const _LABELS = _is5
    ? ['VERY_POSITIVE', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'VERY_NEGATIVE']
    : ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];

  // ======================================================================
  // Color palettes (3-class and 5-class).
  // ======================================================================
  function getHeaderColor(sentiment) {
    if (sentiment === 'VERY_POSITIVE') return '#a5d6a7';
    if (sentiment === 'POSITIVE') return '#d4edda';
    if (sentiment === 'NEUTRAL') return '#e9e9e9';
    if (sentiment === 'NEGATIVE') return '#f8d7da';
    if (sentiment === 'VERY_NEGATIVE') return '#e8a6ab';
    return '#f8d7da';
  }

  function getDotColor(sentiment) {
    if (sentiment === 'VERY_POSITIVE') return '#2e7d32';
    if (sentiment === 'POSITIVE') return '#4a9e5c';
    if (sentiment === 'NEUTRAL') return '#aaa';
    if (sentiment === 'NEGATIVE') return '#c0392b';
    if (sentiment === 'VERY_NEGATIVE') return '#8b0000';
    return '#c0392b';
  }

  function getSortOrder(sentiment) {
    const order3 = { POSITIVE: 0, NEUTRAL: 1, NEGATIVE: 2 };
    const order5 = {
      VERY_POSITIVE: 0, POSITIVE: 1, NEUTRAL: 2,
      NEGATIVE: 3, VERY_NEGATIVE: 4,
    };
    const map = _is5 ? order5 : order3;
    return (sentiment in map) ? map[sentiment] : 99;
  }

  function prettyLabel(lbl) {
    return lbl.toLowerCase().replace(/_/g, ' ');
  }

  // ======================================================================
  // Search.
  // ======================================================================
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightText(text, query) {
    const escaped = escapeRegex(query);
    const regex = new RegExp(escaped, 'gi');
    return text.replace(regex, function (match) {
      return '<mark>' + match + '</mark>';
    });
  }

  function search() {
    const input = document.getElementById(_searchId);
    if (!input) return;
    const query = input.value.trim();

    // Scoped to THIS instance's root — sibling treemap unaffected.
    const cards = document.querySelectorAll('#' + _rootId + ' .topic-card');
    cards.forEach(function (card) {
      const rows = card.querySelectorAll('.sentence-row');
      const panel = card.querySelector('.sentences-panel');
      let matchCount = 0;

      rows.forEach(function (row) {
        const textEl = row.querySelector('.sentence-text');
        if (!textEl.dataset.original) {
          textEl.dataset.original = textEl.textContent;
        }
        const original = textEl.dataset.original;

        if (query === '') {
          textEl.innerHTML = original;
          row.classList.remove('hidden');
        } else if (original.toLowerCase().includes(query.toLowerCase())) {
          textEl.innerHTML = highlightText(original, query);
          row.classList.remove('hidden');
          matchCount++;
        } else {
          textEl.innerHTML = original;
          row.classList.add('hidden');
        }
      });

      if (query === '') {
        panel.classList.remove('open');
      } else if (matchCount > 0) {
        panel.classList.add('open');
      } else {
        panel.classList.remove('open');
      }
    });
  }

  // ======================================================================
  // Rendering.
  // ======================================================================
  function renderTopics(data) {
    const container = document.getElementById(_topicsId);
    if (!container) return;
    container.innerHTML = '';

    data.children.forEach(function (topic) {
      topic.children.sort(function (a, b) {
        return getSortOrder(a.sentiment) - getSortOrder(b.sentiment);
      });

      // Per-label counts for whichever scheme is active.
      const counts = {};
      _LABELS.forEach(function (lbl) { counts[lbl] = 0; });
      topic.children.forEach(function (s) {
        if (s.sentiment in counts) counts[s.sentiment] += 1;
      });

      let sentenceRowsHTML = '';
      topic.children.forEach(function (sentence) {
        const dotColor = getDotColor(sentence.sentiment);
        sentenceRowsHTML +=
          '<div class="sentence-row">' +
          '<div class="sentence-dot" style="background: ' + dotColor + ';"></div>' +
          '<div class="sentence-text">' + sentence.name + '</div>' +
          '</div>';
      });

      let countsHTML = '';
      _LABELS.forEach(function (lbl) {
        countsHTML +=
          '<span style="color: ' + getDotColor(lbl) + ';">&#9679; ' +
          counts[lbl] + ' ' + prettyLabel(lbl) +
          '</span>';
      });

      const cardHTML =
        '<div class="topic-card">' +
        '<div class="topic-header" style="background: ' +
        getHeaderColor(topic.sentiment) + ';">' +
        '<span class="topic-name">' + topic.name + '</span>' +
        '<span class="topic-counts">' + countsHTML + '</span>' +
        '</div>' +
        '<div class="sentences-panel">' +
        sentenceRowsHTML +
        '</div>' +
        '</div>';

      container.insertAdjacentHTML('beforeend', cardHTML);
    });
  }

  // ======================================================================
  // Data fetching.
  //
  // Picks the Omeka media link whose filename matches this instance's
  // scheme:
  //   3-class  → any *.json that does NOT contain "_5class"
  //   5-class  → any *.json that DOES contain "_5class"
  // ======================================================================
  function matchesFile(href) {
    const lower = href.toLowerCase();
    if (!lower.endsWith('.json')) return false;
    if (_is5) return lower.includes('_5class');
    return !lower.includes('_5class');
  }

  async function fetchTopicData(itemId) {
    // Works even if Omeka lives in a subdirectory like /omeka/
    const apiBase = window.location.pathname.split('/s/')[0] + '/api';
  
    const listRes = await fetch(apiBase + '/media?item_id=' + itemId);
    if (!listRes.ok) throw new Error('Media API failed: ' + listRes.status);
    const mediaList = await listRes.json();
  
    const match = mediaList.find(function (m) {
      const src = (m['o:source'] || '').toLowerCase();
      if (!src.endsWith('.json')) return false;
      return _is5 ? src.includes('_5class') : !src.includes('_5class');
    });
  
    if (!match) {
      throw new Error(
        'No matching JSON media found ' +
        (_is5 ? '(expected source *_5class.json)' : '(expected source *.json, non-_5class)')
      );
    }
  
    const dataResponse = await fetch(match['o:original_url']);
    if (!dataResponse.ok) {
      throw new Error('JSON fetch failed: ' + dataResponse.status);
    }
    return dataResponse.json();
}

  // ======================================================================
  // Page context.
  // ======================================================================
  function getItemIdFromUrl() {
    const match = window.location.pathname.match(/\/item\/(\d+)/);
    return match ? match[1] : null;
  }

  function isItemPage() {
    return /\/item\/\d+/.test(window.location.pathname);
  }

  function ensureContainer() {
    if (document.getElementById(_rootId)) return;

    const container = document.createElement('div');
    container.id = _rootId;

    const headingText = _is5
      ? 'Interview Topics (5-class Sentiment)'
      : 'Interview Topics';

    container.innerHTML =
      '<h1>' + headingText + '</h1>' +
      '<input class="search-bar" type="text" id="' + _searchId +
      '" placeholder="Search sentences...">' +
      '<div id="' + _topicsId + '"></div>';

    const main = document.querySelector('main, article, #content, .content');
    if (main) {
      main.appendChild(container);
      return;
    }

    const footer =
      document.querySelector('footer') || document.querySelector('#footer');
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(container, footer);
      return;
    }

    document.body.appendChild(container);
  }

  // ======================================================================
  // Bootstrap.
  // ======================================================================
  function init() {
    if (!isItemPage()) return;

    ensureContainer();

    const searchInput = document.getElementById(_searchId);
    if (searchInput) {
      searchInput.addEventListener('input', search);
    }

    const container = document.getElementById(_topicsId);
    if (container) {
      container.addEventListener('click', function (e) {
        const header = e.target.closest('.topic-header');
        if (!header) return;
        const card = header.closest('.topic-card');
        if (!card) return;
        const panel = card.querySelector('.sentences-panel');
        if (panel) panel.classList.toggle('open');
      });
      container.innerHTML = '<div class="loading">Loading topics&hellip;</div>';
    }

    const itemId = getItemIdFromUrl();
    if (!itemId) {
      if (container) {
        container.innerHTML =
          '<div class="error">No item context available.</div>';
      }
      return;
    }

    fetchTopicData(itemId)
      .then(function (data) {
        renderTopics(data);
      })
      .catch(function (err) {
        console.error('Topic explorer error:', err);
        if (container) {
          container.innerHTML =
            '<div class="error">Could not load topic data.</div>';
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
