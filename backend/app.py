import os
import json
import sqlite3
import random
import pandas as pd
from datetime import datetime, timedelta
from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS

DB_PATH = os.path.join(os.path.dirname(__file__), "hospital.db")

app = Flask(__name__, static_folder="../frontend")
CORS(app)


@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/data-entry")
def serve_data_entry():
    return send_from_directory(app.static_folder, "data_entry.html")


# =====================================================
# Database helpers
# =====================================================

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def query_df(sql, params=None):
    conn = get_db_connection()
    df = pd.read_sql_query(sql, conn, params=params)
    conn.close()
    return df


def get_full_data():
    sql = """
        SELECT 
            f.ID,
            f.NGAY,
            f.ID_BENHNHAN,
            f.ID_KHAMBENH,
            f.ID_KHOAPHONG,
            f.ID_DICHVU,
            f.ID_DOITUONG,
            f.ID_LOAI_DIEUTRI,
            f.SOLUONG,
            f.DONGIA,
            f.THANHTIEN,
            f.BHYTTRA,
            f.NGUOIBENHTRA,
            f.CREATED_AT,
            k.TEN_KHOAPHONG,
            k.LOAI_KHOA,
            d.TEN_DICHVU,
            d.LOAI_DICHVU,
            d.NHOM_DICHVU,
            dt.TEN_DOITUONG,
            ldt.TEN_LOAI_DIEUTRI
        FROM FACT_DOANHTHU f
        LEFT JOIN DIM_KHOAPHONG k 
            ON f.ID_KHOAPHONG = k.ID_KHOAPHONG
        LEFT JOIN DIM_DICHVU d 
            ON f.ID_DICHVU = d.ID_DICHVU
        LEFT JOIN DIM_DOITUONG dt 
            ON f.ID_DOITUONG = dt.ID_DOITUONG
        LEFT JOIN DIM_LOAI_DIEUTRI ldt 
            ON f.ID_LOAI_DIEUTRI = ldt.ID_LOAI_DIEUTRI
    """

    df = query_df(sql)

    if not df.empty:
        df["NGAY"] = pd.to_datetime(df["NGAY"])

    return df


def apply_date_filter(df):
    if df.empty:
        return df

    start_date_str = request.args.get("startdate")
    end_date_str = request.args.get("enddate")
    preset = request.args.get("preset", "all")

    # Ensure NGAY is datetime
    if not pd.api.types.is_datetime64_any_dtype(df["NGAY"]):
        df["NGAY"] = pd.to_datetime(df["NGAY"], errors="coerce")

    max_date = df["NGAY"].max()
    if pd.isna(max_date):
        return df.iloc[0:0]

    max_date = max_date.normalize()

    if preset == "today":
        start_date = max_date
        end_date = max_date
    elif preset == "yesterday":
        start_date = max_date - timedelta(days=1)
        end_date = max_date - timedelta(days=1)
    elif preset == "7days":
        start_date = max_date - timedelta(days=6)
        end_date = max_date
    elif preset == "30days":
        start_date = max_date - timedelta(days=29)
        end_date = max_date
    elif preset == "custom" and start_date_str and end_date_str:
        start_date = pd.to_datetime(start_date_str, errors="coerce")
        end_date = pd.to_datetime(end_date_str, errors="coerce")
        if pd.isna(start_date) or pd.isna(end_date):
            return df.iloc[0:0]
    else:  # "all" or default
        return df

    # Normalize to date bounds
    start_date = pd.to_datetime(start_date).normalize()
    end_date = pd.to_datetime(end_date).normalize()

    if end_date < start_date:
        return df.iloc[0:0]

    return df[(df["NGAY"] >= start_date) & (df["NGAY"] <= end_date)]


def empty_response(default):
    return jsonify(default)


