# Các luật engine lệch so với thẻ in và sách luật

Ngày rà: 2026-10-11. Lần này đối chiếu thêm với sách luật gốc trong `rulebooks/` (số trang dưới đây là số in trên sách).

File này liệt kê các chỗ engine (`src/engine/`) làm khác với chữ in trên thẻ hoặc luật. Mục đã sửa được ghi rõ. Mục giữ nguyên có lý do. Mục còn lại cần người quyết định.

## Kết quả

- Lần rà đầu có 12 mục. Lần kiểm tra lại dùng 4 agent chỉ đọc. Lần này đối chiếu sách luật gốc (không phải mở rộng).
- Đã sửa: mục 2, 3, 4, 5 (phần Syndicate), 6, 8, 9, 10 (Bell và Banner), 11, 12.
- Chỉ sửa mô tả: mục 7.
- Giữ nguyên vì sách luật xác nhận: mục 1, và Flank vào Region bị Martial Law khóa.
- Còn một chỗ lệch nhỏ chưa sửa: phần Marker của Relics (xem dưới).
- Kiểm tra sau khi sửa:
  - `node tools/i18n_check.mjs`: đủ 478 khóa.
  - `node tools/simulate.mjs 300`: 300 ván, 0 lỗi bất biến và replay.
  - Matchup 800 ván, 4 người, seed 1: hard 43.5%, normal 37.3%, easy 18.4%, random 0.9%. Thứ tự hard > normal > easy > random giữ nguyên.
  - `node build.mjs`: đã build lại `dist/`.
- Chưa commit.

## Bảng tóm tắt

| # | Thẻ / luật | Đối chiếu sách luật | Trạng thái |
|---|---|---|---|
| 1 | Điểm cuối ván: cộng Lore khi Site of Power trống | Có trong luật (trang 44) | Giữ nguyên |
| 2 | Shapeshifter's Mirror: copy bản sao cũ | Đúng | Đã sửa |
| 3 | Martial Law và School of the Stars: bỏ qua khóa Region | Đúng | Đã sửa |
| 4 | Moonshine Cove: lấy Kingdom Card không tốn Captain/Champion | Đúng | Đã sửa |
| 5 | The Syndicate: bỏ Marker khỏi Council | Đúng | Đã sửa (Syndicate) |
| 6 | Castle: xóa thêm Marker của mọi người | Đúng; Marker chỉ bị gỡ khi có luật ghi rõ | Đã sửa |
| 7 | Woe (Deploy) và Reserve | Reserve là kho chung, Deploy lấy i từ Reserve (trang 38) | Giữ hành vi; đã sửa mô tả |
| 8 | Ritual of the Tooth copy Guerrilla Fighters | Đúng | Đã sửa |
| 9 | Siege Commander: trigger Heir | Đúng một phần (chỉ khi có Mirror) | Đã sửa |
| 10 | Blue Hour Bell và Banner | Action là tùy chọn, không có điều kiện mục tiêu (trang 8) | Đã sửa (cả hai) |
| 11 | Courtier's Diary: không chọn lại lá vừa chuyển | Đúng | Đã sửa |
| 12 | Moonlit Foragers: được bỏ qua việc mua | Đúng | Đã sửa |
| — | Flank vào Region bị Martial Law khóa | Martial Law chỉ chặn trong Clash đầu của Region đó | Giữ nguyên |
| — | Relics: bỏ Marker để nhận Influence | Có trong luật, nhưng "bất kỳ số" Marker | Giữ; còn lệch nhỏ |

## Chi tiết

### 1. Điểm cuối ván: cộng Lore khi Site of Power trống — giữ nguyên

- **Luật** (trang 44, phần Sites of Power, mục "No Cards Left on Your Site of Power"): nếu Site of Power không còn lá khi game kết thúc, trước khi tính Influence, bạn nhận 1 Influence cho mỗi 2 Lore trong Supply.
- **Engine** (`src/engine/flow.js`, `scoreEnd`): `floor(lore / 2)` khi Site of Power trống, cộng vào Influence trước khi xếp hạng. Khớp.
- **Hòa**: người giữ Kingdom's Favour thắng, rồi thứ tự Order Track (trang 34). Khớp.
- **Ghi chú**: panel "Winning the Game" trong `assets/ref/ref_sequence.webp` chỉ là tóm tắt, không nhắc Lore. Bản rà cũ kết luận "không có trong luật" là sai vì chỉ đọc panel đó.

### 4. Relics: bỏ Marker để nhận Influence — giữ, còn lệch nhỏ

