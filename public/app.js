/* ============================================================
   LeetCode Google Interview Crawler — app.js
   Two-panel layout: list (10/page) + detail
============================================================ */

// ── State ────────────────────────────────────────────────────
var state = {
  company: 'google',
  page: 0,
  pageSize: 10,
  totalNum: 0,
  totalPages: 0,
  orderBy: 'newest_to_oldest',
  search: '',
  year: '',
  tagFilter: '',
  selectedId: null,
  loading: false,
  detailLoading: false,
};

// ── DOM ───────────────────────────────────────────────────────
var $ = function(id) { return document.getElementById(id); };

var totalBadge     = $('total-badge');
var listLoading    = $('list-loading');
var listError      = $('list-error');
var listEmpty      = $('list-empty');
var errorMsg       = $('error-msg');
var postList       = $('post-list');
var pagination     = $('pagination');
var btnFirst       = $('btn-first');
var btnPrev        = $('btn-prev');
var btnNext        = $('btn-next');
var btnLast        = $('btn-last');
var pageInfo       = $('page-info');
var btnRetry       = $('btn-retry');
var searchInput    = $('search-input');
var searchClear    = $('search-clear');
var sortBtns       = document.querySelectorAll('.sort-btn');
var companySelect       = $('company-select');
var customCompanyInput  = $('custom-company-input');
var customCompanyGo     = $('custom-company-go');
var yearSelect       = $('year-select');
var tagInterviewBtn  = $('tag-interview-btn');
var refreshBtn     = $('refresh-btn');
var exportPostsBtn = $('export-posts-btn');

var detailPlaceholder = $('detail-placeholder');
var detailLoading     = $('detail-loading');

// Content Detail DOM
var contentDetail   = $('content-detail');
var contentTitle    = $('content-title');
var contentMeta     = $('content-meta');
var contentBody     = $('content-body');

// Export Modal DOM
var exportModal          = $('export-modal');
var closeExportModalBtn  = $('close-export-modal-btn');
var exportStatus         = $('export-status');
var exportProgressBar    = $('export-progress-bar');
var exportProgressText   = $('export-progress-text');
var startExportBtn       = $('start-export-btn');
var abortExportBtn       = $('abort-export-btn');

// Summary Modal DOM
var summaryModal         = $('summary-modal');
var summaryModalTitle    = $('summary-modal-title');
var summaryModalDesc     = $('summary-modal-desc');
var summaryPostList      = $('summary-post-list');
var summaryProgress      = $('summary-progress');
var summaryProgressBar   = $('summary-progress-bar');
var summaryProgressText  = $('summary-progress-text');
var summaryResult        = $('summary-result');
var summaryError         = $('summary-error');
var saveSummaryBtn       = $('save-summary-btn');
var dismissSummaryBtn    = $('dismiss-summary-btn');
var closeSummaryModalBtn = $('close-summary-modal-btn');

// Extraction Modal DOM
var extractLinksBtn      = $('extract-links-btn');
var extractionModal      = $('extraction-modal');
var closeModalBtn        = $('close-modal-btn');
var startExtractionBtn   = $('start-extraction-btn');
var extractionStatus     = $('extraction-status');
var extractionProgress   = $('extraction-progress');
var extractedCount       = $('extracted-count');
var extractedLinksList   = $('extracted-links-list');
var downloadPdfBtn       = $('download-pdf-btn');

// ── Helpers ───────────────────────────────────────────────────
function show(el)  { el.removeAttribute('hidden'); }
function hide(el)  { el.setAttribute('hidden', ''); }

function relTime(isoStr) {
  if (!isoStr) return '';
  var diff  = Date.now() - new Date(isoStr).getTime();
  var mins  = Math.floor(diff / 60000);
  var hours = Math.floor(diff / 3600000);
  var days  = Math.floor(diff / 86400000);
  var months = Math.floor(days / 30);
  var years  = Math.floor(days / 365);
  if (mins < 60)   return mins + 'm ago';
  if (hours < 24)  return hours + 'h ago';
  if (days < 30)   return days + 'd ago';
  if (months < 12) return months + 'mo ago';
  return years + 'y ago';
}

