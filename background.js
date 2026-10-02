// 后台服务脚本
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download') {
    downloadFile(message.url, message.filename, message.referer);
  }
});

async function downloadFile(url, filename, referer) {
  try {
    // 创建下载任务
    const downloadId = await chrome.downloads.download({
      url: url,
      filename: filename,
      headers: [
        {
          name: 'Referer',
          value: referer || 'https://www.bilibili.com/'
        },
        {
          name: 'User-Agent',
          value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      ],
      conflictAction: 'uniquify'
    });

    console.log('下载开始，ID:', downloadId);
    
    // 监听下载状态
    chrome.downloads.onChanged.addListener(function(downloadDelta) {
      if (downloadDelta.id === downloadId) {
        if (downloadDelta.state && downloadDelta.state.current === 'complete') {
          console.log('下载完成:', filename);
          // 可以在这里发送通知
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'Bilibili下载器',
            message: `${filename} 下载完成！`
          });
        } else if (downloadDelta.state && downloadDelta.state.current === 'interrupted') {
          console.error('下载失败:', filename);
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'Bilibili下载器',
            message: `${filename} 下载失败！`
          });
        }
      }
    });

  } catch (error) {
    console.error('下载失败:', error);
  }
}

// 处理扩展安装
chrome.runtime.onInstalled.addListener(() => {
  console.log('Bilibili下载器已安装');
});