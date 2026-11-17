// SpeakWise - In-Page Direct UI Interactive Coach (Word & Full Sentence Support)
(() => {
  let activeTooltip = null;
  let activeSidePanel = null;
  let recognition = null;
  let currentTargetText = '';
  let currentAudioUrl = '';
  let sidePanelPinned = false;
  let isSentenceMode = false;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  /* -------------------------------------------------------------
     1. Inject Floating Quick Selection Pill
  ------------------------------------------------------------- */
  let selectionPill = null;

  function initSelectionListener() {
    selectionPill = document.createElement('div');
    selectionPill.id = 'speakwise-selection-pill';
    selectionPill.innerHTML = `
      <span class="sp-pill-icon">🎙️</span>
      <span class="sp-pill-text">SpeakWise</span>
    `;
    selectionPill.style.display = 'none';
    document.documentElement.appendChild(selectionPill);

    selectionPill.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection();
      const text = sel.toString().trim();
      if (text) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        selectionPill.style.display = 'none';
        showInlineTooltip(text, rect);
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (activeTooltip && activeTooltip.contains(e.target)) return;
      if (activeSidePanel && activeSidePanel.contains(e.target)) return;
      if (selectionPill && selectionPill.contains(e.target)) return;

      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';

      // Allow words and long sentences (up to 500 characters)
      if (text && text.length > 1 && text.length <= 500) {
        try {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            selectionPill.style.top = `${window.scrollY + rect.top - 40}px`;
            selectionPill.style.left = `${window.scrollX + rect.left + (rect.width / 2) - 45}px`;
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
     2. Translation Helper API (Free Google Translate Endpoint)
  ------------------------------------------------------------- */
  async function translateText(text, targetLang = 'vi') {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Translation failed');
      const data = await res.json();
      
      let translated = '';
      if (data && data[0]) {
        data[0].forEach(item => {
          if (item && item[0]) translated += item[0];
        });
      }
      return translated || 'Không dịch được đoạn văn này.';
    } catch (err) {
      return 'Lỗi dịch thuật mạng hoặc không phản hồi.';
    }
  }

  /* -------------------------------------------------------------
     3. Inline Floating Tooltip (Sentence & Word)
  ------------------------------------------------------------- */
  function showInlineTooltip(rawText, targetRect) {
    removeInlineTooltip();
    const cleanText = rawText.trim();
    currentTargetText = cleanText;

    // Detect if this is a sentence or single word
    const wordsCount = cleanText.split(/\s+/).length;
    isSentenceMode = wordsCount > 2 || cleanText.includes('.') || cleanText.includes('?') || cleanText.includes('!');

    activeTooltip = document.createElement('div');
    activeTooltip.id = 'speakwise-inline-tooltip';
    if (isSentenceMode) {
      activeTooltip.classList.add('sentence-mode');
    }

    const topPos = window.scrollY + targetRect.bottom + 10;
    const leftPos = Math.max(10, Math.min(window.innerWidth - (isSentenceMode ? 420 : 340), window.scrollX + targetRect.left - 20));

    activeTooltip.style.top = `${topPos}px`;
    activeTooltip.style.left = `${leftPos}px`;

    activeTooltip.innerHTML = `
      <div class="sp-card">
        <div class="sp-card-header">
          <div class="sp-word-group">
            <span class="sp-badge-type">${isSentenceMode ? '📄 Câu văn' : '📖 Từ vựng'}</span>
            ${!isSentenceMode ? `<span class="sp-target-word">${cleanText}</span><span class="sp-ipa" id="sp-tip-ipa">...</span>` : ''}
          </div>
          <div class="sp-header-actions">
            <button class="sp-btn-icon" id="sp-tip-expand-btn" title="Mở Panel chi tiết">⤢</button>
            <button class="sp-btn-icon" id="sp-tip-close-btn" title="Đóng">&times;</button>
          </div>
        </div>

        ${isSentenceMode ? `<div class="sp-sentence-original">“${cleanText}”</div>` : ''}

        <!-- Translation Block -->
        <div class="sp-translation-box" id="sp-tip-translation-box">
          <div class="sp-trans-label">🇻🇳 Dịch nghĩa:</div>
          <div class="sp-trans-result" id="sp-tip-trans-text"><div class="sp-loading-spinner"></div></div>
        </div>

        <div class="sp-audio-actions">
          <button class="sp-pill-btn" id="sp-tip-audio-norm">🔊 Nghe đọc</button>
          <button class="sp-pill-btn slow" id="sp-tip-audio-slow">🐢 Chậm 0.6x</button>
          <button class="sp-pill-btn star" id="sp-tip-save-btn">⭐ Lưu</button>
        </div>

        <!-- Speaking Practice for the sentence/word -->
        <div class="sp-voice-test-box">
          <div class="sp-voice-row">
            <button class="sp-mic-pill" id="sp-tip-mic-btn">
              <span class="sp-mic-icon">🎤</span>
              <span class="sp-mic-label">${isSentenceMode ? 'Đọc luyện câu này' : 'Bấm để nói'}</span>
            </button>
            <div class="sp-score-container" id="sp-tip-score-box" style="display:none;">
              <span class="sp-score-badge" id="sp-tip-score-badge">0%</span>
              <span class="sp-score-msg" id="sp-tip-score-msg"></span>
            </div>
          </div>
          <div class="sp-heard-text" id="sp-tip-heard-text"></div>
        </div>

        <!-- Detailed dictionary definition if single word -->
        ${!isSentenceMode ? `
        <div class="sp-definition-box" id="sp-tip-def-box">
          <div class="sp-loading-spinner"></div>
        </div>` : ''}
      </div>
    `;

    document.documentElement.appendChild(activeTooltip);

    // Bind Tooltip Actions
    document.getElementById('sp-tip-close-btn').addEventListener('click', removeInlineTooltip);
    document.getElementById('sp-tip-expand-btn').addEventListener('click', () => {
      openSidePanel(currentTargetText);
      removeInlineTooltip();
    });
    document.getElementById('sp-tip-audio-norm').addEventListener('click', () => playPronunciation(currentTargetText, 1.0));
    document.getElementById('sp-tip-audio-slow').addEventListener('click', () => playPronunciation(currentTargetText, 0.6));
    document.getElementById('sp-tip-mic-btn').addEventListener('click', () => toggleSpeechTest('tip'));
    document.getElementById('sp-tip-save-btn').addEventListener('click', (e) => saveWordToNotebook(e.target));

    // Handle translation
    translateText(cleanText, 'vi').then(trans => {
      const transEl = document.getElementById('sp-tip-trans-text');
      if (transEl) transEl.textContent = trans;
    });

    // If single word, fetch phonetic & definitions
    if (!isSentenceMode) {
      fetchWordData(cleanText, 'tip');
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
     4. Interactive Side Panel (Word & Sentence Translation)
  ------------------------------------------------------------- */
  function openSidePanel(text) {
    if (!activeSidePanel) {
      activeSidePanel = document.createElement('div');
      activeSidePanel.id = 'speakwise-sidepanel';
      activeSidePanel.innerHTML = `
        <div class="sp-panel-header">
          <div class="sp-panel-title">
            <span class="sp-panel-logo">🎙️</span>
            <strong>SpeakWise Translator & Coach</strong>
          </div>
          <div class="sp-panel-controls">
            <button class="sp-panel-btn" id="sp-panel-pin-btn" title="Ghim thanh bên">📌</button>
            <button class="sp-panel-btn" id="sp-panel-close-btn" title="Đóng">&times;</button>
          </div>
        </div>

        <div class="sp-panel-search">
          <textarea id="sp-panel-input" rows="2" placeholder="Nhập từ, cụm từ hoặc cả câu văn tiếng Anh..."></textarea>
          <button id="sp-panel-search-btn">Dịch & Luyện</button>
        </div>

        <div class="sp-panel-body" id="sp-panel-body">
          <div class="sp-panel-word-head">
            <div class="sp-type-indicator" id="sp-panel-type-tag">Từ / Câu văn</div>
            <h2 id="sp-panel-word">...</h2>
            <div class="sp-panel-ipa-row">
              <span class="sp-ipa" id="sp-panel-ipa" style="display:none;">/.../</span>
              <button class="sp-pill-btn" id="sp-panel-audio-norm">🔊 Nghe đọc</button>
              <button class="sp-pill-btn slow" id="sp-panel-audio-slow">🐢 Chậm 0.6x</button>
              <button class="sp-pill-btn star" id="sp-panel-save-btn">⭐ Lưu</button>
            </div>
          </div>

          <!-- Sentence Translation Result -->
          <div class="sp-panel-translation-card">
            <div class="sp-card-title">🇻🇳 Bản dịch tiếng Việt</div>
            <div class="sp-card-body-text" id="sp-panel-trans-result">Đang dịch...</div>
          </div>

          <!-- Realtime speaking trainer for sentences -->
          <div class="sp-panel-trainer">
            <div class="sp-trainer-header">
              <strong>🗣️ Luyện phát âm / Đọc câu & Chấm điểm</strong>
            </div>
            <div class="sp-voice-row">
              <button class="sp-mic-pill" id="sp-panel-mic-btn">
                <span class="sp-mic-icon">🎤</span>
                <span class="sp-mic-label">Bắt đầu đọc</span>
              </button>
              <div class="sp-score-container" id="sp-panel-score-box" style="display:none;">
                <span class="sp-score-badge" id="sp-panel-score-badge">0%</span>
                <span class="sp-score-msg" id="sp-panel-score-msg"></span>
              </div>
            </div>
            <div class="sp-heard-text" id="sp-panel-heard-text"></div>
          </div>

          <!-- Word-specific details (Definitions, Examples, Synonyms) -->
          <div id="sp-panel-word-extras" style="display:none;">
            <div class="sp-panel-section">
              <h4 class="sp-section-title">Định nghĩa & Ví dụ thực tế</h4>
              <div id="sp-panel-definitions" class="sp-definitions-list"></div>
            </div>

            <div class="sp-panel-section" id="sp-panel-syn-section" style="display:none;">
              <h4 class="sp-section-title">Từ đồng nghĩa liên quan</h4>
              <div id="sp-panel-synonyms" class="sp-synonyms-cloud"></div>
            </div>
          </div>
        </div>
      `;

      document.documentElement.appendChild(activeSidePanel);

      // Event listeners for Panel
      document.getElementById('sp-panel-close-btn').addEventListener('click', closeSidePanel);
      document.getElementById('sp-panel-pin-btn').addEventListener('click', togglePinPanel);
      document.getElementById('sp-panel-search-btn').addEventListener('click', () => {
        const val = document.getElementById('sp-panel-input').value.trim();
        if (val) loadPanelText(val);
      });
      document.getElementById('sp-panel-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const val = e.target.value.trim();
          if (val) loadPanelText(val);
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
      loadPanelText(text);
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

  function loadPanelText(text) {
    const cleanText = text.trim();
    currentTargetText = cleanText;

    const words = cleanText.split(/\s+/).length;
    const isSentence = words > 2 || cleanText.includes('.') || cleanText.includes('?') || cleanText.includes('!');

    document.getElementById('sp-panel-type-tag').textContent = isSentence ? '📄 Câu văn' : '📖 Từ vựng';
    document.getElementById('sp-panel-word').textContent = cleanText;
    document.getElementById('sp-panel-trans-result').textContent = 'Đang dịch...';

    // Translate sentence/word
    translateText(cleanText, 'vi').then(trans => {
      document.getElementById('sp-panel-trans-result').textContent = trans;
    });

    const extras = document.getElementById('sp-panel-word-extras');
    const ipaEl = document.getElementById('sp-panel-ipa');

    if (!isSentence) {
      ipaEl.style.display = 'inline-block';
      extras.style.display = 'block';
      fetchWordData(cleanText.replace(/[^a-zA-Z\s'-]/g, ''), 'panel');
    } else {
      ipaEl.style.display = 'none';
      extras.style.display = 'none';
      currentAudioUrl = '';
    }
  }

  /* -------------------------------------------------------------
     5. Data Fetching for Single Words
  ------------------------------------------------------------- */
  let currentFetchedEntry = null;

  async function fetchWordData(word, mode) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!res.ok) throw new Error('Không tìm thấy từ');
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
            <div class="sp-pos-label">${m.partOfSpeech}</div>
            <div class="sp-def-text">${d.definition}</div>
            ${d.example ? `<div class="sp-def-example">“${d.example}”</div>` : ''}
          `;
        }
      } else if (mode === 'panel') {
        document.getElementById('sp-panel-ipa').textContent = ipa || `/${currentFetchedEntry.word}/`;

        const defsContainer = document.getElementById('sp-panel-definitions');
        defsContainer.innerHTML = '';
        const allSynonyms = new Set();

        currentFetchedEntry.meanings.slice(0, 3).forEach(m => {
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
              loadPanelText(s);
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
     6. Audio & Text-to-Speech Engine
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
     7. Voice Recognition & Sentence Speaking Scoring
  ------------------------------------------------------------- */
  function toggleSpeechTest(uiMode) {
    const btn = uiMode === 'tip' ? document.getElementById('sp-tip-mic-btn') : document.getElementById('sp-panel-mic-btn');
    if (!btn) return;

    if (recognition && btn.classList.contains('recording')) {
      stopRecognition();
      return;
    }

    if (!SpeechRecognition) {
      alert('Trình duyệt chưa bật hỗ trợ Speech Recognition. Hãy dùng Google Chrome hoặc Microsoft Edge.');
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    btn.classList.add('recording');
    const label = btn.querySelector('.sp-mic-label');
    if (label) label.textContent = 'Đang lắng nghe câu bạn đọc...';

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

    // Clean punctuation
    const cleanTarget = target.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "");
    const cleanSpoken = spoken.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "");

    const scorePct = Math.round(calculateSimilarity(cleanTarget, cleanSpoken) * 100);
    scoreBadge.textContent = `${scorePct}%`;
    scoreBadge.className = 'sp-score-badge';

    if (scorePct >= 85) {
      scoreBadge.classList.add('perfect');
      scoreMsg.textContent = '🌟 Rất lưu loát & chính xác!';
    } else if (scorePct >= 60) {
      scoreBadge.classList.add('good');
      scoreMsg.textContent = '👍 Tốt! Rõ ràng và dễ hiểu.';
    } else {
      scoreBadge.classList.add('retry');
      scoreMsg.textContent = '💡 Hãy bấm nút 🐢 Chậm để nghe nhịp câu.';
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
     8. Save Sentence or Word to Vocabulary Notebook
  ------------------------------------------------------------- */
  function saveWordToNotebook(btnEl) {
    const meaning = document.getElementById('sp-tip-trans-text')?.textContent || 
                    document.getElementById('sp-panel-trans-result')?.textContent || '';
    
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
        btnEl.textContent = '⭐ Lưu';
      }, 1800);
    });
  }

  /* -------------------------------------------------------------
     9. Handle Messages from Background
  ------------------------------------------------------------- */
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === "open_modal" && req.text) {
      openSidePanel(req.text);
    }
  });

  initSelectionListener();
})();