function fmtN(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function tagCls(t) {
  return t.toLowerCase() === 'google' ? 'tag-google' : 'tag-default';
}

// ── Fetch posts list ──────────────────────────────────────────
function fetchPosts() {
  if (state.loading) return;
  state.loading = true;

  // Show loading, hide rest
  show(listLoading);
  hide(listError);
  hide(listEmpty);
  hide(postList);
  hide(pagination);

  var qs = '?company=' + encodeURIComponent(state.company)
         + '&page=' + state.page
         + '&pageSize=' + state.pageSize
         + '&orderBy=' + state.orderBy
         + (state.search ? '&search=' + encodeURIComponent(state.search) : '')
         + (state.year      ? '&year=' + encodeURIComponent(state.year)      : '')
         + (state.tagFilter ? '&tag='  + encodeURIComponent(state.tagFilter) : '');

  fetch('/api/posts' + qs)
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      state.loading = false;
      hide(listLoading);

      if (data.error) throw new Error(data.error);

      state.totalNum = data.totalNum || 0;
      var totalPages = Math.ceil(state.totalNum / state.pageSize);
      state.totalPages = totalPages;
      totalBadge.textContent = state.totalNum.toLocaleString() + ' posts';

      var posts = data.posts || [];
      if (posts.length === 0) {
        show(listEmpty);
        return;
      }

      renderList(posts);
      show(postList);

      // Pagination
      var currentPage = state.page + 1; // 1-based for display
      pageInfo.textContent = 'Page ' + currentPage + ' of ' + totalPages;
      btnFirst.disabled = state.page === 0;
      btnPrev.disabled = state.page === 0;
      btnNext.disabled = (state.page + 1) >= totalPages;
      btnLast.disabled = (state.page + 1) >= totalPages;
      show(pagination);
    })
    .catch(function(err) {
      state.loading = false;
      hide(listLoading);
      errorMsg.textContent = err.message || 'Could not reach the API.';
      show(listError);
    });
}

// ── Render post list ──────────────────────────────────────────
function renderList(posts) {
  postList.innerHTML = '';
  posts.forEach(function(post, i) {
    var globalNum = state.page * state.pageSize + i + 1;
    var li = document.createElement('li');
    li.className = 'post-item' + (post.id === state.selectedId ? ' selected' : '');
    li.dataset.id = post.id;
    li.style.animationDelay = (i * 35) + 'ms';

    var tagsHtml = (post.tags || []).slice(0, 4).map(function(t) {
      return '<span class="tag ' + tagCls(t) + '">' + escHtml(t) + '</span>';
    }).join('');

    li.innerHTML = '<div class="post-item-inner">'
      + '<div class="post-num">#' + globalNum + '</div>'
      + '<div class="post-title">' + escHtml(post.title) + '</div>'
      + '<div class="post-row">'
        + '<span class="post-author">' + escHtml(post.author) + '</span>'
        + '<span class="post-date">' + relTime(post.createdAt) + '</span>'
        + '<span class="post-stats">'
          + '<span class="post-stat">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14Z"/></svg>'
            + fmtN(post.voteCount) + '</span>'
          + '<span class="post-stat">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
            + fmtN(post.commentCount) + '</span>'
        + '</span>'
      + '</div>'
      + (tagsHtml ? '<div class="post-tags">' + tagsHtml + '</div>' : '')
      + '</div>';

    li.addEventListener('click', function() {
      openPost(post);
    });

    postList.appendChild(li);
  });
}

// ── Open post detail ──────────────────────────────────────────
async function openPost(post) {
  // Mark selected in list
  state.selectedId = post.id;
  var items = postList.querySelectorAll('.post-item');
  items.forEach(function(el) {
    if (el.dataset.id == post.id) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });

  // Show loading in detail panel
  hide(detailPlaceholder);
  hide(contentDetail);
  show(detailLoading);

  try {
    const res = await fetch('/api/posts/' + post.id);
    if (!res.ok) throw new Error('Failed to load post (HTTP ' + res.status + ')');
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    hide(detailLoading);
    
    contentTitle.innerHTML = `<a href="${data.url}" target="_blank" style="color: inherit; text-decoration: none;">${data.title}</a>`;
    
    contentMeta.innerHTML = `
      <div class="content-author">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        ${escHtml(data.author)}
      </div>
      <div class="content-author">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14Z"/></svg>
        ${fmtN(data.voteCount)}
      </div>
      <div class="content-author" style="color: var(--text3);">
        ${relTime(data.createdAt)}
      </div>
    `;

    // Render markdown using marked.js
    if (typeof marked !== 'undefined') {
       contentBody.innerHTML = marked.parse(data.content || '', { breaks: true, gfm: true });
    } else {
       contentBody.innerHTML = '<pre style="white-space: pre-wrap; background: transparent; padding: 0; border: none;">' + escHtml(data.content) + '</pre>';
    }
    
    show(contentDetail);
  } catch (err) {
    hide(detailLoading);
    contentTitle.textContent = 'Error loading post';
    contentMeta.innerHTML = '';
    contentBody.innerHTML = '<p style="color:red;">' + escHtml(err.message) + '</p>';
    show(contentDetail);
  }
}

