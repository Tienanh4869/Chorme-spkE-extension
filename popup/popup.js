// Popup Logic (High-Speed & CSV Export)
let currentText = '';
let currentAudio = null;
let recognition = null;
let isSentence = false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

document.addEventListener('DOMContentLoaded', () => {
  // Tabs switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');

      if (btn.dataset.tab === 'saved-tab') {
        renderSavedWords();
      }
    });
  });

  // Search / Translate
  document.getElementById('quick-search-btn').addEventListener('click', () => {
    const text = document.getElementById('quick-input').value.trim();
    if (text) processInput(text);
  });

  document.getElementById('quick-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = e.target.value.trim();
      if (text) processInput(text);
    }
  });

  // Audio Playback
  document.getElementById('play-native-btn').addEventListener('click', () => playAudio(1.0));
  document.getElementById('play-slow-btn').addEventListener('click', () => playAudio(0.6));

  // Speech Practice
  document.getElementById('popup-mic-btn').addEventListener('click', toggleSpeech);

  // Save / Bookmark
  document.getElementById('quick-save-btn').addEventListener('click', toggleSaveWord);

  // Export CSV
  document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);

  // OCR Upload from file input
  const fileInput = document.getElementById('ocr-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const inputArea = document.getElementById('quick-input');
      inputArea.value = 'Đang nhận diện ký tự & câu văn trong ảnh...';

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        chrome.runtime.sendMessage({ action: "perform_ocr", dataUrl: dataUrl }, (res) => {
          if (res && res.success && res.text) {
            inputArea.value = res.text;
            processInput(res.text);
          } else {
            const err = (res && res.error) || 'Không thể nhận diện chữ từ ảnh này.';
            alert('Lỗi OCR: ' + err);
            inputArea.value = '';
          }
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // Clear all
  document.getElementById('clear-all-btn').addEventListener('click', () => {
    if (confirm('Xóa toàn bộ từ và câu đã lưu trong sổ?')) {
      chrome.storage.local.set({ savedWords: [] }, () => {
        renderSavedWords();
        updateWordCount();
      });
    }
  });

  updateWordCount();
  processInput('fluency');
});

async function fetchVietnameseMeaning(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&dt=bd&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('API Error');
    const data = await res.json();

    let primary = '';
    if (data && data[0]) {
      data[0].forEach(item => {
        if (item && item[0]) primary += item[0];
      });
    }

    const dictList = [];
    if (data && data[1]) {
      data[1].forEach(posGroup => {
        dictList.push({
          pos: posGroup[0],
          meanings: posGroup[1] || []
        });
      });
    }

    return {
      primary: primary.trim() || 'Chưa rõ nghĩa.',
      dictList: dictList
    };
  } catch (e) {
    return {
      primary: 'Không thể kết nối dịch nghĩa.',
      dictList: []
    };
  }
}

