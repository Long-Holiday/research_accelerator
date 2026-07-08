let currentDate = '';
let availableDates = [];
let paperData = {};
let flatpickrInstance = null;
let isRangeMode = true;
let allPapersData = [];
let selectedCategory = 'All';

const CATEGORY_NAMES = {
  'cs.CV': '计算机视觉 (Computer Vision)',
  'cs.CL': '自然语言处理 (Natural Language Processing)',
  'cs.LG': '机器学习 (Machine Learning)',
  'cs.AI': '人工智能 (Artificial Intelligence)',
  'cs.NE': '神经网络 (Neural Computing)',
  'cs.RO': '机器人 (Robotics)',
  'cs.IR': '信息检索 (Information Retrieval)',
  'cs.HC': '人机交互 (Human-Computer Interaction)',
  'cs.CY': '计算与社会 (Computers and Society)',
  'cs.CR': '加密与安全 (Cryptography and Security)',
  'cs.DS': '数据结构与算法 (Data Structures)',
  'cs.DB': '数据库 (Databases)',
  'cs.SE': '软件工程 (Software Engineering)',
  'cs.MA': '多智能体系统 (Multiagent Systems)'
};

document.addEventListener('DOMContentLoaded', () => {
  // Check screen size
  const checkScreenSize = () => {
    if (window.innerWidth < 768) {
      const warningModal = document.createElement('div');
      warningModal.className = 'screen-size-warning';
      warningModal.innerHTML = `
        <div class="warning-content">
          <h3>⚠️ Screen Size Notice</h3>
          <p>We've detected that you're using a device with a small screen. For the best data visualization experience, we recommend viewing this statistics page on a larger screen device (such as a tablet or computer).</p>
          <button onclick="this.parentElement.parentElement.remove()">Got it</button>
        </div>
      `;
      document.body.appendChild(warningModal);
    }
  };

  checkScreenSize();
  // Recheck on window resize
  window.addEventListener('resize', checkScreenSize);

  initEventListeners();
  fetchGitHubStats();
  
  fetchAvailableDates().then(() => {
    if (availableDates.length > 0) {
      const latestDateStr = availableDates[0];
      const latestDate = new Date(latestDateStr);
      const oneMonthAgo = new Date(latestDate);
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
      
      const oneMonthAgoStr = oneMonthAgo.getFullYear() + "-" + 
                             String(oneMonthAgo.getMonth() + 1).padStart(2, '0') + "-" + 
                             String(oneMonthAgo.getDate()).padStart(2, '0');
                             
      const datesInRange = availableDates.filter(d => d >= oneMonthAgoStr && d <= latestDateStr);
      const startDateStr = datesInRange.length > 0 ? datesInRange[datesInRange.length - 1] : latestDateStr;
      
      loadPapersByDateRange(startDateStr, latestDateStr);
    }
  });
});


async function fetchGitHubStats() {
  try {
    const response = await fetch('https://api.github.com/repos/dw-dengwei/daily-arXiv-ai-enhanced');
    const data = await response.json();
    const starCount = data.stargazers_count;
    const forkCount = data.forks_count;
    
    document.getElementById('starCount').textContent = starCount;
    document.getElementById('forkCount').textContent = forkCount;
  } catch (error) {
    console.error('获取GitHub统计数据失败:', error);
    document.getElementById('starCount').textContent = '?';
    document.getElementById('forkCount').textContent = '?';
  }
}

function toggleDatePicker() {
  const datePicker = document.getElementById('datePickerModal');
  datePicker.classList.toggle('active');
  
  if (datePicker.classList.contains('active')) {
    document.body.style.overflow = 'hidden';
    
    // 重新初始化日期选择器以确保它反映最新的可用日期
    if (flatpickrInstance) {
      flatpickrInstance.setDate(currentDate, false);
    }
  } else {
    document.body.style.overflow = '';
  }
}