def calculate_data_quality(df):
    if df.empty:
        return {
            "total_rows": 0,
            "missing_ngay": 0,
            "missing_khoaphong": 0,
            "missing_dichvu": 0,
            "missing_doituong": 0,
            "negative_thanhtien": 0,
            "zero_revenue": 0,
            "unmapped_khoa": 0,
            "unmapped_dichvu": 0,
            "unmapped_doituong": 0,
            "unmapped_total": 0,
            "total_issues": 0,
            "quality_score": 100
        }

    total_rows = len(df)
    missing_ngay = int(df["NGAY"].isnull().sum())
    missing_khoaphong = int(df["ID_KHOAPHONG"].isnull().sum())
    missing_dichvu = int(df["ID_DICHVU"].isnull().sum())
    missing_doituong = int(df["ID_DOITUONG"].isnull().sum())
    negative_thanhtien = int((df["THANHTIEN"] < 0).sum())
    zero_revenue = int((df["THANHTIEN"] == 0).sum())

    unmapped_khoa = int((df["ID_KHOAPHONG"].notna() & df["TEN_KHOAPHONG"].isna()).sum())
    unmapped_dichvu_count = int((df["ID_DICHVU"].notna() & df["TEN_DICHVU"].isna()).sum())
    unmapped_doituong = int((df["ID_DOITUONG"].notna() & df["TEN_DOITUONG"].isna()).sum())
    unmapped_total = unmapped_khoa + unmapped_dichvu_count + unmapped_doituong

    total_issues = (
        missing_ngay +
        missing_khoaphong +
        missing_dichvu +
        missing_doituong +
        negative_thanhtien +
        zero_revenue +
        unmapped_total
    )

    if total_rows > 0:
        quality_score = max(0, (1 - (total_issues / total_rows)) * 100)
    else:
        quality_score = 100

    return {
        "total_rows": total_rows,
        "missing_ngay": missing_ngay,
        "missing_khoaphong": missing_khoaphong,
        "missing_dichvu": missing_dichvu,
        "missing_doituong": missing_doituong,
        "negative_thanhtien": negative_thanhtien,
        "zero_revenue": zero_revenue,
        "unmapped_khoa": unmapped_khoa,
        "unmapped_dichvu": unmapped_dichvu_count,
        "unmapped_doituong": unmapped_doituong,
        "unmapped_total": unmapped_total,
        "total_issues": total_issues,
        "quality_score": round(quality_score, 2)
    }


# =====================================================
# Frontend routes
# =====================================================

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/data-entry")
def data_entry_page():
    return send_from_directory(app.static_folder, "data_entry.html")


# =====================================================
# Master data API
# =====================================================

@app.route("/api/master-data")
def master_data():
    conn = get_db_connection()

    khoaphong = conn.execute("""
        SELECT * FROM DIM_KHOAPHONG
        ORDER BY ID_KHOAPHONG
    """).fetchall()

    dichvu = conn.execute("""
        SELECT * FROM DIM_DICHVU
        ORDER BY ID_DICHVU
    """).fetchall()

    doituong = conn.execute("""
        SELECT * FROM DIM_DOITUONG
        ORDER BY ID_DOITUONG
    """).fetchall()

    loai_dieutri = conn.execute("""
        SELECT * FROM DIM_LOAI_DIEUTRI
        ORDER BY ID_LOAI_DIEUTRI
    """).fetchall()

    conn.close()

    return jsonify({
        "khoaphong": [dict(row) for row in khoaphong],
        "dichvu": [dict(row) for row in dichvu],
        "doituong": [dict(row) for row in doituong],
        "loai_dieutri": [dict(row) for row in loai_dieutri]
    })


# =====================================================
# Data Entry API
# =====================================================

