'use strict';

import './popup.css';

(function() {
  // We will make use of Storage API to get and store `count` value
  // More information on Storage API can we found at
  // https://developer.chrome.com/extensions/storage

  // To get storage access, we have to mention it in `permissions` property of manifest.json file
  // More information on Permissions can we found at
  // https://developer.chrome.com/extensions/declare_permissions
  /*const counterStorage = {
    get: cb => {
      chrome.storage.sync.get(['count'], result => {
        cb(result.count);
      });
    },
    set: (value, cb) => {
      chrome.storage.sync.set(
        {
          count: value,
        },
        () => {
          cb();
        }
      );
    },
  };

  function setupCounter(initialValue = 0) {
    document.getElementById('counter').innerHTML = initialValue;

    document.getElementById('incrementBtn').addEventListener('click', () => {
      updateCounter({
        type: 'INCREMENT',
      });
    });

    document.getElementById('decrementBtn').addEventListener('click', () => {
      updateCounter({
        type: 'DECREMENT',
      });
    });
  }

  function updateCounter({ type }) {
    counterStorage.get(count => {
      let newCount;

      if (type === 'INCREMENT') {
        newCount = count + 1;
      } else if (type === 'DECREMENT') {
        newCount = count - 1;
      } else {
        newCount = count;
      }

      counterStorage.set(newCount, () => {
        document.getElementById('counter').innerHTML = newCount;

        // Communicate with content script of
        // active tab by sending a message
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          const tab = tabs[0];

          chrome.tabs.sendMessage(
            tab.id,
            {
              type: 'COUNT',
              payload: {
                count: newCount,
              },
            },
            response => {
              console.log('Current count value passed to contentScript file');
            }
          );
        });
      });
    });
  }

  function restoreCounter() {
    // Restore count value
    counterStorage.get(count => {
      if (typeof count === 'undefined') {
        // Set counter value as 0
        counterStorage.set(0, () => {
          setupCounter(0);
        });
      } else {
        setupCounter(count);
      }
    });
  }
  */
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
    const btn = document.getElementById('masterToggleBtn');
    // 저장된 상태 불러오기
    chrome.storage.sync.get(['masterOn'], result => {
      const isOn = result.masterOn === true; // 기본값 false (OFF)
      updateMasterBtn(isOn);
    });

    btn.addEventListener('click', () => {
      const isOn = btn.classList.toggle('off') ? false : true;
      updateMasterBtn(isOn);
      chrome.storage.sync.set({ masterOn: isOn }, () => {
        // contentScript에 마스터 상태 전달
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]?.id) {
            // background.js를 통해 contentScript.js에 메시지 전달
            chrome.runtime.sendMessage({
              type: 'MASTER_TOGGLE_BG',
              payload: {
                tabId: tabs[0].id,
                isOn: isOn,
              },
            });
          }
        });
      });
    });

    function updateMasterBtn(isOn) {
      btn.textContent = isOn ? 'ON' : 'OFF';
      btn.classList.toggle('off', !isOn);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    //restoreCounter();
    setupMasterToggle();
    setupRefreshInterval();
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