function initEventListeners() {
  // 只允许通过日历按钮打开日期选择器
  const calendarButton = document.getElementById('calendarButton');
  calendarButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDatePicker();
  });
  
  // 点击模态框背景时关闭
  const datePickerModal = document.querySelector('.date-picker-modal');
  datePickerModal.addEventListener('click', (event) => {
    if (event.target === datePickerModal) {
      toggleDatePicker();
    }
  });
  
  // 阻止日期选择器内容区域的点击事件冒泡
  const datePickerContent = document.querySelector('.date-picker-content');
  datePickerContent.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  document.getElementById('dateRangeMode').addEventListener('change', toggleRangeMode);
  
  // 添加侧边栏关闭按钮事件
  const closeButton = document.querySelector('.close-sidebar');
  if (closeButton) {
    closeButton.addEventListener('click', closeSidebar);
  }
  
  // 点击侧边栏外部时关闭侧边栏
  document.addEventListener('click', (event) => {
    const sidebar = document.getElementById('paperSidebar');
    const isClickInside = sidebar.contains(event.target);
    const isClickOnKeyword = event.target.closest('.keyword-item') || 
                            event.target.closest('.keyword-cloud text');
    
    if (!isClickInside && !isClickOnKeyword && sidebar.classList.contains('active')) {
      closeSidebar();
    }
  });
}

// Function to detect preferred language based on browser settings
function getPreferredLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  // Check if browser is set to Chinese variants
  if (browserLang.startsWith('zh')) {
    return 'Chinese';
  }
  // Default to English for all other languages
  return 'English';
}

// Function to select the best available language for a date
function selectLanguageForDate(date, preferredLanguage = null) {
  const availableLanguages = window.dateLanguageMap?.get(date) || [];
  
  if (availableLanguages.length === 0) {
    return 'en'; // fallback
  }
  
  // Use provided preference or detect from browser
  const preferred = preferredLanguage || getPreferredLanguage();
  
  // 如果首选是 Chinese，优先尝试匹配 'zh' 或 'Chinese'
  if (preferred === 'Chinese') {
    if (availableLanguages.includes('zh')) return 'zh';
    if (availableLanguages.includes('Chinese')) return 'Chinese';
  }
  
  // 如果首选是 English，优先尝试匹配 'en' 或 'English'
  if (preferred === 'English') {
    if (availableLanguages.includes('en')) return 'en';
    if (availableLanguages.includes('English')) return 'English';
  }

  // If preferred language is available, use it
  if (availableLanguages.includes(preferred)) {
    return preferred;
  }
  
  // Fallback: prefer English/en if available, otherwise use the first available
  if (availableLanguages.includes('en')) return 'en';
  if (availableLanguages.includes('English')) return 'English';
  return availableLanguages[0];
}

async function fetchAvailableDates() {
  try {
    // 从 data 分支获取文件列表
    const fileListUrl = DATA_CONFIG.getDataUrl('assets/file-list.txt');
    const response = await fetch(fileListUrl);
    if (!response.ok) {
      console.error('Error fetching file list:', response.status);
      return [];
    }
    const text = await response.text();
    const files = text.trim().split('\n');

    const dateRegex = /(\d{4}-\d{2}-\d{2})_AI_enhanced_([a-zA-Z]+)\.jsonl/;
    const dateLanguageMap = new Map(); // Store date -> available languages
    const dates = [];
    
    files.forEach(file => {
      const match = file.match(dateRegex);
      if (match && match[1] && match[2]) {
        const date = match[1];
        const language = match[2];
        
        if (!dateLanguageMap.has(date)) {
          dateLanguageMap.set(date, []);
          dates.push(date);
        }
        dateLanguageMap.get(date).push(language);
      }
    });
    
    // Store the language mapping globally for later use
    window.dateLanguageMap = dateLanguageMap;
    availableDates = [...new Set(dates)];
    availableDates.sort((a, b) => new Date(b) - new Date(a));

    initDatePicker(); // Assuming this function uses availableDates

    return availableDates;
  } catch (error) {
    console.error('获取可用日期失败:', error);
  }
}