- **Luật** (Council of Relics, mục Council Clarifications): khi nhận Herald Reward, bạn có thể bỏ bất kỳ số lá và/hoặc Marker tại Council đó, và nhận Influence bằng tổng v bị bỏ. Có một khoản Influence thêm, ngoài Herald Reward.
- **Engine** (`src/engine/ops_council.js`, `claimClashRewards`): cho chọn lá (đúng), sau đó hỏi yes/no có bỏ luôn toàn bộ Marker của bạn tại Relics không.
- **Lệch nhỏ**: luật cho bỏ "bất kỳ số" Marker. Engine chỉ có tất cả hoặc không có. Chưa sửa vì cần đổi yes/no thành chọn số lượng (0..n), thêm khóa i18n và handler AI. Xem mục "Cần quyết định".

### 7. Reserve: giữ hành vi, sửa mô tả

- **Luật**: Reserve là kho chung chứa Influence và Lore, không giới hạn số lượng (Setup, Glossary). Deploy đặt Influence từ Reserve lên lá (trang 38). Khi dọn Winter, Influence bị bỏ được trả về Reserve (ví dụ trang 38).
- **Engine**: Deploy không trừ `P.inf` và không cần kiểm tra Supply. Đúng, vì Reserve không thuộc Supply. Winter bỏ Influence đi, không đưa về đâu. Hiệu lực giống hệt, vì Reserve không giới hạn.
- **Đã sửa mô tả**: `src/data/descriptions.js` (vi), `src/data/glossary.js` (vi và en) trước đây ghi "Supply" nay ghi "Reserve".

### 10. Blue Hour Bell và Banner: đã đổi theo luật

- **Luật**: mọi Action là tùy chọn, mỗi người kích hoạt một lần mỗi Round (trang 8). Sách không yêu cầu có lá hay mục tiêu để kích hoạt.
- **Bell** (`src/engine/logic/kingdom.js`): bỏ điều kiện `can`. Nếu Lost Pile không có Faction thì bỏ qua bước chọn top/bottom và chỉ bỏ thẻ này.
- **Banner** (`kingdom.js`): bỏ điều kiện `can`. Nếu không có Supporter thì Action không làm gì (chữ in là "up to two").
- **AI** (`src/ai/heuristic.js`): giá trị của Bell bằng 0 khi Lost Pile không có Faction, để AI không bỏ thẻ vô ích.

### Flank vào Region bị Martial Law khóa — giữ nguyên

- **Martial Law** (thẻ Tactic, `src/data/face_text.js`): đối thủ không được Swap, thêm hoặc chuyển lá vào Region đã chọn trong Clash đầu tiên ở đó trong Round này.
- **Flank**: đưa lá sang Region chưa giải quyết, trong khi Clash đang diễn ra ở Region khác. Region đích không đang có Clash đầu tiên, nên không nằm trong cửa sổ bị cấm. `src/engine/actions.js` cho phép, đúng chữ.
- Nếu muốn chặn cả lá Flank vào trước Clash đầu tiên của Region, đó là đổi luật, không phải sửa lỗi engine.

### 5. Syndicate và 6. Castle

- Giữ như đã sửa ở lần trước. Việc hỏi Syndicate có bỏ Marker không là luật của thẻ, và Castle không còn xóa Marker của người khác.

## Lỗi trong bản rà cũ (đã sửa trong file này)

- Mục 1: kết luận "không có trong luật" sai. Sách luật trang 44 có.
- Mục 2: đề xuất `g.baseDef(src)` sai. Phải là `g.baseDef(g.C(src))`.
- Mục 5: audit nói không có removal nào có lựa chọn Marker. Relics có. Witch Trial cũng là một removal.
- Mục 7: mô tả Deploy và Winter ghi "Supply", sai với luật. Đã sửa.
- Mục 9: tên thẻ là "Siege Commander".
- Mục 10: điều kiện Lost Pile không có trong luật. Đã đổi.
- Mục 11: số dòng là 264.
- Mục 12: mức độ là thấp đến vừa.

## Cần quyết định

1. **Relics, bỏ "bất kỳ số" Marker**: đề nghị sửa để khớp luật (cho chọn 0..n Marker thay vì tất cả hoặc không). Cần xác nhận cách tính v của Marker `syn` và `bri` (hiện `bri` chỉ tính khi có lá Bringer) trước khi làm. Nếu đồng ý, tôi sẽ làm.

## Lưu ý

- Save cũ có thể lệch khi replay. Các thay đổi mục 4, 5, 6, 9, 10 đổi lựa chọn có sẵn hoặc thêm câu hỏi yes/no mới, nên ván lưu trước đó có thể không khớp.
- Đối chiếu dùng sách luật gốc (`rulebooks/httpssteamusercontentaakamaihdnetugc24310114491253614CB649778DA109A0E33506CD452931AC52161DA7E.pdf`). Sách mở rộng (Wild Kingdom, file còn lại trong `rulebooks/`) không dùng.
- Không có unit test. Kiểm tra dựa vào simulator (bất biến, replay, matchup AI) và đọc luật.
