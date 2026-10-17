/* FairQuest \u2014 review summary on fair cards (month / state / explore pages)
   Usage: put <div class="fq-card-review" data-fair-id="ID"></div> in a card,
   then call FQCardReviews.fill(containerEl) after the cards are rendered.
   Needs the page's global `supabaseClient` and RPC get_fair_review_cards. */
(function () {
  const cache = new Map();   // fairId -> row | null (no reviews) | Promise
  let pendingHref = null;
  let injected = false;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function stars(n) {
    const full = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '\u2605'.repeat(full) + '\u2606'.repeat(5 - full);
  }
  function relativeTime(dateStr) {
    const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    const m = Math.floor(diffSec / 60);  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
    const h = Math.floor(m / 60);        if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
    const d = Math.floor(h / 24);        if (d < 7)  return `${d} day${d === 1 ? '' : 's'} ago`;
    const w = Math.floor(d / 7);         if (w < 5)  return `${w} week${w === 1 ? '' : 's'} ago`;
    const mo = Math.floor(d / 30);       if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
    const y = Math.floor(d / 365);       return `${y} year${y === 1 ? '' : 's'} ago`;
  }
  function reviewsHref(fairId) {
    return `/fairs/fair_star_reviews.html?fair_id=${encodeURIComponent(fairId)}&type=public`;
  }

  function injectOnce() {
    if (injected) return;
    injected = true;
    const css = document.createElement('style');
    css.textContent = `
      .fq-rv{display:block;margin-top:12px;padding:10px 12px;min-height:44px;border-radius:10px;
        background:rgba(255,255,255,0.22);border:1px solid rgba(138,106,26,0.5);text-decoration:none;
        cursor:pointer;transition:background .2s, transform .1s;box-sizing:border-box}
      .fq-rv:hover{background:rgba(255,255,255,0.35)}
      .fq-rv:active{transform:scale(0.99)}
      .card .fq-rv, .card .fq-rv *{color:#222 !important}
      .card .fq-rv .fq-rv-stars{color:#6b4a00 !important;letter-spacing:1px;font-size:15px}
      .fq-rv-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:14px;font-weight:bold}
      .fq-rv-count{font-weight:normal;font-size:13px}
      .fq-rv-text{margin:6px 0 2px;font-size:13px;font-style:italic;line-height:1.45;
        display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
      .fq-rv-meta{font-size:12px;opacity:.8;margin-top:2px}
      .card .fq-rv .fq-rv-meta .fq-rv-stars{font-size:12px}
      .card .fq-rv .fq-rv-cta{margin-top:6px;font-size:13px;font-weight:bold;color:#1a56a0 !important}
      .fq-rv-loading{font-size:12px;opacity:.7;margin-top:12px}
      #fqCardReviewLoginModal{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:100000;
        align-items:center;justify-content:center;padding:20px}
      #fqCardReviewLoginModal .fq-rlm-box{background:#1a1208;border:1px solid rgba(201,168,76,0.4);border-radius:16px;
        padding:28px;max-width:380px;width:100%;text-align:center;box-shadow:0 8px 36px rgba(0,0,0,0.6)}
      #fqCardReviewLoginModal h3{font-family:'Cinzel',serif;color:#f1df99;margin:0 0 12px}
      #fqCardReviewLoginModal p{font-size:13px;color:#c9a84c;margin:0 0 20px;line-height:1.6}
      #fqCardReviewLoginModal .fq-rlm-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
      #fqCardReviewLoginModal button{min-height:44px;padding:10px 16px;border-radius:8px;font-weight:bold;
        font-size:14px;cursor:pointer;border:1px solid rgba(201,168,76,0.4)}
      #fqCardReviewLoginModal .fq-rlm-login{background:#c9a84c;color:#111;border-color:#8a6a1a}
      #fqCardReviewLoginModal .fq-rlm-view{background:rgba(255,255,255,0.1);color:#f1df99}
      #fqCardReviewLoginModal .fq-rlm-cancel{background:transparent;color:#c9a84c;border-color:rgba(201,168,76,0.3)}
    `;
    document.head.appendChild(css);

    const modal = document.createElement('div');
    modal.id = 'fqCardReviewLoginModal';
    modal.innerHTML = `
      <div class="fq-rlm-box">
        <h3>\u2b50 Log In to Review</h3>
        <p>You need to be logged in to write a review. You can still browse existing reviews without logging in.</p>
        <div class="fq-rlm-actions">
          <button type="button" class="fq-rlm-login">Log In</button>
          <button type="button" class="fq-rlm-view">View Reviews</button>
          <button type="button" class="fq-rlm-cancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => { modal.style.display = 'none'; };
    modal.querySelector('.fq-rlm-login').onclick = () => { window.location.href = '/user_login.html'; };
    modal.querySelector('.fq-rlm-view').onclick = () => { close(); if (pendingHref) window.location.href = pendingHref; };
    modal.querySelector('.fq-rlm-cancel').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.addEventListener('click', async e => {
      const link = e.target.closest('a.fq-rv');
      if (!link) return;
      e.preventDefault();
      const href = link.getAttribute('href');
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        window.location.href = href;
      } else {
        pendingHref = href;
        modal.style.display = 'flex';
      }
    });
  }

  function render(fairId, row) {
    const href = reviewsHref(fairId);
    const count = row ? Number(row.review_count) || 0 : 0;
    if (!count) {
      return `<a class="fq-rv" href="${href}">
        <div class="fq-rv-head"><span class="fq-rv-stars">\u2606\u2606\u2606\u2606\u2606</span><span class="fq-rv-count">No reviews yet</span></div>
        <div class="fq-rv-cta">Be the first to review \u203a</div>
      </a>`;
    }
    const avg = Number(row.avg_rating) || 0;
    const hasTop = row.top_created_at != null;
    const text = (row.top_review_text || '').trim();
    return `<a class="fq-rv" href="${href}">
      <div class="fq-rv-head">
        <span class="fq-rv-stars">${stars(avg)}</span>
        <span>${avg.toFixed(1)}</span>
        <span class="fq-rv-count">(${count} review${count === 1 ? '' : 's'})</span>
      </div>
      ${hasTop ? `
        ${text ? `<div class="fq-rv-text">\u201c${esc(text)}\u201d</div>` : ''}
        <div class="fq-rv-meta"><span class="fq-rv-stars">${stars(row.top_rating)}</span> \u2014 ${esc(row.top_username || 'FairQuest user')} \u00b7 ${relativeTime(row.top_created_at)}</div>
      ` : ''}
      <div class="fq-rv-cta">${count === 1 ? 'Read the review' : 'Read all reviews'} or add yours \u203a</div>
    </a>`;
  }

  async function fill(root) {
    injectOnce();
    const els = [...(root || document).querySelectorAll('.fq-card-review[data-fair-id]')];
    if (!els.length) return;

    const need = [...new Set(els.map(el => Number(el.dataset.fairId)))]
      .filter(id => Number.isFinite(id) && !cache.has(id));

    if (need.length) {
      const req = supabaseClient.rpc('get_fair_review_cards', { p_fair_ids: need }).then(({ data, error }) => {
        if (error) { console.error('get_fair_review_cards:', error); need.forEach(id => cache.delete(id)); return; }
        const byId = new Map((data || []).map(r => [Number(r.fair_id), r]));
        need.forEach(id => cache.set(id, byId.get(id) || null));
      });
      need.forEach(id => cache.set(id, req));
    }

    els.forEach(el => { if (cache.get(Number(el.dataset.fairId)) instanceof Promise) el.innerHTML = '<div class="fq-rv-loading">Loading reviews\u2026</div>'; });

    await Promise.all([...new Set(els.map(el => cache.get(Number(el.dataset.fairId))))].filter(v => v instanceof Promise));

    els.forEach(el => {
      const id = Number(el.dataset.fairId);
      if (!cache.has(id)) { el.innerHTML = ''; return; }   // request failed \u2014 hide quietly
      el.innerHTML = render(id, cache.get(id));
    });
  }

  window.FQCardReviews = { fill };
})();
