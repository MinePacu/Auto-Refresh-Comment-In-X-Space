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
      }
    });
  }

  function getTabSetting(key, defaultValue, callback) {
    if (!currentTabId) {
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
  // https://developer.chrome.com/extensions/declare_permissions
  
  // 새로고침 주기 저장 및 복원
  function setupRefreshInterval() {
    const input = document.getElementById('refreshInterval');
    const applyBtn = document.getElementById('applyRefreshIntervalBtn');

    // 저장된 값 불러오기
    chrome.storage.sync.get(['refreshInterval'], result => {
      if (typeof result.refreshInterval === 'number') {
        input.value = result.refreshInterval;
      }
    });

    // 값 변경 시 저장 (기존 로직 유지)
    input.addEventListener('change', () => {
      let value = parseInt(input.value, 10);
      if (isNaN(value) || value < 1) value = 1;
      if (value > 3600) value = 3600;
      input.value = value; // Ensure input reflects validated value
      chrome.storage.sync.set({ refreshInterval: value });
    });

    // "적용" 버튼 클릭 시 contentScript로 전송
    applyBtn.addEventListener('click', () => {
      let value = parseInt(input.value, 10);
      if (isNaN(value) || value < 1) value = 1;
      if (value > 3600) value = 3600;
      input.value = value; // Ensure input reflects validated value before sending

      // 먼저 storage에 저장
      chrome.storage.sync.set({ refreshInterval: value }, () => {
        // contentScript에 직접 메시지 전달
        sendMessageToContentScript('SET_REFRESH_INTERVAL', { interval: value });
      });
    });
  }


  // 클릭 간 대기 시간 설정
  function setupClickDelay() {
    const input = document.getElementById('clickDelay');
    const applyBtn = document.getElementById('applyClickDelayBtn');

    // 저장된 값 불러오기
    chrome.storage.sync.get(['clickDelayMs'], result => {
      if (typeof result.clickDelayMs === 'number') {
        input.value = result.clickDelayMs;
      }
    });

    // 값 변경 시 즉시 저장 (input 이벤트 사용)
    input.addEventListener('input', () => {
      let value = parseInt(input.value, 10);
      if (isNaN(value) || value < 0) value = 0;
      if (value > 10000) value = 10000;
      // input.value = value; // 사용자가 입력 중일 때는 값을 강제로 바꾸지 않을 수 있음. 적용 시점에 최종 검증.
    });
    
    applyBtn.addEventListener('click', () => {
      let value = parseInt(input.value, 10);
      if (isNaN(value) || value < 0) value = 0;
      if (value > 10000) value = 10000;
      input.value = value; // 최종 검증된 값으로 input 업데이트

      chrome.storage.sync.set({ clickDelayMs: value }, () => {
        // contentScript에 직접 메시지 전달
        sendMessageToContentScript('SET_CLICK_DELAY', { delay: value });
      });
    });
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
            statusMessage = 'X 사이트가 아님';
          } else if (!data.isOnSpaceTweet) {
            statusMessage = '스페이스 트윗이 아님';
          } else if (!data.isListeningToSpace) {
            statusMessage = '스페이스 청취 중이 아님';
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
      console.warn('No current tab ID available');
      if (callback) callback({ status: 'error', message: 'No tab ID' });
      return;
    }
    
    chrome.tabs.sendMessage(currentTabId, { type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Error sending message to content script:', chrome.runtime.lastError);
        if (callback) callback({ status: 'error', message: chrome.runtime.lastError.message });
      } else {
        if (callback) callback(response);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // 현재 탭 ID를 먼저 가져온 후 초기화
    getCurrentTabId(() => {
      setupMasterToggle();
      setupRefreshInterval();
      setupClickDelay();
      setupDarkModeToggle();
    });
  });
})();