// ── Open problem detail ───────────────────────────────────────
async function openProblem(slug) {
  hide(detailPlaceholder);
  hide(contentDetail);
  show(detailLoading);
  hide(extractionModal);

  // Clear list selection
  state.selectedId = null;
  var items = postList.querySelectorAll('.post-item');
  items.forEach(function(el) { el.classList.remove('selected'); });

  try {
    const res = await fetch('/api/problem/' + slug);
    if (!res.ok) throw new Error('Failed to load problem (HTTP ' + res.status + ')');
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    hide(detailLoading);
    
    contentTitle.innerHTML = `<a href="${data.url}" target="_blank" style="color: inherit; text-decoration: none;">${data.id ? data.id + '. ' : ''}${data.title}</a>`;
    contentMeta.innerHTML = `<span class="content-difficulty difficulty-${data.difficulty}">${data.difficulty}</span>`;
    contentBody.innerHTML = data.content;
    
    show(contentDetail);
  } catch (err) {
    hide(detailLoading);
    contentTitle.textContent = 'Error loading problem';
    contentMeta.innerHTML = '';
    contentBody.innerHTML = '<p style="color:red;">' + escHtml(err.message) + '</p>';
    show(contentDetail);
  }
}

// ── Controls ──────────────────────────────────────────────────

// Load available years for current company from DB
function loadYears() {
  fetch('/api/years?company=' + encodeURIComponent(state.company))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var years = data.years || [];
      var prev = state.year;
      yearSelect.innerHTML = '<option value="">All Years</option>';
      years.forEach(function(yr) {
        var opt = document.createElement('option');
        opt.value = yr;
        opt.textContent = yr;
        if (yr === prev) opt.selected = true;
        yearSelect.appendChild(opt);
      });
      yearSelect.disabled = years.length === 0 || !!state.search;
    });
}

// Search
var searchTimer;
searchInput.addEventListener('input', function() {
  clearTimeout(searchTimer);
  var val = searchInput.value.trim();
  searchClear.hidden = !val;
  searchTimer = setTimeout(function() {
    state.search = val;
    state.page = 0;
    // Disable year filter during search
    if (val) {
      state.year = '';
      yearSelect.value = '';
      yearSelect.disabled = true;
    } else {
      yearSelect.disabled = false;
    }
    fetchPosts();
  }, 400);
});

searchClear.addEventListener('click', function() {
  searchInput.value = '';
  searchClear.hidden = true;
  state.search = '';
  state.page = 0;
  yearSelect.disabled = false;
  fetchPosts();
  searchInput.focus();
});

// Company Select
if (companySelect) {
  companySelect.addEventListener('change', function() {
    state.company = companySelect.value;
    state.year = '';
    yearSelect.value = '';
    state.tagFilter = '';
    tagInterviewBtn.classList.remove('active');
    state.page = 0;
    loadYears();
    fetchPosts();
  });
}

// Custom company input
var PRESET_COMPANIES = ['google', 'meta', 'microsoft', 'amazon'];

function applyCustomCompany() {
  var val = customCompanyInput.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!val) return;

  if (PRESET_COMPANIES.includes(val)) {
    // Route back to the preset dropdown
    companySelect.value = val;
    customCompanyInput.value = '';
    state.company = val;
  } else {
    // Inject or update a custom option so the dropdown reflects the current state
    var existing = companySelect.querySelector('option[data-custom]');
    if (existing) {
      existing.value = val;
      existing.textContent = val.charAt(0).toUpperCase() + val.slice(1) + ' (custom)';
    } else {
      var opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val.charAt(0).toUpperCase() + val.slice(1) + ' (custom)';
      opt.setAttribute('data-custom', '1');
      companySelect.appendChild(opt);
    }
    companySelect.value = val;
    customCompanyInput.value = '';
    state.company = val;
  }

  state.year = '';
  yearSelect.value = '';
  state.tagFilter = '';
  tagInterviewBtn.classList.remove('active');
  state.page = 0;
  loadYears();
  fetchPosts();
}

