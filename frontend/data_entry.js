const API_BASE = "http://127.0.0.1:5000";

const priceMap = {
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
};

const formatVND = (value) => {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(value || 0);
};

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, options);

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `API error: ${url}`);
    }

    return response.json();
}

function fillSelect(selectId, data, valueField, textField) {
    const select = document.getElementById(selectId);

    data.forEach(item => {
        const option = document.createElement("option");
        option.value = item[valueField];
        option.textContent = item[textField];
        select.appendChild(option);
    });
}

async function loadMasterData() {
    const data = await fetchJSON(`${API_BASE}/api/master-data`);

    fillSelect("id_khoaphong", data.khoaphong, "ID_KHOAPHONG", "TEN_KHOAPHONG");
    fillSelect("id_dichvu", data.dichvu, "ID_DICHVU", "TEN_DICHVU");
    fillSelect("id_doituong", data.doituong, "ID_DOITUONG", "TEN_DOITUONG");
    fillSelect("id_loai_dieutri", data.loai_dieutri, "ID_LOAI_DIEUTRI", "TEN_LOAI_DIEUTRI");
}

function generateDefaultIds() {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const randomPatient = Math.floor(Math.random() * 90000) + 10000;
    const randomVisit = Math.floor(Math.random() * 9000) + 1000;

    document.getElementById("ngay").value = `${yyyy}-${mm}-${dd}`;
    document.getElementById("id_benhnhan").value = `BN${randomPatient}`;
    document.getElementById("id_khambenh").value = `KB${yyyy}${mm}${dd}${randomVisit}`;
}

function updatePreview() {
    const soluong = Number(document.getElementById("soluong").value || 0);
    const dongia = Number(document.getElementById("dongia").value || 0);

    const thanhtien = soluong * dongia;

    document.getElementById("previewThanhtien").textContent = formatVND(thanhtien);
}

function setupAutoPrice() {
    const serviceSelect = document.getElementById("id_dichvu");
    const priceInput = document.getElementById("dongia");

    serviceSelect.addEventListener("change", () => {
        const serviceId = Number(serviceSelect.value);

        if (priceMap[serviceId]) {
            priceInput.value = priceMap[serviceId];
        }

        updatePreview();
    });
}

function setupPaymentBehavior() {
    const paymentSelect = document.getElementById("id_doituong");
    const bhytInput = document.getElementById("ty_le_bhyt");

    paymentSelect.addEventListener("change", () => {
        const selectedPayment = Number(paymentSelect.value);

        if (selectedPayment === 1) {
            bhytInput.value = 80;
        } else {
            bhytInput.value = 0;
        }
    });
}

function setupPreviewEvents() {
    document.getElementById("soluong").addEventListener("input", updatePreview);
    document.getElementById("dongia").addEventListener("input", updatePreview);
}

function showMessage(message, type = "success") {
    const messageEl = document.getElementById("formMessage");

    messageEl.textContent = message;
    messageEl.className = `form-message ${type}`;
}

