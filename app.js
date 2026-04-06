// Validate Global Chart Setup
Chart.defaults.color = '#9CA3AF';
Chart.defaults.font.family = "'Inter', sans-serif";

let mainChartInstance = null;
let impressionChartInstance = null;
let currentPeriod = 'weekly';

// Global Data Storage for GSC
let globalGSCData = null; // Stores aggregated 60-day timeline { '2023-01-01': { clicks: 0, impressions: 0 } }
let isGscConnected = false;

// Mock Data structure (used when not logged in)
const dataStore = {
    weekly: {
        stats: [
            { id: 'website', title: 'Website đang chạy', value: '42', change: '+2', trend: 'vs tuần trước', isPositive: true, icon: 'globe' },
            { id: 'keyword', title: 'Từ khóa lên Top', value: '1,280', change: '+15%', trend: 'vs tuần trước', isPositive: true, icon: 'key' },
            { id: 'click', title: 'Lượt Click', value: '12.4K', change: '-2.1%', trend: 'vs tuần trước', isPositive: false, icon: 'mouse-pointer-click' },
            { id: 'impression', title: 'Lượt hiển thị', value: '320.1K', change: '+12.5%', trend: 'vs tuần trước', isPositive: true, icon: 'eye' }
        ],
        mainChart: {
            labels: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'],
            current: [1800, 2400, 2100, 2900, 1500, 900, 800],
            previous: [1500, 2000, 1800, 2200, 1300, 1100, 750]
        },
        impressionChart: {
            labels: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'],
            data: [42000, 56000, 48000, 62000, 39000, 41000, 32100]
        }
    },
    monthly: {
        stats: [
            { id: 'website', title: 'Website đang chạy', value: '45', change: '+5', trend: 'vs tháng trước', isPositive: true, icon: 'globe' },
            { id: 'keyword', title: 'Từ khóa lên Top', value: '1,420', change: '+25%', trend: 'vs tháng trước', isPositive: true, icon: 'key' },
            { id: 'click', title: 'Lượt Click', value: '55.8K', change: '+10.2%', trend: 'vs tháng trước', isPositive: true, icon: 'mouse-pointer-click' },
            { id: 'impression', title: 'Lượt hiển thị', value: '1.4M', change: '+22.5%', trend: 'vs tháng trước', isPositive: true, icon: 'eye' }
        ],
        mainChart: {
            labels: ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4'],
            current: [12400, 13800, 11500, 18100],
            previous: [10000, 11500, 9000, 15000]
        },
        impressionChart: {
            labels: ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4'],
            data: [320000, 350000, 310000, 420000]
        }
    }
};

// Local Storage handler for manual fields
function getCustomStats() {
    return JSON.parse(localStorage.getItem('customStats') || '{}');
}

function saveCustomStat(id, value) {
    const customStats = getCustomStats();
    customStats[id] = value;
    localStorage.setItem('customStats', JSON.stringify(customStats));
}

// Format numbers shorthand (e.g. 1.2K)
function formatShort(num) {
    if(num >= 1000000) return (num/1000000).toFixed(1) + 'M';
    if(num >= 1000) return (num/1000).toFixed(1) + 'K';
    return num.toLocaleString('en-US');
}

// Calculate percentage change
function calcChange(current, previous) {
    if(previous === 0) return current > 0 ? '+100%' : '0%';
    const pct = ((current - previous) / previous) * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
}

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    renderDashboard('weekly');

    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentPeriod = e.target.dataset.period;
            renderDashboard(currentPeriod);
        });
    });

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeModal);
    document.getElementById('saveEditBtn').addEventListener('click', saveManualData);
});

function renderDashboard(period) {
    if(isGscConnected && globalGSCData) {
        processAndRenderRealData(period);
    } else {
        // Render Mock Data
        const data = dataStore[period];
        renderCards(data.stats);
        renderCharts(data);
        lucide.createIcons();
    }
}