if (customCompanyGo) {
  customCompanyGo.addEventListener('click', applyCustomCompany);
}
if (customCompanyInput) {
  customCompanyInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') applyCustomCompany();
  });
}

// Interview tag toggle
tagInterviewBtn.addEventListener('click', function() {
  state.tagFilter = state.tagFilter === 'interview' ? '' : 'interview';
  tagInterviewBtn.classList.toggle('active', state.tagFilter === 'interview');
  state.page = 0;
  fetchPosts();
});

// Year Select
yearSelect.addEventListener('change', function() {
  state.year = yearSelect.value;
  state.page = 0;
  fetchPosts();
});

// Sort
sortBtns.forEach(function(btn) {
  btn.addEventListener('click', function() {
    sortBtns.forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    state.orderBy = btn.dataset.order;
    state.page = 0;
    fetchPosts();
  });
});

// Pagination
btnFirst.addEventListener('click', function() {
  if (state.page > 0) {
    state.page = 0;
    fetchPosts();
  }
});

btnPrev.addEventListener('click', function() {
  if (state.page > 0) {
    state.page--;
    fetchPosts();
  }
});

btnNext.addEventListener('click', function() {
  state.page++;
  fetchPosts();
});

btnLast.addEventListener('click', function() {
  var lastPage = state.totalPages - 1;
  if (state.page < lastPage) {
    state.page = lastPage;
    fetchPosts();
  }
});

// Retry
btnRetry.addEventListener('click', function() {
  fetchPosts();
});

refreshBtn.addEventListener('click', function() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = '↺ Refreshing…';
  fetch('/api/refresh?company=' + encodeURIComponent(state.company), { method: 'POST' })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '↺ Refresh';
      state.page = 0;
      fetchPosts();
      if (data.newCount > 0) {
        openSummaryModal(data.newPosts);
      }
    })
    .catch(function(err) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '↺ Refresh';
      console.error('Refresh failed:', err.message);
    });
});

exportPostsBtn.addEventListener('click', function() {
  // Reset modal state
  exportStatus.textContent = 'Ready to export all posts with full content.';
  exportProgressBar.style.width = '0%';
  exportProgressText.textContent = '0 / 0 posts';
  startExportBtn.disabled = false;
  startExportBtn.textContent = 'Start Export';
  abortExportBtn.disabled = true;
  show(exportModal);
});

if (closeExportModalBtn) {
  closeExportModalBtn.addEventListener('click', function() {
    abortExportFlag = true;
    hide(exportModal);
  });
}

// ── Export Logic ──────────────────────────────────────────────
var abortExportFlag = false;

