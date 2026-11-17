// SpeakWise - In-Page Direct UI Interactive Coach
(() => {
  let activeTooltip = null;
  let activeSidePanel = null;
  let recognition = null;
  let currentTargetWord = '';
  let currentAudioUrl = '';
  let sidePanelPinned = false;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  /* -------------------------------------------------------------
     1. Inject Floating Quick Selection Pill & In-Page Tooltip
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

      if (text && text.length > 1 && text.length < 50 && !text.includes('\n')) {
        try {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            selectionPill.style.top = `${window.scrollY + rect.top - 38}px`;
            selectionPill.style.left = `${window.scrollX + rect.left + (rect.width / 2) - 45}px`;
            selectionPill.style.display = 'inline-flex';
            return;
          }
        } catch (err) {}
      }
      if (selectionPill) selectionPill.style.display = 'none';
    });

    // Dismiss inline tooltip on outside click
    document.addEventListener('mousedown', (e) => {
      if (activeTooltip && !activeTooltip.contains(e.target) && e.target !== selectionPill) {
        removeInlineTooltip();
      }
    });
  }

  /* -------------------------------------------------------------
     2. Inline Floating Tooltip (Gắn trực tiếp ngay cạnh chữ đã chọn)
  ------------------------------------------------------------- */
  function showInlineTooltip(rawWord, targetRect) {
    removeInlineTooltip();
    const cleanWord = rawWord.replace(/[^a-zA-Z\s'-]/g, '').trim().toLowerCase();
    currentTargetWord = cleanWord;

    activeTooltip = document.createElement('div');
    activeTooltip.id = 'speakwise-inline-tooltip';
    
    // Positioning: Float above or below the selected word
    const topPos = window.scrollY + targetRect.bottom + 10;
    const leftPos = Math.max(10, Math.min(window.innerWidth - 360, window.scrollX + targetRect.left - 20));

    activeTooltip.style.top = `${topPos}px`;
    activeTooltip.style.left = `${leftPos}px`;

    activeTooltip.innerHTML = `
      <div class="sp-card">
        <div class="sp-card-header">
          <div class="sp-word-group">
            <span class="sp-target-word">${cleanWord}</span>
            <span class="sp-ipa" id="sp-tip-ipa">...</span>
          </div>
          <div class="sp-header-actions">
            <button class="sp-btn-icon" id="sp-tip-expand-btn" title="Mở Panel chi tiết">⤢</button>
            <button class="sp-btn-icon" id="sp-tip-close-btn" title="Đóng">&times;</button>
          </div>
        </div>

        <div class="sp-audio-actions">
          <button class="sp-pill-btn" id="sp-tip-audio-norm">🔊 Chuẩn</button>
          <button class="sp-pill-btn slow" id="sp-tip-audio-slow">🐢 Chậm 0.6x</button>
          <button class="sp-pill-btn star" id="sp-tip-save-btn">⭐ Lưu</button>
        </div>

        <!-- Practice & Score directly on UI -->
        <div class="sp-voice-test-box">
          <div class="sp-voice-row">
            <button class="sp-mic-pill" id="sp-tip-mic-btn">
              <span class="sp-mic-icon">🎤</span>
              <span class="sp-mic-label">Bấm để nói</span>
            </button>
            <div class="sp-score-container" id="sp-tip-score-box" style="display:none;">
              <span class="sp-score-badge" id="sp-tip-score-badge">0%</span>
              <span class="sp-score-msg" id="sp-tip-score-msg"></span>
            </div>
          </div>
          <div class="sp-heard-text" id="sp-tip-heard-text"></div>
        </div>

        <!-- In-context definition -->
        <div class="sp-definition-box" id="sp-tip-def-box">
          <div class="sp-loading-spinner"></div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(activeTooltip);

    // Bind Tooltip Actions
    document.getElementById('sp-tip-close-btn').addEventListener('click', removeInlineTooltip);
    document.getElementById('sp-tip-expand-btn').addEventListener('click', () => {
      openSidePanel(currentTargetWord);
      removeInlineTooltip();
    });
    document.getElementById('sp-tip-audio-norm').addEventListener('click', () => playPronunciation(currentTargetWord, 1.0));
    document.getElementById('sp-tip-audio-slow').addEventListener('click', () => playPronunciation(currentTargetWord, 0.6));
    document.getElementById('sp-tip-mic-btn').addEventListener('click', () => toggleSpeechTest('tip'));
    document.getElementById('sp-tip-save-btn').addEventListener('click', (e) => saveWordToNotebook(e.target));

    // Fetch details
    fetchWordData(cleanWord, 'tip');
  }

  function removeInlineTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
      stopRecognition();
    }
  }

  /* -------------------------------------------------------------
     3. Interactive Side Panel (Docked right sidebar directly inside web page)
  ------------------------------------------------------------- */
  function openSidePanel(word) {
    if (!activeSidePanel) {
      activeSidePanel = document.createElement('div');
      activeSidePanel.id = 'speakwise-sidepanel';
      activeSidePanel.innerHTML = `
        <div class="sp-panel-header">
          <div class="sp-panel-title">
            <span class="sp-panel-logo">🎙️</span>
            <strong>SpeakWise Coach</strong>
          </div>
          <div class="sp-panel-controls">
            <button class="sp-panel-btn" id="sp-panel-pin-btn" title="Ghim thanh bên">📌</button>
            <button class="sp-panel-btn" id="sp-panel-close-btn" title="Đóng">&times;</button>
          </div>
        </div>

        <div class="sp-panel-search">
          <input type="text" id="sp-panel-input" placeholder="Tra từ hoặc cụm từ mới..." />
          <button id="sp-panel-search-btn">Tìm</button>
        </div>

        <div class="sp-panel-body" id="sp-panel-body">
          <div class="sp-panel-word-head">
            <h2 id="sp-panel-word">...</h2>
            <div class="sp-panel-ipa-row">
              <span class="sp-ipa" id="sp-panel-ipa">/.../</span>
              <button class="sp-pill-btn" id="sp-panel-audio-norm">🔊 Chuẩn</button>
              <button class="sp-pill-btn slow" id="sp-panel-audio-slow">🐢 Chậm</button>
              <button class="sp-pill-btn star" id="sp-panel-save-btn">⭐ Lưu từ</button>
            </div>
          </div>

          <!-- Realtime speaking trainer -->
          <div class="sp-panel-trainer">
            <div class="sp-trainer-header">
              <strong>🗣️ Luyện phát âm & Chấm điểm tức thì</strong>
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

          <!-- Meaning, Context & Sentences -->
          <div class="sp-panel-section">
            <h4 class="sp-section-title">Định nghĩa & Ví dụ thực tế</h4>
            <div id="sp-panel-definitions" class="sp-definitions-list"></div>
          </div>

          <!-- Synonyms -->
          <div class="sp-panel-section" id="sp-panel-syn-section" style="display:none;">
            <h4 class="sp-section-title">Từ đồng nghĩa liên quan</h4>
            <div id="sp-panel-synonyms" class="sp-synonyms-cloud"></div>
          </div>
        </div>
      `;

      document.documentElement.appendChild(activeSidePanel);

      // Event listeners for Panel
      document.getElementById('sp-panel-close-btn').addEventListener('click', closeSidePanel);
      document.getElementById('sp-panel-pin-btn').addEventListener('click', togglePinPanel);
      document.getElementById('sp-panel-search-btn').addEventListener('click', () => {
        const val = document.getElementById('sp-panel-input').value.trim();
        if (val) loadPanelWord(val);
      });
      document.getElementById('sp-panel-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = e.target.value.trim();
          if (val) loadPanelWord(val);
        }
      });
      document.getElementById('sp-panel-audio-norm').addEventListener('click', () => playPronunciation(currentTargetWord, 1.0));
      document.getElementById('sp-panel-audio-slow').addEventListener('click', () => playPronunciation(currentTargetWord, 0.6));
      document.getElementById('sp-panel-mic-btn').addEventListener('click', () => toggleSpeechTest('panel'));
      document.getElementById('sp-panel-save-btn').addEventListener('click', (e) => saveWordToNotebook(e.target));
    }

    activeSidePanel.classList.add('visible');
    if (word) {
      document.getElementById('sp-panel-input').value = word;
      loadPanelWord(word);
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

  function loadPanelWord(word) {
    const cleanWord = word.replace(/[^a-zA-Z\s'-]/g, '').trim().toLowerCase();
    currentTargetWord = cleanWord;
    fetchWordData(cleanWord, 'panel');
  }

  /* -------------------------------------------------------------
     4. Data Fetching (Dictionary & Phonetics API)
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
        document.getElementById('sp-panel-word').textContent = currentFetchedEntry.word;
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
              loadPanelWord(s);
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
        if (defBox) defBox.innerHTML = `<div class="sp-def-error">Không tìm thấy phiên âm của từ này.</div>`;
      } else if (mode === 'panel') {
        document.getElementById('sp-panel-definitions').innerHTML = `<div class="sp-def-error">Không tìm thấy thông tin từ.</div>`;
      }
    }
  }

  /* -------------------------------------------------------------
     5. Sound & Text-to-Speech Engine
  ------------------------------------------------------------- */
  function playPronunciation(word, rate = 1.0) {
    if (currentAudioUrl) {
      const audio = new Audio(currentAudioUrl);
      audio.playbackRate = rate;
      audio.play().catch(() => playBrowserTTS(word, rate));
    } else {
      playBrowserTTS(word, rate);
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
     6. Voice Recognition & Interactive Accuracy Scorer
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
    if (label) label.textContent = 'Đang lắng nghe...';

    recognition.onresult = (e) => {
      const spoken = e.results[0][0].transcript.toLowerCase().trim();
      gradeSpeech(currentTargetWord, spoken, uiMode);
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
    heardBox.innerHTML = `Bạn phát âm: "<strong>${spoken}</strong>"`;

    const scorePct = Math.round(calculateSimilarity(target.toLowerCase(), spoken.toLowerCase()) * 100);
    scoreBadge.textContent = `${scorePct}%`;
    scoreBadge.className = 'sp-score-badge';

    if (scorePct >= 90) {
      scoreBadge.classList.add('perfect');
      scoreMsg.textContent = '🌟 Rất xuất sắc! Chuẩn người bản xứ.';
    } else if (scorePct >= 65) {
      scoreBadge.classList.add('good');
      scoreMsg.textContent = '👍 Khá chuẩn! Nghe rất tự nhiên.';
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
     7. Save Word Bookmark
  ------------------------------------------------------------- */
  function saveWordToNotebook(btnEl) {
    if (!currentFetchedEntry) return;
    const payload = {
      word: currentFetchedEntry.word,
      phonetic: currentFetchedEntry.phonetic || '',
      audioUrl: currentAudioUrl,
      meaning: currentFetchedEntry.meanings && currentFetchedEntry.meanings[0] ? currentFetchedEntry.meanings[0].definitions[0].definition : ''
    };

    chrome.runtime.sendMessage({ action: "save_word", data: payload }, () => {
      btnEl.textContent = '✅ Đã lưu';
      setTimeout(() => {
        btnEl.textContent = '⭐ Lưu';
      }, 1800);
    });
  }

  /* -------------------------------------------------------------
     8. Handle Messages from Background (Context Menu, etc.)
  ------------------------------------------------------------- */
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === "open_modal" && req.text) {
      openSidePanel(req.text);
    }
  });

  // Init
  initSelectionListener();
})();
