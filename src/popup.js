'use strict';

import './popup.css';

(function() {
  // 전역 변수들
  let currentTabId = null;
  let statusUpdateInterval = null;

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
    MIN_CLICK_DELAY: 5,  // 최소 5ms
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
  }
  // Rate Limit 경고 메시지 표시
  function showRateLimitWarning(originalValue, adjustedValue, reason = '') {
    const reasonText = reason ? ` (${reason})` : ` (${X_RATE_LIMIT_CONFIG.RATE_LIMIT_INFO})`;
    const message = `새로고침 간격이 ${originalValue}초에서 ${adjustedValue}초로 조정되었습니다.${reasonText}`;
    console.warn(message);
    
    // 임시 메시지 표시 (선택적)
    const statusText = document.getElementById('statusText');
    if (statusText) {
      const originalText = statusText.textContent;
      statusText.textContent = `조정됨: ${adjustedValue}초`;
      statusText.style.color = '#ff9800';
      
      setTimeout(() => {
        statusText.textContent = originalText;
        statusText.style.color = '';
      }, 3000);
    }
  }

  // Content Script 조정 메시지 표시
  function showAdjustmentMessage(message) {
    console.info('Content Script adjustment:', message);
    
    const statusText = document.getElementById('statusText');
    if (statusText) {
      const originalText = statusText.textContent;
      statusText.textContent = '간격 조정됨';
      statusText.style.color = '#ff9800';
      
      setTimeout(() => {
        statusText.textContent = originalText;
        statusText.style.color = '';
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
  }
  // 클릭 간 대기시간 조정 메시지 표시
  function showClickDelayAdjustment(originalValue, adjustedValue, reason = '') {
    const reasonText = reason ? ` (${reason})` : '';
    const message = `클릭 간 대기시간이 ${originalValue}ms에서 ${adjustedValue}ms로 조정되었습니다.${reasonText}`;
    console.warn(message);
    
    const statusText = document.getElementById('statusText');
    if (statusText) {
      const originalText = statusText.textContent;
      statusText.textContent = `조정됨: ${adjustedValue}ms`;
      statusText.style.color = '#ff9800';
      
      setTimeout(() => {
        statusText.textContent = originalText;
        statusText.style.color = '';
      }, 3000);
    }
  }

  // 테마 적용 함수
  function applyTheme(theme) {
    const docElement = document.documentElement;
    if (theme === 'system') {
      docElement.removeAttribute('data-theme');
      // CSS media query (prefers-color-scheme) will handle this
    } else {
      docElement.setAttribute('data-theme', theme);
    }
  }

  // 다크 모드 설정
  function setupDarkModeToggle() {
    const themeSelector = document.getElementById('themeSelector');
    
    // 저장된 테마 불러오기 및 적용
    chrome.storage.sync.get(['theme'], result => {
      const currentTheme = result.theme || 'system'; // 기본값 'system'
      themeSelector.value = currentTheme;
      applyTheme(currentTheme);
    });

    themeSelector.addEventListener('change', () => {
      const selectedTheme = themeSelector.value;
      chrome.storage.sync.set({ theme: selectedTheme }, () => {
        applyTheme(selectedTheme);
      });
    });

    // 시스템 테마 변경 감지 (선택 사항: 사용자가 '시스템 설정'을 선택했을 때만 활성화)
    // 이 부분은 팝업이 열려있을 때만 동작하며, 팝업이 닫히면 리스너가 사라집니다.
    // 지속적인 시스템 테마 감지를 원한다면 background script에서의 처리가 필요할 수 있습니다.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (themeSelector.value === 'system') {
        applyTheme('system'); // Re-apply to trigger CSS media query evaluation
      }
    });
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
      getTabSetting('masterOn', false, (currentState) => {
        const newState = !currentState;
        
        setTabSetting('masterOn', newState);
        updateMasterButton(newState);
        // contentScript에 상태 변경 메시지 전송
        sendMessageToContentScript('TOGGLE_MASTER', { isOn: newState });
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
        if (response && response.status === 'success') {
          const data = response.data;
          let statusMessage = '';
          
          if (!data.isActive) {
            statusMessage = '비활성';
            loadingSpinner.style.display = 'none';
          } else if (!data.isOnXSite) {
            statusMessage = 'X(트위터) 접속 대기 중';
          } else if (!data.isOnSpaceTweet) {
            statusMessage = '스페이스 트윗 대기 중';
          } else if (!data.isListeningToSpace) {
            statusMessage = '스페이스 청취 대기 중';
          } else {
            statusMessage = `활성 중 (답글: ${data.replyCount}개)`;
          }
          
          statusText.textContent = `상태: ${statusMessage}`;
        } else {
          statusText.textContent = '상태: 알 수 없음';
          loadingSpinner.style.display = 'none';
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
    
    chrome.tabs.sendMessage(currentTabId, { type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Error sending message to content script:', chrome.runtime.lastError.message);
        if (callback) callback({ status: 'error', message: chrome.runtime.lastError.message });
      } else {
        if (callback) callback(response);
      }
    });
  }

  // 개발자 옵션 설정
  function setupDeveloperOptions() {
    const developerOptionsHeader = document.querySelector('.developer-options-header');
    const developerOptionsContent = document.getElementById('developerOptionsContent');
    const toggleIcon = document.getElementById('devOptionsToggleIcon');
    const debugLogToggle = document.getElementById('debugLogToggle');

    // 개발자 옵션 펼치기/접기
    developerOptionsHeader.addEventListener('click', () => {
      const isExpanded = developerOptionsContent.style.display !== 'none';
      
      if (isExpanded) {
        developerOptionsContent.style.display = 'none';
        toggleIcon.textContent = '▶';
      } else {
        developerOptionsContent.style.display = 'block';
        toggleIcon.textContent = '▼';
      }
    });

    // 디버그 로그 토글 상태 불러오기
    chrome.storage.sync.get(['debugLogEnabled'], result => {
      const isEnabled = result.debugLogEnabled || false;
      updateDebugLogButton(isEnabled);
    });

    // 디버그 로그 토글 이벤트
    debugLogToggle.addEventListener('click', () => {
      chrome.storage.sync.get(['debugLogEnabled'], result => {
        const currentState = result.debugLogEnabled || false;
        const newState = !currentState;
        
        chrome.storage.sync.set({ debugLogEnabled: newState }, () => {
          updateDebugLogButton(newState);
          
          // Content Script에 디버그 로그 상태 변경 메시지 전송
          sendMessageToContentScript('SET_DEBUG_LOG', { enabled: newState });
        });
      });
    });

    function updateDebugLogButton(isEnabled) {
      debugLogToggle.textContent = isEnabled ? 'ON' : 'OFF';
      debugLogToggle.className = isEnabled ? 'button' : 'button off';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // 현재 탭 ID를 먼저 가져온 후 초기화
    getCurrentTabId((tabId) => {
      if (tabId) {
        console.log('Popup initialized for tab:', tabId);
        setupMasterToggle();
        setupRefreshInterval();
        setupClickDelay();
        setupDarkModeToggle();
        setupDeveloperOptions();
      } else {
        console.error('Failed to get current tab ID');
      }
    });
  });
})();
