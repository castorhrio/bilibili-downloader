// 内容脚本 - 在Bilibili页面中运行
class BilibiliDownloader {
  constructor() {
    this.videoInfo = null;
    this.init();
  }

  init() {
    this.injectScript();
    this.createDownloadButton();
    this.listenForVideoData();
  }

  // 注入脚本到页面中获取视频数据
  injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  // 创建下载按钮
  createDownloadButton() {
    // 等待页面加载完成
    const observer = new MutationObserver((mutations, obs) => {
      const targetContainer = document.querySelector('.video-toolbar-left') || 
                             document.querySelector('.tool-bar') ||
                             document.querySelector('.video-info-title');
      
      if (targetContainer && !document.querySelector('#bili-downloader-btn')) {
        this.addDownloadButton(targetContainer);
        obs.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  addDownloadButton(container) {
    const downloadBtn = document.createElement('div');
    downloadBtn.id = 'bili-downloader-btn';
    downloadBtn.className = 'bili-download-button';
    downloadBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
      下载
    `;
    
    downloadBtn.addEventListener('click', () => this.showDownloadPanel());
    
    // 插入按钮到合适的位置
    if (container.classList.contains('video-toolbar-left') || container.classList.contains('tool-bar')) {
      container.appendChild(downloadBtn);
    } else {
      container.parentNode.insertBefore(downloadBtn, container.nextSibling);
    }
  }

  // 监听来自注入脚本的视频数据
  listenForVideoData() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      
      if (event.data.type === 'BILI_VIDEO_DATA') {
        this.videoInfo = event.data.data;
        console.log('获取到视频信息:', this.videoInfo);
        
        // 如果下载面板已经打开，刷新面板内容
        const existingPanel = document.querySelector('#bili-download-panel');
        if (existingPanel) {
          this.createDownloadPanel();
        }
      }
    });
    
    // 定期检查视频信息
    this.checkVideoInfoInterval = setInterval(() => {
      if (!this.videoInfo) {
        window.postMessage({ type: 'GET_BILI_VIDEO_DATA' }, '*');
      }
    }, 5000);
  }

  // 显示下载面板
  showDownloadPanel() {
    if (!this.videoInfo) {
      alert('正在获取视频信息，请稍后再试...');
      // 触发重新获取视频信息
      window.postMessage({ type: 'GET_BILI_VIDEO_DATA' }, '*');
      return;
    }

    this.createDownloadPanel();
  }

  createDownloadPanel() {
    // 移除已存在的面板
    const existingPanel = document.querySelector('#bili-download-panel');
    if (existingPanel) {
      existingPanel.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'bili-download-panel';
    panel.className = 'bili-download-panel';
    
    const videoData = this.videoInfo;
    const title = videoData.title || document.title;
    
    panel.innerHTML = `
      <div class="bili-panel-header">
        <h3>下载视频</h3>
        <button class="bili-close-btn">×</button>
      </div>
      <div class="bili-panel-content">
        <div class="bili-video-title">${title}</div>
        <div class="bili-download-options">
          <h4>视频质量选择:</h4>
          <div class="bili-quality-list" id="bili-quality-list">
            ${this.generateQualityOptions(videoData)}
          </div>
          <h4>音频下载:</h4>
          <div class="bili-audio-options">
            <button class="bili-download-btn" data-type="audio">下载音频 (MP3)</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // 绑定事件
    panel.querySelector('.bili-close-btn').addEventListener('click', () => {
      panel.remove();
    });

    // 绑定下载按钮事件
    panel.querySelectorAll('.bili-download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.target.dataset.type;
        const quality = e.target.dataset.quality;
        this.downloadMedia(type, quality);
      });
    });

    // 点击面板外关闭
    panel.addEventListener('click', (e) => {
      if (e.target === panel) {
        panel.remove();
      }
    });
  }

  generateQualityOptions(videoData) {
    try {
      if (!videoData.dash || !videoData.dash.video || videoData.dash.video.length === 0) {
        return '<p class="bili-error-msg">无法获取视频信息，请刷新页面重试</p>';
      }

      const qualityMap = {
        120: '4K 超清',
        116: '1080P60 高清',
        112: '1080P+ 高清',
        80: '1080P 高清',
        74: '720P60 高清',
        64: '720P 高清',
        32: '480P 清晰',
        16: '360P 流畅'
      };

      return videoData.dash.video.map(video => {
        const qualityName = qualityMap[video.id] || `${video.height || 'Unknown'}P`;
        const bandwidth = video.bandwidth ? Math.round(video.bandwidth/1000) : 'Unknown';
        return `
          <button class="bili-download-btn" data-type="video" data-quality="${video.id}">
            ${qualityName} (${bandwidth}kbps)
          </button>
        `;
      }).join('');
    } catch (error) {
      console.error('生成质量选项时出错:', error);
      return '<p class="bili-error-msg">解析视频质量信息失败</p>';
    }
  }

  async downloadMedia(type, quality) {
    try {
      const videoData = this.videoInfo;
      if (!videoData || !videoData.dash) {
        alert('视频信息不完整，请刷新页面重试');
        return;
      }

      let downloadUrl, filename;

      if (type === 'video') {
        if (!videoData.dash.video || videoData.dash.video.length === 0) {
          alert('无可用的视频流');
          return;
        }

        const videoStream = videoData.dash.video.find(v => v.id == quality);
        if (!videoStream) {
          alert('选择的视频质量不可用');
          return;
        }

        downloadUrl = videoStream.baseUrl || videoStream.base_url || videoStream.backup_url?.[0];
        if (!downloadUrl) {
          alert('无法获取视频下载地址');
          return;
        }

        const qualityMap = {
          120: '4K', 116: '1080P60', 112: '1080P+', 80: '1080P',
          74: '720P60', 64: '720P', 32: '480P', 16: '360P'
        };
        const qualityName = qualityMap[quality] || quality;
        filename = `${this.sanitizeFilename(videoData.title)}_${qualityName}.mp4`;
        
      } else if (type === 'audio') {
        if (!videoData.dash.audio || videoData.dash.audio.length === 0) {
          alert('无可用的音频流');
          return;
        }

        const audioStream = videoData.dash.audio[0];
        downloadUrl = audioStream.baseUrl || audioStream.base_url || audioStream.backup_url?.[0];
        if (!downloadUrl) {
          alert('无法获取音频下载地址');
          return;
        }

        filename = `${this.sanitizeFilename(videoData.title)}.m4a`;
      }

      if (!downloadUrl) {
        alert('无法获取下载地址');
        return;
      }

      // 发送下载请求到background script
      chrome.runtime.sendMessage({
        action: 'download',
        url: downloadUrl,
        filename: filename,
        referer: window.location.href
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('发送下载消息失败:', chrome.runtime.lastError);
          alert('下载请求失败，请重试');
        } else {
          console.log('下载请求已发送');
        }
      });

      // 关闭下载面板
      const panel = document.querySelector('#bili-download-panel');
      if (panel) panel.remove();

      alert('下载开始！请检查浏览器下载栏。');
      
    } catch (error) {
      console.error('下载失败:', error);
      alert('下载失败: ' + error.message);
    }
  }

  sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
  }
}

// 初始化下载器
if (window.location.hostname.includes('bilibili.com')) {
  const downloader = new BilibiliDownloader();
}