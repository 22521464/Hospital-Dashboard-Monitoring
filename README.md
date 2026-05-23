# Hospital Dashboard Monitoring

Đây là một dự án dashboard giám sát hoạt động của bệnh viện, được xây dựng với backend bằng Flask (Python) và frontend bằng HTML/CSS/JavaScript. Dữ liệu được lưu trữ trong SQLite và có thể được khởi tạo từ các file CSV.

## Các chức năng chính

*   **Dashboard trực quan**: Hiển thị các chỉ số quan trọng về doanh thu, khoa phòng, dịch vụ qua các biểu đồ.
*   **Backend API**: Cung cấp các API endpoint để frontend có thể lấy dữ liệu đã được xử lý.
*   **Nhập liệu**: Giao diện cho phép nhập hoặc cập nhật dữ liệu (ví dụ: `data_entry.html`).
*   **Mô hình dữ liệu Star Schema**: Dữ liệu được tổ chức theo mô hình Kimball với các bảng Fact và Dimension, phù hợp cho việc phân tích.

## Công nghệ sử dụng

*   **Backend**:
    *   Python
    *   Flask
    *   Flask-CORS
    *   Pandas (dùng để xử lý và nạp dữ liệu từ CSV)
    *   SQLite
*   **Frontend**:
    *   HTML5
    *   CSS3
    *   JavaScript (với `charts.js` để vẽ biểu đồ)

## Hướng dẫn cài đặt và chạy dự án

### 1. Yêu cầu
*   Python 3.x
*   `pip`

### 2. Cài đặt
1.  **Clone repository:**
    ```bash
    git clone https://github.com/22521464/Hospital-Dashboard-Monitoring.git
    cd Hospital-Dashboard-Monitoring
    ```

2.  **Tạo và kích hoạt môi trường ảo (virtual environment):**
    *   Trên macOS/Linux:
        ```bash
        python3 -m venv venv
        source venv/bin/activate
        ```
    *   Trên Windows:
        ```bash
        python -m venv venv
        .\venv\Scripts\activate
        ```

3.  **Cài đặt các thư viện Python cần thiết:**
    ```bash
    pip install -r requirements.txt
    ```

### 3. Khởi tạo và nạp dữ liệu
*   Chạy các script sau trong thư mục `backend` để tạo database và nạp dữ liệu ban đầu từ các file CSV.
    ```bash
    cd backend
    python init_db.py
    python seed_data.py
    python seed_fact_data.py
    cd ..
    ```
    *Lưu ý: Các script này sẽ tạo file `hospital.db` và các bảng dữ liệu.*

### 4. Chạy ứng dụng
1.  **Chạy backend (Flask server):**
    ```bash
    python backend/app.py
    ```
    Server sẽ chạy ở địa chỉ `http://127.0.0.1:5000`.

2.  **Mở frontend:**
    *   Mở file `frontend/index.html` bằng trình duyệt. Bạn có thể dùng một extension như "Live Server" trong VS Code để tự động tải lại trang khi có thay đổi.

## Cấu trúc thư mục
```
.
├── backend/
│   ├── app.py              # Flask application
│   ├── database.py         # Logic kết nối DB
│   ├── hospital.db         # File SQLite database
│   ├── init_db.py          # Script tạo schema
│   ├── seed_data.py        # Script nạp dữ liệu dimension
│   ├── seed_fact_data.py   # Script nạp dữ liệu fact
│   └── data/               # Thư mục chứa file CSV
│       ├── DIM_DICHVU.csv
│       ├── DIM_DOITUONG.csv
│       ├── DIM_KHOAPHONG.csv
│       ├── DIM_THOIGIAN.csv
│       └── FACT_DOANHTHU.csv
├── frontend/
│   ├── charts.js           # Logic vẽ biểu đồ
│   ├── data_entry.html     # Trang nhập liệu
│   ├── data_entry.js       # Script cho trang nhập liệu
│   ├── index.html          # Trang dashboard chính
│   └── style.css           # CSS
└── requirements.txt        # Các thư viện Python
```