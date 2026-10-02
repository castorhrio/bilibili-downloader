// 注入到页面中的脚本，用于获取视频数据
(function() {
  'use strict';

  // 获取视频信息的函数
  function getVideoInfo() {
    try {
      // 方法1: 从window.__playinfo__获取
      if (window.__playinfo__) {
        return {
          title: document.title.replace(' - 哔哩哔哩', ''),
          dash: window.__playinfo__.data.dash,
          duration: window.__playinfo__.data.dash.duration
        };
      }

      // 方法2: 从window.__INITIAL_STATE__获取
      if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.videoData) {
        const videoData = window.__INITIAL_STATE__.videoData;
        return {
          title: videoData.title,
          dash: videoData.dash,
          duration: videoData.duration
        };
      }

      // 方法3: 尝试从API获取
      const bvid = getBvidFromUrl();
      if (bvid) {
        fetchVideoInfo(bvid);
      }

      return null;
    } catch (error) {
      console.error('获取视频信息失败:', error);
      return null;
    }
  }

  // 从URL获取BVID
  function getBvidFromUrl() {
    const url = window.location.href;
    const bvidMatch = url.match(/BV[a-zA-Z0-9]+/);
    const avidMatch = url.match(/av(\d+)/);
    
    if (bvidMatch) {
      return bvidMatch[0];
    } else if (avidMatch) {
      return `av${avidMatch[1]}`;
    }
    return null;
  }

  // 通过API获取视频信息
  async function fetchVideoInfo(bvid) {
    try {
      // 这里需要通过bilibili的API获取视频信息
      // 由于跨域限制，实际实现可能需要通过background script
      const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.code === 0) {
          // 获取播放链接需要额外的API调用
          fetchPlayUrl(data.data.cid, bvid);
        }
      }
    } catch (error) {
      console.error('API获取失败:', error);
    }
  }

  // 获取播放链接
  async function fetchPlayUrl(cid, bvid) {
    try {
      const response = await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=4048&fourk=1`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.code === 0) {
          const videoInfo = {
            title: document.title.replace(' - 哔哩哔哩', ''),
            dash: data.data.dash,
            duration: data.data.dash.duration
          };
          
          // 发送数据到content script
          window.postMessage({
            type: 'BILI_VIDEO_DATA',
            data: videoInfo
          }, '*');
        }
      }
    } catch (error) {
      console.error('获取播放链接失败:', error);
    }
  }

  // 监听来自content script的请求
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'GET_BILI_VIDEO_DATA') {
      const videoInfo = getVideoInfo();
      if (videoInfo) {
        window.postMessage({
          type: 'BILI_VIDEO_DATA',
          data: videoInfo
        }, '*');
      }
    }
  });

  // Hook XMLHttpRequest to intercept API responses
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      if (this._url && this._url.includes('playurl')) {
        try {
          let responseData;
          
          // 根据responseType处理不同类型的响应
          if (this.responseType === '' || this.responseType === 'text') {
            responseData = this.responseText;
          } else if (this.responseType === 'json') {
            responseData = JSON.stringify(this.response);
          } else if (this.responseType === 'arraybuffer' || this.responseType === 'blob') {
            // 对于arraybuffer或blob类型，跳过处理
            return;
          } else {
            responseData = this.response;
          }
          
          // 确保responseData是字符串
          if (typeof responseData !== 'string') {
            if (typeof responseData === 'object') {
              responseData = JSON.stringify(responseData);
            } else {
              return; // 跳过非字符串类型
            }
          }
          
          const response = JSON.parse(responseData);
          if (response.code === 0 && response.data && response.data.dash) {
            const videoInfo = {
              title: document.title.replace(' - 哔哩哔哩', ''),
              dash: response.data.dash,
              duration: response.data.dash.duration
            };
            
            window.postMessage({
              type: 'BILI_VIDEO_DATA',
              data: videoInfo
            }, '*');
          }
        } catch (e) {
          // 忽略解析错误，避免控制台输出过多错误信息
          if (e.name !== 'SyntaxError') {
            console.warn('处理响应时出现问题:', e.message);
          }
        }
      }
    });
    
    return originalSend.apply(this, arguments);
  };

  // Hook fetch API as well for better coverage
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    const promise = originalFetch.apply(this, arguments);
    
    if (typeof url === 'string' && url.includes('playurl')) {
      promise.then(response => {
        if (response.ok) {
          response.clone().json().then(data => {
            if (data.code === 0 && data.data && data.data.dash) {
              const videoInfo = {
                title: document.title.replace(' - 哔哩哔哩', ''),
                dash: data.data.dash,
                duration: data.data.dash.duration
              };
              
              window.postMessage({
                type: 'BILI_VIDEO_DATA',
                data: videoInfo
              }, '*');
            }
          }).catch(e => {
            // 忽略JSON解析错误
          });
        }
      }).catch(e => {
        // 忽略网络错误
      });
    }
    
    return promise;
  };

  // 更安全的获取视频信息方法
  function safeGetVideoInfo() {
    try {
      // 尝试多种方法获取视频信息
      let videoData = null;
      
      // 方法1: window.__playinfo__
      if (window.__playinfo__ && window.__playinfo__.data && window.__playinfo__.data.dash) {
        videoData = {
          title: document.title.replace(' - 哔哩哔哩', ''),
          dash: window.__playinfo__.data.dash,
          duration: window.__playinfo__.data.dash.duration
        };
      }
      
      // 方法2: window.__INITIAL_STATE__
      if (!videoData && window.__INITIAL_STATE__) {
        const state = window.__INITIAL_STATE__;
        if (state.videoData && state.videoData.dash) {
          videoData = {
            title: state.videoData.title,
            dash: state.videoData.dash,
            duration: state.videoData.duration
          };
        }
      }
      
      // 方法3: 从页面元素获取
      if (!videoData) {
        const playerScript = Array.from(document.scripts).find(script => 
          script.textContent && script.textContent.includes('window.__playinfo__')
        );
        
        if (playerScript) {
          try {
            // 尝试从脚本内容中提取数据
            const match = playerScript.textContent.match(/window\.__playinfo__\s*=\s*({.+?});/);
            if (match) {
              const playInfo = JSON.parse(match[1]);
              if (playInfo.data && playInfo.data.dash) {
                videoData = {
                  title: document.title.replace(' - 哔哩哔哩', ''),
                  dash: playInfo.data.dash,
                  duration: playInfo.data.dash.duration
                };
              }
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
      
      return videoData;
    } catch (error) {
      console.warn('获取视频信息时出错:', error);
      return null;
    }
  }
})();