# SpeakWise - Pronunciation & Vocabulary Speaking Coach Extension

**SpeakWise** is a Chrome/Edge Manifest V3 browser extension engineered to be significantly better than Google Translate for **language learners**, **pronunciation training**, and **speaking mastery**.

---

## 🌟 Why is it Better than Google Translate?

| Feature | Google Translate | SpeakWise |
| :--- | :--- | :--- |
| **Speaking Evaluation** | ❌ No pronunciation check / score | ✅ **Real-time Voice Recognition & Scoring (0–100%)** |
| **Phonetics** | ⚠️ Often missing or hidden | ✅ **Full IPA (International Phonetic Alphabet)** |
| **Audio Speed** | ⚠️ Limited control | ✅ **Dual Speeds: 1.0x Normal & 0.6x Slow Syllable audio** |
| **In-context Learning** | ❌ Translates isolated words | ✅ **Parts of Speech, Definitions, Example Sentences, & Synonyms** |
| **Vocabulary Retention** | ❌ Generic phrasebook | ✅ **Personal Notebook & Flashcards** directly saved with 1 click |
| **Browser Integration** | ❌ Copy-pasting back and forth | ✅ **Floating action pill on text selection & right-click context menu** |

---

## 📁 Project Structure

```
d:\extension\
│── manifest.json             # Manifest V3 configuration
│── background\
│   └── background.js         # Context menu & storage coordination
│── content\
│   ├── content.js            # In-page interactive modal, voice recognition & scorer
│   └── content.css           # Clean modern UI styling
│── popup\
│   ├── popup.html            # Extension popup dashboard & flashcard review
│   ├── popup.js              # Quick search, voice test & saved vocabulary manager
│   └── popup.css             # Popup interface styling
│── icons\
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── utils\
    └── generate_icons.ps1
```

---

## 🚀 How to Install and Test in Chrome / Edge / Brave

1. Open your browser and navigate to the Extensions page:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
   - **Brave**: `brave://extensions/`
2. Turn ON **"Developer mode"** (toggle in the top-right corner).
3. Click the **"Load unpacked"** button.
4. Select the directory: `D:\extension`
5. The **SpeakWise** extension is now installed and active!

---

## 💡 How to Use

1. **Highlighting text on any website**:
   - Select any word while reading an article.
   - Click the floating **🎙️ SpeakWise** button (or right-click and select *"SpeakWise: Practice & Learn"*).
   - An interactive pronunciation card appears right over the page.
2. **Audio & Syllables**:
   - Click **🔊 Normal** to hear native pronunciation.
   - Click **🐢 Slow (0.6x)** to dissect difficult syllables.
3. **Speaking Accuracy Test**:
   - Click **🎤 Start Speaking** and pronounce the word into your microphone.
   - SpeakWise analyzes your speech and gives you an accuracy percentage (e.g. `95% - Native level clarity`) with immediate feedback!
4. **Vocabulary Notebook**:
   - Click **⭐ Save Word** to store it.
   - Click the extension icon in the toolbar anytime to review your saved vocabulary list, play pronunciation audio, or look up new terms.
