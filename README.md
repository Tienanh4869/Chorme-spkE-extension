# SpeakWise - Pronunciation, Vocabulary & Speaking Coach Extension

**SpeakWise** là tiện ích mở rộng (Manifest V3) trên Chrome / Edge / Brave được thiết kế chuyên sâu dành cho **người học tiếng Anh**. Extension kết hợp tra cứu ngữ cảnh, dịch nghĩa tiếng Việt chi tiết, phiên âm IPA chuẩn xác, luyện phát âm trực tiếp với công nghệ nhận diện giọng nói và sổ tay từ vựng thông minh.

---

## 🌟 Tính Năng Nổi Bật

- ✂️ **Khoanh vùng quét chữ trên màn hình (PDF Viewer & Tab mở ảnh trực tiếp)**:
  - Khi xem tài liệu **PDF trên web** hoặc mở trực tiếp **tab chứa ảnh** (nơi văn bản không thể bôi đen bình thường), bạn chỉ cần:
    - Nhấn phím tắt **`Alt + Q`**, hoặc
    - Chuột phải chọn **"SpeakWise: ✂️ Khoanh vùng quét chữ"**, hoặc
    - Bấm nút **`✂️ Khoanh vùng (PDF/Ảnh)`** trong Popup.
  - Kéo chuột khoanh đúng vùng câu hoặc chữ cần đọc. Extension sẽ tự động cắt ảnh, quét chữ (OCR), dịch nghĩa tiếng Việt và cho phép bạn luyện phát âm ngay tại chỗ.

- 📷 **Nhận diện chữ & câu văn trong ảnh (Image OCR Text Detection)**:
  - Tự động nhận diện chữ, ký tự và cả câu văn tiếng Anh từ hình ảnh trên web.
  - Rê chuột vào ảnh bất kỳ để xuất hiện nút **`📷 Quét chữ trong ảnh`**, hoặc nhấp chuột phải chọn **"SpeakWise: 📷 Quét chữ & Luyện phát âm từ ảnh này"**.
  - Tích hợp sẵn trong Popup: Cho phép tải ảnh trực tiếp từ máy tính để trích xuất văn bản, dịch nghĩa và luyện đọc.

- 🎙️ **Luyện nói & Chấm điểm phát âm tức thì (Speech Recognition & Scorer)**:
  - Bấm micro và phát âm trực tiếp từ hoặc cả câu văn ngay trên website.
  - Phân tích chi tiết từng từ: đánh dấu từ đọc chuẩn (`✓ xanh`) và từ cần cải thiện (`✗ đỏ`), kèm điểm số tổng thể từ 0% đến 100%.

- 🇻🇳 **Dịch nghĩa tiếng Việt chi tiết & Phân loại từ loại**:
  - Cung cấp nghĩa tiếng Việt trọng tâm và các tầng nghĩa đồng nghĩa.
  - Phân loại rõ ràng các từ loại như *[Danh từ]*, *[Động từ]*, *[Tính từ]*, *[Trạng từ]*.

- ✨ **Dịch thông minh theo ngữ cảnh (Smart Context Deduction)**:
  - Tự động đọc ngữ cảnh đoạn văn xung quanh câu đã chọn.
  - Hỗ trợ suy luận các câu bị khuyết từ (placeholder như `...`, `___`) và tự động chuẩn hóa lỗi ngữ pháp thường gặp.

- 🔊 **Nghe phát âm đa tốc độ (Dual Speed Native Audio)**:
  - Chế độ **1.0x (Chuẩn bản ngữ)** và **0.6x (Chậm)** giúp người học nghe rõ từng âm tiết, âm đuôi (*ending sounds* như /s/, /t/, /d/) và ngữ điệu câu.

- 🌐 **Hỗ trợ toàn diện nội dung động (Dynamic Content Ready)**:
  - Hoạt động mượt mà trên các nền tảng Single Page Apps (React, Vue), Web Components / Shadow DOM (YouTube, Reddit, Twitter/X) và các khung nhúng iframe.

- ⌨️ **Phím tắt tiện lợi (Keyboard Shortcuts)**:
  - **`Alt + S`**: Phát âm nhanh đoạn văn bản đang bôi đen.
  - **`Alt + W`**: Bật / tắt thanh bên Side Panel để tra cứu song song với nội dung trang web.

- 📚 **Sổ tay từ vựng & Flashcards cá nhân**:
  - Lưu từ và câu yêu thích chỉ với 1 click (`⭐ Lưu từ`).
  - Hỗ trợ xuất dữ liệu ra file **CSV (Excel / Anki / Quizlet)** để ôn tập mọi lúc mọi nơi.

---

## 📁 Cấu Trúc Dự Án

```
d:\extension\
│── manifest.json             # Cấu hình Manifest V3 & quyền hạn extension
│── background\
│   └── background.js         # Service worker quản lý context menu & phím tắt
│── content\
│   ├── content.js            # Trích xuất văn bản động, UI Tooltip, Side Panel & chấm điểm giọng nói
│   └── content.css           # Giao diện trực quan, hỗ trợ chống tràn màn hình
│── popup\
│   ├── popup.html            # Giao diện popup dashboard ôn tập flashcard
│   ├── popup.js              # Logic tra cứu nhanh, kiểm tra giọng & xuất CSV
│   └── popup.css             # Định dạng phong cách popup
│── icons\
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── utils\
    └── generate_icons.ps1
```

---

## 🚀 Hướng Dẫn Cài Đặt và Sử Dụng

### 1. Cài đặt trên Chrome / Edge / Brave
1. Mở trình duyệt và truy cập trang quản lý tiện ích:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
   - **Brave**: `brave://extensions/`
2. Bật chế độ **Developer mode** (Chế độ dành cho nhà phát triển ở góc trên bên phải).
3. Nhấp vào nút **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục dự án: `D:\extension`
5. Tiện ích **SpeakWise** đã sẵn sàng hoạt động!

---

### 2. Cách sử dụng hàng ngày
1. **Tra cứu & Nghe phát âm trực tiếp trên website**:
   - Bôi đen một từ hoặc câu văn tiếng Anh trên bất kỳ trang web nào.
   - Nhấp vào nút nổi **✨ SpeakWise Dịch & Luyện** (hoặc nhấn phím tắt **`Alt + S`**).
2. **Luyện phát âm & Kiểm tra điểm số**:
   - Nhấp vào nút **🎤 Bấm để nói** trên thẻ nổi.
   - Đọc to từ hoặc câu vào micro để xem phản hồi và điểm phát âm chi tiết.
3. **Thanh bên tra cứu nâng cao**:
   - Nhấp biểu tượng mở rộng `⤢` (hoặc nhấn **`Alt + W`**) để mở thanh bên Side Panel.
   - Bấm **📌 Ghim** để vừa đọc tài liệu vừa tra cứu từ mà không bị che nội dung trang web.
4. **Quản lý & Xuất từ vựng**:
   - Nhấp vào biểu tượng SpeakWise trên thanh công cụ trình duyệt để mở sổ tay từ vựng.
   - Nhấp **📥 Xuất CSV** để lưu về máy và ôn tập trên Excel hoặc Anki.