async function submitRevenueForm(event) {
    event.preventDefault();

    const payload = {
        ngay: document.getElementById("ngay").value,
        id_benhnhan: document.getElementById("id_benhnhan").value,
        ho_ten: document.getElementById("ho_ten").value || "Bệnh nhân giả lập",
        gioi_tinh: document.getElementById("gioi_tinh").value,
        nam_sinh: document.getElementById("nam_sinh").value || null,
        id_khambenh: document.getElementById("id_khambenh").value,
        id_khoaphong: document.getElementById("id_khoaphong").value,
        id_dichvu: document.getElementById("id_dichvu").value,
        id_doituong: document.getElementById("id_doituong").value,
        id_loai_dieutri: document.getElementById("id_loai_dieutri").value,
        soluong: document.getElementById("soluong").value,
        dongia: document.getElementById("dongia").value,
        ty_le_bhyt: document.getElementById("ty_le_bhyt").value || 0
    };

    try {
        const result = await fetchJSON(`${API_BASE}/api/add-revenue`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        showMessage(
            `Lưu thành công. Thành tiền: ${formatVND(result.thanhtien)}, BHYT trả: ${formatVND(result.bhyttra)}, Người bệnh trả: ${formatVND(result.nguoibenhtra)}.`,
            "success"
        );

        document.getElementById("revenueForm").reset();

        generateDefaultIds();
        updatePreview();
        loadRecentTransactions();

    } catch (error) {
        console.error(error);
        showMessage(`Lỗi: ${error.message}`, "error");
    }
}


async function loadRecentTransactions() {
    const tbody = document.getElementById("recentTransactionBody");

    try {
        const data = await fetchJSON(`${API_BASE}/api/recent-transactions`);

        if (!data.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5">Chưa có giao dịch nào.</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${item.NGAY}</td>
                <td>${item.ID_BENHNHAN}</td>
                <td>${item.TEN_KHOAPHONG || "--"}</td>
                <td>${item.TEN_DICHVU || "--"}</td>
                <td>${formatVND(item.THANHTIEN)}</td>
            </tr>
        `).join("");

    } catch (error) {
        console.error(error);

        tbody.innerHTML = `
            <tr>
                <td colspan="5">Không thể tải giao dịch mới nhất.</td>
            </tr>
        `;
    }
}


function setupFormSubmit() {
    const form = document.getElementById("revenueForm");

    form.addEventListener("submit", submitRevenueForm);

    form.addEventListener("reset", () => {
        setTimeout(() => {
            generateDefaultIds();
            updatePreview();

            const messageEl = document.getElementById("formMessage");
            messageEl.textContent = "";
            messageEl.className = "form-message";
        }, 0);
    });
}

async function generateSampleTransactions() {
    const sampleCountInput = document.getElementById("sampleCount");
    const count = Number(sampleCountInput?.value || 100);
    const ngay = document.getElementById("ngay")?.value;

    if (!ngay) {
        showMessage("Vui lòng chọn ngày phát sinh trước khi tạo giao dịch mẫu.", "error");
        return;
    }

    if (!Number.isFinite(count) || count < 1 || count > 300) {
        showMessage("Số lượng giao dịch mẫu phải nằm trong khoảng 1 đến 300.", "error");
        return;
    }

    const includeDirty = document.getElementById("includeDirty")?.checked ?? false;
    const dirtyRate = includeDirty ? 0.04 : 0;
    const dirtyNote = includeDirty ? " (gồm ~4% bản ghi lỗi mô phỏng)" : "";

    const confirmed = confirm(`Bạn có chắc muốn tạo ${count} giao dịch mẫu cho ngày ${ngay}${dirtyNote}?`);
    if (!confirmed) {
        return;
    }

    try {
        showMessage("Đang tạo giao dịch mẫu, vui lòng chờ...", "success");

        const result = await fetchJSON(`${API_BASE}/api/generate-sample-transactions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                count,
                ngay,
                dirty_rate: dirtyRate
            })
        });

        showMessage(result.message, "success");
        await loadRecentTransactions();
    } catch (error) {
        console.error(error);
        showMessage(`Lỗi khi tạo giao dịch mẫu: ${error.message}`, "error");
    }
}

function setupGenerateSampleButton() {
    const generateSampleBtn = document.getElementById("generateSampleBtn");
    if (!generateSampleBtn) {
        return;
    }

    generateSampleBtn.addEventListener("click", generateSampleTransactions);
}


document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadMasterData();

        generateDefaultIds();
        setupAutoPrice();
        setupPaymentBehavior();
        setupPreviewEvents();
        setupFormSubmit();
        setupGenerateSampleButton();
        updatePreview();
        loadRecentTransactions();

    } catch (error) {
        console.error(error);
        showMessage("Không thể khởi tạo form. Kiểm tra backend Flask đã chạy chưa.", "error");
    }
});
