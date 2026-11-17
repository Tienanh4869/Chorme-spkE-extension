// Popup Logic (Word & Sentence Translation)
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

  // Clear all
  document.getElementById('clear-all-btn').addEventListener('click', () => {
    if (confirm('Xóa toàn bộ từ và câu đã lưu?')) {
      chrome.storage.local.set({ savedWords: [] }, () => {
        renderSavedWords();
        updateWordCount();
      });
    }
  });

  updateWordCount();
  processInput('Consistency is the key to success.');
});

async function translateText(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Translation failed');
    const data = await res.json();
    let translated = '';
    if (data && data[0]) {
      data[0].forEach(item => {
        if (item && item[0]) translated += item[0];
      });
    }
    return translated || 'Không có bản dịch.';
  } catch (e) {
    return 'Lỗi dịch mạng.';
  }
}

async function processInput(text) {
  currentText = text;
  const resultCard = document.getElementById('quick-result');
  const scoreBox = document.getElementById('score-indicator');
  const transcriptBox = document.getElementById('spoken-transcript');
  const defContainer = document.getElementById('result-definition-container');
  const ipaEl = document.getElementById('result-ipa');
  const typeEl = document.getElementById('result-type');
  const transEl = document.getElementById('result-translation');

  scoreBox.style.display = 'none';
  transcriptBox.textContent = '';
  resultCard.style.display = 'block';

  document.getElementById('result-word').textContent = text;
  transEl.textContent = 'Đang dịch...';

  // Translate
  translateText(text).then(trans => {
    transEl.textContent = trans;
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

  scoreBox.style.display = 'flex';
  transcriptBox.innerHTML = `Đã nghe: "<strong>${spoken}</strong>"`;

  const cleanTarget = currentText.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "");
  const cleanSpoken = spoken.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, "");

  const sim = getSimilarity(cleanTarget, cleanSpoken);
  const pct = Math.round(sim * 100);

  scoreVal.textContent = `${pct}%`;
  scoreVal.className = 'score-pill';

  if (pct >= 85) {
    scoreVal.classList.add('excellent');
    scoreMsg.textContent = '🌟 Rất lưu loát!';
  } else if (pct >= 60) {
    scoreVal.classList.add('good');
    scoreMsg.textContent = '👍 Khá chuẩn!';
  } else {
    scoreVal.classList.add('needs-work');
    scoreMsg.textContent = '💡 Thử nghe lại';
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
        meaning: document.getElementById('result-translation').textContent,
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
          <div class="trans">${item.meaning || ''}</div>
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