@app.route("/api/add-revenue", methods=["POST"])
def add_revenue():
    data = request.get_json()

    required_fields = [
        "ngay",
        "id_benhnhan",
        "id_khambenh",
        "id_khoaphong",
        "id_dichvu",
        "id_doituong",
        "id_loai_dieutri",
        "soluong",
        "dongia"
    ]

    for field in required_fields:
        if field not in data or data[field] in [None, ""]:
            return jsonify({
                "success": False,
                "message": f"Missing required field: {field}"
            }), 400

    try:
        ngay = data.get("ngay")
        id_benhnhan = data.get("id_benhnhan")
        id_khambenh = data.get("id_khambenh")
        id_khoaphong = int(data.get("id_khoaphong"))
        id_dichvu = int(data.get("id_dichvu"))
        id_doituong = int(data.get("id_doituong"))
        id_loai_dieutri = int(data.get("id_loai_dieutri"))
        soluong = int(data.get("soluong"))
        dongia = float(data.get("dongia"))
        ty_le_bhyt = float(data.get("ty_le_bhyt", 0))

        if soluong <= 0:
            return jsonify({
                "success": False,
                "message": "Số lượng phải lớn hơn 0"
            }), 400

        if dongia < 0:
            return jsonify({
                "success": False,
                "message": "Đơn giá không được âm"
            }), 400

        if ty_le_bhyt < 0 or ty_le_bhyt > 100:
            return jsonify({
                "success": False,
                "message": "Tỷ lệ BHYT phải nằm trong khoảng 0 đến 100"
            }), 400

        thanhtien = soluong * dongia
        bhyttra = thanhtien * ty_le_bhyt / 100
        nguoibenhtra = thanhtien - bhyttra

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT OR IGNORE INTO DIM_BENHNHAN 
            (ID_BENHNHAN, HO_TEN, GIOI_TINH, NAM_SINH)
            VALUES (?, ?, ?, ?)
        """, (
            id_benhnhan,
            data.get("ho_ten", "Bệnh nhân giả lập"),
            data.get("gioi_tinh", "Không rõ"),
            data.get("nam_sinh", None)
        ))

        cursor.execute("""
            INSERT INTO FACT_DOANHTHU (
                NGAY, ID_BENHNHAN, ID_KHAMBENH, ID_KHOAPHONG,
                ID_DICHVU, ID_DOITUONG, ID_LOAI_DIEUTRI,
                SOLUONG, DONGIA, THANHTIEN, BHYTTRA, NGUOIBENHTRA
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ngay,
            id_benhnhan,
            id_khambenh,
            id_khoaphong,
            id_dichvu,
            id_doituong,
            id_loai_dieutri,
            soluong,
            dongia,
            thanhtien,
            bhyttra,
            nguoibenhtra
        ))

        conn.commit()
        conn.close()

        return jsonify({
            "success": True,
            "message": "Thêm giao dịch doanh thu thành công",
            "thanhtien": thanhtien,
            "bhyttra": bhyttra,
            "nguoibenhtra": nguoibenhtra
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


@app.route("/api/generate-sample-transactions", methods=["POST"])
def generate_sample_transactions():
    data = request.get_json() or {}
    count = int(data.get("count", random.randint(50, 100)))
    ngay = data.get("ngay")

    if count < 1:
        count = 1
    if count > 300:
        count = 300

    conn = get_db_connection()
    cursor = conn.cursor()

    # If frontend doesn't send a date, use latest date in DB; if none, use current date
    if not ngay:
        row = cursor.execute(
            """
            SELECT MAX(NGAY) AS MAX_NGAY
            FROM FACT_DOANHTHU
            """
        ).fetchone()
        if row and row["MAX_NGAY"]:
            ngay = row["MAX_NGAY"]
        else:
            ngay = datetime.now().strftime("%Y-%m-%d")

    khoaphong_rows = cursor.execute(
        """
        SELECT ID_KHOAPHONG
        FROM DIM_KHOAPHONG
        """
    ).fetchall()
    dichvu_rows = cursor.execute(
        """
        SELECT ID_DICHVU
        FROM DIM_DICHVU
        """
    ).fetchall()
    doituong_rows = cursor.execute(
        """
        SELECT ID_DOITUONG
        FROM DIM_DOITUONG
        """
    ).fetchall()
    loai_dieutri_rows = cursor.execute(
        """
        SELECT ID_LOAI_DIEUTRI
        FROM DIM_LOAI_DIEUTRI
        """
    ).fetchall()

    khoaphong_ids = [row["ID_KHOAPHONG"] for row in khoaphong_rows]
    dichvu_ids = [row["ID_DICHVU"] for row in dichvu_rows]
    doituong_ids = [row["ID_DOITUONG"] for row in doituong_rows]
    loai_dieutri_ids = [row["ID_LOAI_DIEUTRI"] for row in loai_dieutri_rows]

    if not khoaphong_ids or not dichvu_ids or not doituong_ids or not loai_dieutri_ids:
        conn.close()
        return (
            jsonify(
                {
                    "success": False,
                    "message": "Thiếu dữ liệu danh mục. Hãy chạy seed_data.py trước."
                }
            ),
            400,
        )

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
        12: 250000,
    }

    inserted = 0

    for _ in range(count):
        random_patient_number = random.randint(10000, 99999)
        id_benhnhan = f"BN{random_patient_number}"
        ho_ten = f"Bệnh nhân mẫu {random_patient_number}"
        gioi_tinh = random.choice(["Nam", "Nữ"])
        nam_sinh = random.randint(1950, 2022)

        random_visit_number = random.randint(100000, 999999)
        clean_date = str(ngay).replace("-", "")
        id_khambenh = f"KB{clean_date}{random_visit_number}"

        id_khoaphong = random.choice(khoaphong_ids)

        # Light mapping so demo data looks more plausible
        if id_khoaphong == 5:
            id_dichvu = random.choice([3, 4])
        elif id_khoaphong == 6:
            id_dichvu = random.choice([5, 6, 7])
        elif id_khoaphong == 7:
            id_dichvu = random.choice([11, 12])
        elif id_khoaphong == 4:
            id_dichvu = random.choice([2, 3, 5, 9, 11, 12])
        elif id_khoaphong in [2, 3, 8, 9, 10]:
            id_dichvu = random.choice([1, 3, 5, 6, 8, 9, 10, 11, 12])
        else:
            id_dichvu = random.choice(dichvu_ids)

        id_doituong = random.choices(
            doituong_ids,
            weights=[60 if x == 1 else 35 if x == 2 else 5 for x in doituong_ids],
        )[0]

        id_loai_dieutri = random.choices(
            loai_dieutri_ids,
            weights=[55 if x == 1 else 30 if x == 2 else 15 for x in loai_dieutri_ids],
        )[0]

        soluong = random.randint(1, 3)
        base_price = price_map.get(id_dichvu, 200000)
        dongia = round(base_price * random.uniform(0.9, 1.2), 0)
        thanhtien = soluong * dongia

        if id_doituong == 1:
            ty_le_bhyt = random.choice([40, 60, 80])
        else:
            ty_le_bhyt = 0

        bhyttra = thanhtien * ty_le_bhyt / 100
        nguoibenhtra = thanhtien - bhyttra

        cursor.execute(
            """
            INSERT OR IGNORE INTO DIM_BENHNHAN 
            (ID_BENHNHAN, HO_TEN, GIOI_TINH, NAM_SINH)
            VALUES (?, ?, ?, ?)
            """,
            (
                id_benhnhan,
                ho_ten,
                gioi_tinh,
                nam_sinh,
            ),
        )

        cursor.execute(
            """
            INSERT INTO FACT_DOANHTHU (
                NGAY,
                ID_BENHNHAN,
                ID_KHAMBENH,
                ID_KHOAPHONG,
                ID_DICHVU,
                ID_DOITUONG,
                ID_LOAI_DIEUTRI,
                SOLUONG,
                DONGIA,
                THANHTIEN,
                BHYTTRA,
                NGUOIBENHTRA
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ngay,
                id_benhnhan,
                id_khambenh,
                id_khoaphong,
                id_dichvu,
                id_doituong,
                id_loai_dieutri,
                soluong,
                dongia,
                thanhtien,
                bhyttra,
                nguoibenhtra,
            ),
        )

        inserted += 1

    conn.commit()
    conn.close()

    return jsonify(
        {
            "success": True,
            "message": f"Đã tạo {inserted} giao dịch mẫu cho ngày {ngay}.",
            "inserted": inserted,
            "date": ngay,
        }
    )


# =====================================================
# Basic KPI APIs
# =====================================================

@app.route("/api/total-revenue")
def total_revenue():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return empty_response({"total_revenue": 0})

    total = float(df["THANHTIEN"].sum())

    return jsonify({
        "total_revenue": total
    })


@app.route("/api/total-patients")
def total_patients():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return empty_response({"total_patients": 0})

    total = int(df["ID_BENHNHAN"].nunique())
    return jsonify({"total_patients": total})


@app.route("/api/total-treatments")
def total_treatments():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return empty_response({"total_treatments": 0})

    total = int(df["ID_KHAMBENH"].nunique())
    return jsonify({"total_treatments": total})


@app.route("/api/revenue-fee")
def revenue_fee():
    df = get_full_data()

    if df.empty:
        return empty_response({"revenue_fee": 0})

    fee_types = [
        "Khám bệnh",
        "Giường",
        "Thủ thuật",
        "Phẫu thuật",
        "Chẩn đoán hình ảnh",
        "Xét nghiệm"
    ]

    total = float(df[df["LOAI_DICHVU"].isin(fee_types)]["THANHTIEN"].sum())

    return jsonify({
        "revenue_fee": total
    })


@app.route("/api/revenue-medicine")
def revenue_medicine():
    df = get_full_data()

    if df.empty:
        return empty_response({"revenue_medicine": 0})

    medicine_types = ["Thuốc", "Vật tư"]

    total = float(df[df["LOAI_DICHVU"].isin(medicine_types)]["THANHTIEN"].sum())

    return jsonify({
        "revenue_medicine": total
    })


# =====================================================
# Monitoring APIs
# =====================================================

@app.route("/api/monitoring-summary")
def monitoring_summary():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return jsonify({
            "latest_date": None,
            "total_revenue": 0,
            "today_revenue": 0,
            "month_revenue": 0,
            "avg_7d_revenue": 0,
            "change_vs_yesterday": 0,
            "change_vs_7d": 0,
            "system_status": "No Data",
            "alert_count": 0
        })

    daily = df.groupby("NGAY")["THANHTIEN"].sum().reset_index()
    daily = daily.sort_values("NGAY")

    latest = daily.iloc[-1]
    previous = daily.iloc[-2] if len(daily) >= 2 else latest

    latest_date = latest["NGAY"]
    latest_month = latest_date.month
    latest_year = latest_date.year

    month_df = df[
        (df["NGAY"].dt.month == latest_month) &
        (df["NGAY"].dt.year == latest_year)
    ]

    avg_7d = daily.tail(7)["THANHTIEN"].mean()

    if previous["THANHTIEN"] != 0:
        change_vs_yesterday = (
            (latest["THANHTIEN"] - previous["THANHTIEN"]) /
            previous["THANHTIEN"] * 100
        )
    else:
        change_vs_yesterday = 0

    if avg_7d != 0:
        change_vs_7d = (
            (latest["THANHTIEN"] - avg_7d) /
            avg_7d * 100
        )
    else:
        change_vs_7d = 0

    if change_vs_7d <= -30:
        status = "Critical"
    elif abs(change_vs_7d) >= 20:
        status = "Warning"
    else:
        status = "Normal"

    alert_count = 0
    if status in ["Critical", "Warning"]:
        alert_count += 1

    dq = calculate_data_quality(df)
    alert_count += dq["total_issues"]

    return jsonify({
        "latest_date": latest_date.strftime("%Y-%m-%d"),
        "total_revenue": float(df["THANHTIEN"].sum()),
        "today_revenue": float(latest["THANHTIEN"]),
        "month_revenue": float(month_df["THANHTIEN"].sum()),
        "avg_7d_revenue": float(avg_7d),
        "change_vs_yesterday": round(float(change_vs_yesterday), 2),
        "change_vs_7d": round(float(change_vs_7d), 2),
        "system_status": status,
        "alert_count": int(alert_count)
    })


@app.route("/api/revenue-daily-monitor")
def revenue_daily_monitor():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return jsonify([])

    daily = df.groupby("NGAY")["THANHTIEN"].sum().reset_index()
    daily = daily.sort_values("NGAY")

    daily["AVG_7D"] = daily["THANHTIEN"].rolling(window=7, min_periods=1).mean()
    daily["LOWER_THRESHOLD"] = daily["AVG_7D"] * 0.7
    daily["UPPER_THRESHOLD"] = daily["AVG_7D"] * 1.3

    def get_status(row):
        if row["THANHTIEN"] < row["LOWER_THRESHOLD"]:
            return "Critical"
        elif row["THANHTIEN"] > row["UPPER_THRESHOLD"]:
            return "Warning"
        return "Normal"

    daily["STATUS"] = daily.apply(get_status, axis=1)
    daily["NGAY"] = daily["NGAY"].dt.strftime("%Y-%m-%d")

    return jsonify(daily.to_dict(orient="records"))


@app.route("/api/alerts")
def alerts():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return jsonify([])

    alert_list = []

    daily = df.groupby("NGAY")["THANHTIEN"].sum().reset_index()
    daily = daily.sort_values("NGAY")
    daily["AVG_7D"] = daily["THANHTIEN"].rolling(window=7, min_periods=1).mean()

    daily["CHANGE_PERCENT"] = daily.apply(
        lambda row: ((row["THANHTIEN"] - row["AVG_7D"]) / row["AVG_7D"] * 100)
        if row["AVG_7D"] != 0 else 0,
        axis=1
    )

    latest = daily.iloc[-1]

    if latest["CHANGE_PERCENT"] <= -30:
        alert_list.append({
            "level": "Critical",
            "type": "Revenue Drop",
            "object": "Toàn bệnh viện",
            "message": "Doanh thu ngày gần nhất giảm mạnh so với trung bình 7 ngày.",
            "current_value": float(latest["THANHTIEN"]),
            "baseline_value": float(latest["AVG_7D"]),
            "change_percent": round(float(latest["CHANGE_PERCENT"]), 2),
            "date": latest["NGAY"].strftime("%Y-%m-%d")
        })

    if latest["CHANGE_PERCENT"] >= 30:
        alert_list.append({
            "level": "Warning",
            "type": "Revenue Spike",
            "object": "Toàn bệnh viện",
            "message": "Doanh thu ngày gần nhất tăng cao so với trung bình 7 ngày.",
            "current_value": float(latest["THANHTIEN"]),
            "baseline_value": float(latest["AVG_7D"]),
            "change_percent": round(float(latest["CHANGE_PERCENT"]), 2),
            "date": latest["NGAY"].strftime("%Y-%m-%d")
        })

    # Department alerts
    latest_date = df["NGAY"].max()
    dept_df = df.groupby(["NGAY", "TEN_KHOAPHONG"])["THANHTIEN"].sum().reset_index()

    for dept in dept_df["TEN_KHOAPHONG"].dropna().unique():
        one_dept = dept_df[dept_df["TEN_KHOAPHONG"] == dept].sort_values("NGAY")

        if len(one_dept) < 7:
            continue

        latest_dept = one_dept[one_dept["NGAY"] == latest_date]

        if latest_dept.empty:
            continue

        current_value = latest_dept["THANHTIEN"].iloc[0]
        baseline = one_dept.tail(7)["THANHTIEN"].mean()

        if baseline == 0:
            continue

        change_percent = (current_value - baseline) / baseline * 100

        if change_percent <= -40:
            alert_list.append({
                "level": "Critical",
                "type": "Department Revenue Drop",
                "object": dept,
                "message": f"Doanh thu {dept} giảm mạnh so với trung bình 7 ngày.",
                "current_value": float(current_value),
                "baseline_value": float(baseline),
                "change_percent": round(float(change_percent), 2),
                "date": latest_date.strftime("%Y-%m-%d")
            })

        elif change_percent >= 50:
            alert_list.append({
                "level": "Warning",
                "type": "Department Revenue Spike",
                "object": dept,
                "message": f"Doanh thu {dept} tăng cao so với trung bình 7 ngày.",
                "current_value": float(current_value),
                "baseline_value": float(baseline),
                "change_percent": round(float(change_percent), 2),
                "date": latest_date.strftime("%Y-%m-%d")
            })

    # Data quality alerts
    dq = calculate_data_quality(df)

    if dq["total_issues"] > 0:
        alert_list.append({
            "level": "Warning",
            "type": "Data Quality",
            "object": "Dữ liệu doanh thu",
            "message": f"Phát hiện {dq['total_issues']} vấn đề chất lượng dữ liệu.",
            "current_value": dq["total_issues"],
            "baseline_value": 0,
            "change_percent": 0,
            "date": latest["NGAY"].strftime("%Y-%m-%d")
        })

    return jsonify(alert_list)


@app.route("/api/department-monitoring")
def department_monitoring():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return jsonify([])

    debug = request.args.get("debug") in ["1", "true", "True", "yes"]

    latest_date = df["NGAY"].max().normalize()

    daily_dept = df.groupby(["NGAY", "TEN_KHOAPHONG"])["THANHTIEN"].sum().reset_index()

    # Build full date range for last 7 days (ending at latest_date)
    date_index = pd.date_range(latest_date - timedelta(days=6), latest_date, freq="D")
    window_dates = [d.strftime("%Y-%m-%d") for d in date_index]

    result = []

    for dept in daily_dept["TEN_KHOAPHONG"].dropna().unique():
        one_dept = daily_dept[daily_dept["TEN_KHOAPHONG"] == dept].set_index("NGAY").sort_index()

        # Reindex to include missing days as 0 so AVG_7D is based on the full 7-day window
        series_7d = one_dept.reindex(date_index)["THANHTIEN"].fillna(0)

        today_revenue = float(series_7d.iloc[-1])
        avg_7d = float(series_7d.mean())

        if avg_7d != 0:
            change_percent = (today_revenue - avg_7d) / avg_7d * 100
        else:
            change_percent = 0

        if change_percent <= -40:
            status = "Critical"
        elif abs(change_percent) >= 30:
            status = "Warning"
        else:
            status = "Normal"

        item = {
            "TEN_KHOAPHONG": dept,
            "TODAY_REVENUE": float(today_revenue),
            "AVG_7D": float(avg_7d),
            "CHANGE_PERCENT": round(float(change_percent), 2),
            "STATUS": status,
        }

        if debug:
            item.update(
                {
                    "LATEST_DATE": latest_date.strftime("%Y-%m-%d"),
                    "WINDOW_DATES": window_dates,
                    "WINDOW_VALUES": [float(x) for x in series_7d.values.tolist()],
                    "WINDOW_SUM": float(series_7d.sum()),
                    "AVG_MODE": "calendar_7d_including_zeros",
                }
            )

        result.append(item)

    result = sorted(result, key=lambda x: x["TODAY_REVENUE"], reverse=True)
    return jsonify(result)


@app.route("/api/service-monitoring")
def service_monitoring():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return jsonify([])

    debug = request.args.get("debug") in ["1", "true", "True", "yes"]

    latest_date = df["NGAY"].max().normalize()

    daily_service = df.groupby(["NGAY", "NHOM_DICHVU"])["THANHTIEN"].sum().reset_index()

    # Full date range for last 7 days
    date_index = pd.date_range(latest_date - timedelta(days=6), latest_date, freq="D")
    window_dates = [d.strftime("%Y-%m-%d") for d in date_index]

    result = []

    for service in daily_service["NHOM_DICHVU"].dropna().unique():
        one_service = daily_service[daily_service["NHOM_DICHVU"] == service].set_index("NGAY").sort_index()

        series_7d = one_service.reindex(date_index)["THANHTIEN"].fillna(0)

        today_revenue = float(series_7d.iloc[-1])
        avg_7d = float(series_7d.mean())

        if avg_7d != 0:
            change_percent = (today_revenue - avg_7d) / avg_7d * 100
        else:
            change_percent = 0

        if change_percent <= -40:
            status = "Critical"
        elif abs(change_percent) >= 30:
            status = "Warning"
        else:
            status = "Normal"

        item = {
            "NHOM_DICHVU": service,
            "TODAY_REVENUE": float(today_revenue),
            "AVG_7D": float(avg_7d),
            "CHANGE_PERCENT": round(float(change_percent), 2),
            "STATUS": status,
        }

        if debug:
            item.update(
                {
                    "LATEST_DATE": latest_date.strftime("%Y-%m-%d"),
                    "WINDOW_DATES": window_dates,
                    "WINDOW_VALUES": [float(x) for x in series_7d.values.tolist()],
                    "WINDOW_SUM": float(series_7d.sum()),
                    "AVG_MODE": "calendar_7d_including_zeros",
                }
            )

        result.append(item)

    result = sorted(result, key=lambda x: x["TODAY_REVENUE"], reverse=True)
    return jsonify(result)


@app.route("/api/payment-structure")
def payment_structure():
    df = get_full_data()

    if df.empty:
        return jsonify([])

    result = df.groupby("TEN_DOITUONG")["THANHTIEN"].sum().reset_index()
    result = result.sort_values("THANHTIEN", ascending=False)
    return jsonify(result.to_dict(orient="records"))


@app.route("/api/revenue-by-month")
def revenue_by_month():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return jsonify([])
    df["NAM"] = df["NGAY"].dt.year
    df["THANG"] = df["NGAY"].dt.month
    result = df.groupby(["NAM", "THANG"])["THANHTIEN"].sum().reset_index()
    result = result.sort_values(["NAM", "THANG"])
    result["label"] = result["THANG"].astype(str) + "-" + result["NAM"].astype(str)
    return jsonify(result.to_dict(orient="records"))


@app.route("/api/top-departments")
def top_departments():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return jsonify([])
    top5 = (
        df.groupby("TEN_KHOAPHONG")["THANHTIEN"]
        .sum()
        .sort_values(ascending=False)
        .head(5)
        .reset_index()
    )
    return jsonify(top5.to_dict(orient="records"))


@app.route("/api/revenue-by-treatment-type")
def revenue_by_treatment_type():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return jsonify([])
    result = (
        df.groupby("TEN_LOAI_DIEUTRI")
        .agg(
            THANHTIEN=("THANHTIEN", "sum"),
            SO_LUOT=("ID_KHAMBENH", "nunique")
        )
        .reset_index()
    )
    result["DOANH_THU_TRUNG_BINH"] = result.apply(
        lambda row: row["THANHTIEN"] / row["SO_LUOT"] if row["SO_LUOT"] != 0 else 0,
        axis=1
    )
    result = result.sort_values("THANHTIEN", ascending=False)

    total = result["THANHTIEN"].sum()
    result["PHAN_TRAM"] = (result["THANHTIEN"] / total * 100).round(1) if total > 0 else 0

    return jsonify(result.to_dict(orient="records"))


@app.route("/api/revenue-by-payment-method")
def revenue_by_payment_method():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return jsonify([])

    result = df.groupby("TEN_DOITUONG")["THANHTIEN"].sum().reset_index()
    result = result.sort_values("THANHTIEN", ascending=False)
    return jsonify(result.to_dict(orient="records"))


@app.route("/api/revenue-by-department")
def revenue_by_department():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return jsonify([])

    result = df.groupby("TEN_KHOAPHONG")["THANHTIEN"].sum().reset_index()
    result = result.sort_values("THANHTIEN", ascending=False)
    return jsonify(result.to_dict(orient="records"))


@app.route("/api/revenue-by-service-group")
def revenue_by_service_group():
    df = get_full_data()
    df = apply_date_filter(df)

    if df.empty:
        return jsonify([])

    result = (
        df.groupby("NHOM_DICHVU")["THANHTIEN"]
        .sum()
        .sort_values(ascending=False)
        .reset_index()
    )
    return jsonify(result.to_dict(orient="records"))




@app.route("/api/data-quality")
def data_quality():
    df = get_full_data()
    df = apply_date_filter(df)
    
    result = calculate_data_quality(df)
    return jsonify(result)


@app.route("/api/recent-transactions")
def recent_transactions():
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT 
            f.ID,
            f.NGAY,
            f.ID_BENHNHAN,
            f.ID_KHAMBENH,
            k.TEN_KHOAPHONG,
            d.TEN_DICHVU,
            d.NHOM_DICHVU,
            dt.TEN_DOITUONG,
            ldt.TEN_LOAI_DIEUTRI,
            f.SOLUONG,
            f.DONGIA,
            f.THANHTIEN,
            f.BHYTTRA,
            f.NGUOIBENHTRA,
            f.CREATED_AT
        FROM FACT_DOANHTHU f
        LEFT JOIN DIM_KHOAPHONG k 
            ON f.ID_KHOAPHONG = k.ID_KHOAPHONG
        LEFT JOIN DIM_DICHVU d 
            ON f.ID_DICHVU = d.ID_DICHVU
        LEFT JOIN DIM_DOITUONG dt 
            ON f.ID_DOITUONG = dt.ID_DOITUONG
        LEFT JOIN DIM_LOAI_DIEUTRI ldt 
            ON f.ID_LOAI_DIEUTRI = ldt.ID_LOAI_DIEUTRI
        ORDER BY f.ID DESC
        LIMIT 20
    """).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('../frontend', filename)


# =====================================================
# Analysis page & API
# =====================================================

ANALYSIS_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "analysis_output")


