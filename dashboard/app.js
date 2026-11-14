// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan, and the comparables the model was read from. No network:
// every byte it shows is in data.js. The drawer's farm plan can be copied as plain text.
//
// The model in one function: the page recomputes a row from the snapshot figures and checks the
// number board.json carries, so the page's code and the board's data are visibly the same
// arithmetic. The farm plan is the same derivation main.ts writes to board.json: category,
// chains, TVL and age decide the action, the capital, the hold and every cost and time.
// No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(3); }

  // implied = round(tvl * comparable_multiple * growthMult * maturityMult), the model in lib/model.ts.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.comparable_multiple * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // --- farm plan: the same derivation main.ts writes to board.json -------------------------
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) {
    if (/ethereum/i.test(chain)) return { tx: 'about $8 of gas', weekly: 'about $5 of gas a week' };
    if (/solana/i.test(chain)) return { tx: 'about $0.05 of gas', weekly: 'a few cents of gas a week' };
    if (/bitcoin/i.test(chain)) return { tx: 'about $3 of gas', weekly: 'about $2 of gas a week' };
    return { tx: 'about $0.50 of gas', weekly: 'about $0.30 of gas a week' };
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('aggregator') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s highest-yield pool on " + chain + ' and keep the position open.';
    if (c.indexOf('option') >= 0) return 'Deposit $' + capital + ' of USDC as collateral on ' + name + ' and open one small option position.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s private pool on " + chain + ' and keep the receipt.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + " of " + name + "'s index token on " + chain + ' and hold it.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var action = actionFor(p, capital, chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and ' + gas.tx, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: gas.weekly, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // Copy a farm plan as plain text: the clipboard API where it exists, a hidden textarea
  // and execCommand where it does not. No network, no new dependency.
  function copyText(text, button) {
    function done() {
      var label = button.textContent;
      button.textContent = 'Copied';
      setTimeout(function () { button.textContent = label; }, 1500);
    }
    function fallback() {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } catch (e) { /* the list stays selectable */ }
      document.body.removeChild(area);
      done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  // --- state -------------------------------------------------------------------------------
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // --- sections ------------------------------------------------------------------------------
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', { class: 'brand-name' }, el('b', { text: 'Token Radar' }), ' — pre-token launch board')
      ),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least $', el('b', { text: Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL that records no token. The early radar adds ', el('b', { text: String(DATA.early_size) }),
          ' pre-token protocols below that floor, and wrapped, staked and bridged products are kept out: they are not launches of their own. ',
          'Implied value is a model built from the snapshot itself — what the market already pays for a dollar of TVL in each category — not a promise and not a price.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Global median mcap / TVL' }), el('b', { text: fmtMult(DATA.global_median_multiple) }))
      )
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 3);
    var cards = top.map(function (r) {
      return el('button', { class: 'spot', type: 'button', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: 'Rank ' + r.rank + ' · ' + (r.category || 'Other') }),
        el('span', { class: 'name', text: r.name }),
        el('span', { class: 'sub', text: 'TVL ' + fmtUsd(r.tvl_usd) + ' · 7d ' + fmtPct(r.change_7d) + ' · ' + fmtAge(r.age_days) + ' with no token' }),
        el('span', { class: 'value', text: fmtUsd(r.implied_value_usd) + ' ' }, el('small', { text: 'implied value' }))
      );
    });
    return el('section', { class: 'spotlight', 'aria-label': 'Top three protocols' }, cards);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the comparables the model is read from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var top = DATA.comparables.slice().sort(function (a, b) { return b.live_count - a.live_count; }).slice(0, 12);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        el('b', { text: 'implied = round( tvl_usd x comparable x growth x maturity )' }),
        document.createTextNode('  comparable = clamp( 0.5 x category median mcap/TVL + 0.5 x ' + DATA.global_median_multiple + ' global median, 0.05, 0.80 )'),
        document.createElement('br'),
        document.createTextNode('  growth = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight),
        document.createElement('br'),
        document.createTextNode('  maturity = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + '   (age unknown: ' + m.unknown_age_days + ' days)')
      ),
      el('p', { class: 'sub', text: 'The comparable is what the market already pays for a dollar of TVL in that category, read off the snapshot\u2019s own live-token protocols (a category with fewer than ' + m.min_category_sample + ' live examples keeps its own median shrunk ' + Math.round(m.depth_shrink * 100) + '% toward the global median, and a category with no live example at all falls back to the global median). Age is the time since the protocol was first listed, the best record of how long it has run with no token. Wrapped, staked and bridged products are excluded from the ranking, and live-token protocols are set aside with their market caps shown.' }),
      el('div', { class: 'comps' }, top.map(function (c) {
        return el('div', null, el('span', { text: c.category + ' (' + c.live_count + ')' }), el('b', { text: fmtMult(c.median_multiple) }));
      }))
    );
  }

  // --- compare two protocols: the same figures, side by side --------------------------------
  // The picks live outside the board's own state: the board's search, filter and sort keep
  // working while the comparison below it follows only these two choices. Defaults are the
  // board's top two rows, so the panel says something useful before anyone touches it.
  var compareState = { first: DATA.rows[0] ? DATA.rows[0].slug : null, second: DATA.rows[1] ? DATA.rows[1].slug : null };

  function compareRowBySlug(slug) {
    var found = DATA.rows.filter(function (r) { return r.slug === slug; });
    return found.length > 0 ? found[0] : null;
  }

  function compareOptionLabel(row) {
    return 'Rank ' + row.rank + ' — ' + row.name;
  }

  function comparePick(which) {
    var current = which === 'first' ? compareState.first : compareState.second;
    var select = el('select', { 'aria-label': which === 'first' ? 'First protocol to compare' : 'Second protocol to compare' },
      DATA.rows.map(function (r) {
        return el('option', { value: r.slug, text: compareOptionLabel(r), selected: r.slug === current ? 'selected' : null });
      })
    );
    select.addEventListener('change', function () {
      if (which === 'first') compareState.first = select.value;
      else compareState.second = select.value;
      render();
    });
    return el('div', { class: 'field' },
      el('label', { text: which === 'first' ? 'First protocol' : 'Second protocol' }),
      select
    );
  }

  function compareCell(text, wins) {
    return el('td', { class: 'num' + (wins ? ' win' : ''), text: text });
  }

  // One entry per figure: the two readings and which side leads. A tie marks neither side,
  // so a row where both plans run six steps, or both multiples match, stays honest.
  function compareEntries(a, b) {
    var aSteps = farmSteps(a).length;
    var bSteps = farmSteps(b).length;
    var aGrowth = a.change_7d === null || a.change_7d === undefined ? 0 : a.change_7d;
    var bGrowth = b.change_7d === null || b.change_7d === undefined ? 0 : b.change_7d;
    var aAge = a.age_days === null || a.age_days === undefined ? 0 : a.age_days;
    var bAge = b.age_days === null || b.age_days === undefined ? 0 : b.age_days;
    return [
      { label: 'TVL', a: fmtUsd(a.tvl_usd), b: fmtUsd(b.tvl_usd), aWins: a.tvl_usd > b.tvl_usd, bWins: b.tvl_usd > a.tvl_usd },
      { label: 'Comparable multiple', a: fmtMult(a.comparable_multiple), b: fmtMult(b.comparable_multiple), aWins: a.comparable_multiple > b.comparable_multiple, bWins: b.comparable_multiple > a.comparable_multiple },
      { label: 'Live protocols behind the multiple', a: String(a.comparable_count), b: String(b.comparable_count), aWins: a.comparable_count > b.comparable_count, bWins: b.comparable_count > a.comparable_count },
      { label: 'Seven-day change', a: fmtPct(a.change_7d), b: fmtPct(b.change_7d), aWins: aGrowth > bGrowth, bWins: bGrowth > aGrowth },
      { label: 'Age with no token', a: fmtAge(a.age_days), b: fmtAge(b.age_days), aWins: aAge > bAge, bWins: bAge > aAge },
      { label: 'Maturity multiplier', a: fmtMult(a.maturity_multiplier), b: fmtMult(b.maturity_multiplier), aWins: a.maturity_multiplier > b.maturity_multiplier, bWins: b.maturity_multiplier > a.maturity_multiplier },
      { label: 'Implied value', a: fmtUsd(a.implied_value_usd), b: fmtUsd(b.implied_value_usd), aWins: a.implied_value_usd > b.implied_value_usd, bWins: b.implied_value_usd > a.implied_value_usd },
      { label: 'Farm plan steps', a: String(aSteps), b: String(bSteps), aWins: aSteps > bSteps, bWins: bSteps > aSteps }
    ];
  }

  // The verdict names the leader and the gap, then checks the multiple: a leader can win on
  // size while the trailer's market pays more per dollar of TVL, and that is worth saying,
  // because the two protocols are then winning for different reasons.
  function compareVerdict(a, b) {
    if (a.implied_value_usd === b.implied_value_usd) return 'Both protocols carry the same implied value: the model ranks them only by name from here.';
    var leader = a.implied_value_usd > b.implied_value_usd ? a : b;
    var trailer = leader === a ? b : a;
    var ratio = (leader.implied_value_usd / Math.max(1, trailer.implied_value_usd)).toFixed(1);
    var perDollar = leader.comparable_multiple < trailer.comparable_multiple
      ? ' The trailer earns its place differently: the market pays more per dollar of its TVL (' + fmtMult(trailer.comparable_multiple) + ' against ' + fmtMult(leader.comparable_multiple) + '), so its smaller implied value is a smaller base, not a weaker multiple.'
      : '';
    return leader.name + ' leads on implied value at ' + fmtUsd(leader.implied_value_usd) + ', about ' + ratio + 'x ' + trailer.name + ' at ' + fmtUsd(trailer.implied_value_usd) + '.' + perDollar;
  }

  function comparePanel() {
    var a = compareRowBySlug(compareState.first);
    var b = compareRowBySlug(compareState.second);
    var body;
    if (!a || !b) {
      body = el('p', { class: 'sub', text: 'Pick two protocols above to compare them.' });
    } else if (a.slug === b.slug) {
      body = el('p', { class: 'sub', text: 'Pick two different protocols: comparing a protocol with itself says nothing.' });
    } else {
      var entries = compareEntries(a, b);
      var tbody = el('tbody');
      entries.forEach(function (e) {
        tbody.appendChild(el('tr', null,
          el('td', { text: e.label }),
          compareCell(e.a, e.aWins),
          compareCell(e.b, e.bWins)
        ));
      });
      body = el('div', null,
        el('div', { class: 'table-wrap' },
          el('table', { class: 'compare-table' },
            el('thead', null, el('tr', null,
              el('th', { scope: 'col', text: 'Figure' }),
              el('th', { scope: 'col', text: 'Rank ' + a.rank + ' · ' + a.name }),
              el('th', { scope: 'col', text: 'Rank ' + b.rank + ' · ' + b.name })
            )),
            tbody
          )
        ),
        el('p', { class: 'sub compare-verdict', text: compareVerdict(a, b) })
      );
    }
    return el('section', { class: 'panel compare' },
      el('h2', { text: 'Compare two protocols' }),
      el('p', { class: 'sub', text: 'The same model figures, side by side: the multiple, the live protocols behind it, growth, age and the implied value each one carries. The larger figure in each row is marked.' }),
      el('div', { class: 'compare-picks' },
        comparePick('first'),
        comparePick('second')
      ),
      body
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var planText = row.name + ' farm plan (Token Radar, snapshot ' + DATA.as_of + ')\n' +
      steps.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n');
    var copyButton = el('button', { class: 'button', type: 'button', text: 'Copy farm plan' });
    copyButton.addEventListener('click', function () { copyText(planText, copyButton); });
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Comparable multiple' }), el('b', { class: 'num', text: fmtMult(row.comparable_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: fmtMult(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: fmtMult(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      copyButton
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    if (state.tab === 'pre-token') shell.appendChild(comparePanel());
    shell.appendChild(el('p', { class: 'foot', text: 'Implied values are this radar\u2019s own model claim, never a price. A protocol \u201crecords no token\u201d is DefiLlama\u2019s record, not proof it has none. Snapshot ' + DATA.as_of + '.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
