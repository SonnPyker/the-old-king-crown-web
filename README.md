# The Old King's Crown — bản web (fan project, dùng cá nhân)

Mô phỏng boardgame **The Old King's Crown** chạy hoàn toàn trên trình duyệt, tự động hóa 100 %: người chơi chỉ chọn hành động, mọi thao tác kéo thả / đếm / dọn bàn do engine làm. Chơi được 2–4 người (hotseat) và/hoặc với máy (AI Dễ / Thường / Khó). Giao diện lấy phong cách artwork của game, responsive cho điện thoại.

## Chạy

Không cần cài gì để chơi: mở `index.html` (hoặc `dist/game.js` đã build sẵn là đủ, chạy được cả qua `file://`).

```bash
npm install            # chỉ cần khi muốn build lại (esbuild)
node build.mjs         # bản production (minify) -> dist/game.js
node build.mjs --dev   # bản dev có sourcemap, không minify
node tools/serve.mjs 8123   # server tĩnh để thử: http://localhost:8123
```

## Tính năng

* **Luật chuẩn theo rulebook**: 4 phe (Nobility, Uprising, Clans, Gathering) với Kingdom's Favour riêng, 3 Region / 6 Location, 3 Hội đồng (Relics, Secrets, Oaths), Kingdom Cards, Tactics, Heir + Basic Deck, ván Ngắn (4 năm) / Chuẩn (5) / Dài (6), chế độ Advanced, thứ tự lượt ngẫu nhiên hoặc theo chỗ ngồi.
* **Engine tất định** (`src/engine`): game là một generator, mỗi quyết định là một *request* (`select` / `assign` / `distribute` / `peek`). Nhờ vậy lưu ván, **undo**, replay và AI dùng chung một giao thức; ván được lưu tự động và có thể “Tiếp tục”.
* **AI** (`src/ai`): `random` (chỉ để fuzz), và 3 mức người dùng:
  * *Dễ*: nhiều nhiễu, thỉnh thoảng đi ngẫu nhiên, không lập kế hoạch;
  * *Thường*: lập kế hoạch đặt bài úp theo kỳ vọng, đánh giá Location/KC/Tactic;
  * *Khó*: thêm đếm bài (chỉ dùng thông tin công khai), mô hình xác suất thắng từng Region.
  AI **không** nhìn bài trên tay / giá thầu / bài úp của đối thủ.
* **UI/UX**: HTML thuần + CSS (không framework), phông Cinzel / Cormorant, màu & khung theo bản gốc; thu phóng lá bài, nhật ký ván, bảng luật nhanh, hotseat có màn che, 2 ngôn ngữ (Tiếng Việt / English), responsive: bố cục 3 cột trên desktop, tab Bàn / Của tôi / Đối thủ / Nhật ký trên điện thoại.

## Cấu trúc

```
index.html, css/style.css
src/data/      dữ liệu lá bài, KC, Tactics, Location…
src/engine/    luật game, controller (Session: replay/undo/save)
src/ai/        heuristic.js (Dễ/Thường/Khó), random.js
src/ui/        dựng giao diện, i18n, quyết định, modal
assets/        ảnh WebP đã xuất sẵn từ Tabletop Simulator
tools/         công cụ phát triển (xem dưới)
```

## Công cụ kiểm thử

```bash
node tools/simulate.mjs 300                # fuzz: AI ngẫu nhiên + kiểm tra bất biến + replay tất định
node tools/simulate.mjs 800 1 --levels=hard,normal,easy,random --nocheck --noreplay --profile
                                           # đấu giữa các mức AI, thống kê % thắng / điểm / nguồn Influence
node tools/purposes.mjs 60                 # liệt kê hình dạng mọi loại request
node tools/i18n_check.mjs                  # kiểm tra đủ chuỗi dịch
node tools/coverage.mjs                    # liệt kê loại request / sự kiện chưa từng xuất hiện trong ván ngẫu nhiên
```

Kết quả tham khảo (4 người, 800 ván): Khó ≈ 45 % thắng, Thường ≈ 37 %, Dễ ≈ 17 %, Random ≈ 1 %.

## Assets & bản quyền

Hình ảnh, tên và luật thuộc về nhà phát hành/tác giả của *The Old King's Crown*. Thư mục `assets/` chỉ là ảnh trích từ mod Tabletop Simulator của người dùng để **dùng cá nhân**; không phân phối lại. Script `tools/make_assets.py <RAW_DIR>` dùng để xuất lại ảnh WebP từ thư mục ảnh gốc (xem phần đầu file).
