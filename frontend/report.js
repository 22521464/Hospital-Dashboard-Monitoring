const API_BASE = "http://127.0.0.1:5000";

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function levelMeta(level) {
    if (level === "positive") return { icon: "✅", label: "Tích cực",    cls: "finding-positive" };
    if (level === "warning")  return { icon: "⚠️", label: "Cần chú ý",  cls: "finding-warning"  };
    return                           { icon: "ℹ️", label: "Thông tin",  cls: "finding-info"     };
}

async function loadReport() {
    try {
        const data = await fetchJSON(`${API_BASE}/api/analysis/report`);

        // Timestamp
        setText("reportTimestamp", `Cập nhật lúc: ${data.generated_at?.slice(0, 19) || "--"}`);

        // Executive summary card
        const summaryCard = document.getElementById("execSummaryCard");
        summaryCard.style.display = "";
        setText("execSummaryText", data.executive_summary || "");

        const badges = document.getElementById("summaryBadges");
        badges.innerHTML = [
            { count: data.n_positive, label: "Tích cực",   cls: "badge-positive" },
            { count: data.n_warning,  label: "Cần chú ý",  cls: "badge-warning"  },
            { count: data.n_info,     label: "Thông tin",  cls: "badge-info"     },
        ].map(b => `<span class="report-badge ${b.cls}">${b.count} ${b.label}</span>`).join("");

        // Findings
        const container = document.getElementById("findingsContainer");
        container.innerHTML = (data.findings || []).map(f => {
            const m = levelMeta(f.level);
            return `
                <div class="finding-card ${m.cls}">
                    <div class="finding-header">
                        <span class="finding-icon">${m.icon}</span>
                        <div class="finding-title-group">
                            <span class="finding-number">Finding #${f.id}</span>
                            <h3 class="finding-title">${f.title}</h3>
                        </div>
                        <span class="finding-metric">${f.metric}</span>
                    </div>
                    <div class="finding-body">
                        <div class="finding-section">
                            <span class="finding-section-label">Phân tích</span>
                            <p>${f.explanation}</p>
                        </div>
                        <div class="finding-section finding-rec">
                            <span class="finding-section-label">Khuyến cáo</span>
                            <p>${f.recommendation}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

    } catch (err) {
        document.getElementById("reportBanner").style.display = "";
        setText("reportTimestamp", "Chưa có dữ liệu báo cáo.");
        console.error(err);
    }
}

document.addEventListener("DOMContentLoaded", loadReport);