@app.route("/analysis")
def serve_analysis():
    return send_from_directory(app.static_folder, "analysis.html")


def _load_analysis_json(filename):
    path = os.path.join(ANALYSIS_OUTPUT_DIR, filename)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.route("/api/analysis/status")
def analysis_status():
    files = {
        "descriptive_stats": "descriptive_stats.json",
        "correlation_matrix": "correlation_matrix.json",
        "trend_analysis": "trend_analysis.json",
        "forecast": "forecast.json",
        "report": "report.json",
        "data_quality_report": "data_quality_report.json",
    }
    status = {}
    for key, fname in files.items():
        path = os.path.join(ANALYSIS_OUTPUT_DIR, fname)
        if os.path.exists(path):
            mtime = os.path.getmtime(path)
            status[key] = {
                "exists": True,
                "last_updated": datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S"),
            }
        else:
            status[key] = {"exists": False, "last_updated": None}
    return jsonify(status)


@app.route("/api/analysis/descriptive-stats")
def analysis_descriptive_stats():
    data = _load_analysis_json("descriptive_stats.json")
    if data is None:
        return jsonify({"error": "Chưa có dữ liệu. Hãy chạy notebook revenue_analysis.ipynb trước."}), 404
    return jsonify(data)


@app.route("/api/analysis/correlation")
def analysis_correlation():
    data = _load_analysis_json("correlation_matrix.json")
    if data is None:
        return jsonify({"error": "Chưa có dữ liệu. Hãy chạy notebook revenue_analysis.ipynb trước."}), 404
    return jsonify(data)