// Process Real GSC Data dynamically
function processAndRenderRealData(period) {
    // Generate dates sequentially from today backwards
    const dates = [];
    for(let i = 0; i < 60; i++) {
        let d = new Date();
        d.setDate(d.getDate() - i);
        dates.unshift(d.toISOString().split('T')[0]); // Ascending order
    }

    // Prepare variables based on period
    const isWeekly = (period === 'weekly');
    const rangeSize = isWeekly ? 7 : 30;
    
    // Arrays for charting
    const currentDates = dates.slice(-rangeSize);
    const previousDates = dates.slice(-(rangeSize * 2), -rangeSize);

    let currentClicksObj = [];
    let previousClicksObj = [];
    let currentImpsObj = [];

    // Tally up
    let totalCurClicks = 0, totalPrevClicks = 0;
    let totalCurImp = 0, totalPrevImp = 0;

    // Current Range calculation
    currentDates.forEach(dt => {
        const item = globalGSCData[dt] || { clicks: 0, impressions: 0 };
        currentClicksObj.push(item.clicks);
        currentImpsObj.push(item.impressions);
        totalCurClicks += item.clicks;
        totalCurImp += item.impressions;
    });

    // Previous Range calculation
    previousDates.forEach(dt => {
        const item = globalGSCData[dt] || { clicks: 0, impressions: 0 };
        previousClicksObj.push(item.clicks);
        totalPrevClicks += item.clicks;
        totalPrevImp += item.impressions;
    });

    // Generate Chart Labels (e.g., remove year for brevity)
    const chartLabels = currentDates.map(dt => dt.substring(5).replace('-','/'));

    // Construct the stats array
    const trendStr = isWeekly ? 'vs tuần trước' : 'vs tháng trước';
    const clickChange = calcChange(totalCurClicks, totalPrevClicks);
    const impChange = calcChange(totalCurImp, totalPrevImp);

    const stats = [
        { id: 'website', title: 'Website đang chạy', value: '42', change: '+2', trend: trendStr, isPositive: true, icon: 'globe' },
        { id: 'keyword', title: 'Từ khóa lên Top', value: '1,280', change: '+15%', trend: trendStr, isPositive: true, icon: 'key' },
        { id: 'click_real', title: 'Lượt Click', value: formatShort(totalCurClicks), change: clickChange, trend: trendStr, isPositive: totalCurClicks >= totalPrevClicks, icon: 'mouse-pointer-click' },
        { id: 'impression_real', title: 'Lượt hiển thị', value: formatShort(totalCurImp), change: impChange, trend: trendStr, isPositive: totalCurImp >= totalPrevImp, icon: 'eye' }
    ];

    const chartData = {
        mainChart: {
            labels: chartLabels,
            current: currentClicksObj,
            previous: previousClicksObj
        },
        impressionChart: {
            labels: chartLabels,
            data: currentImpsObj
        }
    };

    renderCards(stats);
    renderCharts(chartData);
    lucide.createIcons();
}