async function processInput(text) {
  currentText = text;
  const resultCard = document.getElementById('quick-result');
  const scoreBox = document.getElementById('score-indicator');
  const transcriptBox = document.getElementById('spoken-transcript');
  const breakdownBox = document.getElementById('popup-word-breakdown');
  const defContainer = document.getElementById('result-definition-container');
  const ipaEl = document.getElementById('result-ipa');
  const typeEl = document.getElementById('result-type');
  const transEl = document.getElementById('result-translation');

  scoreBox.style.display = 'none';
  transcriptBox.textContent = '';
  if (breakdownBox) breakdownBox.style.display = 'none';
  resultCard.style.display = 'flex';

  document.getElementById('result-word').textContent = text;
  transEl.textContent = 'Đang tra cứu nghĩa Tiếng Việt...';

  // Lấy nghĩa tiếng Việt
  fetchVietnameseMeaning(text).then(res => {
    let html = `<div style="font-weight: 700; font-size: 15px; color: #713f12; margin-bottom: 4px;">${res.primary}</div>`;
    if (res.dictList && res.dictList.length > 0) {
      const posMap = { noun: 'Danh từ', verb: 'Động từ', adjective: 'Tính từ', adverb: 'Trạng từ' };
      res.dictList.forEach(d => {
        const viPos = posMap[d.pos] || d.pos;
        html += `<div style="font-size: 12px; margin-top: 3px;"><strong style="color: #9a3412;">[${viPos}]</strong> ${d.meanings.slice(0, 4).join(', ')}</div>`;
      });
    }
    transEl.innerHTML = html;
  });

  const words = text.split(/\s+/).length;
  isSentence = words > 2 || text.includes('.') || text.includes('?') || text.includes('!');

  if (isSentence) {
    typeEl.textContent = '📄 Câu văn';
    ipaEl.style.display = 'none';
    defContainer.style.display = 'none';
    currentAudio = null;
  } else {
    typeEl.textContent = '📖 Từ vựng';
    ipaEl.style.display = 'inline-block';
    defContainer.style.display = 'block';
    lookupDictionaryWord(text.replace(/[^a-zA-Z\s'-]/g, ''));
  }

  checkIfSaved(text);
}

async function lookupDictionaryWord(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    const entry = data[0];

    let ipa = entry.phonetic || '';
    currentAudio = null;
    if (entry.phonetics && entry.phonetics.length > 0) {
      for (const p of entry.phonetics) {
        if (!ipa && p.text) ipa = p.text;
        if (p.audio && !currentAudio) currentAudio = p.audio;
      }
    }
    document.getElementById('result-ipa').textContent = ipa || `/${entry.word}/`;

    if (entry.meanings && entry.meanings[0]) {
      const def = entry.meanings[0].definitions[0];
      document.getElementById('result-definition').textContent = def.definition;
      document.getElementById('result-example').textContent = def.example ? `"${def.example}"` : '';
    }
  } catch (e) {
    document.getElementById('result-definition-container').style.display = 'none';
  }
}

function playAudio(rate = 1.0) {
  if (currentAudio && !isSentence) {
    const audio = new Audio(currentAudio);
    audio.playbackRate = rate;
    audio.play().catch(() => speakTTS(currentText, rate));
  } else {
    speakTTS(currentText, rate);
  }
}

function speakTTS(text, rate = 1.0) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = rate;
    window.speechSynthesis.speak(u);
  }
}

function toggleSpeech() {
  const micBtn = document.getElementById('popup-mic-btn');
  if (recognition && micBtn.classList.contains('recording')) {
    recognition.stop();
    micBtn.classList.remove('recording');
    micBtn.textContent = '🎙️ Bấm để nói';
    return;
  }

  if (!SpeechRecognition) {
    alert('Trình duyệt chưa hỗ trợ Web Speech API.');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  micBtn.classList.add('recording');
  micBtn.textContent = '🔴 Đang nghe...';

  recognition.onresult = (e) => {
    const spoken = e.results[0][0].transcript.toLowerCase().trim();
    evaluateSpeech(spoken);
  };

  recognition.onend = () => {
    micBtn.classList.remove('recording');
    micBtn.textContent = '🎙️ Bấm để nói';
  };

  recognition.onerror = () => {
    micBtn.classList.remove('recording');
    micBtn.textContent = '🎙️ Bấm để nói';
  };

  recognition.start();
}

function evaluateSpeech(spoken) {
  const transcriptBox = document.getElementById('spoken-transcript');
  const scoreBox = document.getElementById('score-indicator');
  const scoreVal = document.getElementById('score-val');
  const scoreMsg = document.getElementById('score-msg');
  const breakdownBox = document.getElementById('popup-word-breakdown');

  scoreBox.style.display = 'flex';
  transcriptBox.innerHTML = `Đã nghe: "<strong>${spoken}</strong>"`;

  const targetWords = currentText.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "").split(/\s+/).filter(Boolean);
  const spokenWords = spoken.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "").split(/\s+/).filter(Boolean);

  let correctCount = 0;
  let breakdownHtml = '';

  targetWords.forEach(tWord => {
    const hasMatch = spokenWords.some(sWord => getSimilarity(tWord, sWord) >= 0.75);
    if (hasMatch) {
      correctCount++;
      breakdownHtml += `<span class="sp-chip correct">✓ ${tWord}</span>`;
    } else {
      breakdownHtml += `<span class="sp-chip missed">✗ ${tWord}</span>`;
    }
  });

  const wordLevelScore = targetWords.length > 0 ? (correctCount / targetWords.length) : 1;
  const stringScore = getSimilarity(targetWords.join(' '), spokenWords.join(' '));
  const finalScorePct = Math.round(((wordLevelScore * 0.7) + (stringScore * 0.3)) * 100);

  scoreVal.textContent = `${finalScorePct}%`;
  scoreVal.className = 'score-pill';

  if (finalScorePct >= 85) {
    scoreVal.classList.add('excellent');
    scoreMsg.textContent = '🌟 Rất lưu loát!';
  } else if (finalScorePct >= 60) {
    scoreVal.classList.add('good');
    scoreMsg.textContent = '👍 Khá chuẩn!';
  } else {
    scoreVal.classList.add('needs-work');
    scoreMsg.textContent = '💡 Thử nghe lại';
  }

  if (breakdownBox) {
    breakdownBox.innerHTML = breakdownHtml;
    breakdownBox.style.display = 'flex';
  }
}