function stripTagsForDoc(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildTxt(company, posts, batchNum, totalBatches) {
  var sep = '='.repeat(80);
  var batchLine = (batchNum != null) ? 'Batch:    ' + batchNum + ' of ' + totalBatches + '\n' : '';
  var header = 'LeetCode Discussion Export — ' + company.toUpperCase() + '\n'
    + 'Generated: ' + new Date().toISOString() + '\n'
    + 'Posts: ' + posts.length + '\n'
    + batchLine
    + sep + '\n\n';

  var body = posts.map(function(p) {
    var date = (p.createdAt || '').slice(0, 10) || 'unknown';
    var tags = Array.isArray(p.tags) ? p.tags.join(', ') : '—';
    return '=== Post #' + p.id + ' ===\n'
      + 'Title:  ' + (p.title || '') + '\n'
      + 'Author: ' + (p.author || 'Anonymous') + ' | Date: ' + date + '\n'
      + 'Tags:   ' + tags + '\n'
      + 'URL:    ' + (p.url || '—') + '\n\n'
      + (p.content || '(content not available)') + '\n\n'
      + sep + '\n';
  }).join('\n');

  return header + body;
}

function downloadTxt(content, filename) {
  var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

if (startExportBtn) {
  startExportBtn.addEventListener('click', async function() {
    startExportBtn.disabled = true;
    startExportBtn.textContent = 'Exporting…';
    abortExportBtn.disabled = false;
    abortExportFlag = false;

    const filterQs = (state.year      ? '&year='   + encodeURIComponent(state.year)      : '')
                   + (state.tagFilter ? '&tag='    + encodeURIComponent(state.tagFilter) : '');

    try {
      // Step 1: get total count
      exportStatus.textContent = 'Fetching total post count…';
      const r0 = await fetch('/api/posts?company=' + encodeURIComponent(state.company) + '&page=0&pageSize=1&orderBy=newest_to_oldest' + filterQs);
      const d0 = await r0.json();
      const total = d0.totalNum || 0;

      if (total === 0) {
        exportStatus.textContent = 'No posts found for current filter.';
        startExportBtn.disabled = false;
        startExportBtn.textContent = 'Start Export';
        abortExportBtn.disabled = true;
        return;
      }

      exportProgressText.textContent = '0 / ' + total + ' posts';

      // Step 2: collect all post metadata across pages
      const PAGE_SIZE = 50;
      const pages = Math.ceil(total / PAGE_SIZE);
      var allMeta = [];
      for (var p = 0; p < pages; p++) {
        if (abortExportFlag) break;
        exportStatus.textContent = 'Loading page ' + (p + 1) + ' of ' + pages + '…';
        const rp = await fetch('/api/posts?company=' + encodeURIComponent(state.company)
          + '&page=' + p + '&pageSize=' + PAGE_SIZE + '&orderBy=newest_to_oldest' + filterQs);
        const dp = await rp.json();
        allMeta = allMeta.concat(dp.posts || []);
      }

      if (abortExportFlag) {
        exportStatus.textContent = 'Export aborted.';
        startExportBtn.disabled = false;
        startExportBtn.textContent = 'Start Export';
        abortExportBtn.disabled = true;
        return;
      }

      // Step 3: fetch full content for each post
      var allPosts = [];
      for (var i = 0; i < allMeta.length; i++) {
        if (abortExportFlag) break;
        var meta = allMeta[i];
        var pct = Math.round(((i + 1) / allMeta.length) * 100);
        exportProgressBar.style.width = pct + '%';
        exportProgressText.textContent = (i + 1) + ' / ' + allMeta.length + ' posts';
        exportStatus.textContent = 'Fetching: ' + meta.title.substring(0, 50) + '…';

        try {
          var rd = await fetch('/api/posts/' + meta.id);
          var dd = await rd.json();
          allPosts.push({
            id:        meta.id,
            title:     dd.title || meta.title,
            author:    dd.author || meta.author,
            createdAt: dd.createdAt || meta.createdAt,
            tags:      dd.tags || meta.tags,
            url:       dd.url || meta.url,
            content:   stripTagsForDoc(dd.content || ''),
          });
        } catch (e) {
          allPosts.push({
            id:        meta.id,
            title:     meta.title,
            author:    meta.author,
            createdAt: meta.createdAt,
            tags:      meta.tags,
            url:       meta.url,
            content:   '(content fetch failed)',
          });
        }
      }

      if (abortExportFlag) {
        exportStatus.textContent = 'Export aborted at ' + allPosts.length + ' posts.';
        startExportBtn.disabled = false;
        startExportBtn.textContent = 'Start Export';
        abortExportBtn.disabled = true;
        return;
      }

      // Step 4: split into batches of 10, add each as a .txt into a ZIP, download the ZIP
      var BATCH_SIZE = 10;
      var now  = new Date();
      var pad  = function(n) { return String(n).padStart(2,'0'); };
      var ts   = now.toISOString().slice(0,10) + '_' + pad(now.getHours()) + pad(now.getMinutes());
      var totalBatches = Math.ceil(allPosts.length / BATCH_SIZE);

      exportStatus.textContent = 'Building ZIP (' + totalBatches + ' files)…';

      var zip = new JSZip();
      for (var b = 0; b < totalBatches; b++) {
        var chunk    = allPosts.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        var batchNum = b + 1;
        var txt      = buildTxt(state.company, chunk, batchNum, totalBatches);
        var filename = state.company + '_part' + String(batchNum).padStart(2,'0') + 'of' + String(totalBatches).padStart(2,'0') + '.txt';
        zip.file(filename, txt);
      }

      exportStatus.textContent = 'Compressing…';
      var zipBlob  = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      var zipName  = state.company + '_' + ts + '.zip';
      downloadTxt(zipBlob, zipName);   // downloadTxt works for any Blob

      exportProgressBar.style.width = '100%';
      exportStatus.textContent = 'Done! ' + allPosts.length + ' posts in ' + totalBatches + ' files → ' + zipName;
      startExportBtn.textContent = 'Export Again';
      startExportBtn.disabled = false;
      abortExportBtn.disabled = true;

    } catch (err) {
      exportStatus.textContent = 'Error: ' + err.message;
      startExportBtn.disabled = false;
      startExportBtn.textContent = 'Start Export';
      abortExportBtn.disabled = true;
    }
  });
}

if (abortExportBtn) {
  abortExportBtn.addEventListener('click', function() {
    abortExportFlag = true;
    abortExportBtn.disabled = true;
    exportStatus.textContent = 'Aborting…';
  });
}

// ── Summary Modal Logic ───────────────────────────────────────
var pendingNewPosts = [];

function openSummaryModal(newPosts) {
  pendingNewPosts = newPosts;
  summaryModalTitle.textContent = newPosts.length + ' New Post' + (newPosts.length !== 1 ? 's' : '') + ' Found';
  summaryModalDesc.textContent = 'The following posts were added since your last refresh:';
  summaryPostList.innerHTML = '';
  newPosts.forEach(function(p) {
    var li = document.createElement('li');
    li.textContent = '[' + p.id + '] ' + p.title + ' (' + (p.createdAt || '').slice(0, 10) + ')';
    summaryPostList.appendChild(li);
  });
  hide(summaryProgress);
  hide(summaryResult);
  hide(summaryError);
  saveSummaryBtn.disabled = false;
  saveSummaryBtn.textContent = 'Save Summary';
  show(summaryModal);
}

if (saveSummaryBtn) {
  saveSummaryBtn.addEventListener('click', function() {
    saveSummaryBtn.disabled = true;
    saveSummaryBtn.textContent = 'Saving…';
    show(summaryProgress);
    hide(summaryResult);
    hide(summaryError);
    summaryProgressBar.style.width = '0%';
    summaryProgressText.textContent = '0 / ' + pendingNewPosts.length;

    var postIds = pendingNewPosts.map(function(p) { return p.id; });

    fetch('/api/save-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: state.company, postIds: postIds }),
    })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        hide(summaryProgress);
        if (data.success) {
          summaryProgressBar.style.width = '100%';
          summaryProgressText.textContent = data.postCount + ' / ' + data.postCount;
          summaryResult.textContent = 'Saved ' + data.postCount + ' posts → ' + data.filepath;
          show(summaryResult);
          saveSummaryBtn.textContent = 'Saved ✓';
        } else {
          summaryError.textContent = 'Error: ' + (data.error || 'Unknown error');
          show(summaryError);
          saveSummaryBtn.disabled = false;
          saveSummaryBtn.textContent = 'Save Summary';
        }
      })
      .catch(function(err) {
        hide(summaryProgress);
        summaryError.textContent = 'Request failed: ' + err.message;
        show(summaryError);
        saveSummaryBtn.disabled = false;
        saveSummaryBtn.textContent = 'Save Summary';
      });
  });
}