function initDatePicker() {
  const datepickerInput = document.getElementById('datepicker');
  
  if (flatpickrInstance) {
    flatpickrInstance.destroy();
  }
  
  // 创建可用日期的映射，用于禁用无效日期
  const enabledDatesMap = {};
  availableDates.forEach(date => {
    enabledDatesMap[date] = true;
  });
  
  // 默认加载最近一个月
  let defaultDates = availableDates[0];
  if (isRangeMode && availableDates.length > 0) {
    const latestDateStr = availableDates[0];
    const latestDate = new Date(latestDateStr);
    const oneMonthAgo = new Date(latestDate);
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
    
    const oneMonthAgoStr = oneMonthAgo.getFullYear() + "-" + 
                           String(oneMonthAgo.getMonth() + 1).padStart(2, '0') + "-" + 
                           String(oneMonthAgo.getDate()).padStart(2, '0');
                           
    const datesInRange = availableDates.filter(d => d >= oneMonthAgoStr && d <= latestDateStr);
    const startDateStr = datesInRange.length > 0 ? datesInRange[datesInRange.length - 1] : latestDateStr;
    defaultDates = [new Date(startDateStr), new Date(latestDateStr)];
  }
  
  // 配置 Flatpickr
  flatpickrInstance = flatpickr(datepickerInput, {
    inline: true,
    dateFormat: "Y-m-d",
    mode: isRangeMode ? 'range' : 'single',
    defaultDate: defaultDates,
    enable: [
      function(date) {
        // 只启用有效日期
        const dateStr = date.getFullYear() + "-" + 
                        String(date.getMonth() + 1).padStart(2, '0') + "-" + 
                        String(date.getDate()).padStart(2, '0');
        return !!enabledDatesMap[dateStr];
      }
    ],
    onChange: function(selectedDates, dateStr) {
      if (isRangeMode && selectedDates.length === 2) {
        // 处理日期范围选择
        const startDate = formatDateForAPI(selectedDates[0]);
        const endDate = formatDateForAPI(selectedDates[1]);
        loadPapersByDateRange(startDate, endDate);
        toggleDatePicker();
      } else if (!isRangeMode && selectedDates.length === 1) {
        // 处理单个日期选择
        const selectedDate = formatDateForAPI(selectedDates[0]);
        if (availableDates.includes(selectedDate)) {
          loadPapersByDateRange(selectedDate, selectedDate);
          toggleDatePicker();
        }
      }
    }
  });
  
  // 隐藏日期输入框
  const inputElement = document.querySelector('.flatpickr-input');
  if (inputElement) {
    inputElement.style.display = 'none';
  }
}

function formatDateForAPI(date) {
  return date.getFullYear() + "-" + 
         String(date.getMonth() + 1).padStart(2, '0') + "-" + 
         String(date.getDate()).padStart(2, '0');
}

function toggleRangeMode() {
  isRangeMode = document.getElementById('dateRangeMode').checked;
  
  if (flatpickrInstance) {
    flatpickrInstance.set('mode', isRangeMode ? 'range' : 'single');
  }
}

// 提取关键词并进行总结
const extractKeywords = (text) => {
  if (!text || typeof text !== 'string') return [];
  
  // 检查 nlp 是否定义以防止加载失败崩溃
  if (typeof nlp === 'undefined') {
    console.warn('compromise library (nlp) is not defined, using fallback keyword extraction.');
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['with', 'from', 'that', 'this', 'learning', 'neural', 'network', 'model', 'data', 'using', 'based'].includes(w))
      .slice(0, 10);
  }

  // 移除特殊字符和多余空格
  const cleanText = text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  
  // 使用 compromise 进行文本处理
  let doc;
  try {
    doc = nlp(cleanText);
  } catch (err) {
    console.error('nlp parsing failed:', err);
    return [];
  }
  
  // 提取名词短语和重要词汇
  const terms = new Set();
  
  // 提取名词短语
  try {
    doc.match('#Noun+').forEach(match => {
      const phrase = match.text().toLowerCase();
      if (phrase.split(' ').length <= 3) { // 最多3个词的短语
        terms.add(phrase);
      }
    });
  } catch (err) {
    console.error('doc.match(#Noun+) iteration failed:', err);
  }
  
  // 提取形容词+名词组合
  try {
    doc.match('(#Adjective+ #Noun+)').forEach(match => {
      const phrase = match.text().toLowerCase();
      if (phrase.split(' ').length <= 3) {
        terms.add(phrase);
      }
    });
  } catch (err) {
    console.error('doc.match(#Adjective+ #Noun+) iteration failed:', err);
  }
  
  // 定义停用词
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'and', 'or', 'in', 'to', 'for', 'of', 
    'with', 'by', 'on', 'this', 'that', 'our', 'method', 'based', 
    'towards', 'via', 'multi', 'text', 'using', 'aware', 'data', 'from',
    'paper', 'propose', 'proposed', 'approach', 'model', 'system', 
    'framework', 'results', 'show', 'demonstrates', 'experimental', 
    'experiments', 'evaluation', 'performance', 'state', 'art', 'sota',
    'dataset', 'datasets', 'task', 'tasks', 'learning', 'neural', 
    'network', 'networks', 'deep', 'machine', 'artificial', 'intelligence', 
    'ai', 'ml', 'dl'
  ]);
  
  // 过滤停用词和短词
  const filteredTerms = Array.from(terms).filter(term => {
    const words = term.split(' ');
    return words.every(word => word.length > 2) && 
           !words.every(word => stopWords.has(word));
  });
  
  // 统计词频
  const termFreq = {};
  filteredTerms.forEach(term => {
    termFreq[term] = (termFreq[term] || 0) + 1;
    // 给多词短语更高的权重
    if (term.includes(' ')) {
      termFreq[term] *= 1.5;
    }
  });
  
  // 计算 TF 值（词频）
  const tfScores = {};
  const totalTerms = Object.values(termFreq).reduce((a, b) => a + b, 0);
  if (totalTerms > 0) {
    Object.entries(termFreq).forEach(([term, freq]) => {
      tfScores[term] = freq / totalTerms;
    });
  }
  
  // 按 TF 值排序并返回前10个关键词/短语
  return Object.entries(tfScores)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([term]) => term);
};

