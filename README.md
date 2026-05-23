# Hospital Revenue Monitoring Dashboard

Dashboard giám sát doanh thu bệnh viện, xây dựng bằng Flask (Python) + SQLite ở backend và HTML/CSS/JavaScript ở frontend. Hỗ trợ nhập liệu, monitoring theo thời gian thực, phân tích thống kê qua Jupyter Notebook, dự báo doanh thu và báo cáo tự động.

---

## Tính năng

### 1. Dashboard (`/`)
- **8 KPI cards**: tổng doanh thu, doanh thu ngày gần nhất, doanh thu tháng, trung bình 7 ngày, trạng thái hệ thống, số cảnh báo, tổng bệnh nhân, số lượt khám
- **Bộ lọc kỳ báo cáo**: Hôm nay / Hôm qua / 7 ngày / 30 ngày / Tùy chỉnh / Tất cả — pill button, tự động reload
- **5 biểu đồ**: doanh thu theo ngày (với đường TB 7 ngày), cơ cấu nguồn thanh toán, top 5 khoa, doanh thu theo nhóm dịch vụ, cơ cấu theo loại điều trị
- **Bảng cảnh báo monitoring**: phát hiện ngày doanh thu biến động bất thường (Critical/Warning/Normal)
- **Bảng monitoring theo khoa/phòng và nhóm dịch vụ**: so sánh ngày gần nhất vs TB 7 ngày
- **Data Quality Monitor**: thiếu dữ liệu, doanh thu âm/bằng 0, lỗi mapping dimension, Quality Score

### 2. Nhập viện phí (`/data-entry`)
- Form nhập giao dịch thủ công với đầy đủ thông tin: khoa/phòng, dịch vụ, nguồn thanh toán, loại điều trị, BHYT
- Preview thành tiền tự động trước khi lưu
- Nút **Tạo giao dịch mẫu**: sinh ngẫu nhiên N giao dịch (1–300) để test

### 3. Statistical Analysis (`/analysis`)
Đọc kết quả từ các Jupyter Notebook đã chạy, hiển thị:
- **Forecasting Model**: dự báo doanh thu 30 ngày tới (Holt-Winters), khoảng tin cậy 95%, scenario analysis ±20%
- **Descriptive Statistics**: mean, median, std, tỷ lệ BHYT, doanh thu/bệnh nhân, doanh thu/lượt khám
- **Correlation Analysis**: ma trận tương quan Pearson theo khoa và nhóm dịch vụ, scatter plot bubble
- **Trend Analysis**: doanh thu theo tháng + tỷ lệ tăng trưởng MoM, STL decomposition (Trend + Seasonal + Residual)

### 4. Analysis Report (`/report`)
- Tự động sinh 8 finding từ kết quả notebook: top khoa, tỷ lệ BHYT, ngày tốt nhất trong tuần, tập trung dịch vụ, doanh thu/lượt khám, cặp khoa tương quan, tăng trưởng tháng, dự báo
- Executive Summary + badge mức độ (Positive / Warning / Info)

### 5. Chất lượng DL (`/data-quality`)
- Quality Score tổng hợp
- Phân tích missing values theo cột và xu hướng theo tháng
- Phát hiện outlier (IQR + Z-score)
- Phát hiện bản ghi duplicate
- 8 validation check: doanh thu âm/bằng 0, BHYT vượt thành tiền, số lượng ≤ 0, đơn giá âm, mapping sai dimension
- Danh sách khuyến nghị tự động

---

## Công nghệ sử dụng

| Tầng | Công nghệ |
|---|---|
| Backend | Python 3.9, Flask, Flask-CORS, Pandas, SQLite |
| Phân tích | Jupyter Notebook, NumPy, SciPy, Statsmodels, Plotly |
| Frontend | HTML5, CSS3, JavaScript, Chart.js |

---

## Cấu trúc thư mục

