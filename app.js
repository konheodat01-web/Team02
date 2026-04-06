// Validate Global Chart Setup
Chart.defaults.color = '#9CA3AF';
Chart.defaults.font.family = "'Inter', sans-serif";

// Mock Data
const dataStore = {
    weekly: {
        stats: [
            { id: 'website', title: 'Website đang chạy', value: '42', change: '+2', trend: 'vs tuần trước', isPositive: true, icon: 'globe' },
            { id: 'keyword', title: 'Từ khóa lên Top', value: '1,280', change: '+15%', trend: 'vs tuần trước', isPositive: true, icon: 'key' },
            { id: 'traffic', title: 'Lượt truy cập (Traffic)', value: '84.5K', change: '+8.2%', trend: 'vs tuần trước', isPositive: true, icon: 'users' },
            { id: 'click', title: 'Lượt Click', value: '12.4K', change: '-2.1%', trend: 'vs tuần trước', isPositive: false, icon: 'mouse-pointer-click' },
            { id: 'impression', title: 'Lượt hiển thị', value: '320.1K', change: '+12.5%', trend: 'vs tuần trước', isPositive: true, icon: 'eye' }
        ],
        mainChart: {
            labels: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'],
            traffic: [12000, 15000, 14000, 18000, 11000, 8000, 6500],
            clicks: [1800, 2400, 2100, 2900, 1500, 900, 800]
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
            { id: 'traffic', title: 'Lượt truy cập (Traffic)', value: '380.2K', change: '+18.4%', trend: 'vs tháng trước', isPositive: true, icon: 'users' },
            { id: 'click', title: 'Lượt Click', value: '55.8K', change: '+10.2%', trend: 'vs tháng trước', isPositive: true, icon: 'mouse-pointer-click' },
            { id: 'impression', title: 'Lượt hiển thị', value: '1.4M', change: '+22.5%', trend: 'vs tháng trước', isPositive: true, icon: 'eye' }
        ],
        mainChart: {
            labels: ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4'],
            traffic: [85000, 92000, 88000, 115200],
            clicks: [12400, 13800, 11500, 18100]
        },
        impressionChart: {
            labels: ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4'],
            data: [320000, 350000, 310000, 420000]
        }
    }
};

let mainChartInstance = null;
let impressionChartInstance = null;
let currentPeriod = 'weekly';

// Local Storage handler
function getCustomStats() {
    return JSON.parse(localStorage.getItem('customStats') || '{}');
}

function saveCustomStat(id, value) {
    const customStats = getCustomStats();
    customStats[id] = value;
    localStorage.setItem('customStats', JSON.stringify(customStats));
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Render Icons
    lucide.createIcons();

    // Initial render (Weekly)
    renderDashboard('weekly');

    // Filter Buttons Event
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active state
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            // Render new data
            currentPeriod = e.target.dataset.period;
            renderDashboard(currentPeriod);
        });
    });

    // Modal Events
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeModal);
    document.getElementById('saveEditBtn').addEventListener('click', saveManualData);
});

function renderDashboard(period) {
    const data = dataStore[period];
    renderCards(data.stats);
    renderCharts(data);
    lucide.createIcons();
}

function renderCards(stats) {
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = ''; // Clear previous
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
    const trafficGradient = mainCtx.createLinearGradient(0, 0, 0, 400);
    trafficGradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)'); // primary
    trafficGradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    mainChartInstance = new Chart(mainCtx, {
        type: 'line',
        data: {
            labels: data.mainChart.labels,
            datasets: [
                {
                    label: 'Traffic',
                    data: data.mainChart.traffic,
                    borderColor: '#6366F1',
                    backgroundColor: trafficGradient,
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Clicks',
                    data: data.mainChart.clicks,
                    borderColor: '#10B981', // success
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.4,
                    pointBackgroundColor: '#10B981',
                    yAxisID: 'y1'
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
                y: { type: 'linear', display: true, position: 'left', grid: { color: '#2D3748', drawBorder: false }, ticks: { callback: function(value) { return value >= 1000 ? value/1000 + 'k' : value; } } },
                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: function(value) { return value >= 1000 ? value/1000 + 'k' : value; } } }
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
            datasets: [{ label: 'Impressions', data: data.impressionChart.data, backgroundColor: barGradient, borderRadius: 6, borderSkipped: false }]
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
                y: { grid: { color: '#2D3748', drawBorder: false }, ticks: { callback: function(value) { return value >= 1000 ? value/1000 + 'k' : value; } } }
            }
        }
    });
}