async function loadPapersByDateRange(startDate, endDate) {
  // 获取日期范围内的所有有效日期
  const validDatesInRange = availableDates.filter(date => {
    return date >= startDate && date <= endDate;
  });
  
  if (validDatesInRange.length === 0) {
    alert('No available papers in the selected date range.');
    return;
  }
  
  if (startDate === endDate) {  
    currentDate = startDate;
    document.getElementById('currentDate').textContent = formatDate(startDate);
  } else {
    currentDate = `${startDate} - ${endDate}`;
    document.getElementById('currentDate').textContent = `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }
  
  const container = document.getElementById('papersList');
  container.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading papers from ${formatDate(startDate)} to ${formatDate(endDate)}...</p>
    </div>
  `;
  
  try {
    // 加载所有日期的论文数据
    const allPaperData = {};
    allPapersData = []; // 重置全局论文数据
    
    for (const date of validDatesInRange) {
      const selectedLanguage = selectLanguageForDate(date);
      // 从 data 分支获取数据文件
      const dataUrl = DATA_CONFIG.getDataUrl(`data/${date}_AI_enhanced_${selectedLanguage}.jsonl`);
      const response = await fetch(dataUrl);
      if (!response.ok) {
        console.warn(`Data for ${date} not found, skipping.`);
        continue;
      }
      const text = await response.text();
      const dataPapers = parseJsonlData(text, date);
      
      // 合并数据
      Object.keys(dataPapers).forEach(category => {
        if (!allPaperData[category]) {
          allPaperData[category] = [];
        }
        allPaperData[category] = allPaperData[category].concat(dataPapers[category]);
        // 将论文添加到全局数组
        allPapersData = allPapersData.concat(dataPapers[category]);
      });
    }
    
    paperData = allPaperData;
    
    // 渲染 Category tabs 并展示统计信息
    renderCategoryTabs(validDatesInRange);
    
  } catch (error) {
    console.error('加载论文数据失败:', error);
    container.innerHTML = `
      <div class="loading-container">
        <p>Loading data fails. Please retry.</p>
        <p>Error messages: ${error.message}</p>
      </div>
    `;
  }
}

function renderCategoryTabs(validDatesInRange) {
  const container = document.getElementById('papersList');
  
  // 1. 收集所有包含的类别 (基于 primaryCategory 或者是 paper.category 集合)
  const categoriesSet = new Set();
  allPapersData.forEach(paper => {
    if (paper.category) {
      paper.category.forEach(cat => categoriesSet.add(cat));
    }
  });
  
  // 过滤一些空白或无效的分类并排序
  const availableCategories = Array.from(categoriesSet)
    .filter(cat => cat && cat.trim().length > 0)
    .sort();
  
  // 2. 生成 HTML 结构
  container.innerHTML = `
    <div class="category-filter-wrapper">
      <div class="category-filter-title">选择论文分类 / Select Category</div>
      <div class="category-tabs" id="categoryTabs">
        <button class="category-tab active" data-category="All">
          <span class="tab-name">All Categories (全部)</span>
          <span class="tab-count">${allPapersData.length}</span>
        </button>
        ${availableCategories.map(cat => {
          const papersInCat = allPapersData.filter(paper => paper.category.includes(cat));
          const displayName = CATEGORY_NAMES[cat] || cat;
          return `
            <button class="category-tab" data-category="${cat}">
              <span class="tab-name">${displayName}</span>
              <span class="tab-count">${papersInCat.length}</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
    <div id="categoryStatsContent" class="category-stats-content">
      <!-- 动态统计内容渲染在这里 -->
    </div>
  `;

  // 3. 绑定 Tab 点击事件
  const tabs = document.querySelectorAll('.category-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const target = e.currentTarget;
      tabs.forEach(t => t.classList.remove('active'));
      target.classList.add('active');
      
      selectedCategory = target.getAttribute('data-category');
      renderCategoryStats(selectedCategory, validDatesInRange);
    });
  });

  // 4. 默认首次渲染 "All" 分类
  selectedCategory = 'All';
  renderCategoryStats('All', validDatesInRange);
}

function renderCategoryStats(category, validDatesInRange) {
  const statsContainer = document.getElementById('categoryStatsContent');
  if (!statsContainer) return;
  
  const filteredPapers = category === 'All' 
    ? allPapersData 
    : allPapersData.filter(paper => paper.category.includes(category));
    
  if (filteredPapers.length === 0) {
    statsContainer.innerHTML = `
      <div class="no-data">
        <p>当前分类下暂无论文数据 / No papers in this category.</p>
      </div>
    `;
    return;
  }
  
  // 按日期统计关键词
  const allKeywords = new Map();
  const keywordTrends = new Map();
  
  validDatesInRange.forEach(date => {
    keywordTrends.set(date, new Map());
  });
  
  filteredPapers.forEach(paper => {
    const paperDate = paper.date;
    if (!keywordTrends.has(paperDate)) {
      return;
    }
    
    const keywords = extractKeywords(paper.title);
    keywords.forEach(keyword => {
      allKeywords.set(keyword, (allKeywords.get(keyword) || 0) + 1);
      const dateStats = keywordTrends.get(paperDate);
      dateStats.set(keyword, (dateStats.get(keyword) || 0) + 1);
    });
  });
  
  // 过滤并排序关键词频次
  const keywordCloudData = Array.from(allKeywords.entries())
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30)
    .map(([keyword, count]) => ({
      text: keyword,
      size: Math.max(12, Math.min(50, count * 3))
    }));
    
  // 准备折线图数据（排前10的关键词）
  const top10Keywords = keywordCloudData.slice(0, 10).map(d => d.text);
  const trendData = top10Keywords.map(keyword => {
    return {
      keyword: keyword,
      values: Array.from(keywordTrends.entries()).map(([date, stats]) => ({
        date: new Date(date + 'T00:00:00Z'),
        count: stats.get(keyword) || 0
      })).sort((a, b) => a.date - b.date)
    };
  });
  
  const categoryDisplayName = category === 'All' ? 'All Categories (全部)' : (CATEGORY_NAMES[category] || category);
  const hasMultipleDates = validDatesInRange.length > 1;
  
  statsContainer.innerHTML = `
    <div class="statistics-section">
      <h2>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21.41 11.58L12.41 2.58C12.05 2.22 11.55 2 11 2H4C2.9 2 2 2.9 2 4V11C2 11.55 2.22 12.05 2.59 12.42L11.59 21.42C11.95 21.78 12.45 22 13 22C13.55 22 14.05 21.78 14.41 21.41L21.41 14.41C21.78 14.05 22 13.55 22 13C22 12.45 21.77 11.94 21.41 11.58ZM5.5 7C4.67 7 4 6.33 4 5.5C4 4.67 4.67 4 5.5 4C6.33 4 7 4.67 7 5.5C7 6.33 6.33 7 5.5 7Z" fill="currentColor"/>
        </svg>
        热门关键词 - ${categoryDisplayName}
      </h2>
      <div class="statistics-card">
        <div class="keyword-list">
          ${keywordCloudData.length > 0 ? keywordCloudData.map((item, index) => `
            <div class="keyword-item" onclick="showRelatedPapers('${item.text}')">
              <span class="keyword-rank">${index + 1}</span>
              <span class="keyword-text">${item.text}</span>
              <span class="keyword-count">${allKeywords.get(item.text)}</span>
            </div>
          `).join('') : '<p class="no-data">当前分类暂无热门关键词 / No keywords found.</p>'}
        </div>
      </div>
      
      ${hasMultipleDates && top10Keywords.length > 0 ? `
        <h2 class="trend-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.5 18.5L9.5 12.5L13.5 16.5L22 6.92L20.59 5.5L13.5 13.5L9.5 9.5L2 17L3.5 18.5Z" fill="currentColor"/>
          </svg>
          关键词变化趋势 - ${categoryDisplayName}
        </h2>
        <div class="statistics-card">
          <div id="trendChart" style="width: 100%; height: 400px;"></div>
        </div>
      ` : ''}
    </div>
  `;
  
  // 只有在有多个日期和关键词时才绘制图表
  if (hasMultipleDates && top10Keywords.length > 0) {
    // 使用 setTimeout 确保 DOM 已经完全渲染并能够获取元素宽度
    setTimeout(() => {
      drawTrendChart(trendData, validDatesInRange);
    }, 50);
  }
}

function drawTrendChart(trendData, validDatesInRange) {
  const chartElement = document.getElementById('trendChart');
  if (!chartElement) return;

  if (typeof d3 === 'undefined') {
    console.error('D3 is not defined, skipping trend chart rendering.');
    chartElement.innerHTML = '<p class="no-data" style="text-align: center; padding: 20px;">图表库 (D3) 加载失败，无法渲染趋势图 / Chart library failed to load.</p>';
    return;
  }

  const margin = {top: 20, right: 180, bottom: 80, left: 60};
  const width = Math.max(100, chartElement.offsetWidth - margin.left - margin.right);
  const height = 400 - margin.top - margin.bottom;

  // 清除旧的 SVG
  chartElement.innerHTML = '';

  const svg = d3.select('#trendChart')
    .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
    .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

  // 设置比例尺
  const x = d3.scaleTime()
    .domain(d3.extent(validDatesInRange, d => new Date(d)))
    .range([0, width]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(trendData, d => d3.max(d.values, v => v.count))])
    .nice()
    .range([height, 0]);

  // 创建颜色比例尺，使用更柔和的颜色
  const color = d3.scaleOrdinal()
    .range(['#4e79a7', '#f28e2c', '#59a14f', '#e15759', '#76b7b2', 
            '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab']);

  // 添加X轴网格线
  svg.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${height})`)
    .style('stroke-dasharray', '3,3')
    .style('opacity', 0.1)
    .call(d3.axisBottom(x)
      .ticks(8)
      .tickSize(-height)
      .tickFormat(''));

  // 添加Y轴网格线
  svg.append('g')
    .attr('class', 'grid')
    .style('stroke-dasharray', '3,3')
    .style('opacity', 0.1)
    .call(d3.axisLeft(y)
      .tickSize(-width)
      .tickFormat(''));

  // 确定合适的日期格式
  function determineDateFormat(dates) {
    const startDate = new Date(dates[0]);
    const endDate = new Date(dates[dates.length - 1]);
    
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();
    
    if (sameMonth) {
      return d3.timeFormat("%d");
    } else if (sameYear) {
      return d3.timeFormat("%m-%d");
    } else {
      return d3.timeFormat("%Y-%m-%d");
    }
  }

  const dateFormat = determineDateFormat(validDatesInRange);
  
  // 添加X轴
  svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x)
      .ticks(Math.min(validDatesInRange.length, 8))
      .tickFormat(dateFormat))
    .selectAll("text")
    .style("text-anchor", "end")
    .style("font-size", "11px")
    .style("fill", "#666")
    .attr("dx", "-.8em")
    .attr("dy", ".15em")
    .attr("transform", "rotate(-45)");

  // 添加Y轴
  svg.append('g')
    .attr('class', 'y-axis')
    .call(d3.axisLeft(y)
      .ticks(5))
    .selectAll("text")
    .style("font-size", "11px")
    .style("fill", "#666");

  // 添加Y轴标题
  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - margin.left)
    .attr("x", 0 - (height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("fill", "#666")
    .style("font-size", "11px")
    .text("出现频次 (Frequency)");

  // 添加X轴标题
  const startDate = new Date(validDatesInRange[0]);
  const endDate = new Date(validDatesInRange[validDatesInRange.length - 1]);
  let xAxisTitle = "";
  
  if (startDate.getFullYear() === endDate.getFullYear()) {
    if (startDate.getMonth() === endDate.getMonth()) {
      xAxisTitle = `${startDate.getFullYear()}/${String(startDate.getMonth() + 1).padStart(2, '0')}`;
    } else {
      xAxisTitle = `${startDate.getFullYear()}`;
    }
  }
  
  if (xAxisTitle) {
    svg.append("text")
      .attr("transform", `translate(${width/2}, ${height + margin.bottom - 5})`)
      .style("text-anchor", "middle")
      .style("fill", "#666")
      .style("font-size", "12px")
      .text(xAxisTitle);
  }

  svg.selectAll('.x-axis path, .y-axis path, .x-axis line, .y-axis line')
    .style('stroke', '#ccc')
    .style('stroke-width', '1px');

  // 定义面积生成器
  const area = d3.area()
    .x(d => x(d.date))
    .y0(height)
    .y1(d => y(d.count))
    .curve(d3.curveMonotoneX);

  // 定义线条生成器
  const line = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.count))
    .curve(d3.curveMonotoneX);

  // 添加渐变定义
  const gradient = svg.append("defs")
    .selectAll("linearGradient")
    .data(trendData)
    .enter()
    .append("linearGradient")
    .attr("id", (d, i) => `gradient-${i}`)
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "0%")
    .attr("y2", "100%");

  gradient.append("stop")
    .attr("offset", "0%")
    .attr("stop-color", d => color(d.keyword))
    .attr("stop-opacity", 0.25);

  gradient.append("stop")
    .attr("offset", "100%")
    .attr("stop-color", d => color(d.keyword))
    .attr("stop-opacity", 0.01);

  // 绘制面积
  const areas = svg.selectAll('.area')
    .data(trendData)
    .enter()
    .append('path')
      .attr('class', 'area')
      .attr('d', d => area(d.values))
      .style('fill', (d, i) => `url(#gradient-${i})`)
      .style('opacity', 0.6);

  // 绘制折线
  const paths = svg.selectAll('.line')
    .data(trendData)
    .enter()
    .append('path')
      .attr('class', 'line')
      .attr('d', d => line(d.values))
      .style('stroke', d => color(d.keyword))
      .style('fill', 'none')
      .style('stroke-width', 2.5)
      .style('opacity', 0.85);

  // 绘制折线节点圆点，增加细节感
  const dotsG = svg.append('g').attr('class', 'dots-group');
  trendData.forEach((d, i) => {
    dotsG.selectAll(`.dot-${i}`)
      .data(d.values)
      .enter()
      .append('circle')
        .attr('class', `dot dot-${i}`)
        .attr('cx', v => x(v.date))
        .attr('cy', v => y(v.count))
        .attr('r', 3)
        .style('fill', color(d.keyword))
        .style('opacity', 0)
        .style('transition', 'opacity 0.2s ease');
  });

  // 添加图例
  const legend = svg.selectAll('.legend')
    .data(trendData)
    .enter()
    .append('g')
      .attr('class', 'legend')
      .attr('transform', (d, i) => `translate(${width + 20},${i * 24})`);

  legend.append('rect')
    .attr('x', 0)
    .attr('width', 16)
    .attr('height', 16)
    .attr('rx', 3)
    .style('fill', d => color(d.keyword))
    .style('opacity', 0.8);

  legend.append('text')
    .attr('x', 24)
    .attr('y', 11)
    .text(d => d.keyword)
    .style('font-size', '12px')
    .style('font-weight', '500')
    .style('alignment-baseline', 'middle')
    .style('fill', '#333');

  // 添加交互效果
  legend.style('cursor', 'pointer')
    .on('mouseover', function(event, d) {
      const keyword = d.keyword;
      const targetIndex = trendData.findIndex(item => item.keyword === keyword);
      
      areas.style('opacity', 0.05);
      paths.style('opacity', 0.1);
      svg.selectAll('.dot').style('opacity', 0);
      
      svg.selectAll('.area')
        .filter(p => p.keyword === keyword)
        .style('opacity', 0.85);
      
      svg.selectAll('.line')
        .filter(p => p.keyword === keyword)
        .style('opacity', 1)
        .style('stroke-width', 3.5);

      svg.selectAll(`.dot-${targetIndex}`)
        .style('opacity', 1)
        .attr('r', 4.5);
    })
    .on('mouseout', function() {
      areas.style('opacity', 0.6);
      paths.style('opacity', 0.85).style('stroke-width', 2.5);
      svg.selectAll('.dot').style('opacity', 0).attr('r', 3);
    });
}