function renderCards(stats) {
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = ''; 
    const customStats = getCustomStats();

    stats.forEach(stat => {
        const changeClass = stat.isPositive ? 'positive' : 'negative';
        const changeIcon = stat.isPositive ? 'trending-up' : 'trending-down';
        
        // Retrieve custom manual value if exists
        const displayValue = customStats[stat.id] !== undefined ? customStats[stat.id] : stat.value;
        
        const canEdit = (stat.id === 'website' || stat.id === 'keyword');
        const editBtnHTML = canEdit 
            ? `<button class="edit-btn" onclick="openModal('${stat.id}', '${stat.title}', '${displayValue}')"><i data-lucide="edit-2" style="width: 14px; height: 14px;"></i></button>`
            : '';

        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `
            <div class="stat-header">
                <div class="flex-row-center">
                    <span>${stat.title}</span>
                    ${editBtnHTML}
                </div>
                <i data-lucide="${stat.icon}" class="stat-icon"></i>
            </div>
            <div class="stat-value">${displayValue}</div>
            <div class="stat-footer">
                <span class="stat-change ${changeClass}">
                    <i data-lucide="${changeIcon}" style="width: 14px; height: 14px;"></i>
                    ${stat.change}
                </span>
                <span class="trend-text">${stat.trend}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderCharts(data) {
    if(mainChartInstance) mainChartInstance.destroy();
    if(impressionChartInstance) impressionChartInstance.destroy();

    const mainCtx = document.getElementById('mainChart').getContext('2d');
    const primaryGradient = mainCtx.createLinearGradient(0, 0, 0, 400);
    primaryGradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)'); // Indigo
    primaryGradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    mainChartInstance = new Chart(mainCtx, {
        type: 'line',
        data: {
            labels: data.mainChart.labels,
            datasets: [
                {
                    label: 'Clicks Kỳ Này',
                    data: data.mainChart.current,
                    borderColor: '#6366F1',
                    backgroundColor: primaryGradient,
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Clicks Kỳ Trước',
                    data: data.mainChart.previous,
                    borderColor: '#6B7280', // Gray dashed
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.4,
                    pointRadius: 0,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true } },
                tooltip: { backgroundColor: '#1C2433', titleColor: '#F3F4F6', bodyColor: '#D1D5DB', borderColor: '#2D3748', borderWidth: 1, padding: 12 }
            },
            scales: {
                x: { grid: { color: '#2D3748', drawBorder: false } },
                y: { type: 'linear', display: true, position: 'left', grid: { color: '#2D3748', drawBorder: false }, ticks: { callback: function(value) { return value >= 1000 ? (value/1000).toFixed(1) + 'k' : value; } } }
            }
        }
    });

    const impCtx = document.getElementById('impressionChart').getContext('2d');
    const barGradient = impCtx.createLinearGradient(0, 0, 0, 400);
    barGradient.addColorStop(0, '#8B5CF6'); // Purple
    barGradient.addColorStop(1, '#6366F1'); // Indigo

    impressionChartInstance = new Chart(impCtx, {
        type: 'bar',
        data: {
            labels: data.impressionChart.labels,
            datasets: [{ label: 'Lượt hiển thị (Kỳ Này)', data: data.impressionChart.data, backgroundColor: barGradient, borderRadius: 6, borderSkipped: false }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#1C2433', titleColor: '#F3F4F6', bodyColor: '#D1D5DB', borderColor: '#2D3748', borderWidth: 1, padding: 12 }
            },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { color: '#2D3748', drawBorder: false }, ticks: { callback: function(value) { return value >= 1000 ? (value/1000).toFixed(1) + 'k' : value; } } }
            }
        }
    });
}

function openModal(id, title, currentValue) {
    document.getElementById('editCardId').value = id;
    document.getElementById('editCardName').innerText = title;
    document.getElementById('editValueInput').value = String(currentValue).replace(/,/g, '');
    document.getElementById('editModal').classList.add('active');
    document.getElementById('editValueInput').focus();
}

function closeModal() {
    document.getElementById('editModal').classList.remove('active');
}

function saveManualData() {
    const id = document.getElementById('editCardId').value;
    let value = document.getElementById('editValueInput').value.trim();
    if (!isNaN(value) && value !== '') {
        value = Number(value).toLocaleString('en-US');
    }
    if(value !== '') {
        saveCustomStat(id, value);
        renderDashboard(currentPeriod);
        closeModal();
    }
}

// --- GSC API LOGIC ---
const CLIENT_ID = '910348783245-iu1mru28v684ds523abgnqe7bshs5ppd.apps.googleusercontent.com';
let tokenClient;

function setLoginState(isLoading) {
    const btn = document.getElementById('gscLoginBtn');
    if (!btn) return;
    if (isLoading) {
        btn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 16px;"></i> Đang tải dữ liệu...';
        btn.classList.add('disabled');
        btn.disabled = true;
    } else {
        btn.innerHTML = '<i data-lucide="check" style="width: 16px;"></i> Đã kết nối';
        btn.classList.remove('disabled');
        btn.classList.replace('btn-secondary', 'btn-primary');
        btn.disabled = false;
        isGscConnected = true;
    }
    lucide.createIcons();
}

function initGoogleAuth() {
    if (typeof google === 'undefined') { setTimeout(initGoogleAuth, 500); return; }
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        prompt: '',
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                localStorage.setItem('gsc_token', tokenResponse.access_token);
                localStorage.setItem('gsc_token_expiry', Date.now() + (3500 * 1000));
                fetchGSCData(tokenResponse.access_token, false);
            }
        }
    });

    const loginBtn = document.getElementById('gscLoginBtn');
    if(loginBtn) {
        loginBtn.addEventListener('click', () => {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    const savedToken = localStorage.getItem('gsc_token');
    const expiry = localStorage.getItem('gsc_token_expiry');
    if (savedToken && expiry && Date.now() < parseInt(expiry)) {
        fetchGSCData(savedToken, true);
    }
}

async function fetchGSCData(accessToken, isSilent = false) {
    try {
        setLoginState(true);
        const siteRes = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', { headers: { Authorization: 'Bearer ' + accessToken } });
        
        if(siteRes.status === 401) {
            localStorage.removeItem('gsc_token');
            const btn = document.getElementById('gscLoginBtn');
            btn.innerHTML = '<i data-lucide="log-in" style="width: 16px;"></i> Kết nối GSC';
            btn.classList.replace('btn-primary', 'btn-secondary');
            btn.disabled = false;
            lucide.createIcons();
            if(!isSilent) alert('Phiên đăng nhập GSC đã hết hạn. Vui lòng kết nối lại!');
            return;
        }

        const siteData = await siteRes.json();
        const targetDomains = [
            'vidcogroup.com', 'kuromi.vn', 'tranhalinh.org', 'duyhoang.vn', 'dulich24h.net',
            'duansungroups.com', 'dadiland.com', 'thanhhungtrans.com', 'cafelegend.vn',
            'healthpark.com.vn', 'banmat.vn', 'gamingpcguru.com', 'quanche.vn',
            'lynkcohanoi5s.com', 'lynkcotoanquoc.com', 'zeekrvietnams.vn', 'nuocmamvn.vn'
        ];
        
        const matchedSites = siteData.siteEntry ? siteData.siteEntry.filter(entry => targetDomains.some(domain => entry.siteUrl.includes(domain))) : [];

        if(matchedSites.length === 0) {
            setLoginState(false);
            if(!isSilent) alert('Không tìm thấy domain nào khớp!');
            return;
        }

        // Lấy biên độ 60 ngày
        const endDt = new Date(); 
        const startDt = new Date(endDt); 
        startDt.setDate(startDt.getDate() - 59); // 60 days included

        const formatDate = (date) => date.toISOString().split('T')[0];
        const bodyStyle = { startDate: formatDate(startDt), endDate: formatDate(endDt), dimensions: ['date'] };

        // Khởi tạo globalGSCData rỗng
        let aggregated = {};
        for(let i=0; i<60; i++) {
            let d = new Date(); d.setDate(d.getDate() - i);
            aggregated[formatDate(d)] = { clicks: 0, impressions: 0 };
        }

        // Parallel Requests
        await Promise.all(matchedSites.map(async (siteObj) => {
            try {
                const statsRes = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteObj.siteUrl) + '/searchAnalytics/query', {
                    method: 'POST', 
                    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(bodyStyle)
                });
                const statsData = await statsRes.json();
                if(statsData.rows) { 
                    statsData.rows.forEach(r => { 
                        const dateStr = r.keys[0]; // "YYYY-MM-DD"
                        if(aggregated[dateStr]) {
                            aggregated[dateStr].clicks += r.clicks; 
                            aggregated[dateStr].impressions += r.impressions; 
                        }
                    }); 
                }
            } catch(e) { console.error('Lỗi khi tải:', siteObj.siteUrl); }
        }));
        
        globalGSCData = aggregated;
        setLoginState(false);
        renderDashboard(currentPeriod);
        
        if(!isSilent) alert(`Hoàn tất đồng bộ dữ liệu thời gian thực từ ${matchedSites.length} websites!`);
    } catch (err) { 
        console.error(err); 
        setLoginState(false);
        if(!isSilent) alert('Lỗi tải dữ liệu. Vui lòng F5 thử lại.'); 
    }
}

document.addEventListener('DOMContentLoaded', () => { initGoogleAuth(); });