// Modal Handlers
function openModal(id, title, currentValue) {
    document.getElementById('editCardId').value = id;
    document.getElementById('editCardName').innerText = title;
    document.getElementById('editValueInput').value = currentValue.replace(/,/g, '');
    document.getElementById('editModal').classList.add('active');
    document.getElementById('editValueInput').focus();
}

function closeModal() {
    document.getElementById('editModal').classList.remove('active');
}

function saveManualData() {
    const id = document.getElementById('editCardId').value;
    let value = document.getElementById('editValueInput').value.trim();
    
    // Add commas back if it's a raw number roughly
    if (!isNaN(value) && value !== '') {
        value = Number(value).toLocaleString('en-US');
    }
    
    if(value !== '') {
        saveCustomStat(id, value);
        renderDashboard(currentPeriod);
        closeModal();
    }
}

// GSC Integration
const CLIENT_ID = '910348783245-iu1mru28v684ds523abgnqe7bshs5ppd.apps.googleusercontent.com';
let tokenClient;

function initGoogleAuth() {
    if (typeof google === 'undefined') { setTimeout(initGoogleAuth, 500); return; }
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                fetchGSCData(tokenResponse.access_token);
                document.getElementById('gscLoginBtn').innerHTML = '<i data-lucide="check" style="width: 16px;"></i> Đã kết nối';
                document.getElementById('gscLoginBtn').classList.replace('btn-secondary', 'btn-primary');
                lucide.createIcons();
            }
        }
    });
    const loginBtn = document.getElementById('gscLoginBtn');
    if(loginBtn) {
        loginBtn.addEventListener('click', () => {
            if(CLIENT_ID === 'YOUR_CLIENT_ID_HERE') { alert('Bạn cần điền CLIENT_ID vào file app.js trước!'); return; }
            tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }
}

async function fetchGSCData(accessToken) {
    try {
        const siteRes = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', { headers: { Authorization: 'Bearer ' + accessToken } });
        const siteData = await siteRes.json();
        
        if(siteData.siteEntry && siteData.siteEntry.length > 0) {
            const targetSite = siteData.siteEntry[0].siteUrl;
            
            const today = new Date(); 
            const lastWeek = new Date(today); 
            lastWeek.setDate(lastWeek.getDate() - 7);
            const formatDate = (date) => date.toISOString().split('T')[0];
            
            const body = { startDate: formatDate(lastWeek), endDate: formatDate(today), dimensions: ['date'] };
            
            const statsRes = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(targetSite) + '/searchAnalytics/query', {
                method: 'POST', 
                headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, 
                body: JSON.stringify(body)
            });
            const statsData = await statsRes.json();
            
            let totalClicks = 0; let totalImp = 0;
            if(statsData.rows) { 
                statsData.rows.forEach(r => { 
                    totalClicks += r.clicks; 
                    totalImp += r.impressions; 
                }); 
            }
            
            // Format number using shorthand
            const clickText = totalClicks > 1000 ? (totalClicks/1000).toFixed(1) + 'K' : totalClicks;
            const impText = totalImp > 1000 ? (totalImp/1000).toFixed(1) + 'K' : totalImp;
            
            saveCustomStat('click', clickText); 
            saveCustomStat('impression', impText);
            
            renderDashboard(currentPeriod);
            alert('Đã tải thành công Clicks/Impressions từ tài khoản Search Console của bạn: ' + targetSite);
        } else { 
            alert('Tài khoản chưa có site Search Console!'); 
        }
    } catch (err) { 
        console.error(err); 
        alert('Lỗi lấy GSC Data! Vui lòng thao tác lại.'); 
    }
}

document.addEventListener('DOMContentLoaded', () => { initGoogleAuth(); });