function parseJsonlData(jsonlText, date) {
  const result = {};
  
  const lines = jsonlText.trim().split('\n');
  
  lines.forEach(line => {
    try {
      const paper = JSON.parse(line);
      
      if (!paper.categories) {
        return;
      }
      
      let allCategories = Array.isArray(paper.categories) ? paper.categories : [paper.categories];
      
      const primaryCategory = allCategories[0];
      
      if (!result[primaryCategory]) {
        result[primaryCategory] = [];
      }
      
      const summary = paper.AI && paper.AI.tldr ? paper.AI.tldr : paper.summary;
      
      result[primaryCategory].push({
        title: paper.title,
        url: paper.abs || paper.pdf || `https://arxiv.org/abs/${paper.id}`,
        authors: Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors,
        category: allCategories,
        summary: summary,
        details: paper.summary || '',
        date: date,
        id: paper.id,
        motivation: paper.AI && paper.AI.motivation ? paper.AI.motivation : '',
        method: paper.AI && paper.AI.method ? paper.AI.method : '',
        result: paper.AI && paper.AI.result ? paper.AI.result : '',
        conclusion: paper.AI && paper.AI.conclusion ? paper.AI.conclusion : '',
        remote_sensing_cross: paper.AI && paper.AI.remote_sensing_cross ? paper.AI.remote_sensing_cross : ''
      });
    } catch (error) {
      console.error('解析JSON行失败:', error, line);
    }
  });
  
  return result;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
}

