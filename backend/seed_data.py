import sqlite3

DB_PATH = "hospital.db"

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

khoaphong = [
    (1, "Khoa Khám bệnh", "Lâm sàng"),
    (2, "Khoa Nội tổng hợp", "Lâm sàng"),
    (3, "Khoa Ngoại", "Lâm sàng"),
    (4, "Khoa Cấp cứu", "Lâm sàng"),
    (5, "Khoa Xét nghiệm", "Cận lâm sàng"),
    (6, "Khoa Chẩn đoán hình ảnh", "Cận lâm sàng"),
    (7, "Khoa Dược", "Hậu cần"),
    (8, "Khoa Sản", "Lâm sàng"),
    (9, "Khoa Nhi", "Lâm sàng"),
    (10, "Khoa Hồi sức tích cực", "Lâm sàng")
]

dichvu = [
    (1, "Khám bệnh thường", "Khám bệnh", "Khám bệnh"),
    (2, "Khám cấp cứu", "Khám bệnh", "Khám bệnh"),
    (3, "Xét nghiệm máu", "Xét nghiệm", "Xét nghiệm"),
    (4, "Xét nghiệm nước tiểu", "Xét nghiệm", "Xét nghiệm"),
    (5, "X-quang", "Chẩn đoán hình ảnh", "Chẩn đoán hình ảnh"),
    (6, "Siêu âm", "Chẩn đoán hình ảnh", "Chẩn đoán hình ảnh"),
    (7, "CT Scanner", "Chẩn đoán hình ảnh", "Chẩn đoán hình ảnh"),
    (8, "Phẫu thuật loại 1", "Phẫu thuật", "Phẫu thuật / thủ thuật"),
    (9, "Thủ thuật điều trị", "Thủ thuật", "Phẫu thuật / thủ thuật"),
    (10, "Ngày giường nội trú", "Giường", "Giường bệnh"),
    (11, "Thuốc điều trị", "Thuốc", "Thuốc"),
    (12, "Vật tư y tế", "Vật tư", "Vật tư y tế")
]

doituong = [
    (1, "BHYT"),
    (2, "Dịch vụ"),
    (3, "Khác")
]

loai_dieutri = [
    (1, "Ngoại trú"),
    (2, "Nội trú"),
    (3, "Cấp cứu")
]

cursor.executemany(
    "INSERT OR IGNORE INTO DIM_KHOAPHONG VALUES (?, ?, ?)",
    khoaphong
)

cursor.executemany(
    "INSERT OR IGNORE INTO DIM_DICHVU VALUES (?, ?, ?, ?)",
    dichvu
)

cursor.executemany(
    "INSERT OR IGNORE INTO DIM_DOITUONG VALUES (?, ?)",
    doituong
)

cursor.executemany(
    "INSERT OR IGNORE INTO DIM_LOAI_DIEUTRI VALUES (?, ?)",
    loai_dieutri
)

conn.commit()
conn.close()

print("Master data inserted successfully.")
