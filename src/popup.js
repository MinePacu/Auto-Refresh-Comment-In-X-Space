'use strict';

import './popup.css';

(function() {
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

      // 먼저 storage에 저장 (input.eventListener('change')가 실행되지 않았을 수 있으므로)
      chrome.storage.sync.set({ refreshInterval: value }, () => {
        // background.js를 통해 contentScript.js에 메시지 전달
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]?.id) {
            chrome.runtime.sendMessage({
              type: 'SET_REFRESH_INTERVAL_BG',
              payload: {
                tabId: tabs[0].id,
                interval: value,
              },
            });
          }
        });
      });
    });
  }

  // 현재 탭의 URL 표시
  function showCurrentUrl() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      document.getElementById('currentUrl').textContent = tab?.url || '-';
    });
  }

  // 마스터 ON/OFF 버튼 상태 저장 및 UI 처리
  function setupMasterToggle() {
    const masterBtn = document.getElementById('masterToggleBtn');
    const statusTextElement = document.getElementById('statusText');
    const loadingSpinnerElement = document.getElementById('loadingSpinner');

    // Function to update all UI elements related to master state
    function updateMasterUI(isOn) {
      masterBtn.textContent = isOn ? 'ON' : 'OFF';
      masterBtn.classList.toggle('off', !isOn);

      if (isOn) {
        statusTextElement.textContent = 'Status: Active';
        loadingSpinnerElement.style.display = 'block';
      } else {
        statusTextElement.textContent = 'Status: Disabled';
        loadingSpinnerElement.style.display = 'none';
      }
    }

    // 저장된 상태 불러오기 및 초기 UI 설정
    chrome.storage.sync.get(['masterOn'], result => {
      const isOn = result.masterOn === true; // 기본값 false (OFF)
      updateMasterUI(isOn);
    });

    masterBtn.addEventListener('click', () => {
      // 현재 UI 상태(버튼의 'off' 클래스 유무)를 기반으로 다음 상태 결정
      const currentIsOn = !masterBtn.classList.contains('off');
      const newIsOn = !currentIsOn;

      updateMasterUI(newIsOn); // UI 즉시 업데이트

      chrome.storage.sync.set({ masterOn: newIsOn }, () => {
        // contentScript에 마스터 상태 전달
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]?.id) {
            chrome.runtime.sendMessage({
              type: 'MASTER_TOGGLE_BG',
              payload: {
                tabId: tabs[0].id,
                isOn: newIsOn,
              },
            });
          }
        });
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
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]?.id) {
            chrome.runtime.sendMessage({
              type: 'SET_CLICK_DELAY_BG',
              payload: {
                tabId: tabs[0].id,
                delay: value,
              },
            });
          }
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    //restoreCounter();
    setupMasterToggle();
    setupRefreshInterval();
    setupClickDelay(); // 새 함수 호출 추가
    showCurrentUrl();
  });

  // Communicate with background file by sending a message
  chrome.runtime.sendMessage(
    {
      type: 'GREETINGS',
      payload: {
        message: 'Hello, my name is Pop. I am from Popup.',
      },
    },
    response => {
      console.log(response.message);
    }
  );
})();