// 修改 showRelatedPapers 函数中生成论文卡片的部分
function showRelatedPapers(keyword) {
    const sidebar = document.getElementById('paperSidebar');
    const selectedKeywordElement = document.getElementById('selectedKeyword');
    const relatedPapersContainer = document.getElementById('relatedPapers');
    
    // 更新关键词显示
    selectedKeywordElement.textContent = 'Keyword: ' + keyword;
    
    // 查找包含关键词的论文
    const relatedPapers = allPapersData.filter(paper => {
        const searchText = (paper.title + ' ' + paper.summary).toLowerCase();
        return searchText.includes(keyword.toLowerCase());
    });
    
    // 生成相关论文的HTML
    const papersHTML = relatedPapers.map((paper, index) => `
        <div class="paper-card">
            <div class="paper-number">${index + 1}</div>
            <a href="${paper.url}" target="_blank" class="paper-title">${paper.title}</a>
            <div class="paper-authors">${paper.authors}</div>
            <div class="paper-categories">
                ${paper.category.map(cat => `<span class="category-tag">${cat}</span>`).join('')}
            </div>
            <div class="paper-summary">${paper.summary}</div>
        </div>
    `).join('');
    
    // 更新侧边栏内容
    relatedPapersContainer.innerHTML = relatedPapers.length > 0 
        ? papersHTML 
        : '<p>No related papers found.</p>';
    
    // 显示侧边栏
    sidebar.classList.add('active');
}

// 添加新函数：关闭侧边栏
function closeSidebar() {
  const sidebar = document.getElementById('paperSidebar');
  sidebar.classList.remove('active');
}