if (closeSummaryModalBtn) {
  closeSummaryModalBtn.addEventListener('click', function() { hide(summaryModal); });
}
if (dismissSummaryBtn) {
  dismissSummaryBtn.addEventListener('click', function() { hide(summaryModal); });
}

// ── Link Extraction Logic ──────────────────────────────────────
var isExtracting = false;
var extractedSet = new Set();
var abortedExtraction = false;

if (extractLinksBtn) {
  extractLinksBtn.addEventListener('click', function() {
    show(extractionModal);
  });
}

if (closeModalBtn) {
  closeModalBtn.addEventListener('click', function() {
    if (isExtracting) abortedExtraction = true;
    hide(extractionModal);
  });
}

if (startExtractionBtn) {
  startExtractionBtn.addEventListener('click', async function() {
    startExtractionBtn.disabled = true;
    if (downloadPdfBtn) downloadPdfBtn.disabled = true;
    
    isExtracting = true;
    abortedExtraction = false;
    extractedSet.clear();
    extractedLinksList.innerHTML = '';
    extractedCount.textContent = '0';
    extractionProgress.style.width = '0%';
    
    try {
      // Stage 1: Get total topics
      extractionStatus.textContent = "Fetching total post count...";
      const filterQs = (state.year      ? '&year=' + encodeURIComponent(state.year)      : '')
                     + (state.tagFilter ? '&tag='  + encodeURIComponent(state.tagFilter) : '');
      const res0 = await fetch(`/api/posts?company=${encodeURIComponent(state.company)}&page=0&pageSize=1&orderBy=newest_to_oldest` + filterQs);
      if (!res0.ok) throw new Error("API error");
      const data0 = await res0.json();
      const total = data0.totalNum || 0;
      
      if (total === 0) {
        extractionStatus.textContent = "No posts found.";
        startExtractionBtn.disabled = false;
        return;
      }
      
      // Stage 2: We need to parse links from each post detail over multiple pages.
      const pages = Math.ceil(total / 50);
      let postsProcessed = 0;
      
      for (let p = 0; p < pages; p++) {
        if (abortedExtraction) break;
        
        extractionStatus.textContent = `Fetching page ${p + 1} of ${pages}...`;
        const pRes = await fetch(`/api/posts?company=${encodeURIComponent(state.company)}&page=${p}&pageSize=50&orderBy=newest_to_oldest` + filterQs);
        if (!pRes.ok) continue;
        const pData = await pRes.json();
        const posts = pData.posts || [];
        
        for (const post of posts) {
          if (abortedExtraction) break;
          
          postsProcessed++;
          extractionStatus.textContent = `Scanning post ${postsProcessed} of ${total}: ${post.title.substring(0, 30)}...`;
          extractionProgress.style.width = ((postsProcessed / total) * 100) + '%';
          
          try {
            const detailRes = await fetch(`/api/posts/${post.id}`);
            if (!detailRes.ok) continue;
            const detailData = await detailRes.json();
            
            const content = detailData.content || '';
            const regex = /https:\/\/leetcode\.com\/problems\/[a-zA-Z0-9-]+\/?/g;
            const matches = content.match(regex);
            
            if (matches) {
              for (const match of matches) {
                const cleanLink = match.endsWith('/') ? match.slice(0, -1) : match;
                if (!extractedSet.has(cleanLink)) {
                  extractedSet.add(cleanLink);
                  const li = document.createElement('li');
                  
                  // Extract slug from problem URL
                  const parts = cleanLink.split('/');
                  const slug = parts[parts.length - 1];
                  
                  const a = document.createElement('a');
                  a.textContent = cleanLink;
                  a.title = "View problem content";
                  a.addEventListener('click', function(e) {
                      e.preventDefault();
                      openProblem(slug);
                  });
                  
                  li.appendChild(a);
                  extractedLinksList.appendChild(li);
                  extractedCount.textContent = extractedSet.size;
                }
              }
            }
          } catch(e) { /* ignore detail error and continue */ }
        }
      }
      
      if (abortedExtraction) {
        extractionStatus.textContent = "Extraction aborted.";
      } else {
        extractionStatus.textContent = "Extraction complete! Found " + extractedSet.size + " unique standard problem links.";
        extractionProgress.style.width = '100%';
      }
      
      if (extractedSet.size > 0 && downloadPdfBtn) {
        downloadPdfBtn.disabled = false;
      }
    } catch(err) {
      extractionStatus.textContent = "Error during extraction: " + err.message;
    }
    
    startExtractionBtn.disabled = false;
    isExtracting = false;
  });
}

if (downloadPdfBtn) {
  downloadPdfBtn.addEventListener('click', function() {
    if (typeof window.jspdf === 'undefined') {
      alert("PDF library is not loaded yet.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(`LeetCode Problem Links - ${state.company.toUpperCase()}`, 10, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    let y = 30;
    
    const linksArray = Array.from(extractedSet);
    
    for (let i = 0; i < linksArray.length; i++) {
        if (y > 280) {
            doc.addPage();
            y = 20;
        }
        
        const linkStr = `${i+1}. ${linksArray[i]}`;
        doc.text(linkStr, 10, y);
        y += 8;
    }
    
    doc.save(`leetcode_links_${state.company}.pdf`);
  });
}

// ── Init ──────────────────────────────────────────────────────
fetchPosts();
loadYears();
