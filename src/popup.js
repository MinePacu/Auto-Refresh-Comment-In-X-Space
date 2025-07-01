'use strict';

(function() {
  // 전역 변수들
  let currentTabId = null;
  let statusUpdateInterval = null;
  
  // 동적 주입 관련 변수들
  let injectionInProgress = false;
  const injectionAttempts = new Map(); // tabId -> attempt count

  // 탭별 설정 관리 함수들
  function getCurrentTabId(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        currentTabId = tabs[0].id;
        callback(currentTabId);
      } else {
        console.warn('No active tab found');
        callback(null);
      }
    });
  }

  function getTabSetting(key, defaultValue, callback) {
    if (!currentTabId) {
      console.warn('No current tab ID available for getting setting:', key);
      callback(defaultValue);
      return;
    }
    
    const tabKey = `${key}_tab_${currentTabId}`;
    chrome.storage.sync.get([tabKey], (result) => {
      const value = result[tabKey];
      callback(value !== undefined ? value : defaultValue);
    });
  }

  function setTabSetting(key, value) {
    if (!currentTabId) {
      console.warn('No current tab ID available for setting:', key);
      return;
    }
    
    const tabKey = `${key}_tab_${currentTabId}`;
    chrome.storage.sync.set({ [tabKey]: value });
  }

  // We will make use of Storage API to get and store `count` value
  // More information on Storage API can we found at
  // https://developer.chrome.com/extensions/storage

  // To get storage access, we have to mention it in `permissions` property of manifest.json file
  // More information on Permissions can we found at
  // https://developer.chrome.com/extensions/declare_permissions    // X Rate Limit 관련 상수
  const X_RATE_LIMIT_CONFIG = {
    MIN_REFRESH_INTERVAL_SECONDS: 8,  // 최소 8초 (content script의 7.2초보다 약간 여유있게)
    MAX_REFRESH_INTERVAL_SECONDS: 3600, // 최대 1시간
    RATE_LIMIT_INFO: 'X Rate Limit: 150 requests/15min'
  };

  // 클릭 간 대기시간 관련 상수  
  const CLICK_DELAY_CONFIG = {
    MIN_CLICK_DELAY: 1,  // 최소 1ms
    MAX_CLICK_DELAY: 10000, // 최대 10초
    DEFAULT_CLICK_DELAY: 700 // 기본 700ms
  };

  // 유효성 검사 유틸리티 함수들
  function validateRefreshInterval(value) {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) {
      return { 
        value: X_RATE_LIMIT_CONFIG.MIN_REFRESH_INTERVAL_SECONDS, 
        adjusted: true,
        reason: 'Invalid number' 
      };
    }
    
    const originalValue = numValue;
    let adjustedValue = numValue;
    let adjusted = false;
    let reason = '';
    
    if (numValue < X_RATE_LIMIT_CONFIG.MIN_REFRESH_INTERVAL_SECONDS) {
      adjustedValue = X_RATE_LIMIT_CONFIG.MIN_REFRESH_INTERVAL_SECONDS;
      adjusted = true;
      reason = `Below minimum (${X_RATE_LIMIT_CONFIG.MIN_REFRESH_INTERVAL_SECONDS}s)`;
    } else if (numValue > X_RATE_LIMIT_CONFIG.MAX_REFRESH_INTERVAL_SECONDS) {
      adjustedValue = X_RATE_LIMIT_CONFIG.MAX_REFRESH_INTERVAL_SECONDS;
      adjusted = true;
      reason = `Above maximum (${X_RATE_LIMIT_CONFIG.MAX_REFRESH_INTERVAL_SECONDS}s)`;
    }
    
    return { value: adjustedValue, adjusted, reason, originalValue };
  }

  function validateClickDelay(value) {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) {
      return { 
        value: CLICK_DELAY_CONFIG.MIN_CLICK_DELAY, 
        adjusted: true,
        reason: 'Invalid number' 
      };
    }
    
    const originalValue = numValue;
    let adjustedValue = numValue;
    let adjusted = false;
    let reason = '';
    
    if (numValue < CLICK_DELAY_CONFIG.MIN_CLICK_DELAY) {
      adjustedValue = CLICK_DELAY_CONFIG.MIN_CLICK_DELAY;
      adjusted = true;
      reason = `Below minimum (${CLICK_DELAY_CONFIG.MIN_CLICK_DELAY}ms)`;
    } else if (numValue > CLICK_DELAY_CONFIG.MAX_CLICK_DELAY) {
      adjustedValue = CLICK_DELAY_CONFIG.MAX_CLICK_DELAY;
      adjusted = true;
      reason = `Above maximum (${CLICK_DELAY_CONFIG.MAX_CLICK_DELAY}ms)`;
    }
    
    return { value: adjustedValue, adjusted, reason, originalValue };
  }
  // 새로고침 주기 저장 및 복원
  function setupRefreshInterval() {
    const input = document.getElementById('refreshInterval');
    const applyBtn = document.getElementById('applyRefreshIntervalBtn');

    // 입력 필드에 최솟값과 툴팁 설정
    input.min = X_RATE_LIMIT_CONFIG.MIN_REFRESH_INTERVAL_SECONDS;
    input.max = X_RATE_LIMIT_CONFIG.MAX_REFRESH_INTERVAL_SECONDS;
    input.title = `최소 ${X_RATE_LIMIT_CONFIG.MIN_REFRESH_INTERVAL_SECONDS}초 (${X_RATE_LIMIT_CONFIG.RATE_LIMIT_INFO})`;

    // 저장된 값 불러오기
    chrome.storage.sync.get(['refreshInterval'], result => {
      if (typeof result.refreshInterval === 'number') {
        input.value = result.refreshInterval;
      }
    });

    // 값 변경 시 유효성 검사 및 저장
    input.addEventListener('change', () => {
      const validation = validateRefreshInterval(input.value);
      input.value = validation.value; // 검증된 값으로 업데이트
      
      if (validation.adjusted) {
        showRateLimitWarning(validation.originalValue, validation.value, validation.reason);
      }
      
      // 스토리지에 저장
      chrome.storage.sync.set({ refreshInterval: validation.value });
    });

    // "적용" 버튼 클릭 시 contentScript로 전송
    applyBtn.addEventListener('click', () => {
      const validation = validateRefreshInterval(input.value);
      input.value = validation.value; // 검증된 값으로 업데이트

      if (validation.adjusted) {
        showRateLimitWarning(validation.originalValue, validation.value, validation.reason);
      }

      // 먼저 storage에 저장
      chrome.storage.sync.set({ refreshInterval: validation.value }, () => {
        // contentScript에 직접 메시지 전달
        sendMessageToContentScript('SET_REFRESH_INTERVAL', { interval: validation.value }, (response) => {
          if (response && response.status === 'adjusted') {
            // Content script에서 추가 조정이 있었을 경우
            input.value = response.adjustedInterval;
            showAdjustmentMessage(response.message);
          } else if (response && response.status === 'error') {
            console.error('Error setting refresh interval:', response.message);
          }
        });
      });
    });
  }  // Rate Limit 경고 메시지 표시
  function showRateLimitWarning(originalValue, adjustedValue, reason = '') {
    const reasonText = reason ? ` (${reason})` : ` (${X_RATE_LIMIT_CONFIG.RATE_LIMIT_INFO})`;
    const message = `새로고침 간격이 ${originalValue}초에서 ${adjustedValue}초로 조정되었습니다.${reasonText}`;
    console.warn(message);
    
    // 임시 메시지 표시
    const statusText = document.getElementById('statusText');
    if (statusText) {
      // X 도메인이 아닌 경우도 고려하여 원래 텍스트 저장
      let originalText = statusText.textContent;
      let originalColor = statusText.style.color;
      
      statusText.textContent = `조정됨: ${adjustedValue}초`;
      statusText.style.color = '#ff9800';
      
      setTimeout(() => {
        // 지원되지 않는 사이트일 경우 상태 텍스트가 변경될 수 있으므로 체크
        checkIsOnXDomain((isOnXDomain) => {
          if (!isOnXDomain && originalText === '상태: 알 수 없음') {
            // 비 X 도메인에서는 "설정 저장됨"으로 표시
            statusText.textContent = '설정이 저장되었습니다';
            statusText.style.color = '#4CAF50';
          } else {
            statusText.textContent = originalText;
            statusText.style.color = originalColor;
          }
        });
      }, 3000);
    }
  }
  // Content Script 조정 메시지 표시
  function showAdjustmentMessage(message) {
    console.info('Content Script adjustment:', message);
    
    const statusText = document.getElementById('statusText');
    if (statusText) {
      const originalText = statusText.textContent;
      const originalColor = statusText.style.color;
      statusText.textContent = '간격 조정됨';
      statusText.style.color = '#ff9800';
      
      setTimeout(() => {
        // 지원되지 않는 사이트일 경우 상태 텍스트가 변경될 수 있으므로 체크
        checkIsOnXDomain((isOnXDomain) => {
          if (!isOnXDomain && originalText === '상태: 알 수 없음') {
            // 비 X 도메인에서는 "설정 저장됨"으로 표시
            statusText.textContent = '설정이 저장되었습니다';
            statusText.style.color = '#4CAF50';
          } else {
            statusText.textContent = originalText;
            statusText.style.color = originalColor;
          }
        });
      }, 3000);
    }
  }
  // 클릭 간 대기 시간 설정
  function setupClickDelay() {
    const input = document.getElementById('clickDelay');
    const applyBtn = document.getElementById('applyClickDelayBtn');

    // 최솟값과 툴팁 설정
    input.min = CLICK_DELAY_CONFIG.MIN_CLICK_DELAY;
    input.max = CLICK_DELAY_CONFIG.MAX_CLICK_DELAY;
    input.title = `최소 ${CLICK_DELAY_CONFIG.MIN_CLICK_DELAY}ms`;

    // 저장된 값 불러오기
    chrome.storage.sync.get(['clickDelayMs'], result => {
      if (typeof result.clickDelayMs === 'number') {
        input.value = result.clickDelayMs;
      }
    });

    // 값 변경 시 유효성 검사 및 저장
    input.addEventListener('change', () => {
      const validation = validateClickDelay(input.value);
      input.value = validation.value; // 검증된 값으로 업데이트
      
      if (validation.adjusted) {
        showClickDelayAdjustment(validation.originalValue, validation.value, validation.reason);
      }
      
      chrome.storage.sync.set({ clickDelayMs: validation.value });
    });

    applyBtn.addEventListener('click', () => {
      const validation = validateClickDelay(input.value);
      input.value = validation.value; // 최종 검증된 값으로 input 업데이트

      if (validation.adjusted) {
        showClickDelayAdjustment(validation.originalValue, validation.value, validation.reason);
      }

      chrome.storage.sync.set({ clickDelayMs: validation.value }, () => {
        // contentScript에 직접 메시지 전달
        sendMessageToContentScript('SET_CLICK_DELAY', { delay: validation.value }, (response) => {
          if (response && response.status === 'error') {
            console.error('Error setting click delay:', response.message);
          }
        });
      });
    });
  }  // 클릭 간 대기시간 조정 메시지 표시
  function showClickDelayAdjustment(originalValue, adjustedValue, reason = '') {
    const reasonText = reason ? ` (${reason})` : '';
    const message = `클릭 간 대기시간이 ${originalValue}ms에서 ${adjustedValue}ms로 조정되었습니다.${reasonText}`;
    console.warn(message);
    
    const statusText = document.getElementById('statusText');
    if (statusText) {
      const originalText = statusText.textContent;
      const originalColor = statusText.style.color;
      statusText.textContent = `조정됨: ${adjustedValue}ms`;
      statusText.style.color = '#ff9800';
      
      setTimeout(() => {
        // 지원되지 않는 사이트일 경우 상태 텍스트가 변경될 수 있으므로 체크
        checkIsOnXDomain((isOnXDomain) => {
          if (!isOnXDomain && originalText === '상태: 알 수 없음') {
            // 비 X 도메인에서는 "설정 저장됨"으로 표시
            statusText.textContent = '설정이 저장되었습니다';
            statusText.style.color = '#4CAF50';
          } else {
            statusText.textContent = originalText;
            statusText.style.color = originalColor;
          }
        });
      }, 3000);
    }
  }

  // 테마 적용 함수
  function applyTheme(theme) {
    const docElement = document.documentElement;
    docElement.setAttribute('data-theme', theme);
  }

  // 다크 모드 설정
  function setupDarkModeToggle() {
    const themeSelector = document.getElementById('themeSelector');
    
    // 저장된 테마 불러오기 및 적용
    chrome.storage.sync.get(['theme'], result => {
      const currentTheme = result.theme || 'light'; // 기본값 'light'
      themeSelector.value = currentTheme;
      applyTheme(currentTheme);
    });

    themeSelector.addEventListener('change', () => {
      const selectedTheme = themeSelector.value;
      chrome.storage.sync.set({ theme: selectedTheme }, () => {
        applyTheme(selectedTheme);
      });
    });
  }

  // 개발자 옵션 설정
  function setupDeveloperOptions() {
    const developerOptionsHeader = document.querySelector('.developer-options-header');
    const developerOptionsContent = document.getElementById('developerOptionsContent');
    const toggleIcon = document.getElementById('devOptionsToggleIcon');
    const debugLogToggle = document.getElementById('debugLogToggle');

    // 개발자 옵션 펼치기/접기
    if (developerOptionsHeader && developerOptionsContent && toggleIcon) {
      developerOptionsHeader.addEventListener('click', () => {
        const isHidden = developerOptionsContent.style.display === 'none';
        developerOptionsContent.style.display = isHidden ? 'block' : 'none';
        toggleIcon.textContent = isHidden ? '▼' : '▶';
      });
    }

    // 디버그 로그 토글 상태 불러오기
    if (debugLogToggle) {
      chrome.storage.sync.get(['debugLogEnabled'], result => {
        const debugEnabled = result.debugLogEnabled || false;
        updateDebugLogButton(debugEnabled);
      });

      // 디버그 로그 토글 이벤트
      debugLogToggle.addEventListener('click', () => {
        chrome.storage.sync.get(['debugLogEnabled'], result => {
          const currentState = result.debugLogEnabled || false;
          const newState = !currentState;
          
          chrome.storage.sync.set({ debugLogEnabled: newState }, () => {
            updateDebugLogButton(newState);
            
            // Content Script에 디버그 로그 설정 전송
            sendMessageToContentScript('SET_DEBUG_LOG', { enabled: newState }, (response) => {
              if (response && response.status === 'error') {
                console.error('Error setting debug log:', response.message);
              }
            });
          });
        });
      });
    }

    function updateDebugLogButton(isEnabled) {
      if (debugLogToggle) {
        debugLogToggle.textContent = isEnabled ? 'ON' : 'OFF';
        debugLogToggle.className = isEnabled ? 'button' : 'button off';
      }
    }
  }

  // 마스터 토글 설정 (탭별)
  function setupMasterToggle() {
    const masterBtn = document.getElementById('masterToggleBtn');
    const statusText = document.getElementById('statusText');
    const loadingSpinner = document.getElementById('loadingSpinner');

    // 탭별 저장된 상태 불러오기
    getTabSetting('masterOn', false, (isOn) => {
      updateMasterButton(isOn);
    });

    // 버튼 클릭 이벤트
    masterBtn.addEventListener('click', () => {
      // 버튼 비활성화 (중복 클릭 방지)
      masterBtn.disabled = true;
      
      getTabSetting('masterOn', false, (currentState) => {
        const newState = !currentState;
        
        setTabSetting('masterOn', newState);
        updateMasterButton(newState);
        
        // Content Script 준비 확인 후 메시지 전송 (업데이트 복구 지원)
        sendMessageToContentScriptWithRecovery('TOGGLE_MASTER', { isOn: newState }, (response) => {
          // 버튼 다시 활성화
          masterBtn.disabled = false;
          
          if (response && response.status === 'warning') {
            // Content Script가 준비되지 않았지만 설정은 저장됨
            console.warn('Master toggle saved but content script not ready');
          } else if (response && response.status === 'error') {
            console.error('Error toggling master:', response.message);
            // 오류 발생 시 상태 되돌리기
            setTabSetting('masterOn', currentState);
            updateMasterButton(currentState);
          }
        });
      });
    });

    function updateMasterButton(isOn) {
      masterBtn.textContent = isOn ? 'ON' : 'OFF';
      masterBtn.className = isOn ? 'button' : 'button off';
      
      // 상태 업데이트 인터벌 관리
      if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
        statusUpdateInterval = null;
      }

      if (isOn) {
        // 즉시 상태 업데이트 후 주기적 업데이트 시작
        updateStatus();
        statusUpdateInterval = setInterval(updateStatus, 1000);
      } else {
        // OFF 상태일 때는 상태를 비활성으로 설정하고 스피너 숨김
        statusText.textContent = '상태: 비활성';
        loadingSpinner.style.display = 'none';
      }
    }

    function updateStatus() {
      statusText.textContent = '상태: 확인 중...';
      loadingSpinner.style.display = 'inline-block';
      
      // contentScript에서 현재 상태 가져오기
      sendMessageToContentScript('GET_STATUS', {}, (response) => {
        loadingSpinner.style.display = 'none';
        
        if (response && (response.status === 'success' || response.status === 'partial_success')) {
          const data = response.data;
          let statusMessage = '';
          
          if (!data.isActive) {
            statusMessage = '비활성';
          } else if (!data.isOnXSite) {
            statusMessage = 'X(트위터) 접속 대기 중';
          } else if (!data.isOnSpaceTweet) {
            statusMessage = '스페이스 트윗 대기 중';
          } else if (!data.isListeningToSpace) {
            statusMessage = '스페이스 청취 대기 중';
          } else {
            statusMessage = `활성 중 (답글: ${data.replyCount}개)`;
          }
          
          // 오류가 있었지만 부분적으로 성공한 경우 표시
          if (response.status === 'partial_success' && data.error) {
            statusMessage += ' (일부 오류)';
            console.warn('Status check had errors:', data.error);
          }
          
          statusText.textContent = `상태: ${statusMessage}`;
        } else if (response && response.status === 'error') {
          console.error('Status check failed:', response.error);
          statusText.textContent = '상태: 확인 실패';
        } else {
          statusText.textContent = '상태: 대기 중';
        }
      });
    }
  }
  function sendMessageToContentScript(type, payload, callback) {
    if (!currentTabId) {
      console.warn('No current tab ID available for sending message:', type);
      if (callback) callback({ status: 'error', message: 'No tab ID' });
      return;
    }
    
    // 현재 탭이 X 도메인인지 확인
    checkIsOnXDomain((isOnXDomain, url) => {
      if (!isOnXDomain) {
        // X 도메인이 아니면 메시지 전송을 건너뛰고 설정만 저장
        console.info('Not on X domain, skipping message to content script:', type);
        
        // 설정 관련 메시지인 경우 스토리지에 직접 저장
        if (type === 'SET_REFRESH_INTERVAL' && payload && payload.interval) {
          chrome.storage.sync.set({ refreshInterval: payload.interval });
        } else if (type === 'SET_CLICK_DELAY' && payload && payload.delay) {
          chrome.storage.sync.set({ clickDelayMs: payload.delay });
        }
        
        if (callback) callback({ status: 'success', message: 'Settings saved (not on X domain)' });
        return;
      }
      
      // X 도메인인 경우 Content Script 준비 확인 (주입 포함)
      checkContentScriptReadyWithInjection(currentTabId, (isReady, error) => {
        if (isReady) {
          // Content Script가 준비되었으면 메시지 전송
          sendMessageWithRetry(currentTabId, { type, payload }, callback);
        } else {
          console.warn('Content script not ready after injection attempt:', error);
          
          // 설정 관련 메시지는 스토리지에 직접 저장
          if (type === 'SET_REFRESH_INTERVAL' && payload && payload.interval) {
            chrome.storage.sync.set({ refreshInterval: payload.interval });
          } else if (type === 'SET_CLICK_DELAY' && payload && payload.delay) {
            chrome.storage.sync.set({ clickDelayMs: payload.delay });
          } else if (type === 'TOGGLE_MASTER' && payload) {
            // 마스터 설정도 저장
            setTabSetting('masterOn', payload.isOn);
          }
          
          if (callback) {
            callback({ 
              status: 'warning', 
              message: 'Settings saved, but content script not ready. Please refresh the page.' 
            });
          }
          
          // 사용자에게 알림 표시
          if (error && (error.includes('injection failed') || error.includes('Injection error'))) {
            showTemporaryMessage('설정이 저장되었습니다. 페이지를 새로고침하면 적용됩니다.', 4000);
          } else {
            showTemporaryMessage('확장 프로그램을 활성화하는 중...', 2000);
          }
        }
      });
    });
  }

  // Content Script 준비 상태 확인 함수
  function checkContentScriptReady(tabId, callback, timeout = 5000) {
    const startTime = Date.now();
    
    function checkReady() {
      if (Date.now() - startTime > timeout) {
        callback(false, 'Timeout waiting for content script');
        return;
      }
      
      chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script가 아직 준비되지 않음, 재시도
          setTimeout(checkReady, 300);
        } else {
          // Content script 준비됨
          callback(true);
        }
      });
    }
    
    checkReady();
  }

  // 재시도 로직이 포함된 메시지 전송 함수
  function sendMessageWithRetry(tabId, message, callback, maxRetries = 3) {
    let attempts = 0;
    
    function attemptSend() {
      attempts++;
      
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message;
          console.warn(`Message send attempt ${attempts}/${maxRetries} failed:`, errorMessage);
          
          // Content Script가 로드되지 않은 경우 재시도
          if (errorMessage.includes('Could not establish connection') && attempts < maxRetries) {
            console.info(`Retrying in 800ms... (attempt ${attempts + 1}/${maxRetries})`);
            setTimeout(attemptSend, 800);
            return;
          }
          
          // 최대 재시도 횟수 도달 또는 다른 오류
          console.error('Final message send failure:', errorMessage);
          if (callback) callback({ status: 'error', message: errorMessage });
        } else {
          // 성공
          console.info(`Message sent successfully on attempt ${attempts}`);
          if (callback) callback(response);
        }
      });
    }
    
    attemptSend();
  }

  // 사용자에게 임시 메시지를 표시하는 함수
  function showTemporaryMessage(message, duration = 3000) {
    const statusText = document.getElementById('statusText');
    if (statusText) {
      const originalText = statusText.textContent;
      const originalColor = statusText.style.color;
      
      statusText.textContent = message;
      statusText.style.color = '#2196F3'; // 파란색으로 정보 메시지 표시
      
      setTimeout(() => {
        statusText.textContent = originalText;
        statusText.style.color = originalColor;
      }, duration);
    }
  }

  // 탭 상태 확인 함수
  function checkTabStatus(tabId, callback) {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        callback(false, 'Tab not found');
        return;
      }
      
      if (tab.status !== 'complete') {
        callback(false, 'Tab still loading');
        return;
      }
      
      callback(true, tab);
    });
  }

  // 사용자 피드백 표시 함수
  function showStatusMessage(message, type = 'info', duration = 3000) {
    const statusText = document.getElementById('statusText');
    if (!statusText) return;
    
    const originalText = statusText.textContent;
    const originalColor = statusText.style.color;
    
    // 색상 설정
    const colors = {
      'info': '#2196F3',
      'success': '#4CAF50',
      'warning': '#ff9800',
      'error': '#F44336'
    };
    
    statusText.textContent = message;
    statusText.style.color = colors[type] || colors.info;
    
    // 일정 시간 후 원래 상태로 복원
    if (duration > 0) {
      setTimeout(() => {
        if (statusText.textContent === message) {
          statusText.textContent = originalText;
          statusText.style.color = originalColor;
        }
      }, duration);
    }
  }

  async function checkAndRequestPermissions() {
    try {
      // 필요한 권한들 확인
      const hasPermissions = await chrome.permissions.contains({
        permissions: ['scripting', 'tabs'],
        origins: ['*://x.com/*', '*://twitter.com/*']
      });

      if (!hasPermissions) {
        // 사용자에게 권한 요청 이유 설명
        showStatusMessage('확장 프로그램 권한이 필요합니다', 'warning', 0);
        
        try {
          const granted = await chrome.permissions.request({
            permissions: ['scripting', 'tabs'],
            origins: ['*://x.com/*', '*://twitter.com/*']
          });
          
          if (!granted) {
            console.warn('Required permissions denied by user');
            showStatusMessage('권한이 거부되었습니다. 수동으로 페이지를 새로고침해주세요.', 'error', 5000);
            return false;
          }
          
          showStatusMessage('권한이 승인되었습니다', 'success');
        } catch (permissionError) {
          console.error('Permission request failed:', permissionError);
          showStatusMessage('권한 요청 중 오류가 발생했습니다', 'error', 5000);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking permissions:', error);
      showStatusMessage('권한 확인 중 오류가 발생했습니다', 'error', 5000);
      return false;
    }
  }

  // Content Script 동적 주입 함수 (강화된 에러 처리)
  async function injectContentScriptIfNeeded(tabId) {
    // 권한 확인
    const hasPermissions = await checkAndRequestPermissions();
    if (!hasPermissions) {
      console.error('Insufficient permissions for content script injection');
      showStatusMessage('권한이 부족합니다. 확장 프로그램을 다시 설치해주세요.', 'error', 5000);
      return false;
    }

    // 이미 주입 중인 경우 대기
    if (injectionInProgress) {
      console.log('Injection already in progress, waiting...');
      showStatusMessage('확장 프로그램을 활성화하는 중입니다...', 'info', 0);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 주입 시도 횟수 제한
    const attempts = injectionAttempts.get(tabId) || 0;
    if (attempts >= 3) {
      console.warn(`Maximum injection attempts (${attempts}) reached for tab ${tabId}`);
      showStatusMessage('활성화 시도가 너무 많습니다. 페이지를 새로고침해주세요.', 'error', 5000);
      return false;
    }

    injectionAttempts.set(tabId, attempts + 1);
    injectionInProgress = true;

    try {
      // 먼저 Content Script가 이미 있는지 확인
      const response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null); // Content Script 없음
          } else {
            resolve(response); // Content Script 있음
          }
        });
      });

      if (response) {
        console.log('Content Script already loaded');
        showStatusMessage('확장 프로그램이 이미 활성화되어 있습니다', 'success');
        injectionAttempts.delete(tabId); // 성공 시 카운터 리셋
        return true;
      }

      // 탭 상태 확인
      const tab = await new Promise((resolve) => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(tab);
          }
        });
      });

      if (!tab) {
        console.error('Tab not found:', tabId);
        showStatusMessage('탭을 찾을 수 없습니다', 'error');
        return false;
      }

      if (tab.status !== 'complete') {
        console.warn('Tab not ready for injection:', tabId, 'status:', tab.status);
        showStatusMessage('페이지 로딩이 완료될 때까지 기다려주세요', 'warning');
        return false;
      }

      // Content Script가 없으면 동적으로 주입
      console.log('Injecting Content Script dynamically...');
      showStatusMessage('확장 프로그램을 활성화하는 중입니다...', 'info', 0);
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['contentScript.js']
        });
      } catch (scriptError) {
        console.error('Script injection failed:', scriptError);
        showStatusMessage('스크립트 주입에 실패했습니다. 페이지를 새로고침해주세요.', 'error', 5000);
        return false;
      }

      // 주입 후 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 주입 성공 확인
      const injectionResponse = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });

      if (injectionResponse) {
        console.log('Content Script injection successful');
        showStatusMessage('확장 프로그램이 활성화되었습니다!', 'success');
        injectionAttempts.delete(tabId); // 성공 시 카운터 리셋
        return true;
      } else {
        console.error('Content Script injection verification failed');
        showStatusMessage('활성화 확인에 실패했습니다. 다시 시도해주세요.', 'error');
        return false;
      }

    } catch (error) {
      console.error('Error injecting Content Script:', error);
      return false;
    } finally {
      injectionInProgress = false;
    }
  }

  // Content Script 준비 상태 확인 및 필요시 주입
  // Content Script 상태 확인 및 주입 (강화된 에러 처리 및 사용자 피드백)
  async function checkContentScriptReadyWithInjection(tabId, callback, timeout = 10000) {
    const startTime = Date.now();
    let injectionAttempted = false;
    let isFirstCheck = true;
    
    async function checkReady() {
      if (Date.now() - startTime > timeout) {
        showStatusMessage('확장 프로그램 활성화 시간이 초과되었습니다', 'error', 5000);
        callback(false, 'Timeout waiting for content script');
        return;
      }
      
      // 첫 번째 확인에서 로딩 표시
      if (isFirstCheck) {
        showStatusMessage('확장 프로그램 상태를 확인하는 중...', 'info', 0);
        isFirstCheck = false;
      }
      
      // PING 메시지로 Content Script 확인
      chrome.tabs.sendMessage(tabId, { type: 'PING' }, async (response) => {
        if (chrome.runtime.lastError) {
          // Content Script가 없으면 주입 시도 (한 번만)
          if (!injectionAttempted) {
            injectionAttempted = true;
            console.log('Content Script not found, attempting injection...');
            
            try {
              const injectionSuccess = await injectContentScriptIfNeeded(tabId);
              if (injectionSuccess) {
                // 주입 성공 후 다시 확인
                setTimeout(checkReady, 800);
              } else {
                showStatusMessage('확장 프로그램 활성화에 실패했습니다', 'error', 5000);
                callback(false, 'Content Script injection failed');
              }
            } catch (error) {
              console.error('Injection attempt failed:', error);
              showStatusMessage('확장 프로그램 활성화 중 오류가 발생했습니다', 'error', 5000);
              callback(false, `Injection error: ${error.message}`);
            }
          } else {
            // 이미 주입을 시도했지만 여전히 응답이 없으면 재시도
            setTimeout(checkReady, 500);
          }
        } else {
          // Content Script 준비됨
          showStatusMessage('확장 프로그램이 준비되었습니다', 'success');
          callback(true);
        }
      });
    }
    
    checkReady();
  }
  // 현재 탭이 X(트위터) 도메인인지 확인
  function checkIsOnXDomain(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url) {
        const url = tabs[0].url;
        const isOnXDomain = url.includes('x.com') || url.includes('twitter.com');
        callback(isOnXDomain, url);
      } else {
        callback(false, '');
      }
    });
  }  // 지원되지 않는 사이트 UI 표시
  function showUnsupportedSiteUI() {
    // 마스터 버튼 컨테이너만 변경
    const masterContainer = document.querySelector('.master-container');
    if (masterContainer) {
      // 마스터 버튼 영역에만 지원되지 않는 사이트 메시지 표시
      masterContainer.innerHTML = `
        <div style="text-align: center; width: 100%;">
          <h3 style="margin-bottom: 10px; color: #e74c3c; font-size: 14px;">지원되지 않는 사이트</h3>
          <p style="margin-bottom: 10px; font-size: 12px;">이 확장 프로그램은 X(트위터) 도메인에서만 작동합니다.</p>
          <p style="margin-bottom: 10px; font-size: 11px; color: #666;">X 스페이스 페이지에서 사용해주세요.</p>
          <button id="openXButton" class="button" style="margin: 10px auto; padding: 5px 10px; font-size: 12px;">x.com 열기</button>
        </div>
      `;
      
      // 상태 표시 영역 비활성화 (선택적)
      const statusIndicator = document.querySelector('.status-indicator-container');
      if (statusIndicator) {
        statusIndicator.style.display = 'none';
      }
    }
    
    // X.com을 새 탭에서 여는 버튼 이벤트 추가
    setTimeout(() => {
      const openXButton = document.getElementById('openXButton');
      if (openXButton) {
        openXButton.addEventListener('click', () => {
          chrome.tabs.create({ url: 'https://x.com' });
        });
      }
    }, 0);
  }
  // X.com 도메인으로 접속 권한 확인
  function checkHostPermission(callback) {
    if (typeof chrome.permissions !== 'undefined' && chrome.permissions.contains) {
      // Manifest V3에서 host_permissions 확인
      chrome.permissions.contains({
        origins: ['*://x.com/*', '*://twitter.com/*']
      }, (result) => {
        callback(result);
      });
    } else {
      // 권한 API를 사용할 수 없는 경우 true로 처리 (manifest에 이미 권한이 선언된 경우)
      callback(true);
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    // Handle extension update recovery first
    handleExtensionUpdate();
    
    // 공통 UI 초기화 (테마, 클릭 간격, 디버그 로그 등 모든 도메인에서 설정 가능)
    setupRefreshInterval();
    setupClickDelay();
    setupDarkModeToggle();
    setupDeveloperOptions();
    
    // 탭 모니터링 및 상태 확인 기능 초기화
    setupTabMonitoring();
    
    // GitHub 링크 이벤트 처리
    const githubLink = document.getElementById('github-link');
    if (githubLink) {
      githubLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://github.com/MinePacu/Auto-Refresh-Comment-In-X-Space' });
      });
    }
    
    // 현재 탭이 X(트위터) 도메인인지 확인
    checkIsOnXDomain((isOnXDomain, url) => {
      if (isOnXDomain) {
        // X(트위터) 도메인인 경우 마스터 버튼과 탭별 설정 초기화
        getCurrentTabId((tabId) => {
          if (tabId) {
            console.log('Popup initialized for X domain tab:', tabId);
            currentTabId = tabId; // 전역 변수에 탭 ID 설정
            setupMasterToggle();
            setupPeriodicStatusCheck(); // 주기적 상태 확인 시작
          } else {
            console.error('Failed to get current tab ID');
          }
        });
      } else {
        // X(트위터) 도메인이 아닌 경우 마스터 버튼 영역만 변경
        console.log('Not on X(Twitter) domain:', url);
        checkHostPermission((hasPermission) => {
          console.log('Has host permission:', hasPermission);
          showUnsupportedSiteUI();
          
          // 현재 탭 ID도 가져와서 일반 설정을 위해 사용
          getCurrentTabId((tabId) => {
            if (tabId) {
              currentTabId = tabId; // 설정 저장을 위해 탭 ID 설정
            }
          });
        });
      }
    });
  });
  
  // 탭 상태 변경 모니터링 (향상된 사용자 경험)
  function setupTabMonitoring() {
    // 탭이 활성화되거나 URL이 변경될 때 상태 업데이트
    if (chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(() => {
        // 새로운 탭으로 전환 시 상태 초기화
        setTimeout(() => {
          location.reload();
        }, 100);
      });
    }
    
    // 탭 URL 변경 감지
    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.url && tabId === currentTabId) {
          // 현재 탭의 URL이 변경된 경우 상태 새로고침
          setTimeout(() => {
            location.reload();
          }, 500);
        }
      });
    }
  }

  // 확장 프로그램 활성화 상태 주기적 확인
  function setupPeriodicStatusCheck() {
    if (currentTabId && statusUpdateInterval === null) {
      statusUpdateInterval = setInterval(() => {
        checkIsOnXDomain((isOnXDomain) => {
          if (isOnXDomain) {
            // X 도메인에서만 상태 업데이트
            sendMessageToContentScript('GET_STATUS', {}, (response) => {
              if (response && response.status === 'success') {
                updateStatusDisplay(response.data);
              }
            });
          }
        });
      }, 5000); // 5초마다 확인
    }
  }

  // 상태 표시 업데이트
  function updateStatusDisplay(statusData) {
    const statusText = document.getElementById('statusText');
    if (!statusText) return;
    
    if (statusData.isActive) {
      if (statusData.isOnSpaceTweet && statusData.isListeningToSpace) {
        statusText.textContent = `활성: 스페이스 청취 중 (${statusData.replyCount}개 답글)`;
        statusText.style.color = '#4CAF50';
      } else if (statusData.isOnSpaceTweet) {
        statusText.textContent = '활성: 스페이스 트윗 페이지';
        statusText.style.color = '#2196F3';
      } else {
        statusText.textContent = '활성: X 사이트에서 대기 중';
        statusText.style.color = '#ff9800';
      }
    } else {
      statusText.textContent = '비활성';
      statusText.style.color = '#888';
    }
  }

  // Extension update handling and recovery
  function handleExtensionUpdate() {
    // Check if we're in an update recovery scenario
    const updateRecoveryData = localStorage.getItem('xspace_popup_update_recovery');
    if (updateRecoveryData) {
      try {
        const recoveryInfo = JSON.parse(updateRecoveryData);
        const timeSinceUpdate = Date.now() - recoveryInfo.timestamp;
        
        // If update was recent (less than 2 minutes ago), show recovery message
        if (timeSinceUpdate < 120000) {
          showStatusMessage(`Extension recovered from update (v${recoveryInfo.version})`, 'success', 3000);
        }
        
        // Clean up recovery data
        localStorage.removeItem('xspace_popup_update_recovery');
      } catch (error) {
        console.error('Failed to process update recovery data:', error);
        localStorage.removeItem('xspace_popup_update_recovery');
      }
    }
  }

  // Enhanced content script communication with update recovery
  function sendMessageToContentScriptWithRecovery(type, payload, callback) {
    // First attempt normal communication
    sendMessageToContentScript(type, payload, (response) => {
      if (response && response.status === 'success') {
        callback(response);
        return;
      }
      
      // If failed, check if this might be due to extension update
      checkIsOnXDomain((isOnXDomain, url) => {
        if (!isOnXDomain) {
          callback({ status: 'error', message: 'Not on X domain' });
          return;
        }
        
        // Show update recovery message and attempt recovery
        showStatusMessage('Detecting extension update, attempting recovery...', 'info', 2000);
        
        // Wait a moment and try again
        setTimeout(() => {
          sendMessageToContentScript(type, payload, (secondResponse) => {
            if (secondResponse && secondResponse.status === 'success') {
              showStatusMessage('Extension recovered successfully!', 'success', 2000);
              callback(secondResponse);
            } else {
              // Still failing, might need manual recovery
              showStatusMessage('Extension may need recovery. Try refreshing the page.', 'warning', 5000);
              callback({ status: 'error', message: 'Communication failed after recovery attempt' });
            }
          });
        }, 1000);
      });
    });
  }

  // Listen for extension update events
  if (chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'extensionUpdated') {
        // Store update info for recovery
        const updateInfo = {
          previousVersion: request.previousVersion,
          currentVersion: request.currentVersion,
          timestamp: Date.now()
        };
        
        localStorage.setItem('xspace_popup_update_recovery', JSON.stringify(updateInfo));
        
        // Show update notification
        showStatusMessage(`Extension updated to v${request.currentVersion}`, 'success', 3000);
        
        // Refresh popup state
        setTimeout(() => {
          setupPeriodicStatusCheck();
        }, 1000);
        
        sendResponse({ received: true });
      }
    });
  }
  
  // Popup이 닫힐 때 정리 작업
  window.addEventListener('beforeunload', () => {
    if (statusUpdateInterval) {
      clearInterval(statusUpdateInterval);
      statusUpdateInterval = null;
    }
  });
  
  // Handle extension update on popup load
  handleExtensionUpdate();
})();
