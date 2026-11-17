// Popup Logic
let currentWord = null;
let currentAudio = null;
let recognition = null;
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

  // Search
  document.getElementById('quick-search-btn').addEventListener('click', () => {
    const word = document.getElementById('quick-input').value.trim();
    if (word) lookupWord(word);
  });

  document.getElementById('quick-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const word = e.target.value.trim();
      if (word) lookupWord(word);
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
    if (confirm('Clear all saved vocabulary words?')) {
      chrome.storage.local.set({ savedWords: [] }, () => {
        renderSavedWords();
        updateWordCount();
      });
    }
  });

  updateWordCount();
  // Default load an interesting example if empty
  lookupWord('eloquent');
});

async function lookupWord(word) {
  const resultCard = document.getElementById('quick-result');
  const scoreBox = document.getElementById('score-indicator');
  const transcriptBox = document.getElementById('spoken-transcript');

  scoreBox.style.display = 'none';
  transcriptBox.textContent = '';

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    const entry = data[0];

    currentWord = entry;
    resultCard.style.display = 'block';

    document.getElementById('result-word').textContent = entry.word;

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

    checkIfSaved(entry.word);
  } catch (e) {
    alert(`Could not find details for "${word}".`);
  }
}

function playAudio(rate = 1.0) {
  if (currentAudio) {
    const audio = new Audio(currentAudio);
    audio.playbackRate = rate;
    audio.play().catch(() => speakTTS(currentWord.word, rate));
  } else if (currentWord) {
    speakTTS(currentWord.word, rate);
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
    micBtn.textContent = '🎙️ Speak Now';
    return;
  }

  if (!SpeechRecognition) {
    alert('Speech recognition is not supported in this browser version.');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  micBtn.classList.add('recording');
  micBtn.textContent = '🔴 Listening...';

  recognition.onresult = (e) => {
    const spoken = e.results[0][0].transcript.toLowerCase().trim();
    evaluateSpeech(spoken);
  };

  recognition.onend = () => {
    micBtn.classList.remove('recording');
    micBtn.textContent = '🎙️ Speak Now';
  };

  recognition.onerror = () => {
    micBtn.classList.remove('recording');
    micBtn.textContent = '🎙️ Speak Now';
  };

  recognition.start();
}

function evaluateSpeech(spoken) {
  if (!currentWord) return;
  const target = currentWord.word.toLowerCase();
  const transcriptBox = document.getElementById('spoken-transcript');
  const scoreBox = document.getElementById('score-indicator');
  const scoreVal = document.getElementById('score-val');
  const scoreMsg = document.getElementById('score-msg');

  scoreBox.style.display = 'flex';
  transcriptBox.innerHTML = `Heard: "<strong>${spoken}</strong>"`;

  const sim = getSimilarity(target, spoken);
  const pct = Math.round(sim * 100);

  scoreVal.textContent = `${pct}%`;
  scoreVal.className = 'score-pill';

  if (pct >= 90) {
    scoreVal.classList.add('excellent');
    scoreMsg.textContent = '🌟 Native!';
  } else if (pct >= 65) {
    scoreVal.classList.add('good');
    scoreMsg.textContent = '👍 Clear!';
  } else {
    scoreVal.classList.add('needs-work');
    scoreMsg.textContent = '💡 Try Slow';
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

function checkIfSaved(word) {
  const saveBtn = document.getElementById('quick-save-btn');
  chrome.storage.local.get({ savedWords: [] }, (res) => {
    const isSaved = res.savedWords.some(w => w.word.toLowerCase() === word.toLowerCase());
    if (isSaved) {
      saveBtn.classList.add('saved');
    } else {
      saveBtn.classList.remove('saved');
    }
  });
}

function toggleSaveWord() {
  if (!currentWord) return;
  const saveBtn = document.getElementById('quick-save-btn');
  const word = currentWord.word;

  chrome.storage.local.get({ savedWords: [] }, (res) => {
    let list = res.savedWords;
    const idx = list.findIndex(w => w.word.toLowerCase() === word.toLowerCase());
    if (idx >= 0) {
      list.splice(idx, 1);
      saveBtn.classList.remove('saved');
    } else {
      const item = {
        word: word,
        phonetic: document.getElementById('result-ipa').textContent,
        audioUrl: currentAudio,
        meaning: document.getElementById('result-definition').textContent,
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
    document.getElementById('stats-badge').textContent = `${res.savedWords.length} words`;
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
          <span class="ipa">${item.phonetic || ''}</span>
        </div>
        <div class="saved-actions">
          <button class="icon-btn play-saved-btn" title="Listen">🔊</button>
          <button class="icon-btn remove-saved-btn" title="Remove">🗑️</button>
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

function removeWord(word) {
  chrome.storage.local.get({ savedWords: [] }, (res) => {
    const filtered = res.savedWords.filter(w => w.word.toLowerCase() !== word.toLowerCase());
    chrome.storage.local.set({ savedWords: filtered }, () => {
      renderSavedWords();
      updateWordCount();
      if (currentWord && currentWord.word.toLowerCase() === word.toLowerCase()) {
        document.getElementById('quick-save-btn').classList.remove('saved');
      }
    });
  });
}
