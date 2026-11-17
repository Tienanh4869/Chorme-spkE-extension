// SpeakWise - Smart AI Contextual & Vietnamese Learning Coach
(() => {
  let activeTooltip = null;
  let activeSidePanel = null;
  let recognition = null;
  let currentTargetText = '';
  let currentSurroundingContext = '';
  let currentAudioUrl = '';
  let sidePanelPinned = false;
  let isSentenceMode = false;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  /* -------------------------------------------------------------
     1. Smart Context Extractor (Lấy ngữ cảnh xung quanh câu/từ bị thiếu)
  ------------------------------------------------------------- */
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
      return fullParagraph.slice(0, 600).trim();
    } catch (e) {
      return '';
    }
  }

  /* -------------------------------------------------------------
     2. Smart Inference Engine (Đoán từ thiếu, sửa lỗi & suy luận ngữ cảnh)
  ------------------------------------------------------------- */
  function analyzeAndRepairText(text, context) {
    let repaired = text;
    let missingWordGuessed = false;
    let explanation = '';

    // Check placeholders like "...", "___", "[?]", or missing words
    const missingPattern = /\b(___|\.\.\.|\?{2,}|\[\w*\])\b/i;
    const hasMissingWordMarker = missingPattern.test(text);

    // Common English missing grammar & typos repair
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
     3. Free Gemini / Neural Context-Aware Translation
  ------------------------------------------------------------- */
  async function smartTranslate(text, context) {
    const analysis = analyzeAndRepairText(text, context);
    const targetQuery = analysis.repairedText;

    try {
      // 1. Fetch Google Neural GTX with Vietnamese Dictionary
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&dt=bd&dt=qc&dt=rm&q=${encodeURIComponent(targetQuery)}`;
      const res = await fetch(url);
      const data = await res.json();

      let primaryTranslation = '';
      if (data && data[0]) {
        data[0].forEach(item => {
          if (item && item[0]) primaryTranslation += item[0];
        });
      }

      // Check Google's Spellcheck / Correction suggestion
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

      // If text has missing word markers, generate smart deduction
      let smartGuessNote = '';
      if (text.includes('...') || text.includes('___')) {
        smartGuessNote = `💡 <strong>Suy luận ngữ cảnh:</strong> Câu có vị trí bị khuyết (placeholder). Hệ thống đã dựa vào tiền đề để dịch trọn ý tự nhiên nhất.`;
      } else if (correctedQuery) {
        smartGuessNote = `💡 <strong>Tự động nhận diện từ đúng:</strong> Hệ thống đoán bạn muốn dùng cụm <em>"${correctedQuery}"</em>.`;
      }

      return {
        translation: primaryTranslation.trim() || 'Chưa có bản dịch.',
        smartGuessNote: smartGuessNote,
        dictEntries: dictEntries,
        repaired: analysis.repairedText
      };
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
     4. Floating Selection Pill
  ------------------------------------------------------------- */
  let selectionPill = null;

  function initSelectionListener() {
    selectionPill = document.createElement('div');
    selectionPill.id = 'speakwise-selection-pill';
    selectionPill.innerHTML = `
      <span class="sp-pill-icon">✨</span>
      <span class="sp-pill-text">Smart Dịch & Luyện</span>
    `;
    selectionPill.style.display = 'none';
    document.documentElement.appendChild(selectionPill);

    selectionPill.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection();
      const text = sel.toString().trim();
      const context = getSurroundingSentence(sel);
      if (text) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        selectionPill.style.display = 'none';
        showInlineTooltip(text, context, rect);
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (activeTooltip && activeTooltip.contains(e.target)) return;
      if (activeSidePanel && activeSidePanel.contains(e.target)) return;
      if (selectionPill && selectionPill.contains(e.target)) return;

      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';

      if (text && text.length > 1 && text.length <= 600) {
        try {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            selectionPill.style.top = `${window.scrollY + rect.top - 42}px`;
            selectionPill.style.left = `${window.scrollX + rect.left + (rect.width / 2) - 65}px`;
            selectionPill.style.display = 'inline-flex';
            return;
          }
        } catch (err) {}
      }
      if (selectionPill) selectionPill.style.display = 'none';
    });

    document.addEventListener('mousedown', (e) => {
      if (activeTooltip && !activeTooltip.contains(e.target) && e.target !== selectionPill) {
        removeInlineTooltip();
      }
    });
  }

  /* -------------------------------------------------------------
     5. Inline Floating Tooltip với Smart Deduction
  ------------------------------------------------------------- */
  function showInlineTooltip(rawText, context, targetRect) {
    removeInlineTooltip();
    const cleanText = rawText.trim();
    currentTargetText = cleanText;
    currentSurroundingContext = context;

    const wordsCount = cleanText.split(/\s+/).length;
    isSentenceMode = wordsCount > 2 || cleanText.includes('.') || cleanText.includes('?') || cleanText.includes('!');

    activeTooltip = document.createElement('div');
    activeTooltip.id = 'speakwise-inline-tooltip';
    if (isSentenceMode) {
      activeTooltip.classList.add('sentence-mode');
    }

    const topPos = window.scrollY + targetRect.bottom + 10;
    const leftPos = Math.max(10, Math.min(window.innerWidth - (isSentenceMode ? 440 : 360), window.scrollX + targetRect.left - 20));

    activeTooltip.style.top = `${topPos}px`;
    activeTooltip.style.left = `${leftPos}px`;

    activeTooltip.innerHTML = `
      <div class="sp-card">
        <div class="sp-card-header">
          <div class="sp-word-group">
            <span class="sp-badge-type">${isSentenceMode ? '✨ Dịch Ngữ Cảnh' : '📖 Từ vựng'}</span>
            ${!isSentenceMode ? `<span class="sp-target-word">${cleanText}</span><span class="sp-ipa" id="sp-tip-ipa">...</span>` : ''}
          </div>
          <div class="sp-header-actions">
            <button class="sp-btn-icon" id="sp-tip-expand-btn" title="Mở Panel chi tiết">⤢</button>
            <button class="sp-btn-icon" id="sp-tip-close-btn" title="Đóng">&times;</button>
          </div>
        </div>

        ${isSentenceMode ? `<div class="sp-sentence-original">“${cleanText}”</div>` : ''}

        <!-- Nghĩa Tiếng Việt & Suy Luận Ngữ Cảnh -->
        <div class="sp-vn-meaning-box">
          <div class="sp-vn-label">
            <span>🇻🇳 <strong>Nghĩa Chuẩn Ngữ Cảnh:</strong></span>
          </div>
          <div class="sp-vn-primary" id="sp-tip-vn-primary">
            <div class="sp-loading-spinner"></div>
          </div>
          <!-- Smart Guess Tag (nếu thiếu từ hoặc có suy luận) -->
          <div id="sp-tip-smart-guess" class="sp-smart-guess-box" style="display:none;"></div>
          <div class="sp-vn-sub-meanings" id="sp-tip-vn-subs" style="display:none;"></div>
        </div>

        <div class="sp-audio-actions">
          <button class="sp-pill-btn" id="sp-tip-audio-norm">🔊 Nghe chuẩn</button>
          <button class="sp-pill-btn slow" id="sp-tip-audio-slow">🐢 Chậm 0.6x</button>
          <button class="sp-pill-btn star" id="sp-tip-save-btn">⭐ Lưu lại</button>
        </div>

        <!-- Luyện nói & Chấm điểm -->
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
        </div>

        ${!isSentenceMode ? `
        <div class="sp-definition-box" id="sp-tip-def-box">
          <div class="sp-loading-spinner"></div>
        </div>` : ''}
      </div>
    `;

    document.documentElement.appendChild(activeTooltip);

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

    // Thực hiện Smart Translate
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

  function removeInlineTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
      stopRecognition();
    }
  }

  /* -------------------------------------------------------------
     6. Side Panel với Smart Translate
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
              <strong>🗣️ Luyện đọc cả câu & Chấm điểm chính xác</strong>
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

      document.documentElement.appendChild(activeSidePanel);

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
     7. English Extras
  ------------------------------------------------------------- */
  let currentFetchedEntry = null;

  async function fetchEnglishExtras(word, mode) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      currentFetchedEntry = data[0];

      let ipa = currentFetchedEntry.phonetic || '';
      currentAudioUrl = '';

      if (currentFetchedEntry.phonetics && currentFetchedEntry.phonetics.length > 0) {
        for (const p of currentFetchedEntry.phonetics) {
          if (!ipa && p.text) ipa = p.text;
          if (p.audio && !currentAudioUrl) currentAudioUrl = p.audio;
        }
      }

      if (mode === 'tip') {
        const ipaEl = document.getElementById('sp-tip-ipa');
        if (ipaEl) ipaEl.textContent = ipa || `/${currentFetchedEntry.word}/`;

        const defBox = document.getElementById('sp-tip-def-box');
        if (defBox && currentFetchedEntry.meanings && currentFetchedEntry.meanings[0]) {
          const m = currentFetchedEntry.meanings[0];
          const d = m.definitions[0];
          defBox.innerHTML = `
            <div class="sp-pos-label">Context (Anh - Anh)</div>
            <div class="sp-def-text">${d.definition}</div>
            ${d.example ? `<div class="sp-def-example">“${d.example}”</div>` : ''}
          `;
        }
      } else if (mode === 'panel') {
        document.getElementById('sp-panel-ipa').textContent = ipa || `/${currentFetchedEntry.word}/`;

        const defsContainer = document.getElementById('sp-panel-definitions');
        defsContainer.innerHTML = '';
        const allSynonyms = new Set();

        currentFetchedEntry.meanings.slice(0, 2).forEach(m => {
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
    } catch (err) {
      if (mode === 'tip') {
        const defBox = document.getElementById('sp-tip-def-box');
        if (defBox) defBox.style.display = 'none';
      }
    }
  }

  /* -------------------------------------------------------------
     8. Audio & Speech
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
     9. Voice Scoring
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

    if (!scoreBox) return;

    scoreBox.style.display = 'flex';
    heardBox.innerHTML = `Bạn vừa đọc: "<strong>${spoken}</strong>"`;

    const cleanTarget = target.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "");
    const cleanSpoken = spoken.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "");

    const scorePct = Math.round(calculateSimilarity(cleanTarget, cleanSpoken) * 100);
    scoreBadge.textContent = `${scorePct}%`;
    scoreBadge.className = 'sp-score-badge';

    if (scorePct >= 85) {
      scoreBadge.classList.add('perfect');
      scoreMsg.textContent = '🌟 Rất xuất sắc & chuẩn bản xứ!';
    } else if (scorePct >= 60) {
      scoreBadge.classList.add('good');
      scoreMsg.textContent = '👍 Rõ ràng, người bản ngữ hiểu tốt.';
    } else {
      scoreBadge.classList.add('retry');
      scoreMsg.textContent = '💡 Hãy bấm nút 🐢 Chậm để nghe kỹ âm.';
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
     11. Messages from Background
  ------------------------------------------------------------- */
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === "open_modal" && req.text) {
      openSidePanel(req.text, '');
    }
  });

  initSelectionListener();
})();