@app.route("/api/analysis/trend")
def analysis_trend():
    data = _load_analysis_json("trend_analysis.json")
    if data is None:
        return jsonify({"error": "Chưa có dữ liệu. Hãy chạy notebook revenue_analysis.ipynb trước."}), 404
    return jsonify(data)


@app.route("/api/analysis/forecast")
def analysis_forecast():
    data = _load_analysis_json("forecast.json")
    if data is None:
        return jsonify({"error": "Chưa có dữ liệu. Hãy chạy notebook forecasting.ipynb trước."}), 404
    return jsonify(data)


@app.route("/data-quality")
def serve_data_quality():
    return send_from_directory(app.static_folder, "data_quality.html")


@app.route("/api/analysis/data-quality-report")
def analysis_data_quality_report():
    data = _load_analysis_json("data_quality_report.json")
    if data is None:
        return jsonify({"error": "Chưa có dữ liệu. Hãy chạy notebook data_quality.ipynb trước."}), 404
    return jsonify(data)


@app.route("/report")
def serve_report():
    return send_from_directory(app.static_folder, "report.html")


@app.route("/api/analysis/report")
def analysis_report():
    data = _load_analysis_json("report.json")
    if data is None:
        return jsonify({"error": "Chưa có dữ liệu. Hãy chạy notebook report.ipynb trước."}), 404
    return jsonify(data)


# =====================================================
# Run app
# =====================================================
if __name__ == "__main__":
    app.run(debug=True)