function getSimilarity(s1, s2) {
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

function checkIfSaved(text) {
  const saveBtn = document.getElementById('quick-save-btn');
  chrome.storage.local.get({ savedWords: [] }, (res) => {
    const isSaved = res.savedWords.some(w => w.word.toLowerCase() === text.toLowerCase());
    if (isSaved) {
      saveBtn.classList.add('saved');
    } else {
      saveBtn.classList.remove('saved');
    }
  });
}

function toggleSaveWord() {
  const saveBtn = document.getElementById('quick-save-btn');
  const text = currentText;

  chrome.storage.local.get({ savedWords: [] }, (res) => {
    let list = res.savedWords;
    const idx = list.findIndex(w => w.word.toLowerCase() === text.toLowerCase());
    if (idx >= 0) {
      list.splice(idx, 1);
      saveBtn.classList.remove('saved');
    } else {
      const item = {
        word: text,
        phonetic: document.getElementById('result-ipa').textContent,
        audioUrl: currentAudio,
        meaning: document.getElementById('result-translation').innerText,
        createdAt: Date.now()
      };
      list.unshift(item);
      saveBtn.classList.add('saved');
    }
    chrome.storage.local.set({ savedWords: list }, () => {
      updateWordCount();
    });
  });
}

function updateWordCount() {
  chrome.storage.local.get({ savedWords: [] }, (res) => {
    document.getElementById('stats-badge').textContent = `${res.savedWords.length} mục`;
  });
}

function renderSavedWords() {
  const listContainer = document.getElementById('saved-list');
  const emptyState = document.getElementById('empty-state');
  listContainer.innerHTML = '';

  chrome.storage.local.get({ savedWords: [] }, (res) => {
    const words = res.savedWords;
    if (words.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    words.forEach(item => {
      const card = document.createElement('div');
      card.className = 'saved-card';
      card.innerHTML = `
        <div class="saved-info">
          <strong>${item.word}</strong>
          <div class="trans">${item.meaning ? item.meaning.replace(/\n/g, ' - ') : ''}</div>
        </div>
        <div class="saved-actions">
          <button class="icon-btn play-saved-btn" title="Nghe đọc">🔊</button>
          <button class="icon-btn remove-saved-btn" title="Xóa">🗑️</button>
        </div>
      `;

      card.querySelector('.play-saved-btn').addEventListener('click', () => {
        if (item.audioUrl) {
          new Audio(item.audioUrl).play().catch(() => speakTTS(item.word));
        } else {
          speakTTS(item.word);
        }
      });

      card.querySelector('.remove-saved-btn').addEventListener('click', () => {
        removeWord(item.word);
      });

      listContainer.appendChild(card);
    });
  });
}

function removeWord(text) {
  chrome.storage.local.get({ savedWords: [] }, (res) => {
    const filtered = res.savedWords.filter(w => w.word.toLowerCase() !== text.toLowerCase());
    chrome.storage.local.set({ savedWords: filtered }, () => {
      renderSavedWords();
      updateWordCount();
      if (currentText.toLowerCase() === text.toLowerCase()) {
        document.getElementById('quick-save-btn').classList.remove('saved');
      }
    });
  });
}

// Export Flashcard CSV for Anki / Excel
function exportToCSV() {
  chrome.storage.local.get({ savedWords: [] }, (res) => {
    const words = res.savedWords;
    if (words.length === 0) {
      alert('Sổ tay chưa có từ nào để xuất!');
      return;
    }
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Từ / Câu tiếng Anh,Phiên âm,Nghĩa Tiếng Việt,Thời gian lưu\r\n";
    words.forEach(w => {
      const cleanWord = `"${(w.word || '').replace(/"/g, '""')}"`;
      const cleanPhonetic = `"${(w.phonetic || '').replace(/"/g, '""')}"`;
      const cleanMeaning = `"${(w.meaning || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
      const dateStr = `"${new Date(w.createdAt || Date.now()).toLocaleDateString()}"`;
      csvContent += `${cleanWord},${cleanPhonetic},${cleanMeaning},${dateStr}\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `speakwise_vocabulary_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}
