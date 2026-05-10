import sqlite3
import random
from datetime import datetime, timedelta

DB_PATH = "hospital.db"

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

random.seed(42)

start_date = datetime(2026, 1, 1)
end_date = datetime(2026, 5, 8)

khoaphong_ids = list(range(1, 11))
dichvu_ids = list(range(1, 13))
doituong_ids = [1, 2, 3]
loai_dieutri_ids = [1, 2, 3]

price_map = {
    1: 150000,
    2: 250000,
    3: 120000,
    4: 90000,
    5: 180000,
    6: 220000,
    7: 1200000,
    8: 8500000,
    9: 1500000,
    10: 500000,
    11: 300000,
    12: 250000
}

patient_count = 300

for i in range(1, patient_count + 1):
    id_benhnhan = f"BN{i:05d}"
    ho_ten = f"Bệnh nhân {i:05d}"
    gioi_tinh = random.choice(["Nam", "Nữ"])
    nam_sinh = random.randint(1950, 2020)

    cursor.execute("""
        INSERT OR IGNORE INTO DIM_BENHNHAN 
        (ID_BENHNHAN, HO_TEN, GIOI_TINH, NAM_SINH)
        VALUES (?, ?, ?, ?)
    """, (id_benhnhan, ho_ten, gioi_tinh, nam_sinh))

current_date = start_date

while current_date <= end_date:
    number_of_transactions = random.randint(25, 80)

    # Tạo vài ngày bất thường để dashboard có cảnh báo
    if current_date.day in [10, 22]:
        number_of_transactions = random.randint(5, 15)

    if current_date.day in [15, 28]:
        number_of_transactions = random.randint(90, 140)

    for _ in range(number_of_transactions):
        patient_id = random.randint(1, patient_count)
        id_benhnhan = f"BN{patient_id:05d}"
        id_khambenh = f"KB{current_date.strftime('%Y%m%d')}{random.randint(1000, 9999)}"

        id_khoaphong = random.choice(khoaphong_ids)
        id_dichvu = random.choice(dichvu_ids)
        id_doituong = random.choices(doituong_ids, weights=[60, 35, 5])[0]
        id_loai_dieutri = random.choices(loai_dieutri_ids, weights=[55, 30, 15])[0]

        soluong = random.randint(1, 3)
        dongia = price_map[id_dichvu] * random.uniform(0.9, 1.15)
        thanhtien = soluong * dongia

        if id_doituong == 1:
            ty_le_bhyt = random.choice([40, 60, 80])
        else:
            ty_le_bhyt = 0

        bhyttra = thanhtien * ty_le_bhyt / 100
        nguoibenhtra = thanhtien - bhyttra

        cursor.execute("""
            INSERT INTO FACT_DOANHTHU (
                NGAY, ID_BENHNHAN, ID_KHAMBENH, ID_KHOAPHONG,
                ID_DICHVU, ID_DOITUONG, ID_LOAI_DIEUTRI,
                SOLUONG, DONGIA, THANHTIEN, BHYTTRA, NGUOIBENHTRA
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            current_date.strftime("%Y-%m-%d"),
            id_benhnhan,
            id_khambenh,
            id_khoaphong,
            id_dichvu,
            id_doituong,
            id_loai_dieutri,
            soluong,
            round(dongia, 0),
            round(thanhtien, 0),
            round(bhyttra, 0),
            round(nguoibenhtra, 0)
        ))

    current_date += timedelta(days=1)

conn.commit()
conn.close()

print("Fact revenue data seeded successfully.")
