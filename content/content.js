// SpeakWise - High Performance In-Page Coach & Dynamic Content Reader
(() => {
  let activeTooltip = null;
  let activeSidePanel = null;
  let recognition = null;
  let currentTargetText = '';
  let currentSurroundingContext = '';
  let currentAudioUrl = '';
  let sidePanelPinned = false;
  let isSentenceMode = false;
  let mouseUpTimeout = null;

  // In-Memory LRU Cache
  const translationCache = new Map();
  const dictionaryCache = new Map();

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  /* -------------------------------------------------------------
     1. Robust Text Extraction for Dynamic/Virtual/Shadow DOM Content
  ------------------------------------------------------------- */
  function getActiveSelectionData() {
    // 1. Check standard window selection
    let text = '';
    let range = null;
    let rect = null;
    let context = '';

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      text = sel.toString().trim();
      if (text) {
        try {
          range = sel.getRangeAt(0);
          rect = range.getBoundingClientRect();
          context = getSurroundingSentence(sel);
        } catch (e) {}
      }
    }

    // 2. Check active input/textarea/contenteditable or shadowRoot
    if (!text) {
      let activeEl = document.activeElement;
      // Handle Shadow DOM active element
      while (activeEl && activeEl.shadowRoot && activeEl.shadowRoot.activeElement) {
        activeEl = activeEl.shadowRoot.activeElement;
      }

      if (activeEl) {
        if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
          const start = activeEl.selectionStart;
          const end = activeEl.selectionEnd;
          if (typeof start === 'number' && typeof end === 'number' && start !== end) {
            text = activeEl.value.substring(start, end).trim();
            rect = activeEl.getBoundingClientRect();
            context = activeEl.value;
          }
        } else if (activeEl.isContentEditable) {
          text = (activeEl.innerText || activeEl.textContent || '').trim();
          rect = activeEl.getBoundingClientRect();
          context = text;
        }
      }
    }

    // 3. Check open Shadow DOMs if window.getSelection() is empty
    if (!text && document.querySelectorAll) {
      const shadowHosts = document.querySelectorAll('*');
      for (let i = 0; i < shadowHosts.length; i++) {
        const root = shadowHosts[i].shadowRoot;
        if (root && root.getSelection) {
          const shadowSel = root.getSelection();
          if (shadowSel && shadowSel.rangeCount > 0) {
            const shadowText = shadowSel.toString().trim();
            if (shadowText) {
              text = shadowText;
              range = shadowSel.getRangeAt(0);
              rect = range.getBoundingClientRect();
              context = shadowText;
              break;
            }
          }
        }
      }
    }

    return { text, range, rect, context };
  }

  function getSurroundingSentence(selection) {
    try {
      if (!selection.rangeCount) return '';
      const range = selection.getRangeAt(0);
      let container = range.commonAncestorContainer;
      while (container && container.nodeType !== Node.ELEMENT_NODE) {
        container = container.parentNode;
      }
      if (!container) return '';
      const fullParagraph = container.innerText || container.textContent || '';
      return fullParagraph.slice(0, 500).trim();
    } catch (e) {
      return '';
    }
  }

  /* -------------------------------------------------------------
     2. Smart Inference & Grammar Repair Engine
  ------------------------------------------------------------- */
  function analyzeAndRepairText(text, context) {
    let repaired = text;
    let missingWordGuessed = false;
    let explanation = '';

    const missingPattern = /\b(___|\.\.\.|\?{2,}|\[\w*\])\b/i;
    const hasMissingWordMarker = missingPattern.test(text);

    const commonRepairs = [
      { rule: /\b(how u)\b/gi, fix: 'how are you' },
      { rule: /\b(i go school yesterday)\b/gi, fix: 'I went to school yesterday' },
      { rule: /\b(he don't)\b/gi, fix: "he doesn't" },
      { rule: /\b(she like)\b/gi, fix: 'she likes' },
      { rule: /\b(look forward to hear)\b/gi, fix: 'look forward to hearing' }
    ];

    commonRepairs.forEach(item => {
      if (item.rule.test(repaired)) {
        repaired = repaired.replace(item.rule, item.fix);
        explanation = 'Đã tự động sửa lỗi ngữ pháp/từ ngữ thông dụng theo ngữ cảnh.';
      }
    });

    if (hasMissingWordMarker && context) {
      missingWordGuessed = true;
    }

    return {
      original: text,
      repairedText: repaired,
      hasMissingWord: hasMissingWordMarker || missingWordGuessed,
      explanation: explanation
    };
  }

  /* -------------------------------------------------------------
     3. Cached High-Speed Translation API
  ------------------------------------------------------------- */
  async function smartTranslate(text, context) {
    const analysis = analyzeAndRepairText(text, context);
    const targetQuery = analysis.repairedText;
    const cacheKey = targetQuery.toLowerCase();

    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey);
    }

    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&dt=bd&dt=qc&dt=rm&q=${encodeURIComponent(targetQuery)}`;
      const res = await fetch(url);
      const data = await res.json();

      let primaryTranslation = '';
      if (data && data[0]) {
        data[0].forEach(item => {
          if (item && item[0]) primaryTranslation += item[0];
        });
      }

      let correctedQuery = '';
      if (data && data[7] && data[7][1]) {
        correctedQuery = data[7][1];
      }

      const dictEntries = [];
      if (data && data[1]) {
        data[1].forEach(posGroup => {
          dictEntries.push({
            pos: posGroup[0],
            meanings: posGroup[1] || []
          });
        });
      }

      let smartGuessNote = '';
      if (text.includes('...') || text.includes('___')) {
        smartGuessNote = `💡 <strong>Suy luận ngữ cảnh:</strong> Phát hiện vị trí khuyết từ. Đã dịch trọn ý tự nhiên nhất theo đoạn văn.`;
      } else if (correctedQuery) {
        smartGuessNote = `💡 <strong>Tự động nhận diện từ đúng:</strong> Hệ thống đoán bạn muốn dùng cụm <em>"${correctedQuery}"</em>.`;
      }

      const result = {
        translation: primaryTranslation.trim() || 'Chưa có bản dịch.',
        smartGuessNote: smartGuessNote,
        dictEntries: dictEntries,
        repaired: analysis.repairedText
      };

      if (translationCache.size > 200) translationCache.clear();
      translationCache.set(cacheKey, result);

      return result;
    } catch (e) {
      return {
        translation: 'Lỗi nạp bản dịch thông minh.',
        smartGuessNote: '',
        dictEntries: [],
        repaired: text
      };
    }
  }

  /* -------------------------------------------------------------
     4. Dynamic Selection Pill & Multiple Event Listeners
  ------------------------------------------------------------- */
  let selectionPill = null;
  let lastSelectionData = null;
  let ocrImageButton = null;

  function initSelectionListener() {
    selectionPill = document.createElement('div');
    selectionPill.id = 'speakwise-selection-pill';
    selectionPill.innerHTML = `
      <span class="sp-pill-icon">✨</span>
      <span class="sp-pill-text">SpeakWise Dịch & Luyện</span>
    `;
    selectionPill.style.display = 'none';
    (document.body || document.documentElement).appendChild(selectionPill);

    // Hover button for images to trigger OCR
    ocrImageButton = document.createElement('div');
    ocrImageButton.id = 'speakwise-image-pill';
    ocrImageButton.innerHTML = `
      <span class="sp-pill-icon">📷</span>
      <span class="sp-pill-text">Quét chữ trong ảnh</span>
    `;
    ocrImageButton.style.display = 'none';
    (document.body || document.documentElement).appendChild(ocrImageButton);

    let currentHoveredImage = null;

    document.addEventListener('mouseover', (e) => {
      const target = e.target;
      if (target && target.tagName === 'IMG' && target.src && !target.src.startsWith('chrome-extension://')) {
        const rect = target.getBoundingClientRect();
        if (rect.width >= 50 && rect.height >= 50) {
          currentHoveredImage = target;
          const leftPos = Math.max(10, window.scrollX + rect.left + 10);
          const topPos = Math.max(window.scrollY + 10, window.scrollY + rect.top + 10);
          ocrImageButton.style.top = `${topPos}px`;
          ocrImageButton.style.left = `${leftPos}px`;
          ocrImageButton.style.display = 'inline-flex';
        }
      } else if (ocrImageButton && !ocrImageButton.contains(e.target) && target !== currentHoveredImage) {
        // Hide if moved away from image and not hovering over the pill itself
        if (!e.relatedTarget || (e.relatedTarget !== currentHoveredImage && !ocrImageButton.contains(e.relatedTarget))) {
          ocrImageButton.style.display = 'none';
        }
      }
    });

    ocrImageButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentHoveredImage) {
        ocrImageButton.style.display = 'none';
        triggerImageOCR(currentHoveredImage);
      }
    });

    selectionPill.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const selData = getActiveSelectionData();
      const currentData = (selData && selData.text) ? selData : lastSelectionData;
      if (currentData && currentData.text) {
        selectionPill.style.display = 'none';
        showInlineTooltip(currentData.text, currentData.context, currentData.rect);
      }
    });

    const handleSelectionChange = () => {
      clearTimeout(mouseUpTimeout);
      mouseUpTimeout = setTimeout(() => {
        const selData = getActiveSelectionData();
        const text = selData.text;

        if (text && text.length > 1 && text.length <= 600) {
          lastSelectionData = selData;
          const rect = selData.rect;
          if (rect && (rect.width > 0 || rect.height > 0)) {
            const pillWidth = 140;
            const leftPos = Math.max(10, Math.min(window.innerWidth - pillWidth - 10, window.scrollX + rect.left + (rect.width / 2) - (pillWidth / 2)));
            const topPos = Math.max(window.scrollY + 10, window.scrollY + rect.top - 42);

            selectionPill.style.top = `${topPos}px`;
            selectionPill.style.left = `${leftPos}px`;
            selectionPill.style.display = 'inline-flex';
            return;
          }
        }
        if (selectionPill) selectionPill.style.display = 'none';
      }, 60);
    };

    // Support both mouseup and selectionchange for SPA/Ajax/Infinite Scroll dynamic content
    document.addEventListener('mouseup', (e) => {
      if (activeTooltip && activeTooltip.contains(e.target)) return;
      if (activeSidePanel && activeSidePanel.contains(e.target)) return;
      if (selectionPill && selectionPill.contains(e.target)) return;
      handleSelectionChange();
    });

    document.addEventListener('selectionchange', () => {
      // If modal is open, don't auto show pill
      if (activeTooltip || (activeSidePanel && activeSidePanel.classList.contains('visible'))) return;
      handleSelectionChange();
    });

    document.addEventListener('mousedown', (e) => {
      if (activeTooltip && !activeTooltip.contains(e.target) && e.target !== selectionPill) {
        removeInlineTooltip();
      }
    });

    // Handle dynamic updates via MutationObserver
    const observer = new MutationObserver(() => {
      // Ensure pill is in DOM if SPA wiped body
      if (selectionPill && !document.contains(selectionPill)) {
        (document.body || document.documentElement).appendChild(selectionPill);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* -------------------------------------------------------------
     5. Inline Floating Tooltip with Boundary & Position Optimization
  ------------------------------------------------------------- */
  function showInlineTooltip(rawText, context, targetRect, isOcrResult = false) {
    removeInlineTooltip();
    const cleanText = rawText.trim();
    currentTargetText = cleanText;
    currentSurroundingContext = context || '';

    const wordsCount = cleanText.split(/\s+/).length;
    isSentenceMode = wordsCount > 2 || cleanText.includes('.') || cleanText.includes('?') || cleanText.includes('!');

    activeTooltip = document.createElement('div');
    activeTooltip.id = 'speakwise-inline-tooltip';
    if (isSentenceMode) {
      activeTooltip.classList.add('sentence-mode');
    }

    const tipWidth = isSentenceMode ? 430 : 350;
    const tipEstimatedHeight = 300;

    const baseLeft = targetRect ? targetRect.left : 100;
    const baseTop = targetRect ? targetRect.bottom : 100;

    let leftPos = window.scrollX + baseLeft;
    // Align center if target width is larger
    if (targetRect && targetRect.width > tipWidth) {
      leftPos = window.scrollX + targetRect.left + (targetRect.width - tipWidth) / 2;
    }
    if (leftPos + tipWidth > window.scrollX + window.innerWidth - 15) {
      leftPos = window.scrollX + window.innerWidth - tipWidth - 15;
    }
    if (leftPos < window.scrollX + 10) {
      leftPos = window.scrollX + 10;
    }

    let topPos = window.scrollY + baseTop + 10;
    // If tooltip overflows viewport bottom, flip above
    if (targetRect && (targetRect.bottom + tipEstimatedHeight > window.innerHeight) && (targetRect.top > tipEstimatedHeight)) {
      topPos = window.scrollY + targetRect.top - tipEstimatedHeight - 12;
    }

    activeTooltip.style.top = `${topPos}px`;
    activeTooltip.style.left = `${leftPos}px`;

    const badgeLabel = isOcrResult ? '📷 Chữ từ ảnh/PDF' : (isSentenceMode ? '✨ Dịch Ngữ Cảnh' : '📖 Từ vựng');

    activeTooltip.innerHTML = `
      <div class="sp-card">
        <div class="sp-card-header">
          <div class="sp-word-group">
            <span class="sp-badge-type ${isOcrResult ? 'ocr' : ''}">${badgeLabel}</span>
            ${!isSentenceMode ? `<span class="sp-target-word">${cleanText}</span><span class="sp-ipa" id="sp-tip-ipa">...</span>` : ''}
          </div>
          <div class="sp-header-actions">
            <button class="sp-btn-icon" id="sp-tip-expand-btn" title="Mở Panel bên phải (Alt+W)">⤢</button>
            <button class="sp-btn-icon" id="sp-tip-close-btn" title="Đóng">&times;</button>
          </div>
        </div>

        ${isSentenceMode ? `<div class="sp-sentence-original">“${cleanText}”</div>` : ''}

        <!-- Nghĩa Tiếng Việt & Suy Luận Ngữ Cảnh -->
        <div class="sp-vn-meaning-box">
          <div class="sp-vn-label">
            <span>🇻🇳 <strong>Nghĩa Tiếng Việt:</strong></span>
          </div>
          <div class="sp-vn-primary" id="sp-tip-vn-primary">
            <div class="sp-loading-spinner"></div>
          </div>
          <div id="sp-tip-smart-guess" class="sp-smart-guess-box" style="display:none;"></div>
          <div class="sp-vn-sub-meanings" id="sp-tip-vn-subs" style="display:none;"></div>
        </div>

        <div class="sp-audio-actions">
          <button class="sp-pill-btn" id="sp-tip-audio-norm">🔊 Nghe chuẩn</button>
          <button class="sp-pill-btn slow" id="sp-tip-audio-slow">🐢 Chậm 0.6x</button>
          <button class="sp-pill-btn star" id="sp-tip-save-btn">⭐ Lưu lại</button>
        </div>

        <!-- Luyện nói với Word-Level Highlighting -->
        <div class="sp-voice-test-box">
          <div class="sp-voice-row">
            <button class="sp-mic-pill" id="sp-tip-mic-btn">
              <span class="sp-mic-icon">🎤</span>
              <span class="sp-mic-label">${isSentenceMode ? 'Đọc luyện câu' : 'Luyện phát âm'}</span>
            </button>
            <div class="sp-score-container" id="sp-tip-score-box" style="display:none;">
              <span class="sp-score-badge" id="sp-tip-score-badge">0%</span>
              <span class="sp-score-msg" id="sp-tip-score-msg"></span>
            </div>
          </div>
          <div class="sp-heard-text" id="sp-tip-heard-text"></div>
          <div class="sp-word-breakdown" id="sp-tip-word-breakdown" style="display:none;"></div>
        </div>

        ${!isSentenceMode ? `
        <div class="sp-definition-box" id="sp-tip-def-box">
          <div class="sp-loading-spinner"></div>
        </div>` : ''}
      </div>
    `;

    (document.body || document.documentElement).appendChild(activeTooltip);

    // Event Bindings
    document.getElementById('sp-tip-close-btn').addEventListener('click', removeInlineTooltip);
    document.getElementById('sp-tip-expand-btn').addEventListener('click', () => {
      openSidePanel(currentTargetText, currentSurroundingContext);
      removeInlineTooltip();
    });
    document.getElementById('sp-tip-audio-norm').addEventListener('click', () => playPronunciation(currentTargetText, 1.0));
    document.getElementById('sp-tip-audio-slow').addEventListener('click', () => playPronunciation(currentTargetText, 0.6));
    document.getElementById('sp-tip-mic-btn').addEventListener('click', () => toggleSpeechTest('tip'));
    document.getElementById('sp-tip-save-btn').addEventListener('click', (e) => saveWordToNotebook(e.target));

    // Async Fetch Translation with Cache
    smartTranslate(cleanText, context).then(res => {
      const primaryEl = document.getElementById('sp-tip-vn-primary');
      const guessEl = document.getElementById('sp-tip-smart-guess');
      const subsEl = document.getElementById('sp-tip-vn-subs');

      if (primaryEl) primaryEl.textContent = res.translation;

      if (res.smartGuessNote) {
        guessEl.style.display = 'block';
        guessEl.innerHTML = res.smartGuessNote;
      }

      if (!isSentenceMode && res.dictEntries && res.dictEntries.length > 0) {
        subsEl.style.display = 'block';
        let html = '';
        res.dictEntries.slice(0, 2).forEach(item => {
          const posMap = { noun: 'Danh từ', verb: 'Động từ', adjective: 'Tính từ', adverb: 'Trạng từ' };
          const posTitle = posMap[item.pos] || item.pos;
          html += `<div class="sp-vn-pos-line"><span class="sp-vn-pos-badge">${posTitle}</span> ${item.meanings.slice(0, 4).join(', ')}</div>`;
        });
        subsEl.innerHTML = html;
      }
    });

    if (!isSentenceMode) {
      fetchEnglishExtras(cleanText, 'tip');
    }
  }

      if (res.smartGuessNote) {
        guessEl.style.display = 'block';
        guessEl.innerHTML = res.smartGuessNote;
      }

      if (!isSentenceMode && res.dictEntries && res.dictEntries.length > 0) {
        subsEl.style.display = 'block';
        let html = '';
        res.dictEntries.slice(0, 2).forEach(item => {
          const posMap = { noun: 'Danh từ', verb: 'Động từ', adjective: 'Tính từ', adverb: 'Trạng từ' };
          const posTitle = posMap[item.pos] || item.pos;
          html += `<div class="sp-vn-pos-line"><span class="sp-vn-pos-badge">${posTitle}</span> ${item.meanings.slice(0, 4).join(', ')}</div>`;
        });
        subsEl.innerHTML = html;
      }
    });

    if (!isSentenceMode) {
      fetchEnglishExtras(cleanText, 'tip');
    }
  }

  function removeInlineTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
      stopRecognition();
    }
  }

  /* -------------------------------------------------------------
     6. Side Panel
  ------------------------------------------------------------- */
  function openSidePanel(text, context = '') {
    if (!activeSidePanel) {
      activeSidePanel = document.createElement('div');
      activeSidePanel.id = 'speakwise-sidepanel';
      activeSidePanel.innerHTML = `
        <div class="sp-panel-header">
          <div class="sp-panel-title">
            <span class="sp-panel-logo">✨</span>
            <strong>SpeakWise Smart Coach</strong>
          </div>
          <div class="sp-panel-controls">
            <button class="sp-panel-btn" id="sp-panel-pin-btn" title="Ghim thanh bên">📌</button>
            <button class="sp-panel-btn" id="sp-panel-close-btn" title="Đóng">&times;</button>
          </div>
        </div>

        <div class="sp-panel-search">
          <textarea id="sp-panel-input" rows="2" placeholder="Nhập câu khuyết từ (vd: I ... to school), đoạn văn hoặc từ cần tra..."></textarea>
          <button id="sp-panel-search-btn">Dịch & Suy Luận</button>
        </div>

        <div class="sp-panel-body" id="sp-panel-body">
          <div class="sp-panel-word-head">
            <div class="sp-type-indicator" id="sp-panel-type-tag">✨ Dịch Ngữ Cảnh</div>
            <h2 id="sp-panel-word">...</h2>
            <div class="sp-panel-ipa-row">
              <span class="sp-ipa" id="sp-panel-ipa" style="display:none;">/.../</span>
              <button class="sp-pill-btn" id="sp-panel-audio-norm">🔊 Nghe đọc</button>
              <button class="sp-pill-btn slow" id="sp-panel-audio-slow">🐢 Chậm 0.6x</button>
              <button class="sp-pill-btn star" id="sp-panel-save-btn">⭐ Lưu lại</button>
            </div>
          </div>

          <div class="sp-panel-vn-card">
            <div class="sp-vn-header-label">🇻🇳 <strong>BẢN DỊCH & SUY LUẬN NGỮ CẢNH</strong></div>
            <div class="sp-vn-main-translation" id="sp-panel-vn-trans">Đang suy luận...</div>
            <div id="sp-panel-smart-guess" class="sp-smart-guess-box" style="display:none;"></div>
            <div id="sp-panel-vn-details" class="sp-vn-details-group"></div>
          </div>

          <div class="sp-panel-trainer">
            <div class="sp-trainer-header">
              <strong>🗣️ Luyện đọc cả câu & Chấm điểm chi tiết</strong>
            </div>
            <div class="sp-voice-row">
              <button class="sp-mic-pill" id="sp-panel-mic-btn">
                <span class="sp-mic-icon">🎤</span>
                <span class="sp-mic-label">Bấm để nói</span>
              </button>
              <div class="sp-score-container" id="sp-panel-score-box" style="display:none;">
                <span class="sp-score-badge" id="sp-panel-score-badge">0%</span>
                <span class="sp-score-msg" id="sp-panel-score-msg"></span>
              </div>
            </div>
            <div class="sp-heard-text" id="sp-panel-heard-text"></div>
            <div class="sp-word-breakdown" id="sp-panel-word-breakdown" style="display:none;"></div>
          </div>

          <div id="sp-panel-word-extras" style="display:none;">
            <div class="sp-panel-section">
              <h4 class="sp-section-title">Định nghĩa & Ví dụ ngữ cảnh</h4>
              <div id="sp-panel-definitions" class="sp-definitions-list"></div>
            </div>

            <div class="sp-panel-section" id="sp-panel-syn-section" style="display:none;">
              <h4 class="sp-section-title">Từ đồng nghĩa</h4>
              <div id="sp-panel-synonyms" class="sp-synonyms-cloud"></div>
            </div>
          </div>
        </div>
      `;

      (document.body || document.documentElement).appendChild(activeSidePanel);

      document.getElementById('sp-panel-close-btn').addEventListener('click', closeSidePanel);
      document.getElementById('sp-panel-pin-btn').addEventListener('click', togglePinPanel);
      document.getElementById('sp-panel-search-btn').addEventListener('click', () => {
        const val = document.getElementById('sp-panel-input').value.trim();
        if (val) loadPanelText(val, '');
      });
      document.getElementById('sp-panel-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const val = e.target.value.trim();
          if (val) loadPanelText(val, '');
        }
      });
      document.getElementById('sp-panel-audio-norm').addEventListener('click', () => playPronunciation(currentTargetText, 1.0));
      document.getElementById('sp-panel-audio-slow').addEventListener('click', () => playPronunciation(currentTargetText, 0.6));
      document.getElementById('sp-panel-mic-btn').addEventListener('click', () => toggleSpeechTest('panel'));
      document.getElementById('sp-panel-save-btn').addEventListener('click', (e) => saveWordToNotebook(e.target));
    }

    activeSidePanel.classList.add('visible');
    if (text) {
      document.getElementById('sp-panel-input').value = text;
      loadPanelText(text, context);
    }
  }

  function closeSidePanel() {
    if (activeSidePanel) {
      activeSidePanel.classList.remove('visible');
      stopRecognition();
    }
  }

  function togglePinPanel() {
    sidePanelPinned = !sidePanelPinned;
    const pinBtn = document.getElementById('sp-panel-pin-btn');
    if (sidePanelPinned) {
      pinBtn.classList.add('pinned');
      document.body.style.marginRight = '380px';
      document.body.style.transition = 'margin-right 0.25s ease';
    } else {
      pinBtn.classList.remove('pinned');
      document.body.style.marginRight = '0px';
    }
  }

  function loadPanelText(text, context = '') {
    const cleanText = text.trim();
    currentTargetText = cleanText;

    const words = cleanText.split(/\s+/).length;
    const isSentence = words > 2 || cleanText.includes('.') || cleanText.includes('?') || cleanText.includes('!');

    document.getElementById('sp-panel-type-tag').textContent = isSentence ? '✨ Dịch Ngữ Cảnh' : '📖 Từ vựng';
    document.getElementById('sp-panel-word').textContent = cleanText;
    document.getElementById('sp-panel-vn-trans').textContent = 'Đang suy luận nghĩa...';
    document.getElementById('sp-panel-smart-guess').style.display = 'none';
    document.getElementById('sp-panel-vn-details').innerHTML = '';

    smartTranslate(cleanText, context).then(res => {
      document.getElementById('sp-panel-vn-trans').textContent = res.translation;

      if (res.smartGuessNote) {
        const guessEl = document.getElementById('sp-panel-smart-guess');
        guessEl.style.display = 'block';
        guessEl.innerHTML = res.smartGuessNote;
      }

      const detailsContainer = document.getElementById('sp-panel-vn-details');
      if (res.dictEntries && res.dictEntries.length > 0) {
        let detailsHtml = '';
        res.dictEntries.forEach(item => {
          const posMap = { noun: 'Danh từ', verb: 'Động từ', adjective: 'Tính từ', adverb: 'Trạng từ' };
          const posTitle = posMap[item.pos] || item.pos;
          detailsHtml += `
            <div class="sp-vn-detail-row">
              <span class="sp-vn-pos-badge">${posTitle}</span>
              <span class="sp-vn-meanings-text">${item.meanings.join(', ')}</span>
            </div>
          `;
        });
        detailsContainer.innerHTML = detailsHtml;
      }
    });

    const extras = document.getElementById('sp-panel-word-extras');
    const ipaEl = document.getElementById('sp-panel-ipa');

    if (!isSentence) {
      ipaEl.style.display = 'inline-block';
      extras.style.display = 'block';
      fetchEnglishExtras(cleanText.replace(/[^a-zA-Z\s'-]/g, ''), 'panel');
    } else {
      ipaEl.style.display = 'none';
      extras.style.display = 'none';
      currentAudioUrl = '';
    }
  }

  /* -------------------------------------------------------------
     7. English Extras with Caching
  ------------------------------------------------------------- */
  let currentFetchedEntry = null;

  async function fetchEnglishExtras(word, mode) {
    const cacheKey = word.toLowerCase();
    if (dictionaryCache.has(cacheKey)) {
      renderEnglishData(dictionaryCache.get(cacheKey), mode);
      return;
    }

    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      currentFetchedEntry = data[0];
      dictionaryCache.set(cacheKey, currentFetchedEntry);
      renderEnglishData(currentFetchedEntry, mode);
    } catch (err) {
      if (mode === 'tip') {
        const defBox = document.getElementById('sp-tip-def-box');
        if (defBox) defBox.style.display = 'none';
      }
    }
  }

  function renderEnglishData(entry, mode) {
    currentFetchedEntry = entry;
    let ipa = entry.phonetic || '';
    currentAudioUrl = '';

    if (entry.phonetics && entry.phonetics.length > 0) {
      for (const p of entry.phonetics) {
        if (!ipa && p.text) ipa = p.text;
        if (p.audio && !currentAudioUrl) currentAudioUrl = p.audio;
      }
    }

    if (mode === 'tip') {
      const ipaEl = document.getElementById('sp-tip-ipa');
      if (ipaEl) ipaEl.textContent = ipa || `/${entry.word}/`;

      const defBox = document.getElementById('sp-tip-def-box');
      if (defBox && entry.meanings && entry.meanings[0]) {
        const m = entry.meanings[0];
        const d = m.definitions[0];
        defBox.innerHTML = `
          <div class="sp-pos-label">Context (Anh - Anh)</div>
          <div class="sp-def-text">${d.definition}</div>
          ${d.example ? `<div class="sp-def-example">“${d.example}”</div>` : ''}
        `;
      }
    } else if (mode === 'panel') {
      document.getElementById('sp-panel-ipa').textContent = ipa || `/${entry.word}/`;

      const defsContainer = document.getElementById('sp-panel-definitions');
      defsContainer.innerHTML = '';
      const allSynonyms = new Set();

      entry.meanings.slice(0, 2).forEach(m => {
        const wrap = document.createElement('div');
        wrap.className = 'sp-panel-def-group';
        let defsListHtml = '';
        m.definitions.slice(0, 2).forEach(d => {
          defsListHtml += `
            <div class="sp-panel-def-row">
              <p class="sp-panel-def-desc">${d.definition}</p>
              ${d.example ? `<p class="sp-panel-def-eg">“${d.example}”</p>` : ''}
            </div>
          `;
        });
        wrap.innerHTML = `<span class="sp-pos-tag">${m.partOfSpeech}</span>${defsListHtml}`;
        defsContainer.appendChild(wrap);

        if (m.synonyms) m.synonyms.forEach(s => allSynonyms.add(s));
      });

      const synSection = document.getElementById('sp-panel-syn-section');
      const synContainer = document.getElementById('sp-panel-synonyms');
      synContainer.innerHTML = '';
      if (allSynonyms.size > 0) {
        synSection.style.display = 'block';
        Array.from(allSynonyms).slice(0, 8).forEach(s => {
          const chip = document.createElement('span');
          chip.className = 'sp-syn-chip';
          chip.textContent = s;
          chip.addEventListener('click', () => {
            document.getElementById('sp-panel-input').value = s;
            loadPanelText(s, '');
          });
          synContainer.appendChild(chip);
        });
      } else {
        synSection.style.display = 'none';
      }
    }
  }

  /* -------------------------------------------------------------
     8. Audio & TTS
  ------------------------------------------------------------- */
  function playPronunciation(text, rate = 1.0) {
    if (currentAudioUrl && text.split(/\s+/).length <= 2) {
      const audio = new Audio(currentAudioUrl);
      audio.playbackRate = rate;
      audio.play().catch(() => playBrowserTTS(text, rate));
    } else {
      playBrowserTTS(text, rate);
    }
  }

  function playBrowserTTS(text, rate = 1.0) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'en-US';
      utt.rate = rate;
      window.speechSynthesis.speak(utt);
    }
  }

  /* -------------------------------------------------------------
     9. Advanced Phonetic & Word-Level Scorer
  ------------------------------------------------------------- */
  function toggleSpeechTest(uiMode) {
    const btn = uiMode === 'tip' ? document.getElementById('sp-tip-mic-btn') : document.getElementById('sp-panel-mic-btn');
    if (!btn) return;

    if (recognition && btn.classList.contains('recording')) {
      stopRecognition();
      return;
    }

    if (!SpeechRecognition) {
      alert('Trình duyệt chưa hỗ trợ Web Speech API.');
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    btn.classList.add('recording');
    const label = btn.querySelector('.sp-mic-label');
    if (label) label.textContent = 'Đang nghe...';

    recognition.onresult = (e) => {
      const spoken = e.results[0][0].transcript.toLowerCase().trim();
      gradeSpeech(currentTargetText, spoken, uiMode);
    };

    recognition.onerror = () => stopRecognition();
    recognition.onend = () => stopRecognition();

    try {
      recognition.start();
    } catch (e) {
      stopRecognition();
    }
  }

  function stopRecognition() {
    const tipBtn = document.getElementById('sp-tip-mic-btn');
    const panelBtn = document.getElementById('sp-panel-mic-btn');
    [tipBtn, panelBtn].forEach(btn => {
      if (btn) {
        btn.classList.remove('recording');
        const lbl = btn.querySelector('.sp-mic-label');
        if (lbl) lbl.textContent = 'Bấm để nói';
      }
    });
    if (recognition) {
      try { recognition.stop(); } catch(e){}
      recognition = null;
    }
  }

  function gradeSpeech(target, spoken, uiMode) {
    const prefix = uiMode === 'tip' ? 'sp-tip' : 'sp-panel';
    const scoreBox = document.getElementById(`${prefix}-score-box`);
    const scoreBadge = document.getElementById(`${prefix}-score-badge`);
    const scoreMsg = document.getElementById(`${prefix}-score-msg`);
    const heardBox = document.getElementById(`${prefix}-heard-text`);
    const breakdownBox = document.getElementById(`${prefix}-word-breakdown`);

    if (!scoreBox) return;

    scoreBox.style.display = 'flex';
    heardBox.innerHTML = `Bạn vừa đọc: "<strong>${spoken}</strong>"`;

    const targetWords = target.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "").split(/\s+/).filter(Boolean);
    const spokenWords = spoken.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "").split(/\s+/).filter(Boolean);

    let correctCount = 0;
    let breakdownHtml = '<div class="sp-breakdown-title">Chi tiết từng từ bạn đọc:</div><div class="sp-words-chips">';

    targetWords.forEach(tWord => {
      const hasMatch = spokenWords.some(sWord => calculateSimilarity(tWord, sWord) >= 0.75);
      if (hasMatch) {
        correctCount++;
        breakdownHtml += `<span class="sp-word-chip correct" title="Phát âm chuẩn">✓ ${tWord}</span>`;
      } else {
        breakdownHtml += `<span class="sp-word-chip missed" title="Cần phát âm rõ hơn">✗ ${tWord}</span>`;
      }
    });

    breakdownHtml += '</div>';

    const wordLevelScore = targetWords.length > 0 ? (correctCount / targetWords.length) : 1;
    const stringScore = calculateSimilarity(targetWords.join(' '), spokenWords.join(' '));
    const finalScorePct = Math.round(((wordLevelScore * 0.7) + (stringScore * 0.3)) * 100);

    scoreBadge.textContent = `${finalScorePct}%`;
    scoreBadge.className = 'sp-score-badge';

    if (finalScorePct >= 85) {
      scoreBadge.classList.add('perfect');
      scoreMsg.textContent = '🌟 Rất xuất sắc & chuẩn bản xứ!';
    } else if (finalScorePct >= 60) {
      scoreBadge.classList.add('good');
      scoreMsg.textContent = '👍 Khá chuẩn, người bản ngữ hiểu tốt!';
    } else {
      scoreBadge.classList.add('retry');
      scoreMsg.textContent = '💡 Hãy bấm nút 🐢 Chậm để nghe kỹ âm.';
    }

    if (breakdownBox) {
      breakdownBox.innerHTML = breakdownHtml;
      breakdownBox.style.display = 'block';
    }
  }

  function calculateSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    const l1 = s1.length, l2 = s2.length, max = Math.max(l1, l2);
    if (max === 0) return 1.0;
    const m = [];
    for (let i = 0; i <= l1; i++) m[i] = [i];
    for (let j = 0; j <= l2; j++) m[0][j] = j;
    for (let i = 1; i <= l1; i++) {
      for (let j = 1; j <= l2; j++) {
        const c = s1[i-1] === s2[j-1] ? 0 : 1;
        m[i][j] = Math.min(m[i-1][j] + 1, m[i][j-1] + 1, m[i-1][j-1] + c);
      }
    }
    return Math.max(0, (max - m[l1][l2]) / max);
  }

  /* -------------------------------------------------------------
     10. Save to Vocabulary Notebook
  ------------------------------------------------------------- */
  function saveWordToNotebook(btnEl) {
    const meaning = document.getElementById('sp-tip-vn-primary')?.textContent || 
                    document.getElementById('sp-panel-vn-trans')?.textContent || '';
    
    const payload = {
      word: currentTargetText,
      phonetic: currentFetchedEntry ? currentFetchedEntry.phonetic : '',
      audioUrl: currentAudioUrl,
      meaning: meaning,
      isSentence: currentTargetText.split(/\s+/).length > 2
    };

    chrome.runtime.sendMessage({ action: "save_word", data: payload }, () => {
      btnEl.textContent = '✅ Đã lưu';
      setTimeout(() => {
        btnEl.textContent = '⭐ Lưu lại';
      }, 1800);
    });
  }

  /* -------------------------------------------------------------
     11. Image OCR Trigger & Flow
  ------------------------------------------------------------- */
  function triggerImageOCR(imgEl, explicitUrl) {
    const src = explicitUrl || imgEl.src;
    const rect = imgEl ? imgEl.getBoundingClientRect() : { left: window.innerWidth / 2 - 100, top: 100, bottom: 120, width: 200, height: 100 };

    // Show inline loading state
    showInlineTooltip('Đang quét chữ...', '', rect, true);
    const primaryEl = document.getElementById('sp-tip-vn-primary');
    if (primaryEl) primaryEl.innerHTML = '<div class="sp-loading-spinner"></div> Đang nhận diện ký tự & câu văn qua OCR...';

    // Try canvas extraction first (handles cross-origin if permitted or data URI)
    let dataUrl = null;
    if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgEl, 0, 0);
        dataUrl = canvas.toDataURL('image/png');
      } catch (err) {
        // Cross-origin canvas security, will fallback to imageUrl
        dataUrl = null;
      }
    }

    const payload = dataUrl ? { action: "perform_ocr", dataUrl: dataUrl } : { action: "perform_ocr", imageUrl: src };

    chrome.runtime.sendMessage(payload, (response) => {
      if (response && response.success && response.text) {
        showInlineTooltip(response.text, '', rect, true);
      } else {
        const err = (response && response.error) || 'Không thể quét chữ từ ảnh này.';
        if (primaryEl) {
          primaryEl.innerHTML = `<span style="color:#dc2626;">⚠️ ${err}</span>`;
        }
      }
    });
  }

  /* -------------------------------------------------------------
     12. Screen Snipping & Cropping Tool (Cho PDF, Tab mở ảnh, Web)
  ------------------------------------------------------------- */
  let snipOverlay = null;

  function initScreenSnipping(screenshotUrl) {
    if (snipOverlay) snipOverlay.remove();

    snipOverlay = document.createElement('div');
    snipOverlay.id = 'speakwise-snip-overlay';
    snipOverlay.innerHTML = `
      <div class="sp-snip-instruction">
        ✂️ <strong>Kéo chuột để khoanh vùng chữ cần đọc trong ảnh / PDF</strong> (Nhấn <strong>ESC</strong> để hủy)
      </div>
      <div id="sp-snip-box" class="sp-snip-box" style="display:none;"></div>
    `;

    document.documentElement.appendChild(snipOverlay);

    const snipBox = document.getElementById('sp-snip-box');
    let startX = 0, startY = 0, isDragging = false;

    const onMouseDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      snipBox.style.left = `${startX}px`;
      snipBox.style.top = `${startY}px`;
      snipBox.style.width = '0px';
      snipBox.style.height = '0px';
      snipBox.style.display = 'block';
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const currentX = e.clientX;
      const currentY = e.clientY;
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      snipBox.style.left = `${x}px`;
      snipBox.style.top = `${y}px`;
      snipBox.style.width = `${width}px`;
      snipBox.style.height = `${height}px`;
    };

    const onMouseUp = (e) => {
      if (!isDragging) return;
      isDragging = false;

      const endX = e.clientX;
      const endY = e.clientY;
      const cropX = Math.min(startX, endX);
      const cropY = Math.min(startY, endY);
      const cropWidth = Math.abs(endX - startX);
      const cropHeight = Math.abs(endY - startY);

      // Clean up overlay
      cleanupSnipping();

      if (cropWidth > 15 && cropHeight > 10) {
        cropAndProcessScreenshot(screenshotUrl, cropX, cropY, cropWidth, cropHeight);
      }
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        cleanupSnipping();
      }
    };

    function cleanupSnipping() {
      if (snipOverlay) {
        snipOverlay.remove();
        snipOverlay = null;
      }
      document.removeEventListener('keydown', onKeyDown);
    }

    snipOverlay.addEventListener('mousedown', onMouseDown);
    snipOverlay.addEventListener('mousemove', onMouseMove);
    snipOverlay.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }

  function cropAndProcessScreenshot(screenshotUrl, x, y, width, height) {
    const dpr = window.devicePixelRatio || 1;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d');

      // Crop the selected region
      ctx.drawImage(
        img,
        x * dpr,
        y * dpr,
        width * dpr,
        height * dpr,
        0,
        0,
        width * dpr,
        height * dpr
      );

      const croppedDataUrl = canvas.toDataURL('image/png');
      const targetRect = {
        left: x,
        top: y,
        bottom: y + height,
        width: width,
        height: height
      };

      // Show inline tooltip with loading modal
      showInlineTooltip('Đang quét chữ...', '', targetRect, true);
      const primaryEl = document.getElementById('sp-tip-vn-primary');
      if (primaryEl) primaryEl.innerHTML = '<div class="sp-loading-spinner"></div> Đang nhận diện chữ & phát âm qua OCR...';

      chrome.runtime.sendMessage({ action: "perform_ocr", dataUrl: croppedDataUrl }, (res) => {
        if (res && res.success && res.text) {
          showInlineTooltip(res.text, '', targetRect, true);
        } else {
          const err = (res && res.error) || 'Không tìm thấy chữ hoặc câu nào trong vùng vừa chọn.';
          if (primaryEl) {
            primaryEl.innerHTML = `<span style="color:#dc2626;">⚠️ ${err}</span>`;
          }
        }
      });
    };
    img.src = screenshotUrl;
  }

  /* -------------------------------------------------------------
     13. In-Page Keyboard Shortcuts (Alt+Q, Alt+S, Alt+W directly)
  ------------------------------------------------------------- */
  document.addEventListener('keydown', (e) => {
    // Alt + Q directly in page
    if (e.altKey && (e.key === 'q' || e.key === 'Q' || e.code === 'KeyQ')) {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: "request_screen_snip_direct" });
    }
    // Alt + S directly in page
    else if (e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
      const selData = getActiveSelectionData();
      const textToRead = selData.text || window.getSelection().toString().trim();
      if (textToRead) {
        e.preventDefault();
        playPronunciation(textToRead, 1.0);
      }
    }
    // Alt + W directly in page
    else if (e.altKey && (e.key === 'w' || e.key === 'W' || e.code === 'KeyW')) {
      e.preventDefault();
      if (activeSidePanel && activeSidePanel.classList.contains('visible')) {
        closeSidePanel();
      } else {
        const selData = getActiveSelectionData();
        const selText = selData.text || window.getSelection().toString().trim();
        openSidePanel(selText || 'Hello', '');
      }
    }
  }, true);

  /* -------------------------------------------------------------
     14. Background Listeners
  ------------------------------------------------------------- */
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === "open_modal" && req.text) {
      openSidePanel(req.text, '');
    } else if (req.action === "ocr_image_url" && req.imageUrl) {
      const img = Array.from(document.querySelectorAll('img')).find(i => i.src === req.imageUrl);
      triggerImageOCR(img, req.imageUrl);
    } else if (req.action === "start_snip_capture" && req.screenshotUrl) {
      initScreenSnipping(req.screenshotUrl);
    } else if (req.action === "shortcut_read_selection") {
      const selData = getActiveSelectionData();
      const textToRead = selData.text || window.getSelection().toString().trim();
      if (textToRead) {
        playPronunciation(textToRead, 1.0);
      }
    } else if (req.action === "shortcut_toggle_panel") {
      if (activeSidePanel && activeSidePanel.classList.contains('visible')) {
        closeSidePanel();
      } else {
        const selData = getActiveSelectionData();
        const selText = selData.text || window.getSelection().toString().trim();
        openSidePanel(selText || 'Hello', '');
      }
    }
  });

  initSelectionListener();
})();