```
hospital_dashboard/
├── backend/
│   ├── app.py                  # Flask app + tất cả API endpoint
│   ├── hospital.db             # SQLite database (star schema)
│   ├── init_db.py              # Tạo schema database
│   ├── seed_data.py            # Nạp dữ liệu dimension
│   ├── seed_fact_data.py       # Nạp dữ liệu fact mẫu
│   └── analysis_output/        # JSON do notebook export ra
│       ├── descriptive_stats.json
│       ├── correlation_matrix.json
│       ├── trend_analysis.json
│       ├── forecast.json
│       ├── report.json
│       └── data_quality_report.json
├── analysis/
│   ├── revenue_analysis.ipynb  # Descriptive stats + correlation + trend
│   ├── forecasting.ipynb       # Holt-Winters forecast 30 ngày
│   ├── report.ipynb            # Auto-generate 8 findings
│   └── data_quality.ipynb      # Missing values, outliers, duplicates, validation
├── frontend/
│   ├── index.html              # Dashboard chính
│   ├── charts.js               # Logic chart + filter
│   ├── data_entry.html         # Trang nhập viện phí
│   ├── data_entry.js
│   ├── analysis.html           # Trang phân tích thống kê
│   ├── analysis.js
│   ├── report.html             # Trang báo cáo
│   ├── report.js
│   ├── data_quality.html       # Trang chất lượng dữ liệu
│   ├── data_quality.js
│   └── style.css
└── requirements.txt
```

---

## Cài đặt và chạy

### 1. Yêu cầu
- Python 3.9+
- Jupyter Notebook hoặc JupyterLab (để chạy notebook phân tích)

### 2. Cài đặt

```bash
git clone https://github.com/22521464/Hospital-Dashboard-Monitoring.git
cd hospital_dashboard

python3 -m venv .venv
source .venv/bin/activate          # macOS/Linux
# .venv\Scripts\activate           # Windows

pip install -r requirements.txt
```

### 3. Khởi tạo database

```bash
python3 backend/init_db.py
python3 backend/seed_data.py
python3 backend/seed_fact_data.py
```

### 4. Chạy Flask server

```bash
python3 backend/app.py
```

Mở trình duyệt tại `http://127.0.0.1:5000`.

---

## Pipeline phân tích (Notebook)

Trang **Statistical Analysis**, **Analysis Report** và **Chất lượng DL** đọc dữ liệu từ các file JSON được notebook export ra. Cần chạy notebook theo thứ tự:

```
1. analysis/revenue_analysis.ipynb   → descriptive_stats.json, correlation_matrix.json, trend_analysis.json
2. analysis/forecasting.ipynb        → forecast.json
3. analysis/report.ipynb             → report.json
4. analysis/data_quality.ipynb       → data_quality_report.json
```

Chọn kernel: `.venv (Python 3.9)` trong Jupyter trước khi chạy.

> **Tần suất chạy**: Chạy lại notebook khi cần cập nhật kết quả phân tích (ví dụ: sau khi nhập thêm dữ liệu mới). Dashboard chính (`/`) luôn đọc trực tiếp từ database, không cần chạy notebook.

---

## Mô hình database (Star Schema)

```
FACT_DOANHTHU
  ├── ID_KHOAPHONG  → DIM_KHOAPHONG  (khoa/phòng, loại khoa)
  ├── ID_DICHVU     → DIM_DICHVU     (tên dịch vụ, loại, nhóm)
  ├── ID_DOITUONG   → DIM_DOITUONG   (nguồn thanh toán: BHYT, tự trả, BHTN)
  ├── ID_BENHNHAN   → DIM_BENHNHAN   (họ tên, giới tính, năm sinh)
  └── ID_LOAI_DIEUTRI → DIM_LOAI_DIEUTRI (nội trú, ngoại trú, cấp cứu)
```

Mỗi bản ghi trong `FACT_DOANHTHU` là một dòng dịch vụ trong giao dịch viện phí: số lượng, đơn giá, thành tiền, BHYT trả, người bệnh tự trả.
