# 20/10 Deadline Run — bản chạy LAN

Game né deadline chạy trên một máy chủ nhỏ trong mạng nội bộ công ty, có bảng xếp hạng chung và lưu điểm cao nhất của từng người. Nhân vật là các sticker PNG chọn từ thư viện.

Không cần cài thêm thư viện nào — chỉ dùng Node.js có sẵn.

## Chạy nhanh

1. Nhấp đúp `start.bat` (hoặc chạy `node server.js`).
   - `start.bat` sẽ hỏi **"Xoa toan bo bang xep hang va bat dau moi? (y/N)"**:
     - Gõ `y` rồi Enter: sao lưu điểm cũ ra `data\scores.backup-<ngày_giờ>.json`, rồi xóa sạch bảng xếp hạng để chơi mới.
     - Chỉ nhấn Enter (hoặc gõ gì khác): giữ nguyên bảng xếp hạng, chỉ khởi động lại.
   - Mỗi lần chạy đều tự tạo lại thumbnail từ ảnh mới nhất trong `characters/`, nên cứ đổi/thêm ảnh rồi mở lại là cập nhật.
2. Cửa sổ sẽ in ra hai địa chỉ, ví dụ:
   ```
   Máy này:     http://localhost:3000
   Trong LAN:   http://10.39.225.209:3000
   ```
3. Mở `http://localhost:3000` để chơi trên chính máy chủ.
4. Gửi link **"Trong LAN"** cho đồng nghiệp cùng mạng. Họ mở trên trình duyệt máy họ là chơi được.

Máy chạy `start.bat` phải luôn bật thì mọi người mới vào được.

## Cho đồng nghiệp vào được (mở firewall)

Lần đầu, mở PowerShell **quyền Administrator** và chạy một lần:

```powershell
New-NetFirewallRule -DisplayName "DeadlineRun" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Domain,Private
```

Lệnh này chỉ mở cổng 3000 cho mạng Domain/Private (mạng công ty), không mở ra Internet.

## Nhân vật tự khớp theo tên

Người chơi **không chọn nhân vật**. Ảnh nhân vật (nữ) tự khớp theo tên nhập vào: gõ `giangnl3` thì dùng ảnh `characters/female/giangnl3.png`. Khớp **không phân biệt hoa/thường** — `GiangNL3`, `GIANGNL3`, `giangnl3` đều ra cùng một ảnh.

Nếu tên nhập vào không có file ảnh tương ứng, game báo "Chưa có nhân vật cho tên này" và không cho bắt đầu.

### Cấu trúc nhân vật

```
characters/
  female/   nhân vật người chơi (khớp theo tên)   vd: giangnl3.png, yenhtk1.png
  male/     nhân vật nam tặng hoa ở màn kết thúc   vd: ason.png, vupn.png
  thumbs/   bản thu nhỏ tự tạo (female/ và male/)
```

- **female/**: tên file (bỏ `.png`) chính là tên người chơi gõ. Đặt theo tài khoản nội bộ.
- **male/**: khi hết màn chơi, game chọn **ngẫu nhiên** một nhân vật nam trong đây đứng cạnh tặng hoa cho nhân vật nữ, kèm lời chúc "Chúc [tên] 20/10 vui vẻ!!!". Ảnh nam nên là ảnh đã cầm sẵn bó hoa.
- Tên file chỉ dùng chữ, số, `-`, `_`. File phải là **PNG thật** (không đổi tên JPG thành .png).

Khi khởi động, máy chủ tự tạo bản thu nhỏ ~256px trong `characters/thumbs/` để game tải nhanh. Ảnh gốc giữ nguyên. Đổi/thêm ảnh thì ghi file rồi khởi động lại (hoặc chạy `start.bat`, nó luôn tạo lại thumbnail).

## Vật phẩm Hoa 💐 và cảnh tặng hoa

- Khi điểm trong ván vừa chạm **1000**, một bó hoa 💐 rơi xuống **đúng một lần**. Né trượt là mất, không rơi lại.
- Ăn được 💐: màn kết thúc sẽ có một **nhân vật nam ngẫu nhiên** đứng cạnh tặng hoa cho nhân vật nữ. Không ăn được: nhân vật nữ đứng một mình.
- Mỗi lần nhận hoa được **cộng dồn** vào bảng xếp hạng, hiện dưới dạng `💐×N` cạnh tên (tính qua tất cả các ván, kể cả ván không phá kỷ lục điểm).

## Lưu điểm

- Mỗi tên giữ **điểm cao nhất** của mình, kèm nhân vật đã dùng ở lần đạt kỷ lục đó, và **tổng số lần nhận hoa**.
- Tên phân biệt chữ hoa/thường (ví dụ `Thanh` và `thanh` là hai người).
- Dữ liệu nằm ở `data/scores.json`. Muốn xoá toàn bộ bảng xếp hạng thì chạy `start.bat` và gõ `y` khi được hỏi — điểm cũ sẽ được sao lưu tự động vào `data\scores.backup-<ngày_giờ>.json` trước khi xóa, nên lỡ tay vẫn khôi phục được bằng cách chép file backup đè lại `scores.json`.

## Lưu ý

- Máy chủ **không có đăng nhập**. Ai cũng có thể nhập tên bất kỳ. Chỉ dùng trong nội bộ, **đừng mở cổng ra Internet**.
- Địa chỉ IP LAN có thể đổi sau khi khởi động lại máy. Nếu link cũ không vào được, chạy lại `start.bat` để xem IP mới.

## Chạy test (tuỳ chọn)

```
node --test
```
