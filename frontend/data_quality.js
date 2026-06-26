const API_BASE = "http://127.0.0.1:5000";

const formatVND = (v) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v || 0);

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

let chartInstances = {};
function destroyChart(key) {
    if (chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; }
}

function statusBadge(count) {
    if (count === 0) return '<span class="badge badge-positive">Tốt</span>';
    if (count < 10)  return '<span class="badge badge-warning">Cần xem</span>';
    return '<span class="badge badge-warning" style="background:#ffebee;color:#c62828;">Cần sửa</span>';
}

async function loadDataQuality() {
    try {
        const data = await fetchJSON(`${API_BASE}/api/analysis/data-quality-report`);

        setText("dqTimestamp",     `Cập nhật lúc: ${data.generated_at?.slice(0, 19) || "--"}`);
        setText("dqTotalRecords",  Number(data.total_records || 0).toLocaleString("vi-VN"));

        const score = data.quality_score ?? 0;
        const scoreEl = document.getElementById("dqScore");
        if (scoreEl) {
            scoreEl.textContent = `${score.toFixed(1)} / 100`;
            scoreEl.style.color = score >= 90 ? "#2e7d32" : score >= 70 ? "#e65100" : "#c62828";
        }

        const s = data.summary || {};
        setText("dqMissingTotal", (s.total_missing  || 0).toLocaleString("vi-VN"));
        setText("dqOutlierTotal", (s.total_outliers || 0).toLocaleString("vi-VN"));
        setText("dqDupTotal",     (s.total_duplicates || 0).toLocaleString("vi-VN"));
        setText("dqInvalidTotal", (s.total_invalid  || 0).toLocaleString("vi-VN"));

        // Recommendations
        const recs = data.recommendations || [];
        const recsCard = document.getElementById("dqRecsCard");
        if (recsCard && recs.length) {
            recsCard.style.display = "";
            document.getElementById("dqRecsList").innerHTML =
                recs.map(r => `<li>${r}</li>`).join("");
        }

        // ── Missing bar chart ────────────────────────────────────────
        const missing = data.missing_by_column || [];
        destroyChart("dqMissingBar");
        chartInstances["dqMissingBar"] = new Chart(document.getElementById("dqMissingBarChart"), {
            type: "bar",
            data: {
                labels: missing.map(m => m.label),
                datasets: [{
                    label: "% Missing",
                    data: missing.map(m => m.pct),
                    backgroundColor: missing.map(m =>
                        m.pct === 0 ? "#43a047" : m.pct < 5 ? "#fb8c00" : "#e53935"
                    ),
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: ctx => `${ctx.raw.toFixed(2)}%` } } },
                scales: { y: { ticks: { callback: v => `${v}%` } } },
            },
        });

        // ── Missing trend chart ──────────────────────────────────────
        const trend = data.missing_trend || [];
        destroyChart("dqMissingTrend");
        chartInstances["dqMissingTrend"] = new Chart(document.getElementById("dqMissingTrendChart"), {
            type: "line",
            data: {
                labels: trend.map(t => t.THANG_NAM),
                datasets: [{
                    label: "% Missing tổng hợp",
                    data: trend.map(t => t.pct_missing),
                    borderColor: "#fb8c00",
                    backgroundColor: "rgba(251,140,0,0.08)",
                    borderWidth: 2,
                    pointRadius: 4,
                    fill: true,
                    tension: 0.3,
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: ctx => `${ctx.raw.toFixed(2)}%` } } },
                scales: { y: { ticks: { callback: v => `${v}%` } } },
            },
        });

        // ── Missing table ────────────────────────────────────────────
        const mTbody = document.querySelector("#dqMissingTable tbody");
        if (mTbody) {
            mTbody.innerHTML = missing.map(m => `
                <tr>
                    <td>${m.label}</td>
                    <td>${m.n_missing.toLocaleString("vi-VN")}</td>
                    <td>${m.pct.toFixed(2)}%</td>
                    <td>${statusBadge(m.n_missing)}</td>
                </tr>`).join("");
        }

        // ── Outliers ─────────────────────────────────────────────────
        const ol = data.outliers || {};
        setText("dqOutlierDesc",
            `IQR bounds: [${formatVND(ol.iqr_lower)} – ${formatVND(ol.iqr_upper)}]. ` +
            `Tổng ${ol.count || 0} giao dịch bất thường (${ol.pct || 0}%).`
        );
        const olTbody = document.querySelector("#dqOutlierTable tbody");
        if (olTbody) {
            const samples = ol.samples || [];
            olTbody.innerHTML = samples.length
                ? samples.map(r => `
                    <tr>
                        <td>${r.ID}</td>
                        <td>${r.NGAY}</td>
                        <td>${r.ID_BENHNHAN}</td>
                        <td>${r.TEN_KHOAPHONG || "—"}</td>
                        <td>${r.TEN_DICHVU || "—"}</td>
                        <td style="color:#c62828;font-weight:600">${formatVND(r.THANHTIEN)}</td>
                        <td>${typeof r.ZSCORE === "number" ? r.ZSCORE.toFixed(2) : "—"}</td>
                    </tr>`).join("")
                : `<tr><td colspan="7">Không phát hiện outlier.</td></tr>`;
        }

        // ── Duplicates ───────────────────────────────────────────────
        const dp = data.duplicates || {};
        const dpTbody = document.querySelector("#dqDupTable tbody");
        if (dpTbody) {
            const samples = dp.samples || [];
            dpTbody.innerHTML = samples.length
                ? samples.map(r => `
                    <tr>
                        <td>${r.ID}</td>
                        <td>${r.NGAY}</td>
                        <td>${r.ID_BENHNHAN}</td>
                        <td>${r.TEN_KHOAPHONG || "—"}</td>
                        <td>${r.TEN_DICHVU || "—"}</td>
                        <td>${r.SOLUONG}</td>
                        <td>${formatVND(r.THANHTIEN)}</td>
                    </tr>`).join("")
                : `<tr><td colspan="7">Không phát hiện bản ghi trùng lặp.</td></tr>`;
        }

        // ── Validation table ─────────────────────────────────────────
        const vTbody = document.querySelector("#dqValidationTable tbody");
        if (vTbody) {
            vTbody.innerHTML = (data.validation || []).map(v => `
                <tr>
                    <td>${v.check}</td>
                    <td>${v.count.toLocaleString("vi-VN")}</td>
                    <td>${v.pct.toFixed(2)}%</td>
                    <td>${statusBadge(v.count)}</td>
                </tr>`).join("");
        }

    } catch (err) {
        document.getElementById("dqBanner").style.display = "";
        setText("dqTimestamp", "Chưa có dữ liệu.");
        console.error(err);
    }
}

document.addEventListener("DOMContentLoaded", loadDataQuality);
